import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import { pagePlanSchema } from "@/app/generated/schema-data";
import {
  createImageGeneration,
  createStructuredResponse,
  type ImageGenerationCallRecord,
  type ModelCallRecord,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import { VISUAL_IMAGE_PROMPT } from "@/app/lib/model-prompts";
import { confirmedGateBProposalsForPage } from "@/app/lib/gate-b-proposals";
import {
  canGenerateVisualImageForSlot,
  createVisualImageSlots,
  getVisualImageSuitability,
  inferVisualIntent,
  isSiteConstraintOverviewPage,
  isSystemRenderingPage,
  isTrafficRequirementsAnalysisPage,
  updatePageVisualTask,
} from "@/app/lib/visual-task";
import {
  isMetricBoundaryPage,
} from "@/app/lib/visual-reference";
import {
  localCultureFusionPrompt,
} from "@/app/lib/local-culture-fusion";
import { smallModeVisualContinuityGuidance } from "@/app/lib/small-mode-narrative";
import { smallScaleBuildabilityPrompt } from "@/app/lib/small-scale-buildability";
import { isSmallBuildingMode } from "@/app/lib/task-mode";

type ReportPage = DesignReportPagePlan["pages"][number];
type VisualTask = NonNullable<ReportPage["visual_task"]>;
type VisualImagePrompt = NonNullable<VisualTask["image_prompt"]>;
type ImageSlot = VisualTask["image_slots"][number];

function isTypicalFloorEfficiencyPlanPage(page: ReportPage) {
  return (
    page.page_type === "plan" &&
    /典型层平面|典型层.*使用效率/u.test(
      `${page.headline_zh} ${page.core_message}`,
    )
  );
}

function typicalFloorTowerFocusLock(page: ReportPage, slot: ImageSlot) {
  if (!isTypicalFloorEfficiencyPlanPage(page)) return "";
  const focus =
    slot.slot_id === "S1"
      ? "只高亮画面左侧办公塔"
      : slot.slot_id === "S2"
        ? "只高亮画面中部酒店塔"
        : "只高亮画面右侧公寓塔";
  return `典型层塔楼焦点硬锁定：${focus}，另外两座塔必须保持浅灰且不得出现同等强度的功能色。参考图中已经高亮的塔楼只用于继承几何，不得复制其高亮位置；必须把唯一高亮准确移动到本图框指定的左侧／中部／右侧塔楼。塔楼位置判定以画面可见的左右关系为准，不得用文字标签掩盖位置错误。`;
}

export interface VisualGenerationReferenceInput {
  visualId: string;
  imageUrl: string;
  dataUrl: string;
  sourceKind?: "library" | "generated";
}

export interface VisualGenerationContinuityInput {
  sourcePageId: string;
  imageUrl: string;
  dataUrl: string;
}

export interface VisualSlotVisibleCaptionInput {
  title: string;
  detail?: string;
}

const visualTaskSchema = (
  pagePlanSchema.properties.pages.items.properties as Record<
    string,
    unknown
  >
).visual_task as {
  properties: Record<string, unknown>;
};
const visualImagePromptSchema = visualTaskSchema.properties
  .image_prompt as Record<string, unknown>;

interface SystemRenderingImageAudit {
  accepted: boolean;
  composition_type:
    | "local_facade_system_cutaway"
    | "local_facade_exterior"
    | "whole_building"
    | "section_perspective"
    | "massing_or_program_diagram"
    | "other";
  shows_complete_building: boolean;
  shows_program_zoning: boolean;
  visible_system_components: string[];
  failure_reasons: string[];
  correction_prompt_zh: string;
}

interface ProjectMassingImageAudit {
  accepted: boolean;
  shows_overall_project_massing: boolean;
  primary_tower_count: number;
  height_pattern:
    | "one_high_one_medium_one_low"
    | "inconsistent"
    | "not_applicable";
  has_extra_tower_like_mass: boolean;
  failure_reasons: string[];
  correction_prompt_zh: string;
}

interface SlotSemanticImageAudit {
  accepted: boolean;
  semantic_match: boolean;
  near_duplicate_of_other_slot: boolean;
  matched_visual_subject: string;
  failure_reasons: string[];
  correction_prompt_zh: string;
}

interface PlanGeometryImageAudit {
  accepted: boolean;
  same_orientation: boolean;
  compatible_building_outline: boolean;
  same_tower_footprint_relationship: boolean;
  same_core_positions: boolean;
  same_grid_direction: boolean;
  floor_specific_information_present: boolean;
  failure_reasons: string[];
  correction_prompt_zh: string;
}

const systemRenderingImageAuditSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "accepted",
    "composition_type",
    "shows_complete_building",
    "shows_program_zoning",
    "visible_system_components",
    "failure_reasons",
    "correction_prompt_zh",
  ],
  properties: {
    accepted: { type: "boolean" },
    composition_type: {
      type: "string",
      enum: [
        "local_facade_system_cutaway",
        "local_facade_exterior",
        "whole_building",
        "section_perspective",
        "massing_or_program_diagram",
        "other",
      ],
    },
    shows_complete_building: { type: "boolean" },
    shows_program_zoning: { type: "boolean" },
    visible_system_components: {
      type: "array",
      items: { type: "string" },
      maxItems: 12,
    },
    failure_reasons: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
    },
    correction_prompt_zh: { type: "string" },
  },
} as Record<string, unknown>;

const projectMassingImageAuditSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "accepted",
    "shows_overall_project_massing",
    "primary_tower_count",
    "height_pattern",
    "has_extra_tower_like_mass",
    "failure_reasons",
    "correction_prompt_zh",
  ],
  properties: {
    accepted: { type: "boolean" },
    shows_overall_project_massing: { type: "boolean" },
    primary_tower_count: { type: "integer", minimum: 0, maximum: 20 },
    height_pattern: {
      type: "string",
      enum: [
        "one_high_one_medium_one_low",
        "inconsistent",
        "not_applicable",
      ],
    },
    has_extra_tower_like_mass: { type: "boolean" },
    failure_reasons: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
    },
    correction_prompt_zh: { type: "string" },
  },
} as Record<string, unknown>;

const slotSemanticImageAuditSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "accepted",
    "semantic_match",
    "near_duplicate_of_other_slot",
    "matched_visual_subject",
    "failure_reasons",
    "correction_prompt_zh",
  ],
  properties: {
    accepted: { type: "boolean" },
    semantic_match: { type: "boolean" },
    near_duplicate_of_other_slot: { type: "boolean" },
    matched_visual_subject: { type: "string" },
    failure_reasons: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
    },
    correction_prompt_zh: { type: "string" },
  },
} as Record<string, unknown>;

const planGeometryImageAuditSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "accepted",
    "same_orientation",
    "compatible_building_outline",
    "same_tower_footprint_relationship",
    "same_core_positions",
    "same_grid_direction",
    "floor_specific_information_present",
    "failure_reasons",
    "correction_prompt_zh",
  ],
  properties: {
    accepted: { type: "boolean" },
    same_orientation: { type: "boolean" },
    compatible_building_outline: { type: "boolean" },
    same_tower_footprint_relationship: { type: "boolean" },
    same_core_positions: { type: "boolean" },
    same_grid_direction: { type: "boolean" },
    floor_specific_information_present: { type: "boolean" },
    failure_reasons: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
    },
    correction_prompt_zh: { type: "string" },
  },
} as Record<string, unknown>;

function projectVisualInvariantContract(
  projectFacts: DesignReportProjectFacts,
) {
  const hardFacts = projectFacts.facts.filter(
    (fact) =>
      fact.status !== "superseded" &&
      /^(?:planning\.|area\.|site\.(?:boundary|dimensions|location_detail))/i.test(
        fact.field_path,
      ),
  );
  const confirmedDirections = (projectFacts.gate_b_proposals ?? [])
    .filter(
      (proposal) =>
        Boolean(proposal.confirmed_direction?.trim()) &&
        /设计概念|总体布局|交通组织|重点空间|立面方案|评审条件/u.test(
          proposal.missing_label,
        ),
    )
    .map(
      (proposal) =>
        `${proposal.missing_label}：${sanitizeImagePromptText(proposal.confirmed_direction)}`,
    );
  const confirmedText = confirmedDirections.join("；");
  const threeTowerLock = /三塔|三座[^；，。]*塔|三组[^；，。]*塔/u.test(
    confirmedText,
  )
    ? "本项目提案已锁定三座主塔：凡整体图出现项目建筑，主塔数量必须始终为三；不得增加第四塔或减少塔楼。"
    : "不得改变已确认提案中的主要建筑数量、相对位置与体量层级。";
  const heightHierarchyLock = /相对高低|一高一中一低|高低梯度/u.test(
    confirmedText,
  )
    ? "三座塔楼的相对高度排序已经锁定；不同视角可改变画面左右顺序，但不得改变最高／中等／较低塔的稳定梯度。"
    : "不得擅自改变已确认的建筑相对高度和天际线层级。";
  return `项目视觉不变量契约（每次提示与审核均必须执行）：
1. 任务书核验硬事实：${hardFacts.length ? hardFacts.map((fact) => `${fact.field_path}=${stringValue(fact.value_raw)}（任务书第 ${fact.source.page} 页）`).join("；") : "当前页没有可引用的规划数值；不得自行补造。"}
2. 已确认提案：${confirmedDirections.length ? confirmedDirections.join("；") : "当前没有已确认提案；不得擅自锁定方案数量、形态或技术参数。"}
3. ${threeTowerLock}
4. ${heightHierarchyLock}
5. 用地边界、主要建筑落位、连续基座、核心筒、连桥、空中庭院、立面节奏及交通关系一经确认，跨页只允许按图种抽象，不得改成另一项目。
6. 限高、面积、容积率、层数与尺寸不得超过或改写任务书核验值；平面图不得据此虚构未提供的精确轴网、标高或构造参数。
  7. 若当前图框只表现室内、近景入口、局部幕墙或其他不显示建筑全貌的内容，不得为了满足整体体量条款而强行补入塔楼。`;
}

function relevantSmallModeVisualBrief(page: ReportPage) {
  const installationId = page.headline_zh.match(
    /装置\s*([0-9一二三四五六七八九十]+)/u,
  )?.[1];
  return (page.visual_brief ?? []).filter(
    (item) =>
      /^全篇设计系统｜/u.test(item) ||
      (installationId
        ? item.startsWith(`对象${installationId}｜`)
        : /^对象/u.test(item)),
  );
}

