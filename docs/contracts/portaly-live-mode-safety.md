---
schema_version: behavior-contract/v1
id: payment.portaly-live-mode-safety
title: Portaly 正式支付模式防呆
status: active
owner_surface: infrastructure
change_context:
  type: bugfix
  reason: 避免正式環境因 mode、API key 或 callback secret 選擇錯誤而繼續建立 Sandbox checkout。
  non_goals:
    - 修改 Portaly 方案、交易、金鑰或商家設定。
    - 修改 CabAI 商品、訂單或 entitlement 資料。
    - 自動把任何環境切換成 live。
---

# Portaly 正式支付模式防呆

測試付款和正式收款使用不同的 Portaly 設定。這份規格定義如何核對 mode、API key 和正式環境開關，避免用錯環境建立付款。

## Behavior Boundary

本次只處理環境變數解析、Doctor／startup 診斷、Checkout 建立前防呆，以及 callback 使用相同憑證選擇規則。Portaly 後台、方案、真實交易與 production 環境變數不在本次程式變更範圍。

## Consumers And Entrypoints

- `src/lib/config/portaly.ts`：唯一的 mode 與憑證選擇規則。
- `src/lib/config/platform.ts`、`scripts/doctor.ts`、production startup：部署前診斷。
- `POST /api/checkout`：建立本機訂單與 Portaly Checkout Session 前的阻擋點。
- `src/lib/portaly-client.ts`：所有 Portaly API 呼叫。
- `src/lib/portaly-signature.ts`、`POST /api/callback`：callback secret 與模式驗證。

## Inputs And State

- `PORTALY_MODE` 必須在啟用付款時明確為 `test` 或 `live`，不得以空值推論 live。
- 統一型憑證：`PORTALY_API_KEY`、`PORTALY_CALLBACK_SECRET`。
- Legacy 憑證：與 mode 相符的 `PORTALY_TEST_*` 或 `PORTALY_LIVE_*`，另需 `PORTALY_PROFILE_ID`。
- `PORTALY_REQUIRE_LIVE=true` 代表該部署禁止任何 Sandbox checkout。
- `pcs_test_` 只能搭配 test；`pcs_live_` 只能搭配 live。

## Outputs And Side Effects

- 正確設定回報 payment enabled，既有 checkout/callback 流程不變。
- 設定錯誤回報 fatal payment diagnostic，不輸出任何 credential value。
- Checkout 設定錯誤時回傳 HTTP 503，而且不得先建立訂單 reservation 或呼叫 Portaly。
- Callback 設定錯誤時沒有可用 secret，因此簽章驗證失敗且不完成訂單。

## UI States

沒有新增 UI。Test 模式既有 Sandbox 標示保留；live 切換後該標示應消失。

## Invariants

1. 空白或拼錯的 `PORTALY_MODE` 不能默認為 live。
2. mode 與 API key prefix 不一致時不得呼叫 Portaly。
3. 統一型與 legacy 型憑證不得同時生效。
4. `PORTALY_REQUIRE_LIVE=true` 時，test mode 一律 fail closed。
5. 診斷、log、API response 與測試證據不得包含 API key、callback secret 或 profile ID。
6. Checkout 被阻擋時不得新增 pending order，也不得建立外部 Checkout Session。

## Acceptance Examples

```gherkin
Given PORTALY_REQUIRE_LIVE is true
And PORTALY_MODE is test
And the selected API key starts with pcs_test_
When an authenticated user submits POST /api/checkout
Then CabAI returns HTTP 503
And no order reservation is created
And no Portaly Checkout Session is requested
```

```gherkin
Given PORTALY_MODE is live
And the selected API key starts with pcs_live_
And the matching callback secret is configured
When platform configuration is inspected
Then the payment capability is enabled
And the selected callback verifier uses the live callback secret
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/config/portaly.test.ts
    - src/lib/config/platform.test.ts
    - src/lib/portaly-client.test.ts
  contract:
    - src/app/api/checkout/route.contract.test.ts
  static:
    - npm run lint
    - npm run typecheck
  build:
    - npm run build
```

## Evidence

- 變更前：除精確字串 `test` 外的 mode 都被當成 live；mode/key prefix 未互相驗證。
- 變更後：使用單一 resolver 驗證 mode、prefix、credential family 與 require-live gate。
- 實際命令與結果在 PR 驗證紀錄中保存。

## Intentional Changes

- 啟用付款時，`PORTALY_MODE` 從可省略改為必須明確設定。
- 新增 opt-in 的 `PORTALY_REQUIRE_LIVE` production gate。
- 混用統一型與 legacy 型憑證由隱性優先序改為設定錯誤。

## Open Questions

- 真實小額交易與 callback read-back 必須在程式部署、production env 切換完成後另行取得 owner 核准。

當 Portaly credential contract、callback mode 或 production cutover 步驟改變時更新本文件。
