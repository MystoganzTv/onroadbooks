"use client";

import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
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
export function ExportMenu({ query }: { query: string }) {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer />
        Print / PDF
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Download />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[16.5rem]">
          <DropdownMenuLabel>Accountant exports</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {REPORTS.map((report) => <DropdownMenuItem key={report.id} className="justify-between gap-3 focus:bg-transparent">
            <span className="min-w-0"><span className="block truncate">{report.label}</span><span className="block truncate text-2xs text-muted-foreground">{report.description}</span></span>
            <span className="flex shrink-0 items-center gap-1">
              <a href={`/api/export/${report.id}?${query}&format=csv`} download className="rounded border px-1.5 py-1 text-2xs hover:bg-accent" title="CSV">CSV</a>
              <a href={`/api/export/${report.id}?${query}&format=xlsx`} download className="rounded border p-1 hover:bg-accent" title="Excel workbook"><FileSpreadsheet className="size-3.5" /></a>
              <a href={`/api/export/${report.id}?${query}&format=pdf`} download className="rounded border p-1 hover:bg-accent" title="PDF"><FileText className="size-3.5" /></a>
            </span>
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
