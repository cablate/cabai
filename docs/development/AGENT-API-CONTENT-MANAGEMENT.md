# Agent API 內容管理指南

本文件說明如何透過 Agent API 管理 Library、Skill 與 Information。它是操作指南，不取代即時 OpenAPI。Admin Agent 操作前讀取 `/api/agent/openapi.yaml`；User Agent 操作前讀取 `/api/agent/user/v1/openapi.yaml`，確認部署上的 operation、schema 與 scope。

內容歸屬先說清楚：Skill、Library 與 Course 是可被取用的正式內容；Information 是公告與導航層，不是每次內容更新都必須建立的副本。Skill 每次版本更新不會自動產生公告；只有重大更新或擁有者明確要求通知時，才另外建立公告。

## 先分清楚三種角色

| 角色 | Token | 用途 | 不能做的事 |
| --- | --- | --- | --- |
| Admin Agent | `cab_agent_*` | 建立草稿、修改、檢查 readiness、發布 | 不會因為拿到 key 就自動擁有新 scope |
| User Agent | `cab_user_*` | 代表一位 user 讀取自己的課程、Skill、未讀 Information | 不能建立或發布內容 |
| Public Agent | 不需 token | 讀公開 Library、公開 Skill metadata、公開 Information 對應頁面 | 只能看到已發布且允許公開的資料 |

User Agent 的已讀狀態跟 user 綁定，不跟 token 綁定。使用者換 key，只要 key 還是同一個 user，未讀與已讀紀錄仍然保留在伺服器。

## Codex Plugin 分界

Repository 內提供兩個可獨立驗證與發版的 Codex Plugin source：

| Plugin | Source | Contract | Credential | 邊界 |
| --- | --- | --- | --- | --- |
| CabAI | `plugins/cabai` | User-safe OpenAPI | `CABAI_USER_TOKEN`／`cab_user_*` | Public discovery、個人課程、Skill、Information 與 ACK；不得載入 Admin contract 或執行管理 mutation |
| CabAI Admin | `plugins/cabai-admin` | Admin OpenAPI | `CABAI_ADMIN_TOKEN`／`cab_agent_*` | 只在 token scope 與當次使用者要求共同授權時執行管理操作；不得以 User token 替代 |

兩個 Plugin 共用同一套 canonical service 與 live OpenAPI，不複製後端路由。安裝 Plugin 本身不授予 CabAI 權限；權限仍由伺服器驗證 token、scope、user identity 與 entitlement。一般使用者不需要安裝 CabAI Admin。

發行面明確分開：`cabai` 透過現有 CabAI Skill release／R2 管線提供公開 ZIP 下載，由使用者自行安裝；`cabai-admin` 只透過私下下載交付給授權操作者。完整封裝、發布與權限邊界見 [`../contracts/cabai-plugin-distribution.md`](../contracts/cabai-plugin-distribution.md)。

修改任一 Plugin 後執行：

```bash
npm run check:agent-skill
npm run check:plugin-package
```

`check:agent-skill` 同時維持 route／OpenAPI parity 與兩個 Plugin 的 credential、contract、mutation boundary。Plugin 發布與 marketplace 安裝屬於獨立 release 動作；不得因 source 進入 repository 就宣稱使用者已安裝或正式 marketplace 已更新。

## Admin Agent 的權限

| 領域 | 讀取 | 草稿修改 | 發布／撤回 |
| --- | --- | --- | --- |
| Library | `library:read` | `library:write` | `library:publish` |
| Skill／Release | `skill:read` | `skill:write` | `skill:publish` |
| Information | `information:read` | `information:write` | `information:publish` |

Skill artifact 上傳另外需要 `media:write`。既有 key 不會自動得到上述新權限，請在 Admin 的 API key 管理畫面明確授權最小必要 scope。

## 通用安全規則

