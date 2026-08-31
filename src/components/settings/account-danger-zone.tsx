"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCurrentAccount, resetAccountData } from "@/lib/actions/account";

type Operation = "reset" | "delete" | null;

export function AccountDangerZone({ email }: { email: string }) {
  const router = useRouter();
  const [operation, setOperation] = React.useState<Operation>(null);
  const [confirmation, setConfirmation] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function close() {
    if (pending) return;
    setOperation(null);
    setConfirmation("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!operation) return;

    startTransition(async () => {
      const result =
        operation === "reset"
          ? await resetAccountData(confirmation)
          : await deleteCurrentAccount(confirmation);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (operation === "reset") {
        toast.success("Account data reset", {
          description: "Your account and plan were kept. Your books are ready for a fresh start.",
        });
        setOperation(null);
        setConfirmation("");
        router.push("/welcome");
        router.refresh();
      } else {
        window.location.assign("/login?account=deleted");
      }
    });
  }

  const expected = operation === "reset" ? "RESET" : email;
  const confirmed =
    operation === "reset"
      ? confirmation.trim() === "RESET"
      : confirmation.trim() === email;

  return (
    <Card className="border-destructive/35">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-destructive" />
          <CardTitle>Account &amp; data</CardTitle>
        </div>
        <span className="text-2xs font-medium uppercase tracking-wider text-destructive">
          Danger zone
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col justify-between gap-4 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold">Reset business data</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Permanently removes loads, expenses, trucks, documents, maintenance, settlements,
                reserves and targets. Your login, business name and plan stay active.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setOperation("reset")}
            >
              <RotateCcw />
              Reset data
            </Button>
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/[0.03] p-4">
            <div>
              <h3 className="text-sm font-semibold text-destructive">Delete account</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Permanently removes your login, business workspace, all financial records and all
                stored documents. This cannot be undone.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="self-start"
              onClick={() => setOperation("delete")}
            >
              <Trash2 />
              Delete account
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={operation !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {operation === "reset" ? "Reset all business data?" : "Delete your account?"}
              </DialogTitle>
              <DialogDescription>
                This is permanent. There is no undo or recovery after you confirm.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="rounded-md border border-destructive/25 bg-destructive/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
                {operation === "reset"
                  ? "Your login, business name and subscription plan will remain. Every ledger record and uploaded file will be removed."
                  : "Your login and the complete business workspace will be removed from OnRoad Books and Supabase."}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-confirmation">
                  Type <span className="normal-case text-foreground">{expected}</span> to confirm
                </Label>
                <Input
                  id="account-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                  autoFocus
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={!confirmed || pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {operation === "reset" ? "Reset permanently" : "Delete permanently"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
