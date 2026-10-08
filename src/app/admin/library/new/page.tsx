import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { LibraryEditorForm } from "@/components/admin/library/library-editor-form";
import { PageHeader } from "@/components/ui/page-header";

export default function NewLibraryPage() {
  return (
    <div className="space-y-8">
      <div>
        <Link prefetch={false} href="/admin/library" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-success">
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          返回 Library
        </Link>
        <PageHeader
          title="建立 Library 草稿"
          description="先完成內容草稿；Information 必須在最後一次儲存內容後建立。"
          className="mb-0"
        />
      </div>
      <div className="rounded-2xl border border-border-subtle bg-surface p-6 md:p-8">
        <LibraryEditorForm />
      </div>
    </div>
  );
}
