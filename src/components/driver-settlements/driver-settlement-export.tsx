"use client";

import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DriverSettlementExport({ id }: { id: string }) {
  return <div className="flex gap-2 print:hidden">
    <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> Print / PDF</Button>
    <Button asChild variant="outline" size="sm"><a href={`/api/export/driver-settlement/${id}`} download><Download /> Export CSV</a></Button>
  </div>;
}
