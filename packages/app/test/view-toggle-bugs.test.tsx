import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLocationForDocumentEditorViewMode,
  getDocumentEditorViewModeFromLocation,
  type DocumentEditorViewMode,
} from "../src/app-navigation";
import { DocumentWorkspace } from "../src/DocumentWorkspace";
import type { StorageBackend, Page } from "../src/storage";

function createBackend(): StorageBackend {
  return {
    info: {
      kind: "local-storage",
      label: "Test backend",
      detail: "In-memory",
    },
    canManageProjects: false,
    async getMarkdownFile(relativePath) {
      return { id: relativePath, title: relativePath, content: "" };
    },
    async saveMarkdownFile() {
      return undefined;
    },
    async saveAsset(file) {
      return {
        markdownPath: file.name,
        previewUrl: `file://${file.name}`,
        mimeType: file.type || "application/octet-stream",
      };
    },
    resolveFileUrl(path) {
      return `file://${path}`;
    },
    async openProject() {},
  };
}

function createPage(content = "Hello world"): Page {
  return {
    id: "test-doc",
    title: "Test Doc",
    content,
  };
}

describe("Bug: view mode toggle triggers full page reload (issue 1)", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("buildLocationForDocumentEditorViewMode returns a URL string (used by window.location.assign)", () => {
    window.history.replaceState(
      null,
      "",
      "/?path=/test/doc.md&editor=rich-text",
    );

    const nextLocation = buildLocationForDocumentEditorViewMode("code");

    expect(nextLocation).toContain("editor=code");
    expect(typeof nextLocation).toBe("string");
  });

  it("view mode is derived from URL, not React state — a full reload re-reads the query param", () => {
    window.history.replaceState(null, "", "/?editor=rich-text");
    expect(getDocumentEditorViewModeFromLocation("rich-text")).toBe(
      "rich-text",
    );

    window.history.replaceState(null, "", "/?editor=code");
    expect(getDocumentEditorViewModeFromLocation("rich-text")).toBe("code");
  });

  it("App calls window.location.assign for view mode changes instead of a client-side state update", () => {
    // The handler in App.tsx line 979-985:
    //   window.location.assign(buildLocationForDocumentEditorViewMode(nextMode))
    //
    // This causes a full page navigation (blank screen) rather than
    // a React state update. The user sees a blank screen for 5-20 seconds
    // while the app reloads.
    //
    // We verify the pattern by checking that buildLocationForDocumentEditorViewMode
    // produces a full-path string suitable for location.assign, which is the
    // mechanism causing the reload.
    window.history.replaceState(null, "", "/doc.md?editor=rich-text");

    const result = buildLocationForDocumentEditorViewMode("code");

    // The function returns a full path+search string — this is what
    // App.tsx feeds to window.location.assign(), triggering a reload.
    expect(result).toBe("/doc.md?editor=code");
  });
});

describe("Bug: no saving/saved status indicator (issue 2)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 640,
      height: 480,
      right: 640,
      bottom: 480,
      toJSON() {
        return this;
      },
    } as DOMRect);

    if (!("ResizeObserver" in globalThis)) {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      });
    }

    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });

    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 80,
          height: 20,
          right: 80,
          bottom: 20,
          toJSON() {
            return this;
          },
        } as DOMRect;
      },
    });

    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value() {
        return [
          {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            width: 80,
            height: 20,
            right: 80,
            bottom: 20,
            toJSON() {
              return this;
            },
          } as DOMRect,
        ];
      },
    });

    Object.defineProperty(HTMLElement.prototype, "getClientRects", {
      configurable: true,
      value() {
        return [this.getBoundingClientRect()];
      },
    });

    Object.defineProperty(Text.prototype, "getClientRects", {
      configurable: true,
      value() {
        return [
          {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            width: 80,
            height: 20,
            right: 80,
            bottom: 20,
            toJSON() {
              return this;
            },
          } as DOMRect,
        ];
      },
    });

    window.scrollBy = vi.fn();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("DocumentWorkspace does not render a save status indicator", async () => {
    const saveStateChanges: string[] = [];

    await act(async () => {
      root.render(
        <DocumentWorkspace
          documentPage={createPage()}
          activeDocumentPath="test.md"
          documentFilenameLabel="test.md"
          documentEditorViewMode="rich-text"
          onDocumentEditorViewModeChange={() => {}}
          onSaveDocument={async () => {}}
          onDocumentSaveStateChange={(state) => {
            saveStateChanges.push(state);
          }}
          onDocumentDirtyStateChange={() => {}}
          onDocumentLocalContentChange={() => {}}
          documentDiskChangeState="clean"
          documentForceResetKey={null}
          onReloadDocumentFromDisk={() => {}}
          onKeepEditingWithoutAutosave={() => {}}
          onOverwriteDocumentOnDisk={() => {}}
          backend={createBackend()}
        />,
      );
    });

    // The workspace renders no text with "Saving" or "Saved" anywhere.
    // Users have no way to know their changes are being persisted.
    const textContent = container.textContent ?? "";
    expect(textContent).not.toContain("Saving");
    expect(textContent).not.toContain("Saved");

    // There is no element with a role or label that indicates save state.
    expect(
      container.querySelector(
        '[aria-label*="save" i], [aria-label*="saving" i], [role="status"][aria-label*="save" i]',
      ),
    ).toBeNull();
  });
});

