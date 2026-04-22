import type { Editor } from "@tiptap/react";
import {
  Bold,
  CheckSquare,
  Code2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Table2,
  Undo2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface EditorToolbarProps {
  editor: Editor | null;
  onPickFiles: (files: File[]) => void | Promise<void>;
}

type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "blockquote"
  | "codeBlock";

function getBlockType(editor: Editor): BlockType {
  if (editor.isActive("heading", { level: 1 })) return "heading1";
  if (editor.isActive("heading", { level: 2 })) return "heading2";
  if (editor.isActive("heading", { level: 3 })) return "heading3";
  if (editor.isActive("blockquote")) return "blockquote";
  if (editor.isActive("codeBlock")) return "codeBlock";
  return "paragraph";
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex size-8 items-center justify-center rounded-xl border text-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:pointer-events-none disabled:opacity-40 ${
        active
          ? "border-sky-200 bg-sky-50 text-sky-700 shadow-sm"
          : "border-transparent hover:border-slate-300 hover:bg-white"
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ editor, onPickFiles }: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");

  useEffect(() => {
    if (!editor) return;

    const updateBlockType = () => {
      setBlockType(getBlockType(editor));
    };

    updateBlockType();
    editor.on("selectionUpdate", updateBlockType);
    editor.on("update", updateBlockType);

    return () => {
      editor.off("selectionUpdate", updateBlockType);
      editor.off("update", updateBlockType);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  const handleBlockChange = (next: BlockType) => {
    switch (next) {
      case "paragraph":
        editor.chain().focus().setParagraph().run();
        break;
      case "heading1":
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case "heading2":
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case "heading3":
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case "blockquote":
        editor.chain().focus().toggleBlockquote().run();
        break;
      case "codeBlock":
        editor.chain().focus().toggleCodeBlock().run();
        break;
    }
  };

  const handleLinkClick = () => {
    const existing = editor.getAttributes("link").dataMarkdownSrc as string | null;
    const next = window.prompt("Link URL", existing || "https://");
    if (!next) {
      if (existing) {
        editor.chain().focus().unsetLink().run();
      }
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: next, dataMarkdownSrc: next } as any)
      .run();
  };

  return (
    <div
      className="mb-4 flex min-h-11 flex-wrap items-center gap-2 border-b border-slate-200/80 pb-4"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="inline-flex items-center gap-0.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-sm">
        <select
          className="h-8 min-w-40 rounded-xl border border-transparent bg-transparent px-3 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 hover:bg-white focus:border-sky-400 focus:bg-white"
          aria-label="Block type"
          value={blockType}
          onChange={(event) => handleBlockChange(event.target.value as BlockType)}
        >
          <option value="paragraph">Paragraph</option>
          <option value="heading1">Heading 1</option>
          <option value="heading2">Heading 2</option>
          <option value="heading3">Heading 3</option>
          <option value="blockquote">Quote</option>
          <option value="codeBlock">Code block</option>
        </select>
      </div>
      <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
      <div
        className="inline-flex items-center gap-0.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-sm"
        aria-label="Text formatting"
        role="group"
      >
        <ToolbarButton
          active={editor.isActive("bold")}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("code")}
          disabled={!editor.can().chain().focus().toggleCode().run()}
          label="Inline code"
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code2 size={16} />
        </ToolbarButton>
      </div>
      <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
      <div
        className="inline-flex items-center gap-0.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-sm"
        aria-label="Lists"
        role="group"
      >
        <ToolbarButton
          active={editor.isActive("bulletList")}
          disabled={!editor.can().chain().focus().toggleBulletList().run()}
          label="Bulleted list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          disabled={!editor.can().chain().focus().toggleOrderedList().run()}
          label="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("taskList")}
          disabled={!editor.can().chain().focus().toggleTaskList().run()}
          label="Task list"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <CheckSquare size={16} />
        </ToolbarButton>
      </div>
      <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
      <div
        className="inline-flex items-center gap-0.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-sm"
        aria-label="Insert"
        role="group"
      >
        <ToolbarButton
          active={editor.isActive("link")}
          label="Link"
          onClick={handleLinkClick}
        >
          <Link2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Insert table"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <Table2 size={16} />
        </ToolbarButton>
        <ToolbarButton label="Insert file or image" onClick={() => fileInputRef.current?.click()}>
          <Upload size={16} />
        </ToolbarButton>
      </div>
      <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
      <div
        className="inline-flex items-center gap-0.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-sm"
        aria-label="History"
        role="group"
      >
        <ToolbarButton
          label="Undo"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </ToolbarButton>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            void onPickFiles(files);
          }
          event.target.value = "";
        }}
      />
    </div>
  );
}
