import type { DesignReportProjectFacts } from "@/app/generated/contracts";
import {
  createStructuredResponse,
  type ModelCallRecord,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import type { InputDocument } from "@/app/lib/pipeline";
import { selectSiteResearchSourcePages } from "@/app/lib/site-source-pages";

type ProjectFact = DesignReportProjectFacts["facts"][number];

interface SiteVisualObservation {
  document_id: string;
  page_number: number;
  field_path: string;
  value: string;
  evidence_text: string;
  confidence: number;
}

interface SiteVisualOutput {
  location_summary: string;
  observations: SiteVisualObservation[];
}

const SITE_VISUAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["location_summary", "observations"],
  properties: {
    location_summary: { type: "string" },
    observations: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "document_id",
          "page_number",
          "field_path",
          "value",
          "evidence_text",
          "confidence",
        ],
        properties: {
          document_id: { type: "string" },
          page_number: { type: "integer", minimum: 1 },
          field_path: {
            type: "string",
            enum: [
              "site.location_visual",
              "site.boundaries",
              "site.adjacencies",
              "site.transport_anchors",
              "site.urban_anchors",
              "site.landscape_anchors",
            ],
          },
          value: { type: "string", minLength: 2 },
          evidence_text: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

function categoryFor(fieldPath: string): ProjectFact["category"] {
  return fieldPath === "site.transport_anchors" ? "circulation" : "site";
}

export function removePreviousSiteVisualFacts(
  projectFacts: DesignReportProjectFacts,
) {
  return {
    ...projectFacts,
    facts: projectFacts.facts.filter(
      (fact) => !fact.fact_id.startsWith("F_SITE_VISUAL_"),
    ),
  };
}

export async function analyzeSiteVisualPagesWithModel(
  documents: InputDocument[],
  projectFacts: DesignReportProjectFacts,
  runtimeOverride?: ModelRuntimeOverride,
): Promise<{
  projectFacts: DesignReportProjectFacts;
  call: ModelCallRecord;
  observationCount: number;
  summary: string;
}> {
  const selectedPages = selectSiteResearchSourcePages(documents, 3);
  if (!selectedPages.length) {
    throw new Error("当前上传资料没有找到可用于场地研究的区位相关页面内容。");
  }

  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: `请只识别下列任务书页面图像中与当前项目场地有关的可见信息。\n\n已有文字层事实（仅用于消歧，不得覆盖图面）：\n${JSON.stringify(
        projectFacts.facts
          .filter((fact) => ["site", "circulation", "project"].includes(fact.category))
          .slice(0, 40)
          .map((fact) => ({
            field_path: fact.field_path,
            value: fact.value_raw,
            page: fact.source.page,
          })),
      )}`,
    },
  ];
  for (const page of selectedPages) {
    content.push({
      type: "input_text",
      text: `资料 ${page.document.document_id}，第 ${page.page_number} 页，来源形式：${page.data_url ? "页面图像＋文字层" : "历史上传文件的文字层"}。文字层摘要：${page.text_excerpt}`,
    });
    if (page.data_url) {
      content.push({
        type: "input_image",
        image_url: page.data_url,
        detail: "high",
      });
    }
  }

  let response:
    | { value: SiteVisualOutput; call: ModelCallRecord }
    | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidate = await createStructuredResponse<SiteVisualOutput>({
      name: "site_visual_observations",
      schema: SITE_VISUAL_SCHEMA,
      instructions: `你是建筑项目任务书的场地区位图识别器。识别城市／片区、地块编号、四至关系、道路、轨道站点、公共空间、重要建筑、景观与自然资源。

硬规则：
1. 只记录页面图像中明确可见，或能由同页文字层直接印证的内容；不得根据常识补全。
2. evidence_text 必须抄写支撑判断的图面标签或同页原文字段，不得写推理过程。
3. 若只能确认片区或相邻地标，就按片区级信息返回，不要伪造地块坐标、距离、方位或道路名称。
4. 一条 observation 只表达一个关系；中文输出；最多 10 条。
5. document_id 与 page_number 必须使用输入中给出的值。`,
      content,
      reasoningEffort: "low",
      timeoutMs: 90_000,
      maxAttempts: 1,
      runtimeOverride,
    });
    const value = candidate.value as Partial<SiteVisualOutput>;
    if (
      typeof value.location_summary === "string" &&
      Array.isArray(value.observations)
    ) {
      response = candidate;
      break;
    }
  }
  if (!response) {
    throw new Error(
      "模型连续两次没有返回完整的场地图面识别结构（缺少概述或观察项）。",
    );
  }

  const validPages = new Set(
    selectedPages.map(
      (page) => `${page.document.document_id}:${page.page_number}`,
    ),
  );
  const selectedPageByKey = new Map(
    selectedPages.map((page) => [
      `${page.document.document_id}:${page.page_number}`,
      page,
    ]),
  );
  const clean = removePreviousSiteVisualFacts(projectFacts);
  const observations = (response.value.observations ?? [])
    .filter(
      (item) =>
        validPages.has(`${item.document_id}:${item.page_number}`) &&
        item.value.trim() &&
        item.evidence_text.trim(),
    )
    .slice(0, 10);
  const facts: ProjectFact[] = observations.map((item, index) => {
    const sourcePage = selectedPageByKey.get(
      `${item.document_id}:${item.page_number}`,
    );
    const usedImage = Boolean(sourcePage?.data_url);
    return {
    fact_id: `F_SITE_VISUAL_${String(index + 1).padStart(2, "0")}`,
    category: categoryFor(item.field_path),
    field_path: item.field_path,
    value_raw: item.value.trim(),
    value_normalized: item.value.trim(),
    value_origin: "source_extracted",
    source: {
      document_id: item.document_id,
      page: item.page_number,
      location_note: usedImage
        ? "任务书区位／场地图面视觉识别"
        : "任务书区位／场地文字层模型提取",
      quote: item.evidence_text.trim(),
    },
    source_role: "brief_fact",
    confidence: Math.min(0.92, Math.max(0.35, item.confidence)),
    status: "needs_confirmation",
      notes: usedImage
        ? "由任务书相关页面图像识别，已与文字层共同校验；若识别有误，可在事实库中修改或删除。"
        : "由历史上传任务书的区位相关文字层提取；未重新取得页面图像，结果可在事实库中修改或删除。",
    };
  });

  return {
    projectFacts: { ...clean, facts: [...clean.facts, ...facts] },
    call: response.call,
    observationCount: facts.length,
    summary: response.value.location_summary?.trim() || "任务书图面已完成识别。",
  };
}
