"use client";

interface FeaturedSectionProps {
  isFeatured: boolean;
  sortOrder: number | null;
  onIsFeaturedChange: (value: boolean) => void;
  onSortOrderChange: (value: number | null) => void;
}

export default function FeaturedSection({
  isFeatured,
  sortOrder,
  onIsFeaturedChange,
  onSortOrderChange,
}: FeaturedSectionProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-6 space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">首頁推薦</h3>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isFeatured}
          onChange={(e) => onIsFeaturedChange(e.target.checked)}
          className="h-4 w-4 rounded border-border-subtle"
        />
        <span className="text-sm text-text-secondary">
          在首頁 Banner 顯示此 Offering
        </span>
      </label>

      {isFeatured && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            排序順序
          </label>
          <input
            type="number"
            min={0}
            value={sortOrder ?? ""}
            onChange={(e) =>
              onSortOrderChange(
                e.target.value ? Number(e.target.value) : null
              )
            }
            className="w-32 rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
            placeholder="0"
          />
          <p className="mt-1 text-xs text-text-muted">
            數字越小越前面。首頁橫幅會按此順序排列。
          </p>
        </div>
      )}
    </div>
  );
}
