/** Browser-side document optimization, adapted from Dental Brainy. */

export const OPTIMIZABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_EDGE = 1_600;
export const IMAGE_SIZE_FLOOR = 600 * 1024;
export const PDF_SIZE_FLOOR = 8 * 1024 * 1024;
export const MIN_GAIN = 0.9;

export type DocumentOptimizationProgress = {
  stage: "loading" | "page" | "saving" | "kept-original" | "done" | "native-pdf";
  page?: number;
  pages?: number;
};

export function targetDimensions(width: number, height: number, maxEdge = MAX_IMAGE_EDGE) {
  if (!(width > 0) || !(height > 0)) return null;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, resized: false };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    resized: true,
  };
}

export function shouldOptimizeImage(file: Pick<File, "type" | "size"> | null | undefined): boolean {
  return Boolean(
    file
      && OPTIMIZABLE_IMAGE_TYPES.has(file.type)
      && file.size > IMAGE_SIZE_FLOOR,
  );
}

export function shouldOptimizePdf(file: Pick<File, "type" | "size"> | null | undefined): boolean {
  return Boolean(file && file.type === "application/pdf" && file.size > PDF_SIZE_FLOOR);
}

/** Keep a replacement only when it is at least 10% smaller. */
export function keepSmaller(originalSize: number, candidateSize: number, minGain = MIN_GAIN): boolean {
  return candidateSize > 0 && originalSize > 0 && candidateSize < originalSize * minGain;
}

export function renamedAs(name: string, extension: string): string {
  const clean = String(name || "document");
  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  return `${base}.${extension}`;
}

async function optimizeImageFile(file: File): Promise<File> {
  if (!shouldOptimizeImage(file)) return file;
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const target = targetDimensions(bitmap.width, bitmap.height);
    if (!target) return file;

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || !keepSmaller(file.size, blob.size)) return file;
    return new File([blob], renamedAs(file.name, "webp"), {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function optimizeDocumentFile(
  file: File,
  onProgress?: (progress: DocumentOptimizationProgress) => void,
): Promise<File> {
  if (shouldOptimizeImage(file)) return optimizeImageFile(file);
  if (!shouldOptimizePdf(file)) return file;

  try {
    const { compressPdfFile } = await import("@/lib/compress-pdf");
    return await compressPdfFile(file, { onProgress });
  } catch (error) {
    console.error("PDF optimization failed; keeping the original file", error);
    return file;
  }
}
