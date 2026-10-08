---
schema_version: behavior-contract/v1
id: skill.information-vertical-evidence
title: Skill Release to User Information Vertical Evidence
status: active
owner_surface: cross-domain
change_context:
  type: verification
  reason: WP-06 proves that the already implemented Skill, artifact, Information, public/User Agent, and read-state owners compose into one repeatable workflow.
  non_goals:
    - New product UI
    - New lifecycle or authorization semantics
    - Production R2 or deployment evidence
    - Third-party creator uploads or malware claims
---

# Skill Release to User Information Vertical Evidence

This document describes the integration test that follows a hosted Skill from draft to publication, download and announcement acknowledgement. It checks that the individual services work together.

## Change Context

WP-01 through WP-05 established the individual data, service, artifact, Admin, public, and User Agent boundaries. WP-06 must prove those parts compose without adding a second owner or relaxing a guard.

## Behavior Boundary

The reference flow uses one neutral owner-authored authenticated Skill Release and a valid ZIP fixture:

1. Author creates Skill and Release drafts.
2. Server validates and binds the artifact, persisting checksum and manifest evidence.
3. Author obtains the canonical source bundle and creates required `skill.released` Information.
4. Publisher atomically publishes Skill, Release, and Information.
5. The user's unread feed returns the Information action pointing to `getUserSkillRelease`.
6. The user resolves release metadata, obtains a verified short-lived download target, and verifies the returned checksum against the fixture bytes.
7. The user ACKs the Information; a subsequent unread poll is empty for every token belonging to that user.

## Invariants

- Skill, Release, and required Information publish in one database transaction.
- Duplicate publish with the same idempotency key returns the same committed state and creates one lifecycle event.
- A stale revision or simulated transaction failure leaves all three resources unpublished.
- Missing, changed, or checksum-invalid artifact bytes fail download closed and identify the artifact/storage boundary rather than silently returning a target.
- Removing or renaming the OpenAPI operation creates `broken_action` readiness evidence and blocks publication.
- Unpublished or partially published data never appears in the public Skill projection or user unread feed.
- Information action parameters come from the source bundle; tests do not hand-author URLs or bypass the resolver.
- ACK state belongs to `userId`, not `tokenId`, and remains idempotent.

## Acceptance Examples

```gherkin
Given a ready authenticated Skill Release and required Information draft
When the Publisher commits the bundle
Then Skill, Release, and Information become published together
And the user's unread feed contains a getUserSkillRelease action
When the user downloads and verifies the checksum, then ACKs the Information
Then the next unread poll is empty
```

```gherkin
Given the same bundle publish request is retried with the same idempotency key
When the first request already committed
Then the retry returns the same revisions
And no duplicate Information event is created
```

```gherkin
Given the artifact object is missing or changed after publication
When the user requests a download target
Then the operation fails closed
And no signed target is returned
```

```gherkin
Given the Skill Information action operation is absent from OpenAPI
When readiness is evaluated
Then a broken_action issue is returned
And no part of the bundle is published
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/agent/action-resolver.test.ts
  contract:
    - src/lib/agent/openapi.contract.test.ts
    - src/app/api/agent/__tests__/public-user-skill-routes.contract.test.ts
    - src/app/api/agent/__tests__/user-information-routes.contract.test.ts
  integration:
    - src/lib/__tests__/skill-information-vertical.integration.test.ts
    - src/lib/__tests__/publication-bundle-service.integration.test.ts
    - src/lib/__tests__/skill-artifact-service.integration.test.ts
  e2e:
    - npm run test:skill-vertical
  deferred:
    - WP-10 production R2 read-back, missing-object probe, and rollout receipt
```

## Evidence

The route harness exercises the seven-step flow above and failure cases for stale revisions, transaction rollback, artifact checks and action identity. The action resolver checks operation ID as well as method, path and credential. Storage/provider acceptance is separate from this local integration test.

## Open Questions

- None blocking local WP-06 evidence. Production storage and deployment remain WP-10 gates.

Update this contract if the reference access policy, artifact format, bundle transaction, action operation, checksum verification, or ACK ownership changes.
