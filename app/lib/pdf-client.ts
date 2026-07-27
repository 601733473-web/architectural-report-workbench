import type { InputDocument } from "@/app/lib/pipeline";
import { inferRole } from "@/app/lib/pipeline";

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
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(`===== PAGE ${pageNumber} =====\n${text}`);
  }

  return { text: pages.join("\n"), pageCount: pdf.numPages };
}

export async function fileToInputDocument(file: File): Promise<InputDocument> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const parsed = isPdf
    ? await readPdf(file)
    : { text: await file.text(), pageCount: 1 };
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
  };
}

