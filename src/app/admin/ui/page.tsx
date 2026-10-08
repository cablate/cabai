import { Info } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FormErrorSummary, FormSaveStatus } from "@/components/ui/form-feedback";
import { DataTableCatalog } from "./data-table-catalog";

const sections = [
  { id: "actions", title: "操作元件", description: "按鈕樣式、尺寸與非同步狀態。" },
  { id: "forms", title: "表單", description: "原生表單控制、說明與錯誤關聯。" },
  { id: "tables", title: "資料表格", description: "桌面、手機、載入、空白與錯誤狀態。" },
  { id: "status", title: "狀態顯示", description: "不只依賴顏色的狀態文字。" },
  { id: "interaction", title: "互動元件", description: "鍵盤可操作的分頁與提示元件。" },
] as const;

export default function UiCatalogPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="介面元件"
        description="CabAI 共用元件的實際樣式、狀態與鍵盤互動目錄。"
      />

      <nav aria-label="元件分類" className="flex flex-wrap gap-2 border-b border-border pb-4">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="text-sm text-text-secondary hover:text-accent">
            {section.title}
          </a>
        ))}
      </nav>

      <CatalogSection {...sections[0]}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>主要操作</Button>
          <Button variant="secondary">次要操作</Button>
          <Button variant="danger">破壞性操作</Button>
          <Button variant="ghost">低強度操作</Button>
          <Button loading>處理中</Button>
          <Button disabled>不可使用</Button>
        </div>
      </CatalogSection>

      <CatalogSection {...sections[1]}>
        <div className="space-y-6">
          <FormErrorSummary
            feedback={{ error: "部分欄位需要修正。", fieldErrors: { catalogName: ["顯示名稱不能為空"] } }}
            fieldLabels={{ catalogName: "顯示名稱" }}
          />
          <div className="grid gap-5 md:grid-cols-2">
          <Input id="catalogName" label="顯示名稱" helperText="會顯示在會員可見的內容中。" defaultValue="CabAI" />
          <Input label="API Key" error="API Key 格式不正確。" defaultValue="invalid" />
          <Select label="內容狀態" defaultValue="draft">
            <option value="draft">草稿</option>
            <option value="published">已發佈</option>
          </Select>
          <Textarea label="內容說明" helperText="建議保持在 120 字以內。" defaultValue="用具體文字說明交付內容。" />
          <CheckboxField name="catalog-preview" label="允許免費預覽" defaultChecked />
          <CheckboxField name="catalog-disabled" label="停用的選項" disabled />
          </div>
          <div className="flex flex-wrap gap-4 border-t border-border-subtle pt-5">
            <FormSaveStatus state="dirty" />
            <FormSaveStatus state="saving" />
            <FormSaveStatus state="saved" />
            <FormSaveStatus state="failed" />
            <FormSaveStatus state="conflict" />
          </div>
        </div>
      </CatalogSection>

      <CatalogSection {...sections[2]}>
        <DataTableCatalog />
      </CatalogSection>

      <CatalogSection {...sections[3]}>
        <div className="flex flex-wrap gap-3">
          <Badge>一般</Badge>
          <StatusBadge status="success">已完成</StatusBadge>
          <StatusBadge status="warning">等待處理</StatusBadge>
          <StatusBadge status="danger">處理失敗</StatusBadge>
          <StatusBadge status="info">同步中</StatusBadge>
        </div>
      </CatalogSection>

      <CatalogSection {...sections[4]}>
        <Tabs defaultValue="keyboard">
          <TabsList aria-label="互動示例">
            <TabsTrigger value="keyboard">鍵盤</TabsTrigger>
            <TabsTrigger value="focus">焦點</TabsTrigger>
          </TabsList>
          <TabsContent value="keyboard" className="pt-4 text-sm text-text-secondary">
            使用左右方向鍵切換頁籤。
          </TabsContent>
          <TabsContent value="focus" className="pt-4 text-sm text-text-secondary">
            所有操作都保留清楚的 focus-visible 樣式。
          </TabsContent>
        </Tabs>
        <div className="mt-5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" aria-label="查看元件說明">
                <Info size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>支援 hover、focus 與 Escape 關閉</TooltipContent>
          </Tooltip>
        </div>
      </CatalogSection>
    </div>
  );
}

function CatalogSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card>
        <div className="border-b border-border-subtle p-6">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="text-sm text-text-secondary">{description}</p>
        </div>
        <div className="p-6">{children}</div>
      </Card>
    </section>
  );
}
