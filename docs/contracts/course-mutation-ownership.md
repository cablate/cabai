---
schema_version: behavior-contract/v1
id: admin.course-mutation-ownership
title: Admin course mutations use canonical domain services
status: active
owner_surface: shared
change_context:
  type: refactor
  reason: Admin course actions duplicate database mutations and can bypass the active-purchase deletion guard used by the Agent API.
  non_goals:
    - Refactor chapter or lesson mutations.
    - Change course publish-readiness or outline-reorder behavior.
    - Redesign checkout, purchases, entitlement revocation, or course archival policy.
---

# Admin Course Mutation Ownership Contract

後台和 Agent 共用課程服務來建立、修改、封存與刪除課程。這份規格說明各入口怎麼驗證權限，以及如何保護仍有有效購買者的課程。

## Behavior Boundary

**In scope:** Admin 建立、更新、軟刪除、還原與封存課程；Agent course CRUD／archive／unarchive／restore 的既有呼叫路徑；相關 audit log、revision、media orphan、`plans.hasPlatformContent` 與頁面 revalidation。

**Out of scope:** chapter／lesson CRUD、`publishCourseBundle`、`reorderCourseOutline`、購買撤銷與對外 provider 行為。UI 不新增永久刪除，資料仍採 soft delete。

## Consumers And Entrypoints

- Browser: `src/app/admin/courses/create-course-form.tsx`、`src/app/admin/courses/[id]/page.tsx`。
- Admin server actions: `src/app/admin/courses/actions.ts#createCourse|updateCourse|deleteCourse|restoreCourse|archiveCourse`。
- Agent API: `src/app/api/agent/courses/route.ts`。
- Agent lifecycle: `src/lib/services/agent-content-service.ts#archiveAgentCourse|unarchiveAgentCourse|restoreAgentCourse`。
- Canonical domain owner: `src/lib/services/course-service.ts`。
- Stored data: `courses`、`chapters`、`lessons`、`planCourses`、`userPurchases`、`auditLogs`、`contentRevisions`、`plans.hasPlatformContent`。

## Inputs And State

- Admin action 必須先通過 `requireAdminAction` 對應 scope；actor 為 `{ type: "user", id: session.user.id }`。
- Agent route／service 必須保留既有 API key scope、destructive confirmation 與 agent actor。
- 刪除保護只在課程為 `published`、仍連結至少一個 active plan，且該 plan 存在 `revokedAt IS NULL` 的 purchase 時觸發。
- 建立／更新輸入仍受既有 form schema 與 domain length limits 約束。

## Outputs And Side Effects

- 建立成功：回傳 `{ success: true, courseId }`，建立 course、可選的 `planCourses` link、audit log，並 revalidate Admin／public plan routes。
- 更新成功：回傳 `{ success: true }`，建立 revision、更新 course、寫 audit log，並 revalidate Admin course routes。
- 刪除成功：soft-delete course、chapters、lessons；更新 linked plan content flag；orphan course media；寫 audit log；revalidate linked routes。
- 刪除被阻擋：不更新上述資料、不 orphan media、不寫 delete audit；Admin 顯示可操作的繁體中文錯誤，Agent 保留既有 `withApiHandler` JSON failure behavior；本次不新增特定 HTTP status mapping。
- 還原／封存：由 domain service 更新狀態與 audit；Admin wrapper 只保留 auth、輸入轉換、revalidation 與 UI result。

## UI States

- Ready：刪除按鈕可操作，點擊前要求確認。
- Loading：刪除進行中按鈕 disabled／loading，避免重複送出。
- Success：顯示成功通知並回到 `/admin/courses`。
- Blocked：留在目前課程頁，顯示「有有效購買者，請封存或先撤銷權限」訊息。
- Unexpected error：留在目前課程頁，顯示一般刪除失敗訊息；不得把 stack、SQL 或 secret 顯示給使用者。

## Invariants

1. Admin 與 Agent 不得各自實作 Course CRUD／archive 的資料庫 mutation。
2. 已發布且仍有有效購買者的課程不能被任何入口 soft-delete。
3. 被阻擋的刪除不能改變 course／chapter／lesson、media 或 audit state。
4. 成功刪除仍是 soft delete，且 `deletedBy` 使用實際 actor id。
5. Admin auth scope、Agent scope／destructive confirmation、audit actor type 不得因重構改變。
6. `publishCourseBundle` 與 outline reorder 維持各自既有 canonical owner。

## Acceptance Examples

```gherkin
Given a published course is linked to a plan with an active purchase
When an authenticated admin tries to delete the course
Then the action reports that the course cannot be deleted
And the course, chapters, and lessons remain active
And no delete audit or media orphan side effect is produced
```

```gherkin
Given a draft course has no active purchase
When an authenticated admin confirms deletion
Then the course, chapters, and lessons are soft-deleted by that admin
And linked plan flags, media ownership, audit logs, and affected pages are updated
```

```gherkin
Given an admin creates, updates, restores, or archives a course
When the action succeeds
Then the same domain service used by the Agent surface owns the database mutation
And the Admin wrapper only performs auth, input mapping, result mapping, and revalidation
```

## Test Mapping

```yaml
test_mapping:
  integration:
    - src/lib/__tests__/course-service.integration.test.ts
    - src/app/admin/courses/admin-course-actions.integration.test.ts
  component:
    - src/app/admin/courses/[id]/delete-course-button.component.test.tsx
  contract:
    - src/app/api/agent/__tests__/permissions.integration.test.ts
  static:
    - npm run typecheck
    - npm run lint
  manual:
    - Open a published course with an active purchase, confirm deletion, and verify the inline/toast error remains on the course page.
```

## Evidence

上列服務與整合測試涵蓋共用課程修改、有效購買者的刪除保護，以及被拒絕時資料保持不變。後台 component tests 檢查操作結果；當前整體測試結果見[開發與測試](../development/DEVELOPMENT-AND-TESTING.md)。

## Intentional Changes

- Admin deletion of a published course with active purchases changes from allowed to blocked.
- Admin receives an explicit recoverable error instead of silently deleting protected content.
- Admin Course CRUD／archive gains the domain validation already applied to Agent callers, including length and not-found validation where applicable.

## Open Questions

- Whether archive should be allowed from every non-deleted status remains unchanged in this refactor.
- Purchase revocation policy remains an owner decision; this contract only treats `revokedAt IS NULL` as active, matching current source behavior.

本契約在 Course mutation 行為、購買有效性定義、Admin／Agent entrypoint 或驗證證據改變時更新。
