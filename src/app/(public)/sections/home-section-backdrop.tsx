import Image from "next/image";
import { cn } from "@/lib/utils";

interface HomeSectionBackdropProps {
  src: string;
  placement?: "full" | "right";
  imageClassName?: string;
  className?: string;
  overlayClassName?: string;
}

/**
 * Decorative section art. Keep the image out of the content flow so the
 * section remains readable and useful when the visual layer is unavailable.
 */
export function HomeSectionBackdrop({
  src,
  placement = "full",
  imageClassName,
  className,
  overlayClassName,
}: HomeSectionBackdropProps) {
  return (
    <>
      <div
        data-home-backdrop
        className={cn(
          "pointer-events-none absolute -z-20 overflow-hidden opacity-[0.14]",
          placement === "right" ? "-inset-y-12 left-[38%] -right-12" : "-inset-12",
          className,
        )}
        aria-hidden="true"
      >
        <Image
          src={src}
          alt=""
          fill
          loading="lazy"
          quality={60}
          sizes="100vw"
          className={cn("object-cover", imageClassName)}
        />
      </div>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10",
          overlayClassName,
        )}
        aria-hidden="true"
      />
    </>
  );
}
