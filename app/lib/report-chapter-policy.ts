import type { DesignReportPagePlan } from "@/app/generated/contracts";

type ReportPage = DesignReportPagePlan["pages"][number];
type PageType = ReportPage["page_type"];

const PROJECT_UNDERSTANDING_PATTERN =
  /项目理解|项目认知|场地与任务理解|project understanding/i;
const PROJECT_UNDERSTANDING_PURPOSE_PATTERN =
  /权威事实|场地机会|设计边界|核心条件|任务要求|评审目标/;

export const PROJECT_UNDERSTANDING_FORBIDDEN_PAGE_TYPES = new Set<PageType>([
  "masterplan",
  "plan",
  "section",
  "technical",
]);

export const PROJECT_UNDERSTANDING_ALLOWED_PAGE_TYPES = new Set<PageType>([
  "section_divider",
  "position",
  "analysis",
  "data",
]);

export const PROJECT_UNDERSTANDING_ALLOWED_VISUAL_TYPES = new Set<string>([
  "site_map",
  "analysis_diagram",
  "concept_diagram",
  "data_table",
  "photo",
]);

export function projectUnderstandingSectionIds(
  pagePlan: Pick<DesignReportPagePlan, "sections">,
) {
  const narrativeSections = pagePlan.sections.filter(
    (section) => section.section_id !== "S00",
  );
  const firstNarrativeSection = narrativeSections[0];
  return new Set(
    narrativeSections
      .filter(
        (section) =>
          PROJECT_UNDERSTANDING_PATTERN.test(
            `${section.title_zh} ${section.title_en}`,
          ) ||
          (section.section_id === firstNarrativeSection?.section_id &&
            PROJECT_UNDERSTANDING_PURPOSE_PATTERN.test(
              `${section.purpose} ${section.answers_question}`,
            )),
      )
      .map((section) => section.section_id),
  );
}

export function isProjectUnderstandingPage(
  pagePlan: Pick<DesignReportPagePlan, "sections">,
  page: Pick<ReportPage, "section_id">,
) {
  return projectUnderstandingSectionIds(pagePlan).has(page.section_id);
}

export function projectUnderstandingPageType(
  requestedType: PageType,
  visibleText: string,
) {
  if (PROJECT_UNDERSTANDING_ALLOWED_PAGE_TYPES.has(requestedType)) {
    return requestedType;
  }
  if (/区位|城市|周边|区域|位置|交通资源|公共资源/.test(visibleText)) {
    return "position" as const;
  }
  if (/指标|面积|规模|容积率|限高|强度|数据/.test(visibleText)) {
    return "data" as const;
  }
  return "analysis" as const;
}

export function normalizeProjectUnderstandingChapter(
  pagePlan: DesignReportPagePlan,
) {
  const result = structuredClone(pagePlan);
  const understandingSectionIds = projectUnderstandingSectionIds(result);
  for (const page of result.pages) {
    if (!understandingSectionIds.has(page.section_id)) continue;
    const normalizedType = projectUnderstandingPageType(
      page.page_type,
      `${page.headline_zh} ${page.core_message} ${page.body_zh} ${page.body_copy}`,
    );
    if (normalizedType === page.page_type) continue;
    page.page_type = normalizedType;
    page.visual_requirements = [
      "只使用区位、现状、任务解读、指标或关系分析证据",
      "不得提前出现当前方案的总平面、楼层平面、建筑立面、建筑剖面或技术成果图",
    ];
    page.visual_brief = [...page.visual_requirements];
    page.style_example_refs = [];
    page.experience_recipe_refs = [];
    delete page.visual_task;
  }
  return result;
}

export function visualTypeAllowedInProjectUnderstanding(visualType: string) {
  return PROJECT_UNDERSTANDING_ALLOWED_VISUAL_TYPES.has(visualType);
}
