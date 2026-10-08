# Development and testing

Use this guide to choose tests for your change and set up an isolated test database. Start with [Getting Started](GETTING-STARTED.md) if the app is not running yet. Commands are defined in `package.json`; test selection lives in the Vitest and Playwright configurations.

## Command matrix

| Command | What it checks | What it does not prove |
|---|---|---|
| `verify:static` | ESLint, CI policy/scope, migration/UI/API/OpenAPI/Agent/plugin guards, TypeScript | Runtime behavior, integrations, build or browser flows |
| `test:unit` | Unit/domain tests selected by `vitest.config.ts` | Real provider or database acceptance |
| `test:component` | jsdom UI tests | Actual browser layout, keyboard or device behavior |
| `test:contract` | Route/API/security response contracts | Deployed end-to-end behavior; many dependencies are mocked |
| `test:integration` | Prepares the disposable DB, then PostgreSQL integration tests | Real OAuth, payments, R2 or Discord acceptance |
| `test:reliability` | Application operational helpers and maintenance Worker tests | Hosted alerts, outages or recovery |
| `verify:fast` | Static, unit, component and reliability | Contract, integration, build, E2E |
| `verify` / `verify:full` | Fast, contract, integration, production build | Playwright E2E, hosted services or full security audit |
| `build` | `next build --webpack` | Deployability/persistence/restore or correct permissions |
| `test:e2e` | Prepares E2E fixtures, runs Playwright | All roles/providers/browsers; inspect current config |
| `smoke` | Reads an already-started app's public/auth boundaries | Starts no server and does not complete real checkout |

Run the closest tests while working, then the wider checks your change needs. Record results for the revision you tested.

## Database testing

Tests load `.env.test` first, then fill missing variables from `.env` without overriding existing process variables. For an isolated run, set `DATABASE_URL` in the test process to your disposable test DB before invoking npm. Keep the app/demo DB separate. Never commit credentials into `.env.test`; its checked-in URL is only a local test example, not guaranteed to match your machine.

Confirm host, port, user and database locally without posting the connection string. Test helpers clear shared tables; the URL must use loopback (`localhost`, `127.0.0.1` or `::1`), a database name ending in `_test`, and no query/fragment overrides. After creating and verifying ownership of that disposable database, explicitly set `TEST_DATABASE_RESET_CONFIRM` to its exact name in the test process or private `.env.test`. This opt-in is intentionally not supplied by the checked-in defaults. The cleanup guard also checks the initialized pool matches the guarded URL; restart the process after changing configuration. Confirmation is necessary, not proof of disposability. If preparation fails, stop and diagnose the target instead of disabling the guard.



- `scripts/prepare-test-database.ts`呼叫 `src/test/database-setup.ts`，目前使用 `scripts/run-migrations.mjs` 套用 tracked migrations。不要把舊文件的 `push --force` 當成現行命令。
- Integration suite刻意`fileParallelism: false`，因多個test會清空共享資料。
- Migration fidelity additionally uses `test:production-migrations` and the CI entrypoint matrix; schema preparation alone is not the whole acceptance gate.
- `.env.test`必須指向名稱以`_test`結尾的 loopback PostgreSQL DB，並設定 `TEST_DATABASE_RESET_CONFIRM` 為該名稱；不可指向persistent／production資料庫。

## CI is the fullest gate

`.github/workflows/ci.yml`目前包含：

1. full-history Gitleaks；
2. 所有PR都會執行的 `npm ci` 與 `verify:static`；
3. runtime／build變更才執行的local Compose、PostgreSQL、全部Vitest／reliability suite、Chromium Playwright、migration matrix、Doctor、neutral seed、production build與smoke；
4. API／server／migration／deployment／dependency／CI變更才執行的container boundary job，驗證non-root、read-only、PostgreSQL 18 client、fresh migration、persistence與direct Docker auto mode。

