"use client";

import type { ReactNode } from "react";
import type { OfferingType } from "@/lib/validations/plan-presentations";

interface MetadataByTypeProps {
  offeringType: OfferingType;
  metadata: Record<string, unknown> | null;
  onChange: (metadata: Record<string, unknown>) => void;
}

type BenefitItem = { title: string; description?: string };
type DeliveryStepItem = { step: number; title: string; description?: string };
type FaqItem = { q: string; a: string };
type Instructor = {
  name?: string;
  bio?: string;
  credentials?: string[];
  avatarUrl?: string;
};
type TestimonialItem = {
  name: string;
  title?: string;
  avatarUrl?: string;
  content: string;
  rating?: number;
};

function toNumberInput(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function toDateInput(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  return value.includes("T") ? value.split("T")[0] ?? "" : value;
}

function asStringList(metadata: Record<string, unknown>, key: string): string[] {
  return Array.isArray(metadata[key]) ? (metadata[key] as string[]) : [];
}

function asFaqItems(metadata: Record<string, unknown>): FaqItem[] {
  return Array.isArray(metadata.faqItems) ? (metadata.faqItems as FaqItem[]) : [];
}

function asBenefits(metadata: Record<string, unknown>): BenefitItem[] {
  return Array.isArray(metadata.benefits)
    ? (metadata.benefits as BenefitItem[])
    : [];
}

function asDeliverySteps(metadata: Record<string, unknown>): DeliveryStepItem[] {
  return Array.isArray(metadata.deliverySteps)
    ? (metadata.deliverySteps as DeliveryStepItem[])
    : [];
}

function asTestimonials(metadata: Record<string, unknown>): TestimonialItem[] {
  return Array.isArray(metadata.testimonials)
    ? (metadata.testimonials as TestimonialItem[])
    : [];
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "time" | "url";
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-secondary">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: unknown;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-secondary">
        {label}
      </label>
      <input
        type="number"
        value={toNumberInput(value)}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "" ? undefined : Number(next));
        }}
        className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-secondary">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}

