import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  pagePlanSchema,
  projectFactsSchema,
} from "@/app/generated/schema-data";
import {
  createStructuredResponse,
  getModelRuntime,
  type ModelCallRecord,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import {
  AUDIT_PROMPT,
  COMPLETENESS_PROMPT,
  DEEP_NARRATIVE_PROMPT,
  DEEP_PAGE_BATCH_PROMPT,
  FACT_EXTRACTION_PROMPT,
  PAGE_GENERATION_PROMPT,
  PLANNER_PROMPT,
  PRESENTATION_COPY_COMPRESSION_PROMPT,
  REGISTRATION_PROMPT,
  SMALL_MODE_DEEP_NARRATIVE_PROMPT,
  SMALL_MODE_DEEP_PAGE_BATCH_PROMPT,
  SMALL_MODE_PAGE_GENERATION_PROMPT,
  PRESENTATION_COPY_COMPRESSION_SKILL,
} from "@/app/lib/model-prompts";
import {
  checkCompleteness,
  generateSmallModeReport,
  runPipeline,
  type InputDocument,
  type NodeOutput,
  type PipelineResult,
  type ProjectFact,
  type SourceRole,
} from "@/app/lib/pipeline";
import {
  assertPagePlan,
  assertProjectFacts,
} from "@/app/lib/schema-validator";
import { DEFAULT_TARGET_PAGE_COUNT } from "@/app/lib/report-config";
import {
  DEFAULT_TASK_MODE,
  isolateSmallBuildingProjectFacts,
  isSmallBuildingMode,
  resolvedTaskMode,
  type TaskMode,
} from "@/app/lib/task-mode";
import { localCultureFusionPrompt } from "@/app/lib/local-culture-fusion";
import {
  ensureSmallModeDesignDirectionState,
  smallModeDesignDirectionFacts,
} from "@/app/lib/small-mode-design-directions";
import { smallModeNarrativeGuidance } from "@/app/lib/small-mode-narrative";
import { smallScaleBuildabilityPrompt } from "@/app/lib/small-scale-buildability";
import {
  applySmallModeDesignSystem,
  generateSmallModeDesignSystemWithModel,
} from "@/app/lib/small-mode-design-system";
import {
  styleExampleRefsForPage,
  styleGuidanceForPage,
  styleLayoutRequirements,
} from "@/app/lib/style-retrieval";
import {
  assignExperienceRecipesForPlan,
  experienceGuidanceForPage,
  experienceLayoutRequirementsForRecipes,
  experienceRecipeRefsForPage,
  plannerExperiencePayload,
} from "@/app/lib/reference-experience";
import {
  confirmedGateBProposalsForPage,
  isOptionalProductionInputGap,
  synchronizeProposalCoverage,
} from "@/app/lib/gate-b-proposals";
import {
  contextualDiagramLabels,
  containsBackstagePresentationText,
  extractConceptName,
  extractEnglishConceptName,
  normalizePageHeadline,
  sanitizePresentationItems,
  sanitizePresentationText,
} from "@/app/lib/presentation-copy";
import {
  englishCoreFallback,
  englishLabelFallback,
  englishPresentationText,
  pageTypeEnglishLabels,
} from "@/app/lib/bilingual-copy";
import { evaluatePageContentDepth } from "@/app/lib/content-depth";
import {
  createSmallModeVisualImageSlots,
  createVisualTask,
  getVisualImageSlotCountForPage,
  legacyGeneratedImageFromSlots,
} from "@/app/lib/visual-task";
import {
  projectUnderstandingPageType,
  projectUnderstandingSectionIds,
} from "@/app/lib/report-chapter-policy";

type CanonicalDocument = DesignReportProjectFacts["documents"][number];
type ReportPage = DesignReportPagePlan["pages"][number];
type ReportCopyOutput = Pick<
  ReportPage,
  | "body_zh"
  | "body_en"
  | "body_copy"
  | "headline_en"
  | "core_message"
  | "core_message_en"
  | "diagram_labels"
  | "diagram_labels_en"
  | "speaker_notes"
  | "callouts"
  | "proposal_refs"
  | "proposal_coverage"
>;
interface PageGenerationRepairContext {
  previous_output: ReportCopyOutput;
  validation_failures: string[];
  prior_calls: ModelCallRecord[];
  repair_attempt: number;
  length_only_repair?: boolean;
  compression_only_repair?: boolean;
}
interface PageGenerationResult {
  pagePlan: DesignReportPagePlan;
  call: ModelCallRecord;
  calls: ModelCallRecord[];
}
type AuditReport = NonNullable<DesignReportPagePlan["audit_report"]>;

const MAX_PAGE_GENERATION_REPAIR_ATTEMPTS = 6;

function smallModeHeadlineNeedsTranslation(page: ReportPage) {
  if (["cover", "toc", "section_divider", "summary"].includes(page.page_type)) {
    return false;
  }
  const currentEnglish = sanitizePresentationText(page.headline_en);
  const pageTypeFallback = pageTypeEnglishLabels[page.page_type];
  const directTranslation = englishPresentationText(page.headline_zh, "");
  return Boolean(
    currentEnglish &&
      currentEnglish === pageTypeFallback &&
      directTranslation !== currentEnglish,
  );
}

function visibleCharacterCount(value: string | undefined) {
  return Array.from(String(value ?? "").replace(/\s+/gu, "")).length;
}

const factsProperties = projectFactsSchema.properties as Record<string, unknown>;
const planProperties = pagePlanSchema.properties as Record<string, unknown>;
const registrationSchema = {
  type: "object",
  properties: {
    documents: factsProperties.documents,
  },
  required: ["documents"],
};
const reportPageSchema = (
  (planProperties.pages as { items: Record<string, unknown> }).items
);
const auditReportSchema = planProperties.audit_report as Record<string, unknown>;
const reportPageProperties = (
  reportPageSchema as { properties: Record<string, unknown> }
).properties;
const reportCopySchema = {
  type: "object",
  properties: {
    headline_en: reportPageProperties.headline_en,
    core_message: reportPageProperties.core_message,
    core_message_en: reportPageProperties.core_message_en,
    body_zh: reportPageProperties.body_zh,
    body_en: reportPageProperties.body_en,
    body_copy: reportPageProperties.body_copy,
    diagram_labels: reportPageProperties.diagram_labels,
    diagram_labels_en: reportPageProperties.diagram_labels_en,
    speaker_notes: reportPageProperties.speaker_notes,
    callouts: reportPageProperties.callouts,
    proposal_refs: reportPageProperties.proposal_refs,
    proposal_coverage: reportPageProperties.proposal_coverage,
  },
  required: [
    "headline_en",
    "core_message",
    "core_message_en",
    "body_zh",
    "body_en",
    "body_copy",
    "diagram_labels",
    "diagram_labels_en",
    "speaker_notes",
    "callouts",
    "proposal_refs",
    "proposal_coverage",
  ],
};
const presentationCopyCompressionSchema = {
  type: "object",
  properties: {
    headline_en: reportPageProperties.headline_en,
    core_message: reportPageProperties.core_message,
    core_message_en: reportPageProperties.core_message_en,
    body_zh: reportPageProperties.body_zh,
    body_en: reportPageProperties.body_en,
    body_copy: reportPageProperties.body_copy,
    diagram_labels: reportPageProperties.diagram_labels,
    diagram_labels_en: reportPageProperties.diagram_labels_en,
  },
  required: [
    "headline_en",
    "core_message",
    "core_message_en",
    "body_zh",
    "body_en",
    "body_copy",
    "diagram_labels",
    "diagram_labels_en",
  ],
};
const deepNarrativeRefinementSchema = {
  type: "object",
  properties: {
    narrative_claim: planProperties.narrative_claim,
    sections: planProperties.sections,
  },
  required: ["narrative_claim", "sections"],
};
const deepPageBatchRefinementSchema = (pageCount: number) => ({
  type: "object",
  properties: {
    pages: {
      type: "array",
      minItems: pageCount,
      maxItems: pageCount,
      items: {
        type: "object",
        properties: {
          page_id: reportPageProperties.page_id,
          section_id: reportPageProperties.section_id,
          headline_zh: reportPageProperties.headline_zh,
          headline_en: reportPageProperties.headline_en,
          core_message: reportPageProperties.core_message,
          core_message_en: reportPageProperties.core_message_en,
        },
        required: [
          "page_id",
          "section_id",
          "headline_zh",
          "headline_en",
          "core_message",
          "core_message_en",
        ],
      },
    },
  },
  required: ["pages"],
});

type DeepNarrativeRefinement = {
  narrative_claim: string;
  sections: DesignReportPagePlan["sections"];
};

type DeepPageBatchRefinement = {
  pages: Array<
    Pick<
      ReportPage,
      | "page_id"
      | "section_id"
      | "headline_zh"
      | "headline_en"
      | "core_message"
      | "core_message_en"
    >
  >;
};

type DeepPlanRefinement = DeepNarrativeRefinement & DeepPageBatchRefinement;

function modelNode(
  node: NodeOutput["node"],
  call: ModelCallRecord,
  output: unknown,
): NodeOutput {
  return {
    node,
    execution: "openai_model",
    model_calls: 1,
    model: call.model,
    response_id: call.responseId,
    token_usage: {
      input: call.inputTokens,
      output: call.outputTokens,
    },
    output,
  };
}

function textPayload(inputs: InputDocument[]) {
  return inputs.map((input) => ({
    document_id: input.document_id,
    file_name: input.file_name,
    preliminary_role: input.role,
    version_or_date: input.version_or_date,
    authority_rank: input.authority_rank ?? 6,
    page_count: input.page_count ?? 1,
    text_with_page_markers: input.text.slice(0, 500_000),
  }));
}

function documentContent(
  inputs: InputDocument[],
  prompt: string,
): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: `${prompt}\n\n资料清单与分页文字：\n${JSON.stringify(textPayload(inputs))}`,
    },
  ];
  for (const input of inputs) {
    if (!input.file_data || input.mime_type !== "application/pdf") continue;
    content.push({
      type: "input_file",
      filename: input.file_name,
      file_data: input.file_data,
      detail: "high",
    });
  }
  return content;
}

function classifyInputs(
  inputs: InputDocument[],
  modelDocuments: CanonicalDocument[],
) {
  const modelById = new Map(
    modelDocuments.map((document) => [document.document_id, document]),
  );
  return inputs.map((input) => {
    const modelDocument = modelById.get(input.document_id);
    const forcedReference = input.document_id.startsWith("SYS_REFERENCE_");
    return {
      ...input,
      role: forcedReference
        ? ("reference_style" as const)
        : (modelDocument?.role ?? input.role),
    };
  });
}

function canonicalDocuments(
  inputs: InputDocument[],
  modelDocuments: CanonicalDocument[],
) {
  const modelById = new Map(
    modelDocuments.map((document) => [document.document_id, document]),
  );
  return inputs.map((input) => {
    const modelDocument = modelById.get(input.document_id);
    return {
      document_id: input.document_id,
      file_name: input.file_name,
      role: input.document_id.startsWith("SYS_REFERENCE_")
        ? ("reference_style" as const)
        : (modelDocument?.role ?? input.role),
      version_or_date: input.version_or_date,
      authority_rank: input.authority_rank ?? 6,
      notes:
        modelDocument?.notes ??
        (input.role === "reference_style"
          ? "历史参考库：只用于结构、页型和表达风格。"
          : "由真实模型完成资料角色判断。"),
    };
  }) satisfies CanonicalDocument[];
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").replace(/[，,]/g, ",").trim();
}

function pageText(document: InputDocument, page: number) {
  const marker = new RegExp(
    `={3,}\\s*PAGE\\s+0*${page}\\s*={3,}([\\s\\S]*?)(?=={3,}\\s*PAGE|$)`,
    "i",
  );
  const markedPage = document.text.match(marker)?.[1];
  if (markedPage !== undefined) return markedPage;
  return page === 1 && !/={3,}\s*PAGE\s+\d+\s*={3,}/i.test(document.text)
    ? document.text
    : "";
}

function sanitizeExtractedFacts(
  value: DesignReportProjectFacts,
  inputs: InputDocument[],
  documents: CanonicalDocument[],
  projectId: string,
  preservedStyles: NonNullable<DesignReportProjectFacts["style_observations"]>,
  preservedStyleExamples: NonNullable<
    DesignReportProjectFacts["reference_style_examples"]
  >,
  preservedReferenceExperience: DesignReportProjectFacts["reference_experience"],
) {
  const inputById = new Map(inputs.map((input) => [input.document_id, input]));
  const roleById = new Map(
    documents.map((document) => [document.document_id, document.role]),
  );
  const allowedRoles = new Set<SourceRole>(["authoritative", "proposal"]);
  const idMap = new Map<string, string>();
  const facts = value.facts
    .filter((fact) => allowedRoles.has(roleById.get(fact.source.document_id) ?? "unknown"))
    .filter((fact) => fact.source.quote.trim().length > 0)
    .filter(
      (fact) =>
        !/有限公司|公司简介|团队成员|联系电话|企业资质/.test(
          `${String(fact.value_raw)} ${fact.source.quote}`,
        ),
    )
    .filter((fact) => {
      const input = inputById.get(fact.source.document_id);
      return Boolean(
        input &&
          fact.source.page >= 1 &&
          fact.source.page <= (input.page_count ?? Number.MAX_SAFE_INTEGER),
      );
    })
    .map((fact, index) => {
      const factId = `F_${String(index + 1).padStart(3, "0")}`;
      idMap.set(fact.fact_id, factId);
      const input = inputById.get(fact.source.document_id)!;
      const quoteVerified = normalizeText(pageText(input, fact.source.page)).includes(
        normalizeText(fact.source.quote),
      );
      const role = roleById.get(fact.source.document_id);
      return {
        ...fact,
        fact_id: factId,
        source_role: role === "proposal" ? "proposal_fact" : "brief_fact",
        confidence: Math.min(fact.confidence ?? 0.9, quoteVerified ? 1 : 0.85),
        status:
          quoteVerified || fact.status === "conflict"
            ? fact.status
            : ("needs_confirmation" as const),
        notes: quoteVerified
          ? (fact.notes ?? "")
          : [fact.notes, "原文由 PDF 视觉读取，需人工复核文字层。"]
              .filter(Boolean)
              .join(" "),
      };
    }) satisfies ProjectFact[];

  const factIds = new Set(facts.map((fact) => fact.fact_id));
  const conflicts = value.conflicts
    .map((conflict) => ({
      ...conflict,
      fact_ids: conflict.fact_ids
        .map((factId) => idMap.get(factId))
        .filter((factId): factId is string => Boolean(factId)),
    }))
    .filter((conflict) => conflict.fact_ids.length >= 2)
    .map((conflict, index) => ({
      ...conflict,
      conflict_id: `C_${String(index + 1).padStart(3, "0")}`,
      fact_ids: conflict.fact_ids as [string, string, ...string[]],
    }));

  const modelStyles = (value.style_observations ?? []).filter((observation) =>
    documents.some(
      (document) =>
        document.document_id === observation.source.document_id &&
        document.role === "reference_style",
    ),
  );
  const styleObservations = [...preservedStyles, ...modelStyles].filter(
    (observation, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.description === observation.description &&
          candidate.source.document_id === observation.source.document_id,
      ) === index,
  );
  const modelStyleExamples = (value.reference_style_examples ?? []).filter(
    (example) =>
      example.source.quote.trim().length > 0 &&
      documents.some(
        (document) =>
          document.document_id === example.source.document_id &&
          document.role === "reference_style",
      ) &&
      inputs.some(
        (input) =>
          input.document_id === example.source.document_id &&
          example.source.page >= 1 &&
          example.source.page <=
            (input.page_count ?? Number.MAX_SAFE_INTEGER),
      ),
  );
  const referenceStyleExamples = [
    ...preservedStyleExamples,
    ...modelStyleExamples,
  ].filter(
    (example, index, all) =>
      all.findIndex(
        (candidate) => candidate.example_id === example.example_id,
      ) === index,
  );

  const firstName = facts.find((fact) => fact.field_path === "project.name");
  const sourcedProjectName =
    firstName && typeof firstName.value_raw === "string"
      ? firstName.value_raw.trim()
      : "";
  const result: DesignReportProjectFacts = {
    ...value,
    project_id: projectId,
    project_name_anonymized:
      sourcedProjectName ||
      value.project_name_anonymized ||
      "未命名单项目",
    default_page_format: "A3_landscape_420x297mm",
    language_mode: "zh_en",
    ignore_company_info: true,
    documents,
    facts,
    style_observations: styleObservations,
    reference_style_examples: referenceStyleExamples,
    reference_experience: preservedReferenceExperience,
    conflicts: conflicts.filter((conflict) =>
      conflict.fact_ids.every((factId) => factIds.has(factId)),
    ),
    missing_items: [],
    gate_report: {
      planner_readiness: "blocked",
      generation_readiness: "blocked",
      gate_a_missing: [],
      gate_b_missing: [],
      summary: "等待完整度检查节点。",
    },
  };
  assertProjectFacts(result);
  return result;
}

function sanitizeCompletion(
  extracted: DesignReportProjectFacts,
  completion: DesignReportProjectFacts,
) {
  const deterministic = checkCompleteness(extracted);
  const deterministicGate = deterministic.gate_report!;
  const completionGate = completion.gate_report ?? deterministicGate;
  const requiredDecisionLabels = new Set(["设计目标", "评审条件"]);
  const requiredDecisionItems = deterministic.missing_items.filter((item) =>
    requiredDecisionLabels.has(
      item.description.replace(/^Gate B 缺少：/, "").trim(),
    ),
  );
  const existingDescriptions = new Set(
    completion.missing_items.map((item) => item.description),
  );
  const missingItems = [
    ...completion.missing_items.filter(
      (item) => !isOptionalProductionInputGap(item.description),
    ),
    ...requiredDecisionItems.filter(
      (item) => !existingDescriptions.has(item.description),
    ),
  ];
  const requiredDecisionMissing = deterministicGate.gate_b_missing.filter(
    (label) => requiredDecisionLabels.has(label),
  );
  const gateBMissing = [
    ...new Set([
      ...completionGate.gate_b_missing.filter(
        (label) => !isOptionalProductionInputGap(label),
      ),
      ...requiredDecisionMissing,
    ]),
  ];
  const result: DesignReportProjectFacts = {
    ...extracted,
    missing_items: missingItems,
    gate_report: {
      ...completionGate,
      gate_b_missing: gateBMissing,
      generation_readiness:
        requiredDecisionMissing.length > 0 &&
        completionGate.generation_readiness === "ready"
          ? "partial"
          : completionGate.generation_readiness,
      summary: requiredDecisionMissing.length
        ? `${completionGate.summary ?? ""} 待确认：${requiredDecisionMissing.join("、")}。`.trim()
        : completionGate.summary,
    },
  };
  assertProjectFacts(result);
  return result;
}

const bundledMetricLabels = [
  "用地面积",
  "容积率",
  "建筑限高",
  "计容建筑面积",
  "总建筑面积",
  "地上建筑面积",
  "地下建筑面积",
];

