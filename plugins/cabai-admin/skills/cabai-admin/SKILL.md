---
name: cabai-admin
description: Manage CabAI content, publishing, members, orders, media, entitlements, webhooks, and operations through scoped Admin Agent APIs. Do not use for ordinary user consumption.
---

# CabAI Admin

Operate CabAI's administrative control plane. Installing this plugin grants no authority. An operation is allowed only when the user's current request, the Admin token's scope, and the operation's server-side guards all allow it.

Use only scopes actually granted to the token. A valid token with insufficient scope is not permission to find or infer another route.

## Route the request before using an API

Classify the request from the user's words. Do not probe endpoints or enumerate the control plane to discover what the token can do.

1. If the request is ordinary course, Skill, or Information consumption, stop and use the separate CabAI plugin.
2. Select one primary domain from the table below. If the request spans domains, begin with the domain that owns the requested outcome; add another domain only when the first operation's result makes it necessary.
3. Classify the action as `read`, `draft/change`, `lifecycle`, or `external effect`.
4. Resolve the smallest matching operation from the live Admin OpenAPI. Do not list every operation or fetch unrelated collections.

| User intent | Primary domain | Start here | Risk cue |
| --- | --- | --- | --- |
| What needs attention, system state, queue or failure | Triage / operations | `getAdminOperationsOverview`; inspect only the returned signal that answers the request | Read; `unknown`, partial, or stale is missing evidence, never zero |
| Course, plan, lesson, delivery, presentation | Courses / content | Resolve the exact entity, then read or edit its canonical resource | Publishing, unpublishing, deletion, and delivery changes are lifecycle actions |
| Library article | Library | Resolve entry; use draft → readiness → publish/withdraw lifecycle | Publishing and withdrawal change public state |
| Downloadable Skill or release | Skills | Resolve Skill and release separately; preserve immutable release/artifact evidence | Publishing, deprecation, withdrawal, and artifact replacement are lifecycle actions |
| Product update or announcement | Information | Resolve draft/source/coverage before publication | Publication may notify or expose content to an audience |
| Image, ZIP, or other asset | Media | Upload target → byte upload → confirm → bind/read-back | Signed URLs are secrets; binding changes another entity |
| Member identity or access | Members / entitlements | Resolve one member and current entitlement before proposing a change | Grant/revoke changes paid access and requires explicit intent |
| Order, payment event, or delivery retry | Commerce / webhooks | Read the exact order/event first | Retry may repeat an external side effect |
| Plans, orders, or subscriptions provider synchronization | Provider sync | Preview the selected sync kind; never begin with execute | Broad external effect; freshness and change set are mandatory |
| Audit or tracking investigation | Audit / tracking | Use bounded filters and cursor pagination | Personal data is detail-only and must be necessary |

When the request is ambiguous between two rows, inspect only enough identifiers or summary state to disambiguate. Ask the user only when the alternatives would produce materially different changes.

## Connection and contract

- Base URL: the operator-confirmed `CABAI_BASE_URL` for this installation. There is no default hosted service. Confirm the exact trusted origin before attaching any token; never send a self-host token to an example or maintainer domain.
- Admin OpenAPI: `GET /api/agent/openapi.yaml`
- Admin credential: `Authorization: Bearer $CABAI_ADMIN_TOKEN`
- Admin token prefix: `cab_agent_*`

After routing the request, use the live Admin OpenAPI to resolve the selected operation ID, path, schema, required scope, confirmation headers, concurrency rules, and documented errors. Never guess a route or field from memory. Do not use API probing as capability discovery. Do not substitute `CABAI_USER_TOKEN` or a `cab_user_*` token.

The registry also contains anonymous public and `userKey` operations. Administrative work may invoke only operations whose OpenAPI `security` uses `agentKey`. Anonymous public GETs are allowed only for post-publication read-back. User-scoped reading and acknowledgement belong in the separate CabAI plugin.

Never ask the user to paste a complete token into chat. Never expose tokens, signed URLs, secrets, email addresses, or full webhook/provider payloads in output, logs, notes, or audit descriptions.

## Choose the workflow by risk

### Read

Use the narrowest filter and smallest useful page. Prefer summary over detail. Stop as soon as the question is answered. A read request does not authorize cleanup, repair, retry, acknowledgement, or any other mutation.

### Draft or bounded change

Use this sequence:

`inspect exact target → read latest revision → prepare bounded change → execute once → read back canonical state`

Send `expectedRevision` when the contract requires it. On `409`, re-read and reassess; never overwrite blindly. Send an `Idempotency-Key` when required. Reusing a key with a different payload is invalid.

### Lifecycle or destructive change

Use this sequence:

`inspect → readiness/preview when defined → explain material effect → obtain required confirmation → execute once → read back public and canonical state`

Do not invent a readiness gate for an operation that does not define one. Bind destructive confirmation to the exact target. Publishing, withdrawal, deletion, deprecation, restoration, grant, and revoke remain distinct actions; authorization for one does not imply another.

### External effect or long-running work

Use this sequence:

`inspect → preview/change set → verify freshness → confirm → enqueue with idempotency → retain operationId → poll status → read back/reconcile`

A transport timeout or `202` is an unknown or running outcome, not failure and not permission to use a new idempotency key. Do not execute broad synchronization when preview is unavailable, stale, partial, or cannot be bound to the confirmation. Escalate when recovery evidence is missing.

## Domain invariants

- **Media:** choose `createMediaUploadTarget` and `confirmMediaUpload` from the live contract. Upload bytes with HTTP `PUT` and the requested `Content-Type` before expiry; never print the signed URL. Confirm with the returned `storageKey`. Provide `entityType` and `entityId` together, or omit both. A `skillRelease` binding also requires its current revision. Read back the returned `mediaId` with a narrow `listMedia` query.
- **Skill artifacts:** use `context: "skill-artifact"`; ZIP only, at most 20 MiB. Confirmation binds and validates the draft release artifact. Run release readiness afterward. Never make a private object public as a shortcut.
- **Entitlements:** inspect existing access before grant/revoke. Preserve entity-bound confirmation, idempotency, operation/audit identifiers, and canonical read-back.
- **Provider sync:** keep plans, orders, and subscriptions as separate sync kinds. Preview only the requested kind. Execute the returned change set rather than reconstructing it. Follow the durable job until a terminal state; use recovery only through its guarded operation.
- **Publication:** server-owned audience, source facts, checksums, artifact evidence, action payloads, and publish timestamps must come from the workflow, never invention.

## Context and cost limits

- Do not download complete member, order, audit, tracking, media, webhook, or provider collections for convenience.
- Prefer exact ID, filter, summary, cursor, and explicit page-size parameters. Request detail only for selected records.
- Do not request email or identifying fields unless identity resolution requires them. Keep them out of summaries.
- Begin with `getAdminOperationsOverview` only for triage or cross-domain status questions, not as a mandatory preflight for every task.
- Retain `operationId` and `auditId` for verification, but do not copy sensitive payloads into notes.
- Treat unavailable, partial, stale, and unknown observations as incomplete evidence. Do not convert them to zero or success.

## Completion rule

After a mutation, read the canonical resource or durable operation back and report only observed state. For publication, also verify the applicable public or User projection without leaking credentials. Separate request acceptance, job completion, hosted state, and external provider state. Never describe an unobserved side effect as complete.
