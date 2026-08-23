import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
  DesignReportVisualReferenceLibrary,
} from "@/app/generated/contracts";
import visualReferenceData from "@/app/data/visual-reference-library.json";

type ReportPage = DesignReportPagePlan["pages"][number];
export type VisualReference =
  DesignReportVisualReferenceLibrary["entries"][number];

export const visualReferenceLibrary =
  visualReferenceData as DesignReportVisualReferenceLibrary;

export const visualReferenceEntriesById = new Map(
  visualReferenceLibrary.entries.map((entry) => [entry.visual_id, entry]),
);

export const METRIC_BOUNDARY_REFERENCE_VISUAL_ID = "VR_URBAN_A3_P017";

export function isSystemRenderingCutawayReference(
  entry: VisualReference,
) {
  const meaning = [
    entry.visual_id,
    entry.layout_family,
    entry.retrieval_text,
    ...entry.topics,
    ...entry.required_current_assets,
  ].join(" ");
  return (
    entry.topics.includes("system_rendering") &&
    /剖切|剖面|sectional|cutaway/i.test(meaning) &&
    !/仅?外观视角|exterior[_\s-]*only/i.test(meaning)
  );
}

export function isMetricBoundaryPage(page: ReportPage) {
  const meaning = `${page.headline_zh} ${page.core_message} ${page.visual_requirements.join(" ")}`;
  return (
    ["data", "analysis"].includes(page.page_type) &&
    /明确指标.*设计边界|设计边界.*指标|规划指标.*建设边界|建设边界.*规划指标|用地.*强度.*高度.*规模/u.test(
      meaning,
    )
  );
}

export function versionedVisualReferenceCropUrl(
  entry: VisualReference,
) {
  return `${entry.graphic_crop_path}?v=${visualReferenceLibrary.version}`;
}

const pageIntentMap: Record<ReportPage["page_type"], string[]> = {
  cover: ["introduce", "showcase"],
  toc: ["orient"],
  section_divider: ["transition", "introduce"],
  position: ["orient", "analyze"],
  analysis: ["analyze", "define_problem"],
  strategy: ["state_strategy"],
  concept: ["explain_generation"],
  comparison: ["verify_design", "define_problem"],
  masterplan: ["verify_design"],
  plan: ["verify_design"],
  section: ["verify_design", "prove_technical"],
  rendering: ["showcase"],
  technical: ["prove_technical"],
  data: ["analyze"],
  summary: ["showcase", "transition"],
};

const evidenceTypeMap: Record<ReportPage["page_type"], string[]> = {
  cover: ["rendering", "photo"],
  toc: ["text"],
  section_divider: ["rendering", "photo", "text"],
  position: ["map", "analysis_diagram"],
  analysis: ["analysis_diagram", "map", "data_table"],
  strategy: ["analysis_diagram", "concept_diagram", "masterplan"],
  concept: ["concept_diagram", "rendering"],
  comparison: ["analysis_diagram", "rendering", "masterplan"],
  masterplan: ["masterplan"],
  plan: ["floor_plan"],
  section: ["section"],
  rendering: ["rendering", "photo"],
  technical: ["elevation", "section", "analysis_diagram"],
  data: ["data_table", "analysis_diagram"],
  summary: ["rendering", "concept_diagram"],
};

const compatiblePageTypes: Record<
  ReportPage["page_type"],
  ReportPage["page_type"][]
> = {
  cover: ["rendering", "summary"],
  toc: [],
  section_divider: ["cover", "summary"],
  position: ["analysis"],
  analysis: ["position", "strategy", "data"],
  strategy: ["analysis", "concept", "masterplan"],
  concept: ["strategy", "rendering"],
  comparison: ["strategy", "masterplan", "rendering"],
  masterplan: ["strategy", "comparison"],
  plan: ["technical"],
  section: ["technical", "plan"],
  rendering: ["cover", "concept", "summary"],
  technical: ["section", "plan"],
  data: ["analysis"],
  summary: ["rendering", "concept", "cover"],
};

const topicKeywords: Array<[RegExp, string]> = [
  [/区位|城市|周边|场地关系/, "site_context"],
  [/位置|区位/, "location"],
  [/交通|流线|到达|车行|人行/, "circulation"],
  [/运营|核心筒|交通核|独立交通/, "circulation"],
  [/公共空间|开放空间|首层|城市客厅/, "public_space"],
  [/庭院|连廊|连桥|街巷|平台花园/, "public_space"],
  [/景观|绿地|花园/, "landscape"],
  [/功能|业态|面积|分区/, "program"],
  [/体量|形态|生成|塔楼/, "massing"],
  [/高密度|垂直叠合|垂直复合/, "massing"],
  [/概念|理念/, "concept"],
  [/策略|回应/, "strategy_overview"],
  [/总图|总体布局/, "masterplan"],
  [/平面|楼层/, "plan"],
  [/剖面|剖切|切开|竖向|层高|cutaway|system rendering/i, "section"],
  [/立面|幕墙|材料/, "facade"],
  [/结构|跨度/, "structure"],
  [/绿色|低碳|可持续|环境/, "sustainability"],
  [/热湿|气候|遮阳|通风|日照|采光/, "sustainability"],
  [/遮阳|幕墙|表皮/, "facade"],
  [/比选|比较|方案一|方案二|单塔|双塔/, "comparison"],
  [/效果|体验|空间序列|视角/, "rendering"],
  [/指标|数据|规模/, "data"],
  [/限制|边界|条件/, "constraints"],
  [/形象|识别|标志/, "identity"],
  [/技术|构造|实施/, "technical"],
  [/总结|价值/, "summary"],
];

