import type {
  DesignReportNarrative,
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  DEFAULT_REFERENCE_ID,
  defaultReferenceStyleExamples,
} from "@/app/lib/reference-style-examples";
import {
  assignExperienceRecipesForPlan,
  defaultReferenceExperience,
  experienceLayoutRequirementsForRecipes,
} from "@/app/lib/reference-experience";
import {
  styleExampleRefsForPage,
  styleGuidanceForPage,
  styleLayoutRequirements,
} from "@/app/lib/style-retrieval";
import { DEFAULT_TARGET_PAGE_COUNT } from "@/app/lib/report-config";
import {
  DEFAULT_TASK_MODE,
  isolateSmallBuildingProjectFacts,
  isSmallBuildingMode,
  type TaskMode,
} from "@/app/lib/task-mode";
import { synchronizeProposalCoverage } from "@/app/lib/gate-b-proposals";
import {
  contextualDiagramLabels,
  normalizePageHeadline,
} from "@/app/lib/presentation-copy";
import { localCultureFusionProposal } from "@/app/lib/local-culture-fusion";
import {
  ensureSmallModeDesignDirectionState,
  smallModeDesignDirectionFacts,
} from "@/app/lib/small-mode-design-directions";
import {
  englishCoreFallback,
  englishLabelFallback,
  englishPresentationText,
  pageTypeEnglishLabels,
} from "@/app/lib/bilingual-copy";
import { evaluatePageContentDepth } from "@/app/lib/content-depth";

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
  file_data?: string;
  mime_type?: string;
  visual_pages?: Array<{
    page_number: number;
    data_url: string;
    reason: string;
    text_excerpt: string;
  }>;
}

export interface NodeOutput {
  node:
    | "registration"
    | "fact_extraction"
    | "site_research"
    | "fact_revision"
    | "user_proposal"
    | "completeness"
    | "planner"
    | "page_addition"
    | "page_text_translation"
    | "page_generation"
    | "gate_b_proposal"
    | "visual_planning"
    | "visual_image_generation"
    | "export_preparation"
    | "consistency_audit";
  execution: "local_rule" | "openai_model" | "local_fallback";
  model_calls: number;
  model?: string;
  response_id?: string;
  token_usage?: {
    input: number;
    output: number;
  };
  image_count?: number;
  fallback_reason?: string;
  output: unknown;
}

export interface PipelineResult {
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  nodeOutputs: NodeOutput[];
  modelCallCount: number;
  executionMode?: "openai_model" | "local_rule" | "local_fallback";
  modelName?: string;
  analysisMode?: "fast" | "deep";
  designNarrative?: DesignReportNarrative;
  siteResearch?: {
    status: "completed" | "partial" | "skipped";
    summary: string;
    factCount: number;
    warnings: string[];
  };
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
    labels: ["评审重点", "评审条件", "评审要求", "评价标准", "评分标准"],
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
    labels: ["成果要求", "设计文本尺寸", "页面尺寸", "图纸尺寸", "尺寸"],
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
  ["项目身份", "project.name|project.design_stage"],
  [
    "基本任务信息",
    "site.location|program.primary|evaluation.priorities|evaluation.design_goal",
  ],
] as const;

