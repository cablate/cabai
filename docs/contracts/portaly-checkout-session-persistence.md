---
schema_version: behavior-contract/v1
id: payment.portaly-checkout-session-persistence
title: Portaly Checkout 方案與到期狀態快照
status: active
owner_surface: api
change_context:
  type: bugfix
  reason: 避免方案映射變更後拒絕舊回呼，也避免重用已失效的 Portaly Checkout URL。
  non_goals:
    - 修改 Portaly 正式環境金鑰或方案設定
    - 改變付款金額、幣別、授權或退款規則
    - 自動部署或修改 production 資料
---

# Portaly Checkout 方案與到期狀態快照

建立付款連結時，CabAI 會保存當時的 Portaly 方案、環境和到期時間。這樣即使商品設定後來改變，仍能正確驗證舊訂單，也能判斷付款連結是否可以重用。

## Behavior Boundary

本次只涵蓋 `POST /api/checkout` 建立或重用付款 Session，以及 `POST /api/callback` 驗證付款方案的資料依據。商品當前設定可以更新，但已建立訂單的付款證據不可隨商品設定一起漂移。

## Consumers And Entrypoints

- `src/app/api/checkout/route.ts`：選定實際 Portaly 方案、建立 Session 並保存到期時間。
- `src/lib/checkout-reservation.ts`：序列化重複 Checkout，決定重用、等待或建立新訂單。
- `src/app/api/callback/route.ts`：載入訂單與商品後驗證 Portaly 回呼。
- `src/lib/payment-confirmation.ts`：以訂單快照優先判定回呼的方案是否相符。

## Inputs And State

- Local plan ID：CabAI 的商品／方案識別碼。
- Provider plan ID：本次 Checkout 實際送給 Portaly 的方案識別碼。
- Provider mode：建立本次 Checkout 的 Portaly key 所屬 `test` 或 `live` 環境。
- Checkout Session expiry：Portaly `create session` 回應的 `expiresAt`。
- Initialization lease：CabAI 在呼叫 Portaly 期間使用的短暫互斥期限；它不是付款頁到期時間。

## Outputs And Side Effects

- 新訂單保存 `provider_plan_id`。
- 新訂單保存 `provider_mode`，讓歷史交易不依賴部署當下的環境設定。
- Session 建立成功後保存 `checkout_session_expires_at`。
- 只有方案、金額、幣別皆相同，且 Session 尚未到期時，才重用既有 Checkout URL。
- Session 已到期、無到期證據或方案已變更時，舊 pending 訂單會標記 failed，再建立新訂單。
- 回呼驗證優先使用訂單保存的 provider plan；舊資料沒有快照時才退回商品目前設定。

## Invariants

1. 商品目前的 `providerPlanId` 不得覆蓋已建立訂單的付款方案證據。
2. `checkoutReservationExpiresAt` 只表示 Session 建立中的 lease，不得當成付款頁有效期限。
3. Test 與 Live 環境不得重用同一個 pending Checkout URL。
4. 沒有有效 `checkoutSessionExpiresAt` 的 Checkout URL 不得重用。
5. Portaly 回傳無效或已過期的 `expiresAt` 時，CabAI 不得將該 Session 提供給使用者。
6. 舊訂單欄位為 null 時須保持既有 callback fallback，避免 migration 直接破壞歷史訂單。

## Acceptance Examples

```gherkin
Given an order was created with provider plan A
And the local product is later remapped to provider plan B
When Portaly sends a valid callback for provider plan A
Then CabAI validates against the order snapshot
And the callback is not rejected because of the newer product mapping
```

```gherkin
Given a pending order has a Checkout URL
And its Portaly session expiry is in the past or unknown
When the same user starts checkout again
Then CabAI does not reuse the stale URL
And creates a fresh pending order and Portaly Session
```

## Test Mapping

```yaml
test_mapping:
  contract:
    - src/app/api/checkout/route.contract.test.ts
    - src/app/api/callback/route.contract.test.ts
  integration:
    - src/lib/__tests__/checkout-reservation.integration.test.ts
  static:
    - npm run check:migrations
    - npm run lint
    - npm run typecheck
  build:
    - npm run build
```

## Legacy Compatibility

- Migration 會依當時商品映射為既有訂單補上 provider plan 快照；無法回推的資料仍保留 null fallback。
- 舊 pending 訂單沒有 Portaly Session 到期時間，下一次 Checkout 不會重用舊 URL，而會安全建立新 Session。

## Open Questions

- Portaly 是否會在未來提供 Session 查詢或續期 API；目前不依賴尚未確認的能力。

若 Portaly Session 回應、訂單 schema、方案映射策略或 callback 驗證規則改變，必須同步更新本契約與對應測試。
