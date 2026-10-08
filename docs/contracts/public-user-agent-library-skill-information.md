---
schema_version: behavior-contract/v1
id: agent.public-user-library-skill-information
title: Library, Skill, and Information Public and User Agent Read Plane
status: active
owner_surface: api
change_context:
  type: feature
  reason: WP-05 exposes governed public discovery and stable-user unread/read workflows over the canonical Library, Skill, artifact, and Information services.
  non_goals:
    - Admin mutation routes or browser scope configuration
    - Active notification, webhook, email, Discord, or scheduler delivery
    - Course publication changes
    - Production rollout, migration execution, or R2 canary evidence
---

# Library, Skill, and Information Public and User Agent Read Plane

Public endpoints let an AI discover published articles and Skills. User endpoints add account-specific content and unread announcements. This spec describes credentials, downloads, pagination and read acknowledgements.

## Change Context

This contract defines the current domain boundary. It gives anonymous agents a public discovery surface and gives authenticated user agents a stable-user unread, acknowledgement, and authenticated Skill download surface. Routes remain adapters over canonical services; they do not duplicate visibility, entitlement, artifact, or read-state ownership.

## Behavior Boundary

In scope:

- Public Library list and detail.
- Public Skill list, detail, release metadata, and public-release download.
- User-authenticated Skill release metadata and download.
- User-authenticated unread Information pagination and batch acknowledgement.
- A server-owned, fixed user-token profile with `course:read`, `skill:read`, `information:read`, and `information:ack`.
- OpenAPI and Agent discovery registration for every route.

Out of scope:

- User-selectable scopes or a scope-management UI.
- Any active push or notification mechanism.
- Admin ability to write user read state.
- Public access to authenticated Skill artifacts.
- Information carrying full Library, Skill, Course, or paid content.
- WP-06 end-to-end publication fixture and WP-10 production evidence.

## Consumers And Entrypoints

Public, no credential required:

- `GET /api/agent/public/v1/library`
- `GET /api/agent/public/v1/library/{idOrSlug}`
- `GET /api/agent/public/v1/skills`
- `GET /api/agent/public/v1/skills/{idOrSlug}`
- `GET /api/agent/public/v1/skills/{idOrSlug}/releases/{version}`
- `GET /api/agent/public/v1/skills/{idOrSlug}/releases/{version}/download`

User token (`cab_user_*`):

- `GET /api/agent/user/v1/skills/{id}/releases/{version}`
- `GET /api/agent/user/v1/skills/{id}/releases/{version}/download`
- `GET /api/agent/user/v1/information?state=unread&cursor=...`
- `POST /api/agent/user/v1/information/ack`

## Inputs And State

### Fixed safe profile

- Every valid user token resolves to exactly the server-owned profile `course:read`, `skill:read`, `information:read`, and `information:ack`.
- New tokens persist that profile. Existing valid tokens receive it through read-time normalization, so correctness does not depend on a destructive per-token backfill.
- Token replacement, rotation, and multiple concurrent tokens do not change user identity or read state.
- Raw legacy scope arrays, including a legacy wildcard, never grant authority outside this fixed profile.
- The user token management projection reports the fixed effective profile rather than stale stored values.

### Public credential handling

- No `Authorization` header means anonymous public access.
- If an `Authorization` header is supplied to a public route, it must be a valid, active `cab_user_*` token. Invalid, revoked, expired, malformed, or wrong-prefix credentials return `401`; the request never silently falls back to anonymous.
- A valid credential on a public route does not upgrade its projection or unlock authenticated artifacts. Authenticated access uses the `/user/v1/` route.

### Skill access

- Only published Skills with a published/deprecated visible release are returned.
- Public metadata may describe an authenticated release but reports it as not downloadable for the public viewer.
- Public download succeeds only when the canonical release access policy is `public`.
- User download succeeds for public or authenticated releases after valid `skill:read` authorization.
- Download creation re-reads the release and object, verifies binding, storage presence, checksum, and archive evidence, and returns a short-lived signed target. Missing or changed evidence fails closed.

### Information read state

- Read identity is `(userId, informationId)`, never `(tokenId, informationId)`.
- `GET` lists only currently visible published unread Information and performs no read-state write.
- Cursor values are opaque server-issued keyset cursors. Clients must not construct or interpret them.
- ACK accepts a bounded batch of Information IDs and writes only rows for the authenticated user and currently visible Information.
- Duplicate and concurrent ACK are idempotent. IDs that are absent, withdrawn, or invisible to the caller do not create read rows.
- Information contains summary and governed action metadata; the action's target Domain endpoint remains the content and entitlement authority.

