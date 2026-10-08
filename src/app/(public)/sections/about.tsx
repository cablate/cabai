import { FadeIn } from "@/components/ui/fade-in";

const notes = [
  ["01", "買課程", "適合想自己照著做、把一段能力補起來的人。"],
  ["02", "買訂閱", "適合想持續拿到更新、範例、檔案或新內容的人。"],
  ["03", "買服務", "適合已經有明確問題，需要有人一起判斷或處理的人。"],
];

export function AboutSection() {
  return (
    <section id="about" className="mx-auto max-w-7xl px-6 py-24 md:px-8">
      <div className="grid grid-cols-1 gap-14 md:grid-cols-[0.85fr_1.6fr]">
        <FadeIn>
          <span className="font-mono text-xs text-text-muted">FOUNDER NOTE</span>
          <h2 className="mt-4 text-3xl font-semibold text-text-primary md:text-4xl">
            這不是文章列表，
            <br />
            是可以購買的工作成果
          </h2>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="max-w-3xl space-y-6 text-base leading-8 text-text-secondary">
            <p>
              我是 Cab，工程師出身，做過金流串接、AI 工具開發、內容平台建置。
              這裡收錄的是我從真實專案整理出來、可以被購買與交付的內容。
            </p>
            <p>
              你不需要先猜這是不是適合你。每個商品都會盡量把內容、價格、適合對象與取得方式寫清楚，讓你能像逛商店一樣做決定。
            </p>
          </div>

          <div className="mt-10 border-y border-border-subtle">
            {notes.map(([num, title, body]) => (
              <div
                key={num}
                className="grid gap-4 border-b border-border-subtle py-5 last:border-b-0 md:grid-cols-[4rem_1fr]"
              >
                <span className="font-mono text-sm text-text-muted">{num}</span>
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
