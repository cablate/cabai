---
schema_version: behavior-contract/v1
id: admin.plan-gateway-conversion
title: 既有 Manual 商品轉換為 Portaly
status: active
owner_surface: dashboard
change_context:
  type: feature
  reason: 既有 Manual 商品需要保留本地商品、內容與權限身分，同時改用 Portaly 共用動態方案完成 CabAI 站內結帳。
  non_goals:
    - 移除資料庫中的 gateway 欄位
    - 自動切換購買按鈕模式
    - 建立、更新或刪除 Portaly 方案
    - 將既有 Portaly 商品轉回 Manual
---

# 既有 Manual 商品轉換為 Portaly

已有的 Manual 商品可以改用 Portaly 結帳，同時保留原本商品、教材、訂單和會員權限的關聯。這裡說明可轉換的條件與管理員操作方式。

## Behavior Boundary

本次只新增 `manual → portaly` 的單向轉換。商品仍沿用原本的 CabAI plan ID、slug、價格、內容、訂單與權限關聯。購買按鈕模式不會隨轉換自動改變，管理員需在確認轉換成功後另行切換為站內結帳。

## Consumers And Entrypoints

- 管理頁面：`/admin/plans/[id]`
- Server Action：`src/actions/plans.ts#updatePlan`
- 表單：`src/app/admin/plans/[id]/edit-plan-form.tsx#EditPlanForm`
- Provider read：`src/lib/portaly-client.ts#getPlan`
- 持久資料：`plans.gateway`、`plans.provider_plan_id`
- 下游結帳：`POST /api/checkout`

## Inputs And State

- 目前方案的 `gateway` 必須是 `manual`。
- 目標 gateway 必須是 `portaly`。
- 管理員必須提供符合既有格式限制的 Provider Plan ID。
- 本地商品與 Provider 方案都必須是一次性付款。
- Provider 方案必須為啟用中、TWD、一次性且支援自訂金額。
- Portaly 環境與憑證由既有 runtime configuration 決定；表單不接受模式或金鑰。

## Outputs And Side Effects

- 驗證成功後，只更新本地 `plans.gateway`、`plans.provider_plan_id` 及同一次方案編輯中的既有欄位。
- 轉換不呼叫 Portaly create/update API，不修改 Provider 方案。
- 驗證失敗時不更新任何本地方案欄位。
- 成功後重新驗證管理頁、首頁、Products 與商品頁快取。

## UI States

- Manual ready：顯示「維持 Manual」與「轉換為 Portaly」兩個明確選項。
- Portaly selected：顯示必填 Provider Plan ID 與共用方案說明。
- Pending：提交按鈕顯示既有 loading 狀態並避免重複送出。
- Error：欄位錯誤顯示於摘要及對應欄位；方案維持原狀。
- Success：顯示 Portaly 設定已驗證並儲存。

## Invariants

1. 轉換不改變本地 plan ID，因此既有內容、訂單與權限關聯不重建。
2. Provider Plan ID 未經 Portaly read-back 驗證，不得寫入轉換結果。
3. 共用 Provider 方案只決定付款端行為；本地商品仍是價格、交付與 entitlement authority。
4. 轉換不會靜默把外部購買改成站內購買。
5. 已是 Portaly 的方案不得透過此表單改回 Manual。

## Acceptance Examples

```gherkin
Given an existing Manual one-time product has content, orders and learners
And an active TWD dynamic one-time Portaly plan exists
When an administrator selects Portaly and submits that Provider Plan ID
Then CabAI verifies the provider plan
And updates the existing local product mapping without creating or updating a Portaly plan
And preserves the local product ID and all downstream relationships
```

```gherkin
Given a Manual product is still configured for external purchase
When its gateway conversion succeeds
Then the external purchase path remains active
Until an administrator separately changes the checkout mode to internal
```

## Test Mapping

```yaml
test_mapping:
  integration:
    - src/lib/__tests__/plan-actions.integration.test.ts
  static:
    - npm run lint
    - npm run typecheck
  build:
    - npm run build
  manual:
    - On localhost, select Portaly for a Manual plan and verify the Provider Plan ID field is required and keyboard reachable.
```

## Evidence

- Before：`updatePlan` 可更新 `providerPlanId`，但不更新 `gateway`；Manual 方案表單也不顯示 Provider Plan ID。
- After：focused integration、static checks、build 與管理頁 browser read-back。

## Intentional Changes

- Manual 一次性商品可在原商品身分不變的情況下，轉換並綁定既有 Portaly 動態方案。

## Open Questions

- 後續另案將 gateway 降為系統內部細節，並把管理介面收斂成單一購買方式設定。

當轉換條件、Portaly Provider 限制或 checkout authority 改變時，必須同步更新本文件。
