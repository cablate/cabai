import Link from "next/link";
import { notFound } from "next/navigation";
import { ReleaseForm } from "@/components/admin/skills/admin-skill-forms";
import { getAdminSkillProjection } from "@/lib/services/skill-release-service";

export default async function NewReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await getAdminSkillProjection(id);
  if (!skill.ok && skill.kind === "not-found") notFound();
  if (!skill.ok) return <div role="alert" className="text-danger">{skill.message}</div>;
  return (
    <div className="space-y-6">
      <Link prefetch={false} href={`/admin/skills/${id}`} className="text-sm font-medium text-accent hover:text-success">← {skill.value.skill.title}</Link>
      <header><h1 className="text-2xl font-semibold text-text-primary">新增 Release</h1><p className="mt-1 text-sm text-text-secondary">建立後再上傳並確認 artifact。</p></header>
      <section className="rounded-lg border border-border-subtle bg-surface p-6"><ReleaseForm skillId={id} /></section>
    </div>
  );
}
