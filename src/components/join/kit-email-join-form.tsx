"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, EnvelopeSimple, LockKey } from "@phosphor-icons/react";
import { captureAttribution } from "@/lib/attribution";

interface KitEmailJoinFormProps {
  formId: string;
  formUid: string;
  entrySlug: string;
  emailLabel: string;
  emailPlaceholder: string;
  submitLabel: string;
  consentText: string;
  successMessage: string;
}

export function KitEmailJoinForm({
  formId,
  formUid,
  entrySlug,
  emailLabel,
  emailPlaceholder,
  submitLabel,
  consentText,
  successMessage,
}: KitEmailJoinFormProps) {
  const [showEmailError, setShowEmailError] = useState(false);
  const inputId = `join-email-${formId}`;
  const errorId = `${inputId}-error`;
  const consentId = `${inputId}-consent`;
  const dataOptions = useMemo(
    () =>
      JSON.stringify({
        settings: {
          after_subscribe: {
            action: "message",
            success_message: successMessage,
            redirect_url: "",
          },
          analytics: {
            google: null,
            fathom: null,
            facebook: null,
            segment: null,
            pinterest: null,
            sparkloop: null,
            googletagmanager: null,
          },
          powered_by: { show: false, url: "" },
          recaptcha: { enabled: false },
          return_visitor: { action: "show", custom_content: "" },
        },
        version: "5",
      }),
    [successMessage],
  );

  useEffect(() => {
    captureAttribution(new URLSearchParams(window.location.search), window.sessionStorage);
  }, []);

  return (
    <>
      <Script src="https://f.convertkit.com/ckjs/ck.5.js" strategy="afterInteractive" />
      <form
        action={`https://app.kit.com/forms/${formId}/subscriptions`}
        method="post"
        className="seva-form formkit-form"
        data-sv-form={formId}
        data-uid={formUid}
        data-format="inline"
        data-version="5"
        data-options={dataOptions}
        data-entry={entrySlug}
      >
        <div data-element="fields" data-stacked="true" className="formkit-fields">
          <div className="formkit-field">
            <label
              htmlFor={inputId}
              className="block text-base font-semibold tracking-[-0.01em] text-[#0d2452]"
            >
              {emailLabel}
            </label>
            <div className="relative mt-3">
              <EnvelopeSimple
                size={24}
                className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#6d7473]"
                aria-hidden="true"
              />
              <input
                id={inputId}
                className="formkit-input min-h-16 w-full rounded-xl border border-[#acb3b0] bg-white/65 py-4 pl-14 pr-5 text-base text-[#0d2452] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-[#7a7f7d] hover:border-[#747c79] hover:bg-white/80 focus:border-[#5148b9] focus:bg-white focus:ring-4 focus:ring-[#5148b9]/10 user-invalid:border-danger user-invalid:ring-danger/10 sm:text-lg"
                name="email_address"
                placeholder={emailPlaceholder}
                required
                type="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="send"
                aria-invalid={showEmailError || undefined}
                aria-describedby={`${errorId} ${consentId}`}
                onBlur={(event) => setShowEmailError(event.currentTarget.matches(":user-invalid"))}
                onInvalid={() => setShowEmailError(true)}
                onInput={(event) => {
                  if (event.currentTarget.validity.valid) setShowEmailError(false);
                }}
              />
            </div>
            <p
              id={errorId}
              className={showEmailError ? "mt-2 text-sm text-danger" : "sr-only"}
              aria-live="polite"
            >
              請輸入有效的 Email。
            </p>
          </div>

          <button
            data-element="submit"
            className="formkit-submit group mt-7 inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#5148b9] px-6 py-4 text-base font-semibold text-white shadow-[0_14px_30px_-18px_rgba(81,72,185,0.8)] transition-[background-color,transform,box-shadow] hover:bg-[#443ca5] hover:shadow-[0_18px_34px_-18px_rgba(81,72,185,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#5148b9] active:translate-y-px disabled:pointer-events-none disabled:opacity-60 sm:text-lg"
            type="submit"
          >
            <span>{submitLabel}</span>
            <ArrowRight
              size={22}
              weight="bold"
              className="transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </button>

          <p id={consentId} className="mt-7 flex items-center gap-2 text-sm leading-6 text-[#52615c]">
            <LockKey size={18} weight="regular" className="shrink-0 text-[#08745d]" aria-hidden="true" />
            {consentText}
          </p>
        </div>

        <ul
          className="formkit-alert formkit-alert-error mt-4 empty:hidden rounded-xl border border-danger/25 bg-danger-light px-4 py-3 text-sm text-danger"
          data-element="errors"
          data-group="alert"
          aria-live="polite"
          aria-atomic="true"
        />
      </form>
    </>
  );
}
