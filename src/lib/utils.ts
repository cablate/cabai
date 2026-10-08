import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number): string {
  return `NT$${Math.round(amount).toLocaleString("zh-TW")}`;
}

export function generateOrderNumber(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, "").substring(0, 8);
  return `ORD-${ts}-${rand}`.toUpperCase();
}
