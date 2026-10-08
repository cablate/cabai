---
schema_version: behavior-contract/v1
id: agent.user-first-success
title: User Agent first-success onboarding and homepage contract
status: draft
owner_surface: api
change_context:
  type: bugfix
  reason: The homepage shows an unverified course endpoint and the User Agent settings page does not provide a concrete first successful request path.
  non_goals:
    - Do not add or change database tables, migrations, token scopes, entitlements, or production deployment settings.
    - Do not add a course-list endpoint or invent a new public API contract in this slice.
    - Do not expose complete tokens, secrets, signed URLs, or private course content in UI copy.
---

# User Agent First-success Contract

這份規格整理使用者第一次讓 AI 連上 CabAI 的流程：建立 token、讀取 API 說明，再發出第一個合法請求。後段另列尚待改善的本機 token 設定體驗。

## Change Context

CabAI 的核心差異化需要讓使用者的 AI 能正確使用公開內容與使用者權限內容。本次變更只收斂首頁展示與 User Agent 設定頁的第一成功路徑；API server contract 仍以 `src/lib/agent/openapi.ts` 及實際 route 為準。

## Behavior Boundary

### In scope

- 首頁 Agent demo 不得顯示不存在或未確認的 `/api/agent/v1/courses`。
- 首頁課程示範只能顯示已在 User Agent OpenAPI registry 中存在的 route pattern，並清楚標示它需要已授權的 course id。
- User Agent settings page 顯示一個不需要猜測 endpoint 的 first-success checklist。
- Prompt copy 指向 User-safe OpenAPI，說明先讀契約、先測試合法 read、遇到 401／403／404 停止猜測。
- UI 提供可複製的 OpenAPI URL／測試 request，但不複製或保存完整 token。

### Out of scope

- 新增 User Agent course list route。
- 修改 token scope、entitlement、ACK identity、資料庫或 migration。
- 修改 Admin Agent API 或 Admin prompt。
- 修改 production deployment、R2、Cloudflare、Zeabur 或外部 provider。

## Consumers And Entrypoints

- Browser: `/`，`src/app/(public)/sections/hero.tsx`。
- Browser: `/dashboard/settings/agent`，`src/app/(protected)/dashboard/settings/agent/page.tsx`。
- Prompt source: `src/lib/agent/prompt-copy.ts`。
- Prompt UI: `src/components/agent/agent-prompt-copy-block.tsx`。
- User-safe contract: `GET /api/agent/user/v1/openapi.yaml`。
- Authenticated first-success read: `GET /api/agent/user/v1/information?state=unread&limit=20`。
- Public discovery after the first success: `GET /api/agent/public/v1/library` or a known direct Library detail endpoint。
- User course read: `GET /api/agent/courses/{id}/content`, operationId `getUserCourseContent`, scope `course:read`。
- User Information: `GET /api/agent/user/v1/information?state=unread` and `POST /api/agent/user/v1/information/ack`。

## Inputs And State

- User must be authenticated to open the protected Agent settings page.
- A User Agent token may be newly created and is displayed once only.
- A valid token is stored by the external AI in its own secure environment; the page must not receive or display it again after creation.
- Public discovery may return zero published resources; a 200 response with an empty collection is still a valid transport test.
- Course content requires a real course id and entitlement; the UI must not instruct the AI to invent one.

## Outputs And Side Effects

- Homepage renders a truthful route string only; no API request is made by the decorative demo.
- Settings page renders ordered steps and copy controls; copy actions affect clipboard only.
- The first-success guide copies the User Agent OpenAPI URL and an authenticated Information read with `$CABAI_USER_TOKEN`; it never contains a real token.
- Creating／revoking a token keeps existing server actions and token lifecycle unchanged.
- No new database write is introduced by the first-success guide.

## UI States

- First paint: checklist and copyable guidance are visible without waiting for token list data.
- Loading: existing token list skeleton remains unchanged.
- Ready: user can create a token, copy the prompt, copy the OpenAPI URL, and copy the first test request.
- Empty: no token state explicitly tells the user to create one before testing.
- Error: existing token list error and create error remain visible; the guide must not claim the API was tested automatically.
- Disabled／safety: full token is shown only once; copied status uses accessible live feedback; no secret is written into rendered static prompt text.

## Invariants

1. User-safe OpenAPI is not the Admin OpenAPI and does not grant access by itself.
2. Every API instruction must correspond to a registered operation or a confirmed public route.
3. User Agent requests remain limited by token scope and account entitlement.
4. `401`, `403`, and `404` are reported as actual results; the AI must not try guessed alternative paths.
5. Information read state remains associated with `userId`, not a token id.
6. Homepage animation is illustrative and must not imply a live request or a successful entitlement check.

## Acceptance Examples

### Homepage contract

