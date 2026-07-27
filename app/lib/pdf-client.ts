import type { InputDocument } from "@/app/lib/pipeline";
import { inferRole } from "@/app/lib/pipeline";

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

export function pageItemsToLines(items: unknown[]) {
  const lines: string[] = [];
  let currentLine: string[] = [];
  let currentY: number | null = null;

  const flush = () => {
    const line = currentLine.join(" ").replace(/\s+/g, " ").trim();
    if (line) lines.push(line);
    currentLine = [];
    currentY = null;
  };

  for (const rawItem of items) {
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      !("str" in rawItem) ||
      typeof rawItem.str !== "string"
    ) {
      continue;
    }

    const item = rawItem as PdfTextItem;
    const y =
      Array.isArray(item.transform) && typeof item.transform[5] === "number"
        ? item.transform[5]
        : null;

    // Most tender PDFs encode table rows as separate Y coordinates instead of
    // explicit line breaks. Preserve those rows so facts are not flattened.
    if (
      currentLine.length > 0 &&
      y !== null &&
      currentY !== null &&
      Math.abs(y - currentY) > 2
    ) {
      flush();
    }

    if (item.str.trim()) currentLine.push(item.str.trim());
    if (y !== null) currentY = y;
    if (item.hasEOL) flush();
  }

  flush();
  return lines.join("\n");
}

async function readPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = pageItemsToLines(content.items);
    pages.push(`===== PAGE ${pageNumber} =====\n${text}`);
  }

  return { text: pages.join("\n"), pageCount: pdf.numPages };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("文件编码失败"));
    reader.readAsDataURL(file);
  });
}

export async function fileToInputDocument(file: File): Promise<InputDocument> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const parsed = isPdf
    ? await readPdf(file)
    : { text: await file.text(), pageCount: 1 };
  const fileData = isPdf ? await fileToDataUrl(file) : undefined;
  const id = `DOC_UPLOAD_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    document_id: id,
    file_name: file.name,
    role: inferRole(file.name, parsed.text),
    version_or_date: new Date(file.lastModified || Date.now())
      .toISOString()
      .slice(0, 10),
    authority_rank: 6,
    page_count: parsed.pageCount,
    text: parsed.text,
    file_data: fileData,
    mime_type: file.type || (isPdf ? "application/pdf" : "text/plain"),
  };
}
