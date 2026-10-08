"use client";

import { useCallback, type CSSProperties } from "react";
import {
  EditorRoot,
  EditorContent,
  EditorBubble,
  EditorBubbleItem,
  StarterKit,
} from "novel";
import { cn } from "@/lib/utils";

const extensions = [
  StarterKit,
];

interface RichEditorProps {
  /** Initial string is inserted as literal text, never parsed as HTML or JSON. */
  initialContent?: string;
  /** Called on every change with the HTML output */
  onChange?: (html: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Additional className for the editor container */
  className?: string;
  /** Minimum height */
  minHeight?: string;
}

/**
 * WYSIWYG rich text editor based on Novel (Tiptap).
 * Outputs HTML using the fixed StarterKit schema (headings, lists, code and marks).
 * No link/image/custom attribute extensions are registered here. Keep stored
 * input as text; adding imported JSON or dynamic extensions needs a new review.
 */
export function RichEditor({
  initialContent,
  onChange,
  className,
  minHeight = "300px",
}: RichEditorProps) {
  const handleUpdate = useCallback(
    ({ editor }: { editor: { getHTML: () => string } }) => {
      const html = editor.getHTML();
      onChange?.(html);
    },
    [onChange],
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated",
        className,
      )}
      style={{ "--editor-min-height": minHeight } as CSSProperties}
    >
      <EditorRoot>
        <EditorContent
          initialContent={
            initialContent
              ? {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: initialContent }],
                    },
                  ],
                }
              : undefined
          }
          className="prose prose-sm min-h-[var(--editor-min-height)] max-w-none p-6"
          extensions={extensions}
          onUpdate={handleUpdate}
        >
          {/* Bubble menu for text formatting */}
          <EditorBubble className="flex items-center gap-0.5 rounded-lg border border-border-subtle bg-surface p-1 shadow-lg">
            <EditorBubbleItem
              onSelect={(editor) => editor.chain().focus().toggleBold().run()}
            >
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm font-bold transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
              >
                B
              </button>
            </EditorBubbleItem>
            <EditorBubbleItem
              onSelect={(editor) => editor.chain().focus().toggleItalic().run()}
            >
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm italic transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
              >
                I
              </button>
            </EditorBubbleItem>
            <EditorBubbleItem
              onSelect={(editor) => editor.chain().focus().toggleCode().run()}
            >
              <button
                type="button"
                className="rounded-md px-2 py-1 font-mono text-sm transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
              >
                {"</>"}
              </button>
            </EditorBubbleItem>
          </EditorBubble>
        </EditorContent>
      </EditorRoot>
    </div>
  );
}