## Outputs And Side Effects

- Success uses `{ "data": ... }`.
- Public and user read routes return `200`; successful ACK returns an acknowledgement result without changing Information content.
- `400`: malformed JSON, invalid query/cursor, invalid batch shape, or invalid path parameters.
- `401`: invalid, revoked, expired, malformed, or missing user credential where required; also an invalid supplied credential on a public route.
- `403`: valid credential without the fixed required capability, or authenticated-only artifact requested through the public download route.
- `404`: unpublished/missing Library, Skill, or release projection.
- `422`: canonical artifact validation evidence fails.
- `503`: verified storage or persistence prerequisite unavailable.
- Only ACK writes read state. Public reads, user reads, metadata reads, and download target creation do not mutate Domain content or lifecycle state.

## Invariants

- Information discovery never bypasses Library, Skill, Course, or artifact authorization.
- Public routes never become optional-auth routes that can accidentally reveal authenticated data.
- Invalid supplied credentials never downgrade to anonymous.
- Token scopes cannot expand beyond the fixed safe profile and users do not configure them.
- Acknowledgement follows stable user identity across token rotation and multiple tokens.
- One user cannot list or acknowledge another user's state.
- Admin Agent routes cannot acknowledge on behalf of users.
- Unpublished, withdrawn, partial-bundle, missing-object, or checksum-invalid resources fail closed.
- Route, OpenAPI, generated spec, and Agent discovery operation sets remain equal.

## Acceptance Examples

```gherkin
Given a public Library entry is published
When an anonymous agent lists Library entries and then opens its id or slug
Then the list contains only summary fields
And the detail contains bodyMarkdown and governed links
```

```gherkin
Given an authenticated Skill release is visible
When an agent calls its public download route with no credential or a valid user credential
Then the response is 403
And no signed download target is returned
When the same user calls the user download route
Then the canonical artifact verifier controls whether a short-lived target is returned
```

```gherkin
Given a request to a public route supplies an invalid Authorization header
When the route validates the request
Then it returns 401
And does not retry as anonymous
```

```gherkin
Given two active tokens belong to the same user and an Information item is unread
When token A acknowledges the item
Then token B no longer receives it in the unread feed
And a replacement token also preserves that read state
```

```gherkin
Given a published Information item targets paid Course content the user cannot access
When the user polls unread Information or attempts to acknowledge that item
Then the item is not returned
And no read-state row is created for it
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/user-token-permissions.test.ts
    - src/lib/agent/public-user-route.test.ts
  contract:
    - src/app/api/agent/__tests__/public-library-routes.contract.test.ts
    - src/app/api/agent/__tests__/public-user-skill-routes.contract.test.ts
    - src/app/api/agent/__tests__/user-information-routes.contract.test.ts
    - src/lib/agent/openapi.contract.test.ts
  integration:
    - src/app/api/agent/__tests__/public-user-library-skill-information.integration.test.ts
    - src/lib/__tests__/information-service.integration.test.ts
  guards:
    - npm run check:api-route-boundaries
    - npm run openapi:check
    - npm run check:agent-skill
  deferred:
    - WP-06 publication-to-download-to-ACK vertical fixture
    - WP-10 production R2, abuse/rate, and representative query-plan evidence
```

## Evidence

Public projections live in the Library and Skill services; download checks live in `skill-artifact-service.ts`; user read state lives in `user-information-service.ts`. The tests above cover visibility, credential handling, fixed scopes and ACK identity. Current full-suite results are in [Development and Testing](../development/DEVELOPMENT-AND-TESTING.md).

## Intentional Changes

- Normalize all valid user tokens to one fixed safe profile rather than exposing per-token scope configuration.
- Separate public and authenticated paths while sharing canonical read and artifact services.
- Treat an explicitly supplied invalid public-route credential as authentication failure.
- Keep unread polling read-only and make ACK the only read-state mutation.

## Open Questions

- None blocking WP-05. Public abuse/rate behavior and representative production-scale query evidence remain WP-10 deployment gates.

Update this contract when fixed user capabilities, route paths, public credential semantics, Skill access policy, cursor/ACK behavior, Information visibility, or OpenAPI operation identity changes.
