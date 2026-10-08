# External Integrations

先看下表決定要設定哪些服務，再查看各節的資料流與失敗處理。選用服務請先用自己的測試帳號確認連線。

## 整合矩陣

| 整合 | Core啟動必要？ | 啟用後負責 | 失敗／降級行為 | 主要證據 |
| --- | --- | --- | --- | --- |
| PostgreSQL | Yes | identity、commerce、content、jobs、audit | production startup/schema check fail closed | `src/lib/db`、`scripts/run-migrations.mjs` |
| Google OAuth / Auth.js | 登入profile必要 | Google login、JWT session | provider失敗無法新登入；既有session依Auth.js語意 | `auth.config.ts`、`auth.ts` |
| Portaly | No for minimal；commerce profile必要 | plan sync、hosted checkout、subscriptions/callback | normal local read可運作；checkout/reconciliation降級 | `portaly-client.ts`、checkout/callback |
| Local storage | default | media object read/write | ephemeral host會遺失，需persistent volume | `src/lib/storage/local-storage.ts` |
| Cloudflare R2 | Optional | private/public media或private DB backup sink | capability misconfigured時startup fatal/degraded依用途 | `src/lib/storage/r2-storage.ts`、database backup sinks |
| Discord | Optional | account link、guild join、desired-state role sync、monitor notifications | mapped roles由durable entitlement transition重試；link/unlink/mapping操作會同步或fail closed | `src/lib/discord.ts`、Discord API routes、Worker |
| Sentry | Optional; disabled without your DSN | exception stack、release correlation、scrubbed context | no DSN即disabled；capture failure不改原response | `src/lib/observability`、Sentry configs |
| Cloudflare Worker | Optional | edge fallback、external probes、incident state、Discord alert | 不修復App/DB，不偵測Cloudflare全域outage | `deploy/cloudflare/maintenance-worker` |
| Zeabur | Provider-specific profile | App/DB hosting、GitHub-backed deployment | App和Worker deployment彼此獨立 | `docs/operations/DEPLOYMENT-AND-OPERATIONS.md` |
| Agent clients | Optional | scoped automation | invalid key/scope/confirm fail closed | `/api/agent`、OpenAPI |
| Kit Email capture | Optional | `/subscribe` 公開名單承接與 subscriber 管理 | Kit 失敗時表單不得顯示成功；不影響會員核心功能 | `src/components/join`、`src/lib/subscribe-page.ts` |

## Portaly

### Current contract

- 新版API key本身綁定test/live mode與merchant profile；舊版mode-specific credentials列Plan時仍使用`PORTALY_PROFILE_ID`。
- Checkout先建立local pending order，再向Portaly建立hosted session。
- Callback以HMAC、freshness、event、order、amount、currency驗證；subscription由reconciliation補償。
- `plans.providerPlanId`應保存provider identity，本地`plans.id`才是access/delivery identity。

### Current safety contract and lock-in

- 所有Portaly request有10秒timeout；GET/network/429/5xx最多一次bounded retry，POST/PUT mutation不自動重送；non-JSON error會轉為sanitized stable result。
- Admin includes provider Plan create/update operations. Treat these as optional, explicitly authorized remote mutations; local plan identity remains the access/delivery authority.
- self-heal以`providerPlanId ?? localPlanId`比對，完整保存provider status/cancellation/billing evidence，且跨owner/plan identity conflict fail closed。
- 標準 callback 使用已實作的簽章與事件綁定驗證；Legacy Marketplace 入口目前停用。Subscription ID 的跨訂單唯一性與供應商交付時效仍需另外核對。

先用測試環境驗證身份映射、逾時、重試與 subscription ID 關聯，再考慮替換付款供應商。遠端方案寫入需由有權限的管理員明確操作。

## Google OAuth / Auth.js

- Google是唯一normal login provider，JWT session會定期從DB刷新role。
- Admin operation仍查DB role，避免stale JWT授權。
- `allowDangerousEmailAccountLinking`只在Google-only且Google強制`email_verified=true`的threat model下被接受。
- 增加任何第二provider前必須把該flag改為`false`，並實作explicit linking flow：使用者先以原provider登入、主動選擇link、callback成功後才綁到既有`userId`；新provider不得只靠相同email直接登入既有帳號。
- 新provider的sign-in callback必須驗證`email_verified === true`或等價保證，並補account-takeover threat review與既有帳號遷移決策。未完成前，reviewer應阻擋新增provider的PR。
- first-admin使用至少32字元bootstrap token與PostgreSQL advisory transaction，不是password login。