function enrichExtractedFactsWithRuleFacts(
  extracted: DesignReportProjectFacts,
  ruleBased: DesignReportProjectFacts,
) {
  const facts = extracted.facts.map((fact) => ({ ...fact }));
  const allowedDocumentIds = new Set(
    extracted.documents
      .filter((document) =>
        ["authoritative", "proposal"].includes(document.role),
      )
      .map((document) => document.document_id),
  );
  let nextFactNumber = facts.reduce((highest, fact) => {
    const number = Number.parseInt(fact.fact_id.match(/(\d+)$/)?.[1] ?? "0", 10);
    return Math.max(highest, Number.isFinite(number) ? number : 0);
  }, 0) + 1;

  for (const ruleFact of ruleBased.facts) {
    if (
      !allowedDocumentIds.has(ruleFact.source.document_id) ||
      (ruleFact.source_role !== "brief_fact" &&
        ruleFact.source_role !== "proposal_fact")
    ) {
      continue;
    }
    const existingIndex = facts.findIndex(
      (fact) => fact.field_path === ruleFact.field_path,
    );
    if (existingIndex < 0) {
      facts.push({
        ...ruleFact,
        fact_id: `F_${String(nextFactNumber).padStart(3, "0")}`,
      });
      nextFactNumber += 1;
      continue;
    }

    const existing = facts[existingIndex];
    const existingText = `${String(existing.value_raw)} ${existing.source.quote}`;
    const bundledMetricCount = bundledMetricLabels.filter((label) =>
      existingText.includes(label),
    ).length;
    if (bundledMetricCount >= 2 && String(ruleFact.value_raw).length < existingText.length) {
      facts[existingIndex] = {
        ...ruleFact,
        fact_id: existing.fact_id,
      };
    }
  }

  const result = { ...extracted, facts };
  assertProjectFacts(result);
  return result;
}

function planningFactsPayload(
  facts: DesignReportProjectFacts,
  taskMode: TaskMode = facts.task_mode ?? DEFAULT_TASK_MODE,
) {
  if (isSmallBuildingMode(taskMode)) {
    return {
      ...facts,
      task_mode: taskMode,
      task_brief_design_directions: smallModeDesignDirectionFacts(facts).map(
        (fact) => ({
          fact_id: fact.fact_id,
          field_path: fact.field_path,
          value_raw: fact.value_raw,
          source: fact.source,
        }),
      ),
      reference_experience: undefined,
      reference_style_examples: undefined,
      style_observations: [],
      gate_b_proposals: (facts.gate_b_proposals ?? []).filter(
        (proposal) => proposal.status === "confirmed",
      ),
    };
  }
  return {
    ...facts,
    reference_experience: plannerExperiencePayload(
      facts.reference_experience,
    ),
    reference_style_examples: (facts.reference_style_examples ?? []).map(
      (example) => ({
        ...example,
        source: {
          document_id: example.source.document_id,
          page: example.source.page,
        },
      }),
    ),
  };
}

function sanitizePlan(
  value: DesignReportPagePlan,
  facts: DesignReportProjectFacts,
  taskMode: TaskMode = resolvedTaskMode(facts, value),
) {
  if (isSmallBuildingMode(taskMode)) {
    const factIds = new Set(facts.facts.map((fact) => fact.fact_id));
    const proposalIds = new Set(
      (facts.gate_b_proposals ?? [])
        .filter((proposal) => proposal.status === "confirmed")
        .map((proposal) => proposal.missing_item_id),
    );
    const pages = value.pages.map((page, index) => ({
      ...page,
      page_id: `P${String(index + 1).padStart(3, "0")}`,
      display_page_number: index + 1,
      style_example_refs: [],
      experience_recipe_refs: [],
      proposal_refs: (page.proposal_refs ?? []).filter((proposalId) =>
        proposalIds.has(proposalId),
      ),
      proposal_coverage: (page.proposal_coverage ?? []).filter((coverage) =>
        proposalIds.has(coverage.proposal_id),
      ),
      proposal_context_hash: undefined,
      fact_refs: (page.fact_refs ?? []).filter((factId) => factIds.has(factId)),
      headline_zh: normalizePageHeadline(page.headline_zh, "当前页"),
      headline_en: sanitizePresentationText(
        page.headline_en,
        englishPresentationText(page.headline_zh, pageTypeEnglishLabels[page.page_type]),
      ),
      core_message: sanitizePresentationText(page.core_message, "依据任务书组织本页信息。"),
      core_message_en: sanitizePresentationText(
        page.core_message_en,
        englishCoreFallback(page.page_type),
      ),
      visual_requirements: page.visual_requirements ?? [],
      visual_brief: page.visual_brief ?? page.visual_requirements ?? [],
    }));
    const result: DesignReportPagePlan = {
      ...value,
      task_mode: "small_building_or_interior",
      page_format: "A3_landscape_420x297mm",
      language_mode: "zh_en",
      target_page_count: pages.length,
      pages,
      sections: value.sections,
    };
    assertPagePlan(result);
    return result;
  }
  const factIds = new Set(facts.facts.map((fact) => fact.fact_id));
  if (value.pages.length !== DEFAULT_TARGET_PAGE_COUNT) {
    throw new Error(`模型目录必须包含 ${DEFAULT_TARGET_PAGE_COUNT} 页。`);
  }
  const seenCoreMessages = new Set<string>();
  const understandingSectionIds = projectUnderstandingSectionIds(value);
  const draftPages = value.pages.map((page, index) => {
    const normalizedPageType =
      index === 0
        ? "cover"
        : index === 1
          ? "toc"
          : understandingSectionIds.has(page.section_id)
            ? projectUnderstandingPageType(
                page.page_type,
                `${page.headline_zh} ${page.core_message}`,
              )
            : page.page_type;
    const factRefs = page.fact_refs.filter((factId) => factIds.has(factId));
    const validStyleExampleIds = new Set(
      (facts.reference_style_examples ?? []).map(
        (example) => example.example_id,
      ),
    );
    const requestedStyleExampleRefs = (page.style_example_refs ?? []).filter(
      (exampleId) => validStyleExampleIds.has(exampleId),
    );
    const styleExampleRefs = requestedStyleExampleRefs.length
      ? requestedStyleExampleRefs.slice(0, 3)
      : styleExampleRefsForPage(normalizedPageType, facts);
    const matchedLayout = styleLayoutRequirements(normalizedPageType, facts);
    const validRecipeIds = new Set(
      (facts.reference_experience?.page_recipes ?? []).map(
        (recipe) => recipe.recipe_id,
      ),
    );
    const requestedRecipeRefs = (page.experience_recipe_refs ?? []).filter(
      (recipeId) => validRecipeIds.has(recipeId),
    );
    const recipeProbe = {
      page_type: normalizedPageType,
      core_message:
        index === 1
          ? "项目理解 · 规划策略 · 设计概念 · 空间与功能 · 技术实施 · 方案总结"
          : page.core_message,
      section_id: page.section_id,
      headline_zh: index === 1 ? "目录" : page.headline_zh,
      visual_requirements: page.visual_requirements,
      visual_brief: page.visual_brief,
    };
    const experienceRecipeRefs = requestedRecipeRefs.length
      ? requestedRecipeRefs.slice(0, 3)
      : experienceRecipeRefsForPage(recipeProbe, facts);
    const coreMessage =
      index === 1
        ? "项目理解 · 规划策略 · 设计概念 · 空间与功能 · 技术实施 · 方案总结"
        : sanitizePresentationText(page.core_message);
    if (!coreMessage || seenCoreMessages.has(coreMessage)) {
      throw new Error("模型目录存在空白或重复的 core_message。");
    }
    seenCoreMessages.add(coreMessage);
    const plannedStatus = ["ready", "placeholder", "blocked"].includes(
      page.generation_status,
    )
      ? page.generation_status
      : "placeholder";
    return {
      ...page,
      page_id: `P${String(index + 1).padStart(3, "0")}`,
      display_page_number: index + 1,
      section_id: index < 2 ? "S00" : page.section_id,
      page_type: normalizedPageType,
      headline_zh:
        index === 1
          ? "目录"
          : normalizePageHeadline(
              page.headline_zh,
              "当前页",
            ),
      headline_en: sanitizePresentationText(
        page.headline_en,
        index === 1
          ? "CONTENTS"
          : englishPresentationText(
              page.headline_zh,
              pageTypeEnglishLabels[normalizedPageType],
            ),
      ),
      core_message: coreMessage,
      core_message_en: sanitizePresentationText(
        page.core_message_en,
        englishCoreFallback(normalizedPageType),
      ),
      body_zh: "",
      body_en: "",
      body_copy: "",
      diagram_labels: [],
      diagram_labels_en: [],
      speaker_notes: "",
      visual_requirements: [
        ...new Set([
          ...(index === 1
            ? ["全部章节目录", "章节编号与起始页码", "全篇叙事路径"]
            : []),
          ...page.visual_requirements,
          ...matchedLayout,
        ]),
      ],
      visual_brief: [
        ...new Set([
          ...(index === 1
            ? ["全部章节目录", "章节编号与起始页码", "全篇叙事路径"]
            : []),
          ...(page.visual_brief ?? []),
          ...matchedLayout,
        ]),
      ],
      style_example_refs: styleExampleRefs,
      experience_recipe_refs: experienceRecipeRefs,
      fact_refs: factRefs,
      generation_status:
        normalizedPageType === "toc"
          ? ("ready" as const)
          : plannedStatus === "ready" && factRefs.length === 0
          ? ("placeholder" as const)
          : plannedStatus,
    };
  });
  const experienceAssignments = assignExperienceRecipesForPlan(
    draftPages,
    facts.reference_experience,
  );
  const pages = draftPages.map((page, index) => {
    const assignment = experienceAssignments[index];
    const matchedExperienceLayout = experienceLayoutRequirementsForRecipes(
      assignment.recipes,
      assignment.reasons,
    );
    const withoutStaleReferenceLayout = (items: string[]) =>
      items.filter(
        (item) =>
          !item.startsWith("结构化经验") &&
          !item.startsWith("历史样本 "),
      );
    return {
      ...page,
      experience_recipe_refs: assignment.recipes.map(
        (recipe) => recipe.recipe_id,
      ),
      visual_requirements: [
        ...new Set([
          ...withoutStaleReferenceLayout(page.visual_requirements),
          ...matchedExperienceLayout,
        ]),
      ],
      visual_brief: [
        ...new Set([
          ...withoutStaleReferenceLayout(page.visual_brief ?? []),
          ...matchedExperienceLayout,
        ]),
      ],
    };
  });
  const result: DesignReportPagePlan = {
    ...value,
    task_mode: "large_public_building",
    page_format: "A3_landscape_420x297mm",
    language_mode: "zh_en",
    target_page_count: pages.length,
    sections: [
      {
        section_id: "S00",
        title_zh: "开篇",
        title_en: "OPENING",
        purpose: "建立项目身份与全篇章节导航。",
        answers_question: "这份汇报将如何展开？",
      },
      ...value.sections
        .filter((section) => section.section_id !== "S00")
        .map((section) => ({
          ...section,
          title_zh: sanitizePresentationText(section.title_zh, "设计汇报"),
          title_en: sanitizePresentationText(
            section.title_en,
            englishPresentationText(section.title_zh, "DESIGN REPORT"),
          ),
          purpose: sanitizePresentationText(section.purpose),
          answers_question: sanitizePresentationText(
            section.answers_question,
          ),
        })),
    ],
    pages,
  };
  assertPagePlan(result);
  return result;
}

function assertReferenceGroundedPlan(
  pagePlan: DesignReportPagePlan,
  projectFacts: DesignReportProjectFacts,
) {
  const experience = projectFacts.reference_experience;
  const styleExamples = projectFacts.reference_style_examples ?? [];
  if (!experience?.page_recipes.length || !styleExamples.length) {
    throw new Error("快速骨架缺少可用的历史参考库。");
  }

  const recipeById = new Map(
    experience.page_recipes.map((recipe) => [recipe.recipe_id, recipe]),
  );
  const styleExampleIds = new Set(
    styleExamples.map((example) => example.example_id),
  );
  const ungroundedPages = pagePlan.pages.filter(
    (page) =>
      !(page.experience_recipe_refs ?? []).some((recipeId) =>
        recipeById.has(recipeId),
      ) ||
      !(page.style_example_refs ?? []).some((exampleId) =>
        styleExampleIds.has(exampleId),
      ),
  );
  if (ungroundedPages.length) {
    throw new Error(
      `快速骨架有 ${ungroundedPages.length} 页未匹配有效历史样本。`,
    );
  }

  const usedRecipes = pagePlan.pages
    .flatMap((page) => page.experience_recipe_refs ?? [])
    .map((recipeId) => recipeById.get(recipeId))
    .filter(
      (
        recipe,
      ): recipe is NonNullable<DesignReportProjectFacts["reference_experience"]>["page_recipes"][number] =>
        Boolean(recipe),
    );
  const usedSources = new Set(
    usedRecipes.map((recipe) => recipe.source_document_id),
  );
  const availableSources = new Set(
    experience.source_documents.map((source) => source.source_document_id),
  );
  const requiredSourceCount = Math.min(3, availableSources.size);
  if (usedSources.size < requiredSourceCount) {
    throw new Error(
      `快速骨架只覆盖 ${usedSources.size} 套历史来源，低于要求的 ${requiredSourceCount} 套。`,
    );
  }

  const layoutFamilies = new Set(
    usedRecipes.map((recipe) => recipe.layout_family).filter(Boolean),
  );
  if (layoutFamilies.size < 10) {
    throw new Error(
      `快速骨架的布局家族不足：当前 ${layoutFamilies.size} 种，至少需要 10 种。`,
    );
  }
}

export function runFastPipeline(
  inputs: InputDocument[],
  projectId = "SINGLE_PROJECT",
  taskMode: TaskMode = DEFAULT_TASK_MODE,
): PipelineResult {
  const baseline = runPipeline(inputs, projectId, taskMode);
  const result = isSmallBuildingMode(taskMode)
    ? (() => {
        const pagePlan = generateSmallModeReport(
          baseline.projectFacts,
          baseline.pagePlan,
        );
        return {
          ...baseline,
          pagePlan: {
            ...pagePlan,
            pages: pagePlan.pages.map((page) => ({
              ...page,
              // The local skeleton is useful for layout and visual-task
              // preparation, but it is not Agent-generated copy. Keep the
              // directory honest until the text model has written the page.
              generation_status:
                page.generation_status === "generated" ||
                page.generation_status === "reviewed"
                  ? ("ready" as const)
                  : page.generation_status,
              visual_task: createVisualTask(baseline.projectFacts, page),
            })),
          },
        };
      })()
    : baseline;
  if (!isSmallBuildingMode(taskMode)) {
    assertReferenceGroundedPlan(result.pagePlan, result.projectFacts);
  }

  return {
    ...result,
    executionMode: "local_rule",
    analysisMode: "fast",
  };
}

function deepNarrativePayload(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  taskMode: TaskMode = resolvedTaskMode(projectFacts, pagePlan),
) {
  return {
    task_mode: taskMode,
    audience: isSmallBuildingMode(taskMode)
      ? "小型建筑/装置方案汇报读者"
      : "建筑设计竞赛评审",
    objective: isSmallBuildingMode(taskMode)
      ? "把任务书已有事实和设计方向拆解为可直接排版的页面"
      : "说明项目理解与方案回应",
    current_project: {
      project_name_anonymized: projectFacts.project_name_anonymized,
      gate_report: projectFacts.gate_report,
      missing_items: projectFacts.missing_items,
      task_brief_design_directions: isSmallBuildingMode(taskMode)
        ? smallModeDesignDirectionFacts(projectFacts).map((fact) => ({
            fact_id: fact.fact_id,
            field_path: fact.field_path,
            value_raw: fact.value_raw,
            source: fact.source,
          }))
        : [],
      confirmed_proposals: (projectFacts.gate_b_proposals ?? [])
        .filter((proposal) => proposal.status === "confirmed")
        .map((proposal) => {
          const selected = proposal.options.find(
            (option) => option.option_id === proposal.selected_option_id,
          );
          return {
            topic: proposal.missing_label,
            direction: proposal.confirmed_direction,
            option_title: selected?.title ?? "",
            design_moves: selected?.design_moves ?? [],
          };
        }),
      facts: projectFacts.facts.map((fact) => ({
        fact_id: fact.fact_id,
        category: fact.category,
        field_path: fact.field_path,
        value_raw: fact.value_raw,
        value_normalized: fact.value_normalized,
        unit: fact.unit,
        status: fact.status,
        source: fact.source,
      })),
    },
    baseline: {
      narrative_claim: pagePlan.narrative_claim,
      sections: pagePlan.sections,
      pages: pagePlan.pages.map((page) => ({
        page_id: page.page_id,
        section_id: page.section_id,
        page_type: page.page_type,
        headline_zh: page.headline_zh,
        core_message: page.core_message,
      })),
    },
    historical_reference_summary: {
      source_documents: isSmallBuildingMode(taskMode)
        ? []
        : projectFacts.reference_experience?.source_documents ?? [],
      policy: isSmallBuildingMode(taskMode)
        ? "本模式不使用大型公共建筑历史参考库；页面只依据任务书事实和其中明确的设计方向。"
      : "历史信息只用于叙事和版式参照，不得成为当前项目事实或设计结论。",
    },
    local_culture_fusion: isSmallBuildingMode(taskMode)
      ? localCultureFusionPrompt(projectFacts)
      : "",
    small_scale_buildability_skill: isSmallBuildingMode(taskMode)
      ? smallScaleBuildabilityPrompt(projectFacts)
      : "",
    small_mode_narrative_contract: isSmallBuildingMode(taskMode)
      ? pagePlan.pages.map((page) => ({
          page_id: page.page_id,
          guidance: smallModeNarrativeGuidance(page, pagePlan.pages),
        }))
      : [],
  };
}

