"use client";

import type { OfferingType } from "@/lib/validations/plan-presentations";

interface OfferingTypeSelectorProps {
  value: OfferingType;
  onChange: (type: OfferingType) => void;
}

const offeringTypes: Array<{
  type: OfferingType;
  label: string;
  description: string;
}> = [
  {
    type: "course",
    label: "線上課程",
    description: "分章節的課程內容",
  },
  {
    type: "lecture",
    label: "線上講座",
    description: "單次講座或直播",
  },
  {
    type: "free_event",
    label: "免費活動",
    description: "免費參與的活動",
  },
  {
    type: "offline_event",
    label: "線下活動",
    description: "實體線下活動",
  },
  {
    type: "service",
    label: "服務方案",
    description: "一對一或客製化服務",
  },
  {
    type: "membership",
    label: "會員訂閱",
    description: "定期更新的會員內容",
  },
  {
    type: "download",
    label: "下載資源",
    description: "可下載的資源或工具",
  },
];

export default function OfferingTypeSelector({
  value,
  onChange,
}: OfferingTypeSelectorProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-6">
      <h3 className="text-sm font-semibold text-text-primary mb-4">
        選擇服務類型
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {offeringTypes.map((item) => (
          <button
            key={item.type}
            onClick={() => onChange(item.type)}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              value === item.type
                ? "border-emerald-500 bg-emerald-50"
                : "border-border-subtle bg-surface hover:border-border-default"
            }`}
          >
            <div className="font-medium text-sm text-text-primary">
              {item.label}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {item.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