export function inferVisualReferenceTopics(text: string) {
  return uniqueStrings(
    topicKeywords
      .filter(([pattern]) => pattern.test(text))
      .map(([, topic]) => topic),
  );
}

export interface VisualSearchNeed {
  relationship_to_show: string;
  evidence_needed: string[];
  graphic_elements: string[];
  search_focus: string[];
  slot_focus_only?: boolean;
  preserve_source_diversity?: boolean;
}

function inferredTopics(
  page: ReportPage,
  visualNeed?: VisualSearchNeed,
) {
  const text = [
    ...(visualNeed?.slot_focus_only
      ? []
      : [page.headline_zh, page.core_message, ...page.visual_requirements]),
    ...(visualNeed?.evidence_needed ?? []),
    ...(visualNeed?.graphic_elements ?? []),
    ...(visualNeed?.search_focus ?? []),
  ].join(" ");
  return inferVisualReferenceTopics(text);
}

function overlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

const semanticRetrievalKeywords = [
  "区位",
  "交通",
  "流线",
  "到达",
  "运营",
  "核心筒",
  "功能",
  "业态",
  "复合",
  "垂直",
  "体量",
  "公共空间",
  "开放空间",
  "空中",
  "庭院",
  "连桥",
  "连廊",
  "街巷",
  "景观",
  "花园",
  "绿色",
  "生态",
  "低碳",
  "可持续",
  "气候",
  "热湿",
  "遮阳",
  "通风",
  "日照",
  "采光",
  "幕墙",
  "立面",
  "剖面",
  "结构",
];

export interface VisualReferenceMatch {
  entry: VisualReference;
  score: number;
  reasons: string[];
}

