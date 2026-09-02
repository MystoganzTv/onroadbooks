"use client";

import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/shell/language-provider";

export function DriverSettlementExport({ id }: { id: string }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.driverPay;
  return <div className="flex gap-2 print:hidden">
    <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> {copy.printPdf}</Button>
    <Button asChild variant="outline" size="sm"><a href={`/api/export/driver-settlement/${id}`} download><Download /> {copy.exportCsv}</a></Button>
  </div>;
}