function smallModeVisualInvariantContract(
  projectFacts: DesignReportProjectFacts,
  page: ReportPage,
) {
  const installationId = page.headline_zh.match(
    /装置\s*([0-9一二三四五六七八九十]+)/u,
  )?.[1];
  const relevantInstallationIds = installationId
    ? [installationId]
    : ["1", "2", "3"];
  const installations = relevantInstallationIds.flatMap((id) => {
    const facts = projectFacts.facts.filter((fact) =>
      fact.field_path.startsWith(`installation.${id}.`),
    );
    const core = facts.find((fact) => fact.field_path.endsWith(".core"))?.value_raw;
    const gift = facts.find((fact) => fact.field_path.endsWith(".gift"))?.value_raw;
    const brief = facts.find((fact) => fact.field_path.endsWith(".brief"))?.value_raw;
    return core || brief
      ? [`装置${id}：${sanitizeImagePromptText(core || brief)}${gift ? `；对应赠品 ${sanitizeImagePromptText(gift)}` : ""}`]
      : [];
  });
  const projectName =
    projectFacts.project_name_anonymized ||
    String(
      projectFacts.facts.find((fact) => fact.field_path === "project.name")
        ?.value_raw ?? "当前小型建筑/装置项目",
    );
  const visualDna = relevantSmallModeVisualBrief(page);
  const objectDna = visualDna.filter((item) => /^对象/u.test(item));
  const sharedDna = visualDna.filter((item) => /^全篇设计系统｜/u.test(item));
  return `小型建筑/装置管线视觉不变量（只适用于当前任务）：
1. 当前项目是“${sanitizeImagePromptText(projectName)}”的小型建筑/装置方案，不是大型建筑、塔楼、商业综合体或未经任务书要求的永久建筑。
 2. 当前页面必须首先锁定${installationId ? "当前对象" : "下述对象"}造型 DNA；同一对象跨页不得更换主体轮廓、空间形态、互动构件、材料灯光或构造组件：${objectDna.join("；") || "当前页只沿用已确认的对象造型，不另起方案"}。
 3. ${installationId ? "当前对象" : "各设计对象"}必须保持各自主题和产品关系：${installations.join("；") || "只采用当前任务书已确认的设计对象"}。
4. 禁止引入场地分析、总平面、平面图、剖面图、系统图、流线图，以及塔楼、裙房、核心筒、连桥、空中庭院、建筑限高等大型公共建筑内容。
5. 图像只承担当前页面和当前图框的表达任务，不得生成完整 PPT、海报、标题栏、页码、表格或多图拼贴。
6. 全篇共享语言（属于 Agent 对任务书方向的原创深化，不是任务书事实）：${sharedDna.join("；") || "当前页面尚未形成全篇设计系统，必须先完成整套终稿文案后再生图"}`;
}

function cleanPrompt(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

const internalPromptTermReplacements: Array<[RegExp, string]> = [
  [/\bevidence_mapping\b/giu, "证据叠加关系"],
  [/\bspatial_relationship\b/giu, "空间关系"],
  [/\bsequence\b/giu, "过程序列"],
  [/\bcomparison\b/giu, "方案比较"],
  [/\bhierarchy\b/giu, "主次层级"],
  [/\batmosphere\b/giu, "空间氛围"],
  [/\bselected_image_slot(?:_visible_caption|_output_spec)?\b/giu, "当前图框"],
  [/\bprompt_focus\b/giu, "画面重点"],
  [/\blayout_logic\b/giu, "画面组织"],
  [/\bgraphic_elements\b/giu, "图面要素"],
  [/\bslot_id\b/giu, "图框"],
  [/\bproject\.name\b/giu, "项目名称"],
  [/\bsite\.location\b/giu, "场地位置"],
  [/\bprogram\.primary\b/giu, "主要功能"],
  [/\bevaluation\.design_goal\b/giu, "设计目标"],
  [/\bevaluation\.priorities\b/giu, "评审重点"],
  [/\bcirculation\.requirement\b/giu, "交通要求"],
  [/\bplanning\.site_area\b/giu, "用地面积"],
  [/\bplanning\.far\b/giu, "容积率"],
  [/\bplanning\.height_limit\b/giu, "建筑限高"],
  [/\barea\.total_gfa\b/giu, "总建筑面积"],
];

function sanitizeImagePromptText(value: unknown, fallback = "") {
  let text = cleanPrompt(value, fallback).replace(/\s+/gu, " ").trim();
  for (const [pattern, replacement] of internalPromptTermReplacements) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/\bP\d{1,4}[\s_-]*D\d{1,3}\b\s*[:：-]?\s*/giu, "")
    .replace(/\bP\d{3,4}\b\s*[:：-]?\s*/giu, "")
    .replace(/\b(?:SLOT[\s_-]*\d+|S\d{1,3}|FACT[\s_-]*\d+|F[\s_-]*\d+|DOC_UPLOAD[\w-]*)\b\s*[:：-]?\s*/giu, "")
    .replace(
      /(?:保留|留出|预留)(?:中文)?图注(?:区域|空间|空白|留白)?/gu,
      "在图面对象内部安排简体中文短标签",
    )
    .replace(
      /为(?:概念)?标题保留(?:干净)?(?:区域|空间|空白|留白)/gu,
      "主体周围保持低干扰背景",
    )
    .replace(
      /标题和说明由页面系统(?:另行)?叠加/gu,
      "成图本身不包含图名或说明带",
    )
    .replace(
      /图内如有文字仅限少量必要空间标签/gu,
      "图内必要文字使用简体中文短标签并贴合对象",
    )
    .replace(/[；;，,、]\s*[；;，,、]+/gu, "；")
    .replace(/^\s*[；;，,、:：-]+|[；;，,、:：-]+\s*$/gu, "")
    .trim();
}

function cleanNegativePrompt(value: unknown) {
  const fallback =
    "大段汇报正文、密集小字、乱码、历史项目内容、虚构数据、无来源尺寸与坐标、Logo、水印、完整汇报页面、无依据的最终建成效果";
  const source = sanitizeImagePromptText(value, fallback);
  const blanketTextBans = new Set([
    "文字",
    "汉字",
    "英文",
    "数字",
    "坐标",
    "图例",
    "标签",
    "无文字",
    "no text",
  ]);
  const cleaned = source
    .split(/[，,、；;]/u)
    .map((item) => item.trim())
    .filter((item) => item && !blanketTextBans.has(item.toLocaleLowerCase()))
    .join("、");
  return cleaned || fallback;
}

function cleanCaptionText(value: unknown) {
  if (typeof value !== "string") return "";
  const text = sanitizeImagePromptText(value);
  if (
    !text ||
    /^(?:关键信息|当前页视觉要点|视觉草案|图片待生成)$/u.test(text) ||
    /["']?(?:option_id|task_brief_fact_refs|selected_option_id|prompt_focus|layout_logic)["']?\s*:/i.test(
      text,
    )
  ) {
    return "";
  }
  return text.slice(0, 320);
}

function resolveVisibleSlotCaption(
  page: ReportPage,
  slot: ImageSlot,
  slotIndex: number,
  supplied?: VisualSlotVisibleCaptionInput,
  smallMode = false,
) {
  if (isSystemRenderingPage(page)) {
    return {
      title: "局部立面系统剖切渲染",
      detail:
        "以连续三至五层典型楼层和一至两个立面开间的近距离剖切，展示室内空间、楼板、幕墙、水平遮阳、可开启通风构件与自然通风路径之间的协同关系。",
      consistency_requirement:
        "必须是局部立面系统剖切近景；严禁生成整栋塔楼、城市鸟瞰、建筑体量轴测、酒店公寓办公商业功能分区或整栋 section perspective。",
    };
  }
  const callout = page.callouts?.[slotIndex];
  const title =
    (smallMode ? cleanCaptionText(slot.label) : "") ||
    cleanCaptionText(supplied?.title) ||
    cleanCaptionText(page.diagram_labels[slotIndex]) ||
    cleanCaptionText(slot.label) ||
    cleanCaptionText(page.headline_zh);
  const detail =
    (smallMode ? cleanCaptionText(slot.purpose) : "") ||
    cleanCaptionText(supplied?.detail) ||
    cleanCaptionText(callout?.label_zh) ||
    cleanCaptionText(slot.purpose) ||
    cleanCaptionText(page.core_message);
  return {
    title,
    detail,
    consistency_requirement:
      "生成图像的主体、空间动作、流线关系和视觉重点必须直接证明该语义；不得把标题照抄进图片，不得表达其他图框、其他策略或其他方案。",
  };
}

function cleanKeywords(
  value: unknown,
): VisualImagePrompt["style_keywords"] {
  if (!Array.isArray(value)) return ["建筑概念示意", "横版构图", "清晰留白"];
  const result = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => sanitizeImagePromptText(item))
        .filter(
          (item) =>
            Boolean(item) && !/^(?:无文字|纯图|no text)$/iu.test(item),
        ),
    ),
  ].slice(0, 12);
  return (result.length
    ? result
    : ["建筑概念示意", "横版构图", "清晰留白"]) as VisualImagePrompt["style_keywords"];
}

function factsForPage(
  projectFacts: DesignReportProjectFacts,
  page: ReportPage,
) {
  return page.fact_refs
    .map((factId) =>
      projectFacts.facts.find((fact) => fact.fact_id === factId),
    )
    .filter(Boolean)
    .map((fact) => ({
      fact_id: fact!.fact_id,
      field_path: fact!.field_path,
      value_raw: fact!.value_raw,
      source: fact!.source,
    }));
}

export interface TrafficPromptTransferAudit {
  ok: boolean;
  missingSignals: string[];
}

/**
 * P8 is a project-specific traffic diagram, so it must fail closed if the
 * final prompt loses the current project's context between the structured
 * prompt response and the image-model request.
 */
export function auditTrafficPromptTransfer(input: {
  page: ReportPage;
  submittedPrompt: string;
  projectContextLines: string[];
  pageFacts: ReturnType<typeof factsForPage>;
  visualInvariantContract: string;
  p8Lock: string;
}): TrafficPromptTransferAudit {
  if (!isTrafficRequirementsAnalysisPage(input.page)) {
    return { ok: true, missingSignals: [] };
  }

  const requiredSignals = [
    "当前项目背景（必须作为本图的具体语境",
    "当前页已核验事实（必须作为本图语义依据",
    "项目视觉不变量契约",
    "P8 三塔交通图硬约束",
    input.page.headline_zh,
    input.page.core_message,
    ...input.projectContextLines,
    ...input.pageFacts.map(
      (fact) =>
        `${fact.field_path}：${sanitizeImagePromptText(stringValue(fact.value_raw))}`,
    ),
    input.visualInvariantContract,
    input.p8Lock,
  ].filter(Boolean);
  const missingSignals = requiredSignals.filter(
    (signal) => !input.submittedPrompt.includes(signal),
  );
  return { ok: missingSignals.length === 0, missingSignals };
}

const PROJECT_CONTEXT_FIELDS = [
  "project.name",
  "site.location",
  "program.primary",
  "evaluation.design_goal",
  "evaluation.priorities",
  "circulation.requirement",
] as const;

