export const DEFAULT_BACKUP_RETENTION = 336;
export const MINIMUM_BACKUP_RETENTION = 3;

export function parseBackupRetention(
  value: string | undefined,
  options: { defaultValue?: number; minimum?: number } = {},
): number {
  const defaultValue = options.defaultValue ?? DEFAULT_BACKUP_RETENTION;
  const minimum = options.minimum ?? MINIMUM_BACKUP_RETENTION;
  assertRetentionCount(defaultValue, minimum, "default retention");

  const normalized = value?.trim();
  if (!normalized) return defaultValue;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`DB_BACKUP_KEEP must be a whole number greater than or equal to ${minimum}.`);
  }

  const parsed = Number(normalized);
  assertRetentionCount(parsed, minimum, "DB_BACKUP_KEEP");
  return parsed;
}

export function assertRetentionCount(
  value: number,
  minimum = MINIMUM_BACKUP_RETENTION,
  label = "retention count",
): void {
  if (!Number.isSafeInteger(minimum) || minimum < 1) {
    throw new Error("Backup retention minimum must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer greater than or equal to ${minimum}.`);
  }
}
