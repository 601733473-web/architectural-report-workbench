import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import { pagePlanSchema } from "@/app/generated/schema-data";
import {
  createStructuredResponse,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import { ADD_PAGE_PROMPT } from "@/app/lib/model-prompts";
import {
  containsBackstagePresentationText,
  normalizePageHeadline,
  sanitizePresentationItems,
  sanitizePresentationText,
} from "@/app/lib/presentation-copy";
import { experienceRecipeRefsForPage } from "@/app/lib/reference-experience";
import { styleExampleRefsForPage } from "@/app/lib/style-retrieval";
import { synchronizeProposalCoverage } from "@/app/lib/gate-b-proposals";
import {
  isProjectUnderstandingPage,
  projectUnderstandingPageType,
} from "@/app/lib/report-chapter-policy";

type ReportPage = DesignReportPagePlan["pages"][number];
type AddedPageDraft = Pick<
  ReportPage,
  | "page_type"
  | "headline_zh"
  | "headline_en"
  | "core_message"
  | "core_message_en"
  | "body_zh"
  | "body_en"
  | "body_copy"
  | "diagram_labels"
  | "diagram_labels_en"
  | "speaker_notes"
  | "visual_requirements"
  | "fact_refs"
  | "missing_information"
>;

const planProperties = pagePlanSchema.properties as Record<string, unknown>;
const reportPageSchema = (
  planProperties.pages as { items: Record<string, unknown> }
).items;
const reportPageProperties = (
  reportPageSchema as { properties: Record<string, unknown> }
).properties;
const addedPageDraftKeys = [
  "page_type",
  "headline_zh",
  "headline_en",
  "core_message",
  "core_message_en",
  "body_zh",
  "body_en",
  "body_copy",
  "diagram_labels",
  "diagram_labels_en",
  "speaker_notes",
  "visual_requirements",
  "fact_refs",
  "missing_information",
] as const;
const addedPageDraftSchema = {
  type: "object",
  properties: Object.fromEntries(
    addedPageDraftKeys.map((key) => [key, reportPageProperties[key]]),
  ),
  required: [...addedPageDraftKeys],
};

function uniqueStrings(values: string[], limit = 12) {
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, limit);
}

function nextUserPageId(pagePlan: DesignReportPagePlan) {
  const existingIds = new Set(pagePlan.pages.map((page) => page.page_id));
  let index = 1;
  let pageId = `P_USER_${String(index).padStart(3, "0")}`;
  while (existingIds.has(pageId)) {
    index += 1;
    pageId = `P_USER_${String(index).padStart(3, "0")}`;
  }
  return pageId;
}

function numericTokens(value: string) {
  return [...value.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) =>
    match[0].replace(/,/g, ""),
  );
}

function renumberPages(pages: DesignReportPagePlan["pages"]) {
  return pages.map((page, index) => ({
    ...page,
    display_page_number: index + 1,
  }));
}

