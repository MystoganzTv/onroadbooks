"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A back control must follow the user's path, not guess which list they used.
 * The fallback keeps a directly opened detail page from becoming a dead end.
 */
export function HistoryBackButton({
  fallbackHref,
  label,
  className,
}: {
  fallbackHref: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("text-muted-foreground", className)}
      onClick={goBack}
    >
      <ArrowLeft aria-hidden />
      {label}
    </Button>
  );
}
