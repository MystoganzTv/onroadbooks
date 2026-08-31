import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildReport } from "../src/lib/export";
import { invoicePdf, toPdf } from "../src/lib/export-pdf";
import { toXlsx } from "../src/lib/export-xlsx";
import { resolvePeriod } from "../src/lib/periods";
import { buildSeedDataset } from "../src/lib/seed/seed-data";

async function main() {
  const root = process.cwd();
  const pdfDir = path.join(root, "tmp", "pdfs");
  const spreadsheetDir = path.join(root, "tmp", "spreadsheets");
  await Promise.all([mkdir(pdfDir, { recursive: true }), mkdir(spreadsheetDir, { recursive: true })]);

  const dataset = buildSeedDataset();
  const load = dataset.loads.find((row) => row.invoiceNumber) ?? dataset.loads[0];
  const table = buildReport("loads", dataset, resolvePeriod("2026-08", "full"));
  await Promise.all([
    invoicePdf(dataset.business, load).then((bytes) => writeFile(path.join(pdfDir, "invoice-sample.pdf"), bytes)),
    toPdf(table).then((bytes) => writeFile(path.join(pdfDir, "loads-report-sample.pdf"), bytes)),
    toXlsx(table).then((bytes) => writeFile(path.join(spreadsheetDir, "loads-report-sample.xlsx"), bytes)),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