function StringListEditor({
  title,
  description,
  items,
  placeholder,
  onChange,
}: {
  title: string;
  description?: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  return (
    <Section title={title} description={description}>
      {items.length === 0 && (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-text-muted">
          尚未新增項目。
        </p>
      )}
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            onChange={(event) => {
              const updated = [...items];
              updated[index] = event.target.value;
              onChange(updated);
            }}
            className="flex-1 rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="shrink-0 rounded-md px-2 py-2 text-xs text-danger hover:bg-danger/10"
          >
            刪除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-muted"
      >
        新增項目
      </button>
    </Section>
  );
}

function InstructorEditor({
  instructor,
  onChange,
}: {
  instructor: Instructor;
  onChange: (instructor: Instructor) => void;
}) {
  const credentials = instructor.credentials || [];

  return (
    <Section
      title="作者 / 講師"
      description="顯示在詳情頁下方，用來補足信任感與專業背景。"
    >
      <TextField
        label="名稱"
        value={instructor.name || ""}
        onChange={(value) => onChange({ ...instructor, name: value })}
        placeholder="例如：Cab"
      />
      <TextareaField
        label="簡介"
        value={instructor.bio || ""}
        onChange={(value) => onChange({ ...instructor, bio: value })}
        placeholder="簡短說明為什麼由你來教或提供這項服務。"
      />
      <TextField
        label="頭像 URL（選填）"
        type="url"
        value={instructor.avatarUrl || ""}
        onChange={(value) => onChange({ ...instructor, avatarUrl: value })}
        placeholder="https://..."
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-text-muted">
            經歷標籤
          </label>
          <button
            type="button"
            onClick={() =>
              onChange({ ...instructor, credentials: [...credentials, ""] })
            }
            className="text-xs font-medium text-accent hover:text-success"
          >
            新增
          </button>
        </div>
        <div className="space-y-2">
          {credentials.map((credential, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={credential}
                onChange={(event) => {
                  const updated = [...credentials];
                  updated[index] = event.target.value;
                  onChange({ ...instructor, credentials: updated });
                }}
                className="flex-1 rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
                placeholder="例如：全端工程師 / AI Agent 實作經驗"
              />
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...instructor,
                    credentials: credentials.filter((_, i) => i !== index),
                  })
                }
                className="shrink-0 rounded-md px-2 py-2 text-xs text-danger hover:bg-danger/10"
              >
                刪除
              </button>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function FaqEditor({
  items,
  onChange,
}: {
  items: FaqItem[];
  onChange: (items: FaqItem[]) => void;
}) {
  return (
    <Section title="FAQ" description="購買前常見疑慮，會顯示為可展開問答。">
      {items.length === 0 && (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-text-muted">
          尚未新增 FAQ。
        </p>
      )}
      {items.map((item, index) => (
        <div
          key={index}
          className="space-y-2 rounded-md border border-border-subtle bg-surface-muted p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">
              Q{index + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="text-xs text-danger"
            >
              刪除
            </button>
          </div>
          <input
            type="text"
            value={item.q}
            onChange={(event) => {
              const updated = [...items];
              updated[index] = { ...item, q: event.target.value };
              onChange(updated);
            }}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="問題"
          />
          <textarea
            value={item.a}
            onChange={(event) => {
              const updated = [...items];
              updated[index] = { ...item, a: event.target.value };
              onChange(updated);
            }}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="回答"
            rows={2}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { q: "", a: "" }])}
        className="rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-muted"
      >
        新增 FAQ
      </button>
    </Section>
  );
}

function TestimonialsEditor({
  items,
  onChange,
}: {
  items: TestimonialItem[];
  onChange: (items: TestimonialItem[]) => void;
}) {
  return (
    <Section title="學員評價" description="顯示在產品詳情頁，用來建立社會信任。頭像非必填，留空會自動顯示姓名首字。">
      {items.length === 0 && (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-text-muted">
          尚未新增評價。
        </p>
      )}
      {items.map((item, index) => (
        <div
          key={index}
          className="space-y-3 rounded-md border border-border-subtle bg-surface-muted p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">
              評價 #{index + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="text-xs text-danger"
            >
              刪除
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={item.name}
              onChange={(event) => {
                const updated = [...items];
                updated[index] = { ...item, name: event.target.value };
                onChange(updated);
              }}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
              placeholder="學員姓名 *"
            />
            <input
              type="text"
              value={item.title || ""}
              onChange={(event) => {
                const updated = [...items];
                updated[index] = { ...item, title: event.target.value };
                onChange(updated);
              }}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
              placeholder="職稱（選填，如：全端工程師）"
            />
          </div>
          <input
            type="url"
            value={item.avatarUrl || ""}
            onChange={(event) => {
              const updated = [...items];
              updated[index] = { ...item, avatarUrl: event.target.value };
              onChange(updated);
            }}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="頭像 URL（選填）"
          />
          <textarea
            value={item.content}
            onChange={(event) => {
              const updated = [...items];
              updated[index] = { ...item, content: event.target.value };
              onChange(updated);
            }}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="評價內容 *"
            rows={3}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">
              評分（選填）
            </label>
            <select
              value={item.rating ?? ""}
              onChange={(event) => {
                const updated = [...items];
                updated[index] = {
                  ...item,
                  rating: event.target.value === "" ? undefined : Number(event.target.value),
                };
                onChange(updated);
              }}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            >
              <option value="">未設定</option>
              <option value="5">⭐⭐⭐⭐⭐ 5 星</option>
              <option value="4">⭐⭐⭐⭐ 4 星</option>
              <option value="3">⭐⭐⭐ 3 星</option>
              <option value="2">⭐⭐ 2 星</option>
              <option value="1">⭐ 1 星</option>
            </select>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...items, { name: "", content: "" }])
        }
        className="rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-muted"
      >
        新增評價
      </button>
    </Section>
  );
}

function BenefitEditor({
  items,
  onChange,
}: {
  items: BenefitItem[];
  onChange: (items: BenefitItem[]) => void;
}) {
  return (
    <Section title="會員權益" description="會員訂閱類型會用這些項目說明訂閱價值。">
      {items.map((item, index) => (
        <div
          key={index}
          className="space-y-2 rounded-md border border-border-subtle bg-surface-muted p-3"
        >
          <input
            type="text"
            value={item.title}
            onChange={(event) => {
              const updated = [...items];
              updated[index] = { ...item, title: event.target.value };
              onChange(updated);
            }}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="權益名稱"
          />
          <textarea
            value={item.description || ""}
            onChange={(event) => {
              const updated = [...items];
              updated[index] = { ...item, description: event.target.value };
              onChange(updated);
            }}
            className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="權益說明"
            rows={2}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="text-xs text-danger"
          >
            刪除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { title: "", description: "" }])}
        className="rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-muted"
      >
        新增權益
      </button>
    </Section>
  );
}

function DeliveryStepsEditor({
  items,
  onChange,
}: {
  items: DeliveryStepItem[];
  onChange: (items: DeliveryStepItem[]) => void;
}) {
  return (
    <Section title="服務流程" description="服務型商品會用時間線顯示這些步驟。">
      {items.map((item, index) => (
        <div
          key={index}
          className="space-y-2 rounded-md border border-border-subtle bg-surface-muted p-3"
        >
          <TextField
            label="步驟標題"
            value={item.title}
            onChange={(value) => {
              const updated = [...items];
              updated[index] = { ...item, title: value, step: index + 1 };
              onChange(updated);
            }}
            placeholder="例如：付款後確認需求"
          />
          <TextareaField
            label="步驟說明"
            value={item.description || ""}
            onChange={(value) => {
              const updated = [...items];
              updated[index] = { ...item, description: value, step: index + 1 };
              onChange(updated);
            }}
            rows={2}
          />
          <button
            type="button"
            onClick={() =>
              onChange(
                items
                  .filter((_, i) => i !== index)
                  .map((step, i) => ({ ...step, step: i + 1 }))
              )
            }
            className="text-xs text-danger"
          >
            刪除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...items,
            { step: items.length + 1, title: "", description: "" },
          ])
        }
        className="rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-muted"
      >
        新增流程
      </button>
    </Section>
  );
}

export default function MetadataByType({
  offeringType,
  metadata,
  onChange,
}: MetadataByTypeProps) {
  const safeMetadata = metadata || {};
  const setField = (key: string, value: unknown) =>
    onChange({ ...safeMetadata, [key]: value });

  const instructor =
    (safeMetadata.instructor as Instructor | undefined) || {};

  const renderTypeFields = () => {
    switch (offeringType) {
      case "course":
        return (
          <Section title="課程摘要" description="列表卡與購買卡會優先使用這些摘要。">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="章節數"
                value={safeMetadata.chapterCount}
                onChange={(value) => setField("chapterCount", value)}
              />
              <NumberField
                label="課堂數"
                value={safeMetadata.lessonCount}
                onChange={(value) => setField("lessonCount", value)}
              />
              <NumberField
                label="預估時數"
                value={safeMetadata.estimatedHours}
                onChange={(value) => setField("estimatedHours", value)}
              />
              <NumberField
                label="免費試看數"
                value={safeMetadata.freeLessonCount}
                onChange={(value) => setField("freeLessonCount", value)}
              />
            </div>
          </Section>
        );

      case "lecture":
        return (
          <Section title="講座資訊">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="講者"
                value={(safeMetadata.speaker as string) || ""}
                onChange={(value) => setField("speaker", value)}
              />
              <TextField
                label="日期"
                type="date"
                value={toDateInput(safeMetadata.eventDate)}
                onChange={(value) => setField("eventDate", value)}
              />
              <TextField
                label="時間"
                type="time"
                value={(safeMetadata.eventTime as string) || ""}
                onChange={(value) => setField("eventTime", value)}
              />
              <NumberField
                label="時長（分鐘）"
                value={safeMetadata.durationMinutes}
                onChange={(value) => setField("durationMinutes", value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={safeMetadata.hasReplay === true}
                onChange={(event) => setField("hasReplay", event.target.checked)}
              />
              提供回放
            </label>
            <TextareaField
              label="講者簡介"
              value={(safeMetadata.speakerBio as string) || ""}
              onChange={(value) => setField("speakerBio", value)}
              rows={3}
            />
          </Section>
        );

      case "free_event":
        return (
          <Section title="免費活動資訊">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="日期"
                type="date"
                value={toDateInput(safeMetadata.eventDate)}
                onChange={(value) => setField("eventDate", value)}
              />
              <NumberField
                label="名額上限"
                value={safeMetadata.capacity}
                onChange={(value) => setField("capacity", value)}
              />
            </div>
            <TextareaField
              label="目標對象"
              value={(safeMetadata.targetAudience as string) || ""}
              onChange={(value) => setField("targetAudience", value)}
            />
            <TextareaField
              label="報名前提醒"
              value={(safeMetadata.registrationNotes as string) || ""}
              onChange={(value) => setField("registrationNotes", value)}
            />
          </Section>
        );

      case "offline_event":
        return (
          <Section title="線下活動資訊">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="場地"
                value={(safeMetadata.venue as string) || ""}
                onChange={(value) => setField("venue", value)}
              />
              <TextField
                label="日期"
                type="date"
                value={toDateInput(safeMetadata.eventDate)}
                onChange={(value) => setField("eventDate", value)}
              />
              <TextField
                label="時間"
                type="time"
                value={(safeMetadata.eventTime as string) || ""}
                onChange={(value) => setField("eventTime", value)}
              />
              <NumberField
                label="名額上限"
                value={safeMetadata.capacity}
                onChange={(value) => setField("capacity", value)}
              />
            </div>
            <TextField
              label="地址"
              value={(safeMetadata.address as string) || ""}
              onChange={(value) => setField("address", value)}
            />
            <TextareaField
              label="入場注意事項"
              value={(safeMetadata.admissionNotes as string) || ""}
              onChange={(value) => setField("admissionNotes", value)}
            />
          </Section>
        );

      case "service":
        return (
          <>
            <Section title="服務摘要">
              <TextareaField
                label="服務範圍"
                value={(safeMetadata.serviceScope as string) || ""}
                onChange={(value) => setField("serviceScope", value)}
                placeholder="說清楚這項服務會處理什麼、不處理什麼。"
                rows={4}
              />
              <NumberField
                label="預估交付週數"
                value={safeMetadata.expectedTimelineWeeks}
                onChange={(value) => setField("expectedTimelineWeeks", value)}
              />
            </Section>
            <StringListEditor
              title="使用者需要準備"
              items={asStringList(safeMetadata, "requiredInputs")}
              placeholder="例如：目前使用的工具、目標、現有素材"
              onChange={(items) => setField("requiredInputs", items)}
            />
            <DeliveryStepsEditor
              items={asDeliverySteps(safeMetadata)}
              onChange={(items) => setField("deliverySteps", items)}
            />
          </>
        );

      case "membership":
        return (
          <>
            <Section title="會員訂閱摘要">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-secondary">
                    更新頻率
                  </label>
                  <select
                    value={(safeMetadata.updateFrequency as string) || "monthly"}
                    onChange={(event) =>
                      setField("updateFrequency", event.target.value)
                    }
                    className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
                  >
                    <option value="daily">每日</option>
                    <option value="weekly">每週</option>
                    <option value="monthly">每月</option>
                    <option value="quarterly">每季</option>
                  </select>
                </div>
                <NumberField
                  label="每月內容數"
                  value={safeMetadata.monthlyContentCount}
                  onChange={(value) => setField("monthlyContentCount", value)}
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={safeMetadata.exclusiveChannelAccess === true}
                    onChange={(event) =>
                      setField("exclusiveChannelAccess", event.target.checked)
                    }
                  />
                  提供專屬社群頻道
                </label>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={safeMetadata.communityEvents === true}
                    onChange={(event) =>
                      setField("communityEvents", event.target.checked)
                    }
                  />
                  提供會員活動
                </label>
              </div>
            </Section>
            <BenefitEditor
              items={asBenefits(safeMetadata)}
              onChange={(items) => setField("benefits", items)}
            />
          </>
        );

      case "download":
        return (
          <Section title="下載資源資訊">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="檔案格式"
                value={(safeMetadata.fileFormat as string) || ""}
                onChange={(value) => setField("fileFormat", value)}
                placeholder="PDF, ZIP, Notion template"
              />
              <TextField
                label="檔案大小"
                value={(safeMetadata.fileSize as string) || ""}
                onChange={(value) => setField("fileSize", value)}
                placeholder="150 MB"
              />
              <NumberField
                label="檔案數"
                value={safeMetadata.numberOfFiles}
                onChange={(value) => setField("numberOfFiles", value)}
              />
            </div>
          </Section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {renderTypeFields()}

      <StringListEditor
        title="適合誰"
        description="幫使用者快速判斷這是不是為他準備的。"
        items={asStringList(safeMetadata, "audienceItems")}
        placeholder="例如：已經用過 Claude Code，但不知道怎麼穩定管理專案的人"
        onChange={(items) => setField("audienceItems", items)}
      />

      <StringListEditor
        title="使用者現在卡在哪裡"
        description="對應 Teachify 長銷售頁常見的痛點段落。"
        items={asStringList(safeMetadata, "painPoints")}
        placeholder="例如：照著範例改了 CLAUDE.md，卻不知道為什麼失效"
        onChange={(items) => setField("painPoints", items)}
      />

      <StringListEditor
        title="你會學到"
        items={asStringList(safeMetadata, "learningObjectives")}
        placeholder="例如：判斷 Prompt Cache 暴增的原因與修正方式"
        onChange={(items) => setField("learningObjectives", items)}
      />

      <StringListEditor
        title="包含內容"
        description="可放教材、操作包、模板、直播、社群或服務項目。"
        items={asStringList(safeMetadata, "includedItems")}
        placeholder="例如：7 份實戰操作包、32 堂課、範例設定檔"
        onChange={(items) => setField("includedItems", items)}
      />

      <StringListEditor
        title="完成後你可以"
        items={asStringList(safeMetadata, "outcomes")}
        placeholder="例如：自己判斷 Agent 流程壞在哪，不用等別人幫你修"
        onChange={(items) => setField("outcomes", items)}
      />

      <StringListEditor
        title="開始前你需要"
        items={asStringList(safeMetadata, "prerequisites")}
        placeholder="例如：基本終端機操作、已安裝 Claude Code"
        onChange={(items) => setField("prerequisites", items)}
      />

      <Section title="限時或銷售提示" description="沒有真實優惠時請留空。">
        <TextareaField
          label="提示文字"
          value={(safeMetadata.urgencyNote as string) || ""}
          onChange={(value) => setField("urgencyNote", value)}
          placeholder="例如：限時預購價，正式上架後調整為 NT$5,990"
          rows={2}
        />
      </Section>

      <InstructorEditor
        instructor={instructor}
        onChange={(value) => setField("instructor", value)}
      />

      <FaqEditor
        items={asFaqItems(safeMetadata)}
        onChange={(items) => setField("faqItems", items)}
      />

      <TestimonialsEditor
        items={asTestimonials(safeMetadata)}
        onChange={(items) => setField("testimonials", items)}
      />
    </div>
  );
}
