import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/config/site-identity";

export const metadata: Metadata = {
  title: "隱私權政策",
  description: "了解我們如何收集、使用及保護您的個人資料。",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 md:px-8 py-32">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            隱私權政策
          </h1>
          <p className="mt-2 text-sm text-zinc-400">最後更新日期：2025 年 6 月 1 日</p>
        </div>

        <p className="text-base leading-relaxed text-zinc-600">
          本隱私權政策說明本服務（以下簡稱「我們」）如何收集、使用、儲存及保護您在使用本網站及相關服務時所提供的個人資料。請您在使用本服務前詳細閱讀本政策。使用本服務即表示您同意本政策所述之內容。
        </p>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">一、資料控制者</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            本服務之資料控制者為本公司（以下統稱「我們」）。若您對本政策有任何疑問，請透過本網站下方之聯絡資訊與我們聯繫。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">二、我們收集的資料</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            我們可能於下列情況收集您的個人資料：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>
              <span className="font-medium text-zinc-700">帳號註冊與登入：</span>
              電子郵件地址、密碼（加密儲存）、登入時間與 IP 位址。
            </li>
            <li>
              <span className="font-medium text-zinc-700">購買與付款：</span>
              訂單資訊、購買品項、交易金額及時間。付款資料（信用卡號碼等）由第三方金流服務商處理，我們不直接儲存完整付款資訊。
            </li>
            <li>
              <span className="font-medium text-zinc-700">服務使用記錄：</span>
              您瀏覽、觀看或下載的內容紀錄、互動行為及學習進度。
            </li>
            <li>
              <span className="font-medium text-zinc-700">裝置與連線資訊：</span>
              瀏覽器類型、作業系統、裝置識別碼、IP 位址及 Cookie 資料。
            </li>
            <li>
              <span className="font-medium text-zinc-700">主動提供的資料：</span>
              您透過表單、客服信件或問卷所提供的任何資料。
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">三、資料使用目的</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            我們使用所收集之資料用於以下目的：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>提供、維護及改善本服務之功能與品質</li>
            <li>處理您的購買訂單、驗證付款及開立電子發票或收據</li>
            <li>驗證您對已購買內容之存取權限</li>
            <li>傳送服務通知、訂單確認及重要系統公告</li>
            <li>於您明確同意之前提下，傳送課程更新、促銷活動等行銷資訊</li>
            <li>進行使用者行為分析，以優化服務設計與使用者體驗</li>
            <li>防止詐欺、濫用及非法存取行為</li>
            <li>履行法律義務及配合主管機關之要求</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">四、資料的分享與揭露</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            我們不會出售您的個人資料。我們僅在以下情況下與第三方分享您的資料：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>
              <span className="font-medium text-zinc-700">服務提供商：</span>
              協助我們運營服務的技術合作夥伴，包含雲端主機、電子郵件寄送、金流處理及數據分析服務商。這些服務商僅能在提供服務所必要的範圍內使用您的資料。
            </li>
            <li>
              <span className="font-medium text-zinc-700">法律要求：</span>
              當法律、法院命令或主管機關要求時，我們可能依法揭露您的資料。
            </li>
            <li>
              <span className="font-medium text-zinc-700">業務移轉：</span>
              若本服務涉及合併、收購或資產出售，您的資料可能作為業務資產一併移轉，我們將事先通知您。
            </li>
            <li>
              <span className="font-medium text-zinc-700">保護權益：</span>
              為保護本服務、使用者或公眾的安全與合法權益時。
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">五、Cookie 與追蹤技術</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            本網站使用 Cookie 及類似技術以維持您的登入狀態、記憶您的偏好設定，並分析網站流量。Cookie 分為以下類型：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>
              <span className="font-medium text-zinc-700">必要性 Cookie：</span>
              網站正常運作所必需，無法關閉。
            </li>
            <li>
              <span className="font-medium text-zinc-700">功能性 Cookie：</span>
              記憶您的語言偏好、介面設定等，以提升使用體驗。
            </li>
            <li>
              <span className="font-medium text-zinc-700">分析性 Cookie：</span>
              蒐集匿名統計資料，協助我們了解網站使用狀況。您可透過瀏覽器設定拒絕此類 Cookie。
            </li>
          </ul>
          <p className="text-base leading-relaxed text-zinc-600">
            您可透過瀏覽器設定管理或刪除 Cookie，但部分功能可能因此受到影響。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">六、資料保留期限</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            我們保留您的個人資料至以下時點為止，取較晚者：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>您的帳號存續期間，以及帳號刪除後合理的系統清除時間</li>
            <li>法律規定之保存義務期限（如商業帳簿依法須保存五年）</li>
            <li>爭議解決或法律程序所需之合理期間</li>
          </ul>
          <p className="text-base leading-relaxed text-zinc-600">
            逾上述期限或目的消滅後，我們將安全地刪除或匿名化您的個人資料。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">七、您的權利</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            依據《個人資料保護法》，您就您的個人資料享有以下權利：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>查詢或請求閱覽您的個人資料</li>
            <li>請求製給複製本</li>
            <li>請求補充或更正不完整或不正確的資料</li>
            <li>請求停止蒐集、處理或利用您的個人資料</li>
            <li>請求刪除您的個人資料（但依法應保存者不在此限）</li>
            <li>撤回您對行銷通訊之同意</li>
          </ul>
          <p className="text-base leading-relaxed text-zinc-600">
            如欲行使上述權利，請透過本網站之客服信箱提出申請。我們將於收到申請後三十個工作日內回覆處理結果。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">八、資料安全措施</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            我們採取以下技術與組織措施保護您的個人資料：
          </p>
          <ul className="list-disc pl-5 space-y-2 text-base leading-relaxed text-zinc-600">
            <li>網站全程使用 TLS/SSL 加密傳輸</li>
            <li>密碼採用業界標準雜湊演算法儲存，我們無法得知您的明文密碼</li>
            <li>敏感資料存取受到嚴格的內部權限控管</li>
            <li>定期進行安全稽核與弱點掃描</li>
            <li>付款資料由通過 PCI-DSS 認證之金流服務商處理</li>
          </ul>
          <p className="text-base leading-relaxed text-zinc-600">
            儘管我們盡力保護您的資料，網際網路傳輸無法保證絕對安全。若發生資料外洩事件，我們將依法通知受影響之使用者及主管機關。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">九、未成年人</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            本服務不針對十八歲以下之未成年人。若您未滿十八歲，請勿使用本服務或提供任何個人資料。若我們得知已收集未成年人之個人資料，將予以刪除。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">十、第三方連結</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            本網站可能包含連往第三方網站之連結。本政策僅適用於本服務，不適用於任何第三方網站。我們建議您在離開本網站後，查閱各第三方網站之隱私權政策。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">十一、政策變更</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            我們保留隨時修訂本政策之權利。修訂後之政策將公告於本頁，並更新頁面頂端之「最後更新日期」。若修訂內容涉及重大變更，我們將以電子郵件或網站公告方式通知您。繼續使用本服務即表示您接受修訂後之政策。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-800">十二、聯絡我們</h2>
          <p className="text-base leading-relaxed text-zinc-600">
            若您對本隱私權政策有任何疑問、意見或申訴，請透過下列方式聯絡我們：
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