const gateBRequirements = [
  ["设计目标", "evaluation.design_goal"],
  ["评审条件", "evaluation.priorities"],
  ["设计概念", "proposal.design_concept"],
  ["总体布局", "proposal.masterplan"],
  ["交通组织", "circulation.design"],
  ["重点空间", "proposal.key_spaces"],
  ["立面方案", "technical.facade"],
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
  const compactNormalized = normalized.replace(/\s+/g, "");
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
  const location = compactNormalized.match(
    /(?:项目|(?:DK\s*\d+\s*)?地块|马场)(?:基地)?位(?:于|处)([^；;]{2,240})/i,
  );
  if (location) {
    const isDetailedParcelLocation = /DK\d+地块/i.test(compactNormalized);
    return {
      fieldPath: isDetailedParcelLocation
        ? "site.location_detail"
        : "site.location",
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
  const referenceStyleExamples: NonNullable<
    DesignReportProjectFacts["reference_style_examples"]
  > = [];
  let referenceExperience: DesignReportProjectFacts["reference_experience"];

  for (const input of inputs) {
    if (input.role === "company_info" || input.role === "unknown") continue;

    const pages = splitPages(input.text);
    if (input.role === "reference_style") {
      if (input.document_id === DEFAULT_REFERENCE_ID) {
        referenceStyleExamples.push(...defaultReferenceStyleExamples);
        referenceExperience = defaultReferenceExperience;
      }
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
        const labeledSegments = line
          .split(/[；;]/u)
          .map((segment) => segment.trim())
          .filter(Boolean)
          .flatMap((segment) => {
            const matched = factRules
              .flatMap((rule) =>
                rule.labels.map((label) => ({
                  rule,
                  label,
                  value: readLabeledValue(segment, label),
                })),
              )
              .find((item) => item.value !== null);
            return matched ? [{ ...matched, quote: segment }] : [];
          });
        const fallback = labeledSegments.length ? null : fallbackFactForLine(line);
        const candidates = labeledSegments.length
          ? labeledSegments.map((matched) => ({ matched, fallback: null }))
          : fallback
            ? [{ matched: null, fallback }]
            : [];

        for (const candidate of candidates) {
          const matched = candidate.matched;
          const fallbackFact = candidate.fallback;
          if (
            fallbackFact &&
            facts.some(
              (fact) =>
                fact.field_path === fallbackFact.fieldPath &&
                fact.source.document_id === input.document_id,
            )
          ) {
            continue;
          }

          const rule = matched?.rule;
          const fieldPath = rule?.fieldPath ?? fallbackFact!.fieldPath;
          const valueRaw = matched?.value ?? fallbackFact!.value;
          if (
            facts.some(
              (fact) =>
                fact.field_path === fieldPath &&
                fact.source.document_id === input.document_id &&
                fact.value_raw === valueRaw,
            )
          ) {
            continue;
          }

          const label = matched?.label ?? fallbackFact!.locationNote;
          const factIndex = facts.length + 1;
          facts.push({
            fact_id: `F_${String(factIndex).padStart(3, "0")}`,
            category: rule?.category ?? fallbackFact!.category,
            field_path: fieldPath,
            value_raw: valueRaw,
            value_normalized: (rule?.normalize ?? cleanText)(valueRaw),
            unit: rule?.unit ?? null,
            source: {
              document_id: input.document_id,
              page,
              location_note: label,
              quote: matched?.quote ?? line,
            },
            source_role: rule?.sourceRole ?? roleToSourceRole(input.role),
            confidence: matched ? 1 : 0.85,
            status: "confirmed",
            notes: matched ? "" : "由页面自然语言规则提取，建议人工复核。",
          });
        }
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
    language_mode: "zh_en",
    ignore_company_info: true,
    documents,
    facts,
    style_observations: styleObservations,
    reference_style_examples: referenceStyleExamples,
    reference_experience: referenceExperience,
    conflicts,
    missing_items: [],
  } satisfies DesignReportProjectFacts;
}

function appendSmallBriefFact(
  facts: ProjectFact[],
  input: InputDocument,
  page: number,
  fieldPath: string,
  valueRaw: string,
  category: FactCategory,
  sourceQuote = valueRaw,
) {
  const value = cleanText(valueRaw);
  if (!value || facts.some((fact) => fact.field_path === fieldPath && fact.value_raw === value)) {
    return;
  }
  facts.push({
    fact_id: `F_${String(facts.length + 1).padStart(3, "0")}`,
    category,
    field_path: fieldPath,
    value_raw: value,
    value_normalized: value,
    unit: null,
    source: {
      document_id: input.document_id,
      page,
      location_note: "小型任务书专项提取",
      quote: sourceQuote.trim(),
    },
    source_role: input.role === "proposal" ? "proposal_fact" : "brief_fact",
    confidence: 1,
    status: "confirmed",
    notes: "从任务书原文直接提取；不是 Agent 追加的设计结论。",
  });
}

function enrichSmallBuildingBriefFacts(
  inputs: InputDocument[],
  projectFacts: DesignReportProjectFacts,
) {
  const facts = [...projectFacts.facts];
  for (const input of inputs) {
    if (!(["authoritative", "proposal"] as SourceRole[]).includes(input.role)) {
      continue;
    }
    for (const { page, lines } of splitPages(input.text)) {
      const pageText = lines.join("\n");
      if (!/(装置\s*[1-3]|泡茶水|斗器大会|轻国风|IP|复用)/iu.test(pageText)) {
        continue;
      }
      if (/景德镇举办斗器大会/u.test(pageText)) {
        appendSmallBriefFact(facts, input, page, "project.name", "景德镇斗器大会", "project");
        appendSmallBriefFact(facts, input, page, "site.city", "景德镇", "site");
        const eventPositioning =
          pageText.match(
            /景德镇举办斗器大会[\s\S]*?(?=三个装置的设计思路|装置\s*1\s*[：:])/u,
          )?.[0] ?? pageText;
        appendSmallBriefFact(
          facts,
          input,
          page,
          "event.positioning",
          eventPositioning.replace(/\s+/g, " "),
          "project",
          eventPositioning,
        );
      }
      const launch = pageText.match(/([^。；]*新产品[^。；]*发布会[^。；]*[。；]?)/u)?.[1];
      if (launch) {
        appendSmallBriefFact(
          facts,
          input,
          page,
          "event.product_launch",
          launch.replace(/\s+/g, " "),
          "program",
          launch,
        );
      }
      const slogan = pageText.match(/(?:slogan|口号)\s*[:：]\s*([^\n。]+)/iu)?.[1];
      if (slogan) appendSmallBriefFact(facts, input, page, "brand.slogan", slogan, "evaluation_priority", slogan);

      for (const match of pageText.matchAll(
        /装置\s*([1-3])\s*[：:]\s*([\s\S]*?)(?=\s*装置\s*[1-3]\s*[：:]|\s*需求\s*[：:]|$)/gu,
      )) {
        const installationId = match[1];
        const segmentSource = match[2];
        const segment = segmentSource.replace(/\s+/g, " ").trim();
        if (!segment) continue;
        appendSmallBriefFact(
          facts,
          input,
          page,
          `installation.${installationId}.sequence`,
          `装置${installationId}`,
          "proposal_design",
        );
        appendSmallBriefFact(
          facts,
          input,
          page,
          `installation.${installationId}.brief`,
          segment,
          "proposal_design",
          segmentSource,
        );
        const coreSource = segmentSource.match(
          /核心\s*[：:]\s*([\s\S]*?)(?=[。；;]|这个装置会赠送产品\s*[：:]|$)/u,
        )?.[1];
        const core = coreSource?.replace(/\s+/g, " ").trim();
        if (core) {
          appendSmallBriefFact(
            facts,
            input,
            page,
            `installation.${installationId}.core`,
            core,
            "proposal_design",
            coreSource,
          );
        }
        const giftSource = segmentSource.match(
          /这个装置会赠送产品\s*[：:]\s*([\s\S]*?)(?=[。；;]|$)/u,
        )?.[1];
        const gift = giftSource?.replace(/\s+/g, " ").trim();
        if (gift) {
          appendSmallBriefFact(facts, input, page, `installation.${installationId}.product`, gift, "program", giftSource);
          appendSmallBriefFact(facts, input, page, `installation.${installationId}.gift`, gift, "program", giftSource);
        }
        if (/互动|共创|观众/u.test(segment)) {
          appendSmallBriefFact(facts, input, page, `installation.${installationId}.interaction`, segment, "space_requirement");
        }
        if (installationId === "2" && /低矿化|低硬度|茶叶|茶香|山泉水泡茶/u.test(segment)) {
          appendSmallBriefFact(facts, input, page, "installation.2.product_performance", segment, "evaluation_priority");
        }
        if (installationId === "3" && /瓷都文化|品茗习惯|瓷器融合/u.test(segment)) {
          appendSmallBriefFact(facts, input, page, "installation.3.cultural_theme", segment, "proposal_design");
        }
      }

      for (const [fieldPath, pattern, category] of [
        ["design_requirement.style", /造型需要[^。]*。?/u, "proposal_design"],
        ["design_requirement.interaction", /装置需要和观众产生互动[^。]*。?/u, "space_requirement"],
        ["design_requirement.reuse", /装置需要考虑复用[^。]*。?/u, "technical_requirement"],
        ["ip.requirement", /另外需要考虑设计[^。]*。?/u, "proposal_design"],
      ] as const) {
        const value = pageText.match(pattern)?.[0];
        if (value) {
          appendSmallBriefFact(
            facts,
            input,
            page,
            fieldPath,
            value.replace(/\s+/g, " "),
            category,
            value,
          );
        }
      }
      if (/社交账号|扩大传播/u.test(pageText)) {
        appendSmallBriefFact(
          facts,
          input,
          page,
          "design_requirement.social_spread",
          "游客主动上传社交账号，扩大传播",
          "evaluation_priority",
        );
      }
      if (/真人穿着|现场.*互动/u.test(pageText)) {
        appendSmallBriefFact(
          facts,
          input,
          page,
          "ip.live_activation",
          "现场会有真人穿着与 IP 一致的服装和观众互动",
          "space_requirement",
        );
      }
    }
  }
  const projectName = facts.find((fact) => fact.field_path === "project.name")?.value_raw;
  return {
    ...projectFacts,
    project_name_anonymized:
      typeof projectName === "string"
        ? projectName
        : projectFacts.project_name_anonymized,
    facts,
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

export function checkCompleteness(projectFacts: DesignReportProjectFacts) {
  const smallMode = isSmallBuildingMode(
    projectFacts.task_mode ?? DEFAULT_TASK_MODE,
  );
  const gateAMissing = gateARequirements
    .filter(([, field]) => !hasField(projectFacts.facts, field))
    .map(([label]) => label);
  const gateBMissing = gateBRequirements
    .filter(([, field]) => !hasField(projectFacts.facts, field))
    .map(([label]) => label);
  const hasCurrentProjectDocument = projectFacts.documents.some((document) =>
    ["authoritative", "proposal"].includes(document.role),
  );
  const hasCurrentProjectEvidence = projectFacts.facts.some(
    (fact) =>
      (fact.source_role === "brief_fact" ||
        fact.source_role === "proposal_fact") &&
      fact.status !== "superseded",
  );
  if (smallMode) {
    const ready = hasCurrentProjectDocument && hasCurrentProjectEvidence;
    const directionFacts = smallModeDesignDirectionFacts(projectFacts);
    const directionGap = projectFacts.gate_b_proposals?.some(
      (proposal) =>
        proposal.missing_item_id === "M_SMALL_DESIGN_DIRECTION" &&
        proposal.status === "confirmed",
    )
      ? []
      : directionFacts.length
        ? []
        : ["设计方向"];
    return {
      ...projectFacts,
      missing_items: directionGap.length
        ? [
            {
              item_id: "M_SMALL_DESIGN_DIRECTION",
              description: "Gate B 缺少：设计方向",
              severity: "important" as const,
              blocks: [] as ("planner" | "page_generation" | "consistency_review")[],
              suggested_source:
                "优先采用任务书方向；若任务书未明确，Agent 已生成三个可编辑候选方向。",
            },
          ]
        : [],
      gate_report: {
        planner_readiness: ready ? ("ready" as const) : ("blocked" as const),
        generation_readiness: ready ? ("ready" as const) : ("blocked" as const),
        gate_a_missing: [],
        gate_b_missing: directionGap,
        summary: ready
          ? "小型建筑/装置管线已跳过 Gate B 阻断，页面直接依据任务书事实、任务书方向和用户提案生成。"
          : "尚未读取到可用的任务书事实。",
      },
    } satisfies DesignReportProjectFacts;
  }
  const plannerReadiness =
    !hasCurrentProjectDocument || !hasCurrentProjectEvidence
      ? ("blocked" as const)
      : gateAMissing.length === 0
        ? ("ready" as const)
        : ("partial" as const);

  const missingItems: DesignReportProjectFacts["missing_items"] = [
    ...gateAMissing.map((description, index) => ({
      item_id: `M_A_${String(index + 1).padStart(3, "0")}`,
      description: `Gate A 缺少：${description}`,
      severity:
        plannerReadiness === "blocked"
          ? ("blocking" as const)
          : ("important" as const),
      blocks:
        plannerReadiness === "blocked"
          ? ["planner" as const]
          : [],
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

  const generationReadiness =
    plannerReadiness === "blocked"
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
  styleExampleRefs: string[],
  experienceRecipeRefs: string[],
  missingInformation: string[],
  status: "ready" | "placeholder" | "blocked",
): ReportPage {
  const normalizedHeadline = normalizePageHeadline(headline, "当前页");
  return {
    page_id: `P${String(index).padStart(3, "0")}`,
    display_page_number: index,
    section_id: sectionId,
    page_type: pageType,
    core_message: coreMessage,
    core_message_en: englishCoreFallback(pageType),
    headline_zh: normalizedHeadline,
    headline_en: englishPresentationText(
      normalizedHeadline,
      pageTypeEnglishLabels[pageType],
    ),
    body_zh: "",
    body_en: "",
    body_copy: "",
    diagram_labels: [],
    diagram_labels_en: [],
    speaker_notes: "",
    visual_requirements: visualRequirements,
    callouts: [],
    visual_brief: visualRequirements,
    style_example_refs: styleExampleRefs,
    experience_recipe_refs: experienceRecipeRefs,
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
  "area.above_ground_gfa": "地上建筑面积",
  "area.below_ground_gfa": "地下建筑面积",
  "program.primary": "主要功能",
  "evaluation.priorities": "评审重点",
  "evaluation.design_goal": "设计目标",
  "deliverable.page_format": "成果规格",
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

function planSmallBuildingOrInterior(projectFacts: DesignReportProjectFacts) {
  const validFacts = projectFacts.facts.filter(
    (fact) => fact.status !== "superseded" && fact.status !== "conflict",
  );
  const briefFacts = validFacts.filter((fact) => fact.source_role === "brief_fact");
  const sourceFacts = (patterns: RegExp[]) => validFacts.filter((fact) =>
    patterns.some((pattern) => pattern.test(`${fact.field_path} ${String(fact.value_raw)}`)),
  );
  const installationFacts = (installationId: string) =>
    validFacts.filter((fact) => fact.field_path.startsWith(`installation.${installationId}.`));
  const sharedRequirements = sourceFacts([/^design_requirement\./u, /^brand\./u, /^event\./u]);
  const allBriefFacts = briefFacts.length ? briefFacts : validFacts;
  const sections: DesignReportPagePlan["sections"] = [
    {
      section_id: "S00",
      title_zh: "项目定位",
      title_en: "PROJECT POSITIONING",
      purpose: "把活动、产品、城市文化语境与汇报目标建立成清晰入口。",
      answers_question: "这是什么活动，为什么要做三件装置？",
    },
    {
      section_id: "S01",
      title_zh: "三件装置策略",
      title_en: "THREE INSTALLATION STRATEGIES",
      purpose: "逐件拆解产品主题、装置核心、互动方式、赠品和视觉表达。",
      answers_question: "三件装置分别如何回应三类产品主题？",
    },
    {
      section_id: "S02",
      title_zh: "IP与现场传播",
      title_en: "IP & LIVE ACTIVATION",
      purpose: "将轻国风少女 IP、真人互动、观众共创与社交传播组织成独立证据。",
      answers_question: "观众如何参与、记住并传播这场活动？",
    },
    {
      section_id: "S03",
      title_zh: "实施与复用",
      title_en: "DELIVERY & REUSE",
      purpose: "只依据任务书要求说明搭建、收起、复用、活动现场和交付边界。",
      answers_question: "方案如何落地并在下一年继续使用？",
    },
    {
      section_id: "S04",
      title_zh: "设计总结",
      title_en: "DESIGN SUMMARY",
      purpose: "回收三件装置、现场互动、传播与年度复用之间已经建立的设计关系。",
      answers_question: "这套小型建筑/装置方案最终形成了什么设计系统？",
    },
  ];
  const pages: ReportPage[] = [];
  const add = (
    sectionId: string,
    pageType: ReportPage["page_type"],
    headline: string,
    message: string,
    facts: ProjectFact[],
    visuals: string[],
    missing: string[] = [],
  ) => {
    pages.push(
      buildPage(
        pages.length + 1,
        sectionId,
        pageType,
        headline,
        message,
        facts,
        visuals,
        [],
        [],
        missing,
        missing.length ? "placeholder" : "ready",
      ),
    );
  };

  const projectFactsForCover = sourceFacts([/^project\./u, /^event\./u, /^site\.city$/u]);
  add(
    "S00",
    "cover",
    String(projectFactsForCover.find((fact) => fact.field_path === "project.name")?.value_raw ?? projectFacts.project_name_anonymized ?? "小型建筑/装置设计"),
    "三大主题装置设计方案汇报：围绕“真、甜、器”串联产品发布会、观众互动与年度复用。",
    projectFactsForCover,
    ["活动主视觉", "景德镇城市文化语境", "三件装置与三类产品主题", "项目名称与汇报副标题"],
  );
  add(
    "S01",
    "strategy",
    "活动背景与发布会任务",
    "斗器大会同时承担三类产品主题表达与新产品发布会任务，装置不是孤立的造型，而是活动传播和产品体验的载体。",
    sourceFacts([/^event\.|^brand\.|^project\.|^site\./u]),
    ["活动背景", "新产品发布会主张", "三件装置任务关系", "活动—产品—装置关系"],
  );
  add(
    "S01",
    "comparison",
    "三类产品与三件装置的主题矩阵",
    "用“真、甜、器”建立三件装置的共同叙事骨架，分别对应产品记忆、互动体验、赠品和视觉关键词。",
    sourceFacts([/^installation\./u, /^brand\./u]),
    ["三件装置并列对照", "产品主题标签", "核心体验与赠品", "主题关键词关系"],
  );

  add("S01", "strategy", "共同设计语言：轻国风、强互动、可传播", "三件装置共享轻国风的年轻化视觉语汇，同时以主动参与、可拍摄和可分享的行为建立统一的现场体验；共同语言保持一致，三件装置的产品主题和互动动作保持差异。", sourceFacts([/^design_requirement\./u]), ["共同视觉语言", "轻国风色彩与材料", "观众参与动作", "社交传播触点"]);
  add("S01", "strategy", "从看见到参与：现场体验如何发生", "观众先通过清晰的装置形象建立识别，再在触摸、品鉴、共创或其他任务书明确的参与动作中形成记忆，最后通过产品、赠品或社交分享把体验带离现场。页面只采用任务书已有的行为要求，不补造未确认的运营流程。", sourceFacts([/^design_requirement\./u, /^installation\./u, /^ip\./u]), ["看见与识别", "参与动作", "产品或赠品触点", "分享与记忆"]);
  add("S01", "concept", "装置1｜山泉水的“真”", "围绕“真”建立较为艺术、强互动且不直接具象化的装置体验，引导观众联想到泉水源头的优质、澄澈、真实与天然。", installationFacts("1"), ["产品诉求", "装置转译", "空间形态", "互动动作", "材料灯光", "传播与复用"]);
  add("S01", "rendering", "装置1｜从源头联想到产品", "本页把装置1的核心、互动和赠品拆成独立视觉证据，画面重点是体验发生的瞬间，而不是单纯展示一个造型。", installationFacts("1"), ["观众与装置互动场景", "水感、澄澈、自然的材料氛围", "产品露出位置", "社交打卡构图"]);
  add("S01", "technical", "装置1｜搭建、赠送与复用边界", "围绕装置1的赠品、活动使用和年度复用组织落地表达；结构、尺寸与材料参数留待深化。", [...installationFacts("1"), ...sharedRequirements], ["可收起装置的构造意向", "赠品领取动作", "活动后收纳逻辑", "待深化信息清单"]);

  add("S01", "concept", "装置2｜泡茶水的“甜”", "通过低矿化、低硬度与激发茶香的产品特性，建立“真山泉，泡茶甜”的可感知体验，不把产品卖点停留在文字说明。", installationFacts("2"), ["产品诉求", "装置转译", "空间形态", "互动动作", "材料灯光", "传播与复用"]);
  add("S01", "rendering", "装置2｜让“泡茶甜”成为互动体验", "把泡茶、闻香、品鉴和观众参与转译为艺术化场景，画面强调年轻观众主动停留与分享的动作。", installationFacts("2"), ["泡茶互动场景", "茶水与器物关系", "观众参与动作", "轻国风氛围与社交打卡"]);
  add("S01", "technical", "装置2｜产品发布会的体验节点", "装置2既是活动装置，也是浮梁泡茶水的发布会节点；页面同时呈现赠品、互动和可复用的运营逻辑。", [...installationFacts("2"), ...sharedRequirements], ["发布会体验节点", "产品试饮/赠送场景", "现场运营动作", "收起与再部署意向"]);

  add("S01", "concept", "装置3｜斗器大会·瓷之器", "装置3紧扣斗器大会主题，与瓷器融合，表达景德镇悠长的瓷都文化和密不可分的品茗习惯。", installationFacts("3"), ["产品诉求", "装置转译", "空间形态", "互动动作", "材料灯光", "传播与复用"]);
  add("S01", "rendering", "装置3｜从瓷都文化到共创现场", "画面将瓷胚、釉水、茶器和观众共创动作组织为一个可拍摄、可传播的现场体验。", installationFacts("3"), ["瓷胚/釉水共创场景", "观众参与动作", "瓷茶杯与品茗体验", "文化氛围而非古典复刻"]);
  add("S01", "technical", "装置3｜共创、赠品与年度复用", "围绕瓷胚共创、定制品赠送和年度复用组织落地表达；工艺参数与永久建筑属性留待深化。", [...installationFacts("3"), ...sharedRequirements], ["共创工作台", "定制瓷茶杯领取", "装置收起与再利用", "活动运营注意事项"]);

  add("S01", "comparison", "三件装置的体验与传播分工", "三件装置共同形成从“真”到“甜”再到“器”的体验链条，分别承担产品认知、发布会体验和文化记忆。", [...installationFacts("1"), ...installationFacts("2"), ...installationFacts("3")], ["三件装置对照矩阵", "产品—互动—赠品—传播四列", "观众体验节奏", "视觉风格统一规则"]);
  add("S02", "concept", "轻国风少女 IP：从平面形象到现场角色", "任务书明确要求设计现代年轻人喜欢的轻国风少女 IP，并由真人穿着一致服装与观众互动；本页拆解形象、服装和动作使用。", sourceFacts([/^ip\./u]), ["IP 三视/表情/动作", "轻国风服装关键词", "真人互动姿态", "平面 IP 使用边界"]);
  add("S02", "rendering", "IP与三件装置的现场联动", "IP不是孤立插画，而是串联三件装置、赠品领取、观众共创和社交传播的现场引导角色。", [...sourceFacts([/^ip\./u]), ...sourceFacts([/^design_requirement\./u])], ["真人与观众互动", "IP引导打卡", "赠品领取动作", "社交上传场景"]);
  add("S03", "technical", "搭建、收起与明年复用", "装置按活动周期使用：今年搭建并服务开幕式传播，活动后收起，明年再次部署。", sourceFacts([/^design_requirement\.reuse$/u, /^design_requirement\.style$/u]), ["搭建—使用—收起—再部署四阶段", "模块化收纳意向", "现场运营与维护", "年度活动复用"]);
  add("S04", "summary", "设计总结：三件装置、一套传播系统", "以“真、甜、器”为主线，收束为三件装置、一个轻国风 IP、两类互动机制和一套可复用的活动运营方式。", allBriefFacts, ["三件装置总览", "产品与文化主题", "互动与传播", "复用与下一年度部署", "统一视觉母题"]);

  return {
    task_mode: "small_building_or_interior" as const,
    narrative_claim: "以任务书明确的活动目标、三类产品主题、三件装置要求与 IP 运营边界为依据，把单张概念总图拆解成信息不少于原始方案单页的完整汇报。",
    page_format: "A3_landscape_420x297mm" as const,
    language_mode: "zh_en" as const,
    target_page_count: pages.length,
    sections,
    pages,
  } satisfies DesignReportPagePlan;
}

export function planReport(
  projectFacts: DesignReportProjectFacts,
  taskMode: TaskMode = projectFacts.task_mode ?? DEFAULT_TASK_MODE,
) {
  if (isSmallBuildingMode(taskMode)) {
    return planSmallBuildingOrInterior(projectFacts);
  }
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
      title_en: "OPENING",
      purpose: "建立项目身份与汇报路径。",
      answers_question: "我们在解决什么项目？",
    },
    {
      section_id: "S01",
      title_zh: "项目理解",
      title_en: "PROJECT UNDERSTANDING",
      purpose: "用权威事实说明场地机会与设计边界。",
      answers_question: "项目的核心条件和矛盾是什么？",
    },
    {
      section_id: "S02",
      title_zh: "核心议题与规划策略",
      title_en: "KEY ISSUES & PLANNING STRATEGIES",
      purpose: "把任务要求转译为可验证的议题与策略框架。",
      answers_question: "哪些策略能够回应项目的关键条件和评审重点？",
    },
    {
      section_id: "S03",
      title_zh: "设计概念",
      title_en: "DESIGN CONCEPT",
      purpose: "通过概念、生成逻辑与方案比选建立空间方法。",
      answers_question: "核心策略如何转译为空间概念？",
    },
    {
      section_id: "S04",
      title_zh: "空间与功能落实",
      title_en: "SPATIAL & FUNCTIONAL DEVELOPMENT",
      purpose: "用总图、功能、交通、平面、剖面和重点空间落实概念。",
      answers_question: "概念如何落实为可以被图纸证明的空间？",
    },
    {
      section_id: "S05",
      title_zh: "技术与实施",
      title_en: "TECHNICAL DEVELOPMENT & DELIVERY",
      purpose: "用立面、材料、系统剖切渲染与环境性能说明方案的实施路径。",
      answers_question: "方案如何获得技术支撑？",
    },
    {
      section_id: "S06",
      title_zh: "方案总结",
      title_en: "DESIGN SUMMARY",
      purpose: "回收前文已经被证明的项目价值。",
      answers_question: "方案最终回答了哪些评审问题？",
    },
  ];

  const fullPageSpecs = [
    {
      section: "S00",
      type: "cover" as const,
      title: projectName,
      message: "建筑概念方案设计 / ARCHITECTURAL CONCEPT DESIGN",
      fields: ["project.name", "project.design_stage"],
      visuals: ["项目主视觉或场地区位底图", "横版 A3 封面"],
      placeholder: true,
    },
    {
      section: "S00",
      type: "toc" as const,
      title: "目录",
      message: "项目理解 · 规划策略 · 设计概念 · 空间与功能 · 技术实施 · 方案总结",
      fields: ["project.name"],
      visuals: ["六章目录结构", "章节编号与起始页码", "全篇叙事路径"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "section_divider" as const,
      title: "项目理解",
      message: "从任务书的权威事实出发，建立场地机会、建设边界与评审目标的共同认识。",
      fields: ["project.name"],
      visuals: ["章节编号与标题", "场地区位或任务书关键图像"],
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
      visuals: [
        "四项核心指标卡",
        "灰白场地模型上的彩色抽象功能体块 diagram",
        "在对应体块上标注用地面积、容积率、建筑限高、总建筑面积与分项规模",
      ],
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
      type: "position" as const,
      title: "识别城市交通与公共资源",
      message: "城市交通、公共空间和周边功能资源共同构成项目可以借力的外部条件。",
      fields: ["site.location", "circulation.requirement"],
      visuals: ["城市资源分布图", "交通与公共空间联系图"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "analysis" as const,
      title: "从场地周边识别开放界面",
      message: "周边公共空间、城市道路和到达方向共同决定场地的主要开放关系。",
      fields: ["site.location"],
      visuals: ["场地周边关系图", "城市界面与开放方向图解"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "analysis" as const,
      title: "识别场地限制与建设条件",
      message: "用地边界、开发强度与高度条件共同限定可实施的空间范围。",
      fields: [
        "planning.site_area",
        "planning.far",
        "planning.height_limit",
      ],
      visuals: ["建设条件叠合图", "边界、强度与高度限制图解"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "analysis" as const,
      title: "以交通要求梳理到达秩序",
      message: "任务书中的人行、车行与后勤要求构成交通组织的基础边界。",
      fields: ["circulation.requirement"],
      visuals: ["现状到达条件", "人车与后勤要求图解"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "analysis" as const,
      title: "从功能要求理解空间构成",
      message: "任务书明确的主要功能决定空间体系必须容纳的核心活动。",
      fields: ["program.primary"],
      visuals: ["功能构成树", "核心功能与配套功能关系"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "data" as const,
      title: "建立功能与面积基线",
      message: "主要功能及其规模关系构成后续布局、分区和交通组织的基本输入。",
      fields: [
        "program.primary",
        "area.total_gfa",
        "area.above_ground_gfa|area.below_ground_gfa",
      ],
      visuals: ["功能面积构成图", "功能—规模对应表"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "data" as const,
      title: "拆解地上地下规模关系",
      message: "地上与地下规模共同决定功能分配、交通组织和建设边界。",
      fields: [
        "area.total_gfa",
        "area.above_ground_gfa|area.below_ground_gfa",
      ],
      visuals: ["地上地下规模对照", "面积构成图"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "analysis" as const,
      title: "以评审重点校准汇报方向",
      message: "评审重点决定后续策略、图纸和价值表达的证据优先级。",
      fields: ["evaluation.priorities"],
      visuals: ["评审重点权重图", "重点—证据页面对应关系"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "analysis" as const,
      title: "把设计目标转译为空间任务",
      message: "任务书中的设计目标需要被拆解为可以由图纸验证的空间任务。",
      fields: ["evaluation.design_goal"],
      visuals: ["目标—空间任务转译图", "目标关键词图解"],
      placeholder: true,
    },
    {
      section: "S01",
      type: "analysis" as const,
      title: "建立任务要求响应矩阵",
      message: "功能、交通、指标和成果要求需要在后续页面中逐项获得回应。",
      fields: [
        "program.primary",
        "circulation.requirement",
        "deliverable.page_format",
      ],
      visuals: ["任务要求响应矩阵", "待验证事项清单"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "section_divider" as const,
      title: "核心议题与规划策略",
      message: "把场地条件、任务要求和评审重点转译为可由空间与图纸验证的策略体系。",
      fields: ["evaluation.design_goal|evaluation.priorities"],
      visuals: ["章节标题", "问题—策略—证据关系主图"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "analysis" as const,
      title: "聚焦必须回答的核心议题",
      message: "场地条件、设计目标与评审重点共同界定本项目必须回答的核心议题。",
      fields: [
        "site.location",
        "evaluation.design_goal|evaluation.priorities",
      ],
      visuals: ["核心议题图解", "条件—矛盾—目标关系"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "以策略链统领设计响应",
      message: "先依据任务书建立策略框架，再由总图、交通与空间图纸逐项验证。",
      fields: [
        "evaluation.priorities|evaluation.design_goal",
        "circulation.requirement|program.primary",
      ],
      visuals: ["策略总览图", "任务—策略—证据对应关系"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "以公共性组织空间骨架",
      message: "公共性要求需要被转译为连续、开放且可达的空间骨架。",
      fields: ["evaluation.design_goal|evaluation.priorities"],
      visuals: ["公共空间策略图", "开放节点与连续路径"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "以重点空间形成场所节点",
      message: "重点空间应承接主要人流、公共活动和项目形象，形成可识别的体验节点。",
      fields: [
        "proposal.key_spaces",
        "evaluation.design_goal|evaluation.priorities",
      ],
      visuals: ["重点空间节点图", "人流—活动—场所关系"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "以城市关系回应场地条件",
      message: "主要城市联系和场地开放方向应转化为总体布局的优先关系。",
      fields: ["site.location", "evaluation.design_goal|evaluation.priorities"],
      visuals: ["城市—场地联系策略", "主要界面与视线方向"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "以强度分配建立体量秩序",
      message: "开发强度、建筑高度与功能规模需要转化为清晰的体量层级和空间秩序。",
      fields: [
        "planning.far",
        "planning.height_limit",
        "area.total_gfa",
      ],
      visuals: ["强度分配策略", "高度与体量层级图解"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "以功能复合提升使用效率",
      message: "功能组织应在满足任务要求的同时建立共享与复合使用关系。",
      fields: ["program.primary", "evaluation.priorities|evaluation.design_goal"],
      visuals: ["功能复合策略", "共享空间与独立空间关系"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "以分流原则保障交通效率",
      message: "人行、车行与后勤系统应在明确分流的基础上形成高效到达。",
      fields: ["circulation.design|circulation.requirement"],
      visuals: ["交通策略图", "人车与后勤分流原则"],
      placeholder: true,
    },
    {
      section: "S02",
      type: "strategy" as const,
      title: "建立策略优先级与证据计划",
      message: "每项核心策略都应对应明确的图纸、图解或指标证据，形成后续汇报的验证清单。",
      fields: [
        "evaluation.priorities|evaluation.design_goal",
        "deliverable.page_format",
      ],
      visuals: ["策略优先级矩阵", "策略—证据—页面对应表"],
      placeholder: true,
    },
    {
      section: "S03",
      type: "section_divider" as const,
      title: "设计概念",
      message: "将已经确认的策略转译为统一的空间概念、生成逻辑与形态语言。",
      fields: ["proposal.design_concept|proposal.concept_statement"],
      visuals: ["章节标题", "概念主视觉或生成序列封面"],
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
      type: "concept" as const,
      title: "以城市意象建立概念母题",
      message: "概念母题应回应项目区位和设计目标，并为后续空间表达提供统一语言。",
      fields: [
        "proposal.design_concept|proposal.concept_statement",
        "site.location",
      ],
      visuals: ["城市意象拼贴", "概念关键词与空间映射"],
      placeholder: true,
    },
    {
      section: "S03",
      type: "concept" as const,
      title: "从四项条件推导概念生成逻辑",
      message:
        "高密度复合功能、运营独立、公共空间连续性和热湿气候四项条件，分别转化为连续基座连接地铁与绿地、三塔错位形成高低梯度、空中庭院与连桥延伸公共界面、立体绿化回应热湿气候，逐步形成统一的空间组织。",
      fields: ["proposal.design_concept", "proposal.concept_statement"],
      visuals: [
        "连续基座连接地铁与绿地",
        "三塔错位形成高低梯度",
        "空中庭院与连桥延伸公共界面",
        "立体绿化回应热湿气候",
      ],
      placeholder: true,
    },
    {
      section: "S03",
      type: "rendering" as const,
      title: "以重点空间呈现核心概念",
      message:
        "围绕 P19 提出的核心概念，选择三个重点精彩空间效果图，分别呈现公共到达、核心共享空间与重点室内体验。",
      fields: [
        "proposal.design_concept|proposal.concept_statement",
        "proposal.masterplan",
        "proposal.key_spaces",
      ],
      visuals: [
        "三个重点精彩空间效果图",
        "公共到达与开放界面",
        "核心共享空间与概念体验",
        "重点室内空间与材料氛围",
        "三张图均需回应 P19 核心概念",
      ],
      placeholder: true,
    },
    {
      section: "S03",
      type: "concept" as const,
      title: "以界面生成统一空间表达",
      message: "建筑界面、公共空间和重点节点需要共享一致的形态与材料逻辑。",
      fields: [
        "proposal.design_concept|proposal.concept_statement",
        "proposal.key_spaces",
      ],
      visuals: ["界面生成图解", "形态语言与重点空间对应"],
      placeholder: true,
    },
    {
      section: "S03",
      type: "comparison" as const,
      title: "以方案比选明确取舍依据",
      message: "方案取舍需要同时比较空间价值、功能效率和实施约束。",
      fields: ["proposal.design_concept", "proposal.masterplan"],
      visuals: ["方案比选卡", "优点—局限—取舍矩阵"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "section_divider" as const,
      title: "空间与功能落实",
      message: "通过总图、功能、交通、平面、剖面和重点空间逐项证明概念可以落地。",
      fields: ["proposal.masterplan|proposal.key_spaces"],
      visuals: ["章节标题", "总图或重点空间主视觉"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "masterplan" as const,
      title: "以总体布局统筹场地关系",
      message: "建筑、开放空间与城市界面需要在总图层面形成完整关系。",
      fields: ["proposal.masterplan"],
      visuals: ["总平面图", "总体布局关系图"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "masterplan" as const,
      title: "以开放空间串联公共体验",
      message: "公共空间系统应连接主要入口、核心功能与场地开放界面。",
      fields: ["proposal.masterplan", "proposal.key_spaces"],
      visuals: ["开放空间系统图", "公共路径与节点序列"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "data" as const,
      title: "以功能分区落实复合关系",
      message: "功能分区需要同时回应任务构成、共享关系与运营边界。",
      fields: ["program.primary", "proposal.masterplan"],
      visuals: ["功能分区图", "功能面积与共享关系"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "plan" as const,
      title: "以竖向分区组织功能关系",
      message: "不同功能在竖向上的分布需要兼顾共享联系、独立运营与垂直交通效率。",
      fields: [
        "program.primary",
        "proposal.masterplan",
        "proposal.key_spaces",
      ],
      visuals: ["竖向功能分区图", "共享与独立交通核关系"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "masterplan" as const,
      title: "以交通组织校验总体布局",
      message: "交通系统需要在总图层面验证人行、车行和后勤分流。",
      fields: [
        "proposal.masterplan",
        "circulation.design|circulation.requirement",
      ],
      visuals: ["交通组织总图", "到达、落客与后勤流线"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "plan" as const,
      title: "以首层平面承接公共活动",
      message: "首层空间需要协调入口、公共功能、开放界面与后勤边界。",
      fields: ["proposal.masterplan", "proposal.key_spaces"],
      visuals: ["首层平面图", "公共功能与入口索引"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "plan" as const,
      title: "以典型层平面验证使用效率",
      message: "典型层应通过清晰的功能分区、交通核心和空间尺度验证日常使用效率。",
      fields: ["program.primary", "proposal.key_spaces"],
      visuals: ["典型层平面图", "功能、交通核与主要尺度标注"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "plan" as const,
      title: "以地下空间完善后勤与停车组织",
      message: "地下空间需要协调停车、设备、后勤和垂直交通，并与地上到达系统顺畅衔接。",
      fields: [
        "area.below_ground_gfa",
        "circulation.design|circulation.requirement",
        "proposal.masterplan",
      ],
      visuals: ["地下层平面图", "停车、后勤与垂直交通流线"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "section" as const,
      title: "以剖面关系建立空间层次",
      message: "垂直交通、层高与重点空间需要通过剖面形成可验证的空间关系。",
      fields: ["proposal.key_spaces"],
      visuals: ["关键剖面图", "垂直交通与空间层次"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "rendering" as const,
      title: "以空间序列串联关键体验",
      message: "从城市到达、公共入口到核心空间的连续序列应完整呈现方案的体验逻辑。",
      fields: [
        "proposal.key_spaces",
        "proposal.design_concept|proposal.concept_statement",
      ],
      visuals: ["到达—入口—核心空间序列", "关键视点与体验说明"],
      placeholder: true,
    },
    {
      section: "S04",
      type: "rendering" as const,
      title: "以重点空间呈现完整体验",
      message: "重点空间应将公共性、功能组织和场所特征落实为可感知体验。",
      fields: ["proposal.key_spaces"],
      visuals: ["重点空间效果图", "空间价值短标注"],
      placeholder: true,
    },
    {
      section: "S05",
      type: "section_divider" as const,
      title: "技术与实施",
      message:
        "以立面、材料、系统剖切渲染和环境性能说明空间方案的技术支撑与实施路径。",
      fields: [
        "technical.facade|proposal.design_concept|proposal.concept_statement",
      ],
      visuals: ["章节标题", "立面或系统剖切渲染主视觉"],
      placeholder: true,
    },
    {
      section: "S05",
      type: "technical" as const,
      title: "以立面策略回应空间与环境",
      message: "立面材料、开口和构造逻辑必须由已确认的专项方案支撑。",
      fields: ["technical.facade"],
      visuals: ["立面策略图", "材料与构造节点"],
      placeholder: true,
    },
    {
      section: "S05",
      type: "rendering" as const,
      title: "以系统剖切渲染整合建筑关系",
      message:
        "通过局部切开连续三至五层典型楼层与立面系统，呈现室内空间、楼板、幕墙、水平遮阳与自然通风路径之间的协同关系。",
      fields: [
        "proposal.design_concept|proposal.concept_statement|proposal.masterplan|proposal.key_spaces",
      ],
      visuals: [
        "局部立面系统剖切渲染",
        "近距离切开连续三至五层典型楼层与一至两个立面开间，展示室内、楼板、幕墙、遮阳、通风构件与环境路径",
        "采用局部系统剖切的标准尺度：左侧短文案，右侧局部立面系统剖切主视觉；不得采用 P50 的整栋 section perspective 或其他远距离剖透视表达",
      ],
      placeholder: true,
    },
    {
      section: "S05",
      type: "technical" as const,
      title: "整合材料、构造与环境性能",
      message: "材料选择和构造方式应与立面表达、空间使用及环境性能形成一致的技术逻辑。",
      fields: ["technical.facade"],
      visuals: ["材料与构造系统图", "立面—结构—性能整合节点"],
      placeholder: true,
    },
    {
      section: "S06",
      type: "section_divider" as const,
      title: "方案总结",
      message: "回到项目最初的条件与问题，集中呈现已经得到空间和技术证据支持的方案价值。",
      fields: [
        "proposal.design_concept",
        "proposal.masterplan",
        "proposal.key_spaces",
      ],
      visuals: ["章节标题", "方案主视觉"],
      placeholder: true,
    },
    {
      section: "S06",
      type: "summary" as const,
      title: "方案设计总结",
      message:
        "综合城市与场地回应、空间与功能组织、公共体验和环境策略，总结方案如何落实任务书目标与已确认设计方向。",
      fields: [
        "proposal.design_concept",
        "proposal.masterplan",
        "proposal.key_spaces",
      ],
      visuals: [
        "总体鸟瞰或建筑整体效果图",
        "公共空间或入口效果图",
        "重点空间或室内效果图",
      ],
      placeholder: true,
    },
  ];

  // The workbench keeps a focused 35-page default. These source positions retain
  // every chapter while removing secondary or overlapping proof pages.
  const retainedSourcePageNumbers = new Set([
    1, 2,
    3, 4, 5, 7, 8, 9, 10, 13, 15,
    16, 17, 18, 19, 21, 24,
    26, 27, 29, 30,
    33, 34, 36, 38, 39, 40, 42, 44,
    45, 46, 47,
    49, 50,
  ]);
  const pageSpecs = fullPageSpecs.filter((_, index) =>
    retainedSourcePageNumbers.has(index + 1),
  );

  if (pageSpecs.length !== DEFAULT_TARGET_PAGE_COUNT) {
    throw new Error(
      `默认页级目录应包含 ${DEFAULT_TARGET_PAGE_COUNT} 页，当前为 ${pageSpecs.length} 页。`,
    );
  }

  const experienceAssignments = assignExperienceRecipesForPlan(
    pageSpecs.map((spec) => ({
      page_type: spec.type,
      core_message: spec.message,
      section_id: spec.section,
      headline_zh: spec.title,
      visual_requirements: spec.visuals,
    })),
    projectFacts.reference_experience,
  );

  const pages = pageSpecs.map((spec, index) => {
    const statusResult = pageStatus(
      projectFacts,
      spec.fields,
      spec.placeholder,
    );
    const relatedFacts = selectFacts(projectFacts, spec.fields);
    const pageFacts =
      spec.type === "summary"
        ? projectFacts.facts.filter(
            (fact) =>
              fact.status !== "superseded" && fact.status !== "conflict",
          )
        : relatedFacts;
    const status = plannerReady ? statusResult.status : "blocked";
    const styleExampleRefs = styleExampleRefsForPage(spec.type, projectFacts);
    const experienceAssignment = experienceAssignments[index];
    const preferredSystemRenderingRecipe =
      spec.title === "以系统剖切渲染整合建筑关系"
        ? projectFacts.reference_experience?.page_recipes.find(
            (recipe) => recipe.recipe_id === "HQE_RX_068",
          )
        : undefined;
    const experienceRecipes = preferredSystemRenderingRecipe
      ? [
          preferredSystemRenderingRecipe,
          ...experienceAssignment.recipes.filter(
            (recipe) => recipe.recipe_id !== preferredSystemRenderingRecipe.recipe_id,
          ),
        ]
      : experienceAssignment.recipes;
    const matchedStyleLayout = experienceRecipes.length
      ? []
      : styleLayoutRequirements(spec.type, projectFacts);
    const experienceRecipeRefs = experienceRecipes.map(
      (recipe) => recipe.recipe_id,
    );
    const matchedExperienceLayout = experienceLayoutRequirementsForRecipes(
      experienceRecipes,
      experienceAssignment.reasons,
    );
    const referenceStyleHint =
      styleExampleRefs.length === 0 && projectFacts.style_observations?.length
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
      pageFacts,
      [
        ...spec.visuals,
        ...matchedStyleLayout,
        ...matchedExperienceLayout,
        ...(referenceStyleHint ? [referenceStyleHint] : []),
      ],
      styleExampleRefs,
      experienceRecipeRefs,
      statusResult.missing,
      status,
    );
  });

  // Keep the requested key-space rendering immediately before the technical
  // chapter, while reserving P29 for the single-section proof page.
  const sectionPageIndex = pages.findIndex(
    (page) => page.page_type === "section",
  );
  const lateRenderingPageIndex = pages.findIndex(
    (page) =>
      page.display_page_number === 29 &&
      page.page_type === "rendering" &&
      /重点空间/u.test(page.headline_zh),
  );
  if (sectionPageIndex >= 0 && lateRenderingPageIndex >= 0) {
    const sectionPage = pages[sectionPageIndex];
    const renderingPage = pages[lateRenderingPageIndex];
    pages[sectionPageIndex] = {
      ...renderingPage,
      page_id: sectionPage.page_id,
      display_page_number: sectionPage.display_page_number,
    };
    pages[lateRenderingPageIndex] = {
      ...sectionPage,
      page_id: renderingPage.page_id,
      display_page_number: renderingPage.display_page_number,
    };
  }

  return {
    task_mode: "large_public_building",
    narrative_claim:
      designGoal
        ? `围绕“${String(designGoal)}”组织全篇，并以可追溯的空间、图纸与技术证据逐页验证。`
        : "以任务书明确的场地、指标、功能与评审要求为边界，建立从问题、策略到空间证据的完整叙事。",
    page_format: "A3_landscape_420x297mm",
    language_mode: "zh_en",
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
      return `当前项目证据包括：${authoritativeFirst(facts)
        .slice(0, 3)
        .map((fact) => factDisplay(fact).replace(/[。；;\s]+$/g, ""))
        .join("；")}。这些信息共同构成对现状基础、空间联系与问题判断的分析依据。`;
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
    page.body_zh = "";
    page.body_en = "";
    page.speaker_notes = "证据不足，本页保持阻断状态。";
    return clonedPlan;
  }

  const facts = page.fact_refs
    .map((factId) =>
      projectFacts.facts.find((fact) => fact.fact_id === factId),
    )
    .filter((fact): fact is ProjectFact => Boolean(fact));

  if (isSmallBuildingMode(projectFacts.task_mode ?? DEFAULT_TASK_MODE)) {
    // Small-mode facts remain attached to the page for traceability, but the
    // visible copy must read like a finished report. Source excerpts and
    // backstage labels belong in the evidence panel, never in the body text.
    page.body_copy = page.core_message.trim();
    page.body_zh = page.body_copy;
    page.body_en = englishCoreFallback(page.page_type);
    page.diagram_labels = [
      ...new Set([
        ...contextualDiagramLabels(
          page.page_type,
          page.headline_zh,
          page.core_message,
          6,
        ),
        ...facts.slice(0, 4).map((fact) =>
          String(fact.value_raw).replace(/\s+/g, " ").trim().slice(0, 34),
        ),
      ]),
    ].slice(0, 6);
    page.diagram_labels_en = page.diagram_labels.map((_, index) =>
      englishLabelFallback(page.page_type, index),
    );
    page.speaker_notes =
      "先说明任务书中的本页结论，再按产品、装置、互动、IP、传播和复用证据展开；不补写场地分析、平面、剖面或系统结论。";
    page.callouts = page.diagram_labels.slice(0, 6).map((label, index) => ({
      label_zh: label,
      label_en: page.diagram_labels_en?.[index],
      fact_ref: facts[index]?.fact_id,
    })) as ReportPage["callouts"];
    page.generation_status = "generated";
    return clonedPlan;
  }

  if (page.generation_status === "placeholder" || facts.length === 0) {
    page.body_copy = `本页暂不生成设计结论。待补充：${page.missing_information.join("、") || "对应方案证据"}。`;
    page.body_zh = page.body_copy;
    page.body_en =
      "No design conclusion is presented until the required project evidence or confirmed decision is available.";
    page.diagram_labels = [];
    page.diagram_labels_en = [];
    page.speaker_notes =
      "只说明资料缺口，不把任务要求改写为既成设计成果。";
    page.generation_status = "placeholder";
    return clonedPlan;
  }

  page.body_copy = composeBody(page, facts);
  page.body_zh = page.body_copy;
  page.body_en = englishCoreFallback(page.page_type);
  page.diagram_labels = [
    ...new Set([
      ...contextualDiagramLabels(
        page.page_type,
        page.headline_zh,
        page.core_message,
        6,
      ),
      ...authoritativeFirst(facts).slice(0, 6).map(factDisplay),
    ]),
  ].slice(0, 6);
  page.diagram_labels_en = page.diagram_labels.map((_, index) =>
    englishLabelFallback(page.page_type, index),
  );
  page.speaker_notes =
    "先说明本页结论，再解释当前项目事实与设计动作，最后归纳空间价值。";
  page.callouts = page.diagram_labels.slice(0, 6).map((label, index) => ({
    label_zh: label,
    label_en: page.diagram_labels_en?.[index],
    fact_ref: facts[index]?.fact_id,
  })) as ReportPage["callouts"];
  page.generation_status = "generated";
  return clonedPlan;
}

export function generateSmallModeReport(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  if (!isSmallBuildingMode(projectFacts.task_mode ?? DEFAULT_TASK_MODE)) {
    return pagePlan;
  }
  let generated = pagePlan;
  for (const page of pagePlan.pages) {
    generated = generateSinglePage(projectFacts, generated, page.page_id);
  }
  return auditGeneratedPages(projectFacts, generated);
}

function extractNumbers(text: string) {
  return [...text.matchAll(/(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?(?![A-Za-z0-9])/g)].map((match) =>
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
  const styleExampleIds = new Set(
    (projectFacts.reference_style_examples ?? []).map(
      (example) => example.example_id,
    ),
  );
  const experienceRecipeIds = new Set(
    (projectFacts.reference_experience?.page_recipes ?? []).map(
      (recipe) => recipe.recipe_id,
    ),
  );

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
    const missingStyleRefs = (page.style_example_refs ?? []).filter(
      (exampleId) => !styleExampleIds.has(exampleId),
    );
    if (missingStyleRefs.length) {
      issues.push({
        severity: "major",
        pages: [page.page_id],
        issue: "页面引用了不存在的历史风格样本。",
        evidence: missingStyleRefs.join("、"),
        fact_refs: page.fact_refs,
        recommended_fix: "重新执行页型样本匹配，移除失效的 style_example_refs。",
      });
    }
    if (
      styleExampleIds.size > 0 &&
      (page.style_example_refs?.length ?? 0) === 0
    ) {
      issues.push({
        severity: "minor",
        pages: [page.page_id],
        issue: "页面未匹配历史风格样本。",
        evidence: `${page.page_type} 页面缺少 style_example_refs。`,
        fact_refs: page.fact_refs,
        recommended_fix: "按页型匹配 1—2 个精选样本后重新生成。",
      });
    }
    const missingRecipeRefs = (page.experience_recipe_refs ?? []).filter(
      (recipeId) => !experienceRecipeIds.has(recipeId),
    );
    if (missingRecipeRefs.length) {
      issues.push({
        severity: "major",
        pages: [page.page_id],
        issue: "页面引用了不存在的结构化经验配方。",
        evidence: missingRecipeRefs.join("、"),
        fact_refs: page.fact_refs,
        recommended_fix:
          "重新执行页面配方匹配，移除失效的 experience_recipe_refs。",
      });
    }
    if (
      experienceRecipeIds.size > 0 &&
      (page.experience_recipe_refs?.length ?? 0) === 0
    ) {
      issues.push({
        severity: "minor",
        pages: [page.page_id],
        issue: "页面未匹配结构化经验配方。",
        evidence: `${page.page_type} 页面缺少 experience_recipe_refs。`,
        fact_refs: page.fact_refs,
        recommended_fix: "按页面角色与页型匹配 1—2 个结构化配方。",
      });
    }
    const currentProjectEvidence = projectFacts.facts
      .filter(
        (fact) => fact.status !== "superseded" && fact.status !== "conflict",
      )
      .map((fact) => `${String(fact.value_raw)} ${fact.source.quote}`)
      .join("\n");
    const generatedText = [
      page.headline_zh,
      page.headline_en,
      page.body_copy,
      ...page.diagram_labels,
    ]
      .filter(Boolean)
      .join("\n");
    const leakedReferenceTerms = [
      ...new Set(
        styleGuidanceForPage(page, projectFacts)
          .flatMap((guidance) => guidance.forbidden_terms)
          .filter(
            (term) =>
              generatedText.includes(term) &&
              !currentProjectEvidence.includes(term),
          ),
      ),
    ];
    if (leakedReferenceTerms.length) {
      issues.push({
        severity: "blocking",
        pages: [page.page_id],
        issue: "页面疑似泄漏历史参考项目专有内容。",
        evidence: leakedReferenceTerms.join("、"),
        fact_refs: page.fact_refs,
        recommended_fix:
          "删除历史项目专有词，只保留样本的句式、论述顺序和版式规则。",
      });
    }
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

    const contentDepth = evaluatePageContentDepth(projectFacts, page);
    page.content_depth_check = contentDepth;
    if (contentDepth.applicable && contentDepth.status === "needs_improvement") {
      issues.push({
        severity: contentDepth.unsupported_numbers.length ? "major" : "minor",
        pages: [page.page_id],
        issue: "页面未达到最低内容深度标准。",
        evidence: contentDepth.issues.join("；"),
        fact_refs: page.fact_refs,
        recommended_fix:
          "补足一个明确结论、2—4 条正文、2—4 条可追溯证据及每个图片槽的独立图注；所有数字必须绑定来源。",
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
  taskMode: TaskMode = DEFAULT_TASK_MODE,
): PipelineResult {
  const registrationOutput = buildRegistrationOutput(inputs);
  const extracted: DesignReportProjectFacts = {
    ...(isSmallBuildingMode(taskMode)
      ? enrichSmallBuildingBriefFacts(
          inputs,
          extractFacts(inputs, projectId),
        )
      : extractFacts(inputs, projectId)),
    task_mode: taskMode,
  } satisfies DesignReportProjectFacts;
  if (isSmallBuildingMode(taskMode)) {
    const cultureProposal = localCultureFusionProposal(extracted);
    if (
      cultureProposal &&
      !extracted.gate_b_proposals?.some(
        (proposal) => proposal.missing_item_id === cultureProposal.missing_item_id,
      )
    ) {
      extracted.gate_b_proposals = [
        ...(extracted.gate_b_proposals ?? []),
        cultureProposal,
      ];
    }
  }
  const checked = checkCompleteness(extracted);
  const modeChecked = isSmallBuildingMode(taskMode)
    ? isolateSmallBuildingProjectFacts(
        ensureSmallModeDesignDirectionState(checked),
      )
    : checked;
  const planned = planReport(modeChecked, taskMode);
  const synchronized = isSmallBuildingMode(taskMode)
    ? { projectFacts: modeChecked, pagePlan: planned }
    : synchronizeProposalCoverage(modeChecked, planned);
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
    projectFacts: synchronized.projectFacts,
    pagePlan: synchronized.pagePlan,
    nodeOutputs,
    modelCallCount: 0,
  };
}
