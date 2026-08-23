import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  USER_PROPOSAL_TOPICS,
  type UserProposalTopic,
} from "@/app/lib/proposal-topics";
import {
  SMALL_MODE_DESIGN_DIRECTION_LABEL,
  smallModeDesignDirectionFacts,
} from "@/app/lib/small-mode-design-directions";

export type GateBProposal = NonNullable<
  DesignReportProjectFacts["gate_b_proposals"]
>[number];
export type GateBProposalOption = GateBProposal["options"][number];
export type GateBProposalOperation =
  | "generate"
  | "select"
  | "custom"
  | "confirm";

const fieldHints: Record<string, string[]> = {
  设计目标: ["evaluation.", "program.", "site.", "planning_control."],
  评审条件: [
    "evaluation.",
    "deliverable.",
    "planning_control.",
    "program.",
    "site.",
  ],
  设计概念: [
    "evaluation.",
    "site.",
    "program.",
    "planning_control.",
    "planning.",
  ],
  总体布局: ["site.", "planning.", "program.", "circulation."],
  交通组织: ["circulation.", "site.", "program.", "planning."],
  重点空间: ["space.", "space_requirement.", "program.", "evaluation."],
  立面方案: ["technical.", "site.", "evaluation.", "program."],
};

const optionTemplates: Record<
  string,
  Array<{
    title: string;
    summary: string;
    designMoves: string[];
    assumption: string;
    validation: string[];
  }>
> = {
  设计目标: [
    {
      title: "公共价值导向",
      summary: "把任务书中的公共性、使用者与城市关系要求转译为可验证的设计目标。",
      designMoves: ["归纳核心使用者", "明确公共价值", "建立空间验证指标"],
      assumption: "目标的优先级及其对应的空间指标尚未由用户确认。",
      validation: ["设计目标清单", "目标—策略—图纸对应表", "用户确认的优先级"],
    },
    {
      title: "场地问题导向",
      summary: "围绕当前场地最关键的矛盾设定设计目标，并用方案动作逐项回应。",
      designMoves: ["识别场地矛盾", "定义目标性回应", "指定验证图纸"],
      assumption: "场地问题的重要性排序仍是待确认的设计判断。",
      validation: ["场地问题清单", "目标回应矩阵", "总图与剖面验证"],
    },
    {
      title: "综合绩效导向",
      summary: "从空间体验、功能效率和技术可行性三个维度建立分层设计目标。",
      designMoves: ["划分目标层级", "设置可检查成果", "协调空间与技术目标"],
      assumption: "各维度的权重和量化阈值尚无正式评审依据。",
      validation: ["目标分级表", "绩效验证清单", "专业复核意见"],
    },
  ],
  评审条件: [
    {
      title: "任务书显性条件",
      summary: "优先整理任务书明确写出的评审要求，形成逐项响应清单。",
      designMoves: ["提取原文条件", "关联证据页面", "标记尚缺的证明材料"],
      assumption: "任务书未明确说明的评分权重不得自行补充。",
      validation: ["原文引用与页码", "评审条件响应表", "正式补遗核对"],
    },
    {
      title: "成果可验证性",
      summary: "把评审关注点转译为可由图纸、数据或场景证明的检查项。",
      designMoves: ["拆解评审问题", "匹配证明类型", "建立页面检查点"],
      assumption: "检查项是汇报组织假设，不等同于正式评分标准。",
      validation: ["评审问题—证据矩阵", "图纸完整性检查", "用户确认的汇报重点"],
    },
    {
      title: "叙事优先级",
      summary: "依据当前项目事实确定汇报重点的先后顺序，形成评审阅读路径。",
      designMoves: ["识别关键结论", "安排章节权重", "设置复核节点"],
      assumption: "章节权重属于汇报策略，仍需用户确认。",
      validation: ["章节权重表", "页级结论清单", "最终评审条件复核"],
    },
  ],
  设计概念: [
    {
      title: "场地回应型",
      summary: "从任务书确认的场地条件与核心矛盾出发建立概念。",
      designMoves: ["提炼场地矛盾", "形成空间回应动作", "用总图与剖面验证"],
      assumption: "概念名称、体量形态及具体空间动作尚未由用户确认。",
      validation: ["概念草图", "体量生成图", "用户确认的概念陈述"],
    },
    {
      title: "公共价值型",
      summary: "以任务书中的使用目标和公共价值要求组织概念。",
      designMoves: ["识别主要使用者", "建立公共空间序列", "定义可感知的到达体验"],
      assumption: "公共空间的位置、尺度和运营方式仍待设计。",
      validation: ["功能关系图", "公共空间剖面", "运营或使用场景说明"],
    },
    {
      title: "空间序列型",
      summary: "以到达、进入、停留和转换的空间体验形成设计主线。",
      designMoves: ["梳理关键体验节点", "组织连续空间序列", "建立节点之间的视觉联系"],
      assumption: "关键节点及其空间关系尚未得到当前方案图纸支持。",
      validation: ["空间序列草图", "关键节点透视", "平剖面对应关系"],
    },
  ],
  总体布局: [
    {
      title: "集中整合",
      summary: "以紧凑布局集中主要功能，并释放连续公共空间。",
      designMoves: ["集中主要体量", "整合共享界面", "释放完整开放空间"],
      assumption: "具体体量数量、位置和面积分配尚未确定。",
      validation: ["总图草案", "功能面积核对", "日照与消防验证"],
    },
    {
      title: "多孔连接",
      summary: "通过多方向通达和开放界面建立与周边的空间联系。",
      designMoves: ["识别主要城市接口", "建立穿行路径", "串联公共节点"],
      assumption: "开放方向和穿行路径仍需结合红线及标高确认。",
      validation: ["总图流线叠图", "场地标高", "开放空间面积核对"],
    },
    {
      title: "组团渐进",
      summary: "按功能与使用强度形成组团，并以共享空间连接。",
      designMoves: ["划分功能组团", "建立共享核心", "组织分期或弹性关系"],
      assumption: "组团边界与分期需求尚未获得正式确认。",
      validation: ["功能分区图", "分期策略图", "总图与指标表"],
    },
  ],
  交通组织: [
    {
      title: "分流闭环",
      summary: "区分主要交通类型，并分别建立清晰的到达与回转闭环。",
      designMoves: ["识别人车货流", "设置独立到达界面", "核对回转与消防路径"],
      assumption: "出入口位置与交通量尚未经过专项验证。",
      validation: ["交通流线图", "出入口审批条件", "消防车道核对"],
    },
    {
      title: "共享慢行",
      summary: "以连续慢行空间作为主要公共界面，再组织必要车行。",
      designMoves: ["建立慢行主轴", "串联公共节点", "控制车行交叉"],
      assumption: "慢行空间宽度和开放时段尚未确定。",
      validation: ["首层总平面", "人车交叉点分析", "无障碍路径"],
    },
    {
      title: "立体分层",
      summary: "通过标高或楼层分层处理公共、人行、车行及后勤交通。",
      designMoves: ["划分交通层级", "设置垂直转换节点", "核对连续无障碍路径"],
      assumption: "场地高差和地下空间条件尚未完全确认。",
      validation: ["竖向交通图", "关键剖面", "地下与首层交通叠图"],
    },
  ],
  重点空间: [
    {
      title: "公共核心",
      summary: "设置一个能够统领主要功能与公共活动的核心空间。",
      designMoves: ["集中公共界面", "连接主要功能", "强化空间识别性"],
      assumption: "核心空间的位置、尺度和使用方式尚未确认。",
      validation: ["首层平面", "核心空间剖面", "活动场景清单"],
    },
    {
      title: "连续街巷",
      summary: "以连续可达的室内外公共路径串联重点功能。",
      designMoves: ["组织公共路径", "设置停留节点", "连接室内外界面"],
      assumption: "开放边界和沿线功能仍需结合方案落实。",
      validation: ["公共空间序列图", "节点平剖面", "开放时间策略"],
    },
    {
      title: "多层客厅",
      summary: "通过中庭、平台或连桥建立多层共享空间网络。",
      designMoves: ["建立垂直公共节点", "连接不同楼层功能", "引入采光与视线关系"],
      assumption: "结构跨度、消防分区和具体层高尚未验证。",
      validation: ["中庭剖面", "疏散与防火分区", "结构可行性"],
    },
  ],
  立面方案: [
    {
      title: "气候响应",
      summary: "依据朝向、遮阳和自然采光需求形成有性能依据的立面。",
      designMoves: ["区分朝向", "设置遮阳层级", "协调采光与开窗"],
      assumption: "构造尺寸、材料和性能参数尚未完成专项设计。",
      validation: ["朝向分析", "立面节点", "能耗与采光模拟"],
    },
    {
      title: "城市界面",
      summary: "根据主要城市界面与公共入口形成差异化立面层级。",
      designMoves: ["识别主次界面", "强化入口尺度", "控制沿街连续性"],
      assumption: "立面比例和材料表达尚未由用户确认。",
      validation: ["城市界面展开", "入口透视", "材料样板"],
    },
    {
      title: "模块秩序",
      summary: "以可建造的模块和开窗规则统一功能变化与整体形象。",
      designMoves: ["建立标准模数", "归纳开窗类型", "处理转角与顶部"],
      assumption: "模数、构件体系和成本边界尚未确定。",
      validation: ["典型立面分格", "墙身节点", "成本与施工评估"],
    },
  ],
};

