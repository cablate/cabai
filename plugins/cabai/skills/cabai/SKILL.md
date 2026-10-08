---
name: cabai
description: Use CabAI public discovery and the authenticated user's courses, Skills, and Information through the User Agent API. Do not use for CabAI administration or publishing.
---

# CabAI

Use CabAI as the current user. This skill combines anonymous public discovery with the fixed, server-owned User Agent profile; it never grants or requests administrative access.

## Connection

- Base URL: the operator-confirmed `CABAI_BASE_URL` for this installation. There is no default hosted service. Confirm the exact trusted origin before attaching any token; never send a self-host token to an example or maintainer domain.
- User OpenAPI: `GET /api/agent/user/v1/openapi.yaml`
- User credential: `Authorization: Bearer $CABAI_USER_TOKEN`
- User token prefix: `cab_user_*`

Read the live User OpenAPI before choosing an authenticated operation. Treat it as canonical for paths, operation IDs, parameters, response shapes, and required scopes. Do not load `/api/agent/openapi.yaml`, use `cab_agent_*`, or attempt an Admin route.

Choose credentials from the operation's OpenAPI `security`, not from its URL prefix. Attach `CABAI_USER_TOKEN` only to a `userKey` operation; omit `Authorization` for an anonymous public operation. If a public request was accidentally sent with an invalid or expired credential and returns `401`, do not silently downgrade or retry by stripping the header without the user's knowledge.

Never ask the user to paste a complete token into chat. If `CABAI_USER_TOKEN` is unavailable, explain that local credential setup is missing and continue only with anonymous public operations.

## Capability boundary

The effective User profile is fixed by the server:

- `course:read`
- `skill:read`
- `information:read`
- `information:ack`

These capabilities do not imply course entitlement. Respect `401`, `403`, and `404` without guessing alternate paths or identifiers. Public routes expose only published public projections; authenticated artifacts and course content require the User route and server authorization.

## Efficient reading

- Use collection operations for discovery and their compact summaries.
- When an ID or slug is already known, call the detail operation directly.
- Fetch lesson content only after obtaining a real course ID from CabAI.
- Treat signed download targets and the complete token as secrets; do not echo or persist them in output.

For Information, listing unread items does not mark them read. Read the relevant detail first. Acknowledge only IDs actually processed, and only when the request includes or implies marking those updates handled. If there are no items, do not send an empty ACK.

## Safety

This plugin is read-oriented except for the user's explicitly bounded Information acknowledgement. It must not create, update, publish, withdraw, delete, grant, revoke, reconcile, retry webhooks, or run system operations. If the user requests one of those actions, report that the separate CabAI Admin plugin and an appropriately scoped Admin token are required.
