import fs from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createApp } from "./index";

interface SocketHarness {
  socket: WebSocket;
  messages: Record<string, unknown>[];
  nextMessage(
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>>;
}

describe("tab socket", () => {
  let projectDir: string;
  let homeDir: string;
  let server: Server;
  let baseUrl: string;
  const harnesses: SocketHarness[] = [];

  beforeEach(async () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "roughdraft-socket-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "roughdraft-home-"));

    const { app, handleUpgrades } = createApp({
      homeDir,
      staticDirPath: projectDir,
    });
    server = createHttpServer(app);
    handleUpgrades(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const harness of harnesses) {
      harness.socket.close();
    }
    harnesses.length = 0;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  async function connect(): Promise<SocketHarness> {
    const socket = new WebSocket(
      `${baseUrl.replace("http:", "ws:")}/api/socket`,
    );
    const messages: Record<string, unknown>[] = [];
    const pendingWaiters: Array<{
      predicate: (message: Record<string, unknown>) => boolean;
      resolve: (message: Record<string, unknown>) => void;
    }> = [];

    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as Record<string, unknown>;
      const waiterIndex = pendingWaiters.findIndex(({ predicate }) =>
        predicate(message),
      );
      if (waiterIndex >= 0) {
        const [waiter] = pendingWaiters.splice(waiterIndex, 1);
        waiter.resolve(message);
        return;
      }
      messages.push(message);
    });

    const harness: SocketHarness = {
      socket,
      messages,
      nextMessage(predicate, timeoutMs = 5_000) {
        const buffered = messages.findIndex(predicate);
        if (buffered >= 0) {
          const [message] = messages.splice(buffered, 1);
          return Promise.resolve(message);
        }

        return new Promise((resolve, reject) => {
          const waiter = { predicate, resolve };
          pendingWaiters.push(waiter);
          setTimeout(() => {
            const index = pendingWaiters.indexOf(waiter);
            if (index >= 0) {
              pendingWaiters.splice(index, 1);
              reject(new Error("Timed out waiting for socket message"));
            }
          }, timeoutMs).unref?.();
        });
      },
    };

    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    harnesses.push(harness);
    return harness;
  }

  function sendJson(harness: SocketHarness, payload: unknown): void {
    harness.socket.send(JSON.stringify(payload));
  }

  it("delivers open requests to a socket subscriber", async () => {
    const harness = await connect();
    const documentPath = path.join(projectDir, "draft.md");

    sendJson(harness, {
      type: "subscribe-open-requests",
      subscriptionId: "or-1",
      path: documentPath,
    });
    await harness.nextMessage(
      (message) => message.type === "open-requests-subscribed",
    );

    const response = await request(server)
      .post("/api/open-request")
      .send({ path: documentPath, url: `${baseUrl}/?path=draft.md` });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ delivered: true });

    const event = await harness.nextMessage(
      (message) => message.type === "open-request",
    );
    expect(event).toMatchObject({
      subscriptionId: "or-1",
      path: documentPath,
      url: `${baseUrl}/?path=draft.md`,
    });
  });

  it("stops delivering open requests after the socket closes", async () => {
    const harness = await connect();
    const documentPath = path.join(projectDir, "draft.md");

    sendJson(harness, {
      type: "subscribe-open-requests",
      subscriptionId: "or-1",
      path: documentPath,
    });
    await harness.nextMessage(
      (message) => message.type === "open-requests-subscribed",
    );

    await new Promise<void>((resolve) => {
      harness.socket.once("close", () => resolve());
      harness.socket.close();
    });

    const response = await request(server)
      .post("/api/open-request")
      .send({ path: documentPath, url: `${baseUrl}/?path=draft.md` });

    expect(response.body).toEqual({ delivered: false });
  });

  it("acknowledges a watch with the current file version", async () => {
    fs.writeFileSync(path.join(projectDir, "draft.md"), "# Draft\n");
    const harness = await connect();

    sendJson(harness, {
      type: "watch-file",
      watchId: "fw-1",
      projectPath: projectDir,
      path: "draft.md",
    });

    const ack = await harness.nextMessage(
      (message) => message.type === "file-watching",
    );
    expect(ack).toMatchObject({ watchId: "fw-1", path: "draft.md" });
    expect(ack.version).toEqual(expect.any(String));
  });

  it("routes file changes only to the matching watcher", async () => {
    fs.writeFileSync(path.join(projectDir, "one.md"), "# One\n");
    fs.writeFileSync(path.join(projectDir, "two.md"), "# Two\n");
    const watcherOne = await connect();
    const watcherTwo = await connect();

    sendJson(watcherOne, {
      type: "watch-file",
      watchId: "fw-one",
      projectPath: projectDir,
      path: "one.md",
    });
    sendJson(watcherTwo, {
      type: "watch-file",
      watchId: "fw-two",
      projectPath: projectDir,
      path: "two.md",
    });
    await watcherOne.nextMessage((message) => message.type === "file-watching");
    await watcherTwo.nextMessage((message) => message.type === "file-watching");

    fs.writeFileSync(path.join(projectDir, "one.md"), "# One updated\n");

    const change = await watcherOne.nextMessage(
      (message) => message.type === "file-change",
    );
    expect(change).toMatchObject({
      watchId: "fw-one",
      path: "one.md",
      exists: true,
    });
    expect(change.version).toEqual(expect.any(String));
    expect(
      watcherTwo.messages.filter((message) => message.type === "file-change"),
    ).toEqual([]);
  });

  it("stops sending changes after unwatch-file", async () => {
    const filePath = path.join(projectDir, "draft.md");
    fs.writeFileSync(filePath, "# Draft\n");
    const watcher = await connect();
    const control = await connect();

    sendJson(watcher, {
      type: "watch-file",
      watchId: "fw-1",
      projectPath: projectDir,
      path: "draft.md",
    });
    await watcher.nextMessage((message) => message.type === "file-watching");
    sendJson(watcher, { type: "unwatch-file", watchId: "fw-1" });

    // A second watcher acts as the "change actually fired" control so the
    // test does not rely on a fixed sleep.
    sendJson(control, {
      type: "watch-file",
      watchId: "fw-control",
      projectPath: projectDir,
      path: "draft.md",
    });
    await control.nextMessage((message) => message.type === "file-watching");

    fs.writeFileSync(filePath, "# Draft updated\n");
    await control.nextMessage((message) => message.type === "file-change");

    expect(
      watcher.messages.filter((message) => message.type === "file-change"),
    ).toEqual([]);
  });

  it("reports watch errors for paths outside the project", async () => {
    const harness = await connect();

    sendJson(harness, {
      type: "watch-file",
      watchId: "fw-1",
      projectPath: projectDir,
      path: "../escape.md",
    });

    const error = await harness.nextMessage(
      (message) => message.type === "watch-error",
    );
    expect(error).toMatchObject({
      watchId: "fw-1",
      error: "Markdown file not found",
    });
  });

  it("rejects non-JSON messages without dropping the socket", async () => {
    const harness = await connect();

    harness.socket.send("not json");
    const error = await harness.nextMessage(
      (message) => message.type === "error",
    );
    expect(error).toMatchObject({ error: "Messages must be JSON objects" });

    sendJson(harness, {
      type: "subscribe-open-requests",
      subscriptionId: "or-1",
      path: null,
    });
    await harness.nextMessage(
      (message) => message.type === "open-requests-subscribed",
    );
  });

  it("destroys upgrade attempts for other paths", async () => {
    const socket = new WebSocket(
      `${baseUrl.replace("http:", "ws:")}/api/other`,
    );
    await new Promise<void>((resolve) => {
      socket.once("error", () => resolve());
    });
    expect(socket.readyState).not.toBe(WebSocket.OPEN);
  });
});
