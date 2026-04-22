import { ChevronDown, ExternalLink, FileText, Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Page, StorageBackend } from "./storage";

interface PathSwitcherProps {
  backend: StorageBackend;
  currentLabel: string;
  currentPath: string | null;
  projectPath: string | null;
  pages: Page[];
  buildLocationForPath: (path?: string | null) => string;
}

interface PathOption {
  label: string;
  path: string;
  kind: "file" | "directory";
  active: boolean;
}

function getBasename(path?: string | null) {
  const value = path?.trim();
  if (!value) return "";

  const segments = value.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || value;
}

function joinPath(parent: string, child: string) {
  const separator = parent.includes("\\") ? "\\" : "/";
  const normalizedParent = parent.endsWith(separator)
    ? parent.slice(0, -1)
    : parent;
  return `${normalizedParent}${separator}${child}`;
}

export function PathSwitcher({
  backend,
  currentLabel,
  currentPath,
  projectPath,
  pages,
  buildLocationForPath,
}: PathSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [directoryOptions, setDirectoryOptions] = useState<PathOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !projectPath || !backend.canManageProjects) return;

    let cancelled = false;

    const loadDirectories = async () => {
      setLoading(true);
      setError(null);

      try {
        const currentListing = await backend.listDirectories(projectPath);
        const parentListing = currentListing.parentPath
          ? await backend.listDirectories(currentListing.parentPath)
          : null;

        const seenPaths = new Set<string>();
        const options: PathOption[] = [];

        const addDirectory = (path: string) => {
          if (seenPaths.has(path)) return;
          seenPaths.add(path);
          options.push({
            label: getBasename(path),
            path,
            kind: "directory",
            active: path === projectPath,
          });
        };

        addDirectory(projectPath);

        for (const directory of parentListing?.directories ?? currentListing.directories) {
          addDirectory(directory.path);
        }

        if (!cancelled) {
          setDirectoryOptions(options);
        }
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError("Could not load nearby folders.");
          setDirectoryOptions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDirectories();

    return () => {
      cancelled = true;
    };
  }, [backend, open, projectPath]);

  const fileOptions = projectPath
    ? pages
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        .map((page) => {
          const path = joinPath(projectPath, `${page.id}.md`);
          return {
            label: `${page.id}.md`,
            path,
            kind: "file" as const,
            active: path === currentPath,
          };
        })
    : [];

  const openPathInNewTab = (path: string) => {
    const nextLocation = buildLocationForPath(path);
    window.open(nextLocation, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        className="inline-flex h-[2.85rem] w-full min-w-0 items-center justify-between gap-3 rounded-full border border-slate-200/80 bg-white/[0.88] px-4 py-0 text-left text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:border-slate-300 hover:bg-white/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className="min-w-0 truncate text-[0.95rem] font-semibold tracking-[-0.02em]"
          title={currentPath ?? projectPath ?? currentLabel}
        >
          {currentLabel}
        </span>
        <ChevronDown
          className={`shrink-0 text-slate-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          size={16}
        />
      </button>

      {open ? (
        <div
          className="absolute top-[calc(100%+0.55rem)] left-0 max-h-[min(70vh,560px)] w-[min(440px,calc(100vw-40px))] overflow-auto rounded-3xl border border-slate-200/80 bg-white/96 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl"
          role="menu"
          aria-label="Open another file or folder"
        >
          {fileOptions.length > 0 ? (
            <div>
              <div className="px-2.5 pt-1 pb-2 text-[0.72rem] font-bold tracking-[0.12em] text-slate-500 uppercase">
                Files
              </div>
              {fileOptions.map((option) => (
                <button
                  key={option.path}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    option.active
                      ? "bg-sky-50 text-sky-950"
                      : "text-slate-900 hover:bg-slate-50"
                  }`}
                  type="button"
                  role="menuitem"
                  onClick={() => openPathInNewTab(option.path)}
                >
                  <span className="inline-flex min-w-0 items-center gap-2.5">
                    <FileText className="shrink-0" size={14} />
                    <span className="truncate text-[0.92rem]">{option.label}</span>
                  </span>
                  <ExternalLink className="shrink-0 text-slate-400" size={13} />
                </button>
              ))}
            </div>
          ) : null}

          <div className={fileOptions.length > 0 ? "mt-2 border-t border-slate-200/80 pt-2" : ""}>
            <div className="px-2.5 pt-1 pb-2 text-[0.72rem] font-bold tracking-[0.12em] text-slate-500 uppercase">
              Folders
            </div>
            {loading ? (
              <div className="px-3 py-3 text-sm text-slate-500">Loading folders...</div>
            ) : error ? (
              <div className="px-3 py-3 text-sm text-slate-500">{error}</div>
            ) : directoryOptions.length > 0 ? (
              directoryOptions.map((option) => (
                <button
                  key={option.path}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    option.active
                      ? "bg-sky-50 text-sky-950"
                      : "text-slate-900 hover:bg-slate-50"
                  }`}
                  type="button"
                  role="menuitem"
                  onClick={() => openPathInNewTab(option.path)}
                >
                  <span className="inline-flex min-w-0 items-center gap-2.5">
                    <Folder className="shrink-0" size={14} />
                    <span className="truncate text-[0.92rem]">{option.label}</span>
                  </span>
                  <ExternalLink className="shrink-0 text-slate-400" size={13} />
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-slate-500">No folders available.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
