import type { Metadata } from "next";
import { Activity, Bot, CircleDollarSign, MessageSquare, Users } from "lucide-react";

import { OnroadAiBlockButton, OnroadAiOperations } from "@/components/admin/onroad-ai-actions";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper } from "@/components/ui/table";
import { requireAdminPageSession } from "@/lib/auth/admin";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { formatLocaleDate, formatLocaleNumber } from "@/lib/i18n-format";
import { getAppLocale } from "@/lib/i18n-server";
import { loadAdminDashboard } from "@/lib/onroad-ai/admin-data";
import type { HealthIssue } from "@/lib/onroad-ai/monitoring";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).onroadAi.metadataTitle };
}

/**
 * Operator console for the WhatsApp assistant. Platform admins only (same
 * allowlist as /admin). Every figure is an aggregate; phone numbers are
 * masked; message content is never read here.
 */
export default async function OnroadAiAdminPage() {
  const [, locale] = await Promise.all([requireAdminPageSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).onroadAi;
  const data = await loadAdminDashboard();

  const usd = (value: number) =>
    formatLocaleNumber(value, locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2,
    });
  const count = (value: number) => formatLocaleNumber(value, locale);

  if (data.kind === "NO_STORE") {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title={copy.title} description={copy.description} />
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">{copy.noStore}</CardContent>
        </Card>
      </div>
    );
  }

  const { report, health, status } = data;
  const micro = (value: number) => usd(value / 1_000_000);
  const statusItems: { label: string; value: string; on: boolean }[] = [
    { label: copy.statusWhatsApp, value: status.whatsapp ? copy.on : copy.off, on: status.whatsapp },
    { label: copy.statusInterpreter, value: status.interpreter ? copy.on : copy.off, on: status.interpreter },
    { label: copy.statusVoice, value: status.voice ? copy.on : copy.off, on: status.voice },
    { label: copy.statusBilling, value: status.billing ? copy.on : copy.off, on: status.billing },
    { label: copy.statusLoadBoard, value: status.loadBoard === "LIVE" ? copy.on : status.loadBoard === "TEST" ? copy.testData : copy.off, on: status.loadBoard === "LIVE" },
    { label: copy.statusTemplate, value: status.alertTemplate ? copy.on : copy.off, on: status.alertTemplate },
  ];

  const metrics = [
    {
      label: copy.drivers,
      value: count(data.drivers.length),
      note: interpolate(copy.driversNote, { onboarded: data.onboardedDrivers, active: report.activeDrivers30d }),
      icon: Users,
      tone: "text-info",
    },
    {
      label: copy.subscribers,
      value: count(report.billing.proActive),
      note: interpolate(copy.subscribersNote, { pastDue: report.billing.proPastDue, mrr: usd(report.billing.mrrCents / 100) }),
      icon: Bot,
      tone: "text-primary",
    },
    {
      label: copy.messages30,
      value: count(report.totals.messagesIn + report.totals.messagesOut),
      note: interpolate(copy.messages30Note, { in: count(report.totals.messagesIn), out: count(report.totals.messagesOut) }),
      icon: MessageSquare,
      tone: "text-info",
    },
    {
      label: copy.cost30,
      value: usd(report.variableCostUsd + report.fixedCostUsd),
      note: interpolate(copy.cost30Note, { perDriver: usd(report.costPerActiveDriverUsd) }),
      icon: CircleDollarSign,
      tone: "text-muted-foreground",
    },
  ];

  const breakdown = [
    { label: copy.costAi, value: report.totals.aiCostMicros / 1_000_000 },
    { label: copy.costVoice, value: report.totals.transcribeCostMicros / 1_000_000 },
    { label: copy.costWhatsApp, value: report.totals.whatsappCostMicros / 1_000_000 },
    { label: copy.costFixed, value: report.fixedCostUsd },
  ];
  const breakdownMax = Math.max(...breakdown.map((item) => item.value), 0.000001);

  const issueText = (issue: HealthIssue): string => {
    switch (issue.kind) {
      case "DEAD_EVENTS": return interpolate(copy.eventsDead, { count: issue.count });
      case "SEND_FAILURES": return interpolate(copy.sendsFailed, { failed: issue.failed, total: issue.failed + issue.sent });
      case "BACKLOG": return interpolate(copy.eventsPending, { count: issue.pending });
      case "OVER_BUDGET": return `${copy.cost30}: ${usd(issue.costUsd)} > ${usd(issue.budgetUsd)}`;
      case "NEW_USER_SPIKE": return interpolate(copy.newNumbers, { count: issue.count });
    }
  };

  const recentDays = report.days.slice(-14).reverse();

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title={copy.title} description={copy.description} />

      {!data.enabled ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">{copy.disabled}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{copy.statusTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
          {statusItems.map((item) => (
            <Badge key={item.label} variant={item.on ? "info" : "outline"}>
              {item.label}: {item.value}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tnum">{metric.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
              </div>
              <metric.icon className={`mt-0.5 size-5 shrink-0 ${metric.tone}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{copy.costBreakdown}</CardTitle>
            <span className={`text-sm font-semibold tnum ${report.marginUsd > 0 ? "text-pos" : report.marginUsd < 0 ? "text-neg" : "text-muted-foreground"}`}>
              {copy.margin30}: {usd(report.marginUsd)}
            </span>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {breakdown.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span>{item.label}</span>
                  <span className="tnum">{usd(item.value)}</span>
                </div>
                <div className="h-1.5 rounded bg-surface-sunken">
                  <div className="h-1.5 rounded bg-info" style={{ width: `${Math.round((item.value / breakdownMax) * 100)}%` }} />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {interpolate(copy.margin30Note, { revenue: usd(report.revenueUsd), variable: usd(report.variableCostUsd), fixed: usd(report.fixedCostUsd) })}
            </p>
            <p className="text-xs text-muted-foreground">{copy.costEstimateNote}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.healthTitle}</CardTitle>
            <Activity className={`size-4 ${health.issues.length ? "text-warn" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 text-sm">
            {health.issues.length ? (
              health.issues.map((issue) => (
                <Badge key={issue.kind} variant="warning" className="mr-2">
                  {issueText(issue)}
                </Badge>
              ))
            ) : (
              <p className="text-muted-foreground">{copy.healthy}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {interpolate(copy.eventsPending, { count: health.counts.pendingEvents })} · {interpolate(copy.newNumbers, { count: health.counts.newUsers })}
            </p>
            <OnroadAiOperations enabled={data.enabled} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{copy.dailyTitle}</CardTitle>
        </CardHeader>
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.day}</TableHead>
                <TableHead className="text-right">{copy.activeDrivers}</TableHead>
                <TableHead className="text-right">{copy.messagesIn}</TableHead>
                <TableHead className="text-right">{copy.messagesOut}</TableHead>
                <TableHead className="text-right">{copy.aiReads}</TableHead>
                <TableHead className="text-right">{copy.voice}</TableHead>
                <TableHead className="text-right">{copy.cost}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentDays.map((day) => (
                <TableRow key={day.day}>
                  <TableCell>{formatLocaleDate(day.day, locale, "short")}</TableCell>
                  <TableCell className="text-right tnum">{count(day.activeUsers)}</TableCell>
                  <TableCell className="text-right tnum">{count(day.messagesIn)}</TableCell>
                  <TableCell className="text-right tnum">{count(day.messagesOut)}</TableCell>
                  <TableCell className="text-right tnum">{count(day.aiCalls)}</TableCell>
                  <TableCell className="text-right tnum">{count(day.transcriptions)}</TableCell>
                  <TableCell className="text-right tnum">{micro(day.costMicros)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.driverTable}</CardTitle>
          <span className="text-2xs text-muted-foreground">{copy.driverTableNote}</span>
        </CardHeader>
        {data.drivers.length ? (
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.driver}</TableHead>
                  <TableHead>{copy.plan}</TableHead>
                  <TableHead>{copy.status}</TableHead>
                  <TableHead>{copy.joined}</TableHead>
                  <TableHead>{copy.lastMessage}</TableHead>
                  <TableHead className="text-right">{copy.loads}</TableHead>
                  <TableHead className="text-right">{copy.cost30Short}</TableHead>
                  <TableHead className="text-right">{copy.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.drivers.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell>
                      <div className="font-medium tnum">{driver.label}</div>
                      {driver.name ? <div className="text-xs text-muted-foreground">{driver.name}</div> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={driver.plan === "PRO" ? "info" : "outline"}>
                        {driver.plan}
                        {driver.planStatus && driver.plan === "PRO" ? ` · ${driver.planStatus}` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={driver.state === "BLOCKED" ? "negative" : driver.state === "ONBOARDING" ? "outline" : "default"}>
                        {driver.state === "BLOCKED" ? copy.blocked : driver.state === "ONBOARDING" ? copy.onboarding : copy.active}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatLocaleDate(driver.joined, locale, "medium")}</TableCell>
                    <TableCell>{driver.lastMessage ? formatLocaleDate(driver.lastMessage, locale, "medium") : copy.never}</TableCell>
                    <TableCell className="text-right tnum">{count(driver.loads)}</TableCell>
                    <TableCell className="text-right tnum">{usd(driver.cost30Usd)}</TableCell>
                    <TableCell className="text-right">
                      <OnroadAiBlockButton userId={driver.id} blocked={driver.state === "BLOCKED"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        ) : (
          <CardContent className="p-4 text-sm text-muted-foreground">{copy.noDrivers}</CardContent>
        )}
      </Card>
    </div>
  );
}