function missingLabel(item: DesignReportProjectFacts["missing_items"][number]) {
  return item.description.replace(/^Gate B 缺少：/, "").trim();
}

const pageGapTopicMatchers = [
  {
    label: "设计目标",
    pattern: /设计目标|项目目标|目标定位|总体目标/,
  },
  {
    label: "评审条件",
    pattern: /评审条件|评审重点|评价标准|评分标准|评审要求|审查条件/,
  },
  {
    label: "设计概念",
    pattern: /设计概念|概念说明|概念生成|核心概念/,
  },
  {
    label: "总体布局",
    pattern: /总体布局|总图|功能布局|体量布局|空间布局/,
  },
  {
    label: "交通组织",
    pattern:
      /交通组织|交通设计|交通要求|交通边界|到达秩序|人车流线|流线组织|出入口/,
  },
  {
    label: "重点空间",
    pattern: /重点空间|核心空间|公共空间|空间方案|关键空间/,
  },
  {
    label: "立面方案",
    pattern: /立面方案|立面设计|建筑表皮|材料策略|立面材料|构造策略/,
  },
] as const;

const OPTIONAL_PRODUCTION_INPUT_PATTERN =
  /结构方案|结构体系|结构设计|结构模型|柱网|关键跨度|效果图|渲染图|视觉清单|视觉素材|主视觉|视点清单|空间意向图/;

export function isOptionalProductionInputGap(value: string) {
  return OPTIONAL_PRODUCTION_INPUT_PATTERN.test(value);
}

const factualPageGapPattern =
  /项目名称|设计阶段|项目区位|项目位置|用地面积|容积率|建筑限高|总建筑面积|地上建筑面积|地下建筑面积|主要功能|成果规格|页面尺寸|任务书原文|正式补遗/;

const factualGapFieldMatchers = [
  { pattern: /项目名称/, fields: ["project.name"] },
  { pattern: /设计阶段/, fields: ["project.design_stage"] },
  { pattern: /项目区位|项目位置/, fields: ["site.location", "site.location_detail"] },
  { pattern: /用地面积/, fields: ["planning.site_area"] },
  { pattern: /容积率/, fields: ["planning.far"] },
  { pattern: /建筑限高/, fields: ["planning.height_limit"] },
  { pattern: /总建筑面积/, fields: ["area.total_gfa"] },
  { pattern: /地上建筑面积/, fields: ["area.above_ground_gfa"] },
  { pattern: /地下建筑面积/, fields: ["area.below_ground_gfa"] },
  { pattern: /主要功能/, fields: ["program.primary"] },
  {
    pattern: /成果规格|成果要求|页面尺寸|图纸尺寸/,
    fields: ["deliverable.page_format"],
  },
] as const;

function factualPageGapFact(
  projectFacts: DesignReportProjectFacts,
  gap: string,
) {
  const matcher = factualGapFieldMatchers.find((candidate) =>
    candidate.pattern.test(gap),
  );
  if (!matcher) return undefined;
  return projectFacts.facts.find(
    (fact) =>
      fact.status !== "superseded" &&
      fact.status !== "conflict" &&
      matcher.fields.some((fieldPath) => fact.field_path === fieldPath) &&
      String(fact.value_raw).trim().length > 0,
  );
}

function factualPageGapIsSatisfied(
  projectFacts: DesignReportProjectFacts,
  gap: string,
) {
  return Boolean(factualPageGapFact(projectFacts, gap));
}

const PROPOSAL_RESOLUTION_PREFIX = "提案待验证：";
const PROPOSAL_VALIDATION_PREFIX = "提案验证事项：";
const PROPOSAL_PAGE_SYNC_VERSION = "v4";
const DEFAULT_PROPOSAL_VALIDATION =
  "补充与已确认方向对应的图纸、计算或专业复核";
