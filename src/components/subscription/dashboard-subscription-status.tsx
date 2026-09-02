import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { planOf, trialState } from "@/lib/plans";
import type { Subscription } from "@/lib/types";
import { appText, type AppLocale } from "@/lib/i18n";

/** Account status belongs in the cockpit, where owners begin their day. */
export function DashboardSubscriptionStatus({
  subscription,
  today,
  canManage = true,
  locale = "en",
}: {
  subscription: Subscription;
  today: string;
  canManage?: boolean;
  locale?: AppLocale;
}) {
  const tx = (english: string, spanish: string) => appText(locale, english, spanish);
  const plan = planOf(subscription);
  const trial = trialState(subscription, today);

  if (trial) {
    const timeLabel = trial.expired
      ? tx("Trial ended", "Prueba terminada")
      : trial.daysRemaining === 0
        ? tx("Ends today", "Termina hoy")
        : locale === "es"
          ? `${trial.daysRemaining} ${trial.daysRemaining === 1 ? "día restante" : "días restantes"}`
          : `${trial.daysRemaining} ${trial.daysRemaining === 1 ? "day" : "days"} left`;

    return (
      <Card className="overflow-hidden border-primary/30 bg-primary/5">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Clock3 className="size-5" aria-hidden />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{tx("Your OnRoad Pro trial", "Tu prueba de OnRoad Pro")}</p>
                <Badge variant="info">{timeLabel}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {tx("You have every Pro tool for one truck during the 7-day trial.", "Tienes todas las herramientas Pro para un camión durante la prueba de 7 días.")}
              </p>
            </div>
          </div>
          {canManage ? (
            <Button asChild size="sm" className="shrink-0">
              <Link href="/plans">
                {tx("Keep OnRoad Pro", "Conservar OnRoad Pro")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  const active = subscription.status === "ACTIVE";
  const pastDue = subscription.status === "PAST_DUE";
  const canceled = subscription.status === "CANCELED";
  const message = pastDue
    ? tx("Your payment needs attention. Your books stay available to read and export, but new entries are paused.", "Tu pago necesita atención. Tus libros siguen disponibles para consulta y exportación, pero no se permiten nuevas entradas.")
    : canceled
      ? tx("This subscription has ended. Your books stay available to read and export whenever you need them.", "Esta suscripción terminó. Tus libros siguen disponibles para consulta y exportación.")
      : plan.id === "OWNER"
        ? tx("Your Pro subscription is active for one truck.", "Tu suscripción Pro está activa para un camión.")
        : plan.id === "FLEET"
          ? locale === "es" ? `Tu espacio Fleet cubre hasta ${plan.truckLimit} camiones.` : `Your paid Fleet workspace covers up to ${plan.truckLimit} trucks.`
          : tx("Your one-truck ledger plan is active.", "Tu plan de contabilidad para un camión está activo.");
  const actionLabel = pastDue
    ? tx("Fix billing", "Corregir facturación")
    : canceled
      ? tx("Choose a plan", "Elegir plan")
      : plan.id === "SOLO"
        ? tx("Upgrade to Pro", "Mejorar a Pro")
        : tx("Manage plan", "Administrar plan");

  return (
    <Card className={pastDue ? "overflow-hidden border-warn/40 bg-warn-soft" : "overflow-hidden"}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              active ? "bg-pos-soft text-pos" : "bg-warn-soft text-warn"
            }`}
          >
            {active ? (
              <CheckCircle2 className="size-5" aria-hidden />
            ) : pastDue ? (
              <AlertTriangle className="size-5" aria-hidden />
            ) : (
              <Sparkles className="size-5" aria-hidden />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{plan.name}</p>
              <Badge variant={active ? "positive" : "warning"}>
                {active ? tx("Active", "Activo") : subscription.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {message}
            </p>
          </div>
        </div>
        {canManage ? (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/plans">
              {actionLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
