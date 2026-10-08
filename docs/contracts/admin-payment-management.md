---
schema_version: behavior-contract/v1
id: admin.payment-management
title: 管理員訂單付款證據與核對介面
status: active
owner_surface: dashboard
change_context:
  type: feature
  reason: 讓管理員能從 CabAI 訂單辨識實際商品、Portaly 環境與付款 Session，並安全取得人工對帳所需資料。
  non_goals:
    - 從 CabAI 發動退款、取消或任何金流異動
    - 改變 Portaly 共用動態單次付款方案策略
    - 修改正式金鑰、Portaly 方案名稱或 production 設定
---

# 管理員訂單付款證據與核對介面

管理員可以在訂單詳情核對商品、付款環境與 Portaly session，也可以複製必要識別資料去對帳。本頁是查詢工具，退款仍要依服務商的實際付款紀錄處理。

## Behavior Boundary

本次新增站內訂單詳情與唯讀核對工具。管理員可以查看、複製識別資料及前往 Portaly 後台，但不能從這個介面發動退款、修改訂單或撤銷權限。

既有 `/checkout/[productId]` 已顯示商品、交付內容、登入帳號、金額及 Portaly 跳轉說明，本次維持該契約，不重做付款頁。

## Consumers And Entrypoints

- `/admin/orders?view=local`：管理員訂單清單與詳情入口。
- `orders.provider_mode`：訂單建立時使用的 `test` 或 `live` 環境快照。
- `orders.provider_plan_id`：訂單建立時使用的 Portaly 方案快照。
- `orders.portaly_session_id`、`orders.checkout_session_expires_at`：付款 Session 證據。
- `user_purchases`：訂單目前是否仍有有效 CabAI 權限。
- `POST /api/checkout`：建立訂單時保存 provider mode。
- `rebuildOrdersFromPortaly`：從目前 API key 所屬環境重建訂單時保存 mode 與 provider plan。

## Inputs And State

- 管理員必須通過既有 `/admin` 權限邊界。
- 新 Checkout 的 mode 來自已驗證的 Portaly 設定，不接受瀏覽器輸入。
- 歷史訂單只有在既有 callback payload 明確保存 `mode` 時才回填；無證據者顯示「未知」，不可依目前 production 設定猜測。

## Outputs And Side Effects

- 新訂單寫入 `provider_mode`。
- 管理員可查看 CabAI 訂單、商品、金額、權限、Portaly plan/session/mode 與時間證據。
- 「複製核對資料」只複製最小技術識別資料，不包含客戶 Email、callback payload 或 secret。
- 「前往 Portaly 後台」只開啟外部管理頁，不執行金流 mutation。

## UI States

- First paint：清單維持既有可搜尋、分頁表格／手機卡片。
- Ready：每筆訂單有明確「查看詳情」按鈕。
- Detail open：側邊 Sheet 有標題、摘要、分組資料、關閉按鈕與鍵盤 focus boundary。
- Unknown evidence：欄位顯示「尚無證據」，不以目前設定代替歷史事實。
- Copy success：按鈕短暫顯示「已複製」；失敗時維持可重試狀態。
- Refund guidance：清楚說明本頁不會發動退款，退款完成須等待 Portaly 證據同步。

## Invariants

1. 環境模式必須由伺服器端已驗證設定保存，不能相信前端欄位。
2. Test 與 Live 不得共用 pending Checkout URL。
3. 訂單詳情不得顯示 API key、callback secret、checkout token 或完整 callback payload。
4. CabAI 不得在沒有 Portaly 成功證據時自行標記已退款或撤銷權限。
5. 共用 Portaly 方案不改變 CabAI local plan 作為實際交付 authority 的責任。

## Acceptance Examples

```gherkin
Given production checkout is configured with a live Portaly key
When a user starts checkout
Then the pending CabAI order stores providerMode live
And the admin order detail identifies the transaction as正式環境
```

```gherkin
Given an administrator opens a historical order without providerMode evidence
When the detail sheet is displayed
Then the payment environment is shown as unknown
And the UI does not infer live or test from the deployment's current setting
```

```gherkin
Given an administrator needs to ask Portaly about an order
When they select 複製核對資料
Then the clipboard includes merchant order number, local order ID, provider plan ID, session ID, mode and amount
And it excludes the customer's email and all credentials
```

## Test Mapping

```yaml
test_mapping:
  component:
    - src/app/admin/orders/order-detail-sheet.component.test.tsx
  contract:
    - src/app/api/checkout/route.contract.test.ts
  integration:
    - src/lib/__tests__/checkout-reservation.integration.test.ts
  static:
    - npm run check:migrations
    - npm run lint
    - npm run typecheck
  browser:
    - temporary localhost fixture rendering the production detail component at 1440x900 and 390x844
    - horizontal overflow, Escape close and live/unknown evidence states
```

## Evidence

訂單詳情有 component tests，Checkout 保存環境的行為有 route contract 與資料庫測試。桌機／手機顯示曾以同一組元件的本機 fixture 檢查；完整管理路由與真實服務商對帳仍要在部署環境確認。

## Intentional Changes

- 站內訂單由純清單提升為可展開的付款證據入口。
- 新 Checkout 保存 provider mode；歷史資料只做有證據的安全回填。

## Open Questions

- Portaly 尚未提供已確認且可安全使用的退款 API；直接退款按鈕保持 deferred。

若 Portaly 訂單／退款 API、callback mode、共用方案策略或 CabAI 權限 authority 改變，必須同步更新本契約。