完整CI會在Pull Request建立或更新時自動執行；所有PR至少會通過`verify:static`。runtime／build變更會保留完整`verify`，API／server／migration／deployment／dependency／CI變更還會執行`container`。已驗證的 PR 合併到預設分支後不會再次自動重跑相同工作，避免重複消耗Actions分鐘。若需要事故後或合併後重驗，可從GitHub Actions手動執行`workflow_dispatch`，此入口永遠執行完整路徑。`npm run check:ci-policy`與`npm run check:ci-scope`會防止必要jobs、手動入口、scope fail-closed、同ref取消機制遭移除，或誤把`push`重複觸發加回來。完整契約見`../contracts/ci-budget-adaptive-gates.md`。

Local `npm run verify`成功不等同CI所有項目通過；反之，CI也不含production provider credential、private R2、real Portaly sandbox或Cloudflare/Discord receipt。

## Focused verification by change

| 變更 | 最少focused gate |
| --- | --- |
| API route | route contract + `check:api-route-boundaries` |
| Agent operation | focused test + `openapi:check` + `check:agent-skill` |
| Schema/migration | `check:migrations` + integration + production migration matrix |
| Course mutation | `course-mutation-ownership.md` + Admin component/integration + service/access/publish invariant |
| Checkout/callback/entitlement | `payment-entitlement-reliability.md` + reservation/outbox/subscription/Marketplace/Discord/order/access/reconciliation integration |
| Storage | provider conformance + private asset contract；R2需credentialed disposable gate |
| Job/readiness | job unit/integration + reliability tests + scheduler/health contract |
| Worker/alert | Worker tests + normal passthrough + controlled external drill |
| Browser UI | component + route／link／metadata／sitemap + responsive／loading／empty／error evidence；重要public／admin flow再跑browser E2E。依owner決定，WP-07不把鍵盤操作列為獨立gate |

## Current gaps

- Playwright 主要使用 Chromium 和 1 個 worker。首版另做過正式映像的瀏覽器測試；Firefox/WebKit、視覺回歸與 coverage threshold 尚未納入。
- Authenticated payment/provider callback與完整course completion沒有production-like browser gate。
- 非課程Offering缺type × presentation × checkout × delivery聚焦測試矩陣。
- Checkout reservation、entitlement claim/retry/DLQ、subscription side-effect recovery、provider self-heal與backup invalid-retention已有focused tests；尚缺production rollout與長時間failure/volume evidence。
- `scripts/`被TypeScript typecheck排除；operator scripts需自己的runtime/test inventory。
- GitHub Actions 已固定 commit SHA；Docker base image 仍使用版本 tag，沒有固定 digest。

## CI Cache 政策

完整驗證會保留既有的 npm 與 Next.js cache。Next.js cache key 依賴套件、
Node、Next.js、TypeScript 與 PostCSS 設定，而不是每一個 source file，因此
一般程式碼變更不會建立新的 cache namespace。Next.js 與 Docker cache 都採
明確 restore/save；只有對應 build 成功，而且 primary key 不是 exact hit 時，
才會保存新 cache。

Container job 必須先透過 `docker/setup-buildx-action@v4` 建立
`docker-container` builder；GitHub runner 預設的 Docker driver 不支援這裡使用的
local cache export，不能直接移除這個前置步驟。

Production build 採單一責任：不需要 container gate 時由 Verify 執行 `npm run
build` 與 production smoke；需要 container gate 時由 Dockerfile build，並在隔離的
Compose database 完成 demo seed 後，對正式 image 執行同一支 `scripts/smoke-test.ts`。
Verify 的測試、瀏覽器、migration 與靜態 gate 不因這項去重而省略。Scope 判斷失敗
時一律由 Container 接手 production build，維持 fail-closed。

