---
schema_version: behavior-contract/v1
id: skills.github-canonical-distribution
title: GitHub-backed Skill 發布與取得契約
status: active
owner_surface: shared
change_context:
  type: migration
  reason: 公開 Skill 的 CabAI catalog 版本與 GitHub 真實版本分離，且 CabAI 下載檔可能只是介紹 stub。
  non_goals:
    - 刪除付費或私有 Skill 所需的 CabAI hosted artifact 能力。
    - 自動建立 GitHub tag 或 Release。
    - 讓可變動的 main branch 取代固定 tag 或 commit。
---

# GitHub-backed Skill 發布與取得契約

公開 Skill 可以把完整內容放在 GitHub，CabAI 負責介紹和連到固定版本。另一種 hosted 模式則由 CabAI 保存與提供 ZIP；兩種模式的版本和下載方式在這裡說明。

## Change Context

免費公開 Skill 可以把 GitHub repository 當作完整內容的唯一真實來源。CabAI 負責介紹、穩定 slug、來源驗證、Agent API 導航與必要公告；不得把只有公開簡介的 CabAI artifact 描述成完整可安裝 Skill。

## Behavior Boundary

範圍內：

- Skill 可明確選擇 `hosted` 或 `github` distribution。
- `github` Skill 必須保存 repository URL 與固定 source ref；可保存已驗證 commit SHA 與驗證時間。
- 公開頁與 Agent API 直接提供 GitHub repository、固定版本的安裝手冊及完整 source archive。
- GitHub-backed Skill 的 CabAI catalog 文字可在不建立新 SkillRelease 的情況下更新。
- 舊 CabAI artifact 保留作為歷史資料，但不再成為 GitHub-backed Skill 的公開下載來源。

範圍外：

- GitHub webhook、排程 reconciliation 與自動 Release 發布。
- 付費／authenticated hosted artifact 的存取政策變更。
- 刪除既有 SkillRelease、media 或 checksum 歷史。

## Consumers And Entrypoints

- 瀏覽器：`/skills`、`/skills/{slug}`。
- Public Agent API：`GET /api/agent/public/v1/skills`、detail、release 與 download。
- User Agent API：Skill release 與 download。
- Admin Agent API：Skill create、get、patch。
- 後台：`/admin/skills/new`、`/admin/skills/{id}`。
- 資料：`skills`、`skill_releases`、`media`。

## Inputs And State

- `hosted`：GitHub source 欄位必須為空，release readiness 維持 artifact、checksum 與 archive 驗證。
- `github`：`sourceRepositoryUrl` 與 `sourceRef` 必填；`sourceCommitSha` 若存在必須是 40 字元小寫 SHA。
- `sourceVerifiedAt` 只能與 `sourceCommitSha` 一起存在。
- 已發布 Skill 的 slug 不可修改；catalog 內文與 source metadata 仍需 revision、確認標頭及 idempotency key 才能更新。

## Outputs And Side Effects

- Public projection 提供結構化 `distribution` 與固定 GitHub 網址，AI 不必從 Markdown 猜 repository URL。
- GitHub-backed public projection 不輸出 CabAI release version 或 CabAI artifact checksum。
- GitHub source ref 與 commit 僅作為後台驗證資料，不另以公開版本欄位輸出。
- GitHub-backed download 回傳 GitHub 固定 commit 的完整 source archive，不建立 R2 signed URL。
- Hosted download 維持現有 R2、checksum、權限與 expiry 行為。
- catalog 文字更新會清除公開 Skill cache，但不建立新的 SkillRelease 或 Information。

## UI States

- Loading、error 與 empty state維持現有公開 Skills 行為。
- GitHub-backed ready state顯示 GitHub 完整內容、固定版本安裝手冊、完整來源下載及 Agent API 入口。
- GitHub-backed ready state不得顯示 CabAI stub checksum 或「下載 Skill 檔案」。
- Hosted ready state維持登入、權限不足與可下載狀態。

## Invariants

- GitHub 是 `github` distribution 的完整內容與版本來源；CabAI catalog revision 不是 upstream Skill 版本。
- GitHub-backed Skill 在 CabAI 公開頁與公開 Agent API 沒有版本欄位；內部 release 僅供生命週期與稽核使用。
- GitHub source URL 必須來自結構化欄位，不得再以 Markdown regex 作為正式資料來源。
- 有 commit SHA 時，安裝手冊與 archive 必須固定到該 SHA。
- GitHub-backed Skill 不得因 CabAI 介紹文字變更而要求新 artifact 或增加 upstream 版本。
- Hosted artifact 的 checksum、存取政策與 fail-closed 行為不得弱化。

## Acceptance Examples

```gherkin
Given Example Skill 是 GitHub-backed Skill，sourceRef 是 v0.1.0 且已驗證 commit
When 匿名使用者開啟 /skills/planseal
Then 主要入口指向 GitHub repository
And 安裝手冊與下載網址固定到已驗證 commit
And 頁面不提供 CabAI stub artifact 下載
```

```gherkin
Given 一個 authenticated hosted Skill 已發布
When 未登入使用者開啟 Skill 詳情
Then 頁面仍要求登入
And 不暴露 R2 signed URL
```

```gherkin
Given GitHub-backed Skill 的公開介紹需要修字
When 管理 Agent 以正確 revision、確認標頭與 idempotency key PATCH bodyMarkdown
Then Skill catalog 更新並重新驗證公開 cache
And 不建立新的 SkillRelease
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/services/skill-release-service.test.ts
  component:
    - src/components/public/skills/skill-catalog.component.test.tsx
  contract:
    - src/app/api/agent/__tests__/skill-download-routes.contract.test.ts
    - src/app/(public)/skills/[slug]/releases/[version]/download/route.contract.test.ts
  migration:
    - npm run check:migrations
  manual:
    - 開啟三個正式 Skill 頁，確認 GitHub 與安裝入口，且沒有 CabAI stub 下載 CTA。
```

## Evidence

測試涵蓋固定來源網址、公開欄位、hosted／GitHub 分流及安裝來源。請依上列 Test Mapping 重跑；實際 GitHub repository 的內容與版本要在指定 ref 上確認。

## Intentional Changes

- GitHub-backed Skill 的安裝來源由 CabAI artifact 改為 GitHub 固定來源。
- `bodyMarkdown` 成為 Skill catalog 文字；release-level `contentMarkdown` 保留相容與歷史用途。
- GitHub-backed release 不再要求 CabAI artifact readiness。

## Open Questions

- GitHub Release webhook 與每日 reconciliation 的正式 owner、credential 與告警方式。
- 是否建立自訂 GitHub Release asset；第一版使用 GitHub 完整 source archive。
