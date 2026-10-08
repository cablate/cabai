# 讓別人真正架起自己的 CabAI

這批工作的完成畫面是：一位攝影老師把 repo 交給自己的 AI，依文件建立「山間攝影教室」，換上自己的名稱、圖案與聯絡方式，啟動示範課程並進入管理後台。過程不用修改被追蹤的產品程式，也不需要維護者的帳號或服務。

先把這條路走通，再增加功能。維護者之後也用同一個來源版本、同一套部署與升級方式；各站的設定、建置產物與資料可以不同。原則由 [PRINCIPLES](../../PRINCIPLES.md) 維護，本文件只管理這批工作的執行與驗收。

## 現況與本批邊界

基準：2026-10-09，公開 repo `cablate/cabai`、`main`、commit `19f7ab8b1afa81302ac10952fd72f4052846ec59`，規劃開始時工作目錄乾淨。恢復工作前須重新確認 HEAD、dirty state 與 CI；以下不是永久有效的驗收結果。

已核對的事實：

- 已有公開 repo、Apache-2.0、私人漏洞回報入口、設定模板、demo、Doctor、部署及備份還原文件。不是從零建立開源骨架。
- `src/lib/config/site-identity.ts` 管名稱、法人／聯絡資訊；`public-branding.ts` 管公開品牌圖案及描述。`NEXT_PUBLIC_*` 品牌值在建置時套用；換值需要重新建置。
- `.gitignore` 已排除 `public/site/`；這裡可放操作者自己的公開品牌圖案，Docker 建置仍會納入。它不是私密檔案目錄。
- `src/lib/site-config.ts` 的 DB 設定目前只允許 `default_discord_role_id`，不是現成的全站品牌編輯器。
- [首次公開 CI](https://github.com/cablate/cabai/actions/runs/37849966337)：container 成功，verify 失敗；瀏覽器失敗案例為不安全登入 callback 與電子報訂閱。W0 已確認兩者是停用服務的環境與啟用服務的測試預期不一致，並非需要恢復維護者的憑證。
- 基準版 `e2e/subscribe.spec.ts` 固定期待一組供應商 form ID／UID；本批已換成合成值並推送。

**這次要做：** 修正驗收阻礙、釐清設定歸屬、補足第一輪操作引導、驗收第二種品牌、整理可發布候選。

**這次不做：** 後台品牌設定系統、多租戶、通用外掛框架、付款重寫、課程／Skill 全面整併、正式站切換。沒有 schema 變更需求；若發現必須遷移資料，先退回修訂計畫。

既有購買權益、退款撤權、私有內容保護、管理員與會員權限不可退化。不得用跳過測試、放寬 callback 驗證或恢復維護者服務預設值來取得綠燈。

## 設定應該放哪裡

| 類別 | 放置與處理方式 | 例子 |
|---|---|---|
| 專案身分 | 保留在公共 repo，允許真實作者／專案連結 | CabAI、授權、GitHub、漏洞回報 |
| 每站公開身分 | 現有 env 與 `public/site/`，品牌變更重新建置 | 名稱、簡介、Logo、分享圖、聯絡信箱 |
| 每站服務與憑證 | 操作者私有 env／部署平台 secret，模板只給中性值 | OAuth、資料庫、付款、郵件、儲存 |
| 營運內容與狀態 | 現有資料庫及儲存，不寫進程式 | 課程、會員、權益、付費附件 |
| 測試與示範 | 合成資料；外部請求攔截或停用 | 第二品牌、假服務表單、demo 課程 |

不把所有 `cabai` 字串都換掉：專案名稱、技術識別、資料表與合法 attribution 不等於私人設定。`package.json` 的 `private: true` 是避免意外 npm 發布，也不是 GitHub 的公開狀態。

不新增 DB 品牌設定層。這批沿用既有 owner，沒有要替換的儲存架構，因此不做架構選型或 JEV 第二意見；若實作提出新的設定來源或相容層，須重新評估而非直接加入。

## 執行順序與交付帳本

本計畫採 Standard 範圍。**本批狀態：實作、本地驗收、公開推送與候選 CI 完成；尚未建立 release 或切換正式站。** W0 的根因與修改 owner 已關閉：產品登入／訂閱頁面的停用行為保留，修正由 Playwright 設定及兩份 E2E 測試負責；沒有新權限模型、schema 或正式遷移需求。後續依本文件執行，不另建第二份主計畫。

目前進入 S9 文件收尾：產品候選 `3d2078a` 已推送且同版本 hosted CI 通過；2026-10-09 已取得本批提交、推送 main 與追蹤 CI 的授權，不包含 release 或正式切換。每批執行者負責程式、文件及證據，維護者負責發布與正式環境授權。

| 單位 | 狀態／依賴 | 下一個動作 | 回復點 |
|---|---|---|---|
| W0 驗收失敗歸因 | 完成；根因與本地雙情境回歸已確認 | 同版本 hosted CI 已通過 | 基準 commit；不碰正式資料 |
| W1 設定與中性範例 | 本地完成；獨立分類審查、品牌與分享圖漏接已修 | 保持最終候選的回歸檢查 | 本批候選提交；基準 commit 保留 |
| W2 首次安裝引導 | 文件修正、Doctor 與隔離 Docker 安裝路徑已驗證 | 真實外部服務由操作者另驗 | 原有安裝入口仍可用 |
| W3 第二品牌驗收 | 兩種品牌本地容器驗收完成 | 未涵蓋真正 Linux 公網主機及 OAuth | 兩套環境已停止，資料保留 |
| W4 版本候選交付 | 完成；候選已推送，verify／container 均通過 | 文件收尾；release 與正式切換另行授權 | 基準 commit 與 CI 證據保留 |

各單位完成後，在這張表填上結果與證據連結。狀態依序為實作、程式驗證、部署候選驗證、發布候選；不把本機容器驗證寫成正式站驗證。後續的正式 dogfood 切換另列於本文末段，不隱藏在 W4 裡。

### 第一批本地證據（2026-10-09）

版本為上述基準加本次未提交 diff，非公開 HEAD 的新 CI 結果。測試使用新建、標記為本任務所有的 loopback PostgreSQL 18 容器及 demo，沒有使用既有站點資料。

- CI 失敗日誌的 callback 實際值為 `null`，訂閱按鈕不存在；來源分別以 Google credentials 與 Kit form 設定決定是否啟用。預設環境沒有這些值，因此舊測試等待了刻意不會出現的動作。
- 本地 Chromium：停用 profile 2/2、合成啟用 profile 2/2 通過。覆蓋停用登入／訂閱、外站 callback 回 `/dashboard`、合法站內 callback 保留，以及合成表單的手機／accessibility 檢查。OAuth signin 與 Kit 請求攔截，不代表真實 OAuth 或寄送成功。
- 品牌／訂閱設定單元測試 17/17；登入／訂閱元件測試 7/7；maintenance worker 39/39；CI scope 6/6；typecheck、plugin package、雙語文件檢查通過。
- 完整 `verify:static` 通過；保留既有 bootstrap 導覽 lint warning（0 errors）。本地瀏覽器 server 已結束，專用測試 DB 容器已停止並保留供後續驗證，不影響其他容器。
- 元件測試首跑遇到 forks worker 啟動 timeout，改用單 worker threads 後 7/7 通過，沒有刪除案例或放寬 assertion；完整預設 runner 驗證仍屬後續工作。
- 已知修正：訂閱頁接上共用 Logo、移除測試真實服務 ID、中性 skill 範例、部署商中性錯誤文字、plugin 專案連結。設定文件補上歸屬分類，模板複製命令不再覆蓋現有 `.env`。
- 第一批僅涵蓋以上 focused checks；後續本地驗收結果以下一節為準，不把第一批結果當成整版可發布。

### 第二批本地驗收（2026-10-09）

以下取代上一批尚未驗證的本地項目；產品候選已推送，hosted 結果見下一節。

- **同程式、不同站點：** 在獨立乾淨 clone 納入候選修改，建立本機驗收 snapshot `5f222f673dd03e97f89d6a5bab610ca3fe23d43d`（不是已發布 commit）。CabAI 與山間攝影教室各自從同一 snapshot、自己的 env／公開資產 build；兩個 image 的 revision label 相同，clone 的 tracked 檔案沒有因換品牌而改動。
- **真實容器：** Docker Desktop 上的 Linux containers 各自執行空 DB migration、readiness、公開頁面、首次 admin bootstrap、草稿建立與 reload；移除 bootstrap token 後重新建立 app，provider 消失、setup 停用，原草稿及已建立的 admin session 仍可讀。app 為 non-root、read-only root filesystem、loopback port。這不是 Linux 公網主機或真正 Google OAuth 驗收。
- **品牌與 UI：** 兩站首頁、訂閱、登入、社群在 1440／390px 通過無橫向溢出檢查並截圖；名稱、Logo、manifest、自訂分享圖與自己的 origin 符合設定，觀察到的瀏覽器請求沒有 off-origin 依賴。24 個 focused tests 另驗 metadata／FAQ／breadcrumb／分享圖及商品 cover 優先序。
- **權限與持久化：** guest 不能進後台，也無法讀取草稿標題、內文或分享圖。22 個真 PostgreSQL 權益／課程存取測試通過，供應商呼叫為 mock；另有 16 個私有 asset contract 測試通過。這些不代表真實供應商付款或 OAuth 已驗證。
- **驗收工具修正：** 草稿頁觀察到 streamed not-found 回應可能是 HTTP 200；檢查改為同時確認 not-found 畫面、私有內容缺席及分享圖 404。瀏覽器等待可見畫面後才斷言，不以暫時尚未 render 當產品失敗；沒有放寬授權條件。中性站最後回讀使用先前真正 bootstrap 取得的 browser session，沒有偽造管理員 cookie。
- **主線與服務情境：** 完整 default E2E 首跑 5/6 通過，learner/admin 長情境因冷編譯用完 300 秒而中止；重設同一個專用測試 DB、單獨重跑後通過（未改 timeout）。最後的 synthetic enabled-services 2/2 通過。這是分次覆蓋，不是宣稱第一次完整命令成功。
- **設定與公開邊界：** Doctor 回報 `ok: true`；最終 runtime patch 的 `verify:static` 通過，保留既有 1 個 lint warning。候選新增的 3 個本機 commits 經 redacted Gitleaks 掃描無 findings；這不是完整安全性保證。plugin 套件與 Worker 40/40 測試通過。
- **完整本地檢查：** `npm run verify:full` exit 0，包含 static、unit 686、component 118、reliability 37、Worker 40、contract 207、integration 292 tests，以及 production build／standalone sanitization。使用專用 PostgreSQL，`VITEST_MAX_WORKERS=1` 限制並行數，沒有修改 timeout 或 assertion。此命令不取代上述獨立瀏覽器驗收。
- **提交前審查：** 獨立 source review 未發現本批公開內容、品牌接線或雙 Playwright profile 的阻擋問題；完整 staged diff 經 redacted Gitleaks 掃描無 findings。CI 目前只由 pull request 或手動觸發，推送 main 後須明確執行 `ci.yml`，不能把 push 成功當成 CI 成功。
- **另案驗證：**真正 Google／付款／寄信／Discord、正式 dogfood 切換保持 UNVERIFIED 或另案，不把本地 bootstrap、mock 或 Docker Desktop 當成那些證據。本地測試容器已停止，資料保留；沒有變更正式站。

### 公開候選 CI（2026-10-09）

產品候選 `3d2078aff15fa66967178944efc1e186150f24ad` 的 [GitHub CI](https://github.com/cablate/cabai/actions/runs/37858915352) 已完成，scope、verify、container 全部成功。Linux runner 的 default 瀏覽器情境 6/6、synthetic enabled-services 2/2 在同次命令通過；容器建置、image boundary、新資料庫 migration、容器 smoke 與 auto-migration entrypoint 檢查也成功。這補上本地跨次 E2E 以外的乾淨 hosted 證據，不代表真實供應商帳號或正式會員資料已驗證。

後續只有結果文件更新；完整 CI 仍會針對文件收尾 commit 再跑一次。未建立 tag／release，未執行正式站切換。本批 W0–W4 的產品修改已結束；下一批回到 ROADMAP 選擇明確的小成果，不延伸本計畫成為新的永久工作清單。

### W0：先釐清兩個失敗，不調低標準

- **範圍：** `e2e/community.spec.ts`、`e2e/subscribe.spec.ts`、`playwright.config.ts`、CI 環境與它們呼叫的登入／訂閱頁面。先讀 trace 與現行 owner，再定位必要檔案。
- **調查上限：** 一輪 CI 證據檢查與一次隔離環境重現；若無法重現，記錄環境差異，不反覆重跑賭綠燈。
- **要回答：** callback 案例是否正確觸發登入？停用的 Google／Kit 與測試預期是否一致？啟用測試是否依賴真實服務識別值？
- **分支：** fixture 不符現行契約就修 fixture 並補停用情境；若產品行為違反安全契約，先補最小重現及 owner 級修正方案。不可直接刪除案例。
- **完成：** 每個失敗都有來源與 trace 支持的原因、修改範圍、正反向驗收；本計畫更新為可執行。若涉及權限模型或資料遷移，停在此處重規劃。

### W1：把「專案設定」與「我們的站點設定」分開

- **前置：** W0 已關閉，採用其中定案的修正，不另開安全模型改造。
- **Owner：** 現有 config helpers、env 模板、Dockerfile／Compose、受影響 E2E fixture；設定說明仍由 `docs/development/CONFIGURATION.md` 維護。
- **步驟：** 搜尋被 Git 追蹤的網域、信箱、供應商 ID、絕對路徑，依上表分類；只處理錯誤的預設值／範例，不刪合法來源資訊。確認模板不會連到維護者服務。
- **已知修正候選：** 訂閱測試固定 ID；`admin-skill-forms.tsx` 的維護者 GitHub placeholder；maintenance worker 的 Zeabur 專屬錯誤文字；plugin metadata 的 `example.com` 專案連結。plugin 連線的 `CABAI_BASE_URL` 仍由自架者指定，不改成專案網址。
- **驗證：** 修正項目的 focused tests、品牌 config tests、plugin package check；外部 integration 的啟用案例使用合成設定並攔截請求，停用案例不得出現可送出的無效表單。
- **完成／失敗處理：** 沒有操作者改 tracked 檔案才能換站的已知阻礙；有殘留就列具體檔案及原因。若發現真實憑證，停止公開輸出，走私人安全處理，不只加 gitignore。

### W2：把第一輪安裝寫成能照做的路徑

- **Owner：** README 雙語入口、GETTING-STARTED、CONFIGURATION、DEPLOYMENT-AND-OPERATIONS、TROUBLESHOOTING；`scripts/doctor.ts` 只修實際診斷缺口。不新增平行 AI 安裝手冊或 installer 框架。
- **步驟：** 以乾淨 clone、獨立 DB／儲存照現有指南安裝；逐步記錄要人工猜的欄位、命令與錯誤。保留既有 env，不讓複製模板覆蓋操作者設定。
- **文件必須說清楚：** 本機試用與公開部署的差別；最少必填值；如何產生 secrets；公開品牌的 rebuild；`public/site/` 只放可公開資產；Google 何時需要；選用服務未啟用時畫面如何。
- **首次管理員：** 走既有 bootstrap，成功後移除初始化 token；說明這不能代替一般會員的 Google 登入驗收。
- **Doctor：** 缺失只指出欄位和修復方式，不印秘密；停用選用服務不應阻擋基本 demo，實際必要設定缺失則不可報成功。
- **完成／失敗處理：** 未參與前情的執行者從 README 可找到完整操作鏈；卡住時修原 owner、重走受影響步驟。`npm run check:docs` 通過不等於安裝完成。

### W3：用另一個品牌證明可移植性

- **環境：** 新 clone／工作目錄、唯一 Compose project、專用 DB／volume、未使用的本機 port。先查清 ownership 再允許 migration、seed 或清理；不讀入既有正式 env。
- **資料：** 預設 CabAI 與合成的「山間攝影教室」使用同一候選 SHA；第二站獨立 env、`public/site/` 圖案及 demo。品牌各自 build，不宣稱同一 image 能在啟動時換品牌。
- **操作：** 依既有 Linux Compose reference profile 建置，驗證下表；相同 commit 的 config 單元測試與兩個建置結果一起留證。只記錄去識別化設定，不記 secrets。
- **驗證方式：** 手機 390px、桌面 1440px 的瀏覽器巡覽與必要自動化；記錄 SHA、image、fixture、actor、步驟、預期／實際、截圖與清理結果。不得借用舊 SHA 的驗收。
- **完成／失敗處理：** 下表本機必要項目全過，tracked 產品檔案無站點特化差異。任何新發現回到 W1／W2，只重驗受影響項及必要整合，不帶缺口前進。

| 目標／風險 | 操作與應看到的結果 | 證據層 |
|---|---|---|
| 真的換成自己的站 | 首頁、導覽、登入、manifest、title／分享 metadata 及聯絡資訊符合第二站設定；資產沒有 404 | build + browser／HTML |
| 無維護者服務依賴 | 核對 tracked config 與 browser network；不向維護者 OAuth、郵件、付款或儲存資源送請求 | source + network；合法供應商域名另分類 |
| 無外部帳號也能試用 | 停用整合，guest 可看 demo 與預覽；admin bootstrap 可編輯內容並在重新整理後讀回 | local container + browser |
| 不因方便而放寬權限 | guest／無權益會員取私有內容被拒；具權益合成會員可讀；非 admin 不能用管理入口 | integration；合成 session 明確標示 |
| 登入 callback 安全 | 合法站內目標保留，外站目標拒絕或回安全站內位置，正確觸發登入動作 | focused + browser mock；不冒充真 OAuth |
| 選用服務易懂 | Kit 停用有清楚狀態；啟用的合成 fixture 正確呈現，請求不離開測試攔截 | browser |
| UI 可操作 | 兩種寬度無橫向溢出，表單 label、鍵盤焦點、錯誤與返回路徑可用 | browser |
| 升級可維護 | README 能引導找到既有備份／成對還原／升級流程；本批若改動這些路徑才重跑相關 drill | 文件核對 + 受影響 runtime test |

真實 Google 登入是另一個驗證層：使用操作者自己的測試專案與 HTTPS 測試站，測新會員、既有會員、callback 與登出。缺少這些資源時標為 UNVERIFIED；不能聲稱「完整公開站登入已通過」，也不拿 bootstrap 代替。付款、郵件寄送與 Discord 同理，逐項啟用才逐項驗收。

### W4：交付能維護的小版本，不擴大承諾

- **前置：** W3 通過；對最終候選跑 focused checks、`npm run verify:full` 與既有 CI 瀏覽器／容器 checks。Hosted CI 須為同一候選 commit 且全部必要 job 成功。
- **文件：** 更新 CHANGELOG、必要的配置／升級說明與 README 狀態。保留原有文件 owner；本計畫完成後標完成，不長期充當操作手冊。
- **交付：** 候選 commit、已驗證功能／環境、尚未驗證整合、從零部署入口、升級與回復入口。不要把測試數量當「全面安全保證」。
- **發布邊界：** push、tag、release 或對外宣傳須有當次授權。版本號與 tag 核對現有 release 後決定；不自動發布 image，也不承諾任意主機皆可一鍵安裝。
- **失敗：** CI 或必要流程不過就回對應 package；不標 release ready，不變更正式站。

## 後續 dogfood：保留同一主線，另做正式遷移

這是本批後續工作，不是本批尚未執行的暗中步驟。維護者負責啟動；觸發條件是候選版本通過以上驗收，且已授權正式切換規劃。

先以私有、去敏或隔離資料驗證既有 schema／內容與候選版本相容，再以自己的設定建置同一公開 commit；測登入、既有權益、付款事件及備份成對還原。另訂 migration／流量切換順序、監看指標和可操作的回復點，才安排切換。正式 credentials、部署資源 ID、事故及客戶資料不放本文件。

任何正式站必需的產品修正都回到共同 repo；不得靠常駐私有 patch 或另一條產品分支完成驗收。前後使用同一套功能與升級流程，才算 dogfood 完成。
