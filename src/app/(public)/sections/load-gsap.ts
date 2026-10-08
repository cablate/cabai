import type * as GsapModule from "gsap";
import type * as ScrollTriggerModule from "gsap/dist/ScrollTrigger";

type GsapBundle = {
  gsap: typeof GsapModule.gsap;
  ScrollTrigger: typeof ScrollTriggerModule.ScrollTrigger;
};

let bundlePromise: Promise<GsapBundle> | null = null;

/** Load scroll-only animation code after the initial page bundle hydrates. */
export function loadGsap() {
  bundlePromise ??= Promise.all([
    import("gsap"),
    import("gsap/dist/ScrollTrigger"),
  ]).then(([gsapModule, scrollTriggerModule]) => ({
    gsap: gsapModule.gsap,
    ScrollTrigger: scrollTriggerModule.ScrollTrigger,
  }));

  return bundlePromise;
}
