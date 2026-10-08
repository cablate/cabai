export type ProductAcquisitionState =
  | "owned"
  | "unavailable"
  | "free"
  | "paid";

interface ProductAcquisitionInput {
  alreadyPurchased: boolean;
  status: string;
  amount: number;
}

export function resolveProductAcquisitionState({
  alreadyPurchased,
  status,
  amount,
}: ProductAcquisitionInput): ProductAcquisitionState {
  if (alreadyPurchased) return "owned";
  if (status !== "active") return "unavailable";
  if (amount === 0) return "free";
  return "paid";
}

export function shouldShowOfferingTypeFilters(
  offeringTypes: readonly string[],
): boolean {
  return new Set(offeringTypes).size > 1;
}
