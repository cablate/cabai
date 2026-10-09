# Configuration

這份文件整理架站需要的設定。第一次試用先照 [開始使用](GETTING-STARTED.md)操作；要換網站名稱、啟用登入或連接外部服務時，再查下面對應的項目。

## Configuration authority

- 範例與操作者入口：`.env.example`
- Typed inspection：`src/lib/config/platform.ts`
- Human/JSON diagnosis：`scripts/doctor.ts`
- Runtime selection：各adapter與`src/instrumentation.node.ts`
- Deployment injection：部署平台／container／secret manager，不進Git或image

Doctor 會找出缺少、格式錯誤或互相衝突的設定。設定通過後，再實際登入或送出測試請求，確認服務可用。

## Shared branding: one codebase, different public assets

### What belongs to your installation?

| Kind | Where it belongs |
|---|---|
| Project name, license and contributor links | Keep the CabAI project information in the repository; it is not your site's configuration. |
| Your site's name, description and public images | Set the branding variables below and provide your public assets before building. |
| Your service accounts and secrets | Use your private environment file or hosting secret store. Never put credentials in `NEXT_PUBLIC_*` values. |
| Courses, members, purchases and private files | Use the application's database and storage, not source files or Git. |

Start with the local demo profile and leave optional integrations empty. Add your own Google client when you need member login; add payment, mail, Discord or external storage only when you intend to use them. A successful Doctor check validates configuration, not a completed OAuth login or a delivered email.

修改下列設定就能換上自己的名稱和圖片，不需要改元件。這些值在**建置時**寫入網頁，修改後請重新建置：

| Variable | Default / purpose |
|---|---|
| `NEXT_PUBLIC_SITE_NAME` / `NEXT_PUBLIC_SITE_INITIAL` | Default site name / initial |
| `NEXT_PUBLIC_CREATOR_NAME` / `NEXT_PUBLIC_CREATOR_URL` | Default creator identity |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | Neutral description; at most 300 characters |
| `NEXT_PUBLIC_SITE_LOGO` | `/oss/icon.svg`; desktop/mobile logo, metadata icon, organization logo and web manifest |
| `NEXT_PUBLIC_SITE_SOCIAL_IMAGE` | `/oss/social.png`; default Open Graph / Twitter image, preferably 1200×630 |
| `NEXT_PUBLIC_SITE_ILLUSTRATION` | `/oss/learning.svg`; homepage illustration fallback, not course-specific covers |

Assets must be same-origin static paths, such as `/site/logo.png`. Supported extensions: svg/png/webp/jpg/jpeg/ico. Remote URLs, API paths, traversal, encoded paths, query strings and credentials are rejected. Serve externally stored branding through a same-origin static/CDN route if needed; this change does not widen image/CSP host permissions or fetch remote content.

For a local build, place **public, rights-cleared images only** in ignored `public/site/`, set the variables and rebuild. For Docker, the reference Compose forwards these public values as builder arguments; supply them to the Compose interpolation environment (`--env-file`), not only the container's runtime `env_file`. Make assets available in the build context before building. The image will contain those public assets; ignored by Git does not mean private in the image. Never put paid materials, personal data or secrets there or in `NEXT_PUBLIC_*`/build arguments.

`NEXT_PUBLIC_*` settings are compiled into client code. Restarting an already-built image does not change its branding: rebuild from the same commit with the intended public values. Runtime-only contact/legal/provider secrets retain their existing configuration boundary. No product source edits are required, but this is not runtime theme switching or a multi-tenant system.

`NEXT_PUBLIC_APP_URL` must also be present **at build time**, not only at runtime: client-side Agent connection prompts embed this canonical origin. The Dockerfile accepts `--build-arg NEXT_PUBLIC_APP_URL=https://learn.example.com`; reference Compose requires and forwards it from the interpolation environment (`--env-file`). Keep this value identical to the runtime canonical origin and auth origins. Changing only runtime environment does not repair an image already built with a missing or incorrect client origin; rebuild it.

The application generates `/manifest.webmanifest` from the shared site identity. Logo and description settings update site metadata; they do not rewrite your authored pages or course content.

