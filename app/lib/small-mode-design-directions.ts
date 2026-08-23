import type { DesignReportProjectFacts } from "@/app/generated/contracts";
import { smallScaleBuildabilityPrompt } from "@/app/lib/small-scale-buildability";

export const SMALL_MODE_DESIGN_DIRECTION_ITEM_ID = "M_SMALL_DESIGN_DIRECTION";
export const SMALL_MODE_DESIGN_DIRECTION_LABEL = "设计方向";

type ProjectFact = DesignReportProjectFacts["facts"][number];
type DirectionFact = ProjectFact & { source_fact_id?: string };
type GateBProposal = NonNullable<
  DesignReportProjectFacts["gate_b_proposals"]
>[number];

export interface SmallModeDirectionCard {
  title: string;
  content: string;
  sourceFacts: DirectionFact[];
}

const directionFieldPatterns = [
  /^installation\.[^.]+\.(?:brief|core|interaction|cultural_theme)$/u,
  /^proposal\.(?:design_concept|concept_statement|masterplan|key_spaces)$/u,
  /^evaluation\.(?:design_goal|priorities)$/u,
  /^design_requirement\./u,
  /^ip\.(?:requirement|live_activation)$/u,
];

const directionCategories = new Set([
  "proposal_design",
  "space_requirement",
  "design_requirement",
]);

function normalizedFieldPath(fact: ProjectFact) {
  return String(fact.field_path ?? "").trim();
}

function factText(fact: ProjectFact) {
  return String(fact.value_raw ?? fact.value_normalized ?? "").trim();
}

function activeFact(fact: ProjectFact) {
  return (
    fact.status !== "superseded" &&
    fact.status !== "conflict" &&
    factText(fact).length >= 4
  );
}

function embeddedInstallationDirectionFacts(
  projectFacts: DesignReportProjectFacts,
): DirectionFact[] {
  const embedded = projectFacts.facts.filter(
    (fact) =>
      activeFact(fact) &&
      ["event.positioning", "project.brief", "project.description"].includes(
        normalizedFieldPath(fact),
      ),
  );
  const extracted: DirectionFact[] = [];
  const pattern = /装置\s*([1-3])\s*[：:]\s*([\s\S]*?)(?=\s*装置\s*[1-3]\s*[：:]|\s*需求\s*[：:]|\s*另外需要|$)/gu;
  for (const fact of embedded) {
    for (const match of factText(fact).matchAll(pattern)) {
      const sequence = match[1];
      const brief = match[2].replace(/\s+/gu, " ").trim();
      if (!sequence || brief.length < 12) continue;
      extracted.push({
        ...fact,
        fact_id: `${fact.fact_id}_DIRECTION_${sequence}`,
        field_path: `installation.${sequence}.brief`,
        category: "proposal_design",
        value_raw: brief,
        value_normalized: brief,
        source_fact_id: fact.fact_id,
      });
    }
  }
  return extracted;
}

export function smallModeDesignDirectionFacts(
  projectFacts: DesignReportProjectFacts,
) {
  const structured = projectFacts.facts
    .filter(
      (fact) =>
        activeFact(fact) &&
        (directionFieldPatterns.some((pattern) => pattern.test(normalizedFieldPath(fact))) ||
          (directionCategories.has(fact.category) &&
            /(?:brief|core|cultural_theme|design_concept|concept_statement|requirement|interaction|style|reuse)$/u.test(
              normalizedFieldPath(fact),
            ))),
    )
  const embedded = embeddedInstallationDirectionFacts(projectFacts);
  const byFieldPath = new Map<string, DirectionFact>();
  for (const fact of [...embedded, ...structured]) {
    if (!byFieldPath.has(fact.field_path)) byFieldPath.set(fact.field_path, fact);
  }
  return [...byFieldPath.values()].sort((left, right) => {
      const score = (fact: ProjectFact) => {
        if (/^installation\.[^.]+\.(?:brief|core|cultural_theme)$/u.test(normalizedFieldPath(fact))) {
          return 0;
        }
        if (/^proposal\./u.test(normalizedFieldPath(fact))) return 1;
        if (/^design_requirement\./u.test(normalizedFieldPath(fact))) return 2;
        if (/^ip\./u.test(normalizedFieldPath(fact))) return 3;
        if (/^evaluation\./u.test(normalizedFieldPath(fact))) return 4;
        return 5;
      };
      return score(left) - score(right) || left.fact_id.localeCompare(right.fact_id);
    })
    .slice(0, 8);
}

