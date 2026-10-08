import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/config/site-identity";

export const metadata: Metadata = {
  title: "服務條款",
  description: "使用本服務前，請詳閱服務條款。",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 md:px-8 py-32">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            服務條款
          </h1>
          <p className="mt-2 text-sm text-zinc-400">最後更新日期：2025 年 6 月 1 日</p>
        </div>

        <p className="text-base leading-relaxed text-zinc-600">
          歡迎使用本服務。本服務條款（以下簡稱「本條款」）構成您與本服務營運方（以下簡稱「我們」）之間具有法律約束力的協議，規範您使用本網站及所有相關數位內容與顧問服務。請在使用本服務前詳細閱讀本條款。一旦您存取或使用本服務，即表示您已閱讀、理解並同意受本條款約束。
        </p>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">一、服務說明</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            本服務提供數位內容（包含線上課程、影片教學、電子書、媒體資源、實作筆記、工作坊錄影及相關學習資源）、活動資訊與顧問諮詢服務，供付費會員於授權範圍內存取使用。所有內容均為中文，專為台灣及華語地區使用者設計。
          </p>
          <p className="text-base leading-relaxed text-zinc-600">
            我們保留隨時新增、修改或下架服務內容之權利，不另行通知。我們亦保留隨時維護、暫停或終止全部或部分服務之權利。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">二、帳號註冊與安全</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            使用本服務需要建立個人帳號。您同意：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>提供真實、正確且完整的註冊資訊，並於資訊變更時即時更新</li>
            <li>妥善保管您的帳號密碼，並對所有使用您帳號進行之活動負完全責任</li>
            <li>不得將帳號、密碼或存取憑證分享、出借或轉讓予任何第三方</li>
            <li>發現帳號遭未經授權使用時，立即通知我們</li>
            <li>每個帳號僅供一名自然人使用，不得以機器人或自動化程式登入</li>
          </ul>
          <p className="text-base leading-relaxed text-zinc-600">
            一個電子郵件地址僅得註冊一個帳號。若我們發現帳號資訊不實或帳號遭濫用，有權暫停或終止該帳號且不退費。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">三、付費方案與購買</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            本服務提供個別內容、活動或服務購買及訂閱方案。所有價格均以新台幣（TWD）計價，並含稅。
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>
              <span className="font-medium text-zinc-700">單次購買：</span>
              一次性付款取得指定內容、活動資訊或服務項目之存取權（以本服務持續營運及該商品頁說明為前提）。
            </li>
            <li>
              <span className="font-medium text-zinc-700">訂閱方案：</span>
              按月或按年計費，訂閱期間可存取所有訂閱方案包含之內容。訂閱將於到期日自動續約，除非您在續約日前取消。
            </li>
          </ul>
          <p className="text-base leading-relaxed text-zinc-600">
            完成購買後，我們將寄送確認電子郵件至您的註冊信箱，並依法開立電子發票。若您未於合理時間內收到確認信，請聯絡客服。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">四、內容授權與使用限制</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            付費購買後，我們授予您非專屬、不可轉讓、不可再授權的個人使用授權，您可：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>於個人裝置上存取、觀看及使用已購買之內容、活動資訊或服務資料</li>
            <li>在合理範圍內下載或列印供個人學習使用之補充資料（若有提供）</li>
          </ul>
          <p className="text-base leading-relaxed text-zinc-600">
            以下行為明確禁止，違者我們將立即終止其帳號且不退費，並保留追究法律責任之權利：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>錄製、截取、下載或複製任何未授權之影片、音訊、檔案或活動資料</li>
            <li>將付費內容上傳至任何平台，包含 YouTube、社群媒體、雲端硬碟等</li>
            <li>以任何形式散布、販售或轉讓付費內容、活動資訊或服務資料予第三方</li>
            <li>將帳號提供給他人共用，或以任何形式規避授權限制</li>
            <li>移除、修改或遮蔽內容上的版權聲明或浮水印</li>
            <li>將付費內容用於任何商業目的，包含企業內訓（需另簽授權合約）</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">五、智慧財產權</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            本服務所有內容，包含但不限於課程影片、講義、投影片、程式碼範例、媒體資源、活動資料、圖文資料及網站設計，其著作權、商標及其他智慧財產權均屬我們或相關授權人所有。本條款並未授予您取得任何智慧財產權之所有權。
          </p>
          <p className="text-base leading-relaxed text-zinc-600">
            若您於服務、活動或社群中分享個人心得、作業或創作，您保有該內容之著作權，但同時授予我們免費、非專屬的使用授權，以供推廣、展示或改善服務使用，且您同意我們得不具名或具名公開該內容。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">六、使用者行為規範</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            使用本服務時，您同意不從事以下行為：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>違反任何適用法律或法規</li>
            <li>侵害他人隱私、名譽或智慧財產權</li>
            <li>發布或傳播任何騷擾性、歧視性、仇恨性或具欺詐性之內容</li>
            <li>嘗試未授權存取、干擾或破壞本服務之系統或資料</li>
            <li>使用爬蟲、機器人或其他自動化工具存取本服務</li>
            <li>冒充他人或以虛假身份使用本服務</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">七、服務中斷與免責</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            我們致力於提供穩定的服務，但不保證服務不間斷或無誤。以下情況可能導致服務中斷，我們對此不負賠償責任：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>定期或緊急系統維護</li>
            <li>第三方服務供應商之故障（如雲端主機、CDN 等）</li>
            <li>不可抗力事件（如天災、戰爭、政府行為等）</li>
            <li>您的裝置、網路或瀏覽器相容性問題</li>
          </ul>
          <p className="text-base leading-relaxed text-zinc-600">
            本服務內容僅供教育、交流與參考用途。我們不保證任何特定學習成果、商業結果或活動成效。對於您基於本服務內容所做之決策及其後果，我們不承擔任何責任。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">八、責任限制</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            在法律許可的最大範圍內，我們對於因使用或無法使用本服務所造成之任何間接、偶發、特殊或衍生損害，不承擔責任，無論是否已被告知此類損害之可能性。
          </p>
          <p className="text-base leading-relaxed text-zinc-600">
            在任何情況下，我們對您的總賠償責任不超過您在事件發生前十二個月內向我們支付之總金額。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">九、帳號終止</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            您可隨時向我們申請刪除帳號。帳號刪除後，您將失去對所有已購買內容之存取權，且此操作不可逆。
          </p>
          <p className="text-base leading-relaxed text-zinc-600">
            若您違反本條款，我們有權在不事先通知的情況下暫停或終止您的帳號，且無義務退還任何款項。帳號終止後，本條款中依其性質應繼續存在之條款（包含智慧財產權、責任限制等）仍持續有效。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">十、準據法與爭議解決</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            本條款之解釋與執行均依中華民國法律為準。因本條款或本服務所生之任何爭議，雙方同意以台灣台北地方法院為第一審管轄法院。
          </p>
          <p className="text-base leading-relaxed text-zinc-600">
            在提起法律訴訟前，雙方應先以善意協商方式嘗試解決爭議。如有任何問題，請先透過客服信箱聯繫我們。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">十一、條款修訂</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            我們保留隨時修訂本條款之權利。修訂後之條款將公告於本頁並更新日期。若修訂內容重大，我們將提前以電子郵件通知您。修訂後繼續使用本服務，即視為您接受新版條款。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">十二、聯絡我們</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            若您對本服務條款有任何疑問，請透過下列方式與我們聯繫：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>
              電子郵件：<a className="rounded-sm underline underline-offset-4 transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
            <li>服務時間：週一至週五，上午 10:00 至下午 6:00（台灣時間）</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