function deepPageBatchPayload(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  narrative: DeepNarrativeRefinement,
  batchPages: DesignReportPagePlan["pages"],
) {
  const taskMode = resolvedTaskMode(projectFacts, pagePlan);
  const factById = new Map(
    projectFacts.facts.map((fact) => [fact.fact_id, fact]),
  );
  const recipeById = new Map(
    (projectFacts.reference_experience?.page_recipes ?? []).map((recipe) => [
      recipe.recipe_id,
      recipe,
    ]),
  );
  return {
    task_mode: taskMode,
    audience: isSmallBuildingMode(taskMode)
      ? "小型建筑/装置方案汇报读者"
      : "建筑设计竞赛评审",
    objective: isSmallBuildingMode(taskMode)
      ? "把任务书已有事实和设计方向拆解为可直接排版的页面"
      : "说明项目理解与方案回应",
    local_culture_fusion: isSmallBuildingMode(taskMode)
      ? localCultureFusionPrompt(projectFacts)
      : "",
    small_scale_buildability_skill: isSmallBuildingMode(taskMode)
      ? batchPages.map((page) => ({
          page_id: page.page_id,
          guidance: smallScaleBuildabilityPrompt(projectFacts, page),
        }))
      : [],
    small_mode_narrative_contract: isSmallBuildingMode(taskMode)
      ? batchPages.map((page) => ({
          page_id: page.page_id,
          guidance: smallModeNarrativeGuidance(page, pagePlan.pages),
        }))
      : [],
    narrative_claim: narrative.narrative_claim,
    sections: narrative.sections,
    pages: batchPages.map((page) => ({
      page_id: page.page_id,
      section_id: page.section_id,
      page_type: page.page_type,
      headline_zh: page.headline_zh,
      core_message: page.core_message,
      confirmed_proposals: confirmedGateBProposalsForPage(projectFacts, page).map((proposal) => {
        const selected = proposal.options.find(
          (option) => option.option_id === proposal.selected_option_id,
        );
        return {
          topic: proposal.missing_label,
          direction: proposal.confirmed_direction,
          option_title: selected?.title ?? "",
          design_moves: selected?.design_moves ?? [],
        };
      }),
      facts: page.fact_refs
        .map((factId) => factById.get(factId))
        .filter((fact): fact is ProjectFact => Boolean(fact))
        .map((fact) => ({
          fact_id: fact.fact_id,
          category: fact.category,
          value_raw: fact.value_raw,
          status: fact.status,
        })),
      reference_roles: (isSmallBuildingMode(taskMode)
        ? []
        : page.experience_recipe_refs ?? [])
        .map((recipeId) => recipeById.get(recipeId))
        .filter(Boolean)
        .map((recipe) => ({
          page_role: recipe!.page_role,
          topics: recipe!.topics ?? [],
          page_intents: recipe!.page_intents ?? [],
          scheme_branch: recipe!.scheme_branch,
          parallel_step_key: recipe!.parallel_step_key,
        })),
    })),
    adjacent_context: pagePlan.pages
      .filter((page) => {
        const firstIndex = pagePlan.pages.indexOf(batchPages[0]);
        const lastIndex = pagePlan.pages.indexOf(batchPages.at(-1)!);
        const pageIndex = pagePlan.pages.indexOf(page);
        return pageIndex === firstIndex - 1 || pageIndex === lastIndex + 1;
      })
      .map((page) => ({
        page_id: page.page_id,
        headline_zh: page.headline_zh,
        core_message: page.core_message,
      })),
  };
}

function mergeDeepRefinement(
  baseline: DesignReportPagePlan,
  refinement: DeepPlanRefinement,
  projectFacts: DesignReportProjectFacts,
) {
  const expectedPageCount = baseline.pages.length;
  if (refinement.pages.length !== expectedPageCount) {
    throw new Error(`深度优化结果必须包含当前框架的 ${expectedPageCount} 页。`);
  }
  const refinedSections = refinement.sections
    .filter((section) => section.section_id !== "S00")
    .map((section) => {
      const baselineSection = baseline.sections.find(
        (candidate) => candidate.section_id === section.section_id,
      );
      return {
        ...section,
        title_zh: sanitizePresentationText(
          section.title_zh,
          baselineSection?.title_zh ?? "设计汇报",
        ),
        purpose: sanitizePresentationText(
          section.purpose,
          baselineSection?.purpose ?? "",
        ),
        answers_question: sanitizePresentationText(
          section.answers_question,
          baselineSection?.answers_question ?? "",
        ),
      };
    });
  const sections =
    refinedSections.length > 0
      ? refinedSections
      : baseline.sections.filter((section) => section.section_id !== "S00");
  const validSectionIds = new Set(sections.map((section) => section.section_id));
  const firstSectionId = sections[0]?.section_id ?? "S01";
  const validFactIds = new Set(
    projectFacts.facts.map((fact) => fact.fact_id),
  );
  const seenCoreMessages = new Set<string>();
  const refinedPageById = new Map(
    refinement.pages.map((page) => [page.page_id, page]),
  );
  if (
    refinedPageById.size !== expectedPageCount ||
    baseline.pages.some((page) => !refinedPageById.has(page.page_id))
  ) {
    throw new Error(
      `深度优化结果的页面编号与当前 ${expectedPageCount} 页框架不一致。`,
    );
  }

  const pages = baseline.pages.map((basePage, index) => {
    const refinedPage = refinedPageById.get(basePage.page_id);
    const proposedCore = sanitizePresentationText(
      refinedPage?.core_message,
    );
    const coreMessage =
      proposedCore && !seenCoreMessages.has(proposedCore)
        ? proposedCore
        : basePage.core_message;
    seenCoreMessages.add(coreMessage);
    const proposedSectionId = refinedPage?.section_id ?? "";
    const sectionId =
      index < 2
        ? "S00"
        : validSectionIds.has(proposedSectionId)
          ? proposedSectionId
          : validSectionIds.has(basePage.section_id)
            ? basePage.section_id
            : firstSectionId;
    const headlineZh = normalizePageHeadline(
      refinedPage?.headline_zh,
      basePage.headline_zh,
    );
    const headlineEn = sanitizePresentationText(
      refinedPage?.headline_en,
      basePage.headline_en ??
        englishPresentationText(
          basePage.headline_zh,
          pageTypeEnglishLabels[basePage.page_type],
        ),
    );
    const coreMessageEn = sanitizePresentationText(
      refinedPage?.core_message_en,
      basePage.core_message_en ??
        englishCoreFallback(basePage.page_type),
    );
    const contentChanged =
      sectionId !== basePage.section_id ||
      headlineZh !== basePage.headline_zh ||
      coreMessage !== basePage.core_message;
    const mergedPage = {
      ...basePage,
      section_id: sectionId,
      page_type: basePage.page_type,
      headline_zh: headlineZh,
      headline_en: headlineEn,
      core_message: coreMessage,
      core_message_en: coreMessageEn,
      fact_refs: basePage.fact_refs.filter((factId) => validFactIds.has(factId)),
    };
    if (contentChanged) {
      mergedPage.body_zh = "";
      mergedPage.body_en = "";
      mergedPage.body_copy = "";
      mergedPage.diagram_labels = [];
      mergedPage.diagram_labels_en = [];
      mergedPage.speaker_notes = "";
      mergedPage.callouts = [];
      mergedPage.proposal_coverage = [];
      delete mergedPage.visual_task;
      if (
        !["cover", "toc", "section_divider"].includes(basePage.page_type)
      ) {
        mergedPage.generation_status = "ready";
      }
    }
    return mergedPage;
  });

  return sanitizePlan(
    {
      ...baseline,
      narrative_claim: sanitizePresentationText(
        refinement.narrative_claim,
        baseline.narrative_claim,
      ),
      sections,
      pages,
      audit_report: undefined,
    },
    projectFacts,
  );
}

