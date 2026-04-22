import { useEffect, useState, useCallback, useRef } from "react";
import type { StorageBackend, Page, ProjectLayout } from "./storage";
import { detectBackend } from "./detect-backend";
import { Canvas } from "./Canvas";
import { PageCard } from "./PageCard";
import { PathSwitcher } from "./PathSwitcher";

interface RequestedPathState {
  rawPath: string | null;
  projectPath: string | null;
  pageId: string | null;
}

function normalizePathSeparators(value: string) {
  return value.replace(/\\/g, "/");
}

function getRawPathFromLocation(): string | null {
  const searchParams = new URLSearchParams(window.location.search);
  const queryPath = searchParams.get("path")?.trim();
  if (queryPath) return queryPath;

  const normalizedPathname = normalizePathSeparators(window.location.pathname);
  if (normalizedPathname !== "/" && !normalizedPathname.startsWith("/api")) {
    const decodedPathname = decodeURIComponent(normalizedPathname);
    return decodedPathname.startsWith("/") ? decodedPathname : `/${decodedPathname}`;
  }

  return null;
}

function getRequestedPathState(): RequestedPathState {
  const rawPath = getRawPathFromLocation();
  if (!rawPath) {
    return { rawPath: null, projectPath: null, pageId: null };
  }

  const normalizedPath = normalizePathSeparators(rawPath);
  if (!normalizedPath.toLowerCase().endsWith(".md")) {
    return { rawPath, projectPath: rawPath, pageId: null };
  }

  const lastSlashIndex = Math.max(normalizedPath.lastIndexOf("/"), normalizedPath.lastIndexOf("\\"));
  const projectPath = lastSlashIndex >= 0 ? rawPath.slice(0, lastSlashIndex) || "/" : ".";
  const filename = rawPath.slice(lastSlashIndex + 1);
  const pageId = filename.replace(/\.md$/i, "");

  return { rawPath, projectPath, pageId };
}

function getWorkspacePath(path?: string) {
  return path?.trim() || null;
}

function getWorkspaceName(path?: string) {
  const workspacePath = getWorkspacePath(path);
  if (!workspacePath) return "Browser drafts";

  const segments = workspacePath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || workspacePath;
}

function buildLocationForPath(path?: string | null) {
  const nextPath = path?.trim() || null;
  const url = new URL(window.location.href);

  if (nextPath) {
    if (!nextPath.includes("\\")) {
      url.pathname = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
      url.searchParams.delete("path");
    } else {
      url.pathname = "/";
      url.searchParams.set("path", nextPath);
    }
  } else {
    url.searchParams.delete("path");
    url.pathname = "/";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function syncProjectPathInUrl(projectPath?: string) {
  const nextLocation = buildLocationForPath(getWorkspacePath(projectPath));
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextLocation !== currentLocation) {
    window.history.replaceState(null, "", nextLocation);
  }
}

function syncRequestedPathInUrl(path?: string | null) {
  const nextLocation = buildLocationForPath(path);
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextLocation !== currentLocation) {
    window.history.replaceState(null, "", nextLocation);
  }
}