function directionCardTitle(
  facts: DirectionFact[],
  fallback: string,
) {
  const context = facts.map(factText).join(" ");
  if (/甜|泡茶|茶香/u.test(context)) return "泡茶水的“甜”";
  if (/真|山泉|源头|澄澈/u.test(context)) return "山泉水的“真”";
  if (/斗器|器|瓷|共创|品茗/u.test(context)) return "斗器大会与瓷器";
  if (/IP|少女|角色|服装/u.test(context)) return "IP现场互动";
  if (/复用|收起|拆装|运输/u.test(context)) return "模块复用系统";
  return fallback;
}

function directionCardContent(facts: DirectionFact[]) {
  const context = facts.map(factText).join(" ");
  if (/甜|泡茶|茶香/u.test(context)) {
    return "以泡茶、闻香与品鉴等互动，呈现泡茶水的茶香、口感与产品体验。";
  }
  if (/真|山泉|源头|澄澈/u.test(context)) {
    return "以艺术化、强互动且不过度具象的装置，呈现泉水源头的澄澈、真实与天然。";
  }
  if (/斗器|器|瓷|共创|品茗/u.test(context)) {
    return "以瓷器、品茗文化与观众共创组织现场体验，连接斗器大会主题与定制瓷茶杯。";
  }
  if (/IP|少女|角色|服装/u.test(context)) {
    return "以轻国风少女形象和现场互动建立可识别、可参与、可传播的角色体验。";
  }
  if (/复用|收起|拆装|运输/u.test(context)) {
    return "以可拆装、可运输和可再次部署的构件系统支撑活动后的收起与复用。";
  }
  return facts
    .map((fact) => factText(fact).replace(/\s+/gu, " ").trim())
    .find(Boolean) ?? "基于当前任务书事实形成可编辑的设计方向。";
}

/**
 * Reduce extracted task-brief direction evidence to at most three readable
 * cards. Internal field paths and proposal IDs stay in the data model only.
 */
export function smallModeDesignDirectionCards(
  projectFacts: DesignReportProjectFacts,
): SmallModeDirectionCard[] {
  const facts = smallModeDesignDirectionFacts(projectFacts);
  const installationGroups = new Map<string, DirectionFact[]>();
  for (const fact of facts) {
    const installationId = normalizedFieldPath(fact).match(
      /^installation\.([^.]+)\./u,
    )?.[1];
    if (!installationId) continue;
    const group = installationGroups.get(installationId) ?? [];
    group.push(fact);
    installationGroups.set(installationId, group);
  }
  const groups = installationGroups.size >= 2
    ? [...installationGroups.entries()]
        .sort(([left], [right]) => Number(left) - Number(right))
        .slice(0, 3)
        .map(([installationId, group]) => ({
          fallback: `装置${installationId}设计方向`,
          facts: group,
        }))
    : facts.length
      ? Array.from({ length: Math.min(3, facts.length) }, (_, index) => ({
          fallback: `设计方向 ${index + 1}`,
          facts: facts.slice(index, index + 1),
        }))
      : [];
  return groups.map(({ fallback, facts: group }) => ({
    title: directionCardTitle(group, fallback),
    content: directionCardContent(group),
    sourceFacts: group,
  }));
}

function directionContext(projectFacts: DesignReportProjectFacts) {
  return smallModeDesignDirectionFacts(projectFacts)
    .map((fact) => `${fact.field_path}：${String(fact.value_raw).trim()}`)
    .join("；");
}