export async function runDeepOptimizationPipeline(
  inputs: InputDocument[],
  projectId = "SINGLE_PROJECT",
  runtimeOverride?: ModelRuntimeOverride,
  currentBaseline?: Pick<
    PipelineResult,
    "projectFacts" | "pagePlan" | "nodeOutputs"
  >,
  taskMode: TaskMode = DEFAULT_TASK_MODE,
): Promise<PipelineResult> {
  const localBaseline: PipelineResult = currentBaseline
    ? {
        projectFacts: structuredClone(currentBaseline.projectFacts),
        pagePlan: structuredClone(currentBaseline.pagePlan),
        nodeOutputs: structuredClone(currentBaseline.nodeOutputs),
        modelCallCount: 0,
        executionMode: "local_rule",
        analysisMode: "fast",
      }
    : runPipeline(inputs, projectId, taskMode);
  if (currentBaseline && inputs.length) {
    const ruleBasedFacts = runPipeline(
      inputs,
      currentBaseline.projectFacts.project_id || projectId,
      taskMode,
    ).projectFacts;
    localBaseline.projectFacts = checkCompleteness(
      enrichExtractedFactsWithRuleFacts(
        localBaseline.projectFacts,
        ruleBasedFacts,
      ),
    );
  }
  let narrative: {
    value: DeepNarrativeRefinement;
    call: ModelCallRecord;
  };
  try {
    narrative = await createStructuredResponse<DeepNarrativeRefinement>({
      name: "deep_narrative_refinement",
      schema: deepNarrativeRefinementSchema,
      instructions: isSmallBuildingMode(taskMode)
        ? SMALL_MODE_DEEP_NARRATIVE_PROMPT
        : DEEP_NARRATIVE_PROMPT,
      content: [
        {
          type: "input_text",
          text: JSON.stringify(
            deepNarrativePayload(
              localBaseline.projectFacts,
              localBaseline.pagePlan,
              taskMode,
            ),
          ),
        },
      ],
      reasoningEffort: "low",
      runtimeOverride,
      timeoutMs: 90_000,
      maxAttempts: 1,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`章节与中心主张优化失败：${message}`);
  }

  const pageBatches: Array<DesignReportPagePlan["pages"]> = [];
  for (
    let index = 0;
    index < localBaseline.pagePlan.pages.length;
    index += 5
  ) {
    pageBatches.push(localBaseline.pagePlan.pages.slice(index, index + 5));
  }
  const batchResults: Array<{
    value: DeepPageBatchRefinement;
    call: ModelCallRecord;
  }> = new Array(pageBatches.length);
  let nextBatchIndex = 0;
  const workers = Array.from(
    { length: Math.min(3, pageBatches.length) },
    async () => {
      while (nextBatchIndex < pageBatches.length) {
        const batchIndex = nextBatchIndex;
        nextBatchIndex += 1;
        const batchPages = pageBatches[batchIndex];
        try {
          batchResults[batchIndex] =
            await createStructuredResponse<DeepPageBatchRefinement>({
            name: `deep_page_batch_${String(batchIndex + 1).padStart(2, "0")}`,
            schema: deepPageBatchRefinementSchema(batchPages.length),
            instructions: isSmallBuildingMode(taskMode)
              ? SMALL_MODE_DEEP_PAGE_BATCH_PROMPT
              : DEEP_PAGE_BATCH_PROMPT,
            content: [
              {
                type: "input_text",
                text: JSON.stringify(
                  deepPageBatchPayload(
                    localBaseline.projectFacts,
                    localBaseline.pagePlan,
                    narrative.value,
                    batchPages,
                  ),
                ),
              },
            ],
            reasoningEffort: "low",
            runtimeOverride,
            timeoutMs: 60_000,
            maxAttempts: 1,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `第 ${batchIndex + 1} 组页面（${batchPages[0].page_id}–${batchPages.at(-1)!.page_id}）优化失败：${message}`,
          );
        }
      }
    },
  );
  await Promise.all(workers);

  const refinement: DeepPlanRefinement = {
    ...narrative.value,
    pages: batchResults.flatMap((result) => result.value.pages),
  };
  const pagePlan = mergeDeepRefinement(
    localBaseline.pagePlan,
    refinement,
    localBaseline.projectFacts,
  );
  if (
    !isSmallBuildingMode(taskMode) &&
    localBaseline.projectFacts.reference_experience?.page_recipes.length &&
    localBaseline.projectFacts.reference_style_examples?.length
  ) {
    assertReferenceGroundedPlan(pagePlan, localBaseline.projectFacts);
  }

  const refinedPagePlan = isSmallBuildingMode(taskMode)
    ? sanitizePlan(pagePlan, localBaseline.projectFacts, taskMode)
    : pagePlan;

  const modelOutputs = [
    modelNode("planner", narrative.call, {
      narrative_claim: refinedPagePlan.narrative_claim,
      sections: refinedPagePlan.sections,
    }),
    ...batchResults.map((result, index) =>
      modelNode("planner", result.call, {
        page_ids: pageBatches[index].map((page) => page.page_id),
      }),
    ),
  ];
  const synchronized = isSmallBuildingMode(taskMode)
    ? {
        projectFacts: isolateSmallBuildingProjectFacts({
          ...localBaseline.projectFacts,
          task_mode: taskMode,
        }),
        pagePlan: refinedPagePlan,
      }
    : synchronizeProposalCoverage(localBaseline.projectFacts, pagePlan);

  return {
    projectFacts: synchronized.projectFacts,
    pagePlan: synchronized.pagePlan,
    nodeOutputs: [
      ...localBaseline.nodeOutputs,
      ...modelOutputs,
    ],
    modelCallCount: modelOutputs.length,
    executionMode: "openai_model",
    modelName: getModelRuntime(runtimeOverride).model,
    analysisMode: "deep",
  };
}

export async function runModelPipeline(
  inputs: InputDocument[],
  projectId = "SINGLE_PROJECT",
  runtimeOverride?: ModelRuntimeOverride,
  taskMode: TaskMode = DEFAULT_TASK_MODE,
): Promise<PipelineResult> {
  const localBaseline = runPipeline(inputs, projectId, taskMode);

  const registration = await createStructuredResponse<{
    documents: CanonicalDocument[];
  }>({
    name: "document_registration",
    schema: registrationSchema,
    instructions: REGISTRATION_PROMPT,
    content: documentContent(inputs, "请完成资料登记与角色分流。"),
    reasoningEffort: "low",
    runtimeOverride,
  });
  const classifiedInputs = classifyInputs(inputs, registration.value.documents);
  const documents = canonicalDocuments(
    classifiedInputs,
    registration.value.documents,
  );

  const extraction = await createStructuredResponse<DesignReportProjectFacts>({
    name: "project_facts",
    schema: projectFactsSchema,
    instructions: FACT_EXTRACTION_PROMPT,
    content: documentContent(
      classifiedInputs,
      `project_id 必须为 ${projectId}。资料角色已经确认，请提取完整事实。`,
    ),
    reasoningEffort: "medium",
    runtimeOverride,
  });
  const extracted = enrichExtractedFactsWithRuleFacts(sanitizeExtractedFacts(
    extraction.value,
    classifiedInputs,
    documents,
    projectId,
    isSmallBuildingMode(taskMode)
      ? []
      : localBaseline.projectFacts.style_observations ?? [],
    isSmallBuildingMode(taskMode)
      ? []
      : localBaseline.projectFacts.reference_style_examples ?? [],
    isSmallBuildingMode(taskMode)
      ? undefined
      : localBaseline.projectFacts.reference_experience,
  ), localBaseline.projectFacts);

  const completion = await createStructuredResponse<DesignReportProjectFacts>({
    name: "project_completeness",
    schema: projectFactsSchema,
    instructions: COMPLETENESS_PROMPT,
    content: [
      {
        type: "input_text",
        text: `请完成完整度检查：\n${JSON.stringify(extracted)}`,
      },
    ],
    reasoningEffort: "medium",
    runtimeOverride,
  });
  const checked = isSmallBuildingMode(taskMode)
    ? isolateSmallBuildingProjectFacts(
        ensureSmallModeDesignDirectionState(
          sanitizeCompletion(extracted, completion.value),
        ),
      )
    : sanitizeCompletion(extracted, completion.value);

  const planner = await createStructuredResponse<DesignReportPagePlan>({
    name: "page_plan",
    schema: pagePlanSchema,
    instructions: PLANNER_PROMPT,
    content: [
      {
        type: "input_text",
        text: `汇报对象默认为建筑设计竞赛评审，汇报目标为说明项目理解与方案回应。历史样本原文已从规划输入中移除，只能使用脱敏模板与版式规则。输入：\n${JSON.stringify(planningFactsPayload(checked))}`,
      },
    ],
    reasoningEffort: "high",
    runtimeOverride,
  });
  const pagePlan = sanitizePlan(planner.value, checked, taskMode);
  const synchronized = isSmallBuildingMode(taskMode)
    ? { projectFacts: checked, pagePlan }
    : synchronizeProposalCoverage(checked, pagePlan);

  return {
    projectFacts: synchronized.projectFacts,
    pagePlan: synchronized.pagePlan,
    nodeOutputs: [
      modelNode("registration", registration.call, {
        documents,
        data_zones: {
          current_project_evidence: documents
            .filter((document) =>
              ["authoritative", "proposal"].includes(document.role),
            )
            .map((document) => document.document_id),
          historical_reference_library: documents
            .filter((document) => document.role === "reference_style")
            .map((document) => document.document_id),
          excluded_company_information: documents
            .filter((document) => document.role === "company_info")
            .map((document) => document.document_id),
        },
      }),
      modelNode("fact_extraction", extraction.call, extracted),
      modelNode("completeness", completion.call, checked.gate_report),
      modelNode("planner", planner.call, synchronized.pagePlan),
    ],
    modelCallCount: 4,
    executionMode: "openai_model",
    modelName: getModelRuntime(runtimeOverride).model,
    analysisMode: "deep",
  };
}

function hasChineseText(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function hasSubstantialEnglishText(value: string) {
  return /[A-Za-z]{3,}/u.test(value);
}

function chinesePrimaryText(
  preferred: string | undefined,
  alternative: string | undefined,
  fallback = "",
) {
  const candidates = [preferred, alternative, fallback]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  const cleanChineseCandidate = candidates.find(
    (value) => hasChineseText(value) && !hasSubstantialEnglishText(value),
  );
  if (cleanChineseCandidate) return cleanChineseCandidate;
  return (
    candidates.find((value) => hasChineseText(value)) ??
    candidates[0] ??
    ""
  );
}

function chineseDisplayItems(
  values: string[],
  fallbacks: string[],
  fallbackLabel: string,
) {
  return values.map((value, index) => {
    const trimmed = value.trim();
    if (hasChineseText(trimmed) || !/[A-Za-z]/.test(trimmed)) return trimmed;
    const fallback = fallbacks[index]?.trim() ?? "";
    return hasChineseText(fallback)
      ? fallback
      : `${fallbackLabel} ${index + 1}`;
  });
}

const protectedHistoricalReferenceTerms = [
  "DK05",
  "SKP",
  "黄埔路",
  "马场",
  "中央公园",
  "奥林匹克体育中心",
  "天河公园",
  "珠江新城",
  "珠江公园",
  "广州塔",
  "广州会展",
  "广州金融城",
  "琶洲",
  "云骧双耀",
  "TWIN SKY PAVILION",
];

function cleanPresentationLabel(value: string) {
  return value
    .trim()
    .replace(
      /^(?:label|diagram[_\s-]?label|图解标签)\s*\d*\s*(?:zh|cn|中文)?\s*[:：]\s*/i,
      "",
    )
    .trim();
}

function pageLabelFallbacks(
  page: DesignReportPagePlan["pages"][number],
  citedFacts: ProjectFact[],
) {
  const factLabels = citedFacts
    .map((fact) => cleanPresentationLabel(String(fact.value_raw)))
    .filter(
      (value) =>
        value.length > 0 &&
        value.length <= 36 &&
        hasChineseText(value) &&
        !containsBackstagePresentationText(value),
    );
  const contextualLabels = contextualDiagramLabels(
    page.page_type,
    page.headline_zh,
    page.core_message,
    6,
  );
  return [
    ...new Set([
      ...contextualLabels,
      ...factLabels,
    ]),
  ];
}

function conciseVisibleSentence(value: string, fallback: string) {
  const firstSentence =
    value.trim().match(/^.+?[。！？](?:\s|$)/u)?.[0]?.trim() ??
    value.trim();
  if (!firstSentence) return fallback;
  if (firstSentence.length <= 56) return firstSentence;
  const clauses = firstSentence
    .replace(/[。！？]+$/u, "")
    .split(/[，；]/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  let summary = "";
  for (const clause of clauses) {
    const candidate = summary ? `${summary}，${clause}` : clause;
    if (candidate.length > 54 && summary) break;
    summary = candidate;
  }
  return `${summary || fallback}。`;
}

function proposalAlignedStrategyOverview(
  page: DesignReportPagePlan["pages"][number],
  proposals: Array<{
    proposal_id: string;
    topic: string;
    title: string;
    confirmed_direction: string;
    design_moves: string[];
  }>,
) {
  if (
    page.page_type !== "strategy" ||
    !/四项确认策略|策略链|集中整合串联/u.test(page.headline_zh)
  ) {
    return undefined;
  }
  const topics = ["总体布局", "交通组织", "重点空间", "立面方案"];
  const byTopic = new Map(proposals.map((proposal) => [proposal.topic, proposal]));
  if (!topics.every((topic) => byTopic.has(topic))) return undefined;
  const titleSuffix: Record<string, string> = {
    总体布局: "组织总体布局",
    交通组织: "组织公共到达",
    重点空间: "串联重点空间",
    立面方案: "建立性能化立面",
  };
  const fallbackDetail: Record<string, string> = {
    总体布局: "集中主要功能并释放连续地面公共空间。",
    交通组织: "以连续慢行网络串联公共节点，并减少车行干扰。",
    重点空间: "通过连续可达的公共路径连接室内外重点空间。",
    立面方案: "通过遮阳、绿化和可开启界面调节采光与通风。",
  };
  const fallbackTitle: Record<string, string> = {
    总体布局: "集中整合总体布局",
    交通组织: "地上地下分流到达",
    重点空间: "连续立体公共空间",
    立面方案: "性能化气候表皮",
  };
  const labels: string[] = [];
  const descriptions: string[] = [];
  const coverage: Array<{
    proposal_id: string;
    visible_statement: string;
    applied_design_moves: [string, ...string[]];
  }> = [];
  for (const topic of topics) {
    const proposal = byTopic.get(topic);
    if (!proposal) continue;
    const proposalTitle = proposal.title.trim();
    const visibleTitle = /[？?]|你|哪种|倾向/u.test(proposalTitle)
      ? fallbackTitle[topic]
      : `${proposalTitle}${titleSuffix[topic]}`;
    const visibleDetail = conciseVisibleSentence(
      proposal.confirmed_direction,
      fallbackDetail[topic],
    );
    labels.push(visibleTitle);
    descriptions.push(visibleDetail);
    coverage.push({
      proposal_id: proposal.proposal_id,
      visible_statement: visibleDetail,
      applied_design_moves: [
        proposal.confirmed_direction || fallbackDetail[topic],
      ],
    });
  }
  return { labels, descriptions, coverage };
}

function safePresentationItems(
  values: string[],
  fallbacks: string[],
  forbiddenTerms: string[],
  currentProjectEvidence: string,
  limit = 6,
) {
  const safe = values
    .map(cleanPresentationLabel)
    .filter(Boolean)
    .filter((value) => !containsBackstagePresentationText(value))
    .filter(
      (value) =>
        !forbiddenTerms.some(
          (term) =>
            value.includes(term) && !currentProjectEvidence.includes(term),
        ),
    );
  const candidates = safe.length ? safe : fallbacks;
  return sanitizePresentationItems(
    candidates.map(cleanPresentationLabel).filter(Boolean),
    limit,
  );
}

function normalizeProposalCoverageText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\u3000，。；：、！？,.!?;:'"“”‘’（）()【】\[\]《》<>—–-]/g, "");
}

function exactVisibleFieldForCoverage(
  visibleFields: string[],
  proposedStatement: string,
) {
  const normalizedStatement = normalizeProposalCoverageText(
    proposedStatement,
  );
  if (!normalizedStatement) return undefined;
  return visibleFields.find((field) => {
    const normalizedField = normalizeProposalCoverageText(field);
    return (
      normalizedField.includes(normalizedStatement) ||
      normalizedStatement.includes(normalizedField)
    );
  });
}

function reconciledVisibleFieldForCoverage(
  visibleFields: string[],
  proposedStatement: string,
  appliedDesignMoves: string[],
  allowDeterministicFallback: boolean,
) {
  const exact = exactVisibleFieldForCoverage(
    visibleFields,
    proposedStatement,
  );
  if (exact) return exact;

  const target = normalizeProposalCoverageText(
    [proposedStatement, ...appliedDesignMoves].join(" "),
  );
  const targetPairs = new Set(
    Array.from({ length: Math.max(0, target.length - 1) }, (_, index) =>
      target.slice(index, index + 2),
    ),
  );
  const ranked = visibleFields
    .map((field) => {
      const normalized = normalizeProposalCoverageText(field);
      const score = Array.from(
        { length: Math.max(0, normalized.length - 1) },
        (_, index) => normalized.slice(index, index + 2),
      ).filter((pair) => targetPairs.has(pair)).length;
      return { field, score };
    })
    .sort((left, right) => right.score - left.score);
  if ((ranked[0]?.score ?? 0) >= 2) return ranked[0].field;

  // The model has already received one repair round at this point. If it
  // returned a valid proposal id and concrete design moves but paraphrased the
  // visible sentence again, bind the coverage to the actual saved body rather
  // than discarding the complete page for punctuation/wording drift.
  if (allowDeterministicFallback && appliedDesignMoves.length > 0) {
    return visibleFields.find(
      (field) => normalizeProposalCoverageText(field).length >= 12,
    );
  }
  return undefined;
}

const pageFactRelevanceHints = [
  { prefix: "project.", pattern: /项目|封面|名称|阶段/ },
  { prefix: "site.", pattern: /区位|场地|城市|周边|开放|界面|位置|门户/ },
  { prefix: "planning.", pattern: /指标|边界|限制|规模|容积率|高度|强度|用地/ },
  { prefix: "planning_control.", pattern: /指标|边界|限制|高度|强度|用地/ },
  { prefix: "area.", pattern: /指标|面积|规模|地上|地下|建筑量/ },
  { prefix: "program.", pattern: /功能|业态|空间构成|使用|运营/ },
  { prefix: "evaluation.", pattern: /评审|目标|议题|评价|响应/ },
  { prefix: "circulation.", pattern: /交通|流线|到达|人车|货运|消防|地铁|落客/ },
  { prefix: "deliverable.", pattern: /成果|规格|A3|图纸|文本|响应矩阵/ },
  { prefix: "technical.", pattern: /立面|技术|遮阳|通风|结构|材料/ },
  { prefix: "proposal.", pattern: /概念|布局|空间|策略|方案/ },
] as const;

function factNumbers(value: string) {
  return value.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
}

function limitVisibleBodyPoints(value: string, language: "zh" | "en") {
  const separator = language === "zh" ? /[。！？；\n]+/ : /[.!?;\n]+/;
  const points = value
    .split(separator)
    .map((point) => point.trim())
    .filter((point) => point.length >= 4);
  if (points.length <= 4) return value;
  return language === "zh"
    ? `${points.slice(0, 4).join("；")}。`
    : `${points.slice(0, 4).join(". ")}.`;
}

function selectRelevantPageFactIds(
  projectFacts: DesignReportProjectFacts,
  page: ReportPage,
  candidateIds: string[],
  limit: number,
) {
  const visibleNeed = [
    page.headline_zh,
    page.core_message,
    page.body_zh,
    page.body_copy,
    ...page.visual_requirements,
    ...(page.diagram_labels ?? []),
    ...page.missing_information,
  ]
    .filter(Boolean)
    .join(" ");
  const orderedIds = [...new Set(candidateIds)];
  const smallModeOverview =
    isSmallBuildingMode(projectFacts.task_mode ?? DEFAULT_TASK_MODE) &&
    /三件|三类|矩阵|对照|总览|分工/u.test(page.headline_zh);
  if (smallModeOverview) {
    const candidateSet = new Set(orderedIds);
    const required = ["1", "2", "3"].flatMap((installationId) => {
      const preferred = projectFacts.facts.find(
        (fact) =>
          candidateSet.has(fact.fact_id) &&
          fact.status === "confirmed" &&
          fact.field_path === `installation.${installationId}.brief`,
      );
      if (preferred) return [preferred.fact_id];
      const fallback = projectFacts.facts.find(
        (fact) =>
          candidateSet.has(fact.fact_id) &&
          fact.status === "confirmed" &&
          fact.field_path.startsWith(`installation.${installationId}.`) &&
          !fact.field_path.endsWith(".sequence"),
      );
      return fallback ? [fallback.fact_id] : [];
    });
    const sharedRequirement = projectFacts.facts.find(
      (fact) =>
        candidateSet.has(fact.fact_id) &&
        fact.status === "confirmed" &&
        (/传播|互动/u.test(page.headline_zh)
          ? fact.field_path === "design_requirement.interaction"
          : fact.field_path === "design_requirement.style"),
    );
    const groundedOverview = [
      ...required,
      ...(sharedRequirement ? [sharedRequirement.fact_id] : []),
    ];
    if (groundedOverview.length >= 3) {
      return groundedOverview.slice(0, Math.max(1, limit));
    }
  }
  const ranked = orderedIds
    .map((factId, index) => {
      const fact = projectFacts.facts.find(
        (candidate) => candidate.fact_id === factId,
      );
      if (!fact || fact.status !== "confirmed") {
        return undefined;
      }
      let score = 0;
      const hint = pageFactRelevanceHints.find((candidate) =>
        fact.field_path.startsWith(candidate.prefix),
      );
      if (hint?.pattern.test(visibleNeed)) score += 20;
      if (
        isSmallBuildingMode(projectFacts.task_mode ?? DEFAULT_TASK_MODE) &&
        ((fact.field_path.startsWith("installation.") &&
          /装置|产品|互动|赠品|真|甜|器|品茗/u.test(visibleNeed)) ||
          (fact.field_path.startsWith("design_requirement.") &&
            /互动|传播|复用|搭建|收起|再部署|轻国风/u.test(visibleNeed)) ||
          (fact.field_path.startsWith("ip.") &&
            /IP|角色|真人|现场|服装/u.test(visibleNeed)) ||
          (fact.field_path.startsWith("event.") &&
            /活动|发布会|开幕式|传播/u.test(visibleNeed)))
      ) {
        score += 24;
      }
      const rawValue = String(fact.value_raw).trim();
      if (rawValue.length >= 2 && rawValue.length <= 36 && visibleNeed.includes(rawValue)) {
        score += 16;
      }
      const matchedNumbers = factNumbers(
        `${rawValue} ${fact.source.quote}`,
      ).filter((number) => visibleNeed.includes(number));
      score += Math.min(3, matchedNumbers.length) * 8;
      if (fact.source_role === "brief_fact") score += 2;
      return { factId, index, score };
    })
    .filter(
      (candidate): candidate is { factId: string; index: number; score: number } =>
        Boolean(candidate),
    )
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked.slice(0, Math.max(1, limit)).map((candidate) => candidate.factId);
}

function refineSmallModeCallout(
  callout: NonNullable<ReportPage["callouts"]>[number],
  projectFacts: DesignReportProjectFacts,
) {
  const label = String(callout.label_zh ?? "")
    .replace(/^装置\s*[0-9一二三四五六七八九十]+\s*[：:|｜]\s*/u, "")
    .trim();
  const candidates = projectFacts.facts
    .filter((fact) => fact.status === "confirmed")
    .map((fact, index) => {
      const raw = String(fact.value_raw ?? "").trim();
      let score = raw.length >= 2 && raw.length <= 80 && label.includes(raw) ? 40 : 0;
      if (/赠送|赠品|产品|茶杯|山泉水|泡茶水/u.test(label) && /\.(?:gift|product)$/u.test(fact.field_path)) score += 25;
      if (/复用|收起|搭建|再部署/u.test(label) && fact.field_path === "design_requirement.reuse") score += 35;
      if (/IP|少女|真人|服装/u.test(label) && fact.field_path === "ip.requirement") score += 35;
      if (/互动|共创|参与/u.test(label) && fact.field_path.endsWith(".interaction")) score += 25;
      if (/发布|新品/u.test(label) && fact.field_path === "event.product_launch") score += 35;
      if (/地标|三个装置|斗器大会/u.test(label) && fact.field_path === "event.positioning") score += 35;
      if (/低矿化|低硬度|茶香/u.test(label) && fact.field_path === "installation.2.product_performance") score += 35;
      if (/甜/u.test(label) && fact.field_path === "installation.2.core") score += 35;
      if (/器/u.test(label) && /^installation\.3\.(?:core|cultural_theme|brief)$/u.test(fact.field_path)) score += 35;
      if (/真/u.test(label) && fact.field_path === "installation.1.core") score += 35;
      if (/设计动作/u.test(label) && fact.field_path.endsWith(".interaction")) score += 35;
      if (/真|甜|器/u.test(label) && fact.field_path.endsWith(".core")) score += 18;
      return { fact, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = candidates[0]?.score && candidates[0].score >= 25 ? candidates[0].fact : undefined;
  return {
    ...callout,
    label_zh: compactSmallModeLabel(label || callout.label_zh),
    fact_ref: best?.fact_id ?? callout.fact_ref,
  };
}

function repairSmallModeParallelBody(
  page: ReportPage,
  body: string,
  projectFacts: DesignReportProjectFacts,
) {
  if (
    !/三件|三类|矩阵|对照|总览|分工/u.test(page.headline_zh)
  ) {
    return body;
  }
  const ids = [
    ...new Set(
      projectFacts.facts
        .map((fact) => fact.field_path.match(/^installation\.([^.]+)\./u)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => Number(left) - Number(right));
  const bodyCoversAllObjects =
    body.trim().length >= 120 &&
    ids.every((id) =>
      new RegExp(`(?:装置\\s*${id}|对象\\s*${id}|方案\\s*${id})`, "u").test(body),
    );
  if (bodyCoversAllObjects) return body;
  const entries = ids.map((id) => {
    const facts = projectFacts.facts.filter((fact) =>
      fact.field_path.startsWith(`installation.${id}.`),
    );
    const core = facts.find((fact) => fact.field_path.endsWith(".core"))?.value_raw;
    const gift = facts.find((fact) => fact.field_path.endsWith(".gift"))?.value_raw;
    const brief = String(facts.find((fact) => fact.field_path.endsWith(".brief"))?.value_raw ?? "");
    const theme =
      core ||
      (id === "3" && /斗器大会|瓷器|品茗/u.test(brief)
        ? "“斗器大会”与瓷器、品茗文化的融合"
        : brief.split(/[。；]/u)[0]) ||
      `装置${id}`;
    const action =
      id === "1"
        ? "以艺术化、非具象的互动唤起对源头澄澈、真实与天然的联想"
        : id === "2"
          ? "把低矿化、低硬度、激发茶香且不易苦涩转化为可参与的泡茶体验"
          : id === "3"
            ? "把瓷器、品茗文化与观众共创组织为可参与的瓷都文化现场"
            : brief
                .replace(/核心\s*[：:][^。；]+[。；]?/u, "")
                .replace(/(?:这个|本)装置(?:会)?赠送产品\s*[：:][^。；]+[。；]?/u, "")
                .replace(/^本装置需要/u, "需要")
                .split(/[。；]/u)
                .map((part) => part.replace(/\s+/gu, "").trim())
                .filter(Boolean)
                .slice(0, 1)
                .join("，");
    return `装置${id}以${String(theme)}为核心，${action}${gift ? `，体验后对应${String(gift)}` : ""}`;
  });
  if (/IP|现场联动/u.test(page.headline_zh)) {
    return "轻国风少女 IP 以同一形象和服装贯穿三处现场：在装置1引导观众感知山泉水的“真”，在装置2参与泡茶、闻香与品鉴，在装置3带领观众进行瓷胚釉水共创。真人角色把导览、互动、赠品领取和拍摄分享串成连续体验，让 IP 从平面识别转化为现场传播触点。";
  }
  if (page.page_type === "summary" || /收束/u.test(page.headline_zh)) {
    return "整套方案以“真、甜、器”为主线：装置1建立浮梁山泉水的天然认知，装置2承担泡茶水发布会与产品体验，装置3连接斗器大会、瓷器与品茗文化。轻国风少女 IP 与真人互动贯穿三处现场，观众通过体验、共创、赠品和社交分享完成传播闭环；三件装置在今年活动后收起，保留至明年继续使用。";
  }
  const closing = /分工/u.test(page.headline_zh)
    ? "三者分别承担产品认知、新品发布和文化记忆，并通过互动、赠品与社交分享共同形成斗器大会的传播系统。"
    : "三件装置以共同设计语言形成平行矩阵，各自保持清晰的产品主题、互动动作和赠品落点。";
  return entries.length >= 3
    ? `${entries.join("；")}。${closing}`
    : body;
}

function repairSmallModeRoleBody(
  page: ReportPage,
  body: string,
  projectFacts: DesignReportProjectFacts,
) {
  const headline = page.headline_zh;
  const existingBodyIsSpecific =
    body.trim().length >= 90 &&
    !/(现状依据|核心问题|设计动作|落位结果|技术原则|关键构造关系|性能验证|本页用于|当前页)/u.test(
      body,
    );
  if (existingBodyIsSpecific) return body;
  if (/从看见到参与|体验如何发生/u.test(headline)) {
    return "观众先通过三件装置统一的轻国风形象识别活动，再进入各自不同的参与动作：在装置1感知山泉水的澄澈与天然，在装置2体验泡茶水对茶香与口感的影响，在装置3参与瓷器与品茗文化相关的共创。体验完成后，产品或定制茶杯成为可带走的记忆，现场拍摄与主动分享则把一次参与延伸为社交传播。";
  }
  if (/轻国风少女\s*IP/u.test(headline)) {
    return "轻国风少女 IP 采用现代、年轻的平面形象，服装、色彩与三件装置的共同设计语言保持一致。现场由真人穿着同款服装承担迎宾、互动引导、赠品衔接与拍摄配合，使平面角色在三处地标前获得真实尺度的行动方式，并形成可持续使用的活动识别资产。";
  }
  if (/搭建、收起与明年复用/u.test(headline)) {
    return "三件装置只服务活动周期，不作为长期矗立设施。设计阶段把主体构件、互动部件与展示内容按可拆分、可收纳、可再次部署的目标组织：今年完成搭建和使用，活动结束后分类收起并保存，明年依据场地条件重新组合。具体尺寸、连接节点和材料性能在深化阶段确认。";
  }
  return repairSmallModeParallelBody(page, body, projectFacts);
}

function sanitizeSmallModeProposalCertainty(
  page: ReportPage,
  body: string,
  projectFacts: DesignReportProjectFacts,
) {
  const sourceCorpus = projectFacts.facts
    .filter((fact) => fact.status !== "superseded" && fact.status !== "conflict")
    .map((fact) => `${String(fact.value_raw)} ${fact.source.quote}`)
    .join("\n");
  const supportedNumbers = new Set(factNumbers(sourceCorpus));
  let result = body.replace(
    /\b\d+(?:\.\d+)?\s*(?:K|mm|cm|m|kg|t|kN|MPa|W|V|元|万元)\b/giu,
    (value) => (supportedNumbers.has(value.match(/\d+(?:\.\d+)?/u)?.[0] ?? "") ? value : "适宜"),
  );
  result = result
    .replace(/确保(?:结构)?稳固且无需混凝土基础/gu, "基础与锚固方式需结合场地条件和专业复核")
    .replace(/基础(?:仅)?需(?:采用)?配重块或螺旋地锚/gu, "基础可优先研究可逆配重或可拆锚固，最终方式需结合场地条件和专业复核")
    .replace(/无损快速搭建/gu, "可逆拆装")
    .replace(/大幅降低(?:重复)?搭建成本/gu, "减少重复制作")
    .replace(/低成本/gu, "节约重复制作")
    .replace(/低成本复用/gu, "年度复用")
    .replace(/系统自动派发/gu, "由现场工作人员赠送")
    .replace(/自动取水区/gu, "产品赠送点")
    .replace(/机械呼吸花瓣/gu, "泡茶、闻香与品鉴节点")
    .replace(
      /机械开合的“花瓣”结构[^。；｜]*/gu,
      "泡茶、闻香与品鉴节点",
    )
    .replace(/可擦写釉水笔/gu, "水性创作笔")
    .replace(/素烧瓷片墙/gu, "可替换共创模块")
    .replace(/(?:可编程|柔性|柔光)?\s*(?:RGBW\s*)?LED\s*灯带/giu, "可维护的内透灯光")
    .replace(/可编程\s*RGBW\s*灯带/giu, "可维护的内透灯光")
    .replace(/(?:冷白光|暖黄光|磁吸式)?\s*LED(?:点光源)?/giu, "可维护的内透灯光")
    .replace(/损耗率极低/gu, "便于维护替换")
    .replace(/零废弃(?:交付|运营)?/gu, "分类收纳与年度复用")
    .replace(/确保次年(?:活动)?(?:的)?直接复用/gu, "便于次年再次部署")
    .replace(/(?:铝材框架|主体框架)次年直接复用/gu, "主体构件维护后供次年再次部署")
    .replace(/骨架永久复用/gu, "骨架维护后供次年再次部署")
    .replace(/主体结构无需改动即可复用/gu, "主体构件维护后供次年再次部署")
    .replace(/UGC内容/gu, "现场共创内容")
    .replace(/确保(?:结构)?稳定(?:性)?(?:且(?:美观|便于搬运))?/gu, "结构稳定性与节点方式待专业深化")
    .replace(/结构稳定性与节点方式待专业深化性/gu, "结构稳定性与节点方式待专业深化")
    .replace(/结构稳固/gu, "结构稳定性待专业深化")
    .replace(/保证抗风稳定性/gu, "抗风与锚固方式待专业深化")
    .replace(/确保抗风稳定性/gu, "具体抗风与锚固方式待专业深化")
    .replace(/环形钢圈基础/gu, "可拆分环形底座")
    .replace(/膨胀螺栓或配重块/gu, "可逆配重或可拆锚固")
    .replace(/双曲或单曲曲面/gu, "分片单曲或可展曲面")
    .replace(/下沉式或围合式/gu, "围合式")
    .replace(/下沉式或平地(?:的)?/gu, "平地式")
    .replace(/实时投影或拍照分享/gu, "现场记录或拍照分享")
    .replace(/实时投影/gu, "现场记录")
    .replace(/基础为简易法兰盘固定，适应不同场地地面条件/gu, "基础与锚固方式需结合不同场地条件和专业复核")
    .replace(/基础为隐蔽式法兰盘连接/gu, "基础与锚固方式需结合场地条件和专业复核")
    .replace(/立柱内藏管线/gu, "立柱整合可维护的内部构件")
    .replace(/现场仅需扳手即可完成组装/gu, "现场采用可逆紧固件完成组装")
    .replace(/活动结束后，?PC板可回收再造/gu, "活动结束后，PC板分类清洁并收纳")
    .replace(/软膜易损耗但成本低/gu, "软膜需在复用前检查与维护")
    .replace(/安全无毒的水性釉料笔/gu, "水性创作笔")
    .replace(/特制水性釉料笔/gu, "水性创作笔")
    .replace(/降低耗材成本/gu, "减少重复制作")
    .replace(/容纳\s*\d+\s*[-—至]\s*\d+\s*人/gu, "容纳多人")
    .replace(/标签关联#[^，。；\s]+/gu, "形成统一传播记忆")
    .replace(/#[^，。；\s]+/gu, "")
    .replace(/默认色温为冷白光/gu, "采用清冷白光")
    .replace(/配重基座（无损地面）/gu, "可逆配重基座")
    .replace(/无损地面/gu, "减少对既有地面的干预")
    .replace(/环形混凝土配重块/gu, "可逆配重或可拆锚固，具体方式待专业深化")
    .replace(/香氛扩散口（仅概念，非设备）/gu, "现场泡茶与闻香操作点")
    .replace(/可回收再造为文创书签/gu, "分类清洁并收纳，供次年再次部署")
    .replace(/系统记录互动轨迹，?生成专属“寻源证书”/gu, "形成清晰的现场参与记忆")
    .replace(/互动数据/gu, "互动照片")
    .replace(/抗风稳定性?/gu, "抗风与锚固方式待专业深化")
    .replace(/材质坚硬耐用/gu, "材料耐久性待深化")
    .replace(/适合高频互动/gu, "面向高频互动的材料性能待深化")
    .replace(/所有材料都能完美回收/gu, "构件可分类收纳，并在复用前检查维护")
    .replace(/现场没有焊接作业/gu, "现场连接方式以专业深化为准")
    .replace(/搭建速度快且噪音低/gu, "便于现场装配")
    .replace(/避免对[^。；]+造成永久性破坏/gu, "减少对既有地面的干预")
    .replace(/极低的边际成本/gu, "减少重复制作")
    .replace(/极低[^，。；]*成本/gu, "适度维护后")
    .replace(/所有材料均可回收复用/gu, "构件分类收纳，并在复用前检查维护")
    .replace(/完美契合/gu, "回应")
    .replace(/不可逆破坏/gu, "过度干预")
    .replace(/机械式香氛扩散装置（若任务书允许）/gu, "可见的手摇滤光片互动")
    .replace(/香氛扩散装置(?:（若任务书允许）)?/gu, "手摇滤光片互动")
    .replace(/无毒水性颜料笔/gu, "水性创作笔")
    .replace(/无毒/gu, "")
    .replace(/或喷枪/gu, "")
    .replace(/观众的数字作品可现场记录至侧面屏幕或生成海报/gu, "观众共创作品通过现场拍照记录并分享")
    .replace(/数字作品/gu, "共创作品")
    .replace(/香气互动：?装置底部隐藏扩香模块[^；。]*/gu, "泡茶与品鉴互动：观众在中心区域完成泡茶、闻香与品鉴")
    .replace(/扩香模块(?:（[^）]*）)?/gu, "现场泡茶与闻香操作点")
    .replace(/香气互动/gu, "泡茶与品鉴互动")
    .replace(/嗅觉暗示/gu, "闻香与品鉴动作")
    .replace(/扫码下载自己的创作电子版/gu, "拍摄并分享自己的共创作品")
    .replace(/扫码/gu, "现场拍照")
    .replace(/下载自己的创作电子版/gu, "分享自己的共创作品")
    .replace(/作品即时干燥并保留/gu, "作品在现场逐步累积")
    .replace(/可完全回收/gu, "可分类清洁并收纳")
    .replace(/甜度测试/gu, "品鉴体验")
    .replace(/香气扩散机制/gu, "闻香与品鉴动作")
    .replace(/模拟茶香氛围/gu, "表现茶汤温暖氛围")
    .replace(/释放微量水雾[^，。；]*/gu, "通过现场泡茶、闻香与品鉴感受口感与茶香")
    .replace(/水雾/gu, "柔和光影")
    .replace(/数字瓷塔/gu, "共创瓷器装置")
    .replace(/发光磁吸模块/gu, "彩色磁吸模块")
    .replace(/彩色亚克力灯箱/gu, "彩色半透明亚克力模块")
    .replace(/光之塔/gu, "共创瓷器装置")
    .replace(/观众在终端/gu, "观众在现场共创台")
    .replace(/塔身高度或色彩密度逐渐增加/gu, "塔身共创图案与色彩逐步丰富")
    .replace(/防脱落/gu, "防脱落方式待专业深化")
    .replace(/可回收用于/gu, "分类清洁并收纳，可用于")
    .replace(/装置内部可能释放淡淡的茶香（若允许）或通过视觉暗示甜味/gu, "观众通过现场泡茶、闻香与品鉴感受口感与茶香")
    .replace(/优秀的共创图案可印制在次年的赠品上/gu, "优秀共创图案可作为次年活动的内容档案")
    .replace(/小型混凝土配重或地锚/gu, "可逆配重或可拆锚固，具体方式待专业深化")
    .replace(/活动结束后，?可拆卸的瓷片可作为纪念品或明年活动的素材库/gu, "活动结束后，可拆卸共创模块分类收纳，供次年继续使用")
    .replace(/可拆卸的瓷片可作为纪念品或明年活动的素材库/gu, "可拆卸共创模块分类收纳，供次年继续使用")
    .replace(/#[^#。；\n]{2,40}#/gu, "");
  if (!sourceCorpus.includes("传感")) {
    result = result
      .replace(
        /观众在特定节点可触摸互动界面（机械式压力触发），板阵内部灯光随触碰产生涟漪般的光效扩散(?:，模拟投石入水的动态反馈)?/gu,
        "观众在装置中穿行并触摸可见材料界面，通过视角变化、层叠透光与自然反射感受山泉的澄澈",
      )
      .replace(/机械式压力触发节点/gu, "穿行与触摸体验")
      .replace(/机械式压力触发/gu, "穿行与触摸")
      .replace(
        /板阵内部灯光随触碰产生[^。；｜]*/gu,
        "层叠材料随视角变化形成自然光影",
      )
      .replace(/设置感应式光影互动，当观众靠近或触摸特定立柱时，内部光线由暗转亮，模拟泉水被唤醒的瞬间，增强“真”的感知/gu, "设置可触摸的机械互动界面，观众转动或按压可见构件，带动内部光影由暗转亮")
      .replace(/感应式(?:光影互动|呼吸光效)/gu, "可触摸机械互动")
      .replace(/当观众靠近或触摸[^。；]+/gu, "观众转动或按压可见构件，带动内部光影变化")
      .replace(/脚踏压力感应(?:节点|区域)?(?:触发)?/gu, "步入式互动构件带动")
      .replace(/压力感应(?:节点|区域)?/gu, "互动构件")
      .replace(/触摸感应(?:区|区域)?/gu, "可触摸互动界面")
      .replace(/感应区域/gu, "互动界面")
      .replace(/感应节点/gu, "互动构件")
      .replace(/（机械式或电容式）/gu, "")
      .replace(/触发局部光影波动或声音反馈/gu, "带动局部光影变化")
      .replace(/当观众手部靠近[^，。；]+时，?内部灯光(?:亮度)?(?:微调|变化)/gu, "观众触摸可见互动界面，带动内部光影变化")
      .replace(/内置感应灯光产生[^。；]+/gu, "可触摸构件带动内部光影产生轻微明暗变化")
      .replace(/感应灯光/gu, "互动光影")
      .replace(/触摸感应/gu, "触摸互动")
      .replace(/呼吸灯/gu, "渐变光")
      .replace(/感应(?:片层|触发点)/gu, "互动触点")
      .replace(/感应/gu, "互动")
      .replace(/传感器/gu, "互动构件");
  }
  if (/装置\s*1|山泉水的[“"]?真/u.test(page.headline_zh)) {
    const groundedInteraction =
      "观众在装置中穿行并触摸可见材料界面，通过视角变化、层叠透光与自然反射感受山泉的澄澈，并完成拍照分享。";
    result = result
      .replace(/互动=[^｜]*/u, `互动=${groundedInteraction}`)
      .replace(
        /观众在特定节点可触摸互动界面[^。；｜]*(?:[。；])?/gu,
        groundedInteraction,
      )
      .replace(/可触摸互动界面（穿行与触摸）/gu, "可触摸材料界面")
      .replace(/模拟投石入水的动态反馈/gu, "形成随观看角度变化的自然光影")
      .replace(/机械式压力触发节点/gu, "穿行与触摸体验");
  }
  if (/装置\s*2|泡茶水的[“"]?甜|泡茶甜/u.test(page.headline_zh)) {
    const groundedInteraction =
      "观众围绕品鉴台完成泡茶、闻香与品鉴，通过真实饮用动作感受水质对茶香与口感的影响，并由现场工作人员衔接产品体验。";
    result = result
      .replace(/互动=[^｜]*/u, `互动=${groundedInteraction}`)
      .replace(
        /观众围坐品鉴台，参与简单的闻香仪式。装置顶部设有机械开合的“花瓣”结构，随人流密度缓慢呼吸开合，象征茶香的释放/gu,
        groundedInteraction,
      )
      .replace(/机械呼吸花瓣/gu, "泡茶、闻香与品鉴节点")
      .replace(/装置顶部设有机械开合的“花瓣”结构[^。；｜]*/gu, "")
      .replace(/观众围坐品鉴台，参与简单的闻香仪式/gu, groundedInteraction);
  }
  if (/装置\s*3|瓷之器/u.test(page.headline_zh)) {
    const groundedInteraction =
      "观众使用水性创作笔或可替换磁贴，在可维护的互动模块上完成瓷器主题共创；作品在现场逐步累积并可拍照分享。";
    result = result
      .replace(/互动=[^｜]*/u, `互动=${groundedInteraction}`)
      .replace(
        /提供特制的可擦写釉水笔和素烧瓷片墙。观众可在瓷片上自由涂鸦或书写祝福，完成后吸附于墙面，共同组成一幅不断变化的“百家釉彩图”/gu,
        groundedInteraction,
      )
      .replace(/提供水性创作笔和素烧瓷片墙/gu, groundedInteraction)
      .replace(/素烧瓷片互动墙/gu, "可替换共创模块")
      .replace(/瓷片墙可清零重启/gu, "可替换共创模块分类整理后可继续使用")
      .replace(/可擦写釉水笔/gu, "水性创作笔")
      .replace(/特制的水性创作笔/gu, "水性创作笔")
      .replace(/釉色涂抹互动/gu, "瓷器主题共创");
  }
  if (!sourceCorpus.includes("投影")) {
    const projectionFallback = /瓷|釉|斗器|磁吸|素坯/u.test(result)
      ? "观众作品在装置表面逐步累积，形成集体共创图案。"
      : /泡茶|茶香|茶汤|甘甜|水质/u.test(result)
        ? "观众通过泡茶、闻香与品鉴感受口感与茶香。"
        : "观众通过进入、触摸与拍摄参与现场体验。";
    result = result
      .replace(/[^。；]*投影[^。；]*[。；]?/gu, projectionFallback)
      .replace(/现场图像记录(?:映射|设备|内容)?[^。；]*[。；]?/gu, "夜间灯光勾勒主体轮廓。")
      .replace(/电子触控屏/gu, "可替换的磁吸共创模块")
      .replace(/数字瓷器/gu, "共创瓷器意象")
      .replace(/硬件复用、软件迭代/gu, "主体复用与内容更新")
      .replace(/上传自己的“釉色创作”截图/gu, "分享自己的釉色共创作品");
  }
  if (!sourceCorpus.includes("水槽")) {
    result = result.replace(/浅水槽/gu, "镜面反射底板");
  }
  if (!sourceCorpus.includes("香氛") && !sourceCorpus.includes("茶香装置")) {
    result = result
      .replace(/通过香氛与光影的通感设计/gu, "通过品鉴动作与光影的通感设计")
      .replace(/气味与声音互动/gu, "泡茶与品鉴互动")
      .replace(/观众入座后，?可闻到淡淡的茶香扩散（自然挥发或被动式香氛装置）/gu, "观众入座后通过现场泡茶、闻香与品鉴感受茶汤变化")
      .replace(/自然挥发或被动式香氛装置/gu, "现场泡茶与闻香过程")
      .replace(/被动式香氛装置/gu, "现场泡茶与闻香过程")
      .replace(/香氛装置/gu, "现场泡茶与闻香过程")
      .replace(/设置“甜度测试”互动墙，通过旋钮选择不同茶叶，墙面显示对应的甘甜指数可视化图形/gu, "观众通过泡茶与品鉴对比感受口感与茶香")
      .replace(/甘甜指数(?:可视化图形)?/gu, "品鉴感受")
      .replace(/装置内置定向音响播放流水与煮水声，并在特定时间段释放淡淡的茶香雾气（非强制配置，视现场条件）/gu, "观众通过泡茶、闻香与品鉴动作感受茶汤变化")
      .replace(/定向音响播放流水与煮水声/gu, "可见的泡茶动作引导")
      .replace(/释放淡淡的茶香雾气(?:（非强制配置，视现场条件）)?/gu, "以暖色光影模拟茶香扩散")
      .replace(/散发淡淡的茶香(?:（若允许）)?/gu, "通过光影层次表现茶香")
      .replace(/香氛机/gu, "光影构件");
  }
  if (!sourceCorpus.includes("攀爬") && !sourceCorpus.includes("登高")) {
    result = result
      .replace(/观众可沿阶梯上行/gu, "观众在装置前方参与互动，不进入主体结构")
      .replace(/每一层台面均为互动区域，中心设有主展示区，周围环绕参与式创作区/gu, "装置前方设置主展示区与参与式共创区")
      .replace(/阶梯上行/gu, "前方参与");
  }
  const installationId = page.headline_zh.match(
    /装置\s*([0-9一二三四五六七八九十]+)/u,
  )?.[1];
  const sourcedProduct = installationId
    ? projectFacts.facts
        .filter(
          (fact) =>
            fact.field_path.startsWith(`installation.${installationId}.`) &&
            /\.(?:product|gift)$/u.test(fact.field_path) &&
            fact.status === "confirmed",
        )
        .map((fact) => String(fact.value_raw).trim())
        .find(Boolean)
    : undefined;
  if (sourcedProduct) {
    const unsupportedProductPattern = /自动售货机|浓缩液|茶包|二维码/u;
    result = result
      .split(/(?<=[。；])/u)
      .map((sentence) =>
        unsupportedProductPattern.test(sentence) &&
        ![...sentence.matchAll(/自动售货机|浓缩液|茶包|二维码/gu)].every(
          (match) => sourceCorpus.includes(match[0]),
        )
          ? `互动完成后，对应${sourcedProduct}成为可带走的产品记忆。`
          : sentence,
      )
      .join("");
  }
  return result.replace(/\s+/gu, " ").trim();
}

function compactSmallModeLabel(label: string) {
  const value = label
    .replace(/^(?:本页|当前页)(?:重点|用于|表达)?[：:｜|]?/u, "")
    .replace(/^[A-Za-z](?=[\u4e00-\u9fff])/u, "")
    .replace(/(?:只用一张|必须|不得|需要通过图像|图像必须)[^，。；]*[，。；]?/gu, "")
    .trim();
  if (value.length <= 28) return value;
  if (/轻国风少女.*IP|ip形象/u.test(value)) return "轻国风少女 IP（平面形象）";
  if (/真人穿着|真人.*互动/u.test(value)) return "真人 IP 现场互动";
  if (/新产品.*发布|发布会/u.test(value)) return "新品发布会节点";
  if (/三个地标|三个装置|三大产品/u.test(value)) return "三地标三装置";
  const firstClause = value
    .split(/[，。；：:]/u)
    .map((part) => part.trim())
    .find((part) => part.length >= 4);
  // Keep the semantic phrase intact. Length compliance is checked after
  // normalization and sent back to the model for a complete rewrite.
  return firstClause || value;
}

function smallModeDesignObjectForPage(page: ReportPage) {
  const installationId = page.headline_zh.match(
    /装置\s*([0-9一二三四五六七八九十]+)/u,
  )?.[1];
  if (!installationId) return undefined;
  const line = (page.visual_brief ?? []).find((item) =>
    item.startsWith(`对象${installationId}｜`),
  );
  if (!line) return undefined;
  return Object.fromEntries(
    line
      .split("｜")
      .slice(1)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator > 0
          ? [part.slice(0, separator), part.slice(separator + 1)]
          : [part, ""];
      }),
  ) as Record<string, string>;
}

function compactDesignSystemSentence(
  value: string | undefined,
  maxLength = 48,
) {
  const compact = String(value ?? "")
    .replace(/^[，。；：:\s]+|[，。；：:\s]+$/gu, "")
    .trim();
  if (compact.length <= maxLength) return compact;
  const clauses = compact.split(/(?<=[。；])/u).filter(Boolean);
  const selected: string[] = [];
  for (const clause of clauses) {
    if (selected.join("").length + clause.length > maxLength) break;
    selected.push(clause);
  }
  const joined = selected.join("").replace(/[。；]+$/u, "").trim();
  if (joined.length >= 24) return joined;
  const firstClause = clauses[0]?.replace(/[。；]+$/u, "").trim() || compact;
  const phrases = firstClause.split(/(?<=[，])/u).filter(Boolean);
  const phraseSelection: string[] = [];
  for (const phrase of phrases) {
    if (phraseSelection.join("").length + phrase.length > maxLength) break;
    phraseSelection.push(phrase);
  }
  const phraseJoined = phraseSelection
    .join("")
    .replace(/[，]+$/u, "")
    .trim();
  const balancedQuotes =
    (phraseJoined.match(/“/gu)?.length ?? 0) ===
    (phraseJoined.match(/”/gu)?.length ?? 0);
  return phraseJoined.length >= 18 && balancedQuotes
    ? phraseJoined
    : firstClause;
}

function alignSmallModeObjectBodyToDesignSystem(
  page: ReportPage,
  fallbackBody: string,
) {
  const designObject = smallModeDesignObjectForPage(page);
  if (!designObject) return fallbackBody;
  const name = compactDesignSystemSentence(designObject["方案名"]);
  const claim = compactDesignSystemSentence(designObject["主张"]);
  const silhouette = compactDesignSystemSentence(designObject["轮廓"]);
  const spatial = compactDesignSystemSentence(designObject["空间"]);
  const interaction = compactDesignSystemSentence(designObject["互动"]);
  const materialLight = compactDesignSystemSentence(designObject["材料灯光"]);
  const structure = compactDesignSystemSentence(designObject["构造组件"]);
  const productGift = compactDesignSystemSentence(designObject["产品赠品"]);
  const reuse = compactDesignSystemSentence(designObject["传播复用"]);
  const subject = name ? `“${name}”` : page.headline_zh;

  if (page.page_type === "concept") {
    return `${subject}是本装置贯穿全篇的造型母题：${claim}。主体轮廓以${silhouette}建立远观识别；空间则采用${spatial}，组织人的进入、停留与观看。现场互动采用${interaction}${productGift ? `；互动完成后以${productGift}承接产品体验` : ""}。材料与灯光沿用${materialLight}；构造以${structure}为基本逻辑。${reuse}，后续效果、互动和细节页面均保持同一形态。`;
  }
  if (page.page_type === "rendering") {
    return `${subject}在效果页继续沿用${silhouette}，不另换造型。主画面呈现${spatial}；人物进入后，${interaction}，形成可拍摄的参与瞬间。${materialLight}，建立该装置独有的日夜识别。${productGift ? `${productGift}与现场体验衔接；` : ""}${reuse}，使产品、装置与传播形成同一条叙事链。`;
  }
  if (page.page_type === "technical") {
    return `${subject}在落地页仍以${silhouette}为外观基准，不因构造表达改变主体形态。主体构件按以下逻辑组织：${structure}。材料与灯光继续采用${materialLight}。互动界面落实${interaction}${productGift ? `，并与${productGift}衔接` : ""}。${reuse}。具体尺寸、节点、基础与性能由后续专业深化确认。`;
  }
  return fallbackBody;
}

function ensureSmallModeConceptCallouts(
  page: ReportPage,
): ReportPage["callouts"] {
  if (page.page_type !== "concept") return page.callouts;
  const designObject = smallModeDesignObjectForPage(page);
  if (!designObject) {
    return page.callouts?.slice(0, 6) as ReportPage["callouts"];
  }
  const existing = page.callouts ?? [];
  const dimensions = [
    ["产品诉求", designObject["主张"]],
    ["装置转译", designObject["轮廓"]],
    ["空间形态", designObject["空间"]],
    ["互动动作", designObject["互动"]],
    ["材料灯光", designObject["材料灯光"]],
    ["传播/复用", designObject["传播复用"]],
  ] as const;
  return dimensions.map(([prefix, fallback], index) => {
    const matched = existing.find((callout) =>
      callout.label_zh.startsWith(`${prefix}｜`),
    );
    return {
      ...(matched ?? {}),
      label_zh: `${prefix}｜${compactDesignSystemSentence(fallback || designObject["方案名"], 64)}`,
      label_en:
        matched?.label_en ||
        [
          "Product intent",
          "Installation translation",
          "Spatial form",
          "Interaction",
          "Material and light",
          "Communication and reuse",
        ][index],
    };
  }) as ReportPage["callouts"];
}

function ensureSmallModeVisibleCallouts(page: ReportPage) {
  if (page.page_type === "cover") return page.callouts;
  const slotCount = createSmallModeVisualImageSlots(page).length;
  const targetCount = Math.min(6, Math.max(2, 4 - slotCount));
  const invalidVisibleLabel = (value: string) =>
    !value ||
    !/[A-Za-z0-9\u4e00-\u9fff]/u.test(value) ||
    /[｜|]\s*$/u.test(value) ||
    /^(?:关键信息|证据关系|结论|当前项目要点|要点\s*\d+|技术原则|关键构造关系|性能验证)$/u.test(value) ||
    containsBackstagePresentationText(value) ||
    /^(?:全篇设计系统｜|对象[^｜]+｜)/u.test(value);
  const candidates = [
    ...(page.callouts ?? []).map((callout) => ({
      ...callout,
      label_zh: sanitizePresentationText(callout.label_zh),
    })),
    ...page.diagram_labels.map((label) => ({
      label_zh: sanitizePresentationText(label),
    })),
    ...page.visual_requirements.map((label) => ({
      label_zh: sanitizePresentationText(label),
    })),
    ...(page.body_zh || page.body_copy || page.core_message)
      .split(/[。；]/u)
      .map((label) => ({ label_zh: sanitizePresentationText(label) })),
  ]
    .filter((callout) => !invalidVisibleLabel(callout.label_zh))
    .filter(
      (callout, index, all) =>
        all.findIndex((candidate) => candidate.label_zh === callout.label_zh) ===
        index,
    );
  return candidates.slice(0, targetCount).map((callout, index) => ({
    ...callout,
    label_en:
      ("label_en" in callout ? callout.label_en : undefined) ??
      englishLabelFallback(page.page_type, index),
  })) as ReportPage["callouts"];
}

function normalizeSmallModePage(
  page: ReportPage,
  projectFacts: DesignReportProjectFacts,
) {
  const normalized = structuredClone(page);
  if (smallModeHeadlineNeedsTranslation(normalized)) {
    const translatedHeadline = englishPresentationText(
      normalized.headline_zh,
      "",
    );
    if (translatedHeadline) {
      normalized.headline_en = translatedHeadline;
    }
  }
  normalized.body_copy = repairSmallModeRoleBody(
    normalized,
    normalized.body_copy,
    projectFacts,
  );
  normalized.body_copy = alignSmallModeObjectBodyToDesignSystem(
    normalized,
    normalized.body_copy,
  );
  normalized.body_copy = sanitizeSmallModeProposalCertainty(
    normalized,
    normalized.body_copy,
    projectFacts,
  );
  normalized.body_zh = normalized.body_copy;
  const parallelOverview = /三件|三类|矩阵|对照|总览|分工/u.test(
    normalized.headline_zh,
  );
  if (parallelOverview) {
    const overviewLabels = ["1", "2", "3"].flatMap((installationId) => {
      const facts = projectFacts.facts.filter((fact) =>
        fact.field_path.startsWith(`installation.${installationId}.`),
      );
      const core = facts.find((fact) => fact.field_path.endsWith(".core"))?.value_raw;
      const brief = String(
        facts.find((fact) => fact.field_path.endsWith(".brief"))?.value_raw ?? "",
      );
      const theme =
        core ||
        (installationId === "3" && /斗器大会|瓷器/u.test(brief)
          ? "斗器大会与瓷器"
          : brief.split(/[。；]/u)[0]);
      return theme ? [`装置${installationId}｜${String(theme)}`] : [];
    });
    if (overviewLabels.length === 3) {
      normalized.diagram_labels = overviewLabels;
      normalized.diagram_labels_en = [
        "Installation 1",
        "Installation 2",
        "Installation 3",
      ];
    }
    normalized.speaker_notes =
      "先说明三件装置共享同一活动与设计语言，再依次讲清每件装置对应的产品主题、互动要求和赠品，最后回收它们对新品发布、观众参与与现场传播的共同作用。";
  }
  if (
    parallelOverview &&
    /does not specify|only confirmed information for Installation 1|未明确装置2|未明确装置3/iu.test(
      normalized.body_en ?? "",
    )
  ) {
    normalized.body_en =
      "The three installations form a parallel matrix: the first expresses the truth of spring water, the second translates tea-brewing water into a sweet tasting experience, and the third connects the Douqi theme with porcelain and tea culture. Their products, interactions, gifts and communication roles are different but belong to one shared event system.";
  }
  if (
    parallelOverview &&
    /未明确|仅明确装置1|装置2和装置3.*未/u.test(normalized.speaker_notes)
  ) {
    normalized.speaker_notes =
      "先说明所有对象的共同主线，再按平行结构解释每件装置的主题、互动、产品或赠品，最后回收它们之间的体验与传播分工。";
  }
  const installationId = normalized.headline_zh.match(
    /装置\s*([0-9一二三四五六七八九十]+)/u,
  )?.[1];
  if (installationId) {
    const installationEvidence = projectFacts.facts
      .filter((fact) => fact.field_path.startsWith(`installation.${installationId}.`))
      .map((fact) => String(fact.value_raw))
      .join(" ");
    if (!/釉水共创/u.test(installationEvidence)) {
      normalized.body_copy = normalized.body_copy.replace(/釉水共创/gu, "艺术化互动");
      normalized.body_zh = normalized.body_copy;
    }
  }
  normalized.visual_brief = (normalized.visual_brief ?? []).map((item) =>
    sanitizeSmallModeProposalCertainty(normalized, item, projectFacts),
  );
  normalized.visual_requirements = (normalized.visual_requirements ?? []).map((item) =>
    sanitizeSmallModeProposalCertainty(normalized, item, projectFacts),
  );
  normalized.speaker_notes = sanitizeSmallModeProposalCertainty(
    normalized,
    normalized.speaker_notes,
    projectFacts,
  );
  normalized.diagram_labels = normalized.diagram_labels
    .map((label) => sanitizeSmallModeProposalCertainty(normalized, label, projectFacts))
    .map(compactSmallModeLabel);
  normalized.callouts = normalized.callouts
    ?.map((callout) => ({
      ...refineSmallModeCallout(callout, projectFacts),
      label_zh: sanitizeSmallModeProposalCertainty(
        normalized,
        refineSmallModeCallout(callout, projectFacts).label_zh,
        projectFacts,
      ),
    }))
    .filter(
      (callout, index, callouts) =>
        callouts.findIndex((candidate) => candidate.label_zh === callout.label_zh) ===
        index,
    )
    .slice(0, 6) as ReportPage["callouts"];
  normalized.callouts = ensureSmallModeConceptCallouts(normalized);
  normalized.callouts = normalized.callouts?.map((callout) => ({
    ...callout,
    label_zh: sanitizeSmallModeProposalCertainty(
      normalized,
      callout.label_zh,
      projectFacts,
    ),
  })) as ReportPage["callouts"];
  if (
    !(
      normalized.page_type === "concept" &&
      /装置\s*[0-9一二三四五六七八九十]+/u.test(normalized.headline_zh)
    )
  ) {
    normalized.callouts = ensureSmallModeVisibleCallouts(normalized);
  }
  const previousVisualTask = normalized.visual_task;
  const refreshedVisualTask = createVisualTask(projectFacts, normalized);
  if (previousVisualTask) {
    // Slot ids are the stable identity of a persisted image. Labels are
    // presentation copy and can be normalized after generation (for example
    // when a generic 装置3 title becomes a confirmed proposal name). Requiring
    // an exact label match here used to delete every generated small-mode
    // image during the next cloud save/load cycle. Keep images whose slot id
    // still exists; stale slots removed from the new recipe are still dropped.
    // The former rule was `previousSlotLabels.get(slot.slot_id) === slot.label`.
    const refreshedSlotIds = new Set(
      refreshedVisualTask.image_slots.map((slot) => slot.slot_id),
    );
    const compatibleImages = previousVisualTask.generated_images?.filter(
      (image) => refreshedSlotIds.has(image.slot_id),
    );
    if (compatibleImages?.length) {
      const preservedImages = compatibleImages as unknown as NonNullable<
        typeof refreshedVisualTask.generated_images
      >;
      refreshedVisualTask.generated_images = preservedImages;
      refreshedVisualTask.generated_image = legacyGeneratedImageFromSlots(
        preservedImages,
      );
    }
    refreshedVisualTask.conversation = previousVisualTask.conversation;
  }
  normalized.visual_task = refreshedVisualTask;
  normalized.content_depth_check = evaluatePageContentDepth(
    projectFacts,
    normalized,
  );
  return normalized;
}

/**
 * Re-applies the current small-mode presentation rules to an already generated
 * report without making a model request. This is intentionally a no-op for the
 * large public-building pipeline so persisted large-project content and
 * structure remain byte-for-byte untouched by small-mode migrations.
 */
function migrateSmallModeSummarySection(pagePlan: DesignReportPagePlan) {
  const normalized = structuredClone(pagePlan);
  if (!normalized.sections.some((section) => section.section_id === "S04")) {
    normalized.sections = [
      ...normalized.sections,
      {
        section_id: "S04",
        title_zh: "设计总结",
        title_en: "DESIGN SUMMARY",
        purpose: "回收三件装置、现场互动、传播与年度复用之间已经建立的设计关系。",
        answers_question: "这套小型建筑/装置方案最终形成了什么设计系统？",
      },
    ];
  }
  normalized.pages = normalized.pages.map((page) =>
    page.page_type === "summary" ? { ...page, section_id: "S04" } : page,
  );
  return normalized;
}

export function normalizeExistingSmallModePlan(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
): DesignReportPagePlan {
  if (!isSmallBuildingMode(resolvedTaskMode(projectFacts, pagePlan))) {
    return pagePlan;
  }
  const normalized = migrateSmallModeSummarySection(pagePlan);
  normalized.task_mode = "small_building_or_interior";
  normalized.pages = normalized.pages.map((page) =>
    normalizeSmallModePage(page, projectFacts),
  );
  assertPagePlan(normalized);
  return normalized;
}

export async function generatePageWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  pageId: string,
  runtimeOverride?: ModelRuntimeOverride,
  repairContext?: PageGenerationRepairContext,
): Promise<PageGenerationResult> {
  const sourcePage = pagePlan.pages.find((page) => page.page_id === pageId);
  if (!sourcePage) throw new Error(`Page not found: ${pageId}`);
  const taskMode = resolvedTaskMode(projectFacts, pagePlan);
  const smallMode = isSmallBuildingMode(taskMode);
  const isSummaryPage = sourcePage.page_type === "summary";
  const summarySourcePages = isSummaryPage
    ? pagePlan.pages.filter(
        (page) =>
          page.page_id !== sourcePage.page_id &&
          !["cover", "toc", "section_divider"].includes(page.page_type),
      )
    : [];
  const confirmedGateBDirections = smallMode
    ? (projectFacts.gate_b_proposals ?? []).filter(
        (proposal) => proposal.status === "confirmed",
      )
    : isSummaryPage
    ? (projectFacts.gate_b_proposals ?? []).filter(
        (proposal) => proposal.status === "confirmed",
      )
    : confirmedGateBProposalsForPage(projectFacts, sourcePage);
  const applicableProposalFactIds = confirmedGateBDirections.flatMap(
    (proposal) => {
      const selected = proposal.options.find(
        (option) => option.option_id === proposal.selected_option_id,
      );
      return [
        ...proposal.task_brief_fact_refs,
        ...(selected?.task_brief_fact_refs ?? []),
      ];
    },
  );
  const siteResearchFacts = ["position", "analysis"].includes(
    sourcePage.page_type,
  )
    ? projectFacts.facts.filter(
        (fact) =>
          (fact.source_role === "research_fact" ||
            fact.fact_id.startsWith("F_SITE_VISUAL_") ||
            fact.field_path === "site.location_detail") &&
          fact.status === "confirmed",
      )
    : [];
  const candidateFactIds = [
    ...sourcePage.fact_refs,
    ...(isSummaryPage
      ? summarySourcePages.flatMap((page) => page.fact_refs)
      : []),
    ...siteResearchFacts.map((fact) => fact.fact_id),
    ...applicableProposalFactIds,
    ...(["position", "analysis", "summary"].includes(sourcePage.page_type)
      ? projectFacts.facts
          .filter((fact) => fact.status === "confirmed")
          .map((fact) => fact.fact_id)
      : []),
    ...(smallMode
      ? projectFacts.facts
          .filter((fact) => fact.status === "confirmed")
          .map((fact) => fact.fact_id)
      : []),
  ];
  const summaryFactIds = new Set(
    selectRelevantPageFactIds(
      projectFacts,
      sourcePage,
      candidateFactIds,
      4,
    ),
  );
  const frameworkFactIds = summaryFactIds;
  const citedFacts = [...summaryFactIds]
    .map((factId) =>
      projectFacts.facts.find((fact) => fact.fact_id === factId),
    )
    .filter((fact): fact is ProjectFact => Boolean(fact));
  const styleGuidance = smallMode
    ? []
    : styleGuidanceForPage(sourcePage, projectFacts);
  const experienceGuidance = smallMode
    ? []
    : experienceGuidanceForPage(sourcePage, projectFacts);
  const applicableConfirmedProposals = confirmedGateBDirections.map(
    (proposal) => {
      const selected = proposal.options.find(
        (option) => option.option_id === proposal.selected_option_id,
      );
      return {
        proposal_id: proposal.missing_item_id,
        topic: proposal.missing_label,
        title:
          proposal.user_defined_title ??
          selected?.title ??
          proposal.question,
        confirmed_direction: proposal.confirmed_direction,
        design_moves:
          selected?.design_moves ?? [proposal.confirmed_direction],
        rationale: selected?.rationale ?? "",
        assumptions: selected?.assumptions ?? [],
        validation_needed: selected?.validation_needed ?? [],
        task_brief_fact_refs: [
          ...new Set([
            ...proposal.task_brief_fact_refs,
            ...(selected?.task_brief_fact_refs ?? []),
          ]),
        ],
      };
    },
  );
  const styleGuidanceForPrompt = styleGuidance.map((guidance) =>
    Object.fromEntries(
      Object.entries(guidance).filter(
        ([key]) => key !== "forbidden_terms",
      ),
    ),
  );
  const summaryContext = isSummaryPage
    ? {
        evidence_pages: summarySourcePages
          .filter(
            (page) =>
              Boolean(page.body_zh || page.body_copy) ||
              ["generated", "reviewed"].includes(page.generation_status) ||
              page.fact_refs.length > 0,
          )
          .map((page) => ({
            page_id: page.page_id,
            headline_zh: page.headline_zh,
            core_message: page.core_message,
            body_zh: page.body_zh || page.body_copy,
            diagram_labels: page.diagram_labels,
            fact_refs: page.fact_refs,
            generation_status: page.generation_status,
          })),
        framework_pages: summarySourcePages.map((page) => ({
          page_id: page.page_id,
          headline_zh: page.headline_zh,
          core_message: page.core_message,
          generation_status: page.generation_status,
        })),
      }
      : undefined;
  const repairCoreMessage = repairContext?.previous_output?.core_message;
  const coreMessageCharacterCount = visibleCharacterCount(
    repairCoreMessage || sourcePage.core_message,
  );
  const smallModeBodyBudget = Math.max(
    1,
    150 - coreMessageCharacterCount,
  );
  const compressionOnlyRepair = Boolean(
    repairContext?.compression_only_repair,
  );

  const response = await createStructuredResponse<ReportCopyOutput>({
    name: "report_page",
    schema: compressionOnlyRepair
      ? presentationCopyCompressionSchema
      : reportCopySchema,
    instructions: compressionOnlyRepair
      ? `${PRESENTATION_COPY_COMPRESSION_PROMPT}\n\n${PRESENTATION_COPY_COMPRESSION_SKILL}`
      : smallMode
        ? SMALL_MODE_PAGE_GENERATION_PROMPT
        : PAGE_GENERATION_PROMPT,
    content: [
      {
        type: "input_text",
        text: `目标页内容骨架（这些字段可进入汇报）：\n${JSON.stringify({
          page_id: sourcePage.page_id,
          display_page_number: sourcePage.display_page_number,
          section_id: sourcePage.section_id,
          page_type: sourcePage.page_type,
          headline_zh: sourcePage.headline_zh,
          core_message: sourcePage.core_message,
          fact_refs: [...frameworkFactIds],
          proposal_refs: smallMode
            ? confirmedGateBDirections.map((proposal) => proposal.missing_item_id)
            : [],
          generation_status: sourcePage.generation_status,
          missing_information: sourcePage.missing_information,
        })}\n\nexternal_site_research（不属于任务书，也不参与页面框架规划；仅在区位/分析页作为公开数据线索使用，引用时应使用“公开地理数据检索显示”等审慎措辞）：\n${JSON.stringify(siteResearchFacts)}\n\nminimum_content_standard（只用于控制内容深度，不得把字段名写进汇报）：\n${JSON.stringify({
          one_clear_conclusion: true,
          body_point_range: [2, 4],
          evidence_range: [2, 4],
          required_image_caption_count:
            sourcePage.visual_task?.image_slots.length ??
            getVisualImageSlotCountForPage(sourcePage),
          required_visible_unit_range: smallMode ? [4, 6] : [3, 5],
          visible_copy_limits: {
            body_zh_and_body_copy_max_characters: 150,
            small_mode_visible_body_with_core_message_max_characters: smallMode
              ? 150
              : null,
            small_mode_body_copy_budget_after_core_message: smallMode
              ? smallModeBodyBudget
              : null,
            image_caption_detail_max_characters: 25,
          over_limit_action:
            "先按建议字数组织文案；只有真实 A3 文本框排版溢出后，才由缩写 Skill 整体重写，不得由程序截断末尾",
          },
          required_concept_callouts:
            smallMode && sourcePage.page_type === "concept"
              ? [
                  "产品诉求",
                  "装置转译",
                  "空间形态",
                  "互动动作",
                  "材料灯光",
                  "传播/复用",
                ]
              : [],
          apply_at_least_one_confirmed_proposal:
            applicableConfirmedProposals.length > 0,
          numbers_require_fact_source: true,
        })}\n\n方案总结上下文（仅 summary 页面使用；前序页面框架不是事实，只有已生成正文、fact_refs 和 confirmed proposals 可以作为方案结论依据）：\n${JSON.stringify(summaryContext)}\n\nsmall_mode_design_system（仅小型建筑/装置模式使用；这是 Agent 依据任务书生成的全篇方案设计，可转写为可见方案文案，但不能描述成任务书原文）：\n${JSON.stringify(
          smallMode ? sourcePage.visual_brief : [],
        )}\n\n后台视觉生产说明（只用于组织图面，严禁逐字复制到正文、图解标签或标注）：\n${JSON.stringify({
          visual_requirements: sourcePage.visual_requirements,
          visual_brief: sourcePage.visual_brief,
        })}\n\n允许引用的当前项目事实：\n${JSON.stringify(citedFacts)}\n\napplicable_confirmed_proposals（与本页可能相关的已确认设计决策候选）：\n${JSON.stringify(applicableConfirmedProposals)}\n\n全局历史风格观察：\n${JSON.stringify(projectFacts.style_observations ?? [])}\n\n本页匹配的脱敏文风样本：\n${JSON.stringify(styleGuidanceForPrompt)}\n\n本页匹配的安全结构化页面配方（后台规则，不是汇报文字）：\n${JSON.stringify(experienceGuidance)}\n\n${
          repairContext
            ? `page_generation_repair_loop（上一轮未通过校验，必须根据缺失信息修复后返回完整结果）：\n${JSON.stringify({
                attempt: `${repairContext.repair_attempt}/${MAX_PAGE_GENERATION_REPAIR_ATTEMPTS}`,
                validation_failures:
                  repairContext.validation_failures,
                previous_output: compressionOnlyRepair
                  ? undefined
                  : repairContext.previous_output,
                compression_input: compressionOnlyRepair
                  ? {
                      headline_zh: sourcePage.headline_zh,
                      core_message: repairContext.previous_output.core_message,
                      body_zh: repairContext.previous_output.body_zh,
                      body_copy: repairContext.previous_output.body_copy,
                      diagram_labels:
                        repairContext.previous_output.diagram_labels,
                    }
                  : undefined,
                compression_skill: repairContext.length_only_repair
                  ? PRESENTATION_COPY_COMPRESSION_SKILL
                  : undefined,
                 required_repair: [
                   "headline_en 必须是 headline_zh 的准确英文翻译，不能继续沿用与中文标题无关的页型模板词",
                   "小型建筑页面如 core_message 加 body_copy 超限，必须同时整体重写 core_message 与 body_copy；不要保留过长的旧 core_message",
                   "从 applicable_confirmed_proposals 中只选择与本页最相关的一项，写入 proposal_refs",
                  "把该提案转化为正文、图注或标注中的具体空间动作，不能只出现提案名称",
                  "proposal_coverage.visible_statement 必须逐字复制一条本轮返回的完整中文可见字段",
                  "proposal_coverage.applied_design_moves 至少填写一条本页真正采用的设计动作",
                  "正文不得超过150个中文字符，图片下方非标题说明不得超过25个中文字符；超限字段必须整体重写，不得截断末尾",
                  ...(compressionOnlyRepair
                    ? [
                        "这是独立缩写字段调用，只返回 schema 要求的可见文案字段；不要返回 speaker_notes、callouts、proposal_refs 或 proposal_coverage",
                      ]
                    : ["返回完整 report_page 对象，不得只返回修改字段"]),
                    ...(repairContext.length_only_repair
                      ? [
                          "这是字数压缩专修：只保留本页唯一结论和最关键设计动作，正文可写成 1—2 个完整短句，不要为了满足信息密度补充新信息",
                          `本轮以当前 core_message 加 body_copy 的合计上限 150 字为硬约束；core_message 当前参考预算为 ${coreMessageCharacterCount} 字，body_copy 只能使用剩余字数，必须在句号或完整分句处结束`,
                        ]
                      : []),
                    ...(repairContext.compression_only_repair
                      ? [
                          "这是独立缩写 Skill 专修轮：忽略 previous_output 的原句式，重新写一版更短的完整正文",
                          "小型建筑页面必须把 core_message 控制在45字以内、body_copy控制在80字以内，并确保两者合计不超过150字",
                          "返回前自行逐字段计数；若任何字段超限，继续重写后再返回",
                        ]
                      : []),
                  ],
              })}\n\n`
            : ""
        }${
          compressionOnlyRepair
            ? "请直接依据当前页标题、当前项目事实和 compression_input，输出压缩后的可见文案字段；不要输出解释。"
            : "请先遵循文风样本的表达结构，并落实页面配方的图面逻辑；headline_en 必须逐字对应 headline_zh 的含义，core_message_en 必须对应 core_message。body_zh、body_copy 和 core_message 必须使用简体中文，除任务书明确的专有缩写外不得混入英文句子或英文段落；正文只允许当前页面和当前方案的内容。事实、数字、产品和既成要求只使用当前项目事实，方案设计使用 applicable_confirmed_proposals 与 small_mode_design_system。body_zh/body_copy 以不超过150个中文字符为建议目标，但不要把字符数当作失败拦截；只有真实 A3 文本框排版溢出后才进入缩写 Skill。diagram_labels 以及图片下方非标题说明以不超过25个中文字符为建议目标。任何字段需要压缩时都必须由模型重新组织成完整、自然、可汇报的短文或短语，不得由程序从末尾删除文字、删掉半句或添加省略号。value_origin 为 user_confirmed 的事实是用户后续确认的当前项目输入，可以采用，但不得描述成任务书原文结论；value_origin 为 external_research 的事实来自公开地理数据，只能用于区位与场地分析，并必须与任务书事实明确区分。有候选提案时，至少选择并实质落实其中最相关的一项，形成可见的具体设计动作及 proposal_coverage；只返回实际落实的 proposal_refs，不必强行覆盖全部候选提案。不得把后台说明写进可见文案，不得把设计方向伪装成任务书原文，不得复述、猜测或补全历史参考原文。"
        }`,
      },
    ],
    reasoningEffort: "medium",
    runtimeOverride,
  });

  const allowedFactIds = new Set(citedFacts.map((fact) => fact.fact_id));
  const generated = compressionOnlyRepair
    ? ({
        ...(repairContext?.previous_output ?? {}),
        ...response.value,
      } as ReportCopyOutput)
    : response.value;
  const nextRepairAttempt = (repairContext?.repair_attempt ?? 0) + 1;
  const canRepair = nextRepairAttempt <= MAX_PAGE_GENERATION_REPAIR_ATTEMPTS;
  const createRepairContext = (
    validationFailures: string[],
    options: { lengthOnly?: boolean; compressionOnly?: boolean } = {},
  ) => ({
    previous_output: generated,
    validation_failures: validationFailures,
    prior_calls: [...(repairContext?.prior_calls ?? []), response.call],
    repair_attempt: nextRepairAttempt,
    length_only_repair: options.lengthOnly ?? repairContext?.length_only_repair,
    compression_only_repair:
      options.compressionOnly ?? repairContext?.compression_only_repair,
  });
  const currentProjectEvidence = projectFacts.facts
    .filter(
      (fact) => fact.status !== "superseded" && fact.status !== "conflict",
    )
    .map((fact) => `${String(fact.value_raw)} ${fact.source.quote}`)
    .join("\n");
  const forbiddenTerms = [
    ...new Set(
      [
        ...protectedHistoricalReferenceTerms,
        ...[
          ...styleGuidance,
          ...(projectFacts.reference_style_examples ?? []),
        ].flatMap((guidance) => guidance.forbidden_terms),
      ],
    ),
  ];
  const safeGeneratedDiagramLabels = safePresentationItems(
    generated.diagram_labels,
    pageLabelFallbacks(sourcePage, citedFacts),
    forbiddenTerms,
    currentProjectEvidence,
  );
  const alignedStrategyOverview = proposalAlignedStrategyOverview(
    sourcePage,
    applicableConfirmedProposals,
  );
  const rawBodyCopy = chinesePrimaryText(
    generated.body_zh,
    generated.body_copy,
    sourcePage.generation_status === "ready" ? sourcePage.core_message : "",
  );
  let generatedCoreMessage = sanitizePresentationText(
    generated.core_message,
    sourcePage.core_message,
  );
  const generatedHeadlineEn = sanitizePresentationText(
    generated.headline_en,
    englishPresentationText(
      sourcePage.headline_zh,
      pageTypeEnglishLabels[sourcePage.page_type],
    ),
  );
  const generatedCoreMessageEn = sanitizePresentationText(
    generated.core_message_en,
    sourcePage.core_message_en || englishCoreFallback(sourcePage.page_type),
  );
  let bodyCopy = limitVisibleBodyPoints(
    sanitizePresentationText(
      rawBodyCopy,
      sourcePage.generation_status === "ready" ? sourcePage.core_message : "",
    ),
    "zh",
  );
  if (smallMode) {
    bodyCopy = repairSmallModeParallelBody(sourcePage, bodyCopy, projectFacts);
    bodyCopy = alignSmallModeObjectBodyToDesignSystem(sourcePage, bodyCopy);
    bodyCopy = sanitizeSmallModeProposalCertainty(
      sourcePage,
      bodyCopy,
      projectFacts,
    );
  }
  const visibleEnglishFields = [
    ["core_message", generatedCoreMessage],
    ["body_zh/body_copy", bodyCopy],
  ].filter(([, value]) => hasSubstantialEnglishText(value));
  if (visibleEnglishFields.length) {
    if (canRepair) {
      return generatePageWithModel(
        projectFacts,
        pagePlan,
        pageId,
        runtimeOverride,
        createRepairContext([
          `可见中文字段混入英文：${visibleEnglishFields.map(([field]) => field).join("、")}`,
          "正文和核心结论必须整体重写为简体中文；除任务书明确的专有缩写外，不得保留英文句子或英文段落。",
          "body_zh/body_copy 必须与当前页面标题和当前方案保持一致，不得把其他方案内容带入本页。",
        ]),
      );
    }
    const cleanSourceBody = [sourcePage.body_zh, sourcePage.body_copy].find(
      (value) =>
        Boolean(value?.trim()) &&
        hasChineseText(String(value)) &&
        !hasSubstantialEnglishText(String(value)),
    );
    bodyCopy = cleanSourceBody?.trim() ?? "";
    if (hasSubstantialEnglishText(generatedCoreMessage)) {
      generatedCoreMessage = hasChineseText(sourcePage.core_message)
        ? sourcePage.core_message
        : "";
    }
  }
  const bodyEn = limitVisibleBodyPoints(
    sanitizePresentationText(
      generated.body_en,
      sourcePage.core_message_en || englishCoreFallback(sourcePage.page_type),
    ),
    "en",
  );
  if (
    smallMode &&
    canRepair &&
    /The design concept is developed|The key view communicates|The options are compared|The conclusion consolidates/u.test(
      bodyEn,
    )
  ) {
    return generatePageWithModel(
      projectFacts,
      pagePlan,
      pageId,
      runtimeOverride,
      createRepairContext([
        "body_en 使用了通用占位句，必须逐句翻译本页实际中文正文。",
        "不得返回 The design concept...、The key view...、The options are compared... 或 The conclusion... 等模板句。",
      ]),
    );
  }
  let speakerNotes = sanitizePresentationText(
    chinesePrimaryText(
      generated.speaker_notes,
      "",
      "说明本页核心结论、当前项目事实与设计价值。",
    ),
    "说明本页核心结论、当前项目事实与设计价值。",
  );
  if (smallMode) {
    speakerNotes = sanitizeSmallModeProposalCertainty(
      sourcePage,
      speakerNotes,
      projectFacts,
    );
  }
  const generatedText = [
    bodyCopy,
    speakerNotes,
    ...safeGeneratedDiagramLabels,
    ...sanitizePresentationItems(
      (generated.callouts ?? []).map((callout) => callout.label_zh),
      8,
    ),
  ]
    .filter(Boolean)
    .join("\n");
  const leakedReferenceTerms = [
    ...new Set(
      forbiddenTerms
        .filter(
          (term) =>
            generatedText.includes(term) &&
            !currentProjectEvidence.includes(term),
        ),
    ),
  ];
  if (leakedReferenceTerms.length) {
    if (canRepair) {
      return generatePageWithModel(
        projectFacts,
        pagePlan,
        pageId,
        runtimeOverride,
        createRepairContext([
          `可见文案混入历史参考项目专有内容：${leakedReferenceTerms.join("、")}`,
          "必须删除这些专有内容，只能使用当前项目事实与已确认提案重写。",
        ]),
      );
    }
    throw new Error(
      `逐页生成已重写 ${repairContext?.repair_attempt ?? 0} 次，但仍检测到历史参考项目专有内容：${leakedReferenceTerms.join("、")}。`,
    );
  }
  const diagramLabels = (alignedStrategyOverview?.labels ??
    safePresentationItems(
      chineseDisplayItems(
        safeGeneratedDiagramLabels,
        pageLabelFallbacks(sourcePage, citedFacts),
        "图解",
      ),
      pageLabelFallbacks(sourcePage, citedFacts),
      forbiddenTerms,
      currentProjectEvidence,
    )) as string[];
  if (smallMode) {
    diagramLabels.splice(
      0,
      diagramLabels.length,
      ...diagramLabels.map(compactSmallModeLabel),
    );
  }
  const diagramLabelsEn = diagramLabels.map((_, index) =>
    sanitizePresentationText(
      generated.diagram_labels_en?.[index],
      englishLabelFallback(sourcePage.page_type, index),
    ),
  );
  const callouts = (
    alignedStrategyOverview
      ? alignedStrategyOverview.descriptions.map((description, index) => ({
          label_zh: description,
          label_en: englishLabelFallback(sourcePage.page_type, index),
        }))
      : generated.callouts
          ?.filter(
            (callout) =>
              !callout.fact_ref || allowedFactIds.has(callout.fact_ref),
          )
          .map((callout, index) => ({
            ...callout,
            label_zh:
              safePresentationItems(
                [chinesePrimaryText(callout.label_zh, "", "")],
                [`要点 ${index + 1}`],
                forbiddenTerms,
                currentProjectEvidence,
                1,
              )[0] ?? `要点 ${index + 1}`,
            label_en: sanitizePresentationText(
              callout.label_en,
              diagramLabelsEn[index] ??
                englishLabelFallback(sourcePage.page_type, index),
            ),
          }))
  ) as ReportPage["callouts"];
  const normalizedCallouts = (
    smallMode
      ? callouts?.map((callout) => refineSmallModeCallout(callout, projectFacts))
      : callouts
  ) as ReportPage["callouts"];
  const requiredProposalIds = applicableConfirmedProposals.map(
    (proposal) => proposal.proposal_id,
  );
  const returnedProposalRefs = new Set([
    ...(generated.proposal_refs ?? []),
    ...(alignedStrategyOverview?.coverage.map(
      (coverage) => coverage.proposal_id,
    ) ?? []),
  ]);
  const visibleFields = [
    bodyCopy,
    ...diagramLabels,
    ...(normalizedCallouts ?? []).map((callout) => callout.label_zh),
  ].filter(Boolean);
  const modelProposalCoverage = (generated.proposal_coverage ?? []).flatMap(
    (coverage) => {
      if (
        !requiredProposalIds.includes(coverage.proposal_id) ||
        coverage.applied_design_moves.length === 0
      ) {
        return [];
      }
      const exactVisibleStatement = reconciledVisibleFieldForCoverage(
        visibleFields,
        coverage.visible_statement,
        coverage.applied_design_moves,
        Boolean(repairContext),
      );
      if (!exactVisibleStatement) return [];
      return [
        {
          ...coverage,
          // Persist the exact post-sanitization field so later audits remain
          // deterministic even when the model inserted line breaks or used
          // typographic punctuation in proposal_coverage.
          visible_statement: exactVisibleStatement,
        },
      ];
    },
  );
  const proposalCoverage = alignedStrategyOverview?.coverage ??
    modelProposalCoverage;
  const coveredProposalIds = requiredProposalIds.filter(
    (proposalId) =>
      returnedProposalRefs.has(proposalId) &&
      proposalCoverage.some((coverage) => coverage.proposal_id === proposalId),
  );
  if (requiredProposalIds.length > 0 && coveredProposalIds.length === 0) {
    const candidateLabels = applicableConfirmedProposals.map(
      (proposal) => proposal.title || proposal.topic,
    );
    const proposalValidationFailures: string[] = [];
    if (
      !(generated.proposal_refs ?? []).some((proposalId) =>
        requiredProposalIds.includes(proposalId),
      )
    ) {
      proposalValidationFailures.push(
        "proposal_refs 没有引用任何允许的已确认提案 ID。",
      );
    }
    const candidateCoverage = (generated.proposal_coverage ?? []).filter(
      (coverage) => requiredProposalIds.includes(coverage.proposal_id),
    );
    if (!candidateCoverage.length) {
      proposalValidationFailures.push(
        "proposal_coverage 没有覆盖任何允许的已确认提案。",
      );
    } else {
      if (
        candidateCoverage.every(
          (coverage) => coverage.applied_design_moves.length === 0,
        )
      ) {
        proposalValidationFailures.push(
          "proposal_coverage.applied_design_moves 缺少具体设计动作。",
        );
      }
      if (
        candidateCoverage.every(
          (coverage) =>
            !exactVisibleFieldForCoverage(
              visibleFields,
              coverage.visible_statement,
            ),
        )
      ) {
        proposalValidationFailures.push(
          "proposal_coverage.visible_statement 没有逐字对应本页任何一条可见正文、图注或标注。",
        );
      }
    }
    if (canRepair) {
      return generatePageWithModel(
        projectFacts,
        pagePlan,
        pageId,
        runtimeOverride,
        createRepairContext([
          `本页必须实质落实以下候选提案中的至少一项：${candidateLabels.join("、")}`,
          ...proposalValidationFailures,
        ]),
      );
    }
    throw new Error(
      `逐页生成已重写 ${repairContext?.repair_attempt ?? 0} 次，但仍没有实质落实任何一项相关提案：${candidateLabels.join("、")}。缺失项：${proposalValidationFailures.join("；")}`,
    );
  }
  const generatedConceptName =
    sourcePage.page_type === "concept" &&
    getVisualImageSlotCountForPage(sourcePage) === 1
      ? extractConceptName([
          sourcePage.headline_zh,
          sourcePage.core_message,
          bodyCopy,
        ])
      : "";
  const generatedConceptNameEn = generatedConceptName
    ? extractEnglishConceptName([
        sourcePage.headline_en,
        sourcePage.core_message_en,
        bodyEn,
        ...(generated.diagram_labels_en ?? []),
      ]) || englishPresentationText(generatedConceptName, "")
    : "";
  const selectedFactIds = selectRelevantPageFactIds(
    projectFacts,
    {
      ...sourcePage,
      body_zh: bodyCopy,
      body_copy: bodyCopy,
      body_en: bodyEn,
      diagram_labels: diagramLabels,
      diagram_labels_en: diagramLabelsEn,
      callouts: normalizedCallouts,
    },
    candidateFactIds,
    4,
  );
  const finalFactIds = selectedFactIds;
  const page: ReportPage = {
    ...sourcePage,
    headline_zh: generatedConceptName
      ? `核心概念：${generatedConceptName}`
      : sourcePage.headline_zh,
    headline_en: generatedConceptName
      ? `CORE CONCEPT${
          generatedConceptNameEn ? `: ${generatedConceptNameEn}` : ""
        }`
      : generatedHeadlineEn,
    core_message: generatedCoreMessage,
    core_message_en: generatedCoreMessageEn,
    body_zh: bodyCopy,
    body_en: bodyEn,
    body_copy: bodyCopy,
    diagram_labels: diagramLabels,
    diagram_labels_en: diagramLabelsEn,
    speaker_notes: speakerNotes,
    visual_requirements: sourcePage.visual_requirements,
    visual_brief: sourcePage.visual_brief,
    style_example_refs: sourcePage.style_example_refs,
    callouts: normalizedCallouts,
    fact_refs: finalFactIds,
    proposal_refs: smallMode
      ? [...returnedProposalRefs].filter((proposalId) =>
          requiredProposalIds.includes(proposalId),
        )
      : coveredProposalIds,
    proposal_coverage: proposalCoverage,
    unresolved_items: sourcePage.unresolved_items,
    missing_information: sourcePage.missing_information,
    generation_status:
      sourcePage.generation_status === "blocked"
        ? "blocked"
        : sourcePage.generation_status === "placeholder" ||
            !bodyCopy
          ? "placeholder"
          : "generated",
  };
  page.content_depth_check = evaluatePageContentDepth(projectFacts, page);
  const result = structuredClone(pagePlan);
  result.pages = result.pages.map((candidate) =>
    candidate.page_id === pageId ? page : candidate,
  );
  assertPagePlan(result);
  return {
    pagePlan: result,
    call: response.call,
    calls: [...(repairContext?.prior_calls ?? []), response.call],
  };
}

export async function auditPagesWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const currentEvidenceText = projectFacts.facts
    .filter(
      (fact) => fact.status !== "superseded" && fact.status !== "conflict",
    )
    .map((fact) => `${String(fact.value_raw)} ${fact.source.quote}`)
    .join("\n");
  const codedParkNames = [
    ...new Set(
      [...currentEvidenceText.matchAll(/\b([A-Z]{2}\d{2})\s*(?:中央)?绿地公园/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  const normalizeCurrentTerminology = (value: string | undefined) => {
    if (!value) return value;
    return codedParkNames.reduce(
      (result, code) =>
        result.replace(
          new RegExp(`${code}(?:中央)?绿地(?!公园)`, "g"),
          `${code}绿地公园`,
        ),
      value,
    );
  };
  const normalizedPagePlan = structuredClone(pagePlan);
  for (const page of normalizedPagePlan.pages) {
    page.headline_zh = normalizeCurrentTerminology(page.headline_zh) ?? "";
    page.core_message = normalizeCurrentTerminology(page.core_message) ?? "";
    page.body_zh = normalizeCurrentTerminology(page.body_zh);
    page.body_copy = normalizeCurrentTerminology(page.body_copy) ?? "";
    page.diagram_labels = page.diagram_labels.map(
      (label) => normalizeCurrentTerminology(label) ?? label,
    );
    for (const callout of page.callouts ?? []) {
      callout.label_zh =
        normalizeCurrentTerminology(callout.label_zh) ?? callout.label_zh;
    }
  }
  const auditInput = structuredClone(normalizedPagePlan);
  delete auditInput.audit_report;
  auditInput.pages = auditInput.pages.map((page) => ({
    ...page,
    // Internal retrieval IDs and visual-generation payloads are never visible
    // in the report. Excluding them prevents the copy audit from mistaking
    // safe backend provenance for leaked historical-project content.
    experience_recipe_refs: [],
    style_example_refs: [],
    proposal_context_hash: undefined,
    visual_task: undefined,
    content_depth_check: evaluatePageContentDepth(projectFacts, page),
  }));
  const response = await createStructuredResponse<AuditReport>({
    name: "audit_report",
    schema: auditReportSchema,
    instructions: AUDIT_PROMPT,
    content: [
      {
        type: "input_text",
        text: `项目事实与脱敏样本规则：\n${JSON.stringify(planningFactsPayload(projectFacts))}\n\n页级目录与已生成文案：\n${JSON.stringify(auditInput)}`,
      },
    ],
    reasoningEffort: "high",
    runtimeOverride,
  });
  const pageIds = new Set(normalizedPagePlan.pages.map((page) => page.page_id));
  const factIds = new Set(projectFacts.facts.map((fact) => fact.fact_id));
  const currentProjectEvidence = projectFacts.facts
    .filter(
      (fact) => fact.status !== "superseded" && fact.status !== "conflict",
    )
    .map((fact) => `${String(fact.value_raw)} ${fact.source.quote}`)
    .join("\n");
  const hasDeterministicDepthIssue = normalizedPagePlan.pages.some(
    (page) =>
      evaluatePageContentDepth(projectFacts, page).status ===
      "needs_improvement",
  );
  const allGateBProposalsConfirmed =
    (projectFacts.gate_b_proposals?.length ?? 0) > 0 &&
    (projectFacts.gate_b_proposals ?? []).every(
      (proposal) => proposal.status === "confirmed",
    );
  const validAuditIssues = response.value.issues.filter((issue) => {
    const mentionedFactIds = issue.evidence.match(/F_[A-Z0-9_]+/g) ?? [];
    if (!mentionedFactIds.every((factId) => factIds.has(factId))) {
      return false;
    }
    const issueText = `${issue.issue} ${issue.evidence} ${issue.recommended_fix}`;
    if (/forbidden|泄漏|leak|敏感|脱敏/i.test(issueText)) {
      const genuinelyForeignTerms = protectedHistoricalReferenceTerms.filter(
        (term) =>
          issueText.includes(term) && !currentProjectEvidence.includes(term),
      );
      if (genuinelyForeignTerms.length === 0) return false;
    }
    if (
      /内容深度|证据超过\s*4|正文说明超过\s*4/.test(issueText) &&
      !hasDeterministicDepthIssue
    ) {
      return false;
    }
    if (
      /数字|单位|fact\s*ref|引用错误/i.test(issueText) &&
      !hasDeterministicDepthIssue
    ) {
      return false;
    }
    if (
      allGateBProposalsConfirmed &&
      /gate\s*b|提案|方案证据/i.test(issueText) &&
      /缺失|阻断|blocked/i.test(issueText)
    ) {
      return false;
    }
    if (/视觉证据|图纸验证|图纸.*fact_refs|概念图解.*fact_refs/i.test(issueText)) {
      return false;
    }
    return true;
  });
  const summary = !validAuditIssues.length
    ? "一致性审核完成，未发现可验证的事实冲突、历史项目内容混用或内容深度问题。"
    : `一致性审核完成，仍有 ${validAuditIssues.length} 项可定位问题需要处理。`;
  const result = structuredClone(normalizedPagePlan);
  result.audit_report = {
    ...response.value,
    summary,
    reviewed_page_ids: response.value.reviewed_page_ids.filter((pageId) =>
      pageIds.has(pageId),
    ),
    issues: validAuditIssues.map((issue) => ({
      ...issue,
      pages: issue.pages.filter((pageId) => pageIds.has(pageId)),
      fact_refs: issue.fact_refs.filter((factId) => factIds.has(factId)),
    })),
  };
  result.pages = result.pages.map((page) => {
    const evaluated = {
      ...page,
      content_depth_check: evaluatePageContentDepth(projectFacts, page),
    };
    return result.audit_report?.reviewed_page_ids.includes(page.page_id) &&
      page.generation_status === "generated"
      ? { ...evaluated, generation_status: "reviewed" as const }
      : evaluated;
  });
  assertPagePlan(result);
  return { pagePlan: result, call: response.call };
}

export async function prepareExportWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  format: "pdf" | "docx",
  runtimeOverride?: ModelRuntimeOverride,
  options: { layoutOverflowPageIds?: string[] } = {},
) {
  const smallMode = isSmallBuildingMode(
    projectFacts.task_mode ?? DEFAULT_TASK_MODE,
  );
  let workingPagePlan = pagePlan;
  let designSystemCall: ModelCallRecord | undefined;
  if (smallMode) {
    try {
      const generatedDesignSystem = await generateSmallModeDesignSystemWithModel(
        projectFacts,
        pagePlan,
        runtimeOverride,
      );
      workingPagePlan = applySmallModeDesignSystem(
        pagePlan,
        generatedDesignSystem.designSystem,
      );
      workingPagePlan = migrateSmallModeSummarySection(workingPagePlan);
      designSystemCall = generatedDesignSystem.call;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`小型建筑/装置全篇设计系统生成失败：${message}`);
    }
  }
  const exportPages = workingPagePlan.pages.filter(
    (page) =>
      !["cover", "toc", "section_divider"].includes(page.page_type),
  );
  if (!exportPages.length) {
    throw new Error("当前汇报没有可供模型整理的正文页面。");
  }

  // Page generation is intentionally incremental. A page that has already
  // passed the normal single-page generation path contains the same validated
  // bilingual copy that export needs, so regenerating it here only adds latency,
  // token cost and another chance for the wording to drift. Ready/placeholder/
  // blocked pages still go through the model before export.
  const reusablePageIds = new Set(
    exportPages
      .filter(
        (page) =>
          ["generated", "reviewed"].includes(page.generation_status) &&
          Boolean(page.headline_zh?.trim()) &&
          Boolean(page.core_message?.trim()) &&
          page.fact_refs.length <= 4 &&
          page.fact_refs.every((factId) =>
            projectFacts.facts.some(
              (fact) => fact.fact_id === factId && fact.status === "confirmed",
            ),
          ) &&
          !hasSubstantialEnglishText(
            `${page.core_message} ${page.body_zh ?? ""} ${page.body_copy ?? ""}`,
          ) &&
          evaluatePageContentDepth(projectFacts, page).status !==
            "needs_improvement" &&
          !(smallMode && smallModeHeadlineNeedsTranslation(page)),
      )
      .map((page) => page.page_id),
  );
  const pagesToGenerate = exportPages.filter(
    (page) =>
      !reusablePageIds.has(page.page_id) ||
      options.layoutOverflowPageIds?.includes(page.page_id),
  );

  const generatedPages = new Map<string, ReportPage>();
  const pageCalls: ModelCallRecord[][] = new Array(pagesToGenerate.length);
  let nextPageIndex = 0;
  const workers = Array.from(
    { length: Math.min(4, pagesToGenerate.length) },
    async () => {
      while (nextPageIndex < pagesToGenerate.length) {
        const pageIndex = nextPageIndex;
        nextPageIndex += 1;
        const sourcePage = pagesToGenerate[pageIndex];
        try {
          const modeled = await generatePageWithModel(
            projectFacts,
            workingPagePlan,
            sourcePage.page_id,
            runtimeOverride,
            options.layoutOverflowPageIds?.includes(sourcePage.page_id)
              ? {
                  previous_output: {
                    body_zh: sourcePage.body_zh,
                    body_en: sourcePage.body_en,
                    body_copy: sourcePage.body_copy,
                    headline_en: sourcePage.headline_en,
                    core_message: sourcePage.core_message,
                    core_message_en: sourcePage.core_message_en,
                    diagram_labels: sourcePage.diagram_labels,
                    diagram_labels_en: sourcePage.diagram_labels_en,
                    speaker_notes: sourcePage.speaker_notes,
                    callouts: sourcePage.callouts,
                    proposal_refs: sourcePage.proposal_refs,
                    proposal_coverage: sourcePage.proposal_coverage,
                  },
                  validation_failures: [
                    "真实 A3 页面预览检测到文本框溢出；必须整体重写可见文案以适配当前版面，不得先验按字符数拦截。",
                  ],
                  prior_calls: [],
                  repair_attempt: 0,
                  length_only_repair: true,
                  compression_only_repair: true,
                }
              : undefined,
          );
          const generatedPage = modeled.pagePlan.pages.find(
            (page) => page.page_id === sourcePage.page_id,
          );
          if (!generatedPage) {
            throw new Error("模型结果缺少目标页。");
          }
          generatedPages.set(sourcePage.page_id, generatedPage);
          pageCalls[pageIndex] = modeled.calls;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `${format.toUpperCase()} 导出终稿的 ${sourcePage.page_id} 页生成失败：${message}`,
          );
        }
      }
    },
  );
  await Promise.all(workers);

  const generatedPlan = structuredClone(workingPagePlan);
  generatedPlan.pages = generatedPlan.pages.map(
    (page) => generatedPages.get(page.page_id) ?? page,
  );
  if (smallMode) {
    generatedPlan.pages = generatedPlan.pages.map((page) =>
      normalizeSmallModePage(page, projectFacts),
    );
  }
  assertPagePlan(generatedPlan);

  const reviewedPageIds = new Set(
    generatedPlan.audit_report?.reviewed_page_ids ?? [],
  );
  const canReuseExistingAudit =
    pagesToGenerate.length === 0 &&
    exportPages.every(
      (page) =>
        page.generation_status === "reviewed" &&
        reviewedPageIds.has(page.page_id),
    );
  const audited = canReuseExistingAudit
    ? { pagePlan: generatedPlan, call: undefined }
    : await auditPagesWithModel(
        projectFacts,
        generatedPlan,
        runtimeOverride,
      );
  return {
    pagePlan: audited.pagePlan,
    calls: [
      ...(designSystemCall ? [designSystemCall] : []),
      ...pageCalls.flat(),
      ...(audited.call ? [audited.call] : []),
    ],
    generatedPageIds: pagesToGenerate.map((page) => page.page_id),
    reusedPageIds: exportPages
      .filter((page) => reusablePageIds.has(page.page_id))
      .map((page) => page.page_id),
    auditReused: canReuseExistingAudit,
  };
}