function activeFactForField(
  projectFacts: DesignReportProjectFacts,
  fieldPath: string,
) {
  return projectFacts.facts.find(
    (fact) =>
      fact.field_path === fieldPath && fact.status !== "superseded",
  );
}

function promptFact(fact: DesignReportProjectFacts["facts"][number] | undefined) {
  if (!fact) return undefined;
  return {
    fact_id: fact.fact_id,
    value: fact.value_raw,
    source: {
      document_id: fact.source.document_id,
      page: fact.source.page,
      quote: fact.source.quote,
    },
  };
}

function confirmedDesignDirections(
  projectFacts: DesignReportProjectFacts,
  page: ReportPage,
) {
  const proposals = confirmedGateBProposalsForPage(projectFacts, page);
  const relevantProposals = isSystemRenderingPage(page)
    ? proposals.filter((proposal) =>
        /立面|幕墙|材料|气候|节能|绿色|环境|遮阳|通风|系统|构造/u.test(
          `${proposal.missing_label} ${proposal.confirmed_direction}`,
        ),
      )
    : proposals;
  return relevantProposals.map(
    (proposal) => {
      const selectedOption = proposal.options.find(
        (option) => option.option_id === proposal.selected_option_id,
      );
      return {
        proposal_id: proposal.missing_item_id,
        topic: proposal.missing_label,
        confirmed_direction: proposal.confirmed_direction,
        selected_option_title: selectedOption?.title,
        design_moves: selectedOption?.design_moves ?? [],
      };
    },
  );
}

function projectPromptContext(
  projectFacts: DesignReportProjectFacts,
  page: ReportPage,
) {
  const systemRendering = isSystemRenderingPage(page);
  const facts = Object.fromEntries(
    PROJECT_CONTEXT_FIELDS.map((fieldPath) => [
      fieldPath,
      promptFact(activeFactForField(projectFacts, fieldPath)),
    ]).filter(([, fact]) => Boolean(fact)),
  );
  return {
    project_name:
      projectFacts.project_name_anonymized ||
      facts["project.name"]?.value,
    project_name_fact: facts["project.name"],
    site_location: facts["site.location"],
    // System rendering is a facade-and-interior boundary study. Supplying the
    // whole mixed-use program list here repeatedly steered image models toward
    // a full-building coloured program-zoning rendering.
    primary_program: systemRendering
      ? undefined
      : facts["program.primary"],
    design_goal: facts["evaluation.design_goal"],
    evaluation_priorities: facts["evaluation.priorities"],
    circulation_requirement: systemRendering
      ? undefined
      : facts["circulation.requirement"],
    page_specific_facts: factsForPage(projectFacts, page),
  };
}

function systemRenderingPromptGuard(page: ReportPage) {
  if (!isSystemRenderingPage(page)) return "";
  return `
SYSTEM RENDERING 最终构图锁定（覆盖前文中任何冲突描述）：
1. 画面只表现建筑外墙边界的一处近距离局部，建筑在画面四周被自然裁断，绝不出现完整塔楼、完整裙房或建筑群全貌。
2. 只截取连续三至五层、横向一至两个立面开间；剖切后同时看见室内使用场景、楼板、吊顶、玻璃幕墙、水平遮阳与可开启通风构件。
3. 以少量箭头表达日照遮挡、反射采光或自然通风路径；不得把酒店、公寓、办公、商业做成整栋彩色功能分区，也不得出现功能分区图例。
4. 视觉语法以历史样本中“局部剖切渲染”和“同一局部的外观视角”为准，不得转译成 section perspective、整栋剖透视、体量轴测或鸟瞰效果图。`;
}

async function auditSystemRenderingImage(
  imageUrl: string,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const response =
    await createStructuredResponse<SystemRenderingImageAudit>({
      name: "system_rendering_image_audit",
      schema: systemRenderingImageAuditSchema,
      instructions: `你是建筑技术图像质检员。判断输入图片是否属于本产品定义的 system rendering。

合格定义：局部立面系统剖切渲染。画面只截取连续三至五层和一至两个立面开间，建筑被画面边缘自然裁断；剖切后能同时看到室内使用场景、楼板/吊顶、幕墙或窗墙、遮阳以及通风或日照路径。参考语法是近距离局部系统模型，不是完整建筑效果图。

必须判为不合格：出现完整塔楼、完整裙房或建筑群；城市鸟瞰；整栋 section perspective；体量轴测；用大面积彩色色块标出酒店、公寓、办公、商业等垂直功能；只有普通外立面而没有剖切和室内系统关系；把整张汇报页排版生成在图片里。

只有 composition_type=local_facade_system_cutaway、shows_complete_building=false、shows_program_zoning=false，且至少清晰识别出楼板与室内/幕墙等三个系统构件时，accepted 才能为 true。failure_reasons 与 correction_prompt_zh 用中文，且只描述可见问题和下一次应如何收紧构图。`,
      content: [
        {
          type: "input_text",
          text: "请按上述定义审查这张刚生成的 system rendering。不要因为画面精美而放宽构图类型。",
        },
        { type: "input_image", image_url: imageUrl, detail: "high" },
      ],
      reasoningEffort: "low",
      runtimeOverride,
      timeoutMs: null,
      maxAttempts: 1,
    });
  const audit = response.value;
  const accepted =
    audit.accepted &&
    audit.composition_type === "local_facade_system_cutaway" &&
    !audit.shows_complete_building &&
    !audit.shows_program_zoning &&
    audit.visible_system_components.length >= 3;
  return {
    ...response,
    value: { ...audit, accepted },
  };
}

function shouldAuditProjectMassing(page: ReportPage, slot: ImageSlot) {
  // P8 traffic diagrams use a long-running image request. The prompt carries
  // the exact-three-tower lock, and the resulting slots are manually checked
  // before handoff; adding another vision call exceeds the Cloud Run window.
  if (isTrafficRequirementsAnalysisPage(page)) return false;
  if (isSystemRenderingPage(page)) return false;
  // Orthographic plans can verify the number and position of tower
  // footprints, but they cannot truthfully prove a high/medium/low skyline.
  // Their consistency is checked against sibling/previous plan images by the
  // slot-semantic audit instead of the three-dimensional massing audit.
  if (["plan", "masterplan"].includes(page.page_type)) return false;
  const slotSemantics = [slot.label, slot.purpose, slot.prompt_focus].join(" ");
  const explicitlyOverallSlot =
    /(?:整体|总体|鸟瞰|天际线|建筑群|全貌|总体体量|总体形态)/u.test(
      slotSemantics,
    );
  const explicitlyLocalSlot =
    /(?:局部|节点|近景|入口|室内|幕墙|遮阳|深窗|开间|庭院连桥|系统|构造)/u.test(
      slotSemantics,
    );
  if (explicitlyLocalSlot && !explicitlyOverallSlot) return false;
  const semantics = [
    page.page_type,
    page.headline_zh,
    page.core_message,
    slot.label,
    slot.purpose,
    slot.prompt_focus,
  ].join(" ");
  return /(?:封面|章节主视觉|建筑群|整体建筑|总体布局|总体形态|总体体量|三塔|三座塔|塔楼|天际线|鸟瞰|总图|masterplan|massing)/iu.test(
    semantics,
  );
}

async function auditProjectMassingImage(
  imageUrl: string,
  continuityImageUrl: string | undefined,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    {
      type: "input_text",
      text: `第一张图是刚生成的当前项目图片，请核查其中的项目主塔。背景城市天际线不计入项目主塔。${continuityImageUrl ? "第二张图是本项目跨页视觉母型，只用于辅助识别同一项目的高低关系；即使母型出现多余次级竖向体量，也必须以恰好三座主塔的硬规则为准。" : ""}`,
    },
    { type: "input_image", image_url: imageUrl, detail: "high" },
  ];
  if (continuityImageUrl) {
    content.push({
      type: "input_image",
      image_url: continuityImageUrl,
      detail: "high",
    });
  }
  const response = await createStructuredResponse<ProjectMassingImageAudit>({
    name: "project_massing_image_audit",
    schema: projectMassingImageAuditSchema,
    instructions: `你是建筑方案跨页一致性质检员。只核查当前项目建筑体量，不把远处城市背景算入项目。

当画面出现当前项目整体或大部分建筑体量时，合格条件必须同时满足：
1. 恰好三座清晰可辨的主塔，不能出现第四座完整塔状体量；
2. 三塔形成一座明确最高、一座中等、一座较低的稳定高低梯度；不同视角允许左右顺序变化，但若提供视觉母型，三塔相对高度排序与落位关系必须与母型大致一致；
3. 三塔由同一座连续商业基座组织，并保持错位纤细体量；
4. 裙房凸起、连桥支撑、退台体块不得误读为额外塔楼。

若当前图片本来就是局部入口、室内、幕墙节点或不显示建筑全貌的近景，shows_overall_project_massing=false、height_pattern=not_applicable，并且不要因看不到三塔而拒绝。若画面意图明显是封面、鸟瞰、总图、总体体量、天际线或建筑群，却没有清楚显示三塔，则仍应拒绝。

accepted 只能在上述规则满足时为 true。failure_reasons 与 correction_prompt_zh 使用简体中文，只写可见问题和下一次应如何修正。`,
    content,
    reasoningEffort: "low",
    runtimeOverride,
    timeoutMs: null,
    maxAttempts: 1,
  });
  const audit = response.value;
  const accepted =
    audit.accepted &&
    (!audit.shows_overall_project_massing ||
      (audit.primary_tower_count === 3 &&
        audit.height_pattern ===
          "one_high_one_medium_one_low" &&
        !audit.has_extra_tower_like_mass));
  return {
    ...response,
    value: { ...audit, accepted },
  };
}

