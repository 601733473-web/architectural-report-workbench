import type {
  DesignReportNarrative,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

type ProjectFact = DesignReportProjectFacts["facts"][number];
type GateBProposal = NonNullable<
  DesignReportProjectFacts["gate_b_proposals"]
>[number];

export interface DesignNarrativeExportData {
  projectName: string;
  projectId: string;
  generatedAt: string;
  narrative: DesignReportNarrative;
  facts: ProjectFact[];
  proposals: GateBProposal[];
  sourceDocuments: {
    documentId: string;
    fileName: string;
    role: string;
    versionOrDate: string;
    pageCount?: number;
  }[];
  pages: {
    pageId: string;
    pageNumber: string;
    pageType: string;
    headline: string;
    coreMessage: string;
    bodyText: string;
    diagramLabels: string[];
    sources: {
      documentId: string;
      page: number;
    }[];
  }[];
}

const COLORS = {
  ink: "171A18",
  muted: "6D746F",
  blue: "2E74B5",
  darkBlue: "1F4D78",
  accent: "D95D38",
  tableFill: "F4F6F9",
  border: "D8DDE2",
  white: "FFFFFF",
};

function bodyParagraph(
  text: string,
  options: {
    bold?: boolean;
    color?: string;
    size?: number;
    after?: number;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    keepNext?: boolean;
    italics?: boolean;
  } = {},
) {
  return new Paragraph({
    alignment: options.alignment ?? AlignmentType.JUSTIFIED,
    keepNext: options.keepNext,
    spacing: {
      before: 0,
      after: options.after ?? 160,
      line: 320,
      lineRule: "auto",
    },
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: options.size ?? 22,
        bold: options.bold,
        italics: options.italics,
        color: options.color ?? COLORS.ink,
      }),
    ],
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    numbering: { reference: "narrative-bullets", level: 0 },
    spacing: {
      before: 0,
      after: 80,
      line: 290,
      lineRule: "auto",
    },
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: 22,
        color: COLORS.ink,
      }),
    ],
  });
}

function heading(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel],
) {
  return new Paragraph({
    heading: level,
    keepNext: true,
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text })],
  });
}

function cleanText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

const DESIGN_NARRATIVE_CHAR_LIMIT = 1_000;
const BACKSTAGE_TEXT_PATTERN =
  /(?:fact_refs|proposal_refs|page_refs|field_path|source_document(?:_ids)?|layout_family|page_role|recipe_id|visual_(?:intent|brief)|generated_image|reference_crop|missing_information|known_gaps|schema|json|agent|prompt|backend|后台|素材槽|匹配依据|经验配方|审核意见|变量|结构化经验|待验证事项|(?:F|N|R|S)_\d{2,})/iu;

function exportText(value: unknown) {
  const text = cleanText(value)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text && !BACKSTAGE_TEXT_PATTERN.test(text) ? text : "";
}

function fitTextToBudget(text: string, budget: number) {
  if (text.length <= budget) return text;
  const candidate = text.slice(0, budget);
  const sentenceEnd = Math.max(
    candidate.lastIndexOf("。"),
    candidate.lastIndexOf("；"),
    candidate.lastIndexOf("，"),
  );
  return candidate
    .slice(sentenceEnd >= Math.floor(budget * 0.6) ? sentenceEnd + 1 : budget)
    .trim();
}