另外設定 `SITE_LEGAL_NAME`（法律／營運名稱）、`CONTACT_EMAIL`（聯絡信箱）與 `SITE_DEFAULT_LOCALE`（例如 `zh-TW`）。這三項由 runtime 讀取，不要留著範例聯絡資訊公開上線。開發環境修改後重啟；Compose 修改後重新建立 app 容器。

## Core requirements

| Variable | 用途 | 失敗語意 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL | production startup fatal；test URL另需`_test` guard |
| `AUTH_SECRET` | Auth.js signing，至少32字元 | fatal |
| `NEXT_PUBLIC_APP_URL` | canonical public origin／Server Actions allowed origin | fatal，僅允許scheme + host |
| `AUTH_URL`／`NEXTAUTH_URL` | Auth callback/runtime compatibility | deployment profile需與canonical URL一致 |
| `CRON_SECRET` | detailed health與cron auth | operational/security boundary |
| `STORAGE_PROVIDER` | `local`或`r2` | local需persistent volume；r2缺key會misconfigured |
| `BACKUP_PROVIDER` | `disabled`、`local`、`r2` | 可disabled；啟用後misconfig通常degraded |
| `SCHEDULER_MODE` | `disabled`、`in_process`、`external` | 無效值misconfigured；只能有一個job owner |
| `MIGRATION_MODE` | `auto`或`external` | production entrypoint在schema不current時fail closed |

## Optional capabilities

### Portaly

新版設定使用`PORTALY_API_KEY`與`PORTALY_CALLBACK_SECRET`；商家profile由API key帶入，不需要另外設定`PORTALY_PROFILE_ID`。既有mode-specific `PORTALY_LIVE_*`／`PORTALY_TEST_*`設定仍需`PORTALY_PROFILE_ID`以維持相容。Checkout、plan sync與reconciliation啟用後，Portaly就是必要依賴；minimal profile可完全disabled。

啟用付款時必須明確設定`PORTALY_MODE=test|live`，而且API key prefix必須和mode相符。統一型與mode-specific憑證不可混用，避免`PORTALY_API_KEY`的優先序默默蓋過預期憑證。正式收款部署應另設`PORTALY_REQUIRE_LIVE=true`；此時test mode會在startup與checkout建立前fail closed。完整契約見`docs/contracts/portaly-live-mode-safety.md`。

### Discord

OAuth／role功能需要client ID/secret、bot token、guild ID與redirect URI；capability selector已完整檢查這五項。

### Agent API

Runtime使用DB-issued hashed API keys／user tokens。capability summary明確標示database-managed，不再依賴或示範`AGENT_API_KEY`。

### Sentry

`SENTRY_DSN`／`NEXT_PUBLIC_SENTRY_DSN`存在才啟用；build source-map token只放受保護build environment。未填 DSN 時維持停用，網站仍可正常啟動。

### Kit Email capture

`KIT_GENERAL_UPDATES_FORM_ID`與`KIT_GENERAL_UPDATES_FORM_UID`必須同時明確設定，才會在`/subscribe`渲染表單。
未設定、不完整或不合法時沒有表單、沒有Kit script，不收集或送出信箱。不使用原維護者的表單作fallback。
識別碼是public embed設定，不是管理secret；Kit API key不得送到client。啟用前自行配置自己的表單與隱私告知。

### Google member login

Google is the only supported OAuth sign-in provider in this release. With either credential absent/blank, the login page stays local and explains that member login is not configured; it does not automatically send visitors to Google. The application uses Auth.js provider ID `google` at `/api/auth/[...nextauth]`; it reads `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` from the private runtime environment. Do not add another provider without the account-linking review required by `SECURITY.md` and `src/lib/auth.config.ts`.

