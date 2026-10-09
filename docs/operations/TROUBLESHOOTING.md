# 疑難排解

網站啟動不了、登入失敗，或付款後看不到課程時，先從這裡找對應的檢查方式。先縮小問題範圍，再決定是否需要重啟或修復資料。

## 先花五分鐘確認範圍

1. 記下發生時間、頁面或 API、HTTP 狀態碼和 `x-request-id`。分享紀錄前移除密鑰、Cookie 和客戶資料。
2. 開啟另一個一般頁面及公開健康檢查，確認是單頁出錯還是整個應用程式無法回應。
3. 檢查受保護的 readiness 結果。它會補充資料庫、設定和排程狀態；公開 health 主要確認程式是否還在回應。
4. 查看最近一次部署或設定變更，以及相同時間的伺服器 log。
5. 若只有一個請求失敗，先追查該路由；重啟或還原整個資料庫通常不是第一步。

## 依症狀往下查

首次本機安裝卡住時，先在 repo root 確認 Docker engine 已啟動、`docker compose version` 可用，再使用原本的 project name 執行 `docker compose --project-name cabai-dev --env-file .env ps -a`。檢查 `POSTGRES_PORT` 與 `DATABASE_URL` 的 port 是否一致；本機 Node 連 `127.0.0.1`，production Compose app 連 service hostname `postgres`。不要把 `.env` 或解析後的 Compose config 貼出來。

