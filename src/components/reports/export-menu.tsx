"use client";

import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/shell/language-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REPORTS } from "@/lib/export";

/**
 * Exports use the page's own period query string, so what downloads is
 * exactly what is on screen. Print remains useful for the visual dashboard;
 * the dropdown generates native accountant files without a browser dialog.
 */
export function ExportMenu({ query, year }: { query: string; year: number }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.reports;
  const reportCopy = {
    loads: [copy.exportLoads, copy.exportLoadsDescription],
    expenses: [copy.exportExpenses, copy.exportExpensesDescription],
    fuel: [copy.exportFuel, copy.exportFuelDescription],
    "profit-loss": [copy.exportFinancial, copy.exportFinancialDescription],
    mileage: [copy.exportMileage, copy.exportMileageDescription],
    maintenance: [copy.exportMaintenance, copy.exportMaintenanceDescription],
  } as const;
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer />
        {copy.printPdf}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Download />
            {copy.accountantPackage}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[16.5rem]">
          <DropdownMenuLabel>{copy.recommendedHandoff}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* One attachment beats six. Everything below is in here already. */}
          <DropdownMenuItem asChild className="justify-between gap-3">
            <a href={`/api/export/year-end?year=${year}`} download>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {copy.yearEndPacket.replace("{year}", String(year))}
                </span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {copy.yearEndDescription}
                </span>
              </span>
              <FileSpreadsheet className="size-4 shrink-0" />
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {REPORTS.map((report) => <DropdownMenuItem key={report.id} className="justify-between gap-3 focus:bg-transparent">
            <span className="min-w-0"><span className="block truncate">{reportCopy[report.id][0]}</span><span className="block truncate text-2xs text-muted-foreground">{reportCopy[report.id][1]}</span></span>
            <span className="flex shrink-0 items-center gap-1">
              <a href={`/api/export/${report.id}?${query}&format=csv`} download className="rounded border px-1.5 py-1 text-2xs hover:bg-accent" title="CSV">CSV</a>
              <a href={`/api/export/${report.id}?${query}&format=xlsx`} download className="rounded border p-1 hover:bg-accent" title={copy.excelWorkbook}><FileSpreadsheet className="size-3.5" /></a>
              <a href={`/api/export/${report.id}?${query}&format=pdf`} download className="rounded border p-1 hover:bg-accent" title="PDF"><FileText className="size-3.5" /></a>
            </span>
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