```gherkin
Given a visitor opens the homepage
When the Agent conversation demo reaches the course scenario
Then the displayed path is the registered User Agent path /api/agent/courses/{id}/content
And it does not display /api/agent/v1/courses
And the text makes clear that course access requires the user's entitlement
```

### First-success onboarding

```gherkin
Given an authenticated user opens /dashboard/settings/agent
When no token exists
Then the page explains create token → provide token securely → read User OpenAPI → run one public read
And it does not display a fake token or ask the user to guess a course id
```

```gherkin
Given the user has created a token
When the user copies the first request
Then the copied request points to the confirmed User Information read route
And the page explains that a 200 response, including an empty `items` collection, proves User Agent transport and token scope wiring
And the page does not claim that this proves course entitlement
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/agent/action-resolver.test.ts
  component:
    - src/components/agent/agent-prompt-copy-block.component.test.tsx
    - src/components/agent/agent-first-success-guide.component.test.tsx
  contract:
    - src/lib/agent/openapi.contract.test.ts
    - src/app/api/agent/user/v1/openapi.yaml/openapi-yaml.contract.test.ts
  manual:
    - Open /dashboard/settings/agent at desktop and mobile widths.
    - Create a short-lived token in a local test environment and run the copied authenticated Information read with curl.
    - Confirm 401/403/404 guidance does not suggest guessed fallback routes.
```

## Evidence

- Before: `src/app/(public)/sections/hero.tsx:25` displayed `GET /api/agent/v1/courses`.
- Contract source: `src/lib/agent/openapi.ts:447-454` registers `getUserCourseContent` at `/api/agent/courses/{id}/content` with `userKey` and `course:read`.
- User projection: `src/lib/agent/openapi.ts:981-1021` filters public／userKey operations.
- User course route: `src/app/api/agent/courses/[id]/content/route.ts`.
- User prompt and shared deployment base URL: `src/lib/agent/prompt-copy.ts`.
- First-success guide: `src/components/agent/agent-first-success-guide.tsx` and `src/app/(protected)/dashboard/settings/agent/page.tsx`.

## Intentional Changes

- The homepage course scenario changes from an unverified versioned path to the registered User Agent course path pattern.
- The Agent settings page gains explicit first-success guidance; it does not perform an automatic API call. The recommended first request is the authenticated unread Information read, so an empty result still proves the token path works.

## Remaining gap: local token setup

The connection prompt assumes `CABAI_USER_TOKEN` already exists in the AI tool’s environment. Creating a key in CabAI does not configure that environment. The remaining onboarding work is to explain where to set the token and when to restart the tool, without asking users to paste secrets into ordinary chat.

### Required next slice

- Add a visible step between Key creation and prompt copy that explains what `CABAI_USER_TOKEN` is and where it is configured.
- Let the user select the target environment, initially covering Windows Codex Desktop and terminal-launched agents such as Codex CLI／Claude Code; other platforms must be labelled rather than guessed.
- Provide copyable setup commands that prompt for the Token at execution time and do not embed the Token in command history, rendered HTML, analytics, logs, or screenshots.
- Explain process inheritance: a desktop application opened before a User-level environment variable is created must be fully restarted; a temporary shell variable only reaches tools launched from that shell.
- Update `USER_AGENT_PROMPT` so a missing `CABAI_USER_TOKEN` is reported as local credential setup—not an API outage—and the AI gives concrete environment-appropriate steps without asking for the complete Token in chat.
- Preserve the current first authenticated read, 200／empty-success interpretation, entitlement boundaries, and ACK-only-after-processing rule.

### Additional acceptance examples

```gherkin
Given the user has copied a newly created User Agent Key
When the user reaches the connection instructions
Then the page explains exactly where the Key is configured for the selected Agent environment
And the setup command does not contain the real Key
And the page explains whether the Agent must be restarted
```

```gherkin
Given an AI receives the CabAI prompt without CABAI_USER_TOKEN in its environment
When it begins the first-success flow
Then it identifies a local credential setup gap before making an authenticated request
And it provides concrete setup guidance for the user's Agent environment
And it does not request or print the complete Token in chat
```

```gherkin
Given CABAI_USER_TOKEN is available after setup
When the AI retries the flow
Then it reads the User OpenAPI and performs the confirmed Information GET
And HTTP 200 with an empty collection is reported as a successful connection
And ACK is sent only for Information items actually read and handled
```

## Open Questions

- Should a future User Agent course listing operation be added so an AI can discover entitled course ids without relying on a human-provided id? This is intentionally deferred from this slice.
- Which canonical published Library resource should production use as the default first-success fixture? The guide may use collection discovery until the owner selects a stable resource.
- Which Agent environments must receive first-class maintained setup instructions beyond Windows Codex Desktop and terminal-launched Codex／Claude Code? This requires an owner-supported matrix so the UI does not promise unverified setup behavior.
