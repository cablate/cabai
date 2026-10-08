import Link from "next/link";
import { LockKey } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { Button } from "../button";

export interface AccessDeniedStateProps {
  reason?: "not-logged-in" | "no-purchase" | "expired" | "revoked";
  planId?: string;
  className?: string;
}

const messages: Record<
  "not-logged-in" | "no-purchase" | "expired" | "revoked",
  {
    title: string;
    description: string;
    primaryLabel: string;
    secondaryLabel: string;
  }
> = {
  "not-logged-in": {
    title: "需要登入",
    description: "請登入以查看此內容",
    primaryLabel: "登入",
    secondaryLabel: "探索內容",
  },
  "no-purchase": {
    title: "需要購買此內容",
    description: "完成購買後，內容會出現在會員中心",
    primaryLabel: "購買",
    secondaryLabel: "查看其他內容",
  },
  expired: {
    title: "此內容已過期",
    description: "購買或訂閱已結束",
    primaryLabel: "續購",
    secondaryLabel: "查看其他內容",
  },
  revoked: {
    title: "此內容已被移除",
    description: "您的存取權限已被撤銷",
    primaryLabel: "返回會員中心",
    secondaryLabel: "查看其他內容",
  },
};

export function AccessDeniedState({
  reason = "no-purchase",
  planId,
  className,
}: AccessDeniedStateProps) {
  const message = messages[reason];

  const getPrimaryHref = () => {
    switch (reason) {
      case "not-logged-in":
        return "/auth/signin";
      case "no-purchase":
      case "expired":
        return planId ? `/products/${planId}` : "/products";
      case "revoked":
        return "/dashboard";
      default:
        return "/products";
    }
  };

  const getSecondaryHref = () => {
    switch (reason) {
      case "not-logged-in":
        return "/products";
      default:
        return "/products";
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-muted text-text-muted">
        <LockKey size={24} weight="duotone" />
      </div>
      <h2 className="text-2xl font-semibold text-text-primary">{message.title}</h2>
      <p className="mt-2 text-text-muted max-w-md">{message.description}</p>

      <div className="mt-6 flex gap-3 flex-wrap justify-center">
        <Button asChild>
          <Link prefetch={false} href={getPrimaryHref()}>{message.primaryLabel}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link prefetch={false} href={getSecondaryHref()}>{message.secondaryLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