1. 先 GET 對應角色的 live OpenAPI，再使用 operationId；Admin 使用完整契約並帶 `cab_agent_*`，User 使用 User-safe 契約並帶 `cab_user_*`。不要從記憶拼 endpoint 或 request body。
2. 每個 create 與有外部／公開影響的 lifecycle 操作都帶唯一 `Idempotency-Key`。重試同一 key 加同一 payload 應得到同一資源；同一 key 換 payload 應得到 `409`。
3. PATCH 帶 `expectedRevision`。遇到 `409` 先重新 GET，再依新 revision 重算，不要盲目重送。
4. publish、withdraw、deprecate 帶 `x-confirm-destructive: true` 與 `x-confirm-entity-id: <path entity id>`。
5. 不自行指定由 server 推導的 `audience`、action payload（若有）、checksum、artifact validation evidence 或發布時間。
6. 不把 `cab_*` token、signed URL、email、完整 webhook body 寫入文件、log 或 commit。

## Library：一篇可公開閱讀的 Markdown 資源

管理端點：

- `POST /api/agent/library-entries`：建立 draft，帶 `slug`、`title`、`summary`、`bodyMarkdown`、`tags`、`featured`。
- `GET/PATCH /api/agent/library-entries/{id}`：查看或以 `expectedRevision` 修改 draft。
- `POST /api/agent/library-entries/{id}/readiness`：檢查內容、slug 與發布前置條件。
- `POST /api/agent/library-entries/{id}/publish`：發布 Library 與其受治理的 Information bundle。
- `POST /api/agent/library-entries/{id}/withdraw`：撤回公開內容與對應 bundle。

建議流程：建立 → 完整寫入 Markdown → readiness → 修正 issues → publish → 用 public endpoint 讀回確認。

公開讀取：`GET /api/agent/public/v1/library` 與 `GET /api/agent/public/v1/library/{idOrSlug}`。列表只有摘要；detail 才含 `bodyMarkdown`。未發布 draft 不會出現。

### 直接修正已發布 Library

`library:write` 與既有 PATCH 同時支援 draft 和 published Library，不需要額外 scope 或 revision endpoint。修改 published 內容時仍需帶最新 `expectedRevision`；ID、slug、status、`publishedAt` 與公開 URL 保持不變，成功後會刷新 Library 公開快取。published slug 不可修改，withdrawn 內容仍不可編輯。

Library 修正不會重新發布 Information，也不會重設使用者 ACK。既有 published Information 是歷史公告，只要仍指向同一個 Library identity，就不因文章後續修正而失效。完整行為與非目標見 [`../contracts/library-published-editing.md`](../contracts/library-published-editing.md)。

## Skill：CabAI catalog 與完整內容來源

Skill 詳情頁的主要介紹使用 Skill-level `bodyMarkdown`。它是自由格式 Markdown，直接放用途、適用情境、限制與導覽；這份 catalog 介紹可以透過既有 Skill PATCH 更新，不需要為修字或繁中說明建立新的 SkillRelease。`changelogMarkdown` 只保留真正的版本變更，兩者不要混用。

Skill 支援兩種 distribution：

- `github`：免費公開 Skill 的完整內容以 GitHub repository 為準。管理者指定 `sourceRepositoryUrl` 與固定 `sourceRef`；`sourceCommitSha` 與 `sourceVerifiedAt` 是 server-owned 驗證證據，不可由 Agent 自行填寫。公開頁與 Agent API 直接提供固定來源、安裝手冊與完整 source archive。CabAI 不再把介紹 stub 當成可安裝 artifact。
- `hosted`：付費、authenticated 或不適合公開 GitHub 的 Skill，仍使用 SkillRelease artifact、checksum、R2 signed download 與既有存取政策。

`SkillRelease.version` 僅保留為 CabAI 內部發布生命週期與稽核識別。`github` Skill 的公開頁與公開 Agent API 不輸出這個欄位；安裝來源直接使用 `distribution` 提供的 GitHub 固定網址。只有 `hosted` Skill 對外維持 CabAI 版本化 release。

管理端點：

- `POST /api/agent/skills`、`PATCH /api/agent/skills/{id}`：建立與修改 Skill draft。
- `POST /api/agent/skills/{id}/releases`、`PATCH /api/agent/skill-releases/{releaseId}`：建立與修改版本 draft。

建立或修改 release 時可直接傳入：