`npm run doctor -- --json` 適用於本機 `.env` 與依賴已安裝的 checkout；production 容器請用[部署指南的 readiness 命令](DEPLOYMENT-AND-OPERATIONS.md#inspect-stop-and-restart-without-erasing-data)。Doctor 指出缺表時先核對 DB 目標與 migration 結果；不要用 `db:push` 或刪 volume 跳過 migration。改 `.env` 密碼不會更新已存在的 PostgreSQL 使用者，改 Compose env 也需重新建立 app 容器才生效。

| 症狀 | 先檢查什麼 | 下一步 |
|---|---|---|
| 單頁或 API 回 500，其他頁正常 | request ID、該路由的 log、最近改動 | 用相同操作重現，檢查功能本身。 |
| 出現維護頁或 API 503 | 應用程式狀態、health/readiness、Worker 紀錄 | 分清楚是來源站失效，還是代理連不到來源站。 |
| Health 200，但 readiness 503 | readiness 的錯誤分類、Doctor、job 紀錄 | 修正對應的資料庫、設定或排程問題。 |
| Google 登入失敗 | 登入憑證、三個網站 origin、Google callback URI | 依[Google 設定](../development/CONFIGURATION.md#google-member-login)核對；通用 server error 另查 DB、schema 和 Auth secret。 |
| `/setup/admin` 未啟用或 token 被拒 | token 長度、app 是否載入新 env、是否已存在 admin | 依[首次管理員設定](../development/CONFIGURATION.md#first-admin)核對；已完成就用 Google 日常登入，不刪管理員或重設 DB。 |
| 改品牌後仍顯示舊名稱／圖片 | build-time env、build context 的公開資產、目前 image | 依[品牌設定](../development/CONFIGURATION.md#shared-branding-one-codebase-different-public-assets)重新建置並重新建立 app；restart 舊 image 不會換品牌。 |
| Checkout 502 或 500 | Portaly 回應、逾時、本地 pending order、callback URL | 保留訂單狀態，先確認服務商是否已建立付款 session。 |
| Checkout 503，提示設定不完整 | Doctor、`PORTALY_MODE`、key 類型與 `PORTALY_REQUIRE_LIVE` | 修正相互衝突的設定，不用關掉檢查來繼續收款。 |
| 付款成功但課程沒開通 | callback 驗證結果、訂單關聯、有效 purchase、課程對應 | 依下方付款檢查順序核對，再使用既有對帳流程。 |
| 撤權後 Discord 角色還在 | 訂閱與 purchase 狀態、撤權時間、outbox/job 結果 | 確認本地權限正確後，重試尚未完成的角色同步。 |
| Job 過期或失敗 | 排程模式、執行者、job lock、最後錯誤 | 確認只有一個排程執行者，再處理 provider 或執行錯誤。 |
| 備份失敗 | PostgreSQL client、目的地、寫入開關、保留數量 | 查 manifest 和驗證結果；先修好備份，不要直接還原正式資料。 |
| Migration 阻止啟動 | DB 連線、migration tag、ledger/hash | 依[維運指南](DEPLOYMENT-AND-OPERATIONS.md#inherited-migration-ledger-compatibility)查差異，用新 migration 修正。 |
| 上傳或讀檔失敗 | 儲存路徑、volume/R2 設定、媒體登錄、權限與連結期限 | 確認物件與登錄資料一致，再重新取得有權限的連結。 |
| Skill 無法發布或下載 | readiness issues、media 綁定、物件大小、checksum、ZIP 檢查 | 修正失敗項目後重新驗證，保留原本的公開／登入存取政策。 |
| 舊 Marketplace 回呼固定回 503 | 是否仍使用已停用的舊入口 | 依[升級說明](../development/CONFIGURATION.md#legacy-marketplace-unavailable-in-the-first-release)暫停投遞並核對匯入。 |
| Discord 監控通知沒收到 | Worker 是否啟用監控、冷卻時間、bot/channel 與投遞結果 | 區分尚未達通知條件和通知投遞失敗。 |
| Sentry 沒有事件 | DSN、capture 設定與資料清理規則 | 未設定 DSN 就是停用；若要啟用，再送測試事件確認。 |

## 怎麼解讀 500 通知？

選用的 Cloudflare Worker 會分開處理「某個請求失敗」與「整站中斷」：

- 第一筆流量 5xx 只記錄診斷資訊。
- 同一個時間窗內第二筆才送一次診斷通知，之後進入冷卻期。
- 整站可用性事件，則由獨立的 health/readiness 連續失敗判斷。

收到通知後，先確認 health、readiness 和一般使用流程是否也失敗，再查看是同一路由、機器人流量還是最近部署造成。通知本身不是需要停站的理由。Worker 設定與測試方式見[維護頁說明](../../deploy/cloudflare/maintenance-worker/README.md)。

## 付款與權限怎麼核對？

依下列順序追查，避免只看到付款成功頁就誤判：

1. 找到本地商品與訂單，確認使用者、方案和付款 session 的關聯。
2. 檢查服務商付款資料是否通過簽章、金額、幣別與訂單驗證。
3. 查看 `userPurchases` 是否有效或已撤銷。
4. 若是訂閱，檢查訂閱狀態、有效期限及最近對帳結果。
5. 確認課程／檔案的方案對應。
6. 最後檢查 webhook 和 Discord 等後續同步。

可分享訂單／請求識別碼、狀態變化、版本和時間。完整 callback body、簽章、email、token 和資料庫連線字串留在受控環境。需要補資料時，先取得可核對的付款紀錄，再走有稽核紀錄的修復流程。

Marketplace 匯入若出現 `Existing marketplace order does not match the verified payment`，表示同編號已有訂單，但會員、方案、金額、幣別或完成狀態不一致。本次重試不會補發權益；請對照可信的供應商匯出與既有訂單，確認選定方案及退款狀態，不要刪訂單或改狀態來強行重試。預覽通過不等於匯入成功，仍要查看匯入結果的失敗列；完全相符且已完成的訂單可以安全重試補齊缺少的權益。

Portaly Payment 與上述 Marketplace 是不同入口。一次性付款的新版 `creator_subscription.payment.refunded` 由 `/api/callback` 處理；`refund_failed` 不會撤權。若日誌顯示退款資料不完整、與本地訂單不符或需要逐期對帳，請核對供應商退款交易與本地 merchant order，不要只因回應 200 就判斷撤權成功。缺少本地訂單或資料庫暫時失敗會回 500 供重試。此處尚不支援訂閱逐期退款，不能用改事件名稱的方式強行套用。

## 需要修復或還原時

### Migration hash 不一致

遇到 `SCHEMA_HASH_MISMATCH`，先停下升級，核對正在執行的 commit、完整 migration ledger 與 SQL 原始位元組。Windows 的 `core.autocrlf=true` 曾讓 SQL checkout 變成 CRLF，與 Linux 的 LF 雜湊不同；目前 `.gitattributes` 已固定 SQL 為 LF。更新規則不一定會重寫現有工作目錄，請用新的乾淨 clone 核對 `git ls-files --eol drizzle/*.sql`，不要在有未提交修改的目錄做廣泛 reset。

這只修正來源檔案的一致性，不會修復已由其他位元組版本建立的資料庫。請在受控環境使用既有 `scripts/audit-applied-migrations.ts` 做完整唯讀 ledger 稽核，保留必要的私人結果，再決定修復方式；不要自行改 hash、補 migration 紀錄、擴大豁免或重建正式資料庫。啟動時的最新 migration 檢查不能代替完整 ledger 與實體 schema 比對。

先採用能安全重跑的檢查、對帳或既有重試功能。若要直接修資料，先備份、列出修改目標與復原方式，並與網站負責人確認。

還原演練使用另一個空白資料庫和儲存位置；完整步驟見[部署與維運](DEPLOYMENT-AND-OPERATIONS.md#recovery-and-optional-operations)。重啟、暫停監控或略過 Worker 可以暫時緩解問題，但仍要追查原本的錯誤。API 應回報實際結果，而不是為了停止告警改回成功。

## 請別人或 AI 協助時，提供這些資訊

- 問題開始時間與時區，以及是否已恢復。
- 使用的環境、程式版本或 image digest。
- 哪個操作失敗、HTTP 狀態碼與 request ID。
- health/readiness 結果，以及去除敏感資料後的相關 log。
- 已做過哪些檢查或變更、目前卡在哪裡。
- 可以操作哪些資源，哪些資料需要保留。

這些資訊通常比貼出整份 log 更容易找到原因。
