"use client";

interface SaveBarProps {
  isSaving: boolean;
  hasErrors: boolean;
  onSave: () => void;
  onDiscard: () => void;
  showConfirm: boolean;
}

export default function SaveBar({
  isSaving,
  hasErrors,
  onSave,
  onDiscard,
  showConfirm,
}: SaveBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border-subtle bg-surface px-6 py-3 md:left-64">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <span className="text-sm text-text-secondary">有未儲存的變更</span>
        <div className="flex items-center gap-3">
          {showConfirm ? (
            <>
              <span className="text-sm text-amber-600">確定要捨棄變更？</span>
              <button
                onClick={onDiscard}
                className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                確定捨棄
              </button>
            </>
          ) : (
            <button
              onClick={onDiscard}
              className="rounded-md border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
            >
              捨棄
            </button>
          )}
          <button
            onClick={onSave}
            disabled={isSaving || hasErrors}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSaving ? "儲存中..." : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}
