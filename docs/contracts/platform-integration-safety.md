---
schema_version: behavior-contract/v1
id: infrastructure.integration-safety
title: Backup retention and external integration safety
status: active
owner_surface: infrastructure
change_context:
  type: bugfix
  reason: Invalid retention input can select unsafe deletions, while capability diagnostics and external request failure bounds do not match runtime requirements.
  non_goals:
    - Change production secrets, providers, Portaly mode, or backup retention policy.
    - Enable Sentry when no DSN is configured.
    - Add automatic retry to non-idempotent provider mutations.
---

# Platform Integration Safety Contract

This spec covers backup retention settings and external-service requests: how invalid settings are reported, how long requests may wait, and which operations can be retried.

## Behavior Boundary

**In scope:** `DB_BACKUP_KEEP` parsing and retention deletion guard；Portaly/Discord/Agent/Sentry capability reporting；Portaly and Discord request timeout/result handling；`.env.example` canonical keys。

**Out of scope:** 修改 production environment、選擇新的 retention 數字、啟用 Sentry、provider migration、或重試非冪等付款 mutation。

## Consumers And Entrypoints

- Backup: `src/lib/backup.ts`, `src/lib/database-backup/service.ts`, scheduled `database-backup` job.
- Configuration: `src/lib/config/platform.ts`, Doctor/startup/readiness consumers, `.env.example`.
- Portaly: `src/lib/portaly-client.ts` and all query/mutation wrappers.
- Discord: `src/lib/discord.ts` and Admin guild-role fetch.

## Inputs And State

- Missing `DB_BACKUP_KEEP` means the documented default of 336; a configured value must be a safe integer greater than or equal to the hard safety floor of 3.
- Discord OAuth capability requires client id, client secret, redirect URI, bot token, and guild id.
- Portaly capability requires API key and callback secret in unified mode; the API key supplies merchant identity. Legacy mode-specific credentials additionally require profile id.
- Agent credentials are database-managed in `agent_api_keys`; `AGENT_API_KEY` is not a runtime selector.
- Sentry is optional and disabled when no server/browser DSN exists.

## Outputs And Side Effects

- Invalid retention input fails before backup creation, listing, or deletion; `applyRetention` also rejects invalid direct callers.
- Capability diagnostics never echo secret values and distinguish disabled optional integrations from incomplete configuration.
- Every Portaly/Discord request has an explicit timeout. Idempotent Portaly reads may use a bounded retry; non-idempotent mutations are not automatically replayed.
- Non-JSON provider errors return a stable sanitized error instead of throwing during JSON parsing.

## UI States

Not browser-visible. Operator-visible states are enabled, disabled, misconfigured, fatal, degraded, and warning diagnostics.

## Invariants

1. Invalid backup retention input cannot call `BackupSink.remove`.
2. Backup config errors degrade operations without hiding a healthy core app.
3. Capability selectors match the keys actually used by runtime code.
4. Optional Sentry absence is not a deployment error.
5. Non-idempotent provider operations are never automatically retried by the HTTP client.
6. External requests cannot wait indefinitely.
7. Shared `PORTALY_PROFILE_ID` presence does not select unified credentials; only unified credential keys can do so. Unified API-key auth derives the profile from the key.

## Acceptance Examples

```gherkin
Given DB_BACKUP_KEEP is "abc", zero, negative, fractional, or outside safe-integer bounds
When the scheduled backup starts
Then it fails before creating a backup or deleting any artifact
```

```gherkin
Given unified Portaly API key and callback secret omit PORTALY_PROFILE_ID
When platform config is inspected
Then payment is enabled because Portaly derives the merchant profile from the API key
```

```gherkin
Given complete mode-specific PORTALY_LIVE_* or PORTALY_TEST_* credentials and PORTALY_PROFILE_ID
And unified PORTALY_API_KEY and PORTALY_CALLBACK_SECRET are absent
When platform config is inspected
Then the matching mode-specific payment capability is enabled
And startup is not blocked
```

```gherkin
Given Portaly returns an HTML 502 response or does not respond before the timeout
When an idempotent query is made
Then the client returns a bounded sanitized error
And a checkout-session POST is not automatically repeated
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/database-backup/retention.test.ts
    - src/lib/config/platform.test.ts
    - src/lib/portaly-client.test.ts
  integration:
    - src/lib/__tests__/discord.integration.test.ts
  static:
    - npm run typecheck
    - npm run lint
```

## Evidence

Focused tests cover invalid retention values, configuration combinations, provider timeouts and error responses. Discord behavior also has database integration tests. Current full-suite results are in [Development and Testing](../development/DEVELOPMENT-AND-TESTING.md).

## Intentional Changes

- Invalid explicit retention values fail closed instead of being coerced.
- Agent API reports a database-managed capability rather than requiring a legacy environment key.
- Optional observability appears explicitly in platform capability output.
- Portaly credential-family detection no longer treats the shared profile id as evidence of unified credentials; unified mode no longer requires a redundant profile id.

## Open Questions

- The owner-selected production retention target and Sentry enablement remain unchanged.

本契約在 retention policy、capability required keys、provider timeout/retry policy 或 credential ownership改變時更新。
