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
} from "@/app/lib/model-client";
import {
  AUDIT_PROMPT,
  COMPLETENESS_PROMPT,
  FACT_EXTRACTION_PROMPT,
  PAGE_GENERATION_PROMPT,
  PLANNER_PROMPT,
  REGISTRATION_PROMPT,
} from "@/app/lib/model-prompts";
import {
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

type CanonicalDocument = DesignReportProjectFacts["documents"][number];
type ReportPage = DesignReportPagePlan["pages"][number];
type AuditReport = NonNullable<DesignReportPagePlan["audit_report"]>;

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

  const firstName = facts.find((fact) => fact.field_path === "project.name");
  const result: DesignReportProjectFacts = {
    ...value,
    project_id: projectId,
    project_name_anonymized:
      value.project_name_anonymized ||
      (firstName ? String(firstName.value_raw) : "未命名单项目"),
    default_page_format: "A3_landscape_420x297mm",
    language_mode: value.language_mode ?? "zh",
    ignore_company_info: true,
    documents,
    facts,
    style_observations: styleObservations,
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
  const result: DesignReportProjectFacts = {
    ...extracted,
    missing_items: completion.missing_items,
    gate_report: completion.gate_report,
  };
  assertProjectFacts(result);
  return result;
}

function sanitizePlan(
  value: DesignReportPagePlan,
  facts: DesignReportProjectFacts,
) {
  const factIds = new Set(facts.facts.map((fact) => fact.fact_id));
  if (value.pages.length < 8 || value.pages.length > 12) {
    throw new Error("模型目录页数不在 8—12 页范围内。");
  }
  const seenCoreMessages = new Set<string>();
  const pages = value.pages.map((page, index) => {
    const factRefs = page.fact_refs.filter((factId) => factIds.has(factId));
    const coreMessage = page.core_message.trim();
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
      body_zh: "",
      body_en: "",
      body_copy: "",
      diagram_labels: [],
      speaker_notes: "",
      fact_refs: factRefs,
      generation_status:
        plannedStatus === "ready" && factRefs.length === 0
          ? ("placeholder" as const)
          : plannedStatus,
    };
  });
  const result: DesignReportPagePlan = {
    ...value,
    page_format: "A3_landscape_420x297mm",
    target_page_count: pages.length,
    pages,
  };
  assertPagePlan(result);
  return result;
}

export async function runModelPipeline(
  inputs: InputDocument[],
  projectId = "SINGLE_PROJECT",
): Promise<PipelineResult> {
  const localBaseline = runPipeline(inputs, projectId);

  const registration = await createStructuredResponse<{
    documents: CanonicalDocument[];
  }>({
    name: "document_registration",
    schema: registrationSchema,
    instructions: REGISTRATION_PROMPT,
    content: documentContent(inputs, "请完成资料登记与角色分流。"),
    reasoningEffort: "low",
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
  });
  const extracted = sanitizeExtractedFacts(
    extraction.value,
    classifiedInputs,
    documents,
    projectId,
    localBaseline.projectFacts.style_observations ?? [],
  );

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
  });
  const checked = sanitizeCompletion(extracted, completion.value);

  const planner = await createStructuredResponse<DesignReportPagePlan>({
    name: "page_plan",
    schema: pagePlanSchema,
    instructions: PLANNER_PROMPT,
    content: [
      {
        type: "input_text",
        text: `汇报对象默认为建筑设计竞赛评审，汇报目标为说明项目理解与方案回应。输入：\n${JSON.stringify(checked)}`,
      },
    ],
    reasoningEffort: "high",
  });
  const pagePlan = sanitizePlan(planner.value, checked);

  return {
    projectFacts: checked,
    pagePlan,
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
      modelNode("planner", planner.call, pagePlan),
    ],
    modelCallCount: 4,
    executionMode: "openai_model",
    modelName: getModelRuntime().model,
  };
}

export async function generatePageWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  pageId: string,
) {
  const sourcePage = pagePlan.pages.find((page) => page.page_id === pageId);
  if (!sourcePage) throw new Error(`Page not found: ${pageId}`);
  const citedFacts = sourcePage.fact_refs
    .map((factId) =>
      projectFacts.facts.find((fact) => fact.fact_id === factId),
    )
    .filter((fact): fact is ProjectFact => Boolean(fact));

  const response = await createStructuredResponse<ReportPage>({
    name: "report_page",
    schema: reportPageSchema,
    instructions: PAGE_GENERATION_PROMPT,
    content: [
      {
        type: "input_text",
        text: `目标页面：\n${JSON.stringify(sourcePage)}\n\n允许引用的事实：\n${JSON.stringify(citedFacts)}\n\n历史参考风格：\n${JSON.stringify(projectFacts.style_observations ?? [])}`,
      },
    ],
    reasoningEffort: "medium",
  });

  const allowedFactIds = new Set(sourcePage.fact_refs);
  const generated = response.value;
  const page: ReportPage = {
    ...sourcePage,
    headline_zh: generated.headline_zh,
    headline_en: generated.headline_en,
    core_message: generated.core_message,
    body_zh: generated.body_zh || generated.body_copy,
    body_en: generated.body_en,
    body_copy: generated.body_copy,
    diagram_labels: generated.diagram_labels,
    speaker_notes: generated.speaker_notes,
    visual_requirements: generated.visual_requirements,
    visual_brief: generated.visual_brief,
    callouts: generated.callouts?.filter(
      (callout) => !callout.fact_ref || allowedFactIds.has(callout.fact_ref),
    ) as ReportPage["callouts"],
    fact_refs: sourcePage.fact_refs,
    unresolved_items: generated.unresolved_items,
    missing_information: generated.missing_information,
    generation_status:
      sourcePage.generation_status === "blocked"
        ? "blocked"
        : sourcePage.generation_status === "placeholder" ||
            !generated.body_copy.trim()
          ? "placeholder"
          : "generated",
  };
  const result = structuredClone(pagePlan);
  result.pages = result.pages.map((candidate) =>
    candidate.page_id === pageId ? page : candidate,
  );
  assertPagePlan(result);
  return { pagePlan: result, call: response.call };
}

export async function auditPagesWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  const response = await createStructuredResponse<AuditReport>({
    name: "audit_report",
    schema: auditReportSchema,
    instructions: AUDIT_PROMPT,
    content: [
      {
        type: "input_text",
        text: `项目事实：\n${JSON.stringify(projectFacts)}\n\n页级目录与已生成文案：\n${JSON.stringify(pagePlan)}`,
      },
    ],
    reasoningEffort: "high",
  });
  const pageIds = new Set(pagePlan.pages.map((page) => page.page_id));
  const factIds = new Set(projectFacts.facts.map((fact) => fact.fact_id));
  const result = structuredClone(pagePlan);
  result.audit_report = {
    ...response.value,
    reviewed_page_ids: response.value.reviewed_page_ids.filter((pageId) =>
      pageIds.has(pageId),
    ),
    issues: response.value.issues.map((issue) => ({
      ...issue,
      pages: issue.pages.filter((pageId) => pageIds.has(pageId)),
      fact_refs: issue.fact_refs.filter((factId) => factIds.has(factId)),
    })),
  };
  result.pages = result.pages.map((page) =>
    result.audit_report?.reviewed_page_ids.includes(page.page_id) &&
    page.generation_status === "generated"
      ? { ...page, generation_status: "reviewed" as const }
      : page,
  );
  assertPagePlan(result);
  return { pagePlan: result, call: response.call };
}
