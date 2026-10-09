# 版本紀錄
[English](CHANGELOG.md)

使用者可見變更依 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 記錄。套件版號以 `package.json` 為準，目前尚未核准公開 tag／release。0.x 階段的次版號可能包含破壞性變更，屆時必須提供遷移指引。

## [未發布]

首版候選讓既有創作者／會員系統能以中性內容及操作者自己的設定重現。不代表所有整合、安全邊界或部署都完成最終驗收，請看[發布門檻](docs/planning/ROADMAP.md)。

**升級：** 既有操作者應依[部署與維運](docs/operations/DEPLOYMENT-AND-OPERATIONS.md)檢查設定、不可改寫的 migration，以及資料庫／媒體成套還原。未知或未登錄的本機公開素材現在會拒絕存取，切換前須登錄可信的舊素材。先前公開副本可能需要清除快取；程式碼無法收回既有下載。不要對正式資料執行範例 seed 或測試清理。

### 新增

- **獨立安裝：** 本機 PostgreSQL Compose、設定 Doctor、合法中性範例及一次性首位管理員初始化；一般會員登入仍需操作者自己的 Google client。
- **部署與還原：** 非 root／唯讀正式映像、含 PostgreSQL 與一次性 migration 執行者的單機 Compose、可驗證備份 manifest、明確隔離還原演練，以及可重複的本機資料庫／媒體成套還原檢查。
- **貢獻者與 AI 指引：** 雙語入口、模組／API 導覽、執行期 Agent OpenAPI 探索與 skill 涵蓋檢查。`course-export/v1` 核心提供驗證／規劃／套用及儲存契約測試，不代表所有內容類型均完成端到端驗收。
- **維運證據：** 持久 job 執行紀錄、明確排程模式及去敏警報整合；提供手動 SBOM／checksum／建置來源工作流程，不自動發布。

### 變更

- **共用同一產品：** 軟體採 Apache-2.0，中性範例另行授權；維護者與自架部署共用同一主線，以設定區隔，不另養私人功能版。
- **操作者自己的預設：** 創作者／聯絡資訊、Kit 訂閱識別碼、Agent origin 與維護 Worker 目標，不再隱性沿用維護者服務。本機儲存是最小預設；外部服務、備份寫入及排程須明確啟用。
- **可讀性與維護：** 改善學員／管理員對比色 token；具型別的目錄／進度查詢、route 邊界 registry 及 migration 完整性檢查讓實作責任更清楚。CI 涵蓋不需商業憑證的中性安裝／測試／建置／smoke，託管執行仍需設定 repository。

### 修正

- **Payment 退款通知：** 新版 Portaly 一次性付款退款成功事件會對應到精確本地訂單；退款失敗不撤權，付款資料衝突不處理，晚到的付款完成通知也不能重新授權已退款訂單。所有回呼分支先拒絕明確不符的 test/live 模式；訂閱逐期退款仍須另外對帳。

- **Marketplace 付款重試：** 未完成事件只能替會員、方案、金額、幣別一致且仍為已完成的訂單補齊權益；資料衝突或已退款就停止，不授權。核對與補齊期間會鎖住該訂單。

- **還原目標檢查：** 讀取備份前拒絕 URL query 的連線路由覆寫，只接受單一支援的 `sslmode` 參數；這不代表已證明目標隔離或統一兩種資料庫工具的 TLS 行為。

- **直接啟動容器的快取：** 非 root 執行者不依賴 Compose 掛載也能寫入可丟棄的 Next.js 圖片快取；應用程式碼仍由 root 擁有。唯讀部署仍須提供可寫的快取掛載。CI 同時檢查直接啟動映像與掛載後的檔案系統邊界。

- **跨平台 migration：** Windows 與 Linux checkout 的 SQL 統一保留 LF 位元組，避免 Git 換行轉換造成 Drizzle migration 雜湊不同。既有資料庫若已出現 hash 不符仍須另行稽核；不改寫 ledger，也不略過 hash 檢查。

- **自架品牌：** 公開頁面、FAQ、結構化資料及預設分享圖會使用設定的站點身分；商品自己的封面仍優先使用。選用的維護頁改用中性文字。
- **首次安裝引導：** 區分首位管理員設定與日常 Google 登入、正式空站與本機示範內容，複製設定模板時也會保留既有環境檔。

- **尚未設定的會員登入：** Google 憑證不完整時留在站內顯示說明，不再自動跳往服務商錯誤頁；已設定的 Google 登入維持原流程。

- **容器可攜性：** Windows clone 保留 shell 入口的 LF；有容量限制的 log／cache 掛載可供非 root 寫入，不讓應用程式碼變成可寫。
- **一致建置邊界：** 一般及效能分析建置都會將本機執行狀態隔離於 standalone 產物之外。不要散布整個 `.next` 目錄。

### 安全性

- **舊 Marketplace 相容性變更：** 舊封包未簽署事件／時間，不能安全授權交付或退款；入口即使設定 secret 也固定回傳 503，不進行處理。升級前先暫停供應商投遞並核對既有紀錄，見[設定說明](docs/development/CONFIGURATION.md#legacy-marketplace-unavailable-in-the-first-release)。獨立的標準 callback 保留，並要求已簽署事件與標頭相符。

- **框架更新：** Next.js 與配套 ESLint 設定固定為 16.3.8。保留 Auth.js beta.32、Drizzle adapter 1.11.3 及相容間接依賴更新。Tiptap／KaTeX／selector-parser 的現有判讀只適用目前設定，不代表套件已修補或零風險，見[驗證範圍](docs/development/DEVELOPMENT-AND-TESTING.md#first-release-verification-scope-2026-10-08)。
- **私有媒體：** 本機公開讀取必須具備已登錄的非私有 context 與允許的生命週期狀態；私有、未知及未登錄物件預設拒絕。私有交付、已驗證 callback、會員權益及 Agent 破壞性操作確認，仍是發布不可破壞的條件。
- **秘密與 migration 歷史：** 自訂執行期環境檔、上傳及本機狀態不進 Git；standalone 防護排除被複製的秘密／log／備份／Git metadata。已套用 migration 的漂移改以 hash 稽核，不再默默接受；退役舊的破壞性部署前還原流程。
- **CI 權限：** 外部 action 使用已審查的固定 commit；checkout 不保留憑證，建置來源寫入權限限於手動證據 job。本機政策回歸案例檢查這些邊界。
