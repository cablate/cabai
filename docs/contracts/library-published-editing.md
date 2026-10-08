---
schema_version: behavior-contract/v1
id: library.published-editing
title: Published Library direct editing
status: active
owner_surface: editor
change_context:
  type: feature
  reason: Published Library articles need safe typo, wording, and stale-content corrections without withdrawing the public URL.
  non_goals:
    - Add a new Agent API scope or endpoint.
    - Add database tables, migrations, review workflow, scheduling, diff UI, or rollback UI.
    - Edit withdrawn Library entries.
    - Republish or resend an existing Information announcement after every article correction.
---

# Published Library Direct Editing Contract

Published Library articles can be corrected without changing their public URL. Browser and Agent editors use the existing update operation, with revision checks; corrections do not resend announcements or reset read status.

## Change Context

The current Library update service only updates rows whose status is `draft`. A published article therefore cannot be corrected without making its public URL unavailable or bypassing the canonical service. This change extends the existing edit operation to published content while retaining the existing permission and concurrency model.

Last validated against repository: 2026-07-30.

## Behavior Boundary

In scope:

- Admin browser editors can edit a draft or published Library entry.
- Admin Agent callers with `library:write` can use the existing PATCH operation.
- Published edits update authorable content, increment revision, and invalidate public Library caches.
- Existing published Information remains a historical announcement and does not become unread again solely because its Library article was corrected.

Out of scope:

- Editing withdrawn entries.
- Changing a published entry's slug.
- Automatically editing, withdrawing, republishing, or ACK-resetting Information.
- New roles, scopes, database schema, or publication lifecycle states.

## Consumers And Entrypoints

- Browser route: `/admin/library/{id}`.
- Server action: `updateLibraryAction`.
- Domain service: `updateLibraryEntry`.
- Admin Agent API: `PATCH /api/agent/library-entries/{id}`.
- Public readers: `/library/{slug}` and `/api/agent/public/v1/library/{idOrSlug}`.
- Stored state: `library_entries.status`, `revision`, `updated_at`, `published_at`, `slug`.
- Information health checks and coverage for `sourceType=library_entry`.
- Sitemap Library `lastModified`, derived from `library_entries.updatedAt`.

## Inputs And State

- The request uses the existing update schema and includes a positive `expectedRevision`.
- The caller already passed `library:update` in the Admin browser or `library:write` in Admin Agent API.
- Draft entries may update all existing authorable fields.
- Published entries may update `title`, `summary`, `bodyMarkdown`, `tags`, and `featured`.
- A published request may send the unchanged slug but cannot replace it.
- Withdrawn entries remain immutable.

## Outputs And Side Effects

- A successful edit increments `revision` once and updates `updatedAt`.
- Published edits preserve `id`, `slug`, `status=published`, `publishedAt`, and `withdrawnAt=null`.
- Published edits expire the public Library cache tag.
- Sitemap output uses the new `updatedAt` as `lastModified`.
- Existing published Information IDs, read states, bodies, and actions remain unchanged.
- Stale `expectedRevision` returns `stale-revision` and performs no write.
- A published slug change returns validation failure and performs no write.

## UI States

- Draft: existing editor remains visible and saves as a draft.
- Published: the same editor is visible; slug is read-only and the primary action says `儲存變更`.
- Withdrawn: content remains read-only.
- Pending: the existing button loading state prevents duplicate submission.
- Error: existing field/error summary displays validation, stale revision, or persistence errors.
- Success: revision refreshes and a published edit reports that changes were saved.

## Invariants

- Public URL and canonical identity never change during a published edit.
- Editing content does not perform a publish or withdraw transition.
- `library:write` remains the only Agent scope required for this PATCH.
- Existing user Information ACK state is not reset.
- Published Information is treated as a historical announcement linked to the same Library identity, not a mirror that must match every later article revision.
- Public cache invalidation happens only after a successful committed published update.

## Acceptance Examples

```gherkin
Given a published Library entry at revision 3 and slug "windows-codex-lag-troubleshooting-20260718"
When an authorized editor updates bodyMarkdown with expectedRevision 3
Then the entry remains published at the same slug and publishedAt
And its revision becomes 4
And public HTML and public Agent API return the corrected body
And the existing Information announcement is not republished or marked unread
```

```gherkin
Given a published Library entry at revision 4
When an editor attempts to change its slug
Then the update is rejected
And the public URL and stored content remain unchanged
```

```gherkin
Given a withdrawn Library entry
When an editor submits the existing PATCH operation
Then the update returns immutable
And no stored field changes
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/services/library-service.test.ts
    - src/components/admin/library/library-editor-form.component.test.tsx
  contract:
    - src/app/api/agent/__tests__/library-routes.contract.test.ts
  integration:
    - src/lib/__tests__/library-service.integration.test.ts
    - src/lib/__tests__/publication-bundle-service.integration.test.ts
  manual:
    - Open a published entry in /admin/library/{id}, confirm the slug is read-only, save a body correction, and read the same slug from public HTML and public Agent API.
```

## Evidence

Component tests cover editor feedback; route and database tests cover published updates, immutable fields, revision conflicts and announcement compatibility. Use the test mapping above for focused changes and [Development and Testing](../development/DEVELOPMENT-AND-TESTING.md) for current suite results.

## Intentional Changes

- Published Library content becomes editable through the existing browser action and Admin Agent PATCH.
- Published Information source-version health no longer treats an article correction as an invalid announcement.

## Open Questions

- None for the first version. Revision history and rollback remain future work only if real operational demand appears.
