import "client-only";

import { PDFDocument } from "pdf-lib";

import {
  keepSmaller,
  renamedAs,
  type DocumentOptimizationProgress,
} from "@/lib/document-optimization";

export const DEFAULT_DPI = 150;
export const DEFAULT_QUALITY = 0.72;

export function scaleForDpi(dpi: number): number {
  return dpi / 72;
}

type Progress = (progress: DocumentOptimizationProgress) => void;

/**
 * Rasterizes image-only scans. Searchable/native PDFs are deliberately left
 * untouched so text, vectors, signatures and accessibility are preserved.
 */
export async function compressPdfFile(
  file: File,
  {
    targetDpi = DEFAULT_DPI,
    quality = DEFAULT_QUALITY,
    onProgress,
  }: { targetDpi?: number; quality?: number; onProgress?: Progress } = {},
): Promise<File> {
  const report: Progress = (progress) => {
    try {
      onProgress?.(progress);
    } catch {
      // Progress reporting must never prevent an upload.
    }
  };

  report({ stage: "loading" });
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
  }

  const source = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data: source }).promise;
  const output = await PDFDocument.create();

  try {
    // An OCR layer also counts as searchable. Skipping it is conservative:
    // storage is cheaper than silently destroying useful document structure.
    let extractedCharacters = 0;
    const samplePages = Math.min(document.numPages, 3);
    for (let pageNumber = 1; pageNumber <= samplePages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = await page.getTextContent();
      extractedCharacters += text.items.reduce((total, item) => {
        return total + ("str" in item ? item.str.trim().length : 0);
      }, 0);
      page.cleanup();
      if (extractedCharacters >= 40) {
        report({ stage: "native-pdf" });
        return file;
      }
    }

    const scale = scaleForDpi(targetDpi);
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      report({ stage: "page", page: pageNumber, pages: document.numPages });
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return file;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      if (!blob) return file;

      const image = await output.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const base = page.getViewport({ scale: 1 });
      const sheet = output.addPage([base.width, base.height]);
      sheet.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
    }

    report({ stage: "saving" });
    const bytes = await output.save({ useObjectStreams: true });
    if (!keepSmaller(file.size, bytes.length)) {
      report({ stage: "kept-original" });
      return file;
    }

    report({ stage: "done" });
    const copy = new Uint8Array(bytes);
    return new File([copy], renamedAs(file.name, "pdf"), {
      type: "application/pdf",
      lastModified: Date.now(),
    });
  } finally {
    await document.destroy();
  }
}