const BACKSTAGE_PROPOSAL_FIELD_PATTERN =
  /["']?(?:option_id|task_brief_fact_refs|selected_option_id|user_input|confirmed_direction|missing_item_id|missing_label|validation_needed|design_moves|assumptions|rationale)["']?\s*:/i;
const SERIALIZED_PROPOSAL_FRAGMENT_PATTERN =
  /(?:^|\s)\]\s*,\s*\[\s*["']|["']\s*\]\s*→\s*\]\s*,\s*\[|\\["'][^\n]{2,}\\["']|^[\s\[\]{},:;"']+$/u;

function isBackstageProposalPayload(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (BACKSTAGE_PROPOSAL_FIELD_PATTERN.test(text)) return true;
  if (SERIALIZED_PROPOSAL_FRAGMENT_PATTERN.test(text)) return true;
  if (!/^[\[{]/.test(text) || !/[}\]]$/.test(text)) return false;
  try {
    const parsed = JSON.parse(text);
    return Boolean(parsed && typeof parsed === "object");
  } catch {
    return false;
  }
}

function cleanProposalUserText(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().replace(/\s+/g, " ");
  const machineEnumChain =
    /^[a-z0-9_-]+(?:\s*→\s*[a-z0-9_-]+)+$/i.test(text) ||
    /^[a-z][a-z0-9-]*(?:_[a-z0-9-]+)+$/i.test(text);
  return text && !isBackstageProposalPayload(text) && !machineEnumChain
    ? text
    : "";
}

export function proposalLabelsForPageGap(gap: string) {
  const cleanGap = gap.trim();
  if (isOptionalProductionInputGap(cleanGap)) return [];
  const matched = pageGapTopicMatchers
    .filter((topic) => topic.pattern.test(cleanGap))
    .map((topic) => topic.label);
  if (matched.length) return [...new Set(matched)];
  if (factualPageGapPattern.test(cleanGap)) return [];
  // Only recognized design decisions become proposal cards. Missing drawings,
  // production assets and arbitrary planner notes stay out of the user-facing
  // proposal workflow.
  return [];
}

function proposalItemId(label: string) {
  let hash = 2166136261;
  for (const character of label) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `M_PAGE_${(hash >>> 0).toString(36).toUpperCase()}`;
}

function proposalCoversLabel(proposal: GateBProposal, label: string) {
  return (
    proposal.status === "confirmed" &&
    proposal.missing_label === label &&
    Boolean(proposal.confirmed_direction.trim())
  );
}

function proposalTargetPageTypes(proposal: GateBProposal) {
  if (proposal.target_page_types?.length) {
    return new Set<string>(proposal.target_page_types);
  }
  const topic = USER_PROPOSAL_TOPICS.find(
    (candidate) => candidate.value === proposal.missing_label,
  );
  return new Set<string>(topic?.targetPageTypes ?? []);
}

function proposalContextHash(proposals: GateBProposal[]) {
  if (!proposals.length) return "";
  const payload = proposals
    .map((proposal) => {
      const selected = proposal.options.find(
        (option) => option.option_id === proposal.selected_option_id,
      );
      return [
        proposal.missing_item_id,
        proposal.confirmed_direction,
        selected?.title ?? "",
        selected?.summary ?? "",
        ...(selected?.design_moves ?? []),
      ].join("|");
    })
    .sort()
    .join("||");
  let hash = 2166136261;
  for (const character of payload) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `proposal-${PROPOSAL_PAGE_SYNC_VERSION}-${(hash >>> 0).toString(36)}`;
}

function confirmedProposalForLabel(
  projectFacts: DesignReportProjectFacts,
  label: string,
) {
  return (projectFacts.gate_b_proposals ?? []).find((proposal) =>
    proposalCoversLabel(proposal, label),
  );
}

function pageGapIsConfirmed(
  projectFacts: DesignReportProjectFacts,
  gap: string,
) {
  const labels = proposalLabelsForPageGap(gap);
  return (
    labels.length > 0 &&
    labels.every((label) =>
      Boolean(confirmedProposalForLabel(projectFacts, label)),
    )
  );
}

const genericProposalOptionTitles = new Set([
  "公共价值导向",
  "场地问题导向",
  "综合绩效导向",
  "任务书显性条件",
  "成果可验证性",
  "叙事优先级",
  "场地回应型",
  "公共价值型",
  "空间序列型",
  "集中整合",
  "多孔连接",
  "组团渐进",
  "分流闭环",
  "共享慢行",
  "立体分层",
  "公共核心",
  "连续街巷",
  "多层客厅",
  "气候响应",
  "城市界面",
  "模块秩序",
]);

const proposalMoveTranslations: Record<string, string> = {
  inset_void_in_massing: "在体量中嵌入共享中庭",
  structural_transfer_at_podium: "在裙房转换层协调上下部空间",
  vertical_circulation_hub: "以垂直交通枢纽串联多层公共空间",
  stepped_massing_strategy: "通过体量退台形成多层公共界面",
  elevated_public_walkway: "以架空或抬升步道串联公共节点",
  ground_floor_permeability: "打开首层界面形成连续城市街巷",
};

function confirmedProposalMap(projectFacts: DesignReportProjectFacts) {
  return new Map(
    (projectFacts.gate_b_proposals ?? [])
      .filter(
        (proposal) =>
          proposal.status === "confirmed" &&
          Boolean(cleanProposalUserText(proposal.confirmed_direction)),
      )
      .map((proposal) => [proposal.missing_label, proposal]),
  );
}

function selectedProposalOption(proposal: GateBProposal | undefined) {
  if (!proposal) return undefined;
  return proposal.options.find(
    (option) => option.option_id === proposal.selected_option_id,
  );
}

function proposalOptionTitle(proposal: GateBProposal | undefined) {
  return cleanProposalUserText(selectedProposalOption(proposal)?.title);
}

function proposalDirection(proposal: GateBProposal | undefined) {
  return cleanProposalUserText(proposal?.confirmed_direction);
}

function proposalDirectionClause(proposal: GateBProposal | undefined) {
  return proposalDirection(proposal).replace(/[。；，,、\s]+$/u, "");
}

function proposalDesignMoves(proposal: GateBProposal | undefined) {
  const moves = selectedProposalOption(proposal)?.design_moves ?? [];
  return moves
    .flatMap((move) => cleanProposalUserText(move).split(/\s*→\s*/))
    .map((move) =>
      move
        .replace(/^(?:All|[A-D])\s+/i, "")
        .replace(/^,+\s*/, "")
        .trim(),
    )
    .map((move) => proposalMoveTranslations[move] ?? move)
    .filter((move) => move.length >= 2);
}

function proposalNameFromDirection(
  proposal: GateBProposal | undefined,
  fallback: string,
) {
  const direction = proposalDirection(proposal);
  const quotedName = direction.match(/[“「『"]([^”」』"]{2,18})[”」』"]/u)?.[1];
  if (quotedName) return quotedName.trim();
  const leadingName = direction.match(/^([^：:，。；;]{2,18})\s*[：:]/u)?.[1];
  if (leadingName) return leadingName.trim();
  const optionTitle = proposalOptionTitle(proposal);
  if (optionTitle && !genericProposalOptionTitles.has(optionTitle)) {
    return optionTitle;
  }
  return fallback;
}

function conceptEnglishName(conceptName: string) {
  const knownNames: Record<string, string> = {
    生态垂直聚落: "ECOLOGICAL VERTICAL VILLAGE",
    立体城市缝合: "THREE-DIMENSIONAL URBAN STITCHING",
    立体街道: "THREE-DIMENSIONAL STREET",
  };
  return knownNames[conceptName] ?? "PROJECT-SPECIFIC SPATIAL CONCEPT";
}

function shouldRefineProposalDrivenPage(
  page: DesignReportPagePlan["pages"][number],
  proposalContextChanged: boolean,
) {
  if (proposalContextChanged) return true;
  if (["generated", "reviewed"].includes(page.generation_status)) return false;
  return /策略链|四项确认策略|集中整合串联|公共性组织|空间骨架|城市关系回应|开放边界|共享慢行缝合|分流原则|交通组织组织复合到达|共享慢行组织复合到达|核心概念统领|核心概念：|条件推导概念|从四项条件推导|体量生成回应|拆分、错层与连通生成|方案比选|形成综合优选|总体布局统筹|释放完整地面公共空间|功能分区落实|商业基座串联|交通组织校验|立体分流重塑|共享慢行重塑地面|首层平面|连续街巷激活首层|典型楼层|独立交通核保障|剖面关系|垂直剖面|空中庭院与连廊组织|空间序列串联|关键节点营造|重点空间呈现|连续街巷串联关键|立面策略回应|气候响应式立面|气候响应表皮调节|系统剖切渲染|建筑系统协同剖切|局部系统剖切验证|多维价值综合回应|方案设计总结|统合城市效率与公共性/u.test(
    page.headline_zh,
  );
}

function setProposalDrivenPageCopy(
  page: DesignReportPagePlan["pages"][number],
  values: {
    headlineZh: string;
    headlineEn: string;
    coreMessage: string;
    coreMessageEn: string;
    visuals: string[];
  },
) {
  page.headline_zh = values.headlineZh;
  page.headline_en = values.headlineEn;
  page.core_message = values.coreMessage;
  page.core_message_en = values.coreMessageEn;
  page.visual_requirements = values.visuals;
  page.visual_brief = [...values.visuals];
}

/**
 * Confirmed proposals must materially change the report itself. This fast,
 * deterministic pass updates the pages whose role is already known without
 * waiting for another whole-deck model call. It deliberately leaves generated
 * or user-edited pages untouched until a proposal actually changes.
 */
function refinePageFromConfirmedProposals(
  projectFacts: DesignReportProjectFacts,
  page: DesignReportPagePlan["pages"][number],
  proposalContextChanged: boolean,
) {
  if (!shouldRefineProposalDrivenPage(page, proposalContextChanged)) return;
  const proposals = confirmedProposalMap(projectFacts);
  if (proposals.size === 0) return;
  const designGoal = proposals.get("设计目标");
  const evaluation = proposals.get("评审条件");
  const concept = proposals.get("设计概念");
  const masterplan = proposals.get("总体布局");
  const circulation = proposals.get("交通组织");
  const keySpace = proposals.get("重点空间");
  const facade = proposals.get("立面方案");
  const conceptName = proposalNameFromDirection(concept, "项目核心概念");
  const conceptNameEn = conceptEnglishName(conceptName);
  const masterplanTitle = proposalOptionTitle(masterplan) || "总体布局";
  const circulationTitle = proposalOptionTitle(circulation) || "交通组织";
  const keySpaceTitle = proposalOptionTitle(keySpace) || "重点空间";
  const facadeTitle = proposalOptionTitle(facade) || "立面方案";
  const conceptDirection = proposalDirection(concept);
  const masterplanDirection = proposalDirection(masterplan);
  const facadeDirection = proposalDirection(facade);
  const goalClause = proposalDirectionClause(designGoal);
  const circulationClause = proposalDirectionClause(circulation);
  const keySpaceClause = proposalDirectionClause(keySpace);
  const evaluationName = proposalNameFromDirection(
    evaluation,
    "项目评审目标",
  );
  const conceptMoves = proposalDesignMoves(concept);
  const keySpaceMoves = proposalDesignMoves(keySpace);

  if (
    page.page_type === "strategy" &&
    /策略链|四项确认策略|集中整合串联/u.test(page.headline_zh) &&
    masterplan &&
    circulation &&
    keySpace &&
    facade
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: "四项确认策略形成空间闭环",
      headlineEn: "LINKING THE PROJECT-SPECIFIC DESIGN STRATEGY CHAIN",
      coreMessage: `${masterplanTitle}释放地面公共空间，${circulationTitle}与${keySpaceTitle}组织连续公共体验，${facadeTitle}完成环境技术回应。`,
      coreMessageEn:
        "The confirmed masterplan, circulation, key-space and facade directions form one traceable strategy chain.",
      visuals: [
        `四步策略链：${masterplanTitle}、${circulationTitle}、${keySpaceTitle}、${facadeTitle}`,
        "四个等权独立图框，分别表达总体布局、交通、重点空间与立面动作",
        "每个图框只说明一个已确认方向，并在后续总图、平面、剖面和系统渲染页验证",
      ],
    });
  } else if (
    page.page_type === "strategy" &&
    /公共性组织|空间骨架/u.test(page.headline_zh) &&
    keySpace &&
    circulation
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${keySpaceTitle}构建公共空间骨架`,
      headlineEn: "BUILDING THE PUBLIC-SPACE FRAMEWORK THROUGH A CONTINUOUS STREET",
      coreMessage: `${keySpaceClause}，并以共享慢行路径将城市界面、首层商业、入口与空中公共节点组织为连续空间序列。`,
      coreMessageEn:
        "A continuous public route links the urban edge, ground-floor commerce, entrances and elevated shared nodes.",
      visuals: [
        `${keySpaceTitle}公共空间策略图`,
        ...keySpaceMoves,
        "城市界面—首层街巷—抬升步道—空中节点的连续关系",
      ],
    });
  } else if (
    page.page_type === "strategy" &&
    /城市关系回应|开放边界|缝合城市/u.test(page.headline_zh) &&
    circulation
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${circulationTitle}缝合城市开放界面`,
      headlineEn: "STITCHING URBAN INTERFACES WITH A SHARED PEDESTRIAN NETWORK",
      coreMessage: `${circulationClause}，以面向周边城市节点的开放界面和连续步行路径建立场地与城市之间的公共联系。`,
      coreMessageEn:
        "A shared pedestrian network and permeable edges connect the site with surrounding urban destinations.",
      visuals: [
        "城市接口与慢行联系叠加图",
        "场地边界、主要到达方向、开放界面与公共节点",
        "仅使用当前项目区位和场地研究事实作为底图证据",
      ],
    });
  } else if (
    page.page_type === "strategy" &&
    /分流原则|交通效率|交通策略|交通组织组织复合到达|共享慢行组织复合到达/u.test(page.headline_zh) &&
    circulation
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${circulationTitle}组织复合到达`,
      headlineEn: "ORGANIZING ARRIVAL AROUND A SHARED PEDESTRIAN NETWORK",
      coreMessage: `${circulationClause}；公共慢行作为地面主系统，车行入口被弱化并隐藏，后勤保持独立，在交叉节点通过标高或空间分层减少干扰。`,
      coreMessageEn:
        "The public pedestrian network leads the ground plane while concealed vehicle access and independent servicing reduce conflicts at key crossings.",
      visuals: [
        `${circulationTitle}交通策略图`,
        "公共慢行主轴、主要入口、车行落客、后勤入口与关键交叉点",
        "不得表现为完全封闭且彼此割裂的人车货三套系统",
      ],
    });
  } else if (
    page.page_type === "concept" &&
    /核心概念统领|核心概念：/u.test(page.headline_zh) &&
    concept
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `核心概念：${conceptName}`,
      headlineEn: `CORE CONCEPT: ${conceptNameEn}`,
      coreMessage: conceptDirection,
      coreMessageEn:
        "The core concept organizes vertical program integration, shared public space and climate-responsive building form as one coherent spatial system.",
      visuals: [
        `${conceptName}整页建筑空间效果图`,
        "同时呈现垂直体块、空中庭院、连续公共空间与岭南气候回应",
        "使用当前项目的城市环境、复合功能和已确认形态作为生成依据",
      ],
    });
  } else if (
    page.page_type === "concept" &&
    /条件推导概念|从四项条件推导/u.test(page.headline_zh) &&
    concept
  ) {
    const p20VisualSteps = [
      "连续基座连接地铁与绿地",
      "三塔错位形成高低梯度",
      "空中庭院与连桥延伸公共界面",
      "立体绿化回应热湿气候",
    ];
    setProposalDrivenPageCopy(page, {
      headlineZh: `从四项条件推导${conceptName}`,
      headlineEn: `DERIVING ${conceptNameEn} FROM FOUR CONDITIONS TO FOUR SPATIAL MOVES`,
      coreMessage: `高密度复合功能、运营独立、公共空间连续性和热湿气候四项条件，分别转化为${p20VisualSteps.join("、")}，逐步形成${conceptName}的空间组织。`,
      coreMessageEn:
        "Four project conditions become four spatial moves: a continuous podium linking metro and park, staggered towers with a height gradient, sky gardens and bridges extending the public realm, and vertical greenery responding to the hot-humid climate.",
      visuals: [
        "四步空间动作序列",
        ...p20VisualSteps,
        "四张图保持同一组三塔母型、观察角度和场地底图，仅突出当前步骤。",
      ],
    });
  } else if (
    page.page_type === "concept" &&
    /体量生成回应|体量生成|拆分、错层与连通生成/u.test(page.headline_zh) &&
    concept
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `拆分、错层与连通生成${conceptName}`,
      headlineEn: `FORMING ${conceptNameEn} THROUGH SPLITTING, STEPPING AND CONNECTION`,
      coreMessage: `整体体量被拆分为对应主要业态的垂直体块，通过错层空中庭院、体块间通风缝隙和水平公共连接形成可识别的垂直聚落。`,
      coreMessageEn:
        "Program-based vertical volumes, staggered sky gardens, ventilation gaps and public links form a recognizable vertical village.",
      visuals: [
        "四步体量生成图：整合、拆分、错层、连通",
        ...(conceptMoves.length ? conceptMoves : ["垂直体块、空中庭院、通风缝隙与公共连桥"]),
        "所有步骤保持同一观察角度、场地边界和形态基因",
      ],
    });
  } else if (
    page.page_type === "comparison" &&
    /方案比选|形成综合优选/u.test(page.headline_zh) &&
    concept
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${conceptName}形成综合优选`,
      headlineEn: `${conceptNameEn} AS THE PREFERRED INTEGRATED OPTION`,
      coreMessage: `${conceptName}在垂直功能效率、公共空间连续性和气候适应三个方面形成更完整的综合回应，作为后续深化方向。`,
      coreMessageEn:
        "The preferred concept offers the most coherent response across vertical efficiency, public-space continuity and climate adaptation.",
      visuals: [
        "两种概念原型并列比较",
        "比较维度：垂直效率、公共价值、气候响应与实施约束",
        `明确标出${conceptName}为后续深化方向`,
      ],
    });
  } else if (
    page.page_type === "masterplan" &&
    /总体布局统筹|释放完整地面公共空间/u.test(page.headline_zh) &&
    masterplan
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${masterplanTitle}释放完整地面公共空间`,
      headlineEn: "CONCENTRATING THE PROGRAM TO RELEASE A CONTINUOUS PUBLIC GROUND",
      coreMessage: masterplanDirection,
      coreMessageEn:
        "A compact vertical organization places retail at the base and releases a continuous public ground around the principal volumes.",
      visuals: [
        `${masterplanTitle}总平面图`,
        "建筑主体、商业基座、地面公共广场、城市开放界面和主要入口",
        "总图必须与后续交通、首层平面和剖面保持同一方案边界",
      ],
    });
  } else if (
    page.page_type === "data" &&
    /功能分区落实|商业基座串联/u.test(page.headline_zh) &&
    masterplan
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: "商业基座串联三类垂直体块",
      headlineEn: "LINKING THREE VERTICAL PROGRAM VOLUMES THROUGH A RETAIL PODIUM",
      coreMessage: "零售商业构成连续公共基座，酒店、公寓和办公形成相对独立的垂直体块，以共享层和空中花园协调公共联系与运营边界。",
      coreMessageEn:
        "A continuous retail podium connects three operationally distinct vertical volumes through shared levels and sky gardens.",
      visuals: [
        "功能叠合与运营关系图",
        "零售商业基座、酒店、公寓、办公、共享层与独立交通核",
        "准确面积只使用当前任务书已有数字并标明来源",
      ],
    });
  } else if (
    page.page_type === "masterplan" &&
    /交通组织校验|立体分流重塑|共享慢行重塑地面/u.test(page.headline_zh) &&
    circulation
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${circulationTitle}重塑地面公共界面`,
      headlineEn: "RESHAPING THE PUBLIC GROUND THROUGH A SHARED PEDESTRIAN NETWORK",
      coreMessage: `${circulationClause}；车行和后勤以最少交叉接入，地面连续空间优先服务步行、商业外摆和公共停留。`,
      coreMessageEn:
        "A continuous pedestrian ground takes priority while vehicle and service access are minimized and separated only where conflicts occur.",
      visuals: [
        `${circulationTitle}总图`,
        "慢行主轴、公共节点、商业外摆、车行入口、后勤入口与立体分离节点",
        "流线必须与总平面和首层平面中的入口位置一致",
      ],
    });
  } else if (
    page.page_type === "plan" &&
    /首层平面|连续街巷激活首层/u.test(page.headline_zh) &&
    keySpace
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${keySpaceTitle}激活首层公共生活`,
      headlineEn: "ACTIVATING THE GROUND FLOOR THROUGH A CONTINUOUS PUBLIC STREET",
      coreMessage: `${keySpaceClause}，以通透首层、沿街商业和停留节点连接主要入口、城市广场与抬升公共步道。`,
      coreMessageEn:
        "A permeable ground floor, active retail edge and gathering nodes connect entrances, the urban plaza and elevated public walkways.",
      visuals: [
        "首层平面主图",
        `${keySpaceTitle}、主要入口、沿街商业、公共广场与慢行路径叠加标注`,
        "只使用当前方案平面作为几何证据，效果参考图仅作为辅助场景",
      ],
    });
  } else if (
    page.page_type === "plan" &&
    /典型楼层|独立交通核保障/u.test(page.headline_zh) &&
    designGoal
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: "独立交通核保障垂直体块运营效率",
      headlineEn: "INDEPENDENT CORES SUPPORT EFFICIENT VERTICAL PROGRAM OPERATION",
      coreMessage: `${goalClause}；典型层通过相对独立的交通核、服务空间和使用单元维持各业态运营效率，并在共享层建立受控联系。`,
      coreMessageEn:
        "Independent cores and service zones support efficient operation, while controlled shared levels connect the vertical program volumes.",
      visuals: [
        "典型层平面主图",
        "使用单元、交通核、服务空间、采光界面与共享联系",
        "不得用无图纸依据的标准层尺寸或房间数量填充页面",
      ],
    });
  } else if (
    page.page_type === "section" &&
    /剖面关系|垂直剖面|空中庭院与连廊组织/u.test(page.headline_zh) &&
    keySpace
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: "空中庭院与连廊组织复合剖面",
      headlineEn: "ORGANIZING THE MIXED-USE SECTION WITH SKY GARDENS AND PUBLIC LINKS",
      coreMessage: "剖面以商业基座、垂直功能体块、错层空中庭院和公共连廊建立从地面到高层的连续空间秩序，并标明独立运营边界。",
      coreMessageEn:
        "The section links the retail podium, vertical program volumes, staggered sky gardens and public bridges while retaining operational boundaries.",
      visuals: [
        "建筑剖面主图",
        "商业基座、垂直体块、空中庭院、公共连廊、交通核与通风路径",
        "剖面几何必须与总图、首层和典型层保持一致",
      ],
    });
  } else if (
    page.page_type === "rendering" &&
    /重点空间呈现核心概念|三个重点精彩空间|P19.*核心概念/u.test(
      `${page.headline_zh} ${page.core_message} ${page.visual_requirements.join(" ")}`,
    ) &&
    concept &&
    keySpace
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${keySpaceTitle}回应${conceptName}`,
      headlineEn: `${conceptNameEn} KEY SPACES RESPOND TO THE CORE CONCEPT`,
      coreMessage: `${conceptName}通过三个重点空间被体验：公共到达、核心共享空间与重点室内共同延续${keySpaceTitle}提出的连续公共体验。`,
      coreMessageEn:
        "The core concept is experienced through three key spaces: public arrival, shared space and a focused interior scene.",
      visuals: [
        "三个重点精彩空间效果图",
        "公共到达与开放界面",
        "核心共享空间与概念体验",
        "重点室内空间与材料氛围",
        "P19 核心概念锚定三张图的形态与空间语言",
      ],
    });
  } else if (
    page.page_type === "rendering" &&
    /空间序列串联|关键节点营造|重点空间呈现|连续街巷串联关键/u.test(page.headline_zh) &&
    keySpace
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${keySpaceTitle}串联关键公共体验`,
      headlineEn: "LINKING KEY PUBLIC EXPERIENCES THROUGH A CONTINUOUS STREET",
      coreMessage: `${keySpaceClause}，重点呈现城市到达、通透首层、抬升步道和空中庭院之间连续可感知的公共体验。`,
      coreMessageEn:
        "The key-space sequence connects urban arrival, the permeable ground floor, elevated walkways and sky gardens as one legible public experience.",
      visuals: [
        "城市到达与首层街巷效果图",
        "抬升公共步道或空中庭院效果图",
        "所有视角沿用同一体量、立面语言、景观系统和功能关系",
      ],
    });
  } else if (
    page.page_type === "technical" &&
    /立面策略回应|气候响应式立面|气候响应表皮调节/u.test(page.headline_zh) &&
    facade
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${facadeTitle}表皮调节遮阳与通风`,
      headlineEn: "A CLIMATE-RESPONSIVE ENVELOPE MODULATES SHADING AND VENTILATION",
      coreMessage: facadeDirection,
      coreMessageEn:
        "Orientation-specific shading, planted edges and facade depth respond to solar exposure, daylight and natural ventilation.",
      visuals: [
        `${facadeTitle}立面策略图`,
        "朝向差异、水平遮阳、垂直绿化、开窗与自然通风关系",
        "未核验的窗墙比、遮阳系数、材料规格和性能数字不得进入图面",
      ],
    });
  } else if (
    page.page_type === "rendering" &&
    /系统剖切渲染|建筑系统协同剖切|局部系统剖切验证/u.test(page.headline_zh) &&
    facade
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: "局部系统剖切验证遮阳与通风",
      headlineEn: "A LOCAL FACADE-SYSTEM SECTION VALIDATES SHADING AND VENTILATION",
      coreMessage: "通过近距离切开连续典型楼层，验证室内空间、楼板、幕墙、水平遮阳、垂直绿化与自然通风路径的协同关系。",
      coreMessageEn:
        "A close sectional rendering validates how interiors, slabs, curtain wall, horizontal shading, planted edges and natural ventilation work together.",
      visuals: [
        "局部立面系统剖切渲染",
        "连续三至五层典型楼层与一至两个立面开间",
        "同时显示室内、楼板、吊顶、幕墙、遮阳、绿化、可开启构件与环境路径",
        "不得生成完整塔楼、整栋剖透视、功能分区效果图或体量轴测",
      ],
    });
  } else if (
    page.page_type === "summary" &&
    /多维价值|方案设计总结|统合城市效率与公共性/u.test(page.headline_zh) &&
    concept
  ) {
    setProposalDrivenPageCopy(page, {
      headlineZh: `${conceptName}统合城市效率与公共性`,
      headlineEn: `${conceptNameEn} INTEGRATES URBAN EFFICIENCY AND PUBLIC VALUE`,
      coreMessage: `${conceptName}通过${masterplanTitle}、${circulationTitle}、${keySpaceTitle}和${facadeTitle}四条实施路径，回应“${evaluationName}”的评审主线。`,
      coreMessageEn:
        "The selected concept integrates the confirmed masterplan, circulation, key-space and facade directions into one evidence-based design response.",
      visuals: [
        "总体鸟瞰或建筑整体效果图",
        `${keySpaceTitle}公共空间效果图`,
        `${facadeTitle}建筑近景或系统细节图`,
        "三个图框必须保持同一体量、立面语言、公共空间系统和城市环境",
      ],
    });
  }
}

