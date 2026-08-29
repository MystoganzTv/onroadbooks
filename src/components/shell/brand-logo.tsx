import Image from "next/image";

import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <div className={cn("flex items-center overflow-hidden", className)}>
      <Image
        src="/onroad-books-logo.png"
        alt="OnRoad Books — Bookkeeping Built for the Road"
        width={2172}
        height={724}
        priority={priority}
        className="h-auto w-full dark:hidden"
        sizes="(min-width: 1024px) 216px, 120px"
      />
      <Image
        src="/onroad-books-logo-dark.png"
        alt="OnRoad Books — Bookkeeping Built for the Road"
        width={2172}
        height={724}
        priority={priority}
        className="hidden h-auto w-full dark:block"
        sizes="(min-width: 1024px) 216px, 120px"
      />
    </div>
  );
}
