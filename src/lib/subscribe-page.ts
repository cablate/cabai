export interface SubscribePageDefinition {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  emailLabel: string;
  emailPlaceholder: string;
  submitLabel: string;
  consentText: string;
  successMessage: string;
  kitFormId?: string;
  kitFormUid?: string;
}

const KIT_FORM_ID_PATTERN = /^\d{1,20}$/;
const KIT_FORM_UID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const subscribePageContent = {
  slug: "updates",
  title: "留下 Email，收到後續更新",
  description: "重要消息、內容更新與實用分享，我們會直接寄到你的信箱。",
  eyebrow: "保持聯絡",
  emailLabel: "Email",
  emailPlaceholder: "name@example.com",
  submitLabel: "訂閱更新",
  consentText: "送出即同意接收本站 Email，可隨時取消訂閱。",
  successMessage: "已完成訂閱，後續更新會寄到你的信箱。",
};

function validatedKitValue(
  value: string | undefined,
  pattern: RegExp,
): string | undefined {
  const candidate = value?.trim();
  return candidate && pattern.test(candidate) ? candidate : undefined;
}

export function getSubscribePage(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): SubscribePageDefinition {
  return {
    ...subscribePageContent,
    kitFormId: validatedKitValue(
      environment.KIT_GENERAL_UPDATES_FORM_ID,
      KIT_FORM_ID_PATTERN,
    ),
    kitFormUid: validatedKitValue(
      environment.KIT_GENERAL_UPDATES_FORM_UID,
      KIT_FORM_UID_PATTERN,
    ),
  };
}
