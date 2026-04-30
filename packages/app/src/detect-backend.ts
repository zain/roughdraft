import type { StorageBackend } from "./storage";
import { ApiBackend } from "./api-backend";
import { LocalStorageBackend } from "./local-storage-backend";
import { RemoteBackend } from "./remote-backend";

export async function detectBackend(): Promise<StorageBackend> {
  if (import.meta.env.VITE_PREVIEW_WEB === "1") {
    return new LocalStorageBackend();
  }

  const sessionId = readSessionIdFromUrl();
  const token = readTokenFromUrl();

  try {
    const res = await fetch("/api/status");
    if (res.ok) {
      const payload = (await res.json()) as {
        backend?: string;
        projectDir?: string;
        stateless?: boolean;
        capabilities?: { remoteDocuments?: boolean };
      };

      if (sessionId && payload.capabilities?.remoteDocuments) {
        try {
          return await RemoteBackend.create(sessionId, token);
        } catch (error) {
          console.error("Could not initialize remote backend:", error);
        }
      }

      if (payload.backend === "local-files") {
        return new ApiBackend({
          kind: "local-files",
          label: "Local files",
          detail: payload.stateless
            ? "Open a markdown file"
            : "Markdown file on disk",
          projectPath: payload.projectDir,
        });
      }
    }
  } catch {
    // network error — no server available
  }
  return new LocalStorageBackend();
}

function readSessionIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const session = params.get("session")?.trim();
  return session && session.length > 0 ? session : null;
}

function readTokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("token")?.trim() ?? "";
}
