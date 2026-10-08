import Link from "next/link";
import { SkillForm } from "@/components/admin/skills/admin-skill-forms";

export default function NewSkillPage() {
  return (
    <div className="space-y-6">
      <Link prefetch={false} href="/admin/skills" className="text-sm font-medium text-accent hover:text-success">← Skills</Link>
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">新增 Skill</h1>
        <p className="mt-1 text-sm text-text-secondary">先建立 metadata 草稿；發布會在 Release 詳情完成。</p>
      </header>
      <section className="rounded-lg border border-border-subtle bg-surface p-6"><SkillForm /></section>
    </div>
  );
}