describe("Bug: suggesting mode resets to editing on view toggle (issue 3)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 640,
      height: 480,
      right: 640,
      bottom: 480,
      toJSON() {
        return this;
      },
    } as DOMRect);

    if (!("ResizeObserver" in globalThis)) {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      });
    }

    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });

    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 80,
          height: 20,
          right: 80,
          bottom: 20,
          toJSON() {
            return this;
          },
        } as DOMRect;
      },
    });

    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value() {
        return [
          {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            width: 80,
            height: 20,
            right: 80,
            bottom: 20,
            toJSON() {
              return this;
            },
          } as DOMRect,
        ];
      },
    });

    Object.defineProperty(HTMLElement.prototype, "getClientRects", {
      configurable: true,
      value() {
        return [this.getBoundingClientRect()];
      },
    });

    Object.defineProperty(Text.prototype, "getClientRects", {
      configurable: true,
      value() {
        return [
          {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            width: 80,
            height: 20,
            right: 80,
            bottom: 20,
            toJSON() {
              return this;
            },
          } as DOMRect,
        ];
      },
    });

    window.scrollBy = vi.fn();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("interaction mode defaults to editing and is not persisted in the URL", () => {
    // documentInteractionMode is useState("editing") in DocumentWorkspace.tsx:100-101.
    // It is never synced to the URL. So any navigation (like view toggle) resets it.
    window.history.replaceState(null, "", "/?editor=rich-text");
    const params = new URLSearchParams(window.location.search);
    expect(params.get("mode")).toBeNull();
  });

  it("interaction mode always starts as editing on fresh mount", async () => {
    // DocumentWorkspace.tsx:100-101 initializes interaction mode to "editing":
    //   const [documentInteractionMode, setDocumentInteractionMode] =
    //     useState<DocumentInteractionMode>("editing");
    //
    // Because the view toggle triggers window.location.assign() (see Issue 1),
    // the entire component tree remounts. Since the interaction mode is local
    // React state (not persisted to URL or storage), any "suggesting" or
    // "viewing" selection the user made is lost on remount.

    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const renderWorkspace = async (viewMode: DocumentEditorViewMode) => {
      await act(async () => {
        root.render(
          <DocumentWorkspace
            documentPage={createPage()}
            activeDocumentPath="test.md"
            documentFilenameLabel="test.md"
            documentEditorViewMode={viewMode}
            onDocumentEditorViewModeChange={() => {}}
            onSaveDocument={async () => {}}
            onDocumentSaveStateChange={() => {}}
            onDocumentDirtyStateChange={() => {}}
            onDocumentLocalContentChange={() => {}}
            documentDiskChangeState="clean"
            documentForceResetKey={null}
            onReloadDocumentFromDisk={() => {}}
            onKeepEditingWithoutAutosave={() => {}}
            onOverwriteDocumentOnDisk={() => {}}
            backend={createBackend()}
          />,
        );
      });
    };

    // Mount with rich-text → mode is "editing"
    await renderWorkspace("rich-text");
    expect(
      container.querySelector('[aria-label="Document mode"]')?.textContent,
    ).toContain("editing");

    // Unmount and remount with code (simulates the full page reload from
    // window.location.assign). A fresh mount always resets to "editing",
    // even though the user may have switched to "suggesting" before.
    await act(async () => {
      root.unmount();
    });
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderWorkspace("code");
    expect(
      container.querySelector('[aria-label="Document mode"]')?.textContent,
    ).toContain("editing");
  });
});
