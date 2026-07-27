import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";

export type SourceRole =
  DesignReportProjectFacts["documents"][number]["role"];
export type ReportPage = DesignReportPagePlan["pages"][number];
export type ProjectFact = DesignReportProjectFacts["facts"][number];

export interface InputDocument {
  document_id: string;
  file_name: string;
  role: SourceRole;
  version_or_date: string;
  authority_rank?: number;
  page_count?: number;
  text: string;
}

export interface NodeOutput {
  node:
    | "registration"
    | "fact_extraction"
    | "completeness"
    | "planner"
    | "page_generation"
    | "consistency_audit";
  execution: "local_rule";
  model_calls: 0;
  output: unknown;
}

export interface PipelineResult {
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  nodeOutputs: NodeOutput[];
  modelCallCount: 0;
}

type FactCategory = ProjectFact["category"];

interface FactRule {
  labels: string[];
  fieldPath: string;
  category: FactCategory;
  unit?: string | null;
  sourceRole?: "brief_fact" | "proposal_fact";
  normalize?: (value: string) => unknown;
}

const factRules: FactRule[] = [
  {
    labels: ["项目名称"],
    fieldPath: "project.name",
    category: "project",
    normalize: cleanText,
  },
  {
    labels: ["设计阶段"],
    fieldPath: "project.design_stage",
    category: "project",
    normalize: cleanText,
  },
  {
    labels: ["项目区位", "项目位置"],
    fieldPath: "site.location",
    category: "site",
    normalize: cleanText,
  },
  {
    labels: ["用地面积"],
    fieldPath: "planning.site_area",
    category: "planning_control",
    unit: "m2",
    normalize: parseNumber,
  },
  {
    labels: ["容积率"],
    fieldPath: "planning.far",
    category: "planning_control",
    normalize: parseNumber,
  },
  {
    labels: ["建筑限高", "高度限制"],
    fieldPath: "planning.height_limit",
    category: "planning_control",
    unit: "m",
    normalize: parseNumber,
  },
  {
    labels: ["总建筑面积", "方案总建筑面积"],
    fieldPath: "area.total_gfa",
    category: "area",
    unit: "m2",
    normalize: parseNumber,
  },
  {
    labels: ["地上建筑面积"],
    fieldPath: "area.above_ground_gfa",
    category: "area",
    unit: "m2",
    normalize: parseNumber,
  },
  {
    labels: ["地下建筑面积"],
    fieldPath: "area.below_ground_gfa",
    category: "area",
    unit: "m2",
    normalize: parseNumber,
  },
  {
    labels: ["主要功能", "主要业态"],
    fieldPath: "program.primary",
    category: "program",
    normalize: cleanText,
  },
  {
    labels: ["设计目标"],
    fieldPath: "evaluation.design_goal",
    category: "evaluation_priority",
    normalize: cleanText,
  },
  {
    labels: ["评审重点"],
    fieldPath: "evaluation.priorities",
    category: "evaluation_priority",
    normalize: cleanText,
  },
  {
    labels: ["交通要求"],
    fieldPath: "circulation.requirement",
    category: "circulation",
    normalize: cleanText,
  },
  {
    labels: ["成果要求", "页面尺寸", "图纸尺寸", "尺寸"],
    fieldPath: "deliverable.page_format",
    category: "deliverable",
    normalize: cleanText,
  },
  {
    labels: ["设计概念"],
    fieldPath: "proposal.design_concept",
    category: "proposal_design",
    sourceRole: "proposal_fact",
    normalize: cleanText,
  },
  {
    labels: ["概念说明"],
    fieldPath: "proposal.concept_statement",
    category: "proposal_design",
    sourceRole: "proposal_fact",
    normalize: cleanText,
  },
  {
    labels: ["总体布局"],
    fieldPath: "proposal.masterplan",
    category: "proposal_design",
    sourceRole: "proposal_fact",
    normalize: cleanText,
  },
  {
    labels: ["交通组织"],
    fieldPath: "circulation.design",
    category: "circulation",
    sourceRole: "proposal_fact",
    normalize: cleanText,
  },
  {
    labels: ["重点空间"],
    fieldPath: "proposal.key_spaces",
    category: "space_requirement",
    sourceRole: "proposal_fact",
    normalize: cleanText,
  },
  {
    labels: ["立面材料"],
    fieldPath: "technical.facade",
    category: "technical_requirement",
    sourceRole: "proposal_fact",
    normalize: cleanText,
  },
  {
    labels: ["结构体系"],
    fieldPath: "technical.structure",
    category: "technical_requirement",
    sourceRole: "proposal_fact",
    normalize: cleanText,
  },
];

