"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import { RichEditor } from "@/components/ui/rich-editor";
import {
  CheckCircle,
  CloudArrowUp,
  Code,
  Eye,
  Plus,
  SpinnerGap,
  TextAa,
  Trash,
} from "@phosphor-icons/react";
import { Select } from "@/components/ui/select";
import {
  isEmbeddableVideoUrl,
  normalizeVideoUrl,
  serializeLessonResources,
  type LessonResource,
  type LessonResourceType,
} from "@/lib/lesson-content";

interface LessonContentEditorProps {
  type: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  resources?: LessonResource[];
  onResourcesChange?: (value: LessonResource[]) => void;
}

function VideoUrlEditor({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const normalizedValue = normalizeVideoUrl(value);
  const isEmbed = normalizedValue && isEmbeddableVideoUrl(normalizedValue);

  return (
    <div className="space-y-3">
      <Input
        id="content"
        name="content"
        label="影片 URL"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://www.youtube.com/watch?v=... 或 Vimeo / 影片檔 URL"
        error={error}
        required
      />

      {isEmbed && (
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-muted px-3 py-2 text-xs text-text-muted">
            <Eye size={14} />
            預覽
          </div>
          <div className="relative w-full bg-black" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={normalizedValue}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title="影片預覽"
            />
          </div>
        </div>
      )}

      {value.trim().startsWith("http") && !isEmbed && (
        <p className="text-xs text-text-muted">
          無法嵌入的影片連結會在課程頁以 HTML5 video 播放器顯示。
        </p>
      )}
    </div>
  );
}

function TextContentEditor({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [mode, setMode] = useState<"wysiwyg" | "markdown" | "preview">("wysiwyg");

  return (
    <div id="content" tabIndex={-1} className="space-y-2 outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-text-primary">內容</label>
        <div className="flex overflow-hidden rounded-md border border-border-subtle">
          <button
            type="button"
            onClick={() => setMode("wysiwyg")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:scale-[0.98] ${
              mode === "wysiwyg"
                ? "bg-ink text-white"
                : "bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            <TextAa size={12} />
            編輯
          </button>
          <button
            type="button"
            onClick={() => setMode("markdown")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:scale-[0.98] ${
              mode === "markdown"
                ? "bg-ink text-white"
                : "bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            <Code size={12} />
            Markdown
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:scale-[0.98] ${
              mode === "preview"
                ? "bg-ink text-white"
                : "bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            <Eye size={12} />
            預覽
          </button>
        </div>
      </div>

      {mode === "wysiwyg" && (
        <>
          <p className="text-xs text-text-muted">
            可直接編輯文章內容，也可以切到 Markdown 模式補充程式碼區塊。
          </p>
          <RichEditor
            initialContent={value}
            onChange={onChange}
            placeholder="輸入課程文章內容..."
            minHeight="300px"
          />
          <input type="hidden" name="content" value={value} />
        </>
      )}

      {mode === "markdown" && (
        <Textarea
          id="content-markdown"
          name="content"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={16}
          placeholder="# 課程標題&#10;&#10;輸入課程內容..."
          error={error}
          required
          className="font-mono text-sm"
        />
      )}

      {mode === "preview" && (
        <>
          <div className="min-h-[300px] rounded-xl border border-border-subtle bg-white p-6">
            {value ? (
              <article className="mx-auto max-w-prose">
                <Markdown content={value} />
              </article>
            ) : (
              <p className="text-sm text-text-muted">尚無內容</p>
            )}
          </div>
          <input type="hidden" name="content" value={value} />
        </>
      )}
    </div>
  );
}

function FileUploadEditor({
  value,
  onChange,
  error,
  fileType,
  inputName = "content",
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  fileType: "pdf" | "download";
  inputName?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const accept =
    fileType === "pdf"
      ? ".pdf"
      : ".pdf,.zip,.rar,.7z,.tar,.gz,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.mp4,.webm,.wav,.png,.jpg,.jpeg,.webp";

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setUploadError(null);
      setFileName(file.name);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            fileSize: file.size,
            context: "lesson-content",
          }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string; message?: string };
          throw new Error(data.message || data.error || "建立上傳連結失敗");
        }

        const { signedUrl, assetUrl, publicUrl } = (await res.json()) as {
          signedUrl: string;
          assetUrl?: string;
          publicUrl: string;
        };

        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("檔案上傳失敗");
        }

        onChange(assetUrl || publicUrl);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "上傳失敗");
      } finally {
        setUploading(false);
      }
    },
    [onChange],
  );

  const label = fileType === "pdf" ? "PDF 檔案" : "下載檔案";

  return (
    <div className="space-y-3">
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle size={20} weight="fill" className="shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-900">
              {fileName || "檔案已設定"}
            </p>
            <p className="mt-0.5 truncate text-xs text-emerald-700/70">{value}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setFileName("");
            }}
            className="rounded-sm text-xs text-emerald-700 transition-colors hover:text-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 active:scale-[0.98]"
          >
            移除
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border-subtle p-8 transition-colors hover:border-ink/30 hover:bg-surface-muted">
          {uploading ? (
            <>
              <SpinnerGap size={32} className="animate-spin text-text-muted" />
              <span className="text-sm text-text-muted">上傳中...</span>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
                <CloudArrowUp size={24} className="text-text-muted" />
              </div>
              <div className="text-center">
                <span className="text-sm font-medium text-text-primary">
                  點擊上傳{label}
                </span>
                <p className="mt-1 text-xs text-text-muted">
                  {fileType === "pdf" ? "支援 .pdf" : "支援壓縮檔、文件、影音與圖片"}
                </p>
              </div>
            </>
          )}
          <input
            type="file"
            accept={accept}
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
        </label>
      )}

      <div className="flex items-center gap-2 text-xs text-text-muted">
        <div className="h-px flex-1 bg-border-subtle" />
        或貼上 URL
        <div className="h-px flex-1 bg-border-subtle" />
      </div>

      <Input
        id={inputName}
        name={inputName}
        label={`${label} URL`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://..."
        error={error || uploadError || undefined}
        required={Boolean(inputName)}
      />
    </div>
  );
}

function createResourceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function createEmptyResource(type: LessonResourceType, sortOrder: number): LessonResource {
  return {
    id: createResourceId(),
    type,
    title: "",
    url: "",
    sortOrder,
  };
}

function ResourceUrlEditor({
  resource,
  onChange,
}: {
  resource: LessonResource;
  onChange: (patch: Partial<LessonResource>) => void;
}) {
  if (resource.type === "pdf" || resource.type === "download") {
    return (
      <FileUploadEditor
        value={resource.url}
        onChange={(url) => onChange({ url })}
        fileType={resource.type}
        inputName={undefined}
      />
    );
  }

  return (
    <Input
      label="URL"
      value={resource.url}
      onChange={(event) => onChange({ url: event.target.value })}
      placeholder={
        resource.type === "video"
          ? "https://www.youtube.com/watch?v=..."
          : "https://..."
      }
    />
  );
}

function LessonResourcesEditor({
  resources,
  onChange,
}: {
  resources: LessonResource[];
  onChange: (value: LessonResource[]) => void;
}) {
  const orderedResources = resources
    .map((resource, index) => ({ ...resource, sortOrder: index }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const updateResources = (next: LessonResource[]) => {
    onChange(next.map((resource, index) => ({ ...resource, sortOrder: index })));
  };

  const addResource = (type: LessonResourceType) => {
    updateResources([
      ...orderedResources,
      createEmptyResource(type, orderedResources.length),
    ]);
  };

  const updateResource = (id: string, patch: Partial<LessonResource>) => {
    updateResources(
      orderedResources.map((resource) =>
        resource.id === id ? { ...resource, ...patch } : resource,
      ),
    );
  };

  const removeResource = (id: string) => {
    updateResources(orderedResources.filter((resource) => resource.id !== id));
  };

  return (
    <section className="space-y-4 rounded-lg border border-border-subtle bg-surface p-4">
      <input
        type="hidden"
        name="resourcesJson"
        value={JSON.stringify(serializeLessonResources(orderedResources))}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">補充資源</h3>
          <p className="mt-1 text-xs text-text-muted">
            適合放 YouTube 影片、PDF、ZIP 範例檔或外部參考連結。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addResource("video")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs font-medium text-text-secondary transition-[background-color,border-color,transform] hover:border-border-strong hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            <Plus size={14} />
            影片
          </button>
          <button
            type="button"
            onClick={() => addResource("download")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs font-medium text-text-secondary transition-[background-color,border-color,transform] hover:border-border-strong hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            <Plus size={14} />
            檔案
          </button>
          <button
            type="button"
            onClick={() => addResource("link")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs font-medium text-text-secondary transition-[background-color,border-color,transform] hover:border-border-strong hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            <Plus size={14} />
            連結
          </button>
        </div>
      </div>

      {orderedResources.length === 0 ? (
        <p className="rounded-md border border-dashed border-border-subtle px-4 py-6 text-center text-sm text-text-muted">
          尚未加入補充資源
        </p>
      ) : (
        <div className="space-y-3">
          {orderedResources.map((resource, index) => (
            <div
              key={resource.id}
              className="space-y-3 rounded-md border border-border-subtle bg-white p-4"
            >
              <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                <Select
                  label="類型"
                  value={resource.type}
                  onChange={(event) =>
                    updateResource(resource.id, {
                      type: event.target.value as LessonResourceType,
                    })
                  }
                >
                  <option value="video">影片</option>
                  <option value="pdf">PDF</option>
                  <option value="download">下載檔</option>
                  <option value="link">連結</option>
                </Select>
                <Input
                  label="標題"
                  value={resource.title}
                  onChange={(event) =>
                    updateResource(resource.id, { title: event.target.value })
                  }
                  placeholder={`補充資源 ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeResource(resource.id)}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border-subtle px-3 text-sm font-medium text-text-secondary transition-[background-color,border-color,transform] hover:border-border-strong hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
                  aria-label="移除補充資源"
                >
                  <Trash size={16} />
                  移除
                </button>
              </div>
              <ResourceUrlEditor
                resource={resource}
                onChange={(patch) => updateResource(resource.id, patch)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function LessonContentEditor({
  type,
  value,
  onChange,
  error,
  resources = [],
  onResourcesChange,
}: LessonContentEditorProps) {
  let contentEditor;

  switch (type) {
    case "video":
      contentEditor = (
        <VideoUrlEditor value={value} onChange={onChange} error={error} />
      );
      break;
    case "text":
      contentEditor = (
        <TextContentEditor value={value} onChange={onChange} error={error} />
      );
      break;
    case "pdf":
      contentEditor = (
        <FileUploadEditor
          value={value}
          onChange={onChange}
          error={error}
          fileType="pdf"
        />
      );
      break;
    case "download":
      contentEditor = (
        <FileUploadEditor
          value={value}
          onChange={onChange}
          error={error}
          fileType="download"
        />
      );
      break;
    default:
      contentEditor = (
        <Textarea
          id="content"
          name="content"
          label="內容"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          error={error}
          required
        />
      );
  }

  return (
    <div className="space-y-6">
      {contentEditor}
      <LessonResourcesEditor
        resources={resources}
        onChange={onResourcesChange ?? (() => undefined)}
      />
    </div>
  );
}
