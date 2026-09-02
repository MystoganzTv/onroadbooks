"use client";

/**
 * THE SEGMENT ERROR BOUNDARY
 * ==========================
 *
 * Without this file a rejected server action inside a transition takes down
 * the whole app and Next renders its own bare fallback -- on a phone with one
 * bar of signal, which is exactly where this product is used. The layout and
 * the sidebar survive here, so the owner keeps their place and can retry.
 *
 * It says the one thing that matters first: nothing was written.
 */

import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.common;

  React.useEffect(() => {
    // Surfaces in the same place `instrumentation.ts` reports server errors.
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <div className="p-4 sm:p-6">
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warn-soft text-warn">
              <AlertTriangle className="size-4" aria-hidden />
            </span>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">{copy.errorTitle}</h2>
              <p className="text-sm text-muted-foreground">{copy.errorBody}</p>
            </div>
          </div>

          {error.digest ? (
            <p className="rounded-md bg-surface-sunken px-3 py-2 font-mono text-2xs text-muted-foreground">
              {error.digest}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={reset} className="h-11">
              {copy.errorRetry}
            </Button>
            <Button asChild variant="outline" className="h-11">
              <Link href="/dashboard">{copy.errorHome}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