async function auditPlanGeometryConsistency(
  imageUrl: string,
  referenceImageUrl: string,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const response = await createStructuredResponse<PlanGeometryImageAudit>({
    name: "plan_geometry_consistency_audit",
    schema: planGeometryImageAuditSchema,
    instructions: `你是建筑楼层平面 image-to-image 几何一致性质检员。第一张图是新生成楼层平面，第二张图是同一项目已经确认的平面母版。

必须逐项比较：图面朝向是否相同；参考图中可识别的道路、地铁、绿地、公园、城市界面等外部地标是否仍在画面同一侧；连续基座／建筑外轮廓是否能对应（允许地下室边界或典型层局部退缩，但不能另起一套建筑）；三处塔楼投影的数量、相对位置和大致比例是否一致；各塔楼核心筒位置是否对应；柱网主方向是否一致；新图是否确实包含当前楼层自己的功能、流线或房间信息而不是无差异复制。

旋转、镜像、把任何可识别外部地标从左侧换到右侧或从上方换到下方、移动任一塔楼、改变三塔相对间距、移动核心筒、改变柱网主方向或完全重画基座都必须拒绝。仅有三塔数量相同不足以通过；外部地标的屏幕方位也必须相同。accepted 只有在全部布尔项为 true 时才能为 true。failure_reasons 与 correction_prompt_zh 使用简体中文，明确指出应保留参考图中的哪一项几何和哪一个地标方位。`,
    content: [
      { type: "input_text", text: "第一张：待审核的新楼层平面。" },
      { type: "input_image", image_url: imageUrl, detail: "high" },
      { type: "input_text", text: "第二张：同项目已确认的平面母版。" },
      { type: "input_image", image_url: referenceImageUrl, detail: "high" },
    ],
    reasoningEffort: "low",
    runtimeOverride,
    timeoutMs: null,
    maxAttempts: 1,
  });
  const audit = response.value;
  return {
    ...response,
    value: {
      ...audit,
      accepted:
        audit.accepted &&
        audit.same_orientation &&
        audit.compatible_building_outline &&
        audit.same_tower_footprint_relationship &&
        audit.same_core_positions &&
        audit.same_grid_direction &&
        audit.floor_specific_information_present,
    },
  };
}

async function auditSlotSemanticImage(
  imageUrl: string,
  page: ReportPage,
  selectedSlot: ImageSlot,
  siblingImages: Array<{
    label: string;
    purpose: string;
    imageUrl: string;
  }>,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const planConsistencyMode = page.page_type === "plan";
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    {
      type: "input_text",
      text: `第一张图是待审核图片。它所属图框为“${sanitizeImagePromptText(selectedSlot.label)}”，必须具体表现：${sanitizeImagePromptText(selectedSlot.purpose)}。页面结论为：${sanitizeImagePromptText(page.core_message)}。请判断画面主体是否真正对应这个图框，而不是泛化建筑图或本页其他图框。${siblingImages.length ? planConsistencyMode ? "后续图片是同页其他楼层平面；必须保持相同图面朝向、建筑外轮廓、三处塔楼投影、核心筒位置和柱网方向，同时当前楼层的功能与流线信息应明确不同。" : "后续图片是同页其他图框的既有图片；待审核图片不得与它们相同或近似到无法区分各自证据重点。" : ""}`,
    },
    { type: "input_image", image_url: imageUrl, detail: "high" },
  ];
  for (const sibling of siblingImages.slice(0, 3)) {
    content.push({
      type: "input_text",
      text: `同页其他图框“${sanitizeImagePromptText(sibling.label)}”：${sanitizeImagePromptText(sibling.purpose)}`,
    });
    content.push({
      type: "input_image",
      image_url: sibling.imageUrl,
      detail: "high",
    });
  }
  const response = await createStructuredResponse<SlotSemanticImageAudit>({
    name: "visual_slot_semantic_audit",
    schema: slotSemanticImageAuditSchema,
    instructions: planConsistencyMode
      ? `你是建筑楼层平面跨图质检员。第一张图片必须直接证明指定楼层的独立语义，并与后续参考平面保持同一建筑几何母版。

必须拒绝：不是严格正投影建筑平面；画成总平面、鸟瞰、透视或剖面；相较参考平面旋转或镜像图面；擅自改变连续基座外轮廓、三处塔楼投影关系、核心筒位置或柱网方向；当前图的楼层功能与指定图框不符；仅复制参考图而没有当前楼层应有的功能和流线差异。若指定图框明确要求左侧、中部或右侧塔楼为唯一高亮主体，必须按画面可见位置逐项核对；高亮错误塔楼、同时高亮两塔以上或只改文字标签但高亮位置不对，均必须拒绝。

允许相同的投影、构图和主要几何，因为这些正是跨楼层一致性的证据；但功能分区、房间边界和交通/后勤信息必须符合当前图框。accepted 只有在 semantic_match=true 且当前图不是无差异复制时才能为 true。failure_reasons 与 correction_prompt_zh 使用简体中文。`
      : `你是建筑汇报多图框质检员。第一张图片必须直接证明指定图框的独立语义，而不是只表现同页的大主题。

必须拒绝：主体与指定图框不符；只生成泛化建筑效果图；把其他步骤或其他证据当作当前图；与后续任一同页图片为同一张图、镜像、轻微裁切、轻微调色或主体和构图几乎相同；图内主要文字或箭头表达了另一个图框的语义。

允许同一项目的三塔形态、材料和色彩保持一致，但镜头、图种、空间动作和证据焦点必须清晰区分。accepted 只有在 semantic_match=true 且 near_duplicate_of_other_slot=false 时才能为 true。failure_reasons 与 correction_prompt_zh 使用简体中文。`,
    content,
    reasoningEffort: "low",
    runtimeOverride,
    timeoutMs: null,
    maxAttempts: 1,
  });
  const audit = response.value;
  return {
    ...response,
    value: {
      ...audit,
      accepted:
        audit.accepted &&
        audit.semantic_match &&
        (!audit.near_duplicate_of_other_slot || planConsistencyMode),
    },
  };
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fallbackFrameRatio(page: ReportPage, slot: ImageSlot) {
  if (["strategy", "analysis", "summary"].includes(page.page_type)) {
    return 5 / 7;
  }
  if (page.page_type === "comparison" || slot.aspect_ratio === "square") {
    return 1;
  }
  if (slot.aspect_ratio === "portrait") return 5 / 7;
  return 7 / 5;
}

function selectedSlotOutputSpec(
  page: ReportPage,
  slot: ImageSlot,
  measuredFrameAspectRatio?: number,
) {
  const measuredRatio =
    typeof measuredFrameAspectRatio === "number" &&
    Number.isFinite(measuredFrameAspectRatio) &&
    measuredFrameAspectRatio >= 0.25 &&
    measuredFrameAspectRatio <= 4
      ? measuredFrameAspectRatio
      : undefined;
  const ratio = measuredRatio ?? fallbackFrameRatio(page, slot);
  const aspectRatio =
    Math.abs(ratio - 1) < 0.04
      ? "1:1"
      : Math.abs(ratio - 5 / 7) < 0.04
        ? "5:7"
        : Math.abs(ratio - 7 / 5) < 0.06
          ? "7:5"
          : `${ratio.toFixed(2)}:1`;
  const portrait = ratio < 0.9;
  const square = !portrait && ratio < 1.1;
  return {
    aspect_ratio: aspectRatio,
    orientation: portrait ? "竖向" : square ? "方形" : "横向",
    pixel_size: portrait ? "960×1344" : square ? "1024×1024" : "1344×960",
    api_size: portrait ? "960*1344" : square ? "1024*1024" : "1344*960",
    measured_from_rendered_frame: Boolean(measuredRatio),
    frame_geometry_locked: true,
  };
}

function projectContextPromptLines(
  context: ReturnType<typeof projectPromptContext>,
  directions: ReturnType<typeof confirmedDesignDirections>,
) {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    const text = sanitizeImagePromptText(stringValue(value));
    if (text) lines.push(`${label}：${text}`);
  };
  add("项目名称", context.project_name);
  add("场地位置与周边条件", context.site_location?.value);
  add("项目主要功能", context.primary_program?.value);
  add("任务书设计目标", context.design_goal?.value);
  add("评审关注", context.evaluation_priorities?.value);
  add("交通条件", context.circulation_requirement?.value);
  if (directions.length) {
    add(
      "已确认设计方向",
      directions
        .map((direction) =>
          [
            direction.topic,
            direction.confirmed_direction,
            ...direction.design_moves,
          ]
            .filter(Boolean)
            .join("—"),
        )
        .join("；"),
    );
  }
  return lines;
}

function drawingGenerationProfile(page: ReportPage, slot: ImageSlot) {
  const common = [
    `当前图框为“${slot.label}”，只生成这一张独立图像，不生成完整汇报页面或多图拼贴。`,
    "必须依据当前项目事实、已确认设计方向、页面文案和图框比例组织几何、视角、主体位置与构图层级；不得擅自换项目、换场地、改变已确认的建筑基本边界或增删主要体量。",
    "输出定位为低分辨率概念性图像或图纸表达，用于说明当前项目的图解关系，不是可施工图纸，也不替代准确的原始设计资料。",
    "保留清晰的建筑制图层级、主要空间关系和可读留白；只生成当前项目有依据的关键标签、方向、图例与标注，不得新增无法核实的尺寸、标高、轴号、Logo、水印或乱码。",
    "不得虚构准确尺寸、层数、结构跨度、材料参数、设备系统、规范结论或尚未确认的设计内容。",
  ];

  if (isSystemRenderingPage(page)) {
    return [
      "图种：局部立面系统剖切渲染（facade system sectional rendering），不是整栋建筑剖透视或体量轴测。",
      ...common,
      "构图尺度锁定为近距离局部：只截取连续三至五层典型楼层与一至两个立面开间，画面边缘可以自然裁断建筑，不展示完整塔楼、裙房或城市全景。",
      "剖切面应清晰显示室内使用空间、楼板、吊顶、幕墙/窗墙系统、水平遮阳、可开启通风构件及其交接层次；用少量箭头表达太阳辐射、反射光或自然通风路径。",
      "画面尺度和视角以当前图框要求为准，保持局部剖切的清晰层级；不得引入其他项目的形态、文字、数字或图像。",
      "严禁整栋塔楼、建筑群、城市鸟瞰、核心筒总览、酒店/公寓/办公/商业彩色分区、抽象大体量、section perspective、爆炸轴测或结构受力图。",
      "如当前项目缺少正式幕墙与结构资料，只表达概念性的遮阳、通风和室内外边界关系，不虚构尺寸、材料规格、节点做法或性能数据。",
    ];
  }

  if (page.page_type === "masterplan") {
    return [
      "图种：建筑总平面／场地规划图，严格正投影俯视表达。",
      ...common,
      "优先保持当前项目已确认的用地边界、建筑落位、道路结构、入口关系、开放空间、水体与绿地骨架；用线宽、浅色块和阴影层级强化建筑—场地—城市界面的关系。",
      "禁止透视鸟瞰、随意旋转场地、增加不存在的道路建筑或生成无法追溯的红线和技术标注。",
    ];
  }
  if (page.page_type === "plan") {
    return [
      "图种：建筑楼层平面图，严格正投影俯视表达。",
      ...common,
      "优先保持当前项目已确认的外轮廓、核心筒、主要房间边界、交通组织、入口、庭院与共享空间关系；通过清晰线稿、有限色彩分区和轻微阴影表达功能与空间层次。",
      "禁止生成透视效果图、剖面、立面，禁止随意改动核心筒和主要空间边界，禁止伪造家具尺度、门窗数量或消防疏散结论。",
    ];
  }
  if (page.page_type === "section") {
    return [
      "图种：建筑剖面或剖透视，保持当前项目要求的剖切方向与垂直空间逻辑。",
      ...common,
      "优先保持当前项目要求的地面线、楼板关系、主要层级、挑空、核心筒、垂直交通、室内外衔接和采光路径；用明确剖切面、层次化线宽、克制材质与环境光强化空间深度。",
      "禁止改写层数与层高、虚构结构构件和设备系统、补造不存在的地下空间，禁止加入尺寸、标高和房间文字。",
    ];
  }
  if (page.page_type === "technical") {
    const label = `${slot.label} ${slot.purpose}`;
    const subtype = /立面|facade|elevation/i.test(label)
      ? "建筑立面图：保持正投影、开窗节奏、虚实关系、遮阳与材料分层，以清晰线稿和克制材质表达立面系统。"
      : /剖|section|cutaway|系统/i.test(label)
        ? "建筑系统剖切图：保持剖切视角、楼板和围护层次，清楚呈现空间、结构、立面与环境系统之间的概念关系。"
        : "建筑技术概念图：依据当前项目的构件层级、节点位置与系统关系，表达图解清晰度和材质层次。";
    return [
      `图种：${subtype}`,
      ...common,
      "只表达当前项目已确认的技术关系；不能补造节点做法、构造尺寸、材料规格、结构受力、机电路径或性能数据。",
    ];
  }
  return [];
}