Cache miss 不會跳過測試、migration、image boundary、build 或 smoke 驗證。
Applicable job 會在 Actions summary 顯示 exact-hit 狀態、cache 大小與 Docker
build 時間。先比較同一 PR 的 cold run 與 warm rerun；只有在 restore/save
成本低於節省時間時才保留 `mode=max`。既有歷史 cache 不會由 CI 自動刪除；
新策略驗證後，再視 GitHub cache inventory 與儲存壓力移除過時項目。

## Validation record policy

Keep browser identity and coverage explicit. `e2e/learner-mainline.spec.ts` signs in through first-admin bootstrap and remains an administrator while exercising learner and authoring UI. Passing it does not prove ordinary-member entitlement enforcement, Google OAuth or revoked-member behavior. Verify those separately with an actual member role. A synthetic Auth.js session may isolate downstream authorization in a disposable local fixture, but must be labeled as such; never add a production authentication bypass for tests. Direct fixture revocation is not evidence for the admin revocation UI.

記錄執行指令、結束碼、時間與環境。失敗時說明原因和受影響的流程；修正實際問題後再重跑，保留需要後續處理的項目。

本文件在package scripts、test counts/config、CI gates、DB test strategy或browser support改變時更新。


## Standalone artifact boundary

For paired database/local-media recovery, use the opt-in `npm run test:recovery` described in [Operations](../operations/DEPLOYMENT-AND-OPERATIONS.md#repeatable-synthetic-recovery-check). It requires a local Docker engine and the pre-pulled PostgreSQL image, creates its own isolated targets, and never consumes an operator `DATABASE_URL` or storage path. It is deliberately not part of ordinary `npm test`; a passing drill does not prove browser authorization or production recovery.

Use `npm run build` (or `npm run build:profile` for CPU profiling), not a raw `next build`, for a redistributable standalone artifact. `scripts/sanitize-standalone.mjs` is the post-build owner: it validates resolved paths, rejects redirected artifact roots/state entries, and moves copied environment files/Git metadata/logs/backups/uploads/temp output out of `.next/standalone` into a private `.next/build-state-quarantine-*` sibling. It does not modify the original `.env` or runtime data. Next may explicitly copy loaded `.env` files even when tracing excludes are configured.

The quarantine is ignored local state, not secure deletion and not a release payload. Never distribute the whole `.next` directory or a developer checkout wholesale. Inject secrets into your runtime environment separately. A sanitizer failure is a release failure; do not bypass it. Tests cover preservation, idempotence, missing output and an outside-root junction. Source/content/license/security release gates still apply to the remaining application files.

## Rich editor boundary regression

`src/components/ui/rich-editor.component.test.tsx` mounts the actual Novel/Tiptap editor: persisted HTML-shaped/JSON-shaped strings remain text, and normal HTML paste does not preserve event attributes or images under the fixed StarterKit schema. The component test config transforms the editor's CSS/ESM dependencies rather than mocking the editor. Run this regression when changing content imports, extension registration or editor dependencies.

This does not patch the installed Tiptap helper or prove all arbitrary/custom attribute paths safe. Do not add dynamic extensions or import untrusted attribute JSON without a separate security review. The current editor does not parse its initial string as HTML/Markdown and does not register link/image extensions, despite older descriptions; preserving rich-text formatting across edit/reload is not established by these security tests.

## Framework image boundary regression

`scripts/next-image-boundary.test.mjs` is part of `npm run test:reliability`. It calls the installed Next.js external-image helper with mocked DNS and HTTP(S) transports: validated addresses must be pinned into the connection lookup, ordinary image bytes must remain readable, and private redirect targets and IPv4/IPv6 literals must be denied. All transports are intercepted; the tests do not contact real hosts or private services.

This is a focused dependency regression, not an end-to-end socket, proxy or `/_next/image` route test. It uses an internal Next helper, so inspect upstream changes rather than weakening the assertions when upgrading Next. Keep the application's exact-host allowlist and default private-IP denial; CSP is not server-side SSRF protection.

## Shared Git development and release

This repository is the shared product source, including the maintainer deployment. Make changes through normal branches and reviewed commits; build or deploy a verified commit/tag with your own configuration and data. Do not maintain a separate public-export branch or require copying a filtered source tree for each release. ZIP archives may be generated from Git as a distribution convenience, never as the canonical development source. See [PRINCIPLES](../../PRINCIPLES.md).

Validate the tracked tree and intended Git history before first publication. Future changes must retain the secret, private-content and standalone artifact boundaries. A successful build or local commit is not authorization to push, publish or deploy.

## Keep operator files out of Git

Use `.env`/`.env.*` for local configuration; only the reviewed root `.env.example` and synthetic `.env.test` are allowed. Nested files named `.env.example` or `.env.test` are not automatically trusted. Never replace the tracked templates with real credentials.

Keep runtime data in `data/`, backups in `backups/`, customer exports in `exports/`, private operator records in `private/` or `docs/private/`, and local-only scripts in `scripts/local/`. Legacy paid content under `src/contents/` stays private; neutral shared examples belong in `fixtures/`. Public operator branding belongs in `public/site/`: Git ignores it, but it is intentionally served and included in deployment builds. `.dockerignore` separately excludes private operator state; Git-ignore alone never protects an image or a website.

Check paths with `git check-ignore -v --no-index <path>` and inspect `git status --short` before adding files. `git ls-files -ci --exclude-standard` finds already-tracked files matching current ignore rules. Ignore rules do not untrack files, erase history, detect every secret, or block `git add -f`. If a credential was committed, assess exposure and rotate/revoke it as appropriate; merely adding an ignore rule does not fix that exposure.

The boundary regression in `scripts/container-source.test.mjs` verifies both excluded private paths and included migrations, neutral fixtures, contracts, plugins and product routes. Do not use blanket `*.sql`, `*.json`, `local/` or `coverage/` ignores: those names also occur in legitimate product source. Public audit documents are allowed; private incident evidence belongs in the explicitly private directories above.

<a id="first-release-verification-scope-2026-10-08"></a>

## First-release verification scope

The reference profile is a single application instance with PostgreSQL and local media storage. Local verification has exercised fresh installation, migrations, neutral demo data, readiness, smoke checks, admin authoring, member access and paired database/media restore. Authorization checks used synthetic sessions; real Google OAuth and provider transactions need separate validation with your own accounts.

CI and the commands above provide repeatable checks. Keep revision-specific logs, candidate fingerprints, private review discussions and deployment receipts outside the public repository. Public release notes should summarize user-visible changes, reproducible checks and remaining limitations.

### Known limits and dependency notes

Legacy Marketplace ingress is disabled, including retry processing of unverified stored events; see [configuration and upgrade guidance](CONFIGURATION.md#legacy-marketplace-unavailable-in-the-first-release). Multi-replica deployment, real-provider end-to-end flows and upgrades from an existing production installation need additional environment-specific verification.

At the October 2026 dependency review, post-update production audit reports 0 critical, 0 high, 39 moderate and 1 low **package-graph entries**, not 40 demonstrated exploits. Next.js is pinned to 16.3.8. Static review of the current application found the Tiptap arbitrary-attribute prerequisite defeated by literal initial text and fixed StarterKit/schema-filtered attributes; Novel's KaTeX Mathematics extension is not registered; selector-parser receives build-time developer typography configuration, not hosted customer selectors. These dependencies remain affected upstream, not patched or permanently waived. Tiptap's vendor rates its advisory High despite npm's Moderate label. Re-review imported document attributes, dynamic extensions, math rendering or user CSS compilation before enabling them. See the [Tiptap advisory](https://github.com/ueberdosis/tiptap/security/advisories/GHSA-cp6q-959q-f8rh), [KaTeX advisory](https://github.com/advisories/GHSA-238p-pmpm-9mq7) and [selector-parser advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