function directionFactRefs(projectFacts: DesignReportProjectFacts) {
  return smallModeDesignDirectionFacts(projectFacts).map(
    (fact) => fact.source_fact_id ?? fact.fact_id,
  );
}

export function smallModeDesignDirectionPrompt(
  projectFacts: DesignReportProjectFacts,
) {
  return [
    "你正在为小型建筑、装置、展亭、快闪或小型室内项目生成三个可编辑的设计方向。",
    "优先使用当前任务书事实中的设计目标、功能、场地、对象、互动、材料、运营或复用要求；没有明确方向时才提出原创设计假设。",
    "三个方向必须是真正不同的空间或构造策略，而不是只换名称。每个方向都要能进入后续页面文案、视觉提示词和设计总结。",
    smallScaleBuildabilityPrompt(projectFacts),
    "每个方向必须说明：形式如何落到结构系统、重复构件、材料、连接、加工、运输、现场装配、锚固、维护和公众安全；不得写精确尺寸、荷载、价格或法规结论。",
    `当前任务书方向证据：${directionContext(projectFacts) || "未提取到明确的设计方向，请明确标注假设并保持低承诺。"}`,
    "只返回符合既有 Gate B proposal contract 的 JSON；status 必须为 awaiting_choice，selected_option_id 为 null，confirmed_direction 为空。",
  ].join("\n");
}

function option(
  projectFacts: DesignReportProjectFacts,
  index: number,
  title: string,
  summary: string,
  designMoves: [string, ...string[]],
  rationale: string,
  assumptions: [string, ...string[]],
  validation: [string, ...string[]],
): GateBProposal["options"][number] {
  const refs = directionFactRefs(projectFacts);
  return {
    option_id: `${SMALL_MODE_DESIGN_DIRECTION_ITEM_ID}_O${index}`,
    title,
    summary,
    design_moves: designMoves,
    rationale,
    task_brief_fact_refs: refs,
    assumptions,
    validation_needed: validation,
  };
}

export function createLocalSmallModeDesignDirectionProposal(
  projectFacts: DesignReportProjectFacts,
): GateBProposal {
  const refs = directionFactRefs(projectFacts);
  const context = directionContext(projectFacts);
  const basis = context
    ? `回应任务书已提取方向“${context.slice(0, 120)}”`
    : "当前任务书没有明确的设计方向，以下为待确认的低承诺提案";
  return {
    missing_item_id: SMALL_MODE_DESIGN_DIRECTION_ITEM_ID,
    missing_label: SMALL_MODE_DESIGN_DIRECTION_LABEL,
    origin: "agent_missing",
    status: "awaiting_choice",
    question: "任务书没有明确的设计方向时，请从以下三个可实施策略中选择，也可以编辑后确认。",
    task_brief_fact_refs: refs,
    options: [
      option(
        projectFacts,
        1,
        "母题转译与场所体验",
        `${basis}，把核心对象、地方线索或使用目标转译为可识别的空间母题，并用进入、停留、观看或参与形成连续体验。`,
        [
          "提取任务书中的对象、材料或行为线索形成一个主视觉母题",
          "用入口、停留节点和可见界面组织体验序列",
          "以重复框架和可替换表皮控制复杂造型",
        ],
        "优先让设计回应任务书目标，同时保留清晰的空间识别度，而不是先生成脱离语境的造型。",
        ["场地尺度、使用时长和公众接触方式尚未完全确认"],
        ["确认主母题与体验序列", "补充现场动线、维护和安全条件"],
      ),
      option(
        projectFacts,
        2,
        "模块化构件与可复用系统",
        `${basis}，以一个清晰的主结构系统和少量重复构件建立可运输、可装配、可拆卸的设计方向。`,
        [
          "优先采用标准件与重复加工件构成主体框架",
          "将特殊表达集中在入口、转角或核心界面",
          "预留工厂预制、分段运输、现场干式装配和分类收纳逻辑",
        ],
        "该方向把落地性放在首位，适合任务书强调临时性、复用、快速搭建或预算控制的项目。",
        ["具体结构体系、连接节点和地面条件尚未由工程资料确认"],
        ["确认模块家族与拆装顺序", "工程师复核稳定、锚固、排水和公众安全"],
      ),
      option(
        projectFacts,
        3,
        "材料界面与光影参与",
        `${basis}，用材料触感、透光层次和可维护的互动界面建立空间氛围，让视觉表达与人的参与动作共同完成设计。`,
        [
          "以一种主材料和一种辅助材料建立可控制的材料家族",
          "用平面、折面或单曲面分片替代难加工的自由曲面",
          "把触摸、共创、观看或光影反馈放在可替换的次级构件上",
        ],
        "该方向强化感知和传播效果，但通过分片、次级构件和可替换界面避免把复杂性转化为不可维护的整体造型。",
        ["材料耐候、灯光设备和公众触碰边界仍需结合任务书确认"],
        ["确认材料样本与夜间效果", "复核防水、耐候、清洁、更换和触碰安全"],
      ),
    ],
    selected_option_id: null,
    user_input: "",
    confirmed_direction: "",
  };
}

