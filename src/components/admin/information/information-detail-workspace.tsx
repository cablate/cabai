import Link from "next/link";
import {
  ArrowLeft,
  ArrowSquareOut,
  CheckCircle,
  ClockCounterClockwise,
  LinkSimple,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { InformationDraftForm, InformationLifecycleForm } from "./information-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader } from "@/components/ui/page-header";
import type {
  AgentInformationEvent,
  AgentInformationItem,
} from "@/lib/db/schema";
import type { InformationSourceBundle } from "@/lib/information-sources";
import type {
  InformationQualityHint,
  InformationSourceDestination,
  ResolvedInformationActionPath,
} from "@/lib/information-admin-detail";
import type {
  DomainResult,
  ReadinessResult,
} from "@/lib/services/library-skill-information-domain";

type SimpleResult<T> = { ok: true; value: T } | { ok: false; message: string };

const sourceLabels = {
  manual_announcement: "一般公告",
  library_entry: "Library 資源",
  skill_release: "Skill Release",
  course: "課程",
  api_operation: "Agent API operation",
} as const;

const audienceLabels = {
  all_users: "所有使用者",
  source_entitled: "具內容權限者",
} as const;

const statusMeta = {
  draft: { label: "草稿", variant: "warning" },
  published: { label: "已發布", variant: "success" },
  withdrawn: { label: "已撤回", variant: "default" },
} as const;

const readinessLabels: Record<string, string> = {
  required: "缺少必要內容",
  invalid_format: "格式不正確",
  possible_secret: "疑似包含敏感資訊",
  stale_source: "來源已變更或無法使用",
  invalid_materiality: "種類與來源不相容",
  invalid_audience: "閱讀對象不相容",
  broken_action: "Agent action 已失效",
  action_tampered: "Agent action 與 canonical 定義不同",
  duplicate_information: "存在重複 Information",
};

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(value: Date | null): string {
  return value ? dateFormatter.format(value) : "—";
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-5">
      <p className="text-xs font-semibold tracking-[0.14em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
    </header>
  );
}

function PathCard({
  label,
  method,
  path,
  href,
  note,
}: {
  label: string;
  method?: string;
  path: string;
  href?: string;
  note?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border-subtle bg-surface-muted/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {href && (
          <Link prefetch={false}
            href={href}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-accent transition-colors hover:bg-surface-hover hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            前往
            <ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
          </Link>
        )}
      </div>
      <code className="mt-2 block break-all text-xs leading-5 text-text-secondary">
        {method ? `${method} ` : ""}{path}
      </code>
      {note && <p className="mt-2 text-xs leading-5 text-text-muted">{note}</p>}
    </div>
  );
}

function VersionItem({
  item,
  currentId,
}: {
  item: AgentInformationItem;
  currentId: string;
}) {
  const meta = statusMeta[item.status];
  return (
    <li className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            {item.id === currentId && <Badge variant="info">目前查看</Badge>}
          </div>
          <Link prefetch={false}
            href={`/admin/information/${item.id}`}
            className="mt-2 block font-semibold text-text-primary hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {item.title}
          </Link>
          <p className="mt-1 break-all font-mono text-xs text-text-muted">
            sourceVersion: {item.sourceVersion}
          </p>
        </div>
        <div className="text-right text-xs leading-5 text-text-muted">
          <p>Information revision {item.revision}</p>
          <p>{formatDate(item.updatedAt)}</p>
        </div>
      </div>
    </li>
  );
}

export interface InformationDetailWorkspaceProps {
  item: AgentInformationItem;
  source: DomainResult<InformationSourceBundle>;
  readiness: DomainResult<ReadinessResult>;
  stats: DomainResult<{
    eligible: number;
    read: number;
    unread: number;
    calculatedAt: Date;
  }>;
  history: SimpleResult<AgentInformationEvent[]>;
  siblings: SimpleResult<AgentInformationItem[]>;
  destinations: SimpleResult<InformationSourceDestination[]>;
  actionPaths: {
    resolved: ResolvedInformationActionPath[];
    unresolvedCount: number;
  };
  qualityHints: InformationQualityHint[];
  currentPublished: AgentInformationItem[];
  otherItems: AgentInformationItem[];
  publishIdempotencyKey: string;
  withdrawIdempotencyKey: string;
  now: Date;
}

