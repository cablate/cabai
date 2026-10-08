import { FadeIn } from "@/components/ui/fade-in";
import { CreditCard, Receipt, UserCircle } from "@phosphor-icons/react/dist/ssr";

const purchaseSteps = [
  {
    icon: CreditCard,
    title: "先看商品頁",
    body: "確認內容、價格、適合對象與取得方式，再進入付款。",
  },
  {
    icon: UserCircle,
    title: "付款後開通",
    body: "完成付款後，已購買的內容會依商品類型開通到你的帳號。",
  },
  {
    icon: Receipt,
    title: "回來繼續使用",
    body: "登入會員中心即可查看課程、檔案、訂閱與訂單紀錄。",
  },
];

export async function StatsSection() {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-px border-x border-white/10 bg-white/10 md:grid-cols-[1.1fr_1fr_1fr_1fr]">
        <div className="bg-ink px-6 py-8 md:px-8">
          <p className="font-mono text-xs text-white/38">HOW IT WORKS</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/66">
            不用來回私訊確認。商品頁、付款、會員中心與訂單紀錄都在同一個站內完成。
          </p>
        </div>
        {purchaseSteps.map((step, i) => (
          <FadeIn key={step.title} delay={i * 0.1}>
            <div className="h-full bg-ink px-6 py-8 md:px-8">
              <step.icon size={24} weight="fill" className="text-amber-soft" />
              <h3 className="mt-5 text-base font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/58">{step.body}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
