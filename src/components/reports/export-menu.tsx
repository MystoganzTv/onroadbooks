"use client";

import { Download, FileSpreadsheet, Printer } from "lucide-react";

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
 * exactly what is on screen. PDF goes through the browser's print dialog
 * against the print stylesheet, which needs no extra dependency.
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
            Export CSV
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[16.5rem]">
          <DropdownMenuLabel>Accountant exports</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {REPORTS.map((report) => (
            <DropdownMenuItem key={report.id} asChild>
              <a
                href={`/api/export/${report.id}?${query}`}
                download
                className="cursor-pointer"
              >
                <FileSpreadsheet className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate">{report.label}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {report.description}
                  </span>
                </span>
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