export function ensurePageGapProposalItems(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  const result = structuredClone(projectFacts);
  const pageIdsByLabel = new Map<string, Set<string>>();

  result.missing_items = result.missing_items.filter(
    (item) => !isOptionalProductionInputGap(missingLabel(item)),
  );
  result.gate_b_proposals = (result.gate_b_proposals ?? []).filter(
    (proposal) => !isOptionalProductionInputGap(proposal.missing_label),
  );
  result.gate_b_proposals = result.gate_b_proposals.map((proposal) =>
    sanitizePersistedGateBProposal(proposal, result),
  );
  if (result.gate_report) {
    const gateBMissing = result.gate_report.gate_b_missing.filter(
      (label) => !isOptionalProductionInputGap(label),
    );
    result.gate_report = {
      ...result.gate_report,
      gate_b_missing: gateBMissing,
      generation_readiness:
        result.gate_report.planner_readiness === "blocked"
          ? "blocked"
          : gateBMissing.length === 0
            ? "ready"
            : gateBMissing.length <= 3
              ? "partial"
              : "blocked",
    };
  }

  for (const page of pagePlan.pages) {
    const candidateGaps = [
      ...page.missing_information,
      ...(page.unresolved_items ?? [])
        .filter((item) => item.startsWith(PROPOSAL_RESOLUTION_PREFIX))
        .map((item) => item.slice(PROPOSAL_RESOLUTION_PREFIX.length)),
    ];
    for (const gap of candidateGaps) {
      for (const label of proposalLabelsForPageGap(gap)) {
        const pageIds = pageIdsByLabel.get(label) ?? new Set<string>();
        pageIds.add(page.page_id);
        pageIdsByLabel.set(label, pageIds);
      }
    }
  }

  const activeFactPaths = new Set(
    result.facts
      .filter(
        (fact) =>
          fact.status !== "superseded" &&
          fact.status !== "conflict" &&
          String(fact.value_raw).trim().length > 0,
      )
      .map((fact) => fact.field_path),
  );
  for (const requirement of [
    {
      label: "设计目标",
      fieldPath: "evaluation.design_goal",
      pageTypes: new Set(["toc", "analysis", "strategy", "concept", "summary"]),
    },
    {
      label: "评审条件",
      fieldPath: "evaluation.priorities",
      pageTypes: new Set(["toc", "analysis", "strategy", "data", "summary"]),
    },
  ]) {
    if (activeFactPaths.has(requirement.fieldPath)) continue;
    const relatedPageIds = new Set(
      pagePlan.pages
        .filter((page) => requirement.pageTypes.has(page.page_type))
        .map((page) => page.page_id),
    );
    pageIdsByLabel.set(requirement.label, relatedPageIds);
  }

  const removedPageGapItemIds = new Set(
    result.missing_items
      .filter(
        (item) =>
          item.item_id.startsWith("M_PAGE_") &&
          !pageIdsByLabel.has(missingLabel(item)),
      )
      .map((item) => item.item_id),
  );
  result.missing_items = result.missing_items.filter(
    (item) => !removedPageGapItemIds.has(item.item_id),
  );
  if (removedPageGapItemIds.size) {
    result.gate_b_proposals = (result.gate_b_proposals ?? []).filter(
      (proposal) =>
        proposal.origin === "user_created" ||
        !removedPageGapItemIds.has(proposal.missing_item_id),
    );
  }
  const existingLabels = new Set(
    result.missing_items
      .filter((item) => item.description.startsWith("Gate B 缺少："))
      .map(missingLabel),
  );
  const usedIds = new Set(
    result.missing_items.map((item) => item.item_id),
  );

  for (const [label, pageIds] of pageIdsByLabel) {
    if (existingLabels.has(label)) continue;
    let itemId = proposalItemId(label);
    let suffix = 2;
    while (usedIds.has(itemId)) {
      itemId = `${proposalItemId(label)}_${suffix}`;
      suffix += 1;
    }
    result.missing_items.push({
      item_id: itemId,
      description: `Gate B 缺少：${label}`,
      severity: /立面|结构|效果图|视觉/.test(label)
        ? "important"
        : "blocking",
      blocks: ["page_generation"],
      suggested_source: /设计目标|评审条件/.test(label)
        ? `请结合当前任务书信息确认项目判断；确认结果作为提案决定保存，不伪装成原始事实。关联页面：${[
            ...pageIds,
          ].join("、")}`
        : `需要形成并确认设计方向；关联页面：${[
            ...pageIds,
          ].join("、")}`,
    });
    existingLabels.add(label);
    usedIds.add(itemId);
  }
  return result;
}

