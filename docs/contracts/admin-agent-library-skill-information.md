---
schema_version: behavior-contract/v1
id: agent.admin-library-skill-information
title: Library, Skill, and Information Admin Agent Control Plane
status: active
owner_surface: api
change_context:
  type: feature
  reason: WP-04 exposes the WP-02/03 canonical domain owners through scoped, retry-safe Admin Agent routes.
  non_goals:
    - Public or User Agent read routes
    - Browser UI
    - Production deployment or migration execution
    - High-impact security, entitlement, or breaking-change Information kinds
---

# Library, Skill, and Information Admin Agent Control Plane

Use the Admin Agent API to create and publish Library articles, Skills and announcements. This spec explains the required scopes, revisions and retry behavior. The routes reuse the same services as the admin website.

## Change Context

This contract defines the current domain boundary. Routes are HTTP adapters over the existing Library, Skill/Skill Release, Information, publication bundle, and artifact services. They do not become a second mutation owner.

## Behavior Boundary

In scope:

- Nine explicit Admin Agent scopes: read, write, and publish for each of Library, Skill, and Information.
- Library draft／published update, other draft list/detail/create/update, readiness, lifecycle, Information source bundle/history/stats/coverage, and Skill Release routes listed in the generated OpenAPI.
- Persisted publish replay through existing Information lifecycle idempotency keys.
- Retry-safe creates without a new idempotency table: the server derives a stable resource ID from `(agent key actor ID, operation ID, Idempotency-Key)` and rejects reuse with a different payload.
- Machine-readable domain failures and readiness issues.
- OpenAPI JSON/YAML, route parity, and Agent skill discovery updates.

Out of scope:

- `/api/agent/public/v1/**` and `/api/agent/user/v1/**` (WP-05).
- Skill end-to-end public discovery/download/ACK (WP-06).
- Admin/public UI (WP-07).
- Course publication enforcement and high-impact Information approval (WP-09).
- Production R2, migrations, canary, and rollback evidence (WP-10).

## Consumers And Entrypoints

- Admin Author and Publisher Agents using `cab_agent_*` keys.
- `src/lib/agent-permissions.ts` and the Admin API-key scope selector.
- Canonical WP-04 routes under:
  - `/api/agent/library-entries/**`
  - `/api/agent/skills/**`
  - `/api/agent/skill-releases/**`
  - `/api/agent/information/**`
- `src/lib/services/library-service.ts`
- `src/lib/services/skill-release-service.ts`
- `src/lib/services/skill-artifact-service.ts`
- `src/lib/services/information-service.ts`
- `src/lib/services/publication-bundle-service.ts`
- `src/lib/agent/openapi.ts`, `docs/openapi/agent-v1.json`, and the live YAML endpoint.
- `plugins/cabai-admin/skills/cabai-admin/SKILL.md`.

## Inputs And State

### Permissions

| Domain | Read | Authoring mutation | Lifecycle publish/withdraw |
| --- | --- | --- | --- |
| Library | `library:read` | `library:write` | `library:publish` |
| Skill and Skill Release | `skill:read` | `skill:write` | `skill:publish` |
| Information | `information:read` | `information:write` | `information:publish` |

Existing Admin Agent keys receive none of these scopes automatically. `DEFAULT_AGENT_PERMISSIONS` remains unchanged.

`library:write` may update draft or published Library authoring fields through the same PATCH operation. A published slug, status, `publishedAt`, bundle identity, and Information read state remain server-owned; withdrawn Library entries remain immutable.

### Create idempotency

- Library Entry, Skill, Skill Release, and Information draft create requests require an `Idempotency-Key` header.
- The key is 1–200 visible ASCII characters and is never accepted from the JSON body.
- The server derives a stable opaque resource ID from the authenticated key's stable `agent-key:{keyId}` actor ID, OpenAPI operation ID, and idempotency key.
- A retry with the same operation, actor, key, and semantically equal parsed payload returns the existing resource.
- Reusing the tuple with a different parsed payload returns `409` and performs no mutation.
- Natural uniqueness (Library/Skill slug, Skill version, Information source-version-kind) still prevents duplicates created under different idempotency keys.

### Revisions and lifecycle

- PATCH and lifecycle JSON bodies carry positive integer expected revision fields; WP-04 does not add a second `If-Match` syntax.
- Publish and withdraw require `x-confirm-destructive: true` and matching `x-confirm-entity-id` for the path entity.
- Skill Release deprecate also requires matching entity confirmation because it changes public lifecycle behavior.
- Bundle publish and standalone Information publish／withdraw requests require `Idempotency-Key`; existing Information lifecycle events are the durable replay receipt.
- Library and Skill publish always use the domain bundle coordinators and required Information draft. A route cannot publish only one side.

### Source bundle and preview

- `POST /api/agent/information/drafts/from-source` accepts only source type and source ID, then returns canonical source facts, version, audience, allowed kinds, action templates, and issues. It creates no row.
- `POST /api/agent/information` accepts that source reference plus AI-authorable fields and creates the draft.
- GET detail responses are the Admin preview projection; no separate preview route is invented.
- `/api/agent/skills/{id}/publish` and `/api/agent/skill-releases/{releaseId}/publish` are canonical aliases over the same Skill/Release/Information bundle coordinator. Each validates the path identity against the request body.

