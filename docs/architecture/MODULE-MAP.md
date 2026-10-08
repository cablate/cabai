# Module Map

> 用途：讓維護者快速找到每個責任的實際 owner、consumer 與修改風險。
>
> 原始導覽核對：2026-07-15。2026-10-08 移除過時數量；此圖僅作定位，現行行為須讀 source，route 邊界以 check:api-route-boundaries 驗證。

## Application surfaces

| 模組 | 主要責任 | 主要 consumer／入口 | 狀態與注意事項 |
| --- | --- | --- | --- |
| `src/app/(public)` | discovery、product、preview、login/result、legal/community/setup | 訪客與搜尋引擎 | `products/page.tsx` 有read-path sync副作用 |
| `src/app/(protected)` | dashboard、typed delivery、course/lesson/progress、settings | Auth.js會員 | access與course access是核心依賴 |
| `src/app/admin` | Plan、Presentation、Delivery、course、orders/members/media/integrations/ops | DB-authoritative admin | Course CRUD／archive actions 已改為 service adapter；其他 admin domain 仍需個別確認 |
| `src/app/api` | HTTP adapters | browser、provider、Agent、cron、service | shared handler／exact exceptions 以 `scripts/check-api-route-boundaries.ts` 與 registry 為準 |
| `src/middleware.ts` | protected/admin login redirect | Next.js request pipeline | 不負責authoritative admin role或resource access |

## Domain owners

| Owner | 目前責任 | 已知 consumer | 風險／缺口 |
| --- | --- | --- | --- |
| `src/lib/queries/course-catalog.ts` | published course/catalog read model | public/member/Agent read paths | 保持side-effect-free |
| `src/lib/services/course-service.ts` | typed Course CRUD／archive／unarchive、active-purchase delete guard、audit | Admin actions、Agent routes、Agent lifecycle | canonical Course mutation owner；publish／outline 由專用 owner 負責 |
| `src/lib/delivery.ts` | delivery overview與primary action | dashboard/member delivery | runtime caller未傳`offeringType`，type-specific action branch未生效 |
| `src/lib/access.ts` | Plan entitlement、provider fallback/self-heal | checkout/product/assets/course/Agent | 使用shared evaluator與provider owner/plan fail-closed；修改blast radius高 |
| `src/lib/course-access.ts` | active/grandfather course mapping | course/lesson/assets/Agent | 需維持purchase-time與removedAt invariant |
| `src/lib/order-lifecycle.ts` | order CAS completion與purchase transition/repair | callback/reconciliation | 透過`entitlement-transitions.ts`原子寫purchase與outbox |
| `src/lib/payment-confirmation.ts` | amount/currency/customer/order evidence | callback | 任何放寬需contract evidence |
| `src/lib/entitlement-transitions.ts` | grant/revoke/subscription state與outbox transaction owner | callback、repair、free claim、Admin/Agent、Marketplace、reconciliation | deterministic idempotency；新增mutation入口不得旁路 |
| `src/lib/entitlement-outbox-processor.ts` | transition claim、consumer marker、retry/DLQ、expiry sweep | webhook-outbox job、Admin retry | Discord以current desired state收斂；完整歷史snapshot是P2選項 |
| `src/lib/subscription-state.ts` | provider lifecycle欄位正規化與paid-through fallback | callback completion、cancel/resume、self-heal、rebuild、reconciliation | `cancelEffectiveAt ?? nextBillingAt`；缺boundary fail closed |
| `src/lib/reconcile-subscriptions.ts` | subscription polling與shared transition | scheduled job/cron/Admin/Agent | advisory job lock；provider identity與stale policy須保持一致 |
| `src/lib/webhook-outbox.ts` | service webhook enqueue/idempotency與domain outbox job orchestration | entitlement processor、callback/reconciliation | external receiver仍需依event ID去重 |
| `src/lib/webhook-processor.ts` | claim lease、delivery、retry/DLQ | job/cron | at-least-once；receiver必須去重 |
| `src/lib/course-publish.ts` | readiness、revision、publish transaction | Admin/course flows | readiness snapshot在transaction外，並行編輯風險 |

## Platform owners