export function App() {
  const [backend, setBackend] = useState<StorageBackend | null>(null);
  const [allPages, setAllPages] = useState<Page[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [layout, setLayout] = useState<ProjectLayout>({ pages: {} });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestedPathState, setRequestedPathState] = useState<RequestedPathState>(
    getRequestedPathState()
  );
  const backendRef = useRef<StorageBackend | null>(null);
  const layoutRef = useRef<ProjectLayout>({ pages: {} });
  const saveLayoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  backendRef.current = backend;
  layoutRef.current = layout;

  const loadProject = useCallback(async (
    nextBackend: StorageBackend,
    focusedPageId?: string | null
  ) => {
    if (saveLayoutTimer.current) {
      clearTimeout(saveLayoutTimer.current);
      saveLayoutTimer.current = null;
    }

    const [pageList, project] = await Promise.all([
      nextBackend.listPages(),
      nextBackend.getProject(),
    ]);

    let pg: Page[];
    let proj = project;

    if (pageList.length === 0) {
      const page = await nextBackend.createPage(
        "Untitled",
        "# Welcome to Roughdraft\n\nStart writing. Your work is saved automatically.\n"
      );
      pg = [page];
      proj = await nextBackend.getProject();
    } else {
      pg = pageList;
    }

    setAllPages(pg);

    if (focusedPageId) {
      pg = pg.filter((page) => page.id === focusedPageId);
    }

    let layoutChanged = false;
    for (const p of pg) {
      if (!proj.pages[p.id]) {
        const idx = Object.keys(proj.pages).length;
        proj.pages[p.id] = {
          x: idx * 720,
          y: 0,
          width: 680,
          height: 500,
        };
        layoutChanged = true;
      }
    }
    if (layoutChanged) {
      await nextBackend.saveProject(proj);
    }

    setSelectedId(null);
    setPages(pg);
    setLayout(proj);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const detectedBackend = await detectBackend();
      if (cancelled) return;

      if (detectedBackend.canManageProjects) {
        const requestedProjectPath = requestedPathState.projectPath;
        if (
          requestedProjectPath &&
          requestedProjectPath !== getWorkspacePath(detectedBackend.info.projectPath)
        ) {
          try {
            await detectedBackend.openProject(requestedProjectPath);
          } catch (error) {
            console.error("Failed to open project from URL:", error);
          }
        }
      }

      if (requestedPathState.rawPath) {
        syncRequestedPathInUrl(requestedPathState.rawPath);
      } else {
        syncProjectPathInUrl(detectedBackend.info.projectPath);
      }
      setBackend(detectedBackend);
      await loadProject(detectedBackend, requestedPathState.pageId);
      if (cancelled) return;
      setLoading(false);
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [loadProject]);

  const handleSavePage = useCallback(async (id: string, content: string) => {
    await backendRef.current?.savePage(id, content);
    // Update page title in local state
    const updatePage = (page: Page) => {
      if (page.id !== id) return page;
      const firstLine = content.split("\n")[0] || "";
      const title = firstLine.replace(/^#*\s*/, "") || page.id;
      return { ...page, content, title };
    };
    setPages((prev) => prev.map(updatePage));
    setAllPages((prev) => prev.map(updatePage));
  }, []);

  const handleReposition = useCallback((id: string, x: number, y: number) => {
    setLayout((prev) => {
      const entry = prev.pages[id] || { x: 0, y: 0, width: 680, height: 500 };
      const next = {
        ...prev,
        pages: { ...prev.pages, [id]: { ...entry, x, y } },
      };
      // Debounce save
      if (saveLayoutTimer.current) clearTimeout(saveLayoutTimer.current);
      saveLayoutTimer.current = setTimeout(() => {
        backendRef.current?.saveProject(layoutRef.current).catch((err) => {
          console.error("Failed to save layout:", err);
        });
      }, 300);
      return next;
    });
  }, []);

  const handleCreatePage = useCallback(async () => {
    if (!backendRef.current) return;
    const page = await backendRef.current.createPage("Untitled", "# Untitled\n");
    const proj = await backendRef.current.getProject();
    setAllPages((prev) => [...prev, page]);
    setPages((prev) => [...prev, page]);
    setLayout(proj);
    setSelectedId(page.id);
  }, []);

  const handleDeletePage = useCallback(
    async (id: string) => {
      if (!backendRef.current) return;
      await backendRef.current.deletePage(id);
      setAllPages((prev) => prev.filter((p) => p.id !== id));
      setPages((prev) => prev.filter((p) => p.id !== id));
      setLayout((prev) => {
        const next = { ...prev, pages: { ...prev.pages } };
        delete next.pages[id];
        return next;
      });
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

  const handleCanvasPointerDown = useCallback(() => {
    setSelectedId(null);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-sm font-medium tracking-[0.18em] text-slate-200 uppercase">
        <p>Loading canvas...</p>
      </div>
    );
  }

  const displayPath = requestedPathState.rawPath ?? backend?.info.projectPath;
  const workspaceName = getWorkspaceName(displayPath);
  const isSinglePageMode = Boolean(requestedPathState.pageId);

  return (
    <>
      <div className="fixed top-4 left-4 z-[110] w-[calc(100vw-2rem)] max-w-[380px] sm:top-5 sm:left-5 sm:w-[min(380px,calc(100vw-40px))]">
        {backend ? (
          <PathSwitcher
            backend={backend}
            currentLabel={workspaceName}
            currentPath={displayPath ?? null}
            projectPath={backend.info.projectPath ?? null}
            pages={allPages}
            buildLocationForPath={buildLocationForPath}
          />
        ) : null}
      </div>
      <Canvas onPointerDownOnCanvas={handleCanvasPointerDown}>
        {pages.map((page) => {
          const pos = layout.pages[page.id] || { x: 0, y: 0 };
          return (
            <PageCard
              key={page.id}
              page={page}
              x={pos.x}
              y={pos.y}
              selected={selectedId === page.id}
              canDelete={!isSinglePageMode}
              onSelect={setSelectedId}
              onSave={handleSavePage}
              onReposition={handleReposition}
              onDelete={handleDeletePage}
              backend={backend!}
            />
          );
        })}
      </Canvas>
      {!isSinglePageMode ? (
        <button
          className="fixed right-6 bottom-6 z-[100] flex size-14 items-center justify-center rounded-full border border-slate-900/10 bg-white text-[2rem] leading-none text-slate-950 shadow-[0_24px_60px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          onClick={handleCreatePage}
          title="New page"
        >
          +
        </button>
      ) : null}
    </>
  );
}