### Aggregate stats

- Eligible means a current user account allowed by the Information audience and source entitlement; eligibility follows user identity, not API-token count.
- `all_users` considers all current user rows eligible.
- `source_entitled` considers only users currently passing the source domain access check.
- Read counts include only currently eligible users with a `(userId, informationId)` row. Unread is `eligible - read`.
- Stats return only `eligible`, `read`, `unread`, and `calculatedAt`; no user IDs, emails, tokens, or per-user rows.

## Outputs And Side Effects

- Success responses use `{ "data": ... }`; successful creates return `201`, exact idempotent create replay returns `200`.
- Domain failures use `{ error, kind, retryable?, issues? }` and map through the canonical domain status registry.
- `400`: malformed JSON, invalid path/query/header, or schema failure.
- `401`: invalid, expired, revoked, or missing Admin Agent key.
- `403`: missing required scope.
- `404`: missing resource.
- `409`: stale revision, immutable transition, natural-key conflict, idempotency key payload mismatch, or path/body identity mismatch.
- `422`: readiness or domain validation failure with stable issue entries.
- `428`: missing/mismatched destructive confirmation.
- `503`: verified prerequisite unavailable, with retryability preserved.
- GET and readiness operations do not mutate domain state.
- Routes do not directly write Library, Skill, Skill Release, Information, read-state, or lifecycle tables.

## UI States

Not applicable in WP-04. The Admin API-key selector only gains scope options; Library/Skill/Information browser workflows start in WP-07.

## Invariants

- An Author key cannot publish, withdraw, or deprecate.
- A Publisher key cannot bypass current readiness, artifact verification, source/action validation, expected revisions, or required Information coordination.
- Existing keys do not gain new authority through normalization.
- Agent-provided action URLs, methods, credentials, source facts, audience, timestamps, read state, artifact checksum, or validation evidence are rejected or absent from authorable schemas.
- Information stats never expose a per-user list and Admin routes never mutate user read state.
- Published Information is never hard-deleted or semantically rewritten in place.
- Public/User Agent operations missing until WP-05 remain explicit readiness/coverage issues; WP-04 must not fabricate action operations to make publish pass.
- Route, OpenAPI, generated spec, and Agent discovery operation sets remain equal.

## Acceptance Examples

```gherkin
Given an Author key has library:write but not library:publish
When it calls the Library publish route with valid confirmation
Then the response is 403
And neither Library nor Information state changes
```

```gherkin
Given the same Agent retries a create request with the same Idempotency-Key and parsed payload
When the first request already committed
Then the second response returns the same resource ID
And no second row is created
```

```gherkin
Given a Publisher key and a Library draft whose required Information action points to a WP-05 operation that is not registered yet
When the Publisher calls bundle publish
Then readiness returns a stable broken_action issue and status 422
And both rows remain draft
```

```gherkin
Given an Information item is visible to ten current users and four eligible users acknowledged it
When an information:read key requests stats
Then the response contains eligible 10, read 4, unread 6, and calculatedAt
And contains no user identity list
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/agent/admin-domain-schemas.test.ts
    - src/lib/agent/admin-idempotency.test.ts
    - src/lib/agent-permissions.test.ts
  contract:
    - src/app/api/agent/__tests__/library-routes.contract.test.ts
    - src/app/api/agent/__tests__/skill-routes.contract.test.ts
    - src/app/api/agent/__tests__/information-routes.contract.test.ts
    - src/lib/agent/openapi.contract.test.ts
  integration:
    - src/app/api/agent/__tests__/admin-library-skill-information.integration.test.ts
    - src/lib/__tests__/information-service.integration.test.ts
  guards:
    - npm run check:api-route-boundaries
    - npm run openapi:check
    - npm run check:agent-skill
  deferred:
    - WP-05 public/User action operations
    - WP-10 representative stats query plan and production canary
```

## Evidence

Scope checks, retry-safe creation, revision conflicts and publication use the tests listed above. The implementation is in the domain services and `src/lib/agent/openapi.ts`; current repository-wide results are recorded in [Development and Testing](../development/DEVELOPMENT-AND-TESTING.md). Production-scale statistics queries still need representative data.

## Intentional Changes

- Add nine Admin-only scopes without changing defaults or legacy mappings.
- Add WP-04 Admin Agent routes and generated contracts.
- Use deterministic opaque IDs for retry-safe creates instead of adding an idempotency table.
- Standardize WP-04 revision preconditions in JSON bodies; `If-Match` remains a future compatible option rather than a second initial syntax.
- Treat Skill and Skill Release publish paths as aliases over one coordinator, not separate mutation owners.

## Open Questions

- None blocking WP-04. Production-scale stats query planning remains DV-03/WP-10.

Update this contract when scopes, route paths, authorable fields, revision/idempotency semantics, lifecycle confirmation, stats privacy, or OpenAPI operations change.
