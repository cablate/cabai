import type { Icon } from "@phosphor-icons/react";
import {
  Books,
  BracketsCurly,
  ChartLineUp,
  ClipboardText,
  DiscordLogo,
  Gear,
  GraduationCap,
  Images,
  Key,
  Notebook,
  Plugs,
  Receipt,
  Storefront,
  Users,
  WebhooksLogo,
  BellRinging,
} from "@phosphor-icons/react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: Icon;
}

export interface AdminNavSection {
  title: string;
  description: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    title: "內容製作",
    description: "建立、整理與發布",
    items: [
      { href: "/admin/courses", label: "課程", icon: GraduationCap },
      { href: "/admin/library", label: "Library", icon: Books },
      { href: "/admin/skills", label: "Skills", icon: BracketsCurly },
      { href: "/admin/information", label: "Information", icon: BellRinging },
      { href: "/admin/media", label: "媒體", icon: Images },
    ],
  },
  {
    title: "商務與權限",
    description: "商品、交易與會員服務",
    items: [
      { href: "/admin/plans", label: "商品與交付", icon: Notebook },
      { href: "/admin/orders", label: "訂單與對帳", icon: Receipt },
      { href: "/admin/members", label: "會員與權限", icon: Users },
      { href: "/admin/marketplace", label: "Portaly 商城", icon: Storefront },
      { href: "/admin/discord", label: "Discord", icon: DiscordLogo },
    ],
  },
  {
    title: "成效與分發",
    description: "觀察使用與 Agent 存取",
    items: [
      { href: "/admin/analytics", label: "成效分析", icon: ChartLineUp },
      { href: "/admin/tracking", label: "使用者活動", icon: Users },
      { href: "/admin/api-keys", label: "Agent API 金鑰", icon: Key },
    ],
  },
  {
    title: "系統維運",
    description: "排查、設定與稽核",
    items: [
      { href: "/admin/system", label: "系統狀態", icon: Gear },
      { href: "/admin/webhooks", label: "Webhook 與交付", icon: WebhooksLogo },
      { href: "/admin/services", label: "外部服務", icon: Plugs },
      { href: "/admin/audit", label: "操作紀錄", icon: ClipboardText },
    ],
  },
];

export function isAdminNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
