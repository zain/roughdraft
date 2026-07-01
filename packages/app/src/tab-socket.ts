import type { MarkdownFileChangeEvent } from "./storage";

// One shared WebSocket per tab carries both the open-request listener and all
// markdown-file watches. The previous EventSource streams counted against
// Chromium's 6-connections-per-host HTTP/1.1 cap, so three Roughdraft tabs
// starved the origin and new page loads hung; WebSockets are exempt.
const TAB_SOCKET_PATH = "/api/socket";
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 10_000;

export interface OpenRequestEvent {
  path: string;
  url: string;
}

interface OpenRequestSubscription {
  path: string | null;
  handler: (event: OpenRequestEvent) => void;
}

interface FileWatchSubscription {
  projectPath: string;
  path: string;
  handler: (event: MarkdownFileChangeEvent) => void;
  lastVersion: string | null | undefined;
}

interface ServerMessage {
  type?: unknown;
  subscriptionId?: unknown;
  watchId?: unknown;
  path?: unknown;
  url?: unknown;
  exists?: unknown;
  version?: unknown;
  error?: unknown;
}

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let nextSubscriptionId = 1;

const openRequestSubscriptions = new Map<string, OpenRequestSubscription>();
const fileWatchSubscriptions = new Map<string, FileWatchSubscription>();

function subscriptionCount(): number {
  return openRequestSubscriptions.size + fileWatchSubscriptions.size;
}

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${TAB_SOCKET_PATH}`;
}

function send(payload: Record<string, unknown>): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function sendOpenRequestSubscription(
  subscriptionId: string,
  subscription: OpenRequestSubscription,
): void {
  send({
    type: "subscribe-open-requests",
    subscriptionId,
    path: subscription.path,
  });
}

function sendFileWatchSubscription(
  watchId: string,
  subscription: FileWatchSubscription,
): void {
  send({
    type: "watch-file",
    watchId,
    projectPath: subscription.projectPath,
    path: subscription.path,
  });
}

function handleServerMessage(raw: MessageEvent<string>): void {
  let message: ServerMessage;
  try {
    message = JSON.parse(raw.data) as ServerMessage;
  } catch (error) {
    console.error("Failed to parse Roughdraft socket message:", error);
    return;
  }

  switch (message.type) {
    case "open-request": {
      const subscription =
        typeof message.subscriptionId === "string"
          ? openRequestSubscriptions.get(message.subscriptionId)
          : undefined;
      if (!subscription || typeof message.url !== "string") return;
      subscription.handler({
        path: typeof message.path === "string" ? message.path : "",
        url: message.url,
      });
      return;
    }

    case "file-change": {
      const subscription =
        typeof message.watchId === "string"
          ? fileWatchSubscriptions.get(message.watchId)
          : undefined;
      if (!subscription) return;
      const event: MarkdownFileChangeEvent = {
        path: typeof message.path === "string" ? message.path : "",
        exists: message.exists === true,
        version: typeof message.version === "string" ? message.version : null,
      };
      subscription.lastVersion = event.version;
      subscription.handler(event);
      return;
    }

    case "file-watching": {
      // Sent when a watch (re)starts. If the file changed while the socket
      // was down, surface the missed change so the tab reconciles.
      const subscription =
        typeof message.watchId === "string"
          ? fileWatchSubscriptions.get(message.watchId)
          : undefined;
      if (!subscription) return;
      const version =
        typeof message.version === "string" ? message.version : null;
      if (
        subscription.lastVersion !== undefined &&
        subscription.lastVersion !== version
      ) {
        subscription.handler({
          path: subscription.path,
          exists: true,
          version,
        });
      }
      subscription.lastVersion = version;
      return;
    }

    case "watch-error": {
      console.error("Roughdraft file watch failed:", message.error);
      return;
    }

    case "error": {
      console.error("Roughdraft socket error:", message.error);
      return;
    }

    default:
      return;
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null || subscriptionCount() === 0) return;

  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts,
    RECONNECT_MAX_DELAY_MS,
  );
  reconnectAttempts += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    ensureSocket();
  }, delay);
}

function ensureSocket(): void {
  if (subscriptionCount() === 0) return;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const nextSocket = new WebSocket(socketUrl());
  socket = nextSocket;

  nextSocket.onopen = () => {
    if (socket !== nextSocket) return;
    reconnectAttempts = 0;
    for (const [id, subscription] of openRequestSubscriptions) {
      sendOpenRequestSubscription(id, subscription);
    }
    for (const [id, subscription] of fileWatchSubscriptions) {
      sendFileWatchSubscription(id, subscription);
    }
  };

  nextSocket.onmessage = handleServerMessage;

  nextSocket.onclose = () => {
    if (socket !== nextSocket) return;
    socket = null;
    scheduleReconnect();
  };

  nextSocket.onerror = () => {
    // onclose follows and owns reconnection.
  };
}

function closeSocketIfIdle(): void {
  if (subscriptionCount() > 0) return;

  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;

  const current = socket;
  socket = null;
  current?.close();
}

export function subscribeOpenRequests(
  path: string | null,
  handler: (event: OpenRequestEvent) => void,
): () => void {
  const subscriptionId = `or-${nextSubscriptionId}`;
  nextSubscriptionId += 1;

  const subscription: OpenRequestSubscription = { path, handler };
  openRequestSubscriptions.set(subscriptionId, subscription);
  ensureSocket();
  sendOpenRequestSubscription(subscriptionId, subscription);

  return () => {
    if (openRequestSubscriptions.delete(subscriptionId)) {
      send({ type: "unsubscribe-open-requests", subscriptionId });
      closeSocketIfIdle();
    }
  };
}

export function watchServerFile(
  projectPath: string,
  path: string,
  handler: (event: MarkdownFileChangeEvent) => void,
): () => void {
  const watchId = `fw-${nextSubscriptionId}`;
  nextSubscriptionId += 1;

  const subscription: FileWatchSubscription = {
    projectPath,
    path,
    handler,
    lastVersion: undefined,
  };
  fileWatchSubscriptions.set(watchId, subscription);
  ensureSocket();
  sendFileWatchSubscription(watchId, subscription);

  return () => {
    if (fileWatchSubscriptions.delete(watchId)) {
      send({ type: "unwatch-file", watchId });
      closeSocketIfIdle();
    }
  };
}
