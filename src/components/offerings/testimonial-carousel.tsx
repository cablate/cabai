"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import { Star, CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

export interface TestimonialItem {
  name: string;
  title?: string;
  avatarUrl?: string;
  content: string;
  rating?: number;
}

interface TestimonialCarouselProps {
  items: TestimonialItem[];
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} 星`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={14}
          weight={i < rating ? "fill" : "regular"}
          className={i < rating ? "text-amber-400" : "text-zinc-200"}
        />
      ))}
    </span>
  );
}

export default function TestimonialCarousel({ items }: TestimonialCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollTo = useCallback((targetIdx: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cards = el.children;
    const target = cards[targetIdx] as HTMLElement | undefined;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || items.length === 0) return;
    const cardWidth = el.scrollWidth / items.length;
    const idx = Math.round(el.scrollLeft / cardWidth);
    setCurrentIndex(Math.min(idx, items.length - 1));
  }, [items.length]);

  // For 1 item, no carousel needed
  if (items.length <= 1) {
    return (
      <div className="max-w-lg">
        <TestimonialCard item={items[0]!} />
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-full">
      {/* Scroll Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex w-full max-w-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {items.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="w-[calc(100vw-2.5rem)] max-w-80 snap-start shrink-0 sm:w-80"
          >
            <TestimonialCard item={item} />
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => scrollTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          aria-label="上一則"
          className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-border-subtle text-text-muted transition-[border-color,color,transform] hover:border-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] disabled:pointer-events-none disabled:opacity-20 sm:flex"
        >
          <CaretLeft size={14} weight="bold" />
        </button>

        {/* Dot Indicators */}
        <div className="flex items-center">
          {items.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => scrollTo(idx)}
              aria-label={`第 ${idx + 1} 則評價`}
              aria-pressed={idx === currentIndex}
              className="group flex size-11 items-center justify-center rounded-full transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.94]"
            >
              <span
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? "w-5 bg-accent"
                    : "w-1.5 bg-zinc-200 group-hover:bg-zinc-300 group-focus-visible:bg-accent/70"
                }`}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollTo(currentIndex + 1)}
          disabled={currentIndex >= items.length - 1}
          aria-label="下一則"
          className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-border-subtle text-text-muted transition-[border-color,color,transform] hover:border-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] disabled:pointer-events-none disabled:opacity-20 sm:flex"
        >
          <CaretRight size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function TestimonialCard({ item }: { item: TestimonialItem }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-5">
      {/* Quote */}
      <div className="relative pl-4 before:absolute before:left-0 before:top-0 before:text-lg before:leading-none before:text-accent before:content-['\201C']">
        <p className="text-sm leading-6 text-text-secondary">
          {item.content}
        </p>
      </div>

      {/* Author & Rating */}
      <div className="mt-auto flex items-center gap-3">
        {/* Avatar */}
        {item.avatarUrl ? (
          <Image
            src={item.avatarUrl}
            alt={item.name}
            width={36}
            height={36}
            unoptimized
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
            {item.name.charAt(0)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">
            {item.name}
          </p>
          {item.title && (
            <p className="text-xs text-text-muted">{item.title}</p>
          )}
        </div>

        {item.rating && <StarRating rating={item.rating} />}
      </div>
    </div>
  );
}