1. In a Google Cloud project you own, configure the consent screen/audience and create an OAuth client of type **Web application**. Use your own app name, support contact, domain and privacy information; never reuse the original operator's project. Follow [Google's web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server).
2. Register the exact authorized redirect URI: for local development, `http://localhost:3000/api/auth/callback/google`; for your HTTPS host, `https://learn.example.com/api/auth/callback/google` with your own domain. Scheme, hostname, port and path must match; `localhost` and `127.0.0.1` are different. If the console requests an authorized JavaScript origin, use the origin without the callback path.
3. Store the client ID/secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. Align `AUTH_URL`, `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the same chosen origin. Restart the development app or recreate the Compose app (`up -d`); a plain container restart does not import edited environment values.
4. If Google restricts your app to test users or an organization, ensure the intended account is eligible. Choose the audience that matches the people who should be able to sign in.
5. In a new browser session, sign in through `/login`, return to your own host and verify the resulting member session. Check sign-out and repeat login. Then separately verify entitlements and admin denial. Use an ordinary member account for this check, separately from administrator setup.

For `redirect_uri_mismatch`, compare the actual redirect URI with the console and configured origin; do not loosen redirect checks. For a generic server-configuration error, inspect redacted server logs for missing credentials, secret/schema/database errors before changing Cloud projects. Never paste a client secret, authorization code, cookie or full callback URL into an issue.

### First admin

`ADMIN_BOOTSTRAP_TOKEN`是現行一次性bootstrap selector，至少32字元。`.env.example`已移除runtime未使用的`ADMIN_BOOTSTRAP_EMAILS`。

在隔離／新站確認尚無 admin 後，用 [開始使用](GETTING-STARTED.md)的 secret 產生命令再產生一個獨立 token，僅放在私有 runtime environment。開發環境停掉並重新執行 `npm run dev`；Compose 使用原本的 env file、project name 與 Compose file 執行 `up -d app`，不要只 `restart`（不會載入新 env）。

開啟自己站點的 `/setup/admin`，在表單填入管理員 email 與 token。可升級同 email 的既有使用者，或建立新管理員；選擇自己控制且未來能用 Google 登入的 email。成功後應進入 `/admin`，可編輯內容並重新整理確認讀回。這個初次 session 不需要 Google credentials，但 session 結束後的日常登入需要 Google；bootstrap 不能取代一般會員的登入與權益驗收。

建立首位 admin 後，只要資料庫仍有 admin，bootstrap 就會拒絕再次建立；設定頁會顯示已完成，不再要求輸入 token。可以直接使用網站，不必為清理 token 立即重啟。下次維護設定時再移除私有 env 的 token，重啟後 bootstrap provider 才會從 `/api/auth/providers` 消失。這不是把環境變數自動刪除，也不是永久註銷 token：若刻意移除全部 admin，須先移除 token，避免重新開啟初始化。token 不是長期管理員密碼，不分享、不放 URL；不要為重跑測試刪除正式管理員。

2026-10-08 隔離 Linux 容器已用中性帳號確認無效 token 拒絕、首 admin session／admin HTTP page 成功、第二次 bootstrap 拒絕，以及移除 token 後 provider 消失。這不是 Google OAuth 或一般會員／管理員 browser 完整驗收。

## Storage and backup separation

- `STORAGE_PROVIDER=local`：`LOCAL_STORAGE_PATH`必須在persistent volume。
- `STORAGE_PROVIDER=r2`：需要account、access key、secret、media bucket。
- `BACKUP_PROVIDER=local`：`LOCAL_BACKUP_PATH`需persistent/private。
- `BACKUP_PROVIDER=r2`：使用獨立private backup bucket/prefix，不可共用public media bucket。
- `DB_BACKUP_WRITES_ENABLED=true`與restore write opt-in都是額外安全門，不應因provider credential存在而自動寫入。
- `DB_BACKUP_KEEP`未設定時為336（30分鐘排程下7天）；明確值必須是safe integer且至少3。錯誤值在建立backup sink／dump／retention delete前fail closed。

## Deployment profiles

| Profile | Payment | Storage | Backup | Scheduler | Sentry/edge |
| --- | --- | --- | --- | --- | --- |
| Minimal local/self-host | disabled | local persistent | disabled或local | disabled | optional/off |
| Single-instance production | optional/Portaly | local或R2 | local或private R2 | exactly one `in_process` owner | optional |
| 自訂多副本部署（需另外設計與測試） | optional | shared/persistent | one writer | `external` + one runner | external monitor recommended |

## Secret and evidence rules

Git ignores `.env` and `.env.*` runtime files (including custom deployment/test-run names). Only reviewed synthetic `.env.example` and `.env.test` templates are exceptions. Never put real secrets into those exceptions or force-add an ignored environment file; ignore rules do not sanitize already tracked files or Git history.

- 不提交`.env`、`.env.production`、`.mcp.json`、DSN、API key、OAuth secret、DB URL或resource ID。
- 不把secret放Docker build args、URL query、screenshot、issue、PR、Discord或Email。
- Evidence只保存redacted timestamp、status、opaque ID、commit/digest、migration tag與不含客戶資料的summary。
- Credential rotation不是一般deploy／diagnosis副作用，需要明確owner批准。
- Production origin若可被直接存取，必須定義可信proxy header與ingress policy；目前Repository無法證明Cloudflare-only origin。

## Selector validation status

設定組合由 `src/lib/config/platform.test.ts` 測試。新增環境變數或外部服務時，請一起更新範例、Doctor 和測試，讓缺值提示與實際使用的設定一致。

本文件在required env、capability selector、secret boundary、deployment profile或Doctor output改變時更新。

## Frontend component configuration

`components.json` 是 shadcn CLI 的專案描述，不是產品 runtime 設定。它固定目前的 Next.js／Tailwind v4／RSC 路徑、`@/*` alias 與 Phosphor icon library，讓後續可以查詢或新增官方 shadcn 元件。

它不會自動取代 `src/components/ui` 的 CabAI 元件，也不代表所有頁面只能使用既有元件。新增 UI 時仍先確認官方元件的行為與可及性，再用 CabAI semantic tokens、Phosphor icons 與既有元件組合；只有在缺少必要能力時才新增元件。

本節在 shadcn CLI 設定、元件路徑、icon library 或設計 token 改變時更新。


## Portable Agent plugin origin

The bundled `plugins/cabai` and `plugins/cabai-admin` skills require an operator-confirmed `CABAI_BASE_URL`. No maintainer-hosted default is selected. Plugin metadata uses `https://example.com` as a placeholder, not an API target. Configure and verify your installation origin before using tokens. A token is scoped to its issuing installation; never forward it to example.com, the maintainer service, or a redirected/untrusted origin. Runtime-generated connection instructions use your `NEXT_PUBLIC_APP_URL`; keep it accurate.

### Outbound service webhook destinations

Use a directly reachable public HTTPS endpoint with a valid certificate for its hostname. Private/loopback/reserved addresses, mapped/transition IPv6, URL credentials and fragments are rejected. Ordinary public IPv4 and global-unicast IPv6 are supported; special-purpose IPv6 ranges are intentionally rejected. DNS answers are checked together and one validated address is pinned for that attempt, so changing DNS cannot redirect the connection after validation. Redirects are not followed: configure the final HTTPS URL. A failing pinned address is retried through the existing outbox policy, not silently replaced with an unchecked address.

A total 10-second deadline covers DNS and HTTP; non-success response bodies are capped at 64 KiB. The received HTTP status still controls retries even when its body is too large or interrupted. Keep optional jobs disabled until your own receiver is configured and tested. Before enabling delivery, send a test to your own receiver and check its response.

### Client-IP trust

`TRUSTED_CLIENT_IP_HEADER` is an optional private runtime setting: blank (default), `x-real-ip`, or `cf-connecting-ip`. Blank/invalid values use one shared `unknown` IP bucket in every environment; admin action buckets additionally include the authenticated admin ID and action. Only enable a header when your ingress overwrites it from verified connection identity and direct access to the origin is blocked. Malformed/multiple IP values are rejected, and no other forwarding header is used as fallback. Follow the exact [ingress recipe](../operations/DEPLOYMENT-AND-OPERATIONS.md#https-ingress-and-member-login); proxy deployment must be verified by the operator.

### Legacy Marketplace: unavailable in the first release

`POST /api/portaly-marketplace` always returns HTTP 503 and does not read, store or process the request. Setting `PORTALY_MARKETPLACE_WEBHOOK_SECRET` does not enable it. The legacy data-only signature leaves the event and timestamp unauthenticated; freshness, deduplication and a prior-paid check cannot prevent relabeling captured signed data. Do not configure new provider deliveries to this endpoint or promise automatic Marketplace fulfillment/refunds.

If your current installation still accepts Marketplace purchases, do not switch it to this release or stop its delivery before arranging the replacement purchase flow and handling outstanding orders. Before upgrading, move new purchases to a verified payment flow, then retire the old provider delivery and export/reconcile pending orders using verified provider records. Retain the existing database/event audit trail. Do not delete pending records or treat retries/503 as successful delivery. Existing admin reconciliation remains, but generic retries and mapping creation now leave unprocessed legacy records quarantined without changing their stored status. Processing requires an admin-supplied verified provider export; the importer explicitly confirms the event type, rather than trusting old rawPayload metadata. Check affected payments/refunds against the provider before importing. This restriction does not disable the separate standard `/api/callback` integration, whose signed body event must match its header; real-provider acceptance of that integration is still installation-specific.

Re-enabling legacy ingress requires a provider-specific authenticated event/timestamp contract or independently authenticated order-status reconciliation, plus malicious/legitimate route regression tests. Do not silently switch it to standard callback v1 or add an unsafe bypass flag.

### Move an existing product to Portaly Payment

This sequence applies to an existing Manual, one-time, TWD local product, not a conversion of an active subscription into a one-time purchase. Keep the existing local product rather than creating a replacement: member purchases and course links refer to its local plan ID. Payment's provider plan ID is a separate identifier, not a Marketplace product ID.

1. First rehearse with neutral fixtures in a separate database and storage, using your own Payment **test** credentials. Set `PORTALY_MODE=test` and `PORTALY_REQUIRE_LIVE=false`; do not mix unified and legacy credential settings. Use a dedicated HTTPS test origin; set `NEXT_PUBLIC_APP_URL` and the authentication origins/redirects to that test installation as well, so checkout success/cancel and login do not return to production. Point `PORTALY_CALLBACK_URL` to that installation's `/api/callback`, never the live site. Keep mail, Discord and unrelated outbound deliveries disabled.
2. In the existing product's admin settings, select the Portaly gateway and supply an active, TWD, one-time, dynamic-price Payment provider plan ID. The conversion validates the provider plan and keeps the local product ID. Preserve the existing slug, price, course links and other product settings. Do not use plan synchronization to create a second product with the same name. Provider plans are shared across test and live modes: use an existing compatible plan read-only for the rehearsal, and do not create or edit provider plans merely because the key is in test mode.
3. After the mapping succeeds, change that product's checkout settings to **internal**. This clears the external purchase URL. Gateway mapping and the purchase button are separate saves: if mapping fails, leave the old purchase button unchanged. Record the old button settings before changing them. The admin action deliberately does not allow converting Portaly back to Manual; do not assume this is a one-click rollback.
4. Check that a historical member can still read the same course and an unentitled user cannot. Then use a separate new test buyer to go from the product page through the hosted Payment checkout. Verify the returned callback, the completed local order, the purchase and its entitlement outbox record. Returning to the success page or seeing HTTP 200 alone is not proof of delivery.
5. Check refund handling separately with synthetic signed callbacks and disposable local orders: access from the refunded purchase is revoked, unrelated purchases remain, and a repeated notification does not duplicate the transition. The [provider contract](https://github.com/portaly-ai/portaly-skills/blob/d2575623dd879553c59304f66d7a301f38c14879/skills/portaly-payment/references/api-contract.md#order-refund) currently rejects test-key refunds with `409 TEST_MODE_REFUND_UNSUPPORTED`; even a dashboard request cannot refund a sandbox order through that live-only endpoint. Record real-provider refund delivery as unverified, not as a failed sandbox setup. Do not substitute a live charge/refund to make the checklist pass. If testing outbound delivery, use only your own isolated receiver and run the existing outbox job; an outbox row alone does not prove receiver delivery. See the [payment contract](../contracts/payment-entitlement-reliability.md) for application refund limits and retry behavior.

Synthetic callback scripts and mocked provider tests are useful local checks, not hosted Payment acceptance. If a test credential, isolated HTTPS target or safe provider test flow is unavailable, record that gap instead of using live credentials or a real purchase. Once the rehearsal passes, separately approve the live product mapping, purchase-button change and old-order reconciliation before retiring Marketplace delivery. New Payment purchases continue to use automatic Webhook fulfillment; manual import is only for verified legacy records.