export async function addPageWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  prompt: string,
  afterPageId?: string,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const cleanPrompt = prompt.trim();
  if (cleanPrompt.length < 4) {
    throw new Error("请用一句话说明新增页面要表达什么。");
  }

  const requestedAnchorIndex = pagePlan.pages.findIndex(
    (page) => page.page_id === afterPageId,
  );
  const anchorIndex =
    requestedAnchorIndex >= 0
      ? requestedAnchorIndex
      : Math.max(0, pagePlan.pages.length - 1);
  const anchorPage =
    pagePlan.pages[anchorIndex] ?? pagePlan.pages.at(-1);
  if (!anchorPage) throw new Error("当前汇报还没有可用于插入的页面。");
  const currentProjectFacts = projectFacts.facts
    .filter(
      (fact) =>
        fact.status !== "superseded" &&
        (fact.source_role === "brief_fact" ||
          fact.source_role === "proposal_fact"),
    )
    .map((fact) => ({
      fact_id: fact.fact_id,
      category: fact.category,
      field_path: fact.field_path,
      value_raw: fact.value_raw,
      status: fact.status,
      source: fact.source,
      value_origin: fact.value_origin,
    }));
  const confirmedDirections = (projectFacts.gate_b_proposals ?? [])
    .filter((proposal) => proposal.status === "confirmed")
    .map((proposal) => ({
      missing_label: proposal.missing_label,
      confirmed_direction: proposal.confirmed_direction,
      task_brief_fact_refs: proposal.task_brief_fact_refs,
    }));
  const response = await createStructuredResponse<AddedPageDraft>({
    name: "added_report_page",
    schema: addedPageDraftSchema,
    instructions: ADD_PAGE_PROMPT,
    content: [
      {
        type: "input_text",
        text: JSON.stringify({
          user_page_request: cleanPrompt,
          insertion: {
            after_page_id: anchorPage.page_id,
            section_id: anchorPage.section_id,
          },
          narrative_claim: pagePlan.narrative_claim,
          section: pagePlan.sections.find(
            (section) => section.section_id === anchorPage.section_id,
          ),
          adjacent_pages: pagePlan.pages
            .slice(Math.max(0, anchorIndex - 1), anchorIndex + 2)
            .map((page) => ({
              page_id: page.page_id,
              page_type: page.page_type,
              headline_zh: page.headline_zh,
              core_message: page.core_message,
            })),
          current_project_facts: currentProjectFacts,
          confirmed_design_directions: confirmedDirections,
          policy:
            "用户输入定义新增页的表达意图；当前项目 facts 提供事实证据；历史参考不得提供项目事实。",
        }),
      },
    ],
    reasoningEffort: "low",
    runtimeOverride,
    timeoutMs: 60_000,
    maxAttempts: 1,
  });

  const draft = response.value;
  const rawBody =
    (draft.body_zh ?? "").trim() || draft.body_copy.trim();
  if (
    containsBackstagePresentationText(draft.headline_zh) ||
    containsBackstagePresentationText(draft.core_message) ||
    containsBackstagePresentationText(rawBody) ||
    draft.diagram_labels.some(containsBackstagePresentationText)
  ) {
    throw new Error(
      "新增页面初稿包含图像建议、排版提示或后台生产信息，已阻止写入。",
    );
  }
  const validFactIds = new Set(currentProjectFacts.map((fact) => fact.fact_id));
  const factRefs = uniqueStrings(draft.fact_refs).filter((factId) =>
    validFactIds.has(factId),
  );
  const citedEvidence = currentProjectFacts
    .filter((fact) => factRefs.includes(fact.fact_id))
    .map((fact) => `${String(fact.value_raw)} ${fact.source.quote}`)
    .join("\n")
    .replace(/,/g, "");
  const unsupportedNumbers = numericTokens(rawBody).filter(
    (number) => !citedEvidence.includes(number),
  );
  if (unsupportedNumbers.length) {
    throw new Error(
      `新增页面初稿包含没有事实出处的数字：${[
        ...new Set(unsupportedNumbers),
      ].join("、")}。请在提示词中删除这些数字或先补充项目事实。`,
    );
  }

  const headline = normalizePageHeadline(
    draft.headline_zh,
    "新增汇报页面",
  );
  const coreMessage = sanitizePresentationText(
    draft.core_message,
    headline,
  );
  const bodyCopy = sanitizePresentationText(rawBody, coreMessage);
  const diagramLabels = sanitizePresentationItems(
    draft.diagram_labels,
    8,
  );
  const effectivePageType = isProjectUnderstandingPage(
    pagePlan,
    anchorPage,
  )
    ? projectUnderstandingPageType(
        draft.page_type,
        `${headline} ${coreMessage} ${bodyCopy}`,
      )
    : draft.page_type;
  const pageId = nextUserPageId(pagePlan);
  const pageQuery = {
    page_type: effectivePageType,
    core_message: coreMessage,
    section_id: anchorPage.section_id,
    headline_zh: headline,
    visual_requirements: uniqueStrings(draft.visual_requirements, 10),
  };
  const addedPage: ReportPage = {
    page_id: pageId,
    display_page_number: anchorIndex + 2,
    section_id: anchorPage.section_id,
    page_type: effectivePageType,
    core_message: coreMessage,
    core_message_en: sanitizePresentationText(
      draft.core_message_en,
      coreMessage,
    ),
    headline_zh: headline,
    headline_en: sanitizePresentationText(
      draft.headline_en,
      headline,
    ),
    body_zh: bodyCopy,
    body_en: sanitizePresentationText(draft.body_en, bodyCopy),
    body_copy: bodyCopy,
    diagram_labels: diagramLabels,
    diagram_labels_en: diagramLabels.map(
      (_, index) =>
        sanitizePresentationText(
          draft.diagram_labels_en?.[index],
          `Evidence ${String(index + 1).padStart(2, "0")}`,
        ),
    ),
    speaker_notes: sanitizePresentationText(
      draft.speaker_notes,
      "先说明本页结论，再解释依据与设计价值。",
    ),
    visual_requirements: pageQuery.visual_requirements,
    visual_brief: pageQuery.visual_requirements,
    callouts: diagramLabels.slice(0, 8).map((label, index) => ({
      label_zh: label,
      label_en:
        sanitizePresentationText(
          draft.diagram_labels_en?.[index],
          `Evidence ${String(index + 1).padStart(2, "0")}`,
        ),
      ...(factRefs[index] ? { fact_ref: factRefs[index] } : {}),
    })) as ReportPage["callouts"],
    style_example_refs: styleExampleRefsForPage(
      effectivePageType,
      projectFacts,
    ),
    experience_recipe_refs: experienceRecipeRefsForPage(
      pageQuery,
      projectFacts,
    ),
    fact_refs: factRefs,
    unresolved_items: uniqueStrings(draft.missing_information),
    missing_information: uniqueStrings(draft.missing_information),
    generation_status: bodyCopy ? "generated" : "ready",
  };
  const insertedPages = [...pagePlan.pages];
  insertedPages.splice(anchorIndex + 1, 0, addedPage);
  const nextPagePlan: DesignReportPagePlan = {
    ...structuredClone(pagePlan),
    pages: renumberPages(insertedPages),
    target_page_count: insertedPages.length,
    audit_report: undefined,
  };
  const synchronized = synchronizeProposalCoverage(
    projectFacts,
    nextPagePlan,
  );
  const synchronizedAddedPage = synchronized.pagePlan.pages.find(
    (page) => page.page_id === pageId,
  );
  if (!synchronizedAddedPage) {
    throw new Error("新增页面写入失败。");
  }
  return {
    projectFacts: synchronized.projectFacts,
    pagePlan: synchronized.pagePlan,
    addedPage: synchronizedAddedPage,
    call: response.call,
  };
}
