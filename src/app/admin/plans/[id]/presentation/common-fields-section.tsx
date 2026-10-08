"use client";

interface CommonFieldsSectionProps {
  formData: Record<string, unknown>;
  errors: Record<string, string | undefined>;
  onChange: (name: string, value: unknown) => void;
}

export default function CommonFieldsSection({
  formData,
  errors,
  onChange,
}: CommonFieldsSectionProps) {
  return (
    <section className="space-y-4 rounded-lg border border-border-subtle bg-surface p-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">前台基本資訊</h3>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          這裡控制列表卡、詳情頁標題與 SEO 摘要；價格與付款狀態仍以 Plan / Portaly 為準。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          標題 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={(formData.title as string) || ""}
          onChange={(event) => onChange("title", event.target.value)}
          className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
          placeholder="例如：Claude Code 深度工程手冊"
          maxLength={100}
        />
        {errors.title && (
          <p className="mt-1 text-xs text-red-500">{errors.title}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          副標
        </label>
        <input
          type="text"
          value={(formData.subtitle as string) || ""}
          onChange={(event) => onChange("subtitle", event.target.value)}
          className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
          placeholder="一句話說明這個商品適合誰、能解決什麼問題"
          maxLength={180}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          長文介紹
        </label>
        <textarea
          value={(formData.description as string) || ""}
          onChange={(event) => onChange("description", event.target.value)}
          className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm font-mono"
          placeholder="支援 Markdown。適合放銷售頁主文、故事、背景脈絡；固定格式的資訊請填在下方區塊。"
          rows={18}
          maxLength={50000}
        />
        <p className="mt-1 text-xs leading-5 text-text-muted">
          建議只放需要自由撰寫的段落。課綱、FAQ、適合對象、包含內容等請用下方結構化欄位，前台才容易保持一致。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            封面圖 URL
          </label>
          <input
            type="url"
            value={(formData.coverImage as string) || ""}
            onChange={(event) => onChange("coverImage", event.target.value)}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Banner 圖 URL
          </label>
          <input
            type="url"
            value={(formData.bannerImage as string) || ""}
            onChange={(event) => onChange("bannerImage", event.target.value)}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="用於首頁精選 Banner，可留空"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          CTA 文字
        </label>
        <input
          type="text"
          value={(formData.ctaLabel as string) || ""}
          onChange={(event) => onChange("ctaLabel", event.target.value)}
          className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
          placeholder="立即購買 / 立即報名 / 預約諮詢"
          maxLength={50}
        />
      </div>
    </section>
  );
}
