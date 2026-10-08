"use client";

import { useEffect } from "react";
import { useReducedMotion } from "framer-motion";
import { loadGsap } from "./load-gsap";

export function HomeMotion() {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;

    let cancelled = false;
    let context: { revert: () => void } | null = null;

    void loadGsap().then(({ gsap, ScrollTrigger }) => {
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>("[data-home-reveal]").forEach((element) => {
          gsap.fromTo(
            element,
            { autoAlpha: 0, y: 52 },
            {
              autoAlpha: 1,
              y: 0,
              immediateRender: false,
              duration: 0.9,
              ease: "power3.out",
              scrollTrigger: {
                trigger: element,
                start: "top 86%",
                once: true,
              },
            },
          );
        });
      });
    });

    return () => {
      cancelled = true;
      context?.revert();
    };
  }, [reduceMotion]);

  return null;
}