export function matchVisualReferences(
  page: ReportPage,
  projectFacts: DesignReportProjectFacts,
  limit = 3,
  visualNeed?: VisualSearchNeed,
): VisualReferenceMatch[] {
  const topics = inferredTopics(page, visualNeed);
  const metricBoundaryPage = isMetricBoundaryPage(page);
  const recipeIds = new Set(page.experience_recipe_refs ?? []);
  const systemRenderingPage =
    !["cover", "toc", "section_divider"].includes(page.page_type) &&
    (recipeIds.has("HQE_RX_068") ||
      recipeIds.has("URB_RX_018") ||
      /局部立面系统剖切|立面系统渲染|系统剖切(?:渲染)?|system rendering|facade system sectional rendering/i.test(
        `${page.headline_zh} ${page.headline_en ?? ""} ${page.core_message} ${page.visual_requirements.join(" ")}`,
      ));
  const relationshipIntents: Record<string, string[]> = {
    sequence: ["explain_generation"],
    comparison: ["verify_design", "define_problem"],
    hierarchy: ["summarize", "state_strategy"],
    spatial_relationship: ["verify_design", "prove_technical"],
    evidence_mapping: ["analyze", "define_problem", "state_strategy"],
    atmosphere: ["showcase", "introduce"],
    index: ["orient"],
  };
  const intents = uniqueStrings([
    ...pageIntentMap[page.page_type],
    ...(visualNeed
      ? relationshipIntents[visualNeed.relationship_to_show] ?? []
      : []),
  ]);
  const evidenceTypes = systemRenderingPage
    ? ["rendering", "section", "analysis_diagram"]
    : evidenceTypeMap[page.page_type];
  const pageRecipes = (
    projectFacts.reference_experience?.page_recipes ?? []
  ).filter((recipe) =>
    (page.experience_recipe_refs ?? []).includes(recipe.recipe_id),
  );
  const layoutFamilies = pageRecipes.map((recipe) => recipe.layout_family);
  const visualTypes = pageRecipes.map((recipe) => recipe.primary_visual);
  const availableAssetText = [
    ...page.visual_requirements,
    ...page.fact_refs
      .map((factId) =>
        projectFacts.facts.find((fact) => fact.fact_id === factId),
      )
      .filter(Boolean)
      .map((fact) => `${fact!.field_path} ${fact!.source.location_note}`),
  ].join(" ");

  const ranked = visualReferenceLibrary.entries
    .filter((entry) => entry.crop_quality.accepted)
    .filter(
      (entry) =>
        !systemRenderingPage ||
        isSystemRenderingCutawayReference(entry),
    )
    .map((entry) => {
      const samePageType = entry.page_type === page.page_type;
      const compatiblePageType =
        compatiblePageTypes[page.page_type].includes(entry.page_type) ||
        (systemRenderingPage &&
          ["technical", "section"].includes(entry.page_type));
      let score = samePageType ? 5 : compatiblePageType ? 1 : -8;
      const reasons: string[] = [];
      if (samePageType) reasons.push("页面类型一致");
      else if (compatiblePageType) reasons.push("页面类型可兼容");

      const topicHits = overlap(topics, entry.topics);
      score += topicHits.length * 6;
      if (topicHits.length) reasons.push(`主题 ${topicHits.join("、")}`);
      else if (topics.length) score -= 5;

      const intentHits = overlap(intents, entry.page_intents);
      score += intentHits.length * 4;
      if (intentHits.length) reasons.push(`页面意图 ${intentHits.join("、")}`);

      const evidenceHits = overlap(evidenceTypes, entry.evidence_types);
      score += evidenceHits.length * 3;
      if (evidenceHits.length) {
        reasons.push(`证据类型 ${evidenceHits.join("、")}`);
      }

      if (layoutFamilies.includes(entry.layout_family)) {
        score += 1.5;
        reasons.push("布局家族一致");
      }
      if (visualTypes.includes(entry.visual_type)) {
        score += 2.5;
        reasons.push("主视觉类型一致");
      }

      const semanticHaystack = [
        entry.retrieval_text,
        entry.safe_use_guidance,
        entry.visual_type,
        entry.layout_family,
        ...entry.topics,
        ...entry.page_intents,
        ...entry.evidence_types,
      ]
        .join(" ")
        .toLowerCase();
      const semanticTerms = uniqueStrings([
        ...(visualNeed?.search_focus ?? []),
        ...(visualNeed?.graphic_elements ?? []),
      ])
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 2);
      const semanticHits = semanticTerms.filter((term) =>
        semanticHaystack.includes(term),
      );
      score += semanticHits.length * 2;
      if (semanticHits.length) {
        reasons.push(`内容需求 ${semanticHits.slice(0, 3).join("、")}`);
      }
      const semanticTokenHits = uniqueStrings(
        semanticTerms.flatMap((term) =>
          semanticRetrievalKeywords.filter((keyword) => term.includes(keyword)),
        ),
      ).filter((keyword) => semanticHaystack.includes(keyword));
      score += semanticTokenHits.length * 4;
      if (semanticTokenHits.length) {
        reasons.push(
          `细分语义 ${semanticTokenHits.slice(0, 4).join("、")}`,
        );
      }

      const availableAssets = entry.required_current_assets.filter((asset) =>
        availableAssetText.includes(asset),
      );
      score += availableAssets.length * 1.5;
      if (availableAssets.length) {
        reasons.push(`已有素材 ${availableAssets.join("、")}`);
      }

      if (entry.quality === "featured") score += 1;
      if (
        metricBoundaryPage &&
        entry.visual_id === METRIC_BOUNDARY_REFERENCE_VISUAL_ID
      ) {
        score += 100;
        reasons.push("指标边界图解范式优先");
      }
      if (systemRenderingPage) {
        const isFacadeSystemRendering = entry.topics.includes(
          "system_rendering",
        );
        score += isFacadeSystemRendering ? 120 : -100;
        if (isFacadeSystemRendering) {
          reasons.push("局部立面系统剖切语义一致");
        }
        if (entry.visual_id === "VR_HQ_MULTI_OPTION_P111") {
          score += 30;
          reasons.push("人工确认的 system rendering 主样本");
        }
        if (entry.layout_family === "section_perspective_full_width") {
          score -= 120;
          reasons.push("排除整栋 section perspective");
        }
      }
      score += entry.crop_quality.score * 3;
      reasons.push(`裁图质量 ${Math.round(entry.crop_quality.score * 100)}%`);
      return { entry, score, reasons };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.source_page - right.entry.source_page,
    );

  const selected: VisualReferenceMatch[] = [];
  for (const match of ranked) {
    if (selected.length >= limit) break;
    const sameSource = selected.filter(
      (item) =>
        item.entry.source_document_id === match.entry.source_document_id,
    ).length;
    const sameLayout = selected.some(
      (item) => item.entry.layout_family === match.entry.layout_family,
    );
    if (visualNeed?.preserve_source_diversity !== false) {
      if (sameSource >= 1 && selected.length < 2) continue;
      if (sameLayout && selected.length >= 1) continue;
    }
    selected.push(match);
  }

  if (selected.length < limit) {
    for (const match of ranked) {
      if (selected.length >= limit) break;
      if (
        !selected.some(
          (item) => item.entry.visual_id === match.entry.visual_id,
        )
      ) {
        selected.push(match);
      }
    }
  }

  return selected;
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}
