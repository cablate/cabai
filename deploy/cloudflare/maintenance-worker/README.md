# CabAI Cloudflare 維護頁 Worker

這是選用的維護頁與健康監測服務，不影響最小本機啟動。部署範例的監測預設關閉，未綁定網域；啟用時填入自己的 origin、route 與通知設定。

整體部署方式見
[`DEPLOYMENT-AND-OPERATIONS.md`](../../../docs/operations/DEPLOYMENT-AND-OPERATIONS.md)；
本文件只負責 Worker 的設定、驗證與回滾。

這是一個 edge adapter。它把請求轉送到獨立的 CabAI origin；只有瀏覽器原本要開啟 HTML 頁面，而且 origin 斷線、逾時、回傳核准的 5xx（500、502、503、504），或 Cloudflare 回傳 transport 52x／530 時，才改回 CabAI 維護頁。也可以啟用排程健康檢查，把中斷、恢復與聚合後的流量異常通知送到自己的 Discord 警報頻道。單一流量 5xx 只留下 structured receipt；五分鐘內第二筆才發出明確標示「尚未判定整站中斷」的診斷通知，之後 cooldown 十分鐘。

維護頁仍是 `503 Service Unavailable`，不會假裝成功。`/api/*`、Agent/OpenAPI、cron、callback、Webhook、靜態資源、非 `GET`／`HEAD` 與非 HTML request 都不會被換成 HTML。

## 行為邊界

- 正常 origin response 直接回傳，不複製或改寫 body、Cookie、CSP、cache header。
- HTML fallback 固定帶 `Cache-Control: no-store`、`Retry-After` 與 `X-CabAI-Fallback: maintenance`。
- API 在 origin 連線失敗或 Cloudflare transport 52x／530 時回穩定 JSON `503`；若應用本身已回其他 non-2xx，保留原 status、headers 與 body。
- 每個 request 最多呼叫 origin 一次。fallback renderer 出錯時回原本的 origin response，不重送 mutation。
- Worker 會加上一個 hop header；若錯誤的 DNS／route 又把 origin fetch 導回同一個 Worker，第二跳會直接停止，不會無限遞迴。
- 維護頁只有 inline HTML/CSS，沒有外部字型、圖片或 JavaScript；版面不依賴 CabAI header 高度。
- 流量異常只保存 allowlisted 原因分類、最終／上游 HTTP status、surface、計數與時間；不保存 URL、query、body、cookie 或使用者資料。

## 設定

| 變數 | 必填 | 預設 | 用途 |
| --- | --- | --- | --- |
| `ORIGIN_BASE_URL` | 是 | — | 獨立 provider origin，例如 Zeabur 提供的 service hostname。只能是根目錄 HTTPS URL，不能填公開 CabAI 網域。 |
| `ORIGIN_TIMEOUT_MS` | 否 | `8000` | origin timeout，限制在 250–30000 ms。 |
| `RETRY_AFTER_SECONDS` | 否 | `60` | 維護回應建議重試秒數，限制在 1–3600。 |
| `CONTACT_URL` | 否 | — | 維護頁聯絡入口，只接受 `https://` 或 `mailto:`。 |
| `MONITORING_ENABLED` | 否 | `false` | 正式環境明確設為 `true` 才會執行排程檢查、流量異常聚合與通知。 |
| `MONITOR_LABEL` | 否 | `CabAI 正式站` | 通知顯示名稱；演練必須改成 `CabAI 監控演練`，避免誤報。 |
| `CRON_SECRET` | 監控啟用時 | — | 呼叫 authenticated readiness；必須用 Worker secret。 |
| `DISCORD_BOT_TOKEN` | 監控啟用時 | — | 發送營運通知；必須用 Worker secret。 |
| `DISCORD_ALERT_CHANNEL_ID` | 監控啟用時 | — | CabAI 既有 Discord 警報頻道。 |

`ORIGIN_BASE_URL` 必須直接連到 Zeabur origin hostname，不可以指回 Cloudflare 上的 CabAI custom domain，否則會形成 Worker recursion。程式會攔截最明顯的同 hostname 設定，並用 hop header 阻止第二跳；但錯誤 route 仍會讓請求失敗，所以部署前仍要直接檢查 origin。

這些變數不需要包含 token。不要把 Cloudflare account ID、zone ID、route ID、origin credential 或 production hostname 提交到 repo。

## 本機測試

此目錄沒有 root package 相依，也不會修改專案 lockfile。

```powershell
Set-Location deploy/cloudflare/maintenance-worker # from the repository root
npm.cmd test
```

## 本機 preview

1. 複製 `.dev.vars.example` 為未追蹤的 `.dev.vars`。
2. 保留範例的 `http://127.0.0.1:3199` 且不要啟動該 port，即可模擬 origin 斷線。
3. 啟動 Worker：

```powershell
npm.cmd run dev
```

另開終端驗證：