export function ensureSmallModeDesignDirectionState(
  projectFacts: DesignReportProjectFacts,
) {
  if (projectFacts.task_mode !== "small_building_or_interior") {
    return projectFacts;
  }
  const result = structuredClone(projectFacts);
  const directionFacts = smallModeDesignDirectionFacts(result);
  const existing = result.gate_b_proposals?.find(
    (proposal) => proposal.missing_item_id === SMALL_MODE_DESIGN_DIRECTION_ITEM_ID,
  );
  if (directionFacts.length) {
    // A task brief with explicit directions is already the user's design input.
    // Do not leave stale Gate B proposals from the large-building pipeline on
    // a restored small-project record.
    result.gate_b_proposals = (result.gate_b_proposals ?? []).filter(
      (proposal) =>
        proposal.origin === "user_created" || proposal.status === "confirmed",
    );
  } else if (existing?.status !== "confirmed") {
    result.gate_b_proposals = (result.gate_b_proposals ?? []).filter(
      (proposal) =>
        proposal.missing_item_id === SMALL_MODE_DESIGN_DIRECTION_ITEM_ID ||
        proposal.origin === "user_created" ||
        proposal.status === "confirmed",
    );
  }
  const directionMissing = !directionFacts.length && existing?.status !== "confirmed";
  result.missing_items = directionMissing
    ? [
        {
          item_id: SMALL_MODE_DESIGN_DIRECTION_ITEM_ID,
          description: "Gate B 缺少：设计方向",
          severity: "important",
          blocks: [],
          suggested_source:
            "优先采用任务书方向；若任务书未明确，Agent 已生成三个可编辑候选方向。",
        },
      ]
    : [];
  if (!existing) {
    result.gate_b_proposals = [
      ...(result.gate_b_proposals ?? []),
      createLocalSmallModeDesignDirectionProposal(result),
    ];
  }
  const hasCurrentProjectEvidence = result.facts.some(
    (fact) =>
      (fact.source_role === "brief_fact" || fact.source_role === "proposal_fact") &&
      fact.status !== "superseded" &&
      fact.status !== "conflict",
  );
  const ready = result.documents.some((document) =>
    ["authoritative", "proposal"].includes(document.role),
  ) && hasCurrentProjectEvidence;
  result.gate_report = {
    ...result.gate_report,
    planner_readiness: ready ? "ready" : "blocked",
    generation_readiness: ready ? "ready" : "blocked",
    gate_a_missing: [],
    gate_b_missing: directionMissing ? ["设计方向"] : [],
    summary: ready
      ? "小型建筑/装置管线不因 Gate B 阻断；页面优先依据任务书设计方向和当前项目事实生成。"
      : "尚未读取到可用的任务书事实。",
  };
  return result;
}
