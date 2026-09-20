"use client";

import * as React from "react";
import { toast } from "sonner";
import { setViewModeAction } from "@/lib/actions/view-mode";
import type { ViewMode } from "@/lib/view-mode";
import { useLanguage } from "./language-provider";

const ViewModeContext = React.createContext<{
  mode: ViewMode;
  pending: boolean;
  setMode: (mode: ViewMode) => void;
} | null>(null);

export function ViewModeProvider({ mode, children }: { mode: ViewMode; children: React.ReactNode }) {
  const [pending, startTransition] = React.useTransition();
  const { dictionary } = useLanguage();
  const errorMessage = dictionary.viewMode.saveError;
  const setMode = React.useCallback((next: ViewMode) => {
    if (next === mode || pending) return;
    startTransition(async () => {
      try {
        // The cookie action returns the updated server tree, including this
        // provider's mode. Failed writes leave the confirmed view in place.
        await setViewModeAction(next);
      } catch {
        toast.error(errorMessage);
      }
    });
  }, [mode, pending, errorMessage]);
  const value = React.useMemo(() => ({ mode, pending, setMode }), [mode, pending, setMode]);
  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const context = React.useContext(ViewModeContext);
  if (!context) throw new Error("useViewMode must be used inside ViewModeProvider");
  return context;
}
