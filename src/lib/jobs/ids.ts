export const jobIds = [
  "database-backup",
  "cleanup-orders",
  "media-cleanup",
  "webhook-outbox",
  "subscription-reconciliation",
  "provider-sync",
] as const;

export type JobId = (typeof jobIds)[number];
