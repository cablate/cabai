"use client";

interface ValidationSummaryProps {
  errors: Record<string, string | undefined>;
}

export default function ValidationSummary({ errors }: ValidationSummaryProps) {
  const errorEntries = Object.entries(errors).filter(
    ([, value]) => value !== undefined
  );

  if (errorEntries.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <h4 className="text-sm font-semibold text-red-800 mb-2">
        請修正以下錯誤
      </h4>
      <ul className="list-disc list-inside space-y-1">
        {errorEntries.map(([key, value]) => (
          <li key={key} className="text-sm text-red-700">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}