export function InformationDetailWorkspace({
  item,
  source,
  readiness,
  stats,
  history,
  siblings,
  destinations,
  actionPaths,
  qualityHints,
  currentPublished,
  otherItems,
  publishIdempotencyKey,
  withdrawIdempotencyKey,
  now,
}: InformationDetailWorkspaceProps) {
  const status = statusMeta[item.status];
  const ready = readiness.ok && readiness.value.ready;
  const currentlyVisibleToUser = item.status === "published"
    && (!item.expiresAt || item.expiresAt > now);

  return (
    <div className="space-y-8">
      <Link prefetch={false}
        href="/admin/information"
        className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-text-secondary transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft size={17} weight="bold" aria-hidden="true" />
        回到 Information 管理
      </Link>

      <PageHeader
        eyebrow="INFORMATION 詳情"
        title={item.title}
        description={`${sourceLabels[item.sourceType]} · Information revision ${item.revision}`}
        actions={<Badge variant={status.variant}>{status.label}</Badge>}
        className="mb-0"
      />

      <Card padding="md">
        <SectionHeading
          eyebrow="01 / CONTENT"
          title="內容"
          description="先確認使用者與 Agent 實際會讀到的內容，再進行發布判斷。"
        />
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">種類</dt>
            <dd className="mt-1 font-mono text-text-primary">{item.kind}</dd>
          </div>
          <div>
            <dt className="text-text-muted">標籤</dt>
            <dd className="mt-1 text-text-primary">
              {item.tags.length > 0 ? item.tags.join("、") : "未設定"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-text-muted">摘要</dt>
            <dd className="mt-1 leading-7 text-text-primary">{item.summary}</dd>
          </div>
          {item.whyItMatters && (
            <div className="sm:col-span-2">
              <dt className="text-text-muted">為什麼重要</dt>
              <dd className="mt-1 leading-7 text-text-secondary">{item.whyItMatters}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 border-t border-border-subtle pt-6">
          <h3 className="text-sm font-semibold text-text-primary">完整內文</h3>
          {item.bodyMarkdown ? (
            <div className="mt-4 rounded-lg bg-surface-muted/50 p-4 sm:p-6">
              <Markdown content={item.bodyMarkdown} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-text-muted">目前沒有完整內文。</p>
          )}
        </div>

        {item.status === "draft" && source.ok && (
          <details className="mt-6 rounded-lg border border-border-subtle bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-text-primary hover:bg-surface-hover">
              編輯草稿
            </summary>
            <div className="border-t border-border-subtle p-4 sm:p-6">
              <InformationDraftForm
                key={item.revision}
                bundle={source.value}
                draft={{
                  id: item.id,
                  revision: item.revision,
                  kind: item.kind,
                  title: item.title,
                  summary: item.summary,
                  whyItMatters: item.whyItMatters,
                  bodyMarkdown: item.bodyMarkdown,
                  tags: item.tags,
                  expiresAt: item.expiresAt
                    ? new Date(item.expiresAt.getTime() - item.expiresAt.getTimezoneOffset() * 60_000)
                        .toISOString()
                        .slice(0, 16)
                    : "",
                  actions: item.actions,
                }}
              />
            </div>
          </details>
        )}
        {item.status === "draft" && !source.ok && (
          <Alert variant="danger" className="mt-6">
            <WarningCircle size={18} weight="fill" aria-hidden="true" />
            <AlertTitle>來源無法載入，草稿暫時不能編輯</AlertTitle>
            <AlertDescription>{source.message}</AlertDescription>
          </Alert>
        )}
        {item.status !== "draft" && (
          <p className="mt-6 rounded-lg bg-surface-muted px-4 py-3 text-sm text-text-secondary">
            已發布或已撤回的 Information 不可原地編輯；需要調整時請建立新的來源版本或新公告。
          </p>
        )}
      </Card>

      <Card padding="md">
        <SectionHeading
          eyebrow="02 / PUBLISH"
          title="發布與 readiness"
          description="Canonical readiness 決定能否發布；品質提示只協助人工檢查，不會改變狀態。"
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg bg-surface-muted p-4">
            <p className="text-xs text-text-muted">狀態</p>
            <p className="mt-1 font-semibold text-text-primary">{status.label}</p>
          </div>
          <div className="rounded-lg bg-surface-muted p-4">
            <p className="text-xs text-text-muted">發布時間</p>
            <p className="mt-1 text-sm text-text-primary">{formatDate(item.publishedAt)}</p>
          </div>
          <div className="rounded-lg bg-surface-muted p-4">
            <p className="text-xs text-text-muted">到期時間</p>
            <p className="mt-1 text-sm text-text-primary">{formatDate(item.expiresAt)}</p>
          </div>
          <div className="rounded-lg bg-surface-muted p-4">
            <p className="text-xs text-text-muted">撤回時間</p>
            <p className="mt-1 text-sm text-text-primary">{formatDate(item.withdrawnAt)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="readiness-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="readiness-heading" className="font-semibold text-text-primary">Canonical readiness</h3>
              <Badge variant={ready ? "success" : "danger"}>{ready ? "已就緒" : "尚未就緒"}</Badge>
            </div>
            {!readiness.ok ? (
              <Alert variant="danger" className="mt-3">
                <WarningCircle size={18} weight="fill" aria-hidden="true" />
                <AlertTitle>readiness 無法檢查</AlertTitle>
                <AlertDescription>{readiness.message}</AlertDescription>
              </Alert>
            ) : readiness.value.issues.length === 0 ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-success-light p-4 text-sm text-success">
                <CheckCircle size={19} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                <p>Canonical readiness 未回報阻擋問題。</p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {readiness.value.issues.map((issue, index) => (
                  <li
                    key={`${issue.code}:${issue.field}:${index}`}
                    className="rounded-lg border border-border-subtle bg-surface-muted p-3 text-sm"
                  >
                    <p className="font-medium text-text-primary">
                      {readinessLabels[issue.code] ?? "發布條件需要處理"}
                    </p>
                    <p className="mt-1 text-text-secondary">{issue.message}</p>
                    <p className="mt-2 break-all font-mono text-xs text-text-muted">
                      {issue.severity} · {issue.field} · {issue.code}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="quality-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="quality-heading" className="font-semibold text-text-primary">品質提示</h3>
              <Badge variant={qualityHints.length > 0 ? "warning" : "success"}>
                {qualityHints.length > 0 ? `${qualityHints.length} 項待確認` : "未見明顯問題"}
              </Badge>
            </div>
            {qualityHints.length === 0 ? (
              <p className="mt-3 rounded-lg bg-surface-muted p-4 text-sm leading-6 text-text-secondary">
                未偵測到明顯品質問題；這不代表內容已完成人工審稿或外部連結驗證。
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {qualityHints.map((hint) => (
                  <li key={hint.code} className="rounded-lg border border-warning/25 bg-warning-light p-3 text-sm text-warning">
                    <p className="font-semibold">{hint.title}</p>
                    <p className="mt-1 leading-6">{hint.description}</p>
                    {hint.fields && hint.fields.length > 0 && (
                      <p className="mt-2 font-mono text-xs">欄位：{hint.fields.join(", ")}</p>
                    )}
                    {hint.relatedInformationIds && hint.relatedInformationIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {hint.relatedInformationIds.map((id) => (
                          <Link prefetch={false} key={id} href={`/admin/information/${id}`} className="font-mono text-xs underline">
                            查看 {id}
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-6 border-t border-border-subtle pt-6">
          {item.status === "draft" && source.ok && source.value.requiresBundlePublish && (
            <Alert variant="info">
              <LinkSimple size={18} weight="bold" aria-hidden="true" />
              <AlertTitle>請從來源頁完成原子發布</AlertTitle>
              <AlertDescription>
                這筆 Information 由來源 bundle 管理，不能在此單獨發布。
              </AlertDescription>
            </Alert>
          )}
          {item.status === "draft" && source.ok && !source.value.requiresBundlePublish && ready && (
            <InformationLifecycleForm
              kind="publish"
              id={item.id}
              revision={item.revision}
              idempotencyKey={publishIdempotencyKey}
            />
          )}
          {item.status === "draft" && (!source.ok || !ready) && (
            <p className="text-sm text-text-muted">請先處理 readiness 問題，發布操作才會開放。</p>
          )}
          {item.status === "published" && (
            <InformationLifecycleForm
              kind="withdraw"
              id={item.id}
              revision={item.revision}
              idempotencyKey={withdrawIdempotencyKey}
            />
          )}
          {item.status === "withdrawn" && (
            <p className="text-sm text-text-muted">這筆 Information 已撤回並維持 immutable。</p>
          )}
        </div>
      </Card>

      <Card padding="md">
        <SectionHeading
          eyebrow="03 / ACCESS"
          title="來源與存取路徑"
          description="路徑由現有 route、OpenAPI operation 與 durable identifier 推導，不需人工拼接。"
        />
        <dl className="grid gap-4 rounded-lg bg-surface-muted p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">來源類型</dt>
            <dd className="mt-1 text-text-primary">{sourceLabels[item.sourceType]}</dd>
          </div>
          <div>
            <dt className="text-text-muted">閱讀對象</dt>
            <dd className="mt-1 text-text-primary">{audienceLabels[item.audience]}</dd>
          </div>
          <div>
            <dt className="text-text-muted">來源 ID</dt>
            <dd className="mt-1 break-all font-mono text-xs text-text-primary">{item.sourceId}</dd>
          </div>
          <div>
            <dt className="text-text-muted">保存的 sourceVersion</dt>
            <dd className="mt-1 break-all font-mono text-xs text-text-primary">{item.sourceVersion}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Canonical 來源狀態</dt>
            <dd className="mt-1 text-text-primary">{source.ok ? source.value.sourceStatus : "無法確認"}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Canonical sourceVersion</dt>
            <dd className="mt-1 break-all font-mono text-xs text-text-primary">
              {source.ok ? source.value.sourceVersion : "無法確認"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {item.status === "published" && item.audience === "all_users" && (
            <PathCard
              label="Information 公開頁"
              path="/information"
              href="/information"
              note="目前是公告列表與側欄閱讀，尚無單篇固定網址。"
            />
          )}
          <PathCard
            label="Admin Agent API"
            method="GET"
            path={`/api/agent/information/${encodeURIComponent(item.id)}`}
            note="需要具 information:read 權限的 Admin Agent key。"
          />
          {currentlyVisibleToUser && (
            <PathCard
              label="User Agent API"
              method="GET"
              path={`/api/agent/user/v1/information/${encodeURIComponent(item.id)}`}
              note={item.audience === "source_entitled"
                ? "User key 仍須通過來源 entitlement 檢查。"
                : "需要具 information:read 權限的 User Agent key。"}
            />
          )}
          {destinations.ok ? destinations.value.map((destination) => (
            <PathCard
              key={`${destination.kind}:${destination.href}`}
              label={destination.label}
              path={destination.href}
              href={destination.href}
            />
          )) : (
            <Alert variant="warning">
              <WarningCircle size={18} weight="fill" aria-hidden="true" />
              <AlertTitle>來源頁路徑無法解析</AlertTitle>
              <AlertDescription>{destinations.message}</AlertDescription>
            </Alert>
          )}
          {actionPaths.resolved.map((action) => (
            <PathCard
              key={`${action.rel}:${action.operationId}`}
              label={`Canonical action：${action.rel}`}
              method={action.method}
              path={action.path}
              note={`${action.operationId} · credential: ${action.credential}`}
            />
          ))}
        </div>
        {item.actions.length === 0 && (
          <p className="mt-4 text-sm text-text-muted">這筆 Information 沒有 action；來源規則可能允許純公告。</p>
        )}
        {actionPaths.unresolvedCount > 0 && (
          <p role="alert" className="mt-4 text-sm text-warning">
            有 {actionPaths.unresolvedCount} 個 action 無法對應目前 OpenAPI，因此未顯示推測路徑。
          </p>
        )}
      </Card>

      <Card padding="md">
        <SectionHeading
          eyebrow="04 / HISTORY"
          title="版本歷史與統計"
          description="Information revision、來源版本與 lifecycle event 是不同概念，分開呈現避免誤判。"
        />
        {stats.ok ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["符合對象", stats.value.eligible],
              ["已讀", stats.value.read],
              ["未讀", stats.value.unread],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-surface-muted p-4 text-center">
                <p className="text-xs text-text-muted">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{value}</p>
              </div>
            ))}
            <p className="text-xs text-text-muted sm:col-span-3">
              統計時間：{formatDate(stats.value.calculatedAt)}；只顯示聚合數字，不包含使用者名單。
            </p>
          </div>
        ) : (
          <Alert variant="warning">
            <WarningCircle size={18} weight="fill" aria-hidden="true" />
            <AlertTitle>閱讀統計無法載入</AlertTitle>
            <AlertDescription>{stats.message}</AlertDescription>
          </Alert>
        )}

        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          <section aria-labelledby="source-version-heading">
            <div className="flex items-center gap-2">
              <ClockCounterClockwise size={20} weight="duotone" className="text-accent" aria-hidden="true" />
              <h3 id="source-version-heading" className="font-semibold text-text-primary">同來源項目</h3>
            </div>
            {!siblings.ok ? (
              <p role="alert" className="mt-3 text-sm text-danger">{siblings.message}</p>
            ) : (
              <>
                <h4 className="mt-4 text-sm font-medium text-text-secondary">目前發布中</h4>
                {currentPublished.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {currentPublished.map((candidate) => (
                      <VersionItem key={candidate.id} item={candidate} currentId={item.id} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">同來源目前沒有發布中的 Information。</p>
                )}
                <h4 className="mt-5 text-sm font-medium text-text-secondary">其他草稿與歷史項目</h4>
                {otherItems.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {otherItems.map((candidate) => (
                      <VersionItem key={candidate.id} item={candidate} currentId={item.id} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">沒有其他同來源項目。</p>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="lifecycle-history-heading">
            <h3 id="lifecycle-history-heading" className="font-semibold text-text-primary">這筆 Information 的生命週期</h3>
            <p className="mt-1 text-xs leading-5 text-text-muted">事件只記錄狀態轉換，不是可還原的內容快照。</p>
            {!history.ok ? (
              <p role="alert" className="mt-3 text-sm text-danger">{history.message}</p>
            ) : history.value.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">目前沒有生命週期轉換紀錄。</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {history.value.map((event) => (
                  <li key={event.id} className="border-l-2 border-border-strong pl-4 text-sm">
                    <p className="font-medium text-text-primary">
                      {event.fromStatus ? statusMeta[event.fromStatus].label : "建立"}
                      <span aria-hidden="true"> → </span>
                      {statusMeta[event.toStatus].label}
                    </p>
                    <p className="mt-1 text-text-secondary">
                      Information revision {event.revision} · {formatDate(event.createdAt)}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-text-muted">
                      {event.actorType}:{event.actorId}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}
