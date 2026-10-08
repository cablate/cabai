---
schema_version: behavior-contract/v1
id: agent-api.ai-consumption
title: AI-friendly Agent API consumption
status: draft
owner_surface: api
last_validated: 2026-07-22
change_context:
  type: feature
  reason: Make Agent API retrieval more precise and token-efficient for user AIs.
  non_goals:
    - Do not change existing authorization or entitlement semantics.
    - Do not decide authenticated Skill Markdown visibility in this slice.
    - Do not add proactive notifications or change the read-state data model.
    - Do not change database schema, migrations, dependencies, or lockfiles.
    - Do not include the separate public homepage UI work.
---

# Agent API AI 消費行為契約

這份草案規劃讓 AI 先讀摘要、需要時再取完整內容，減少多餘資料。欄位與權限以實際 OpenAPI 為準；下方待決項目仍是設計問題。

## 文件用途

這份契約定義本次 Agent API 最佳化的可驗收行為。目標是讓使用者的 AI 能夠先取得足以判斷的摘要，再只針對確定需要的資源讀取完整內容；它不取代 OpenAPI，也不取代權限規則。

## Behavior boundary

### In scope

- 為 Library、Skill、課程與 Information 提供清楚的摘要／詳細資料分層。
- 讓 User Agent API 的 response schema 與實際 JSON 一致，避免 `unknown` 迫使 AI 猜測欄位。
- 讓使用者 AI 可以依帳號權限取得課程摘要，並在需要時進入受保護的課程內容流程。
- 保留公告的 user-scoped read state 與 ACK 語意。
- 讓 User OpenAPI 只描述使用者可用的 contract 與其必要 schema。

### Out of scope

- 不重新設計 Admin Agent API。
- 不改變目前的權限、購買資格、公告可見性或 Skill access policy。
- 不決定 authenticated Skill 是否應隱藏 `contentMarkdown`；這是另一個需要 owner decision 的產品／權限決策。
- 不引入資料庫 migration、背景通知、主動推播或新的外部服務。

## Consumers

- 使用者的 AI 透過 User OpenAPI 判斷可用 operation、參數與 response schema。
- 使用者本人透過網站閱讀完整內容；網站既有的前端相容性不應因 API 摘要化而被破壞。
- Admin 與內容維護流程仍使用既有 Admin contract，不在本次修改範圍內。

## Inputs and state

- User Agent API 的 API key／使用者身份。
- 使用者的課程 entitlement。
- 公告的發布狀態、可見性、過期時間與 user-specific read state。
- Library／Skill 的發布狀態與既有 slug、id 查詢方式。

## Outputs

- Collection/list response 優先返回識別、標題、摘要、狀態、更新時間與下一步查詢所需欄位；不在摘要中重複完整 Markdown、所有版本或大型 nested payload。
- Detail response 返回該資源的完整可讀內容與既有權限結果。
- 所有新增或收斂的 response 都必須能在 User OpenAPI 中以具名 schema 描述。
- 權限不足、找不到、暫時不可用等狀態仍使用現有錯誤語意，不以空資料冒充成功。

## Invariants

1. API 不因為摘要化而暴露使用者沒有 entitlement 的課程內容。
2. 公告 ACK 仍以伺服器端 user identity 判斷，不以 API key 或 token 本身當作讀取身份。
3. 已發布且可見的內容才會出現在對應公開／使用者 collection。
4. 已知 slug 或 id 的 detail 查詢可以直接使用，不要求 AI 先掃描整個清單。
5. 列表與詳細資料的欄位名稱、型別與 HTTP 狀態必須和 OpenAPI 一致。
6. 既有網站前端依賴的服務函式不得被改成只返回摘要；API projection 應與前端 projection 分離。

## Acceptance examples

### Library

- Given `GET /api/agent/public/v1/library`, the response contains published entry summaries and does not contain `bodyMarkdown`.
- Given a known slug, `GET /api/agent/public/v1/library/{idOrSlug}` returns that entry's `bodyMarkdown` without requiring a preceding list request.

### Skill

- Given `GET /api/agent/public/v1/skills`, the response contains enough metadata to choose a Skill but does not embed full `contentMarkdown` or every historical release.
- Given a known Skill id／slug and an allowed detail operation, the response preserves the existing content and access-policy behavior.

### Courses

- Given a valid user key with `course:read`, the User contract exposes an entitled-course summary collection.
- A user without entitlement cannot obtain a course's protected lesson content through the summary route or by changing an identifier.
- Existing lesson content retrieval remains permission-checked and is not silently broadened.

### Information

- Given `GET /api/agent/user/v1/information?state=unread`, the AI can request a compact summary when it only needs to discover relevant announcements.
- Given a known information id, a detail request returns the full `bodyMarkdown` only when the item is visible to that user.
- After the AI has processed the item, `POST /api/agent/user/v1/information/ack` still records the server-side user's read state and remains idempotent under the existing contract.

### User OpenAPI

- The User OpenAPI contains only user/public paths and the response/request schemas needed by those paths.
- A consumer can determine operation id, required security, path/query/body parameters, success response shape, and documented error shape without reading Admin-only schemas.

## Test mapping

- Service projection tests prove summary/detail field boundaries.
- Route tests prove authentication, entitlement, visibility, and error behavior.
- OpenAPI tests prove User path filtering, component reachability, operation ids, and response schema references.
- Existing frontend/service tests prove that the public website's current content projections remain compatible.

## Intentional changes

- Collection payloads become smaller and more selective for Agent API consumers.
- Known-resource detail retrieval becomes a first-class documented path where it is currently missing.
- User course discovery becomes explicit in the User Agent API contract.
- Existing authorization and read-state semantics remain unchanged.

## Open questions / owner decisions

- Should authenticated Skill detail expose Markdown to an authenticated user, or only metadata/download instructions?
- Should the default Information collection response remain full-content for backward compatibility, with `include=summary` opt-in, or should a versioned User API default to summaries?
- Should future collection endpoints add cursor pagination after this field-boundary work, based on real content volume rather than speculation?