export async function generateVisualImageWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  pageId: string,
  slotId: string,
  _referenceInput: VisualGenerationReferenceInput | undefined,
  continuityInput: VisualGenerationContinuityInput | undefined,
  measuredFrameAspectRatio?: number,
  visibleCaptionInput?: VisualSlotVisibleCaptionInput,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const preparedPlan = pagePlan.pages.some(
    (candidate) =>
      candidate.page_id === pageId && Boolean(candidate.visual_task),
  )
    ? structuredClone(pagePlan)
    : updatePageVisualTask(projectFacts, pagePlan, pageId);
  const page = preparedPlan.pages.find(
    (candidate) => candidate.page_id === pageId,
  );
  const task = page?.visual_task;
  if (!page || !task) throw new Error(`Page not found: ${pageId}`);

  // Compliance boundary: historical/company-library images are never
  // accepted as a generation input. The parameter remains in the internal
  // signature only for compatibility with older callers; current-project
  // continuity is handled separately through continuityInput.

  const imageSuitability = getVisualImageSuitability(page.page_type);
  if (!imageSuitability.eligible) {
    throw new Error(imageSuitability.reason);
  }
  const systemRendering = isSystemRenderingPage(page);
  const smallTaskMode = isSmallBuildingMode(
    projectFacts.task_mode ?? "large_public_building",
  );
  // The configured gpt-5.5 provider can legitimately need several minutes for
  // a high-quality image. Small-mode requests are streamed with heartbeats,
  // so keep one provider call alive long enough to finish instead of aborting
  // it at five minutes and starting the same expensive job again. Large mode
  // preserves its existing provider timeout policy.
  const smallModeTimeoutMs = smallTaskMode ? 12 * 60_000 : undefined;
  // A system rendering is a close-up facade/interior boundary study. Feeding
  // the whole-building concept image as a second visual reference repeatedly
  // pulls image models back to a complete tower or coloured program-zoning
  // perspective. Keep project continuity in the text context, but use only the
  // any library crop or source image as visual guidance for this page type.
  const effectiveContinuityInput = systemRendering || smallTaskMode
    ? undefined
    : continuityInput;
  const samePagePlanReference =
    page.page_type === "plan" &&
    effectiveContinuityInput?.sourcePageId === page.page_id;
  const crossPagePlanReference =
    page.page_type === "plan" &&
    Boolean(effectiveContinuityInput) &&
    effectiveContinuityInput?.sourcePageId !== page.page_id;
  const effectiveVisualIntent = systemRendering
    ? inferVisualIntent(page)
    : task.visual_intent;
  const imageSlots = systemRendering
    ? createVisualImageSlots(page, effectiveVisualIntent)
    : task.image_slots.length
      ? task.image_slots
      : createVisualImageSlots(page, effectiveVisualIntent);
  const selectedSlot = imageSlots.find((slot) => slot.slot_id === slotId);
  if (!selectedSlot) {
    throw new Error("请先点击当前页中的一个具体图片槽，再使用 AI 重新生成。");
  }
  const p8ThreeTowerTrafficLock = isTrafficRequirementsAnalysisPage(page)
    ? "P8 三塔交通图硬约束：当前项目范围内必须恰好出现三座主塔，一座明确最高、一座中等、一座较低；三塔由同一连续商业基座连接，三塔相对位置和场地边界保持稳定。交通、人行、货运和落客信息只围绕这三座主塔组织。允许画面外的浅灰城市背景建筑，但项目红线或基座范围内不得出现第四座完整塔楼、额外塔状体量、重复塔楼或多塔群。"
    : "";
  if (p8ThreeTowerTrafficLock) {
    selectedSlot.purpose = `${selectedSlot.purpose} ${p8ThreeTowerTrafficLock}`;
    selectedSlot.prompt_focus = `${selectedSlot.prompt_focus}；${p8ThreeTowerTrafficLock}`;
  }
  if (!canGenerateVisualImageForSlot(page.page_type, selectedSlot)) {
    throw new Error(
      "当前图框不支持 AI 生图，请重新选择一个可生成的图片槽。",
    );
  }
  task.image_slots = imageSlots;
  task.visual_intent = effectiveVisualIntent;
  const outputSpec = selectedSlotOutputSpec(
    page,
    selectedSlot,
    measuredFrameAspectRatio,
  );
  const selectedSlotIndex = imageSlots.findIndex(
    (slot) => slot.slot_id === selectedSlot.slot_id,
  );
  const smallModeAnalysisDiagram =
    smallTaskMode &&
    page.page_type === "rendering" &&
    selectedSlot.slot_id === "S2" &&
    /设计分析图/u.test(selectedSlot.label);
  const visibleCaption = resolveVisibleSlotCaption(
    page,
    selectedSlot,
    Math.max(0, selectedSlotIndex),
    visibleCaptionInput,
    smallTaskMode,
  );
  const projectContext = projectPromptContext(projectFacts, page);
  const pageFacts = factsForPage(projectFacts, page);
  const designDirections = confirmedDesignDirections(projectFacts, page);
  const visualInvariantContract = smallTaskMode
    ? smallModeVisualInvariantContract(projectFacts, page)
    : projectVisualInvariantContract(projectFacts);
  const drawingProfile = drawingGenerationProfile(page, selectedSlot);
  if (
    effectiveContinuityInput &&
    (!/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(
      effectiveContinuityInput.dataUrl,
    ) ||
      effectiveContinuityInput.dataUrl.length > 8_000_000)
  ) {
    throw new Error("项目视觉锚点格式无效或文件过大，本次未提交生图。");
  }

  const recipes = (
    projectFacts.reference_experience?.page_recipes ?? []
  )
    .filter((recipe) =>
      task.reference_recipe_refs.includes(recipe.recipe_id),
    )
    .map((recipe) => ({
      recipe_id: recipe.recipe_id,
      page_role: recipe.page_role,
      page_type_label: recipe.page_type_label,
      primary_visual: recipe.primary_visual,
      asset_slots: recipe.asset_slots,
      text_weight: recipe.text_weight,
      layout_hint: recipe.layout_hint,
    }));
  const visualReferences: Array<never> = [];
  const pageFactLines = pageFacts.map(
    (fact) =>
      `${fact.field_path}：${sanitizeImagePromptText(stringValue(fact.value_raw))}（来源：任务书第 ${fact.source.page} 页）`,
  );
  const localCultureGuidance = isSmallBuildingMode(
    projectFacts.task_mode ?? "large_public_building",
  )
    ? localCultureFusionPrompt(projectFacts, page)
    : "";
  const smallModeVisualGuidance = isSmallBuildingMode(
    projectFacts.task_mode ?? "large_public_building",
  )
    ? smallModeVisualContinuityGuidance(projectFacts, page)
    : "";
  const buildabilityGuidance = isSmallBuildingMode(
    projectFacts.task_mode ?? "large_public_building",
  )
    ? smallScaleBuildabilityPrompt(projectFacts, page)
    : "";

  const promptResponse = smallTaskMode
    ? {
        value: {
          prompt_zh: [
            `小型建筑与公共艺术装置设计视觉草案，只生成当前图框“${sanitizeImagePromptText(selectedSlot.label)}”对应的一张独立图片。`,
            `画面必须直接证明：${sanitizeImagePromptText(visibleCaption.detail || selectedSlot.purpose)}。`,
            `装置与互动必须保持当前页既定方向：${sanitizeImagePromptText(selectedSlot.prompt_focus)}。`,
            relevantSmallModeVisualBrief(page).length
              ? `沿用当前页已经确认的造型、材料、灯光、互动与建造逻辑：${relevantSmallModeVisualBrief(page).map((item) => sanitizeImagePromptText(item)).join("；")}。`
              : "只依据当前页已确认内容组织空间、人物、材料与灯光，不补造另一套方案。",
            "与同一装置的总览、效果、互动和细节页共享同一套造型母题、材料语言、色彩关系和尺度感；当前图框只突出自己的表达任务。",
            "真实可建、构件关系清楚、公共互动安全可信，避免无法落地的悬浮构件、过度机械结构和无依据的复杂设备。",
          ].join("\n"),
          negative_prompt_zh:
            "大型公共建筑、塔楼、总平面、剖面图、系统图、流线分析图、其他方案、错误产品或互动、不可建悬浮构件、PPT页面、标题栏、页脚、页码、图名、大段文字、英文后台字段",
          visual_type: sanitizeImagePromptText(
            task.primary_visual || selectedSlot.label,
            "小型建筑与公共艺术装置设计视觉草案",
          ),
          aspect_ratio: outputSpec.aspect_ratio,
          style_keywords: cleanKeywords([
            "小型建筑装置",
            "公共艺术",
            "真实可建",
            "材料细节",
            "空间互动",
            "专业设计汇报",
          ]),
        } satisfies VisualImagePrompt,
        call: {
          responseId: "local-small-mode-visual-prompt",
          model: "local-small-mode-visual-prompt",
          inputTokens: 0,
          outputTokens: 0,
        },
      }
    : isTrafficRequirementsAnalysisPage(page)
    ? {
        value: {
          prompt_zh: `专题交通分析图，严格围绕“${sanitizeImagePromptText(selectedSlot.label)}”组织${sanitizeImagePromptText(selectedSlot.purpose)}；使用当前项目三座主塔与连续商业基座作为稳定背景，只表现当前图框的交通证据，不生成泛化城市建筑。${pageFactLines.join("；")}`,
          negative_prompt_zh:
            "超过三座项目主塔，第四座塔楼，额外塔状体量，多塔群，重复塔楼，三塔同高，改变三塔相对位置，泛化城市，历史项目，无法核实的道路、尺寸或地名",
          visual_type: "三塔交通组织专题分析图",
          aspect_ratio: outputSpec.aspect_ratio,
          style_keywords: ["建筑交通分析", "三塔连续基座", "简体中文短标签"],
        } satisfies VisualImagePrompt,
        call: {
          responseId: "local-p8-traffic-prompt",
          model: "local-p8-traffic-prompt",
          inputTokens: 0,
          outputTokens: 0,
        },
      }
    : await createStructuredResponse<VisualImagePrompt>({
        name: "visual_image_prompt",
        schema: visualImagePromptSchema,
        instructions: VISUAL_IMAGE_PROMPT,
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              page: {
                page_id: page.page_id,
                page_type: page.page_type,
                headline_zh: page.headline_zh,
                core_message: page.core_message,
                body_copy: systemRendering ? "" : page.body_copy,
                diagram_labels: systemRendering ? [] : page.diagram_labels,
                visual_brief: page.visual_brief,
                visual_requirements: page.visual_requirements,
                missing_information: page.missing_information,
              },
              first_principles_visual_intent: effectiveVisualIntent,
              selected_image_slot: selectedSlot,
              selected_image_slot_visible_caption: visibleCaption,
              selected_image_slot_output_spec: outputSpec,
              project_identity_and_site_context: projectContext,
              current_project_facts: pageFacts,
              confirmed_gate_b_design_directions: designDirections,
              local_culture_fusion: localCultureGuidance,
              small_scale_buildability_skill: buildabilityGuidance,
              historical_layout_recipes: recipes,
              historical_visual_references: visualReferences,
              reference_mode: effectiveContinuityInput
                ? "只使用当前项目已生成图面作为跨页形态锚点，不使用后台素材库或公司汇报文件图片"
                : "不使用图片参考，完全依据当前项目内容直接生成",
              visual_task_constraints: task.constraints,
              image_usage_policy: imageSuitability,
              drawing_generation_profile: drawingProfile,
              missing_inputs: task.missing_inputs,
            }),
          },
        ],
        reasoningEffort: "low",
        runtimeOverride,
        timeoutMs: null,
        maxAttempts: 1,
      });

  const imagePrompt: VisualImagePrompt = {
    prompt_zh: sanitizeImagePromptText(
      promptResponse.value.prompt_zh,
      task.draft_output?.prompt_zh ??
        `建筑设计横版概念示意图，围绕“${page.core_message}”组织主视觉。`,
    ),
    negative_prompt_zh: cleanNegativePrompt(
      promptResponse.value.negative_prompt_zh,
    ) +
      "、独立图名、图片编号、标题栏、底部白色图注带、页脚、页码、英文后台字段、内部图框编号" +
      (drawingProfile.length
        ? "，透视畸变，错误投影，虚构尺寸，虚构标高，虚构轴网，虚构房间名称，虚构结构构件，虚构材料参数，擅自改变建筑边界、核心筒、层数或场地道路"
        : "") +
      (p8ThreeTowerTrafficLock
        ? "，超过三座项目主塔，第四座塔楼，额外塔状体量，多塔群，重复塔楼，三塔同高，改变三塔相对位置"
        : ""),
    visual_type: sanitizeImagePromptText(
      promptResponse.value.visual_type,
      task.production_mode,
    ),
    aspect_ratio: outputSpec.aspect_ratio,
    style_keywords: cleanKeywords(
      promptResponse.value.style_keywords,
    ),
  };
  const contextLines = projectContextPromptLines(
    projectContext,
    designDirections,
  );
  const verifiedPageFactBlock = pageFactLines.length
    ? `当前页已核验事实（必须作为本图语义依据，不得改写或替换为历史项目）：
${pageFactLines.map((item, index) => `${index + 1}. ${item}`).join("\n")}

`
    : "";
  const verifiedMetricLines =
    isMetricBoundaryPage(page) || isSiteConstraintOverviewPage(page)
    ? factsForPage(projectFacts, page)
        .filter((fact) =>
          isSiteConstraintOverviewPage(page)
            ? /^(?:planning\.|area\.|site\.location_detail$)/.test(
                fact.field_path,
              )
            : /^(?:planning\.|area\.)/.test(fact.field_path),
        )
        .map(
          (fact) =>
            `${sanitizeImagePromptText(fact.field_path)}：${stringValue(fact.value_raw)}（来源：任务书第 ${fact.source.page} 页）`,
        )
    : [];
  const embeddedChineseLabelRequirement = [
    "position",
    "analysis",
    "strategy",
    "data",
    "masterplan",
    "plan",
    "section",
    "technical",
  ].includes(page.page_type)
    ? "本图属于分析、图解或图纸类画面，图内必须包含 2—6 个与当前项目内容直接对应的简体中文短标签，并分别贴合对应区域、对象、色块、箭头或引线；这些文字是图内信息标注，不是图片标题。"
    : "如画面确需文字，必须使用简体中文短标签并嵌入对应对象内部；不得另设图片标题。";
  const verifiedMetricDrawingInstruction = isSiteConstraintOverviewPage(page)
    ? "本图必须合并为一张场地建设条件综合图：用地红线内同时画出‘南北长约165米’与‘东西宽约135米’的正交尺寸线，横向标签必须使用‘宽约’、不得重复写‘长约’；并逐项标注用地面积22,197㎡、容积率4.01、建筑限高120m；不得拆成多图，不得遗漏长宽、容积率或限高。"
    : "图解必须采用灰白场地模型＋彩色抽象功能体块，并将上述面积、容积率、高度和规模标注挂接到相应体块；不得只生成无数据标注的建筑体量图。";
  const submittedPrompt = `当前项目背景（必须作为本图的具体语境，不得替换成泛化城市）：
${contextLines.length ? contextLines.join("\n") : "当前没有可引用的项目背景字段；不得自行虚构地点、功能或设计方向。"}

${visualInvariantContract}

${localCultureGuidance}

${smallModeVisualGuidance}

${buildabilityGuidance}

${verifiedPageFactBlock}

当前页语义锚点（必须与页面文案保持一致）：
- 页面标题：${sanitizeImagePromptText(page.headline_zh)}
- 页面结论：${sanitizeImagePromptText(page.core_message)}

${verifiedMetricLines.length ? `当前页必须绘入的已核验指标（数值逐字使用，不得遗漏、改写或新增）：
${verifiedMetricLines.map((item, index) => `${index + 1}. ${item}`).join("\n")}
${verifiedMetricDrawingInstruction}
` : ""}

当前图框规格：${outputSpec.orientation}图框，宽:高=${outputSpec.aspect_ratio}，目标输出 ${outputSpec.pixel_size}。必须按这个单一图框的比例与裁切安全区组织构图，主体、关键流线和空间关系不得贴边；不得按整张 A3 页面构图，也不得改变页面图框大小。

${samePagePlanReference ? "同页平面 image-to-image 几何锁定：参考图是本页上一张楼层平面，必须把它当作不可改动的描摹底图。尽量逐线保留画布朝向、场地边界、连续基座外轮廓、三座塔楼投影、核心筒位置、柱网方向、主要交通空间、三塔相对间距以及道路、地铁、绿地等外部地标在画面中的左右上下方位；只在原线稿上替换当前楼层的房间分隔、地下商业、停车、设备与后勤信息，严禁镜像、旋转、反转地标方位或重新设计另一套平面。" : crossPagePlanReference ? "跨页平面 image-to-image 几何锁定：参考图是前一页已经确认的同项目平面母版，必须以其线稿为描摹底图。P26、P27、P28 必须保持相同场地朝向、连续基座外轮廓、三座塔楼投影关系、核心筒位置、柱网方向、三塔相对间距以及道路、地铁、绿地等外部地标在画面中的左右上下方位；当前页只按楼层主题改变空间功能和房间分隔，严禁另起一套平面、镜像、旋转或反转地标方位。" : effectiveContinuityInput ? "项目形态一致性锁定：参考图是同一项目的视觉母型。凡本图出现建筑体量、基座、塔楼、空中庭院、连桥、立面或楼层平面时，必须保持其数量、相对位置、高低关系、基座层级、核心筒位置和立面节奏一致；允许按本页图种抽象化，不得换成另一栋建筑或另一个项目。" : ""}

${typicalFloorTowerFocusLock(page, selectedSlot)}

${p8ThreeTowerTrafficLock}

页面系统在图框外提供的文案语义（只用于决定画面内容，禁止作为图名、标题栏或底部说明带照抄进图片）：
- 内容主题：${visibleCaption.title}
- 具体含义：${visibleCaption.detail}
- 一致性要求：${visibleCaption.consistency_requirement}

${drawingProfile.length ? `图纸类专项要求（必须逐条执行）：
${drawingProfile.map((item, index) => `${index + 1}. ${item}`).join("\n")}
` : ""}

${imagePrompt.prompt_zh}

当前只生成这一个图框的一张独立素材。内容目的：${sanitizeImagePromptText(selectedSlot.purpose)}。画面重点：${sanitizeImagePromptText(selectedSlot.prompt_focus)}。最终复核时必须以“${visibleCaption.title}”及“${visibleCaption.detail}”表达的实际语义为准；如上方描述与该语义冲突，删除冲突内容。不得把其他步骤、其他方案或完整页面拼入这张图。

成图文字与边界规则（最高优先级）：图像内容必须铺满整个图框，严禁生成独立图名、图片编号、标题栏、底部白色图注带、页脚、页码或海报边框。${embeddedChineseLabelRequirement} 凡画面需要表达的地名、区域名、流线名、功能名和指标，必须使用简体中文短标签，直接放在对应地图区域、建筑、色块、箭头或引线旁边；不得使用英文后台字段、内部编号或类似页码—图号、图框编号的代码。
${systemRenderingPromptGuard(page)}`;
  const trafficPromptTransferAudit = auditTrafficPromptTransfer({
    page,
    submittedPrompt,
    projectContextLines: contextLines,
    pageFacts,
    visualInvariantContract,
    p8Lock: p8ThreeTowerTrafficLock,
  });
  if (!trafficPromptTransferAudit.ok) {
    throw new Error(
      `P8 项目事实未完整传递到图像模型，已阻止提交：${trafficPromptTransferAudit.missingSignals.slice(0, 6).join("；")}`,
    );
  }
  // Both pipelines use the actual image-generation model. A text model such
  // as gpt-5.5 can return a successful metadata envelope without pixels, so it
  // must never be selected for an image request.
  const smallMode = isSmallBuildingMode(
    projectFacts.task_mode ?? "large_public_building",
  );
  const imageRuntimeOverride = { ...runtimeOverride, imageModel: "gpt-image-2" };
  // Small-scale work is intentionally text-to-image. The user explicitly does
  // not require image-to-image continuity, and forwarding a previous generated
  // image makes the compatible provider treat otherwise simple interaction or
  // reuse scenes as heavier edit requests. Keep every small-mode request short
  // and self-contained; large-building continuity behavior stays unchanged.
  const ultraCompactSmallModeSlot = smallMode;
  const smallModeAllObjectDna = smallMode
    ? (page.visual_brief ?? [])
        .filter((item) => /^对象\d+｜/u.test(item))
        .map((item) => sanitizeImagePromptText(item))
        .join("；")
    : "";
  const smallModeMustShowAllObjects =
    smallMode &&
    (page.page_type === "summary" ||
      /三件|三类|全部对象|各对象|传播系统/u.test(
        `${page.headline_zh} ${selectedSlot.purpose} ${selectedSlot.prompt_focus}`,
      ));
  const compactSmallModePrompt = ultraCompactSmallModeSlot
    ? [
        smallModeAnalysisDiagram
          ? "生成一张独立的纯白白模线稿概念分析图，不生成PPT、海报或拼贴。"
          : "生成一张独立、写实、可用于设计汇报图框的视觉素材，不生成PPT、海报或拼贴。",
        `图像主题：${sanitizeImagePromptText(visibleCaption.title)}`,
        smallModeMustShowAllObjects
          ? `多对象构图硬约束（缺少任一对象即失败）：必须在同一个连续现场中，把下列每一个既定对象分别安排在左、中、右等互不遮挡的独立区域；每件主体轮廓都要完整、可单独识别，不得合并、替换、隐藏或省略。对象清单：${smallModeAllObjectDna}`
          : "",
        `固定方案 DNA（最高优先级，跨页不得改变）：${sanitizeImagePromptText(visualInvariantContract).slice(0, 900)}`,
        `场景任务：${sanitizeImagePromptText(selectedSlot.purpose).slice(0, 320)}`,
        `人物与动作：${sanitizeImagePromptText(visibleCaption.detail).slice(0, 320)}`,
        smallModeAnalysisDiagram
          ? "图面表达：白色实体、黑灰细线、简洁轴测或分解关系；主体严格居中，四周预留约8%至12%的纯白边。可生成2至4个与当前方案直接相关的简体中文短标签，贴近引线或构件；不要生成大标题、大段正文、英文、Logo、页码或整页说明带。"
          : `材料与氛围：${sanitizeImagePromptText(imagePrompt.prompt_zh).slice(0, 300)}`,
        `构图：${outputSpec.orientation}，宽高比 ${outputSpec.aspect_ratio}；${smallModeAnalysisDiagram ? "分析主体居中、留白均衡、引线清楚。" : "主体完整、人物尺度真实、动作清楚。"}`,
        smallModeAnalysisDiagram
          ? "只画一张独立分析图，不生成整张汇报页面。"
          : "只画一个连续场景；不得出现文字、标题、Logo、页码、边框、表格、箭头或说明带。",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, smallModeMustShowAllObjects ? 6_000 : 2_400)
    : [
        "只生成当前图框的一张独立视觉素材，不生成PPT、海报、排版页或多图拼贴。",
        `项目语境：${contextLines.slice(0, 3).join("；").slice(0, 700)}`,
        `页面：${sanitizeImagePromptText(page.headline_zh)}。${sanitizeImagePromptText(page.core_message).slice(0, 500)}`,
        `当前图框：${sanitizeImagePromptText(visibleCaption.title)}。${sanitizeImagePromptText(visibleCaption.detail).slice(0, 500)}`,
        `内容目的：${sanitizeImagePromptText(selectedSlot.purpose).slice(0, 600)}`,
        `画面重点：${sanitizeImagePromptText(selectedSlot.prompt_focus).slice(0, 900)}`,
        `统一造型母题：${sanitizeImagePromptText(visualInvariantContract).slice(0, 700)}`,
        `本土文化：${sanitizeImagePromptText(localCultureGuidance).slice(0, 350)}`,
        `建造与材料：${sanitizeImagePromptText(buildabilityGuidance).slice(0, 450)}`,
        `视觉风格：${sanitizeImagePromptText(imagePrompt.prompt_zh).slice(0, 700)}`,
        `构图规格：${outputSpec.orientation}，宽高比 ${outputSpec.aspect_ratio}；主体完整、人物尺度真实、关键互动动作清楚。`,
        "图内不得出现文字、标题、Logo、页码、边框、表格、箭头、图例或说明带；图像必须铺满当前图框。",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 5_200);
  const submittedImagePrompt = smallMode
    ? compactSmallModePrompt
    : submittedPrompt;
  const submittedNegativePrompt = smallMode
    ? sanitizeImagePromptText(imagePrompt.negative_prompt_zh).slice(0, 900)
    : imagePrompt.negative_prompt_zh;
  const imageCalls: ImageGenerationCallRecord[] = [];
  const auditCalls: ModelCallRecord[] = [];
  let imageCall = await createImageGeneration({
    prompt: submittedImagePrompt,
    negativePrompt: submittedNegativePrompt,
    referenceImage: undefined,
    referenceImages: [
      ...(effectiveContinuityInput && !ultraCompactSmallModeSlot
        ? [
            {
              dataUrl: effectiveContinuityInput.dataUrl,
              role: "project_continuity" as const,
            },
          ]
        : []),
    ],
    runtimeOverride: imageRuntimeOverride,
    size: outputSpec.api_size,
    timeoutMs: smallModeTimeoutMs,
    // Keep the same provider and image family when the gateway is temporarily
    // saturated; never fall back to a text model that can return no pixels.
    fallbackImageModels: smallMode
      ? ["gpt-image-2-c", "gpt-image-1.5", "gpt-image-1"]
      : undefined,
    allowCrossProviderImageFallback: false,
    strictConfiguredImageModel: false,
    singleImageAssetGuard: smallMode,
    maxAttempts: smallMode ? 3 : 2,
  });
  imageCalls.push(imageCall);

  if (systemRendering) {
    let audit = await auditSystemRenderingImage(
      imageCall.imageUrl,
      runtimeOverride,
    );
    auditCalls.push(audit.call);
    if (!audit.value.accepted) {
      const correction = sanitizeImagePromptText(
        audit.value.correction_prompt_zh,
        audit.value.failure_reasons.join("；"),
      );
      const retryPrompt = `${submittedPrompt}

上一张结果已被视觉审核拒绝，禁止沿用其构图。拒绝原因：${audit.value.failure_reasons.join("；") || audit.value.composition_type}。
本次强制修正：${correction || "把镜头推进到建筑外墙边界的局部，只保留连续三至五层和一至两个立面开间，明确切开室内、楼板、幕墙与遮阳系统。"}
最终画面不得出现完整塔楼、完整裙房、建筑群、功能分区图例或酒店/公寓/办公/商业彩色色块。`;
      imageCall = await createImageGeneration({
        prompt: retryPrompt,
        negativePrompt: `${imagePrompt.negative_prompt_zh}、完整塔楼、完整裙房、建筑群、业态功能分区、彩色功能图例、酒店公寓办公商业标签`,
        referenceImage: undefined,
        referenceImages: [
          ...(effectiveContinuityInput
            ? [
                {
                  dataUrl: effectiveContinuityInput.dataUrl,
                  role: "project_continuity" as const,
                },
              ]
            : []),
        ],
        runtimeOverride,
        size: outputSpec.api_size,
        timeoutMs: smallModeTimeoutMs,
        fallbackImageModels: smallMode ? [] : undefined,
        allowCrossProviderImageFallback: smallMode,
        maxAttempts: smallMode ? 1 : 2,
      });
      imageCalls.push(imageCall);
      audit = await auditSystemRenderingImage(
        imageCall.imageUrl,
        runtimeOverride,
      );
      auditCalls.push(audit.call);
      if (!audit.value.accepted) {
        throw new Error(
          `系统渲染图连续两次未通过局部立面剖切视觉审核：${audit.value.failure_reasons.join("；") || audit.value.composition_type}。结果未写入页面。`,
        );
      }
    }
  }

  if (
    !isSmallBuildingMode(projectFacts.task_mode ?? "large_public_building") &&
    shouldAuditProjectMassing(page, selectedSlot)
  ) {
    let audit = await auditProjectMassingImage(
      imageCall.imageUrl,
      effectiveContinuityInput?.imageUrl,
      runtimeOverride,
    );
    auditCalls.push(audit.call);
    if (!audit.value.accepted) {
      const correction = sanitizeImagePromptText(
        audit.value.correction_prompt_zh,
        audit.value.failure_reasons.join("；"),
      );
      const retryPrompt = `${submittedPrompt}

上一张结果已被三塔一致性审核拒绝，禁止沿用其体量。拒绝原因：${audit.value.failure_reasons.join("；") || `识别到 ${audit.value.primary_tower_count} 座项目主塔`}。
本次强制修正：${correction || "只保留三座清晰主塔：一座明确最高、一座中等、一座较低；三塔由连续商业基座连接，删除所有第四塔或额外塔状体量，并保持与视觉母型一致的相对高度排序。"}
最终复核硬条件：当前项目整体体量必须恰好三座主塔，并形成一高、一中、一低的稳定梯度。背景城市塔楼必须与项目边界清晰分离，项目范围内不得出现第四座完整塔状体量。`;
      imageCall = await createImageGeneration({
        prompt: retryPrompt,
        negativePrompt: `${imagePrompt.negative_prompt_zh}、四塔、超过三座塔楼、额外塔状体量、第四座完整塔楼、双主塔、单塔方案、三塔同高、相对高度排序漂移`,
        referenceImage: undefined,
        referenceImages: [
          ...(effectiveContinuityInput
            ? [
                {
                  dataUrl: effectiveContinuityInput.dataUrl,
                  role: "project_continuity" as const,
                },
              ]
            : []),
        ],
        runtimeOverride,
        size: outputSpec.api_size,
        timeoutMs: smallModeTimeoutMs,
        fallbackImageModels: smallMode ? [] : undefined,
        allowCrossProviderImageFallback: smallMode,
        maxAttempts: smallMode ? 1 : 2,
      });
      imageCalls.push(imageCall);
      audit = await auditProjectMassingImage(
        imageCall.imageUrl,
        effectiveContinuityInput?.imageUrl,
        runtimeOverride,
      );
      auditCalls.push(audit.call);
      if (!audit.value.accepted) {
        throw new Error(
          `当前图连续两次未通过三塔数量与高低关系审核：${audit.value.failure_reasons.join("；") || `识别到 ${audit.value.primary_tower_count} 座项目主塔`}。结果未写入页面。`,
        );
      }
    }
  }

  if (page.page_type === "plan" && effectiveContinuityInput) {
    let planAudit = await auditPlanGeometryConsistency(
      imageCall.imageUrl,
      effectiveContinuityInput.imageUrl,
      runtimeOverride,
    );
    auditCalls.push(planAudit.call);
    if (!planAudit.value.accepted) {
      const correction = sanitizeImagePromptText(
        planAudit.value.correction_prompt_zh,
        planAudit.value.failure_reasons.join("；"),
      );
      const retryPrompt = `${submittedPrompt}

上一张楼层平面未通过 image-to-image 几何一致性审核，禁止沿用其重画后的几何。拒绝原因：${planAudit.value.failure_reasons.join("；") || "与参考平面几何不一致"}。
本次必须把参考图当作不可改动的描摹底图：原样保留画布朝向、场地边界、连续基座轮廓、三处塔楼投影、核心筒位置、柱网主方向、三塔相对间距以及道路、地铁、绿地等外部地标在画面中的左右上下方位；严禁镜像、旋转或把地标换边，只在原线稿之上替换当前楼层的功能色块、房间分隔、交通与后勤流线。${correction ? `具体修正：${correction}` : ""}
严禁旋转、镜像、平移塔楼、重画核心筒、改变柱网方向、改造成另一套平面或重新组织基座。`;
      imageCall = await createImageGeneration({
        prompt: retryPrompt,
        negativePrompt: `${imagePrompt.negative_prompt_zh}、旋转平面、镜像平面、重画基座、移动塔楼、改变塔楼间距、移动核心筒、改变柱网方向、另起一套平面`,
        referenceImage: undefined,
        referenceImages: [
          {
            dataUrl: effectiveContinuityInput.dataUrl,
            role: "project_continuity",
          },
        ],
        runtimeOverride,
        size: outputSpec.api_size,
        timeoutMs: smallModeTimeoutMs,
        fallbackImageModels: smallMode ? [] : undefined,
        allowCrossProviderImageFallback: smallMode,
        maxAttempts: smallMode ? 1 : 2,
      });
      imageCalls.push(imageCall);
      planAudit = await auditPlanGeometryConsistency(
        imageCall.imageUrl,
        effectiveContinuityInput.imageUrl,
        runtimeOverride,
      );
      auditCalls.push(planAudit.call);
      if (!planAudit.value.accepted) {
        throw new Error(
          `楼层平面连续两次未通过 image-to-image 几何一致性审核：${planAudit.value.failure_reasons.join("；") || "场地朝向、塔楼投影、核心筒或柱网未保持一致"}。结果未写入页面。`,
        );
      }
    }
  }

  // P8 already has a dedicated three-tower audit. Running the generic
  // sibling-image semantic audit as well makes this traffic diagram exceed
  // the Cloud Run request window, while adding no useful massing signal.
  if (
    !smallTaskMode &&
    imageSlots.length > 1 &&
    !isTrafficRequirementsAnalysisPage(page)
  ) {
    const siblingImages = (task.generated_images ?? [])
      .filter(
        (image) =>
          image.slot_id !== selectedSlot.slot_id && Boolean(image.image_url),
      )
      .map((image) => {
        const siblingSlot = imageSlots.find(
          (slot) => slot.slot_id === image.slot_id,
        );
        return {
          label: siblingSlot?.label ?? image.prompt_focus,
          purpose: siblingSlot?.purpose ?? image.prompt_focus,
          imageUrl: image.image_url,
        };
      });
    let audit = await auditSlotSemanticImage(
      imageCall.imageUrl,
      page,
      selectedSlot,
      siblingImages,
      runtimeOverride,
    );
    auditCalls.push(audit.call);
    if (!audit.value.accepted) {
      const correction = sanitizeImagePromptText(
        audit.value.correction_prompt_zh,
        audit.value.failure_reasons.join("；"),
      );
      const retryPrompt = `${submittedPrompt}

上一张结果已被图框语义审核拒绝，禁止沿用其主体和构图。拒绝原因：${audit.value.failure_reasons.join("；") || "未直接证明当前图框，或与同页其他图片过于相似"}。
本次强制修正：${correction || (page.page_type === "plan" ? `只表现“${sanitizeImagePromptText(selectedSlot.label)}”对应的楼层内容与高亮焦点，保持参考平面的镜头和全部不可变几何。` : `只表现“${sanitizeImagePromptText(selectedSlot.label)}”对应的独立空间动作与证据焦点，并更换镜头、图种或构图，确保与同页其他图框明显不同。`)}
${page.page_type === "plan" ? `楼层平面不得更换镜头、旋转、镜像或重画几何；必须继续逐线继承参考平面的朝向、三塔轮廓、核心筒、柱网和地标方位，只改变本图框要求的楼层内容与高亮焦点。${typicalFloorTowerFocusLock(page, selectedSlot)}` : "不得复制、镜像、轻微裁切或轻微调色同页其他图片；保持同一项目形态即可，但当前图片的主体必须只证明本图框。"}`;
      imageCall = await createImageGeneration({
        prompt: retryPrompt,
        negativePrompt: `${imagePrompt.negative_prompt_zh}、泛化建筑效果图、复制同页图片、镜像同页图片、同构图轻微裁切、表达其他图框`,
        referenceImage: undefined,
        referenceImages: [
          ...(effectiveContinuityInput
            ? [
                {
                  dataUrl: effectiveContinuityInput.dataUrl,
                  role: "project_continuity" as const,
                },
              ]
            : []),
        ],
        runtimeOverride,
        size: outputSpec.api_size,
        timeoutMs: smallModeTimeoutMs,
        fallbackImageModels: smallMode ? [] : undefined,
        allowCrossProviderImageFallback: smallMode,
        maxAttempts: smallMode ? 1 : 2,
      });
      imageCalls.push(imageCall);
      audit = await auditSlotSemanticImage(
        imageCall.imageUrl,
        page,
        selectedSlot,
        siblingImages,
        runtimeOverride,
      );
      auditCalls.push(audit.call);
      if (!audit.value.accepted) {
        throw new Error(
          `当前图连续两次未通过图框语义与同页去重审核：${audit.value.failure_reasons.join("；") || audit.value.matched_visual_subject}。结果未写入页面。`,
        );
      }
      if (page.page_type === "plan" && effectiveContinuityInput) {
        const correctedPlanAudit = await auditPlanGeometryConsistency(
          imageCall.imageUrl,
          effectiveContinuityInput.imageUrl,
          runtimeOverride,
        );
        auditCalls.push(correctedPlanAudit.call);
        if (!correctedPlanAudit.value.accepted) {
          throw new Error(
            `图框语义修正后的楼层平面未通过几何一致性复核：${correctedPlanAudit.value.failure_reasons.join("；") || "场地朝向、塔楼投影、核心筒或柱网未保持一致"}。结果未写入页面。`,
          );
        }
      }
      if (
        !isSmallBuildingMode(projectFacts.task_mode ?? "large_public_building") &&
        shouldAuditProjectMassing(page, selectedSlot)
      ) {
        const massingAudit = await auditProjectMassingImage(
          imageCall.imageUrl,
          effectiveContinuityInput?.imageUrl,
          runtimeOverride,
        );
        auditCalls.push(massingAudit.call);
        if (!massingAudit.value.accepted) {
          throw new Error(
            `图框语义修正后的结果未通过三塔数量与高低关系审核：${massingAudit.value.failure_reasons.join("；") || `识别到 ${massingAudit.value.primary_tower_count} 座项目主塔`}。结果未写入页面。`,
          );
        }
      }
    }
  }

  task.image_prompt = imagePrompt;
  const generatedAt = new Date().toISOString();
  const generatedImage = {
    slot_id: selectedSlot.slot_id,
    prompt_focus: selectedSlot.prompt_focus,
    status: "generated" as const,
    model: imageCall.model,
    // Keep prompt_zh as a backwards-compatible alias. The submitted_* fields
    // are the canonical audit record of what the image provider received.
    prompt_zh: imageCall.submittedPrompt,
    submitted_prompt_zh: imageCall.submittedPrompt,
    submitted_negative_prompt_zh: imageCall.submittedNegativePrompt,
    prompt_provenance: "submitted_to_image_model" as const,
    size: imageCall.size,
    image_url: imageCall.imageUrl,
    generated_at: generatedAt,
    provider_response_id: imageCall.responseId,
    image_count: imageCall.imageCount,
    attempt_count: imageCalls.reduce(
      (sum, call) => sum + call.attemptCount,
      0,
    ),
    disclaimer:
      "本图是当前所选图框的低分辨率视觉草案；本次未使用后台素材库图片，图内少量标注仍需与当前项目资料核对。",
  };
  const generatedImages = [
    ...(task.generated_images ?? []).filter(
      (image) => image.slot_id !== selectedSlot.slot_id,
    ),
    generatedImage,
  ].sort(
    (left, right) =>
      imageSlots.findIndex((slot) => slot.slot_id === left.slot_id) -
      imageSlots.findIndex((slot) => slot.slot_id === right.slot_id),
  );
  task.generated_images =
    generatedImages as unknown as NonNullable<
      VisualTask["generated_images"]
    >;
  const firstImage =
    generatedImages.find(
      (image) => image.slot_id === imageSlots[0]?.slot_id,
    ) ?? generatedImages[0];
  task.generated_image = {
    status: "generated",
    model: firstImage.model,
    prompt_zh: firstImage.prompt_zh,
    submitted_prompt_zh: firstImage.submitted_prompt_zh,
    submitted_negative_prompt_zh: firstImage.submitted_negative_prompt_zh,
    prompt_provenance: firstImage.prompt_provenance,
    size: firstImage.size,
    image_url: firstImage.image_url,
    generated_at: firstImage.generated_at,
    provider_response_id: firstImage.provider_response_id,
    image_count: firstImage.image_count,
    attempt_count: firstImage.attempt_count,
    reference_guidance: undefined,
    disclaimer: task.missing_inputs.length
      ? `已单独重生成当前所选图框；标题、正文、数字、图纸和标注由页面系统保留。当前仍缺：${task.missing_inputs.join("、")}。`
      : "已单独重生成当前所选图框；其他图框、标题、正文、数字、图纸、标注和版式均保持不变。",
  };
  task.conversation = [
    ...task.conversation,
    {
      round:
        Math.max(0, ...task.conversation.map((item) => item.round)) + 1,
      role: "assistant",
      content:
        "已把当前所选图框的页面要求与当前项目资料提交给图像模型，只重生成这一张图片；图内允许与任务一致的少量简体中文标注，其他图框及页面文案、数据、图纸、标注与版式保持不变。",
    },
  ];

  return {
    pagePlan: preparedPlan,
    promptCall: promptResponse.call,
    imageCall,
    imageCalls,
    auditCalls,
  };
}
