import type { InputDocument } from "@/app/lib/pipeline";

export interface SiteSourcePage {
  document: InputDocument;
  page_number: number;
  text_excerpt: string;
  data_url?: string;
  score: number;
}

export function scoreSiteResearchPageText(text: string) {
  const compact = text.normalize("NFKC").replace(/\s+/g, "");
  return [
    /项目区位|项目位置|基地位置|地块位置|场地位置|SITELOCATION|LOCATION/i,
    /场地条件|基地条件|周边关系|城市关系|区位分析/i,
    /交通区位|交通条件|轨道交通|地铁|公交|道路/i,
    /景观资源|自然资源|地形|水系|公园/i,
  ].reduce(
    (score, pattern, patternIndex) =>
      score + (pattern.test(compact) ? 5 - patternIndex : 0),
    0,
  );
}

function splitDocumentPages(text: string) {
  const pages = new Map<number, string[]>();
  let pageNumber = 1;
  pages.set(pageNumber, []);
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const marker = line.match(/={3,}\s*PAGE\s+(\d+)\s*={3,}/i);
    if (marker) {
      pageNumber = Number(marker[1]);
      if (!pages.has(pageNumber)) pages.set(pageNumber, []);
      continue;
    }
    pages.get(pageNumber)?.push(line);
  }
  return [...pages.entries()].map(([page_number, lines]) => ({
    page_number,
    text_excerpt: lines.join("\n").trim(),
  }));
}

export function selectSiteResearchSourcePages(
  documents: InputDocument[],
  limit = 3,
) {
  const candidates: SiteSourcePage[] = [];
  for (const document of documents) {
    if (!['authoritative', 'proposal'].includes(document.role)) continue;
    const visualPageNumbers = new Set<number>();
    for (const page of document.visual_pages ?? []) {
      visualPageNumbers.add(page.page_number);
      candidates.push({
        document,
        page_number: page.page_number,
        text_excerpt: page.text_excerpt,
        data_url: page.data_url,
        score: scoreSiteResearchPageText(page.text_excerpt) + 12,
      });
    }
    for (const page of splitDocumentPages(document.text)) {
      if (visualPageNumbers.has(page.page_number)) continue;
      const score = scoreSiteResearchPageText(page.text_excerpt);
      if (score <= 0) continue;
      candidates.push({ ...page, document, score });
    }
  }
  return candidates
    .sort(
      (left, right) =>
        right.score - left.score || left.page_number - right.page_number,
    )
    .slice(0, limit);
}