```json
{
  "version": "1.0.0",
  "contentMarkdown": "## 這個 Skill 做什麼\n\n直接貼上完整 Markdown 內容。",
  "changelogMarkdown": "Initial release"
}
```
- `POST /api/agent/skill-releases/{releaseId}/readiness`：檢查 parent、version、license、artifact binding、checksum、archive validation。
- `POST /api/agent/skill-releases/{releaseId}/publish-skill-only`：只發布已通過 readiness 的 Skill release，不建立或發布 Information。
- `POST /api/agent/skill-releases/{releaseId}/publish`：發布 Skill、release 與 Information bundle；只在明確需要 source-backed 公告時使用，不應因每次版本更新而使用。
- `POST /api/agent/skill-releases/{releaseId}/deprecate`、`withdraw`：管理版本生命週期。

### 只更新 CabAI catalog 介紹

名稱、摘要、tags、`bodyMarkdown` 與 GitHub source metadata 屬於 Skill metadata。已發布 Skill 可使用既有 PATCH，在正確 `expectedRevision`、確認標頭與 idempotency key 下更新；slug 仍不可修改。成功後讀回 public endpoint，不建立 SkillRelease 或 Information。

### 發布真正的 Skill 版本

Hosted Skill 的新版本仍建立 release draft、上傳並驗證 artifact，再呼叫 `publish-skill-only`。GitHub-backed Skill 則先在 repository 建立正式 tag／Release並取得 commit SHA，再更新 Skill source metadata；CabAI release 不要求重複上傳 artifact。

```text
建立新 release draft
  → 上傳並 confirm artifact
  → 寫入以繁體中文為主的 contentMarkdown
  → readiness
  → POST /api/agent/skill-releases/{releaseId}/publish-skill-only
  → 讀回 public / user Skill endpoint
```

只有在內容同時需要通知使用者時，才建立 Information。一般重大 Skill 更新建議先用 `publish-skill-only`，再建立獨立 `manual_announcement`，並用穩定 Skill slug endpoint 導航；不要讓公告綁定特定 release version，也不要為了讓 Skill 出現在公開頁面而建立公告。

Hosted artifact 流程一定要走既有 upload／media contract：取得 signed upload target → 上傳 → confirm → 將確認過的 media 綁到 release → readiness。不能手填 checksum 或繞過 ZIP validator。GitHub-backed Skill 不應上傳介紹 stub 來假裝滿足完整 artifact。

GitHub-backed Skill 使用 `/api/agent/public/v1/skills` 與 `/api/agent/public/v1/skills/{idOrSlug}` 提供的 `distribution` 固定網址，不使用 CabAI release 版本流程。`.../releases/{version}` 與 `.../download` 主要保留給 hosted Skill；authenticated hosted release 由 User Agent token、entitlement 與 R2 signed target 決定是否可取得。

## Information：公告與 AI 導航，不是內容副本

Information 是短摘要、為什麼重要、tags 與可選導引的公告入口。它可以單獨存在，也可以由 Library、Skill 或 Course bundle 產生；但它不是 Skill 更新的必要步驟。一般公告不需要 `actions` 才算完整，主要引導可以直接寫在 `bodyMarkdown`。

source type：

- `manual_announcement`：獨立公告，不需要 `sourceId`；`manual.announcement` 可用來發布一般公告。
- `library_entry`／`skill_release`：介紹對應資源；只有擁有者要求公告時才走 bundle 管理。
- `course`：`course.announced` 面向 `all_users`；`course.published` 面向 `source_entitled`。
- `api_operation`：介紹一個已註冊的 API operation。

`audience`、source facts 與 action 可用性由 server 推導；Admin Agent 不能把付費內容硬標成公開，也不能在沒有對應 endpoint 時虛構 action。

公告若同時要服務人類與 AI，`bodyMarkdown` 應分開寫清楚兩種指引：

- 人類讀者：提供網站頁面、文件或下載連結。這是人類使用的 URL，不等於 Agent API endpoint。
- AI 讀者：若目標資源已知，直接提供完整的 Agent API endpoint；不要先列清單、搜尋 slug 或要求 AI 填寫 `{idOrSlug}`、`{version}`、`{BASE_URL}`。一般 Skill 公告使用穩定 slug endpoint，只有明確介紹特定歷史版本時才提供 release endpoint；同時說明內容是公開或需要 entitlement。

