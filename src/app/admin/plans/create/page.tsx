import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { CreatePlanForm } from "./create-plan-form";

export default function CreatePlanPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link prefetch={false}
          href="/admin/plans"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-success"
        >
          <ArrowLeft size={16} weight="bold" />
          返回 Plans
        </Link>
        <PageHeader
          title="新增方案"
          description="建立方案後可選擇同步到 Portaly Vibe 或僅本地管理"
        />
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface p-8">
        <CreatePlanForm />
      </div>
    </div>
  );
}
