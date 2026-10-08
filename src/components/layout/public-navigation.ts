export interface PublicContentAvailability {
  library: boolean;
  skills: boolean;
}

export type PublicNavKey = "home" | "products" | "library" | "skills" | "information" | "community";
export type PublicNavSection = "primary" | "discover" | "connect";

export interface PublicNavItem {
  key: PublicNavKey;
  href: string;
  label: string;
  description: string;
  section: PublicNavSection;
}

export function buildPublicNavItems(
  availability: PublicContentAvailability,
): PublicNavItem[] {
  return [
    {
      key: "home",
      href: "/",
      label: "首頁",
      description: "認識 CabAI Knowledge Hub",
      section: "primary",
    },
    {
      key: "products",
      href: "/products",
      label: "課程與內容",
      description: "瀏覽課程、活動、下載與服務",
      section: "discover",
    },
    ...(availability.library
      ? [{
          key: "library" as const,
          href: "/library",
          label: "Library",
          description: "公開文章、指南與參考資料",
          section: "discover" as const,
        }]
      : []),
    ...(availability.skills
      ? [{
          key: "skills" as const,
          href: "/skills",
          label: "Skills",
          description: "可以交給 AI 採用的工作方法",
          section: "discover" as const,
        }]
      : []),
    {
      key: "information",
      href: "/information",
      label: "最新消息",
      description: "平台公告、更新與新內容入口",
      section: "connect",
    },
    {
      key: "community",
      href: "/community",
      label: "社群",
      description: "加入 Discord，延續學習與實作討論",
      section: "connect",
    },
  ];
}

export function publicNavItemIsActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
