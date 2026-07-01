import type { Server as HttpServer } from "node:http";
import { type RawData, WebSocket, WebSocketServer } from "ws";

// One WebSocket per browser tab replaces the two SSE streams (open-requests +
// markdown-file events). SSE connections count against Chromium's 6-per-host
// HTTP/1.1 connection cap, so three open tabs used to wedge every further
// request to the server; WebSockets are exempt from that cap.
export const TAB_SOCKET_PATH = "/api/socket";

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface TabSocketOpenRequestEvent {
  path: string;
  url: string;
}

export interface TabSocketFileChangeEvent {
  path: string;
  exists: boolean;
  version: string | null;
}

export interface TabSocketDeps {
  registerOpenRequestClient(
    path: string | null,
    send: (event: TabSocketOpenRequestEvent) => void,
  ): () => void;
  resolveMarkdownFile(
    projectPath: string,
    relativePath: string,
  ): { absolutePath: string; version: string } | { error: string };
  watchMarkdownFile(
    absolutePath: string,
    relativePath: string,
    emit: (event: TabSocketFileChangeEvent) => void,
  ): () => void;
}

export interface TabSocketServer {
  handleUpgrades(server: HttpServer): void;
  close(): void;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createTabSocketServer(deps: TabSocketDeps): TabSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket: WebSocket) => {
    const openRequestSubscriptions = new Map<string, () => void>();
    const fileWatches = new Map<string, () => void>();

    const send = (payload: unknown) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    };

    const handleMessage = (raw: RawData) => {
      let message: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(String(raw));
        if (!parsed || typeof parsed !== "object") {
          throw new Error("not an object");
        }
        message = parsed as Record<string, unknown>;
      } catch {
        send({ type: "error", error: "Messages must be JSON objects" });
        return;
      }

      switch (message.type) {
        case "subscribe-open-requests": {
          const subscriptionId = stringField(message.subscriptionId);
          if (!subscriptionId) {
            send({
              type: "error",
              error: "subscribe-open-requests requires a subscriptionId",
            });
            return;
          }

          const path = stringField(message.path);
          openRequestSubscriptions.get(subscriptionId)?.();
          openRequestSubscriptions.set(
            subscriptionId,
            deps.registerOpenRequestClient(path, (event) => {
              send({ type: "open-request", subscriptionId, ...event });
            }),
          );
          send({ type: "open-requests-subscribed", subscriptionId, path });
          return;
        }

        case "unsubscribe-open-requests": {
          const subscriptionId = stringField(message.subscriptionId);
          if (!subscriptionId) return;
          openRequestSubscriptions.get(subscriptionId)?.();
          openRequestSubscriptions.delete(subscriptionId);
          return;
        }

        case "watch-file": {
          const watchId = stringField(message.watchId);
          if (!watchId) {
            send({ type: "error", error: "watch-file requires a watchId" });
            return;
          }

          const projectPath = stringField(message.projectPath) ?? "";
          const relativePath = stringField(message.path) ?? "";
          const resolved = deps.resolveMarkdownFile(projectPath, relativePath);
          if ("error" in resolved) {
            send({ type: "watch-error", watchId, error: resolved.error });
            return;
          }

          fileWatches.get(watchId)?.();
          fileWatches.set(
            watchId,
            deps.watchMarkdownFile(
              resolved.absolutePath,
              relativePath,
              (event) => {
                send({ type: "file-change", watchId, ...event });
              },
            ),
          );
          send({
            type: "file-watching",
            watchId,
            path: relativePath,
            version: resolved.version,
          });
          return;
        }

        case "unwatch-file": {
          const watchId = stringField(message.watchId);
          if (!watchId) return;
          fileWatches.get(watchId)?.();
          fileWatches.delete(watchId);
          return;
        }

        default:
          send({
            type: "error",
            error: `Unknown message type: ${String(message.type)}`,
          });
      }
    };

    socket.on("message", handleMessage);

    let alive = true;
    socket.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();

    socket.on("close", () => {
      clearInterval(heartbeat);
      for (const unsubscribe of openRequestSubscriptions.values()) {
        unsubscribe();
      }
      openRequestSubscriptions.clear();
      for (const dispose of fileWatches.values()) {
        dispose();
      }
      fileWatches.clear();
    });
  });

  const handleUpgrades = (server: HttpServer) => {
    server.on("upgrade", (request, socket, head) => {
      let pathname: string;
      try {
        pathname = new URL(request.url ?? "", "http://localhost").pathname;
      } catch {
        socket.destroy();
        return;
      }

      if (pathname !== TAB_SOCKET_PATH) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (webSocket) => {
        wss.emit("connection", webSocket, request);
      });
    });
  };

  return {
    handleUpgrades,
    close: () => {
      wss.close();
    },
  };
}
