import type { InputDocument } from "@/app/lib/pipeline";
import { inferRole } from "@/app/lib/pipeline";
import { scoreSiteResearchPageText } from "@/app/lib/site-source-pages";

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
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = pageItemsToLines(content.items);
    pageTexts.push(text);
    pages.push(`===== PAGE ${pageNumber} =====\n${text}`);
  }

  const scoredPages = pageTexts
    .map((text, index) => {
      return {
        pageNumber: index + 1,
        text,
        score: scoreSiteResearchPageText(text),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, 3);

  const visualPages: NonNullable<InputDocument["visual_pages"]> = [];
  for (const candidate of scoredPages) {
    const page = await pdf.getPage(candidate.pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1500 / Math.max(baseViewport.width, 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) continue;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    visualPages.push({
      page_number: candidate.pageNumber,
      data_url: canvas.toDataURL("image/jpeg", 0.82),
      reason: "任务书中的区位、场地、交通或周边资源相关页面",
      text_excerpt: candidate.text.replace(/\s+/g, " ").trim().slice(0, 1800),
    });
    page.cleanup();
  }

  return {
    text: pages.join("\n"),
    pageCount: pdf.numPages,
    visualPages,
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("文件编码失败"));
    reader.readAsDataURL(file);
  });
}

function countMarkedTextPages(text: string) {
  const pageNumbers = [...text.matchAll(/={3,}\s*PAGE\s+(\d+)\s*={3,}/gi)]
    .map((match) => Number.parseInt(match[1] ?? "", 10))
    .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0);

  return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
}

export async function fileToInputDocument(file: File): Promise<InputDocument> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const parsed = isPdf
    ? await readPdf(file)
    : await file.text().then((text) => ({
        text,
        pageCount: countMarkedTextPages(text),
        visualPages: [],
      }));
  const extractedTextLength = parsed.text
    .replace(/={3,}\s*PAGE\s+\d+\s*={3,}/gi, "")
    .replace(/\s+/g, "")
    .length;
  const needsVisualPdfFallback = isPdf && extractedTextLength < 200;
  const fileData = needsVisualPdfFallback
    ? await fileToDataUrl(file)
    : undefined;
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
    visual_pages: parsed.visualPages,
  };
}