```powershell
curl.exe -i -H "Accept: text/html" http://127.0.0.1:8787/products/demo-course
curl.exe -I -H "Accept: text/html" http://127.0.0.1:8787/courses/demo
curl.exe -i -H "Accept: application/json" http://127.0.0.1:8787/api/health
curl.exe -i -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:8787/api/callback
```

預期前兩個是 branded `503`，第三、四個是非 HTML `503`；任何一個都不應是 `200`。要驗證正常 passthrough，將 `.dev.vars` 的 origin 改成實際本機 CabAI server（例如另一個 local port）後重新啟動 Worker。

## Preview 與部署

先登入並確認 Cloudflare 帳號，再部署到 workers.dev；第一次不要直接掛 production route。

```powershell
npx.cmd --yes wrangler@4.110.0 login
npx.cmd --yes wrangler@4.110.0 whoami
npm.cmd run deploy -- --var "ORIGIN_BASE_URL:https://your-provider-origin.example" --var "ORIGIN_TIMEOUT_MS:8000" --var "RETRY_AFTER_SECONDS:60"
```

部署後先維持 `MONITORING_ENABLED=false`，在 workers.dev URL 驗證正常 passthrough。接著用獨立 drill Worker 與暫時不可用的測試 origin 驗證 desktop 與 mobile 維護頁、`HEAD`、API 與 callback 契約。不要用 production callback 做破壞性測試。正式 route 驗證後才用 `wrangler secret put` 設定 `CRON_SECRET`、`DISCORD_BOT_TOKEN`，並以 `MONITORING_ENABLED=true` 重新部署；Durable Object 會確保連續失敗、去重與 recovery 狀態不依賴 CabAI PostgreSQL。

確認 evidence 後，才到 Cloudflare Workers 的 Domains & Routes 將 CabAI zone route 指向這個 Worker。route 設定刻意不放在 `wrangler.jsonc`，避免開源 repo 帶入 production zone/account 資訊。

`wrangler.cabai-production.jsonc` 是可選的中性部署範例，不是已啟用的正式設定。部署者取得授權後，才把自己可直連的 origin 與通知設定加入其 Worker secret store：

```powershell
npx.cmd --yes wrangler@4.110.0 secret put ORIGIN_BASE_URL --config wrangler.cabai-production.jsonc
npx.cmd --yes wrangler@4.110.0 secret put CRON_SECRET --config wrangler.cabai-production.jsonc
npx.cmd --yes wrangler@4.110.0 secret put DISCORD_BOT_TOKEN --config wrangler.cabai-production.jsonc
npx.cmd --yes wrangler@4.110.0 secret put DISCORD_ALERT_CHANNEL_ID --config wrangler.cabai-production.jsonc
```

核准部署這個範例 profile 後，可使用：

```powershell
npm.cmd test
npx.cmd --yes wrangler@4.110.0 deploy --dry-run --config wrangler.cabai-production.jsonc
npx.cmd --yes wrangler@4.110.0 secret list --config wrangler.cabai-production.jsonc
npm.cmd run deploy:cabai-production
npx.cmd --yes wrangler@4.110.0 deployments status --config wrangler.cabai-production.jsonc
```

此範例沒有 zone route，`MONITORING_ENABLED=false`，並使用中性顯示標籤；設定包含每分鐘 Cron 與 Durable Object binding，但不代表監控已啟用。部署者必須自行驗證 origin、通知與 routes，並核准啟用。部署不會替你建立 secret。

`secret list` 只用來確認四個必要名稱存在；它不應輸出值。部署後的 production status 必須是
單一版本承接 `100%` 流量，且 route、Cron、Durable Object binding 與四個 secret binding 都還在。
若同一個 PR 也修改 CabAI App，這次 Worker deployment 只會讓 edge 部分生效；Server Action、
Next.js 或其他 App runtime 變更仍需另外部署經核准的共同來源版本。若先部署 Worker，
新 Worker 必須與目前 App 向後相容，且 release record 要把 App 部分維持為 pending。

正式切換前檢查：

1. `ORIGIN_BASE_URL` 可直接連線，而且不是 CabAI custom domain。
2. HTML origin failure 回 `503`，有 `X-CabAI-Fallback: maintenance`、`Retry-After: 60`、`Cache-Control: no-store`。
3. `/api/health`、`/api/agent/openapi.yaml` 與 callback failure 保持 non-2xx、非維護 HTML。
4. 正常頁面的 Cookie、CSP、cache 與 streaming body 沒被 Worker 改寫。
5. 外部 uptime monitor 以 HTTP status 判斷，不能只檢查是否收到 HTML。
6. Cloudflare Cron 至少產生一次測試 outage 與 recovery receipt，且 Discord 內容沒有 URL query、payload 或 secret。
7. 第一筆流量 5xx 只有 `recorded` receipt、不送 Discord；五分鐘內第二筆才送一次非 incident 診斷，且能區分 final response、origin status 與安全原因分類。

## 回滾

從 Cloudflare Domains & Routes 移除或停用這條 Worker route，即可讓請求回到原本的 origin routing。Worker 不會修改 Zeabur、資料庫或 CabAI app，因此不需要資料回滾。
