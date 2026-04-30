import {
  MarkdownFileConflictError,
  type BackendInfo,
  type MarkdownFileChangeEvent,
  type Page,
  type StorageBackend,
  type StoredAsset,
} from "./storage";

interface RemoteDocumentPayload {
  id: string;
  originPath: string;
  content: string;
  version: string;
}

export type RemoteSessionStatus = "connected" | "disconnected";

export class RemoteBackend implements StorageBackend {
  info: BackendInfo;
  canManageProjects = false;
  sessionStatus: RemoteSessionStatus = "disconnected";

  private bootstrap: RemoteDocumentPayload;
  private statusListeners = new Set<(status: RemoteSessionStatus) => void>();

  constructor(info: BackendInfo, bootstrap: RemoteDocumentPayload) {
    this.info = info;
    this.bootstrap = bootstrap;
  }

  static async create(sessionId: string): Promise<RemoteBackend> {
    const response = await fetch(
      `/api/remote-document/${encodeURIComponent(sessionId)}`,
    );
    if (!response.ok) {
      throw new Error(
        `Could not load remote document session ${sessionId}: ${response.status}`,
      );
    }
    const bootstrap = (await response.json()) as RemoteDocumentPayload;
    const filename = bootstrap.originPath.split(/[\\/]/).pop() ?? "remote.md";
    return new RemoteBackend(
      {
        kind: "remote",
        label: "Remote document",
        detail: filename,
        sessionId,
        originPath: bootstrap.originPath,
      },
      bootstrap,
    );
  }

  documentPath(): string {
    return this.bootstrap.originPath.split(/[\\/]/).pop() ?? "remote.md";
  }

  onSessionStatusChange(
    listener: (status: RemoteSessionStatus) => void,
  ): () => void {
    this.statusListeners.add(listener);
    listener(this.sessionStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setSessionStatus(next: RemoteSessionStatus): void {
    if (this.sessionStatus === next) return;
    this.sessionStatus = next;
    for (const listener of this.statusListeners) {
      listener(next);
    }
  }

  private pageFromBootstrap(): Page {
    return {
      id: this.bootstrap.id,
      title: titleFromContent(this.bootstrap.content, this.documentPath()),
      content: this.bootstrap.content,
      version: this.bootstrap.version,
    };
  }

  async getMarkdownFile(_relativePath: string): Promise<Page> {
    const sessionId = this.info.sessionId;
    if (!sessionId) {
      throw new Error("Remote backend missing session id");
    }
    const response = await fetch(
      `/api/remote-document/${encodeURIComponent(sessionId)}`,
    );
    if (!response.ok) {
      throw new Error(
        `Failed to load remote document: HTTP ${response.status}`,
      );
    }
    const payload = (await response.json()) as RemoteDocumentPayload;
    this.bootstrap = payload;
    return this.pageFromBootstrap();
  }

  async saveMarkdownFile(
    _relativePath: string,
    content: string,
    expectedVersion?: string,
  ): Promise<Page> {
    const sessionId = this.info.sessionId;
    if (!sessionId) {
      throw new Error("Remote backend missing session id");
    }
    const response = await fetch(
      `/api/remote-document/${encodeURIComponent(sessionId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, expectedVersion }),
      },
    );

    if (response.status === 409) {
      const payload = (await response.json()) as {
        current?: RemoteDocumentPayload;
      };
      if (payload.current) {
        this.bootstrap = payload.current;
        throw new MarkdownFileConflictError(this.pageFromBootstrap());
      }
    }

    if (!response.ok) {
      throw new Error(
        `Failed to save remote document: HTTP ${response.status}`,
      );
    }

    const updated = (await response.json()) as { id: string; version: string };
    this.bootstrap = {
      ...this.bootstrap,
      content,
      version: updated.version,
    };
    return this.pageFromBootstrap();
  }

  watchMarkdownFile(
    _relativePath: string,
    onChange: (event: MarkdownFileChangeEvent) => void,
  ): () => void {
    const sessionId = this.info.sessionId;
    if (!sessionId) return () => {};

    const source = new EventSource(
      `/api/remote-document/${encodeURIComponent(sessionId)}/events`,
    );

    source.addEventListener("connected", () => {
      this.setSessionStatus("connected");
    });

    source.addEventListener("save", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          content?: string;
          version?: string;
        };
        if (
          typeof payload.content === "string" &&
          typeof payload.version === "string"
        ) {
          this.bootstrap = {
            ...this.bootstrap,
            content: payload.content,
            version: payload.version,
          };
          onChange({
            path: this.bootstrap.originPath,
            exists: true,
            version: payload.version,
          });
        }
      } catch (error) {
        console.error("Failed to read remote save event:", error);
      }
    });

    source.onerror = () => {
      // EventSource auto-reconnects on transient errors; only flag the session
      // as disconnected once the browser has given up and closed the stream.
      if (source.readyState === EventSource.CLOSED) {
        this.setSessionStatus("disconnected");
      }
    };

    return () => {
      source.close();
      this.setSessionStatus("disconnected");
    };
  }

  async saveAsset(_file: File): Promise<StoredAsset> {
    throw new Error(
      "Remote document sessions do not support asset uploads in this version.",
    );
  }

  resolveFileUrl(_path: string): string | null {
    return null;
  }

  async openProject(_path: string): Promise<void> {
    // Remote sessions are bound to a single document; openProject is a no-op.
  }
}

function titleFromContent(content: string, fallback: string): string {
  const firstLine = content.split("\n")[0] ?? "";
  const trimmed = firstLine.replace(/^#*\s*/, "").trim();
  return trimmed || fallback;
}