## Discord

- OAuth state使用HttpOnly/SameSite=Lax cookie與timing-safe comparison；不持久化Discord access token。
- App直接呼叫Discord REST做guild join與role管理；每次request有8秒timeout，mutation不自動重送，失敗由domain outbox job重試。
- mapped role以current local entitlement做desired-state reconciliation；同一Discord role若映射多個Plan，只要任一Plan仍有效就不移除。
- OAuth link／refresh會同時移除stale mapped roles；unlink與relink先清理舊帳號，失敗時保留local link供重試。Admin mapping/default-role改動也不再靜默遺留role。
- Monitor notification與product role是不同責任；一個成功不能證明另一個成功。

## Storage：local / R2

`StorageProvider`提供local/R2 seam。Local使用路徑containment與限時HMAC URL；R2使用presigned URL。Server-side `readObject` 採有限制的讀取，只用於checksum／archive等必須檢查bytes的流程，讀取前後都受size限制。Media registry、ownership與entitlement仍在provider外，這使storage較可替換。

- Minimal/local profile需persistent volume。
- R2 media bucket與private DB backup bucket必須分離。
- DB dump不含object binary；需要獨立media retention/backup決策。
- 啟用 R2 時，使用自己的測試 bucket 驗證上傳、下載與還原。
- Skill artifact只接受owner-managed ZIP；Local與mock R2已驗證upload／read／checksum／missing-object，真實 R2 的 read-back 與 exact-byte repair 需在自己的環境驗證；ZIP 結構檢查不是惡意程式掃描。

## Sentry

Sentry的正確角色是application error aggregation、stack trace與release correlation，不是whole-origin uptime monitor。沒有DSN時App正常啟動；未配置 DSN 時為 disabled；每個部署者自行決定是否啟用。

若未來啟用，需由secret manager注入DSN／build token、驗證PII scrub、設定alert routing並保存redacted receipt。不要因為程式含`@sentry/nextjs`就宣稱production已使用。

## Cloudflare Worker與Zeabur

- Worker分類document/API/non-document request，每個request最多一次origin fetch。
- Durable Object保存failure count、incident與recovery state；Cron與alarm有去重。
- App部署不會自動部署Worker；Worker redeploy也不會把未合併App code帶到Zeabur。

## Agent API

- DB-issued keys只顯示一次並以SHA-256 hash保存；操作清單以目前生成的 OpenAPI 為準。
- destructive operation要求confirmation header；Admin Agent OpenAPI YAML 需要有效 Agent key；公開來源契約在 `docs/openapi/agent-v1.json`。
- Member user token限制於既定read scope。
- capability inspector現在明確回報database-managed Agent keys；`.env.example`不再把`AGENT_API_KEY`列為runtime selector。

## Kit Email capture

- `/subscribe` 不要求登入，瀏覽器直接把 Email 提交到 Kit Form。
- CabAI 不另外保存名單；Kit 是 subscriber authority，負責訂閱狀態、取消訂閱與後續寄信。
- CabAI 只在 Kit 接受表單後顯示成功訊息；既有 Email 重送仍由 Kit 決定訂閱結果。
- `KIT_GENERAL_UPDATES_FORM_ID/UID`是公開 embed identifier，不是 Kit 管理憑證。

## Configuration drift

| Drift | Current evidence | 影響 |
| --- | --- | --- |
| Portaly profile selector | unified key自帶profile；legacy mode-specific credentials仍要求`PORTALY_PROFILE_ID` | Doctor與plan runtime一致，避免shared profile誤選credential family |
| Discord redirect selector | OAuth capability要求`DISCORD_REDIRECT_URI` | 啟用前即可發現缺值 |
| Agent selector | DB-managed capability，不依賴legacy env key | 與runtime驗證模型一致 |
| Bootstrap example | 移除unused `ADMIN_BOOTSTRAP_EMAILS` | operator只看到現行token flow |
| Sentry capability | optional enabled/disabled明示 | absence仍不是error |

## 供應商失效與替換順序

1. 先明確資料權威與本地identity。
2. 對每個HTTP adapter定義timeout、retry、idempotency與non-retryable錯誤。
3. 建立provider-disabled與sandbox contract tests。
4. 把provider DTO留在adapter，不讓UI／domain直接依賴。
5. 只有出現第二provider需求時，才抽出更通用介面。

本文件在整合啟用條件、env、provider contract、失敗語意、資料傳輸或production profile改變時更新。
