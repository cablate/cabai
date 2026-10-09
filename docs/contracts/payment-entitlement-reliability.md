---
schema_version: behavior-contract/v1
id: payment.entitlement-reliability
title: Payment checkout and entitlement transition reliability
status: active
owner_surface: shared
change_context:
  type: bugfix
  reason: Checkout initialization and entitlement side effects can race or become permanently incomplete after partial failures.
  non_goals:
    - Change public product claims or marketing copy (P1-06 is deferred).
    - Change prices, billing periods, Portaly mode, or production credentials.
    - Remove Discord roles from production while investigating current drift.
    - Introduce a general event-streaming platform or a second payment provider.
---

# Payment and Entitlement Reliability Contract

付款、免費領取與人工授權會更新會員可讀取的內容。這份規格說明訂單重試、權益交易與背景同步如何合作，避免重複授權或漏掉撤權。

## Behavior Boundary

**In scope:** 同一使用者／方案的 Portaly checkout 初始化；callback、reconciliation、Marketplace、free claim、Admin／Agent manual grant 與 revoke；Discord plan role 與 Entitlement Hub webhook 的 durable delivery；Portaly subscription self-heal。

**Out of scope:** 公開文案與產品承諾、退款金額政策、Portaly live切換、production Discord角色修正、Email通知與新provider。

## Consumers And Entrypoints

- Paid checkout: `src/app/api/checkout/route.ts` and the checkout reservation service.
- Payment callback: `src/app/api/callback/route.ts`.
- Payment repair: `src/lib/reconcile.ts` and `src/lib/reconcile-subscriptions.ts`.
- Marketplace paid/refund: `src/lib/marketplace-processor.ts`.
- Free claim: `src/app/api/checkout/free-claim/route.ts`.
- Manual grants: `src/actions/members.ts`, `src/lib/services/agent-operations-service.ts`, `/api/agent/grants`.
- Access self-heal: `src/lib/access.ts#checkPlanAccess`.
- Side-effect delivery: entitlement outbox processor, `src/lib/webhook-outbox.ts`, `src/lib/webhook-processor.ts`, and `src/lib/discord.ts`.
- Stored state: `orders`, `user_purchases`, the entitlement transition outbox, `webhook_logs`, Discord links/mappings, and job-run evidence.

## Inputs And State

- Checkout identity is the authenticated `userId` plus local `planId`; amount and currency are server-authoritative.
- Local `plans.providerPlanId` is the canonical mapping to `PortalySubscription.planId`; legacy rows may use the local id when the provider id is null.
- A purchase row is the durable local grant. `revokedAt`, expiry, and linked order state determine current entitlement.
- Every grant/revoke transition has a deterministic idempotency key and is written in the same database transaction as the local state change.
- Discord and external webhooks are optional consumers; absence of configuration/link/mapping is a successful no-op, while an attempted non-2xx/network failure is retryable evidence.

## Outputs And Side Effects

