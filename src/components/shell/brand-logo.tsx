import Image from "next/image";

import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center overflow-hidden rounded-md border border-slate-200 bg-white px-1.5 py-1 shadow-sm",
        className,
      )}
    >
      <Image
        src="/onroad-books-logo.png"
        alt="OnRoad Books — Bookkeeping Built for the Road"
        width={2172}
        height={724}
        priority={priority}
        className="h-auto w-full"
        sizes="(min-width: 1024px) 216px, 120px"
      />
    </div>
  );
}