export function applyConfirmedProposalsToPagePlan(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  const result = structuredClone(pagePlan);
  const plannerBlocked =
    projectFacts.gate_report?.planner_readiness === "blocked";

  result.pages = result.pages.map((sourcePage) => {
    const page = structuredClone(sourcePage);
    const trackedProposalGaps = (page.unresolved_items ?? [])
      .filter((item) => item.startsWith(PROPOSAL_RESOLUTION_PREFIX))
      .map((item) => item.slice(PROPOSAL_RESOLUTION_PREFIX.length));
    const candidateGaps = [
      ...new Set([...page.missing_information, ...trackedProposalGaps]),
    ].filter((gap) => !isOptionalProductionInputGap(gap));
    const resolvedProposalGaps = candidateGaps.filter((gap) =>
      pageGapIsConfirmed(projectFacts, gap),
    );
    const unresolvedGaps = candidateGaps.filter(
      (gap) =>
        !pageGapIsConfirmed(projectFacts, gap) &&
        !factualPageGapIsSatisfied(projectFacts, gap),
    );
    const resolvedFactualFactIds = candidateGaps
      .map((gap) => factualPageGapFact(projectFacts, gap)?.fact_id)
      .filter((factId): factId is string => Boolean(factId));
    const confirmedProposals = [
      ...new Map(
        resolvedProposalGaps
          .flatMap(proposalLabelsForPageGap)
          .map((label) => confirmedProposalForLabel(projectFacts, label))
          .filter((proposal): proposal is GateBProposal => Boolean(proposal))
          .map((proposal) => [proposal.missing_item_id, proposal]),
      ).values(),
    ];
    const validationItems = confirmedProposals.flatMap((proposal) => {
      const selected = proposal.options.find(
        (option) => option.option_id === proposal.selected_option_id,
      );
      const validationNeeded = (selected?.validation_needed ?? [])
        .map(cleanProposalUserText)
        .filter(Boolean);
      const userFacingValidationItems = validationNeeded.length
        ? validationNeeded
        : [DEFAULT_PROPOSAL_VALIDATION];
      return userFacingValidationItems.map(
        (item) =>
          `${PROPOSAL_VALIDATION_PREFIX}${proposal.missing_label}｜${item}`,
      );
    });
    const preservedUnresolvedItems = (page.unresolved_items ?? []).filter(
      (item) =>
        !isOptionalProductionInputGap(item) &&
        !candidateGaps.includes(item) &&
        !item.startsWith(PROPOSAL_RESOLUTION_PREFIX) &&
        !item.startsWith(PROPOSAL_VALIDATION_PREFIX),
    );

    page.fact_refs = [
      ...new Set([...page.fact_refs, ...resolvedFactualFactIds]),
    ];
    page.missing_information = unresolvedGaps;
    page.unresolved_items = [
      ...new Set([
        ...preservedUnresolvedItems,
        ...unresolvedGaps,
        ...resolvedProposalGaps.map(
          (gap) => `${PROPOSAL_RESOLUTION_PREFIX}${gap}`,
        ),
        ...validationItems,
      ]),
    ];

    const applicableProposals = confirmedGateBProposalsForPage(
      projectFacts,
      page,
    );
    const nextProposalRefs = applicableProposals.map(
      (proposal) => proposal.missing_item_id,
    );
    const nextProposalHash = proposalContextHash(applicableProposals);
    const previousProposalHash = page.proposal_context_hash ?? "";
    const proposalContextChanged =
      previousProposalHash !== nextProposalHash &&
      Boolean(previousProposalHash || nextProposalHash);

    page.proposal_refs = nextProposalRefs;
    page.proposal_context_hash = nextProposalHash;
    if (proposalContextChanged) {
      page.proposal_coverage = [];
      page.body_copy = "";
      page.body_zh = "";
      page.body_en = "";
      page.diagram_labels = [];
      page.diagram_labels_en = [];
      page.speaker_notes = "";
      page.callouts = [];
      delete page.visual_task;
      if (["generated", "reviewed"].includes(page.generation_status)) {
        page.generation_status = "ready";
      }
    }

    refinePageFromConfirmedProposals(
      projectFacts,
      page,
      proposalContextChanged,
    );

    if (!plannerBlocked && page.missing_information.length === 0) {
      if (["placeholder", "blocked"].includes(page.generation_status)) {
        page.generation_status = "ready";
      }
      if (/本页暂不生成|待补充：|证据不足/.test(page.body_copy)) {
        page.body_copy = "";
        page.body_zh = "";
      }
    } else if (
      page.missing_information.length > 0 &&
      page.generation_status === "ready"
    ) {
      page.generation_status = "placeholder";
    }

    return page;
  });
  return result;
}