| Owner | 責任 | Invariants／限制 |
| --- | --- | --- |
| `src/lib/api-route.ts` | JSON envelope、request ID、5xx capture | 特殊raw callback、redirect、stream、Auth、assets不可強制套用 |
| `src/lib/admin-guard.ts` / `admin-action-guard.ts` | DB role recheck、admin action policy | 不只信任JWT role |
| `src/lib/agent-auth.ts` / `user-auth.ts` | API key/token驗證 | DB只存hash；user token只限既定scope |
| `src/lib/config/platform.ts` | core/optional capability inspection | selectors已與runtime key對齊；Doctor仍不是external connectivity test |
| `src/lib/storage` | local/R2 upload/read/delete contract | media registry/access不在adapter內 |
| `src/lib/jobs` | registry、schedule、lock、ledger、freshness、alert | scheduler與backup writer只能有一個owner |
| `src/lib/database-backup` | stream、manifest、sink、retention、restore guards | 不備份object binary、不建立/drop target DB |
| `src/lib/observability` | allowlisted event/Sentry scrub | Sentry optional；整份platform log不保證自動redact |
| `src/lib/rate-limit.ts` | per-process limiter與client IP selection | cold start reset、replica不共享、信任proxy header |

## API families

| Family | 認證 | 例子 | 修改前閱讀 |
| --- | --- | --- | --- |
| Browser/public/member | none或Auth.js | checkout、portal、subscriptions、track | request guard、rate limit、access |
| Admin | Auth.js + DB role | `/api/admin/**` | admin guard、audit、action limiter |
| Agent | DB-issued key/token + scope | `/api/agent/**` | OpenAPI、agent permissions、typed services |
| Provider callback | HMAC／freshness | callback、marketplace | raw body/signature、provider response contract |
| Cron/health | Bearer secret | `/api/cron/**`、detailed health | job registry、freshness、capability config |
| Service entitlement | `x-service-key` | `/api/entitlements/**` | plan binding、PII、webhook signing |
| Storage/assets | signed URL或entitlement | upload、assets、local storage | concealment、path containment、expiry |

Exact list由 `scripts/check-api-route-boundaries.ts` 與 `docs/contracts/api-route-boundaries.json` 管理；不要手工猜測 exception。

## 高變更／高集中模組

以下是**修改審查提示，不是單以行數判定缺陷**：

- `src/components/offerings/offering-detail-sections.tsx`：七種Offering展示分支集中。
- `src/lib/portaly-purchase-import.ts`：provider資料轉換與import流程集中。
- `src/lib/db/schema.ts`：多個 domain 的資料表共存；精確 schema 與 migration 以原始碼為準。
- marketplace manager、Admin course actions、course service、dashboard、lesson editor、Agent OpenAPI builder、callback route均屬大型變更面。

大檔案應先以domain invariant與contract切分，不為追求較短檔案機械拆分。

## Legacy、disconnected 與重疊入口

| 項目 | 判斷 | 處理原則 |
| --- | --- | --- |
| `/content/[productId]`、`/my` | Legacy redirect | 保留相容直到流量／連結證據允許退場 |
| `/admin/products` | Inferred legacy overlap | owner決定後才移除或正式支持 |
| `ManageSubscriptionButton` | disconnected source definition | 先確認產品需求與consumer再處理 |
| 舊 `HeroSection`／`StatsSection` | no source reference found | 不等同安全刪除；先做build/reference查核 |
| `scripts/pre-deploy.sh` | Deprecated/retired | 不恢復為migration入口 |
| `scripts/push-schema.ts`、`sync-content.mjs`、`upload-chapter.js`、`publish-resource.mjs` | Retired, fail-closed stubs | Exit 2 without data/network changes; use scoped Admin/Agent APIs or the PostgreSQL migration runner instead |
| `vercel.json` | stale deployment config | owner決定Vercel是否退役 |

## 修改導航

- 付款／授權：先讀 `DATA-AND-FLOWS.md`、callback contract、order/access tests。
- 新Offering：先讀商品／會員 routes、validation schema、Offering detail 與 delivery service，再補對應的展示、結帳及交付測試。
- Admin/Agent mutation：確認是否共用同一service與audit／confirmation。
- Jobs／backup／health：先讀[部署與維運](../operations/DEPLOYMENT-AND-OPERATIONS.md)與對應規格。
- API handler：先跑`npm run check:api-route-boundaries`，確認是否intentional exception。

本文件在domain owner、route family、主要consumer、legacy狀態或高風險責任轉移時更新。
