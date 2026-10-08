import { FadeIn } from "@/components/ui/fade-in";
import {
  CreditCard,
  UserCircle,
  Package,
} from "@phosphor-icons/react/dist/ssr";

const deliverySteps = [
  {
    icon: CreditCard,
    title: "完成付款或報名",
    body: "透過 Portaly 安全金流完成購買，或免費報名活動。付款紀錄即時同步到你的帳號。",
  },
  {
    icon: UserCircle,
    title: "進入會員中心",
    body: "登入後前往會員中心，已購買的內容會依商品類型自動開通。",
  },
  {
    icon: Package,
    title: "取得你的內容",
    body: "到會員中心查看目前可用的課程、活動資訊、服務安排與檔案。",
  },
];

export function AfterPaymentSection() {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-px border-x border-white/10 bg-white/10 md:grid-cols-[1.1fr_1fr_1fr_1fr]">
        <div className="bg-ink px-6 py-8 md:px-8">
          <p className="font-mono text-xs text-white/38">
            AFTER PAYMENT
          </p>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/66">
            付款後不用私訊確認。課程、票券、檔案、服務狀態，全部在會員中心取得。
          </p>
        </div>
        {deliverySteps.map((step, i) => (
          <FadeIn key={step.title} delay={i * 0.1}>
            <div className="h-full bg-ink px-6 py-8 md:px-8">
              <step.icon
                size={24}
                weight="fill"
                className="text-amber-soft"
              />
              <h3 className="mt-5 text-base font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/58">
                {step.body}
              </p>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