export function synchronizeProposalCoverage(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  if (projectFacts.task_mode === "small_building_or_interior") {
    return {
      projectFacts,
      pagePlan,
    };
  }
  const factsWithPageGaps = ensurePageGapProposalItems(
    projectFacts,
    pagePlan,
  );
  return {
    projectFacts: factsWithPageGaps,
    pagePlan: applyConfirmedProposalsToPagePlan(
      factsWithPageGaps,
      pagePlan,
    ),
  };
}

export function proposalValidationItemsForPage(
  page: DesignReportPagePlan["pages"][number],
) {
  const items = (page.unresolved_items ?? [])
    .filter((item) => item.startsWith(PROPOSAL_VALIDATION_PREFIX))
    .map((item) => {
      const payload = item.slice(PROPOSAL_VALIDATION_PREFIX.length);
      const separatorIndex = payload.indexOf("｜");
      const rawLabel =
        separatorIndex >= 0 ? payload.slice(0, separatorIndex) : "提案";
      const rawValidation =
        separatorIndex >= 0
          ? payload.slice(separatorIndex + 1)
          : payload;
      const label = cleanProposalUserText(rawLabel) || "提案";
      const validation =
        cleanProposalUserText(rawValidation) || DEFAULT_PROPOSAL_VALIDATION;
      return `${label}：${validation}`;
    });
  return [...new Set(items)];
}