export async function createDesignNarrativeDocx(
  data: DesignNarrativeExportData,
) {
  const children: Paragraph[] = [];
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 420, after: 180 },
      children: [
        new TextRun({
          text: exportText(data.narrative.document_title_zh) || data.projectName,
          font: "Calibri",
          size: 36,
          bold: true,
          color: COLORS.ink,
        }),
      ],
    }),
    bodyParagraph("建筑设计说明", {
      alignment: AlignmentType.CENTER,
      color: COLORS.darkBlue,
      size: 24,
      after: 300,
    }),
  );

  let remainingCharacters = DESIGN_NARRATIVE_CHAR_LIMIT;
  const appendFitted = (
    text: unknown,
    makeParagraph: (value: string) => Paragraph,
  ) => {
    if (remainingCharacters <= 0) return;
    const safe = exportText(text);
    if (!safe) return;
    const fitted = fitTextToBudget(safe, remainingCharacters);
    if (!fitted) return;
    children.push(makeParagraph(fitted));
    remainingCharacters -= fitted.length;
  };

  appendFitted(
    data.narrative.executive_concept.statement_zh,
    (value) => bodyParagraph(value, { bold: true, color: COLORS.darkBlue }),
  );
  for (const chapter of data.narrative.chapters) {
    if (remainingCharacters < 120) break;
    const hasVisibleChapterContent = [
      chapter.lead_zh,
      ...chapter.subsections.flatMap((subsection) => [
        ...subsection.paragraphs_zh,
        ...subsection.bullet_points_zh,
      ]),
    ].some((value) => Boolean(exportText(value)));
    if (!hasVisibleChapterContent) continue;
    appendFitted(
      chapter.title_zh,
      (value) => heading(value, HeadingLevel.HEADING_1),
    );
    appendFitted(chapter.lead_zh, (value) =>
      bodyParagraph(value, { bold: true, color: COLORS.darkBlue }),
    );
    for (const subsection of chapter.subsections) {
      if (remainingCharacters < 120) break;
      const hasVisibleSubsectionContent = [
        ...subsection.paragraphs_zh,
        ...subsection.bullet_points_zh,
      ].some((value) => Boolean(exportText(value)));
      if (!hasVisibleSubsectionContent) continue;
      appendFitted(subsection.heading_zh, (value) =>
        heading(value, HeadingLevel.HEADING_2),
      );
      for (const paragraph of subsection.paragraphs_zh) {
        appendFitted(paragraph, (value) => bodyParagraph(value));
        if (remainingCharacters <= 0) break;
      }
      for (const item of subsection.bullet_points_zh) {
        appendFitted(item, (value) => bulletParagraph(value));
        if (remainingCharacters <= 0) break;
      }
    }
  }
  const document = new Document({
    creator: "建筑设计说明",
    title: `${data.projectName} 建筑设计说明`,
    subject: "建筑概念方案设计说明",
    description:
      "依据任务书页码与已确认设计方向编制的建筑设计说明。",
    numbering: {
      config: [
        {
          reference: "narrative-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 540, hanging: 280 },
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22,
            color: COLORS.ink,
          },
          paragraph: {
            alignment: AlignmentType.JUSTIFIED,
            spacing: {
              before: 0,
              after: 160,
              line: 320,
              lineRule: "auto",
            },
          },
        },
        heading1: {
          run: {
            font: "Calibri",
            size: 32,
            bold: true,
            color: COLORS.blue,
          },
          paragraph: {
            spacing: { before: 360, after: 200 },
            keepNext: true,
          },
        },
        heading2: {
          run: {
            font: "Calibri",
            size: 26,
            bold: true,
            color: COLORS.blue,
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
            keepNext: true,
          },
        },
        heading3: {
          run: {
            font: "Calibri",
            size: 24,
            bold: true,
            color: COLORS.darkBlue,
          },
          paragraph: {
            spacing: { before: 160, after: 80 },
            keepNext: true,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1728,
              left: 1440,
              header: 708,
              footer: 360,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${data.projectName} · 建筑设计说明`,
                    font: "Calibri",
                    size: 17,
                    color: COLORS.muted,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "第 ",
                    font: "Calibri",
                    size: 17,
                    color: COLORS.muted,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: "Calibri",
                    size: 17,
                    color: COLORS.muted,
                  }),
                  new TextRun({
                    text: " 页",
                    font: "Calibri",
                    size: 17,
                    color: COLORS.muted,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBlob(document);
}
