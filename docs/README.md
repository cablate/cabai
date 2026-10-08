# 文件導覽

第一次接觸 CabAI，可以先讀專案 [README](../README.zh-TW.md)。接著依你現在想做的事選一份文件，不需要從頭讀完整套。

## 你想做什麼？

| 想做的事 | 從這裡開始 |
|---|---|
| 在電腦上試用課程網站 | [開始使用](development/GETTING-STARTED.md) |
| 改網站名稱、設定 Google 登入或其他服務 | [設定說明](development/CONFIGURATION.md) |
| 部署到主機、備份、還原或升級 | [部署與維運](operations/DEPLOYMENT-AND-OPERATIONS.md) |
| 處理啟動、登入、付款或檔案問題 | [疑難排解](operations/TROUBLESHOOTING.md) |
| 讓 AI 操作文章、Skill 或公告 | [Agent API 內容管理](development/AGENT-API-CONTENT-MANAGEMENT.md) |
| 找到要修改的程式 | [模組地圖](architecture/MODULE-MAP.md)、[系統架構](architecture/ARCHITECTURE.md) |
| 理解資料表、付款與權限如何連動 | [資料與流程](architecture/DATA-AND-FLOWS.md) |
| 修改程式、跑測試或提交 PR | [貢獻指南](../CONTRIBUTING.md)、[開發與測試](development/DEVELOPMENT-AND-TESTING.md) |
| 查看接下來的方向 | [後續規劃](planning/ROADMAP.md) |
| 私下回報漏洞 | [安全回報方式](../SECURITY.md) |

## 給 AI 助理的入口

請從 [AGENTS.md](../AGENTS.md) 開始，再按上表讀取這次任務需要的文件。設定範例在 `.env.example`，可執行指令在 `package.json`。

修改功能時，也請查看 `contracts/` 裡對應的行為規格：例如[付款與權限](contracts/payment-entitlement-reliability.md)說明付款重試、授權和撤權的規則；[API 路由清單](contracts/api-route-boundaries.json)列出共用處理方式與特殊路由。這些是開發參考，不是安裝前的必讀教材。

## 更新文件時

把說明放回原本的文件，讓下一位讀者有固定的地方可找：

- 安裝步驟放在「開始使用」，環境變數放在「設定說明」。
- 程式位置與依賴關係放在架構文件，功能規則和驗收例子放在對應規格。
- 測試方法與涵蓋範圍放在「開發與測試」，產品改善方向放在「後續規劃」；逐次驗收紀錄另存私人工作區。
- OpenAPI 由程式產生，修改來源後再重新產生及檢查。

介紹用讀者熟悉的說法；操作指南寫清楚步驟與預期結果；技術規格保留精確的欄位、條件和錯誤碼。需要提醒風險時，把原因與做法放在相關步驟旁，不在每一段重複警告。

## 哪些文件放在公開 repo？

公開文件以「另一位自架者或貢獻者能不能用到」來決定，不以檔案是不是寫給 AI、是不是管理功能來區分。

| 類別 | 公開位置 | 保留什麼 |
|---|---|---|
| 專案介紹與版本消息 | 根目錄的 README、CHANGELOG（英文／繁中） | 用途、功能、快速開始、版本變更與升級影響 |
| 授權、社群與安全回報 | LICENSE、THIRD_PARTY_NOTICES、CONTRIBUTING、CODE_OF_CONDUCT、SECURITY、PR template | 使用條件、素材來源、貢獻與回報方式 |
| 專案方向與 AI 開發入口 | PRINCIPLES、AGENTS、`planning/ROADMAP.md` | 共用主線與 dogfooding 原則、程式導航、近期產品改善方向 |
| 安裝、設定、部署與排錯 | `development/`、`operations/`、Worker README | 別人用自己的環境也能操作的步驟、必要設定及限制 |
| 架構與功能規格 | `architecture/`、`contracts/`、`openapi/` | 模組關係、資料流程、權限規則、API、測試案例；草案保留狀態，不當成已實作功能 |
| AI Plugin 指引 | 兩個 Plugin 的 `SKILL.md` | 使用方法、token 類型與權限；管理員版原始碼可公開，安裝不會授予管理權限 |
| 中性示範與素材說明 | `fixtures/demo-course/`、`public/oss/README.md` | 可重用的示範教材、素材來源與授權 |

### 不放進公開 repo 的內容

- 個人工作日誌、對話、內部交接、驗收簽核、候選檔案雜湊清單、逐次測試收據與原始截圖／log。
- 私人主機、帳號、帳務用量、真實服務設定、客戶案例與事故原始資料。
- 已被取代、只為解釋過去執行過程而留存的計畫。仍有用的設計理由整理回現行規格。
- 金鑰、客戶資料、付費內容、備份，以及尚未協調揭露的漏洞細節。

這些資料保存於 repo 外的私人工作區。若工具必須在 checkout 寫入暫存紀錄，可用已被 Git 與 Docker 排除的 `docs/private/`、`docs/internal/` 或 `tmp/`，但不能把它們當成可分享的發行內容。已追蹤或提交過的檔案不會因 `.gitignore` 自動消失，發布時也要檢查 Git 歷史。

### 混在同一份文件時怎麼辦？

保留可重現的方法、影響使用者的已知問題與改善方向；把私人案例、執行收據及內部決策過程分開保存。公開測試文件寫「怎麼驗證、涵蓋什麼」，不持續堆疊某台機器跑了幾次的工作紀錄。安全限制與相容性變更要留在使用者會讀到的地方，不因整理文件而隱藏。
