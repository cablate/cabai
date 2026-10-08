export type OrdersView = "local" | "provider";

export function parseOrdersView(value: string | string[] | undefined): OrdersView {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "provider" ? "provider" : "local";
}
