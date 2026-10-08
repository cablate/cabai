---
schema_version: behavior-contract/v1
id: checkout.confirmation-handoff
title: CabAI 購買確認與 Portaly 付款交接
status: active
owner_surface: shared
change_context:
  type: feature
  reason: 讓使用者離開 CabAI 前，能在一個畫面核對真正商品、應付金額、交付內容、購買帳號與外部付款交接方式。
  non_goals:
    - 不改變 Portaly 共用方案或建立一對一方案。
    - 不改動付款金額計算、Checkout API、callback、訂單或權限 authority。
    - 不增加額外確認步驟、勾選框或阻擋正常付款的互動。
---

# CabAI 購買確認與 Portaly 付款交接

購買確認頁讓使用者在前往 Portaly 前，核對商品、金額、內容和購買帳號。付款本身由 Portaly 處理，CabAI 收到並驗證付款資料後才開通權限。

## Behavior Boundary

使用者在 CabAI 完成登入、尚未擁有商品且商品可站內購買時，會先看到 CabAI 的購買確認頁；頁面負責核對資訊，不負責完成金流。送出後仍由既有 `POST /api/checkout` 建立訂單並重新導向 Portaly。

## Consumers And Entrypoints

- `/checkout/[productId]`：購買前確認頁。
- `POST /api/checkout`：既有付款 Session 建立入口。
- `plans`／`plan_presentations`：商品名稱、價格、週期與公開呈現資料。
- `plan_courses`／`plan_contents`／`service_configs`：站內可證實的交付內容。
- 已登入且尚未取得該方案權限的 CabAI 使用者。

## Inputs And State

- 商品必須存在、為 active，且 `purchaseButtonMode=internal`。
- 未登入者回到登入流程；已有權限者直接前往會員內容；external、disabled、free-claim 保留既有分流。
- 固定價格使用 `plans.amount`；自訂價格由既有欄位輸入並由 Checkout API 驗證。
- Portaly test mode 必須醒目顯示，不能與正式付款混淆。

## Outputs And Side Effects

- 首屏清楚顯示 CabAI 真正商品、交付內容、帳號與付款摘要。
- 固定價格在摘要與付款按鈕附近保持一致。
- 使用者送出表單後才呼叫既有 `/api/checkout`；本次改版不新增其他網路、DB 或分析副作用。
- Portaly 可能使用共用方案名稱；頁面必須說明 CabAI 訂單仍以本頁商品、金額與帳號建立，並要求金額不符時停止付款。

## UI States

- Loading：骨架保留桌機雙欄與手機單欄的大致空間，避免完成載入後大幅跳動。
- Ready：桌機左側為商品／交付，右側為 sticky 付款摘要；手機依決策順序垂直排列。
- Dynamic amount：金額欄位保留原生 number input、可見 label 與鍵盤 focus。
- Disabled：不顯示可付款按鈕，清楚說明暫停販售。
- Test mode：摘要頂部顯示測試付款，不得只以顏色傳達。
- Error／not found／redirect：沿用既有 App Router 與付款分流。

## Invariants

1. CabAI local plan／delivery／entitlement 仍是商品與權限 authority，Portaly 名稱不取代它。
2. 頁面顯示價格不得自行推算或改寫 Checkout API 最終驗證值。
3. 不因 UI 改版改變 external、disabled、free-claim 或已有權限的分流。
4. 不把 Portaly redirect、Session 或 provider metadata 當成付款成功或授權證據。
5. 所有可操作元素保留可見 focus、至少 24×24 CSS pixel，手機不得橫向溢位。

## Acceptance Examples

```gherkin
Given 使用者準備購買一個固定價格課程
When 購買確認頁完成載入
Then 頁面顯示 CabAI 商品名稱、實際課程與堂數、登入帳號及應付金額
And 主要按鈕明確表示將前往 Portaly 安全付款
```

```gherkin
Given Portaly 使用共用付款方案名稱
When 使用者閱讀付款交接說明
Then 頁面說明 CabAI 會依本頁商品、金額與帳號建立訂單
And 提醒下一頁金額不同時不要付款
```

```gherkin
Given Checkout 使用 test mode
When 頁面顯示付款摘要
Then 使用者能從文字辨識這是測試付款
And 不會只看到與正式付款相同的 CTA
```

## Test Mapping

```yaml
test_mapping:
  component:
    - src/components/checkout/checkout-payment-summary.component.test.tsx
    - src/components/checkout/checkout-delivery-expectation.component.test.tsx
  contract:
    - src/app/api/checkout/route.contract.test.ts
  browser:
    - localhost desktop and mobile checkout fixture using the production components
  static:
    - npm run lint
    - npm run typecheck
    - npm run build
```

## Evidence

上列 component tests 檢查商品、交付與付款摘要，route tests 檢查結帳行為。本機桌機／手機 fixture 曾確認版面和按鈕；這是畫面測試，真實付款流程需另用自己的 Portaly 環境測試。

## Intentional Changes

- 從多張同等權重的直向卡片，改為「商品與交付」和「付款摘要」兩層決策結構。
- 使用可證實的 delivery records 顯示課程、檔案與服務，不只顯示 offering type 通用句子。
- 清楚揭露 Portaly 共用方案名稱可能與 CabAI 商品名稱不同。

## Open Questions

- Portaly 共用方案的最終命名規則仍由產品擁有者另行決定，本契約不替代該決策。

若 Checkout API、Portaly handoff、方案 authority、交付模型或購買前決策流程改變，必須同步更新本契約。