export function gateBBriefFacts(
  projectFacts: DesignReportProjectFacts,
  label: string,
) {
  if (label === SMALL_MODE_DESIGN_DIRECTION_LABEL) {
    return smallModeDesignDirectionFacts(projectFacts);
  }
  const hints = fieldHints[label] ?? [];
  const currentFacts = projectFacts.facts.filter(
    (fact) =>
      fact.status === "confirmed" &&
      (fact.source_role === "brief_fact" ||
        fact.source_role === "proposal_fact"),
  );
  const preferred = currentFacts.filter((fact) =>
    hints.some((hint) => fact.field_path.startsWith(hint)),
  );
  const briefFacts = currentFacts.filter(
    (fact) => fact.source_role === "brief_fact",
  );
  return [...preferred, ...briefFacts]
    .filter(
      (fact, index, all) =>
        all.findIndex((candidate) => candidate.fact_id === fact.fact_id) ===
        index,
    )
    .slice(0, 8);
}

export function createLocalGateBProposal(
  projectFacts: DesignReportProjectFacts,
  missingItemId: string,
): GateBProposal {
  const item = projectFacts.missing_items.find(
    (candidate) => candidate.item_id === missingItemId,
  );
  if (!item || !item.description.startsWith("Gate B 缺少：")) {
    throw new Error(`没有找到对应的内容缺项：${missingItemId}`);
  }
  const label = missingLabel(item);
  const evidence = gateBBriefFacts(projectFacts, label);
  const factRefs = evidence.map((fact) => fact.fact_id);
  const templates = optionTemplates[label] ?? optionTemplates["设计概念"];
  return {
    missing_item_id: item.item_id,
    missing_label: label,
    origin: "agent_missing",
    status: "awaiting_choice",
    question: `对于“${label}”，你更倾向哪一种设计方向？也可以直接输入自己的判断。`,
    task_brief_fact_refs: factRefs,
    options: templates.map((template, index) => ({
      option_id: `${item.item_id}_O${index + 1}`,
      title: template.title,
      summary: template.summary,
      design_moves: template.designMoves,
      rationale: factRefs.length
        ? `该方向需逐项回应任务书事实：${factRefs.join("、")}。`
        : "当前任务书证据较少，该方向只能作为待讨论假设。",
      task_brief_fact_refs: factRefs,
      assumptions: [template.assumption],
      validation_needed: template.validation,
    })) as GateBProposal["options"],
    selected_option_id: null,
    user_input: "",
    confirmed_direction: "",
  };
}

function nonEmpty(value: unknown, fallback: string) {
  return cleanProposalUserText(value) || fallback;
}

function strings(value: unknown, fallback: string[], allowEmpty = true) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map(cleanProposalUserText)
    .filter(Boolean);
  return items.length || allowEmpty ? [...new Set(items)] : fallback;
}

