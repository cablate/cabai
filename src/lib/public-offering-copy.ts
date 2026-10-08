export type BillingPeriod = "one-time" | "monthly" | "yearly" | string;

const paidBillingLabels: Record<string, string> = {
  "one-time": "單次購買",
  monthly: "月訂閱",
  yearly: "年訂閱",
};

export function getBillingLabel(
  billingPeriod: BillingPeriod,
  isFreeClaim: boolean,
): string {
  if (isFreeClaim) return "免費領取";
  return paidBillingLabels[billingPeriod] ?? billingPeriod;
}

export function getPersistentAccessLabel(isFreeClaim: boolean): string {
  return isFreeClaim ? "領取後於會員中心查看" : "購買後於會員中心查看";
}

export function getTrustSectionTitle(isFreeClaim: boolean): string {
  return isFreeClaim ? "領取與使用說明" : "購買保障";
}

export function getPreviewContinuationCopy(
  planName: string,
  isFreeClaim: boolean,
): {
  eyebrow: string;
  title: string;
  cta: string;
} {
  if (isFreeClaim) {
    return {
      eyebrow: "想繼續走完學員流程？",
      title: `免費加入《${planName}》並繼續學習`,
      cta: "回商品頁免費加入",
    };
  }

  return {
    eyebrow: "試看到這裡，想繼續嗎？",
    title: `查看《${planName}》完整內容`,
    cta: "查看商品頁",
  };
}
