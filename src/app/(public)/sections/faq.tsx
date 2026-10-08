import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { faqs } from "./faq-data";

export function FaqSection() {
  return (
    <section id="faq" className="home-section-deferred border-b border-border-subtle bg-canvas">
      <div data-home-reveal className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
        <header className="max-w-2xl">
          <h2 className="font-display text-3xl font-medium leading-tight tracking-[-0.035em] text-text-primary sm:text-4xl">
            開始前，先確認這幾件事
          </h2>
          <p className="mt-4 text-base leading-7 text-text-secondary">
            關於公開內容、會員權限與 Agent API 的常見問題。
          </p>
        </header>

        <Accordion type="single" collapsible className="mt-8 border-y border-border">
          {faqs.map((faq, index) => (
            <AccordionItem key={faq.q} value={`faq-${index}`}>
              <AccordionTrigger className="px-1 py-6 font-display text-base font-medium sm:text-lg">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="max-w-3xl px-1 pb-6 pr-8 text-sm leading-7 text-text-secondary sm:text-base sm:leading-8">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-7">
          <Button asChild variant="secondary">
            <Link prefetch={false} href="/community">
              到社群提問
              <ArrowRight data-icon="inline-end" weight="bold" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