export function sanitizeGateBProposal(
  value: unknown,
  baseline: GateBProposal,
  projectFacts: DesignReportProjectFacts,
): GateBProposal {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const validFactIds = new Set(
    gateBBriefFacts(projectFacts, baseline.missing_label).map(
      (fact) => fact.fact_id,
    ),
  );
  const rawOptions = Array.isArray(raw.options)
    ? raw.options.filter(
        (option): option is Record<string, unknown> =>
          Boolean(option) &&
          typeof option === "object" &&
          !Array.isArray(option),
      )
    : [];
  const targetCount = Math.max(2, Math.min(3, rawOptions.length || 3));
  const options = Array.from({ length: targetCount }, (_, index) => {
    const option = rawOptions[index] ?? {};
    const fallback = baseline.options[index] ?? baseline.options[0];
    return {
      option_id: `${baseline.missing_item_id}_O${index + 1}`,
      title: nonEmpty(option.title, fallback.title),
      summary: nonEmpty(option.summary, fallback.summary),
      design_moves: strings(
        option.design_moves,
        fallback.design_moves,
        false,
      ),
      rationale: nonEmpty(option.rationale, fallback.rationale),
      task_brief_fact_refs: strings(
        option.task_brief_fact_refs,
        fallback.task_brief_fact_refs,
        false,
      ).filter((factId) => validFactIds.has(factId)),
      assumptions: strings(option.assumptions, fallback.assumptions),
      validation_needed: strings(
        option.validation_needed,
        fallback.validation_needed,
      ),
    };
  }) as GateBProposal["options"];
  return {
    ...baseline,
    question: nonEmpty(raw.question, baseline.question),
    task_brief_fact_refs: strings(
      raw.task_brief_fact_refs,
      baseline.task_brief_fact_refs,
      false,
    ).filter((factId) => validFactIds.has(factId)),
    options,
  };
}

function sanitizePersistedGateBProposal(
  proposal: GateBProposal,
  projectFacts: DesignReportProjectFacts,
): GateBProposal {
  if (proposal.origin === "user_created") {
    const direction = cleanProposalUserText(proposal.confirmed_direction);
    return {
      ...proposal,
      user_defined_title:
        cleanProposalUserText(proposal.user_defined_title) || "用户提案",
      question: cleanProposalUserText(proposal.question) || "用户提案",
      options: [],
      selected_option_id: null,
      user_input: cleanProposalUserText(proposal.user_input) || direction,
      confirmed_direction: direction,
      status: direction ? "confirmed" : "awaiting_choice",
    };
  }

  const itemExists = projectFacts.missing_items.some(
    (item) => item.item_id === proposal.missing_item_id,
  );
  if (!itemExists) return proposal;

  const baseline = createLocalGateBProposal(
    projectFacts,
    proposal.missing_item_id,
  );
  const sanitized = sanitizeGateBProposal(proposal, baseline, projectFacts);
  const confirmedDirection = cleanProposalUserText(
    proposal.confirmed_direction,
  );
  const userInput = cleanProposalUserText(proposal.user_input);
  const selectedOptionId = sanitized.options.some(
    (option) => option.option_id === proposal.selected_option_id,
  )
    ? proposal.selected_option_id
    : null;
  const status =
    proposal.status === "confirmed" && !confirmedDirection
      ? "awaiting_choice"
      : proposal.status;

  return {
    ...sanitized,
    status,
    selected_option_id: selectedOptionId,
    user_input: userInput,
    confirmed_direction: confirmedDirection,
  };
}

export function upsertGateBProposal(
  projectFacts: DesignReportProjectFacts,
  proposal: GateBProposal,
) {
  const result = structuredClone(projectFacts);
  result.gate_b_proposals = [
    ...(result.gate_b_proposals ?? []).filter(
      (candidate) =>
        candidate.missing_item_id !== proposal.missing_item_id,
    ),
    proposal,
  ];
  return result;
}

export function updateGateBProposal(
  projectFacts: DesignReportProjectFacts,
  missingItemId: string,
  operation: Exclude<GateBProposalOperation, "generate">,
  selectedOptionId?: string,
  userInput?: string,
) {
  const existing =
    projectFacts.gate_b_proposals?.find(
      (proposal) => proposal.missing_item_id === missingItemId,
    ) ?? createLocalGateBProposal(projectFacts, missingItemId);
  const proposal = structuredClone(existing);
  if (operation === "select") {
    const option = proposal.options.find(
      (candidate) => candidate.option_id === selectedOptionId,
    );
    if (!option) throw new Error("请选择有效的设计提案。");
    proposal.status = "confirmed";
    proposal.selected_option_id = option.option_id;
    proposal.user_input = "";
    proposal.confirmed_direction = option.summary;
  } else if (operation === "custom") {
    const direction = userInput?.trim() ?? "";
    if (!direction) throw new Error("请先输入你的设计方向。");
    proposal.status = "confirmed";
    proposal.selected_option_id = null;
    proposal.user_input = direction;
    proposal.confirmed_direction = direction;
  } else {
    const selected = proposal.options.find(
      (option) => option.option_id === proposal.selected_option_id,
    );
    const direction = proposal.user_input.trim() || selected?.summary || "";
    if (!direction) throw new Error("请先选择提案或输入自己的方向。");
    proposal.status = "confirmed";
    proposal.confirmed_direction = direction;
  }
  return upsertGateBProposal(projectFacts, proposal);
}

export function createUserDefinedProposal(
  projectFacts: DesignReportProjectFacts,
  topicValue: UserProposalTopic,
  title: string,
  direction: string,
  createdAt = new Date().toISOString(),
) {
  const topic = USER_PROPOSAL_TOPICS.find(
    (candidate) => candidate.value === topicValue,
  );
  if (!topic) throw new Error("请选择有效的提案类型。");
  const cleanTitle = title.trim();
  const cleanDirection = direction.trim();
  if (!cleanTitle) throw new Error("请填写提案标题。");
  if (!cleanDirection) throw new Error("请填写具体的设计方向。");

  const existingIds = new Set(
    (projectFacts.gate_b_proposals ?? []).map(
      (proposal) => proposal.missing_item_id,
    ),
  );
  let index = 1;
  let proposalId = `USER_PROPOSAL_${String(index).padStart(3, "0")}`;
  while (existingIds.has(proposalId)) {
    index += 1;
    proposalId = `USER_PROPOSAL_${String(index).padStart(3, "0")}`;
  }
  const factRefs = gateBBriefFacts(projectFacts, topic.value).map(
    (fact) => fact.fact_id,
  );
  const proposal: GateBProposal = {
    missing_item_id: proposalId,
    missing_label: topic.value,
    origin: "user_created",
    user_defined_title: cleanTitle,
    target_page_types: [...topic.targetPageTypes],
    created_at: createdAt,
    status: "confirmed",
    question: cleanTitle,
    task_brief_fact_refs: factRefs,
    options: [],
    selected_option_id: null,
    user_input: cleanDirection,
    confirmed_direction: cleanDirection,
  };
  return upsertGateBProposal(projectFacts, proposal);
}

export function removeUserDefinedProposal(
  projectFacts: DesignReportProjectFacts,
  proposalId: string,
) {
  const proposal = projectFacts.gate_b_proposals?.find(
    (candidate) => candidate.missing_item_id === proposalId,
  );
  if (!proposal || proposal.origin !== "user_created") {
    throw new Error("找不到要删除的用户提案。");
  }
  const result = structuredClone(projectFacts);
  result.gate_b_proposals = (result.gate_b_proposals ?? []).filter(
    (candidate) => candidate.missing_item_id !== proposalId,
  );
  return result;
}

export function confirmedGateBProposalsForPage(
  projectFacts: DesignReportProjectFacts,
  page: {
    page_type: string;
    headline_zh: string;
    core_message?: string;
    missing_information: string[];
    unresolved_items?: string[];
  },
) {
  const pageNeed = [
    page.headline_zh,
    page.core_message ?? "",
    ...page.missing_information,
    ...(page.unresolved_items ?? []),
  ].join(" ");
  const isStrategyOverview =
    page.page_type === "strategy" &&
    /四项确认策略|策略链|集中整合串联/u.test(page.headline_zh);
  const strategyOverviewTopics = new Set([
    "总体布局",
    "交通组织",
    "重点空间",
    "立面方案",
  ]);
  return (projectFacts.gate_b_proposals ?? []).filter((proposal) => {
    if (proposal.status !== "confirmed") return false;
    if (page.page_type === "summary") return true;
    if (isStrategyOverview && strategyOverviewTopics.has(proposal.missing_label)) {
      return true;
    }
    if (pageNeed.includes(proposal.missing_label)) return true;
    if (proposalTargetPageTypes(proposal).has(page.page_type)) return true;
    return false;
  });
}