const gateARequirements = [
  ["项目名称", "project.name"],
  ["设计阶段", "project.design_stage"],
  ["项目区位", "site.location"],
  ["用地面积", "planning.site_area"],
  ["容积率", "planning.far"],
  ["建筑限高", "planning.height_limit"],
  ["主要功能", "program.primary"],
  ["评审重点或设计目标", "evaluation.priorities|evaluation.design_goal"],
  ["成果格式", "deliverable.page_format"],
] as const;

const gateBRequirements = [
  ["设计概念", "proposal.design_concept"],
  ["总体布局", "proposal.masterplan"],
  ["交通组织", "circulation.design"],
  ["重点空间", "proposal.key_spaces"],
  ["立面方案", "technical.facade"],
  ["结构方案", "technical.structure"],
  ["效果图或视觉清单", "visual.renderings"],
] as const;

function cleanText(value: string) {
  return value.trim().replace(/[。；;]+$/, "");
}

function parseNumber(value: string) {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : value.trim();
}

function splitPages(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const pages = new Map<number, string[]>();
  let currentPage = 1;
  pages.set(currentPage, []);

  for (const line of lines) {
    const marker = line.match(/={3,}\s*PAGE\s+(\d+)\s*={3,}/i);
    if (marker) {
      currentPage = Number(marker[1]);
      if (!pages.has(currentPage)) pages.set(currentPage, []);
      continue;
    }
    pages.get(currentPage)?.push(line);
  }

  return [...pages.entries()].map(([page, pageLines]) => ({
    page,
    lines: pageLines.map((line) => line.trim()).filter(Boolean),
  }));
}