- A new checkout reservation creates one pending order. A concurrent request reuses a completed reservation or receives a bounded in-progress response; it never invalidates an unexpired initialization owned by another request.
- Provider session data is persisted only by a compare-and-set against the still-pending reserved order. A superseded/failed order cannot be revived by a late provider response.
- Grant/revoke changes persist an outbox transition atomically. HTTP and Discord calls occur only after commit.
- The outbox processor independently records webhook-enqueue and Discord-sync completion, retries incomplete work, and dead-letters after the bounded attempt policy.
- Discord plan roles are reconciled from current local entitlement at processing time, so a stale grant event cannot restore a role after a later revoke and a revoke does not remove a role still justified by another active purchase.
- Discord unlink/relink, mapping deletion and default-role replacement remove stale managed roles before forgetting local ownership; failed cleanup leaves recoverable local state.
- Self-heal persists provider subscription status, cancellation/billing evidence, the purchase, and the grant transition before returning access; write failure remains fail-closed.
- Subscription `past_due` is a recoverable temporary revoke; cancel-at-period-end keeps access through `cancelEffectiveAt` or the `nextBillingAt` fallback; missing both paid-through timestamps fails closed. Expired/effective cancellation is a permanent revoke. Explicit refund/manual revoke is never auto-restored by a later active provider snapshot.
- Legacy Marketplace ingress and generic retries do not process unverified events. Reconciliation requires an explicit admin import of verified provider-export evidence; refund processing still requires the corresponding paid event. See [upgrade guidance](../development/CONFIGURATION.md#legacy-marketplace-unavailable-in-the-first-release).

### Pending checkout cleanup

Age-only cleanup must not expire a pending order with a stored Portaly session: payment may have succeeded while its callback was unavailable. Both the cleanup job and subscription reconciliation retain these orders for evidence-based reconciliation, without granting access or calling the provider during cleanup. Pending orders without a session retain the existing 24-hour expiration policy. The conditional update rechecks session absence and pending status, not only the preceding selection.

This is not a bulk recovery worker or a repair of already-terminal orders. Checkout reservation replacement is a separate flow. Follow the [operator recovery guidance](../operations/TROUBLESHOOTING.md) before retrying a purchase or using administrative repair tools.

### Portaly Payment one-time refund callback

Payment remains an automatic checkout/callback flow, separate from legacy Marketplace imports. `creator_subscription.payment.refunded` uses the authenticated `orderMerchantOrderNumber` to select the exact local order; provider `orderId` is not a local primary key. Mode, amount, currency, full refunded amount and any supplied session/subscription identifiers must agree. Only a local one-time plan with a stored Payment session is handled here; recurring per-charge refund reconciliation remains outside this slice.

Successful refunds use the existing revocation transaction and deduplicated entitlement outbox. A refund received before checkout completion makes the pending order terminal, so late completion cannot grant access. Replayed refunds do not create another revocation outbox item. `creator_subscription.payment.refund_failed` does not revoke access. Missing local orders and database failures return a retryable response; malformed, conflicting or unsupported payloads are acknowledged without mutation and emit a reconciliation diagnostic. Operators must investigate those diagnostics rather than treating HTTP 200 as delivery proof.

The transaction owner prevents a concurrent or stale cancellation from replacing an already-refunded status. Provider `orderId`/`paymentId` are validated as required fields, not stored as a new per-charge event ledger; deduplication here remains bounded to the exact local one-time order and its purchases.

All callback branches reject an explicitly mismatched test/live mode before mutation. New Payment refund success requires an explicit mode; legacy callbacks without mode retain their existing compatibility behavior. See the [provider callback contract](https://github.com/portaly-ai/portaly-skills/blob/d2575623dd879553c59304f66d7a301f38c14879/skills/portaly-payment/references/api-contract.md). This does not enable live payments, change existing plans or complete a production migration.

## UI States

### Existing-product Payment conversion

An existing manual one-time product can keep its local ID while its gateway changes to Portaly with a validated, active TWD one-time dynamic provider plan. The purchase button is a separate setting: switch it from external to internal only after mapping succeeds. Historical orders, purchases and course links remain attached to the same local product; conversion must not re-grant or revoke them. A failed provider validation leaves the existing mapping and historical access unchanged. See the [operator rehearsal sequence](../development/CONFIGURATION.md#move-an-existing-product-to-portaly-payment).

- Checkout ready: a valid plan can start checkout.
- Initializing: a second request receives an explicit temporary response and may retry; it does not create another provider session.
- Reuse: an existing compatible pending checkout redirects to its stored provider URL.
- Provider failure: the reserved order becomes failed and the caller receives a retryable user-safe error.
- Superseded response: a late provider response is not persisted or redirected.

## Invariants

1. At most one pending checkout order exists per `(userId, planId)`.
2. External HTTP is never held inside a database transaction or advisory-lock lifetime.
3. `orders.status`, `user_purchases`, and the corresponding grant/revoke outbox transition commit atomically.
4. Callback/reconcile/Marketplace/free-claim/Admin/Agent paths cannot bypass the transition outbox.
5. Replaying a transition does not duplicate purchase rows, webhook deliveries, or effective Discord role state.
6. A failed Discord HTTP response is not logged as successful delivery.
7. Provider/local plan identity uses `providerPlanId ?? localPlanId` consistently.
8. Self-heal never grants access when its durable write fails.
9. A success URL or repair request cannot reconcile an order owned by another user.
10. A job-triggering Admin／Agent／cron entry uses the shared job lock and ledger rather than running reconciliation concurrently outside `runJob`.

## Acceptance Examples

```gherkin
Given two requests start checkout for the same user and plan at the same time
When the first request is still creating the Portaly session
Then only one pending order and one provider-session creation are allowed
And the second request does not mark the first order failed
```

```gherkin
Given a payment transition commits locally
And Discord is temporarily returning an error
When the entitlement job runs repeatedly
Then the purchase remains granted
And the transition remains retryable until Discord succeeds or the event is dead-lettered
And external webhook enqueue is not duplicated
```

```gherkin
Given a grant event is pending and a later revoke has already committed
When the older grant event is processed
Then Discord is synchronized to the current revoked state
And the plan role is not re-added
```

```gherkin
Given a local plan id differs from its Portaly provider plan id
And Portaly reports an active matching subscription
When local access self-heal runs
Then the completed order stores active subscription evidence
And the purchase and grant transition commit before access is returned
```

```gherkin
Given a subscription enters past_due and later becomes active
When reconciliation processes both snapshots
Then access and Discord are temporarily revoked and later restored
But an explicitly refunded or manually revoked purchase is not restored
```

```gherkin
Given two plans map to the same Discord role
And the user loses only one plan
When desired-state synchronization runs
Then the shared role remains while the other plan still grants access
```

## Test Mapping

```yaml
test_mapping:
  integration:
    - src/lib/__tests__/payment-cutover.integration.test.ts
    - src/lib/__tests__/checkout-reservation.integration.test.ts
    - src/lib/__tests__/entitlement-outbox.integration.test.ts
    - src/lib/__tests__/subscription-entitlement.integration.test.ts
    - src/lib/__tests__/order-lifecycle.integration.test.ts
    - src/lib/__tests__/marketplace-processor.integration.test.ts
    - src/lib/__tests__/access.integration.test.ts
    - src/lib/__tests__/reconciliation.integration.test.ts
    - src/lib/__tests__/discord.integration.test.ts
  contract:
    - src/app/api/callback/route.contract.test.ts
    - src/app/api/subscriptions/subscriptions.contract.test.ts
  unit:
    - src/lib/portaly-client.test.ts
  static:
    - npm run check:migrations
    - npm run typecheck
    - npm run lint
```

## Evidence

上列整合測試涵蓋 checkout reservation、outbox、訂閱、Discord、訂單、權限與對帳。舊 Marketplace 新請求已停用；既存未處理事件需經管理員核對匯入，不能由一般重試自動執行。當前整體結果見[開發與測試](../development/DEVELOPMENT-AND-TESTING.md)。

## Intentional Changes

- Concurrent checkout initialization changes from replacing the first pending order to preserving its lease and returning an explicit in-progress response.
- Entitlement side effects become asynchronous within the existing five-minute outbox job window instead of best-effort inline HTTP.
- Discord role updates now fail observably and are retried by the durable transition processor.
- Subscription cancel/resume and provider reconciliation now share one transition policy instead of duplicating local and external side effects.

## Open Questions

- P1-06 public claims remain intentionally deferred to the next round.
- Production Discord drift is investigated read-only and is not corrected by this change.

本契約在 checkout ownership、權益有效性、side-effect consumer、retry policy 或 provider identity contract 改變時更新。
