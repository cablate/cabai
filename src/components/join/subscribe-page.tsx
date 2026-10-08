import Image from "next/image";
import Link from "next/link";
import { KitEmailJoinForm } from "@/components/join/kit-email-join-form";
import { BRAND_NAME } from "@/lib/constants";
import { PUBLIC_BRANDING } from "@/lib/config/public-branding";
import type { SubscribePageDefinition } from "@/lib/subscribe-page";

interface SubscribePageProps {
  page: SubscribePageDefinition;
}

export function SubscribePage({ page }: SubscribePageProps) {
  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-[#fbf7f0] px-5 py-5 text-[#0d2452] sm:px-8 sm:py-8 lg:px-12 lg:py-10">
      <div className="pointer-events-none absolute -bottom-4 -left-8 -z-10 hidden h-[28rem] w-[20rem] overflow-hidden opacity-[0.14] lg:block" aria-hidden="true">
        <Image
          src={PUBLIC_BRANDING.logo}
          alt=""
          width={480}
          height={480}
          sizes="480px"
          className="absolute -left-8 -top-12 size-[30rem] max-w-none object-cover"
        />
      </div>

      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-[86rem] flex-col sm:min-h-[calc(100dvh-4rem)] lg:min-h-[calc(100dvh-5rem)]">
        <header className="flex items-center justify-between gap-5">
          <Link prefetch={false}
            href="/"
            aria-label={`${BRAND_NAME} 首頁`}
            className="group inline-flex min-h-12 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5148b9]"
          >
            <span className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-[#efd9bf] bg-[#fff2df] shadow-sm transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-[1.03] sm:size-13">
              <Image src={PUBLIC_BRANDING.logo} alt="" fill sizes="52px" className="object-cover" priority />
            </span>
            <span className="font-serif text-2xl font-semibold tracking-[-0.04em] text-[#0d2452] sm:text-3xl">
              {BRAND_NAME}
            </span>
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_1px_minmax(23rem,0.82fr)] lg:gap-16 lg:py-12 xl:gap-20">
          <section aria-labelledby="subscribe-page-title" className="max-w-[40rem] lg:pl-[7%]">
            <p className="text-sm font-semibold tracking-[0.18em] text-[#a94316] sm:text-base">
              {page.eyebrow}
            </p>
            <span className="mt-4 block h-0.5 w-14 bg-[#ee7a33]" aria-hidden="true" />
            <h1
              id="subscribe-page-title"
              className="mt-8 max-w-[11ch] font-display text-[clamp(2.7rem,5vw,4.6rem)] font-semibold leading-[1.08] tracking-[-0.055em] text-[#0d2452]"
            >
              {page.title}
            </h1>
            <p className="mt-8 max-w-[26rem] text-lg leading-8 text-[#56625f] sm:text-xl sm:leading-9">
              {page.description}
            </p>
          </section>

          <div className="relative hidden h-[31rem] w-px bg-[#d9cbb8] lg:block" aria-hidden="true">
            <span className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-[#fbf7f0] text-[#08745d]">
              <span className="block size-3 rotate-45 bg-current" />
            </span>
          </div>

          <section aria-label="訂閱本站 Email" className="w-full max-w-[31rem] lg:translate-y-8 lg:justify-self-start">
            {page.kitFormId && page.kitFormUid ? <KitEmailJoinForm
              formId={page.kitFormId}
              formUid={page.kitFormUid}
              successMessage={page.successMessage}
              entrySlug={page.slug}
              emailLabel={page.emailLabel}
              emailPlaceholder={page.emailPlaceholder}
              submitLabel={page.submitLabel}
              consentText={page.consentText}
            /> : <p role="status" className="text-lg leading-8">此站尚未啟用 Email 訂閱，沒有收集或傳送你的信箱。</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