function roleToSourceRole(role: SourceRole) {
  return role === "proposal" ? "proposal_fact" : "brief_fact";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readLabeledValue(line: string, label: string) {
  const escapedLabel = escapeRegExp(label);
  const match = line.match(
    new RegExp(`^\\s*${escapedLabel}\\s*(?:[:：]\\s*)?(.+?)\\s*$`),
  );
  return match?.[1]?.trim() || null;
}

function fallbackFactForLine(line: string) {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (
    normalized.length <= 80 &&
    /(?:地块|中心|项目).*(?:概念方案设计|建筑方案设计|设计竞赛)/.test(
      normalized,
    )
  ) {
    return {
      fieldPath: "project.name",
      category: "project" as const,
      value: normalized,
      locationNote: "项目标题",
    };
  }
  if (/方案设计阶段|概念方案阶段|初步设计阶段/.test(normalized)) {
    return {
      fieldPath: "project.design_stage",
      category: "project" as const,
      value:
        normalized.match(/(?:概念)?方案设计阶段|初步设计阶段/)?.[0] ??
        normalized,
      locationNote: "阶段表述",
    };
  }
  const program = normalized.match(
    /(?:业态涵盖|功能包括|主要设置)([^。；;]{2,80})/,
  );
  if (program) {
    return {
      fieldPath: "program.primary",
      category: "program" as const,
      value: program[1].trim(),
      locationNote: "功能表述",
    };
  }
  const location = normalized.match(
    /(?:项目|地块|马场)(?:基地)?位于([^。；;]{2,100})/,
  );
  if (location) {
    return {
      fieldPath: "site.location",
      category: "site" as const,
      value: location[1].trim(),
      locationNote: "区位表述",
    };
  }
  return null;
}

export function inferRole(fileName: string, text: string): SourceRole {
  const sample = `${fileName}\n${text.slice(0, 1200)}`.toLowerCase();
  if (/任务书|招标|答疑|批复|brief|tender/.test(sample)) {
    return "authoritative";
  }
  if (/参考|案例|历史|style|reference|presentation|汇报文本|汇报册/.test(sample)) {
    return "reference_style";
  }
  if (/公司简介|团队介绍|企业资质|获奖情况|contact|company profile|team profile/.test(sample)) {
    return "company_info";
  }
  if (/方案|设计概念|总体布局|proposal|concept/.test(sample)) {
    return "proposal";
  }
  return "unknown";
}

function registerDocuments(inputs: InputDocument[]) {
  return inputs.map((input) => ({
    document_id: input.document_id,
    file_name: input.file_name,
    role: input.role,
    version_or_date: input.version_or_date,
    authority_rank: input.authority_rank ?? 6,
    notes:
      input.role === "company_info"
        ? "已隔离：公司身份信息不进入事实库和设计文案。"
        : input.role === "reference_style"
          ? "仅用于章节结构、页型与表达风格。"
          : `已读取 ${input.page_count ?? splitPages(input.text).length} 页文本。`,
  }));
}

function buildRegistrationOutput(inputs: InputDocument[]) {
  const documents = registerDocuments(inputs);
  const idsFor = (roles: SourceRole[]) =>
    inputs
      .filter((input) => roles.includes(input.role))
      .map((input) => input.document_id);

  return {
    parsing_summary: inputs.map((input) => ({
      document_id: input.document_id,
      page_count: input.page_count ?? splitPages(input.text).length,
      character_count: input.text
        .replace(/={3,}\s*PAGE\s+\d+\s*={3,}/gi, "")
        .trim().length,
      text_layer_status: input.text.trim() ? "readable" : "empty",
    })),
    documents,
    data_zones: {
      current_project_evidence: idsFor(["authoritative", "proposal"]),
      historical_reference_library: idsFor(["reference_style"]),
      excluded_company_information: idsFor(["company_info"]),
      awaiting_role_confirmation: idsFor(["unknown"]),
    },
  };
}

function extractFacts(inputs: InputDocument[], projectId: string) {
  const documents = registerDocuments(inputs);
  const facts: ProjectFact[] = [];
  const styleObservations: NonNullable<
    DesignReportProjectFacts["style_observations"]
  > = [];

  for (const input of inputs) {
    if (input.role === "company_info" || input.role === "unknown") continue;

    const pages = splitPages(input.text);
    if (input.role === "reference_style") {
      const descriptions = pages.flatMap(({ page, lines }) =>
        lines
          .filter((line) =>
            /^(推荐章节结构|表达风格|页型节奏|版面规则|视觉比例|语言规则)[:：]/.test(
              line,
            ),
          )
          .map((line) => ({ page, description: line.split(/[:：]/, 2)[1] })),
      );
      descriptions.forEach((item, index) => {
        styleObservations.push({
          observation_id: `S_${input.document_id}_${String(index + 1).padStart(3, "0")}`,
          description: item.description.trim(),
          source: { document_id: input.document_id, pages: [item.page] },
        });
      });
      continue;
    }

    if (input.role !== "authoritative" && input.role !== "proposal") continue;

    for (const { page, lines } of pages) {
      for (const line of lines) {
        const matched = factRules
          .flatMap((rule) =>
            rule.labels.map((label) => ({
              rule,
              label,
              value: readLabeledValue(line, label),
            })),
          )
          .find((item) => item.value !== null);
        const fallback = matched ? null : fallbackFactForLine(line);
        if (!matched && !fallback) continue;
        if (
          fallback &&
          facts.some(
            (fact) =>
              fact.field_path === fallback.fieldPath &&
              fact.source.document_id === input.document_id,
          )
        ) {
          continue;
        }

        const rule = matched?.rule;
        const fieldPath = rule?.fieldPath ?? fallback!.fieldPath;
        if (
          facts.some(
            (fact) =>
              fact.field_path === fieldPath &&
              fact.source.document_id === input.document_id &&
              fact.value_raw === (matched?.value ?? fallback!.value),
          )
        ) {
          continue;
        }

        const label = matched?.label ?? fallback!.locationNote;
        const valueRaw = matched?.value ?? fallback!.value;
        const factIndex = facts.length + 1;
        facts.push({
          fact_id: `F_${String(factIndex).padStart(3, "0")}`,
          category: rule?.category ?? fallback!.category,
          field_path: fieldPath,
          value_raw: valueRaw,
          value_normalized: (rule?.normalize ?? cleanText)(valueRaw),
          unit: rule?.unit ?? null,
          source: {
            document_id: input.document_id,
            page,
            location_note: label,
            quote: line,
          },
          source_role: rule?.sourceRole ?? roleToSourceRole(input.role),
          confidence: matched ? 1 : 0.85,
          status: "confirmed",
          notes: matched ? "" : "由页面自然语言规则提取，建议人工复核。",
        });
      }
    }
  }

  const conflicts: DesignReportProjectFacts["conflicts"] = [];
  const factsByField = Map.groupBy(facts, (fact) => fact.field_path);
  for (const [fieldPath, groupedFacts] of factsByField.entries()) {
    const distinctValues = new Set(
      groupedFacts.map((fact) => JSON.stringify(fact.value_normalized)),
    );
    if (distinctValues.size < 2) continue;
    groupedFacts.forEach((fact) => {
      fact.status = "conflict";
    });
    conflicts.push({
      conflict_id: `C_${String(conflicts.length + 1).padStart(3, "0")}`,
      field_path: fieldPath,
      fact_ids: groupedFacts.map((fact) => fact.fact_id) as [
        string,
        string,
        ...string[],
      ],
      severity: fieldPath.includes("gfa") ? "important" : "minor",
      resolution_status: "unresolved",
      resolution_note: "保留所有来源值，目录与文案优先引用 authoritative 来源。",
    });
  }

  const projectName = facts.find(
    (fact) => fact.field_path === "project.name",
  )?.value_raw;

  return {
    project_id: projectId,
    project_name_anonymized:
      typeof projectName === "string" ? projectName : "未命名单项目",
    default_page_format: "A3_landscape_420x297mm",
    language_mode: "zh",
    ignore_company_info: true,
    documents,
    facts,
    style_observations: styleObservations,
    conflicts,
    missing_items: [],
  } satisfies DesignReportProjectFacts;
}

function hasField(
  facts: ProjectFact[],
  fieldExpression: string,
  allowUnresolvedConflict = true,
) {
  const alternatives = fieldExpression.split("|");
  return alternatives.some((fieldPath) =>
    facts.some(
      (fact) =>
        fact.field_path === fieldPath &&
        fact.status !== "superseded" &&
        (allowUnresolvedConflict || fact.status !== "conflict") &&
        !/尚未|未确定|未完成|待补/.test(String(fact.value_raw)),
    ),
  );
}

function checkCompleteness(projectFacts: DesignReportProjectFacts) {
  const gateAMissing = gateARequirements
    .filter(([, field]) => !hasField(projectFacts.facts, field))
    .map(([label]) => label);
  const gateBMissing = gateBRequirements
    .filter(([, field]) => !hasField(projectFacts.facts, field))
    .map(([label]) => label);

  const missingItems: DesignReportProjectFacts["missing_items"] = [
    ...gateAMissing.map((description, index) => ({
      item_id: `M_A_${String(index + 1).padStart(3, "0")}`,
      description: `Gate A 缺少：${description}`,
      severity: "blocking" as const,
      blocks: ["planner" as const],
      suggested_source: "任务书、招标文件或正式补遗",
    })),
    ...gateBMissing.map((description, index) => ({
      item_id: `M_B_${String(index + 1).padStart(3, "0")}`,
      description: `Gate B 缺少：${description}`,
      severity:
        /立面|结构|效果图/.test(description)
          ? ("important" as const)
          : ("blocking" as const),
      blocks: ["page_generation" as const],
      suggested_source: "已确认的方案说明、图纸或视觉素材清单",
    })),
  ];

  const plannerReadiness =
    gateAMissing.length === 0
      ? ("ready" as const)
      : gateAMissing.length <= 2
        ? ("partial" as const)
        : ("blocked" as const);
  const generationReadiness =
    gateAMissing.length > 0
      ? ("blocked" as const)
      : gateBMissing.length === 0
        ? ("ready" as const)
        : gateBMissing.length <= 3
          ? ("partial" as const)
          : ("blocked" as const);

  return {
    ...projectFacts,
    missing_items: missingItems,
    gate_report: {
      planner_readiness: plannerReadiness,
      generation_readiness: generationReadiness,
      gate_a_missing: gateAMissing,
      gate_b_missing: gateBMissing,
      summary:
        plannerReadiness === "ready"
          ? `Gate A 已通过；Gate B 仍缺少 ${gateBMissing.length} 类方案证据。`
          : `Gate A 仍缺少 ${gateAMissing.length} 类基础资料，目录仅可作为占位。`,
    },
  } satisfies DesignReportProjectFacts;
}

function selectFacts(
  projectFacts: DesignReportProjectFacts,
  fieldExpressions: string[],
) {
  const fieldPaths = fieldExpressions.flatMap((expression) =>
    expression.split("|"),
  );
  return projectFacts.facts
    .filter((fact) => fieldPaths.includes(fact.field_path))
    .sort((a, b) => {
      const roleA = a.source_role === "brief_fact" ? 0 : 1;
      const roleB = b.source_role === "brief_fact" ? 0 : 1;
      return roleA - roleB;
    });
}

function buildPage(
  index: number,
  sectionId: string,
  pageType: ReportPage["page_type"],
  headline: string,
  coreMessage: string,
  facts: ProjectFact[],
  visualRequirements: string[],
  missingInformation: string[],
  status: "ready" | "placeholder" | "blocked",
): ReportPage {
  return {
    page_id: `P${String(index).padStart(3, "0")}`,
    display_page_number: index,
    section_id: sectionId,
    page_type: pageType,
    core_message: coreMessage,
    headline_zh: headline,
    body_zh: "",
    body_copy: "",
    diagram_labels: [],
    speaker_notes: "",
    visual_requirements: visualRequirements,
    callouts: [],
    visual_brief: visualRequirements,
    fact_refs: facts.map((fact) => fact.fact_id),
    unresolved_items: missingInformation,
    missing_information: missingInformation,
    generation_status: status,
  };
}

const fieldLabels: Record<string, string> = {
  "project.name": "项目名称",
  "project.design_stage": "设计阶段",
  "site.location": "项目区位",
  "planning.site_area": "用地面积",
  "planning.far": "容积率",
  "planning.height_limit": "建筑限高",
  "area.total_gfa": "总建筑面积",
  "program.primary": "主要功能",
  "evaluation.priorities": "评审重点",
  "evaluation.design_goal": "设计目标",
  "circulation.requirement": "交通要求",
  "proposal.design_concept": "设计概念",
  "proposal.concept_statement": "概念说明",
  "proposal.masterplan": "总体布局",
  "circulation.design": "交通组织",
  "proposal.key_spaces": "重点空间",
  "technical.facade": "立面方案",
  "technical.structure": "结构方案",
};

function describeFieldExpression(expression: string) {
  return expression
    .split("|")
    .map((field) => fieldLabels[field] ?? field)
    .join(" / ");
}

function pageStatus(
  projectFacts: DesignReportProjectFacts,
  requiredFields: string[],
  allowPlaceholder = true,
) {
  const missing = requiredFields.filter(
    (field) => !hasField(projectFacts.facts, field),
  );
  return {
    missing: missing.map(describeFieldExpression),
    status:
      missing.length === 0
        ? ("ready" as const)
        : allowPlaceholder
          ? ("placeholder" as const)
          : ("blocked" as const),
  };
}

function planReport(projectFacts: DesignReportProjectFacts) {
  const projectName =
    projectFacts.project_name_anonymized ?? "未命名单项目";
  const designGoal = selectFacts(projectFacts, [
    "evaluation.design_goal",
    "evaluation.priorities",
  ])[0]?.value_raw;
  const plannerReady =
    projectFacts.gate_report?.planner_readiness !== "blocked";
  const sections: DesignReportPagePlan["sections"] = [
    {
      section_id: "S00",
      title_zh: "开篇",
      purpose: "建立项目身份与汇报路径。",
      answers_question: "我们在解决什么项目？",
    },
    {
      section_id: "S01",
      title_zh: "项目理解",
      purpose: "用权威事实说明场地机会与设计边界。",
      answers_question: "项目的核心条件和矛盾是什么？",
    },
    {
      section_id: "S02",
      title_zh: "规划策略",
      purpose: "把任务要求转译为可验证的策略框架。",
      answers_question: "哪些策略能够回应项目的关键条件？",
    },
    {
      section_id: "S03",
      title_zh: "设计概念与空间落实",
      purpose: "说明概念、布局、交通、功能、重点空间与技术证据。",
      answers_question: "策略如何落实为可以被图纸证明的空间？",
    },
    {
      section_id: "S04",
      title_zh: "方案总结",
      purpose: "回收前文已经被证明的项目价值。",
      answers_question: "方案最终回答了哪些评审问题？",
    },
  ];

  const pageSpecs = [
    {
      section: "S00",
      type: "cover" as const,
      title: projectName,
      message: "以匿名项目名称和方案阶段建立汇报起点。",
      fields: ["project.name", "project.design_stage"],
      visuals: ["项目主视觉或场地区位底图", "横版 A3 封面"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "position" as const,
      title: "从城市关系识别场地机会",
      message: "项目区位与周边联系构成后续策略必须回应的空间背景。",
      fields: ["site.location"],
      visuals: ["城市区位图", "周边关系与到达分析"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "data" as const,
      title: "以明确指标建立设计边界",
      message: "用地、强度、高度和规模共同构成不可越过的方案边界。",
      fields: [
        "planning.site_area",
        "planning.far",
        "planning.height_limit",
        "area.total_gfa",
      ],
      visuals: ["四项核心指标卡", "地上地下规模对照"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "analysis" as const,
      title: "把任务要求转译为可回答的问题",
      message: "评审重点、功能要求与场地条件共同建立本项目的设计命题。",
      fields: [
        "evaluation.priorities|evaluation.design_goal|program.primary",
      ],
      visuals: ["任务目标—设计响应矩阵", "3—5 个核心问题图解"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "以策略链回应项目核心条件",
      message: "先依据任务书建立策略框架，再由总图、交通与空间图纸逐项验证。",
      fields: [
        "evaluation.priorities|evaluation.design_goal|circulation.requirement|program.primary",
      ],
      visuals: ["四项连续策略卡", "任务—策略—证据对应关系"],
      placeholder: true,
    },
    {
      section: "S03",
      type: "concept" as const,
      title: "以核心概念统领空间动作",
      message: "设计概念必须由明确的空间组织方式支撑。",
      fields: ["proposal.design_concept", "proposal.concept_statement"],
      visuals: ["概念主图", "概念—空间动作拆解"],
      placeholder: true,
    },
    {
      section: "S03",
      type: "masterplan" as const,
      title: "功能布局与交通系统协同落位",
      message: "功能、公共空间与交通系统在总图层面相互校验。",
      fields: [
        "proposal.masterplan",
        "circulation.design",
        "circulation.requirement",
      ],
      visuals: ["总平面图", "分层交通组织图"],
      placeholder: true,
    },
    {
      section: "S03",
      type: "plan" as const,
      title: "重点空间串联完整公共体验",
      message: "重点空间应形成连续、可识别且有层次的公共序列。",
      fields: ["proposal.key_spaces"],
      visuals: ["首层平面与重点空间索引", "空间序列剖面"],
      placeholder: true,
    },
    {
      section: "S03",
      type: "technical" as const,
      title: "技术策略为设计结论提供落地证据",
      message: "结构与立面结论必须等待专项资料确认后生成。",
      fields: ["technical.facade", "technical.structure"],
      visuals: ["结构体系图", "立面材料与构造节点"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "summary" as const,
      title: "以可追溯证据收束方案价值",
      message: "总结页只收束已经被前文事实和图纸证明的价值。",
      fields: [
        "proposal.design_concept",
        "proposal.masterplan",
        "technical.structure",
      ],
      visuals: ["方案主视觉", "三项已验证价值"],
      placeholder: true,
    },
  ];

  const pages = pageSpecs.map((spec, index) => {
    const statusResult = pageStatus(
      projectFacts,
      spec.fields,
      spec.placeholder,
    );
    const relatedFacts = selectFacts(projectFacts, spec.fields);
    const status = plannerReady ? statusResult.status : "blocked";
    const referenceStyleHint = projectFacts.style_observations?.length
      ? ["cover", "concept", "rendering", "summary"].includes(spec.type)
        ? "历史参考页型：以全幅主视觉和短篇幅双语标题建立单页结论"
        : ["masterplan", "plan", "technical"].includes(spec.type)
          ? "历史参考页型：图纸占据主要版面，以统一色彩和短标签组织证据"
          : "历史参考页型：分析白底、图解主导，并保持左上章节定位"
      : null;
    return buildPage(
      index + 1,
      spec.section,
      spec.type,
      spec.title,
      spec.message,
      relatedFacts,
      referenceStyleHint ? [...spec.visuals, referenceStyleHint] : spec.visuals,
      statusResult.missing,
      status,
    );
  });

  return {
    narrative_claim:
      designGoal
        ? `围绕“${String(designGoal)}”组织全篇，并以可追溯的空间、图纸与技术证据逐页验证。`
        : "以任务书明确的场地、指标、功能与评审要求为边界，建立从问题、策略到空间证据的完整叙事。",
    page_format: "A3_landscape_420x297mm",
    language_mode: "zh",
    target_page_count: pages.length,
    sections,
    pages,
  } satisfies DesignReportPagePlan;
}

function factDisplay(fact: ProjectFact) {
  const raw = String(fact.value_raw);
  const labels: Record<string, string> = {
    "planning.site_area": "用地面积",
    "planning.far": "容积率",
    "planning.height_limit": "建筑限高",
    "area.total_gfa": "总建筑面积",
    "area.above_ground_gfa": "地上建筑面积",
    "area.below_ground_gfa": "地下建筑面积",
    "proposal.design_concept": "设计概念",
    "site.location": "项目区位",
  };
  return `${labels[fact.field_path] ?? fact.source.location_note ?? fact.field_path}：${raw}`;
}

function authoritativeFirst(facts: ProjectFact[]) {
  return [...facts].sort((a, b) => {
    if (a.source_role === b.source_role) return 0;
    return a.source_role === "brief_fact" ? -1 : 1;
  });
}

function composeBody(page: ReportPage, facts: ProjectFact[]) {
  const byPath = new Map<string, ProjectFact>();
  authoritativeFirst(facts).forEach((fact) => {
    if (!byPath.has(fact.field_path)) byPath.set(fact.field_path, fact);
  });
  const get = (path: string) =>
    byPath.has(path) ? String(byPath.get(path)?.value_raw) : "";

  switch (page.page_type) {
    case "cover":
      return `${get("project.name")}处于${get("project.design_stage")}阶段。本次汇报将以权威项目条件为起点，逐页建立可追溯的设计证据。`;
    case "position":
      return `${get("site.location")}。本页先以权威区位与周边关系识别场地机会，不把尚未形成的设计动作写成既成结论。`;
    case "data":
      return `任务书明确：用地面积${get("planning.site_area")}，容积率${get("planning.far")}，建筑限高${get("planning.height_limit")}，总建筑面积${get("area.total_gfa")}。这些指标共同界定体量、功能与空间组织的基本边界。`;
    case "analysis":
      return `项目的评审重点为${get("evaluation.priorities") || get("evaluation.design_goal")}。后续策略与空间页面需逐项回应这些要求，并配置相应图纸或分析图作为证据。`;
    case "strategy":
      return `任务书已经明确的策略驱动包括：${[
        get("evaluation.priorities") || get("evaluation.design_goal"),
        get("circulation.requirement"),
        get("program.primary"),
      ]
        .filter(Boolean)
        .join("；")}。本页将这些要求组织为待总图、交通与空间图纸逐项验证的策略框架。`;
    case "concept":
      return `方案以“${get("proposal.design_concept")}”为核心概念。${get("proposal.concept_statement")}。概念由可识别的空间动作支撑，而不是脱离图纸的口号。`;
    case "masterplan":
      return `${get("proposal.masterplan")}。交通方面，${get("circulation.design") || get("circulation.requirement")}。总图需通过功能落位、公共空间和流线组织的叠合图进一步验证。`;
    case "plan":
      return `方案提出${get("proposal.key_spaces")}。这些空间应在首层平面与剖面中形成连续序列，并分别标注到达方式、开放属性和相互关系。`;
    case "summary":
      return `方案以“${get("proposal.design_concept")}”统领总体布局，并通过已确认的功能与交通组织回应项目目标。技术结论尚未闭合前，总结页不延伸材料、结构或性能判断。`;
    default:
      return "";
  }
}

export function generateSinglePage(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  pageId: string,
) {
  const clonedPlan = structuredClone(pagePlan);
  const page = clonedPlan.pages.find((candidate) => candidate.page_id === pageId);
  if (!page) throw new Error(`Page not found: ${pageId}`);

  if (page.generation_status === "blocked") {
    page.body_copy = "";
    page.speaker_notes = "证据不足，本页保持阻断状态。";
    return clonedPlan;
  }

  const facts = page.fact_refs
    .map((factId) =>
      projectFacts.facts.find((fact) => fact.fact_id === factId),
    )
    .filter((fact): fact is ProjectFact => Boolean(fact));

  if (page.generation_status === "placeholder" || facts.length === 0) {
    page.body_copy = `本页暂不生成设计结论。待补充：${page.missing_information.join("、") || "对应方案证据"}。`;
    page.diagram_labels = [];
    page.speaker_notes = "只说明资料缺口，不把任务要求改写为既成设计成果。";
    page.generation_status = "placeholder";
    return clonedPlan;
  }

  page.body_copy = composeBody(page, facts);
  page.body_zh = page.body_copy;
  page.diagram_labels = authoritativeFirst(facts)
    .slice(0, 6)
    .map(factDisplay);
  page.speaker_notes = `本页结论仅引用 ${facts.length} 条事实。讲述时先说结论，再说明设计动作，最后指出需要由图纸验证的部分。`;
  page.callouts = page.diagram_labels.slice(0, 6).map((label, index) => ({
    label_zh: label,
    fact_ref: facts[index]?.fact_id,
  })) as ReportPage["callouts"];
  page.generation_status = "generated";
  return clonedPlan;
}

function extractNumbers(text: string) {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) =>
    match[0].replace(/,/g, ""),
  );
}

export function auditGeneratedPages(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  const clonedPlan = structuredClone(pagePlan);
  const generatedPages = clonedPlan.pages.filter((page) =>
    ["generated", "reviewed"].includes(page.generation_status),
  );
  const issues: NonNullable<
    DesignReportPagePlan["audit_report"]
  >["issues"] = [];
  const factIds = new Set(projectFacts.facts.map((fact) => fact.fact_id));

  for (const page of generatedPages) {
    const missingRefs = page.fact_refs.filter((factId) => !factIds.has(factId));
    if (missingRefs.length) {
      issues.push({
        severity: "blocking",
        pages: [page.page_id],
        issue: "页面引用了不存在的事实编号。",
        evidence: missingRefs.join("、"),
        fact_refs: missingRefs,
        recommended_fix: "退回事实提取节点，恢复有效 fact_refs 后再生成。",
      });
    }

    const citedFacts = page.fact_refs
      .map((factId) =>
        projectFacts.facts.find((fact) => fact.fact_id === factId),
      )
      .filter((fact): fact is ProjectFact => Boolean(fact));
    const allowedNumbers = new Set(
      citedFacts.flatMap((fact) => extractNumbers(String(fact.value_raw))),
    );
    const unsupportedNumbers = extractNumbers(page.body_copy).filter(
      (number) => !allowedNumbers.has(number),
    );
    if (unsupportedNumbers.length) {
      issues.push({
        severity: "major",
        pages: [page.page_id],
        issue: "正文包含未被事实引用支持的数字。",
        evidence: [...new Set(unsupportedNumbers)].join("、"),
        fact_refs: page.fact_refs,
        recommended_fix: "删除该数字或补充带页码与原文引用的事实。",
      });
    }

    if (/有限公司|建筑师|资质|联系电话|团队成员/.test(page.body_copy)) {
      issues.push({
        severity: "blocking",
        pages: [page.page_id],
        issue: "设计文案混入公司身份信息。",
        evidence: "检测到公司、团队或联系方式相关词语。",
        fact_refs: page.fact_refs,
        recommended_fix: "删除身份信息并重新运行文案生成。",
      });
    }

    const conflictFacts = citedFacts.filter(
      (fact) => fact.status === "conflict",
    );
    if (conflictFacts.length) {
      issues.push({
        severity: "major",
        pages: [page.page_id],
        issue: "页面引用的字段存在未解决冲突。",
        evidence: conflictFacts.map(factDisplay).join("；"),
        fact_refs: conflictFacts.map((fact) => fact.fact_id),
        recommended_fix: "确认采用值并在事实库记录冲突处理结果。",
      });
    }

    page.generation_status = "reviewed";
  }

  const seenMessages = new Map<string, string>();
  for (const page of generatedPages) {
    const existing = seenMessages.get(page.core_message);
    if (existing) {
      issues.push({
        severity: "minor",
        pages: [existing, page.page_id],
        issue: "两个页面使用了完全相同的核心结论。",
        evidence: page.core_message,
        fact_refs: [],
        recommended_fix: "合并页面或重新划分每页唯一结论。",
      });
    }
    seenMessages.set(page.core_message, page.page_id);
  }

  clonedPlan.audit_report = {
    reviewed_page_ids: generatedPages.map((page) => page.page_id),
    issues,
    summary:
      generatedPages.length === 0
        ? "尚无已生成页面可供审核。"
        : `已审核 ${generatedPages.length} 页，发现 ${issues.length} 项问题。`,
  };
  return clonedPlan;
}

export function runPipeline(
  inputs: InputDocument[],
  projectId = "SINGLE_PROJECT",
): PipelineResult {
  const registrationOutput = buildRegistrationOutput(inputs);
  const extracted = extractFacts(inputs, projectId);
  const checked = checkCompleteness(extracted);
  const planned = planReport(checked);
  const nodeOutputs: NodeOutput[] = [
    {
      node: "registration",
      execution: "local_rule",
      model_calls: 0,
      output: registrationOutput,
    },
    {
      node: "fact_extraction",
      execution: "local_rule",
      model_calls: 0,
      output: extracted,
    },
    {
      node: "completeness",
      execution: "local_rule",
      model_calls: 0,
      output: checked.gate_report,
    },
    {
      node: "planner",
      execution: "local_rule",
      model_calls: 0,
      output: planned,
    },
  ];

  return {
    projectFacts: checked,
    pagePlan: planned,
    nodeOutputs,
    modelCallCount: 0,
  };
}