若缺少必要的穩定 slug、scope 或 entitlement，應明確標示無法判斷，讓 AI 回報限制，不要猜測 endpoint。公告內不需要列出 operationId；URL 已明確時不應再要求 AI 探索。不得把 token、signed URL 或 secret 寫入公告內文。

管理端點：

- `POST /api/agent/information/drafts/from-source`：先取得 source facts、可用 kind、audience 與 action templates；不建立資料。
- `POST /api/agent/information`：建立 standalone 或 source-backed draft；`bodyMarkdown` 可保存完整公告內文，最多 100,000 字元。
- `GET/PATCH /api/agent/information/{id}`：預覽與修改 authorable fields，包含 `bodyMarkdown`。
- `POST /api/agent/information/{id}/readiness`：驗證 source、audience 與生命週期；若有 action，也一併驗證 action。
- `POST /api/agent/information/{id}/publish`、`withdraw`：管理 standalone lifecycle。
- `GET /api/agent/information/coverage`、`/{id}/stats`：查看彙總覆蓋與讀取統計，不回傳 user 清單。

## User Agent 的拉取與已讀

User Agent 的契約是 `/api/agent/user/v1/openapi.yaml`。這份文件只列公開讀取與 User Agent 路徑；它不是權限授予，實際 endpoint 仍會檢查 token、scope 與 entitlement。

```text
GET  /api/agent/user/v1/information?state=unread&limit=20
POST /api/agent/user/v1/information/ack
     { "informationIds": ["info_..."] }
```

回應可能帶 opaque `nextCursor`；下一頁把它原樣帶回 `cursor`。GET 不會自動標記已讀，AI 真的處理完資訊後才批次 ACK。ACK 是 server-side 的 `(userId, informationId)` 對應，最多一次 100 筆且可重送。

AI 應先閱讀 `bodyMarkdown` 中的 Agent API 指引。若公告另外提供 `action`，只把其中的 `operationId` 與允許的 parameters 當作導航提示；`credential=none` 走 public endpoint，`credential=user` 走 User Agent endpoint。若沒有匹配 operation、必要 ID 或權限，回報無法執行，不要自行猜 URL。

## 發布後驗證清單

1. 用 Admin Agent GET 回讀 resource，確認 status、revision 與 bundle 關聯。
2. 不帶 token 讀 public endpoint，確認只有允許公開的資料出現。
3. 用測試 user key 讀 user endpoint，確認 entitlement 與 accessPolicy 邊界。
4. 拉 unread → 讀取 `bodyMarkdown` 與（若有）action → 依明確指引呼叫對應工具 → ACK → 再拉 unread，確認換 key 仍維持狀態。
5. 檢查 Zeabur logs、R2 object HEAD／checksum 與 migration tag；不要只因 Admin API 回 200 就宣稱正式部署完成。

## 變更時要同步什麼

當 endpoint、schema、scope、source kind、publish coordinator 或 artifact contract 改變時，同步更新 `src/lib/agent/openapi.ts`、`docs/openapi/agent-v1.json`、本文件、Agent API skill 及受影響 tests。執行 `npm run openapi:check`、`npm run check:agent-skill`、`npm run typecheck` 與 focused contract/integration tests。Skill 內容預設以繁體中文撰寫；API operationId、path、欄位名稱與程式碼識別字保留原文，避免 AI 呼叫時誤讀。

## GitHub repository 與 CI/CD

免費公開 Skill 應把 GitHub repository 當作完整內容的 canonical source；CabAI 負責 catalog、穩定 slug、來源驗證、Agent API 與必要公告。GitHub-backed Skill 的安裝來源以結構化 `distribution` 網址為準，版本由來源 repository 管理。行為契約見 [`../contracts/skill-github-distribution.md`](../contracts/skill-github-distribution.md)。

目前 live Agent API 尚未提供完整的外部 CI artifact upload／confirm／bind contract，因此不要把 GitHub Actions 直接接到 R2，也不要把現有網站 session upload route 當成機器對機器 API。下一階段應先補受控 artifact intake，再以 protected GitHub Environment、最小 scope 的 per-repo key、tag-based release、readiness、owner approval 與 public read-back 逐步開啟自動發布。
