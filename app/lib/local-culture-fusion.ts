import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";

export interface LocalCultureFusion {
  city: string;
  province: string;
  status: "brief_grounded" | "location_inferred" | "location_missing";
  proposal_notice: string;
  cultural_anchors: string[];
  design_directions: string[];
  visual_translation: string[];
}

function locationText(projectFacts: DesignReportProjectFacts) {
  return projectFacts.facts
    .filter((fact) => /^site\.|^project\./u.test(fact.field_path))
    .map((fact) => String(fact.value_raw))
    .join(" ");
}

export function localCultureFusionForProject(
  projectFacts: DesignReportProjectFacts,
): LocalCultureFusion {
  const text = `${locationText(projectFacts)} ${projectFacts.project_name_anonymized ?? ""}`;
  if (/景德镇|浮梁|瓷都/u.test(text)) {
    return {
      city: "景德镇",
      province: "江西省",
      status: "brief_grounded",
      proposal_notice:
        "以下文化转译是 Agent 提案，不是任务书既定事实；可用于内容、证据和视觉草案，但必须保留为可确认的设计方向。",
      cultural_anchors: [
        "景德镇瓷都语境",
        "瓷器与品茗习惯",
        "瓷胚、釉水、器物尺度",
        "青花与温润白瓷的轻国风色彩线索",
      ],
      design_directions: [
        "把瓷器的薄、透、温润和釉色变化转译为装置的边界、光泽与互动反馈",
        "把品茗的注水、闻香、举杯、观器动作转译为观众可参与的场景动作",
        "以青花蓝、瓷白、泉水青和少量釉色高光建立年轻化轻国风视觉系统",
        "避免仿古牌楼、复古街景和堆砌传统纹样，优先使用抽象器形、釉面和当代结构",
      ],
      visual_translation: [
        "当代装置、瓷白半透明表皮、釉色渐变、柔和水光",
        "年轻观众参与泡茶、共创釉水或触发光影反馈的现场",
        "景德镇文化作为材料和动作线索出现，不生成历史建筑复刻",
        "轻国风少女 IP 与瓷器、茶水、泉水三类产品统一配色和动作",
      ],
    };
  }
  if (text.trim()) {
    return {
      city: text.trim().split(/[，,。；;\s]/u)[0] || "当前城市",
      province: "所在省份待确认",
      status: "location_inferred",
      proposal_notice:
        "城市文化转译属于 Agent 待确认提案，不得写入任务书既定事实或未经确认的数字结论。",
      cultural_anchors: ["当前城市的地方材料、工艺、生活方式与公共记忆"],
      design_directions: [
        "从当地材料、工艺或日常生活动作中提炼一个可参与的当代表达",
        "避免把地域文化简化为装饰纹样，优先转译材料触感、动作和空间氛围",
      ],
      visual_translation: [
        "当代装置与当地材料线索结合",
        "观众参与地方文化动作的年轻化场景",
      ],
    };
  }
  return {
    city: "城市待确认",
    province: "省份待确认",
    status: "location_missing",
    proposal_notice: "任务书尚未提供城市，Agent 暂不生成地域文化结论。",
    cultural_anchors: [],
    design_directions: [],
    visual_translation: [],
  };
}

export function localCultureFusionPrompt(
  projectFacts: DesignReportProjectFacts,
  page?: DesignReportPagePlan["pages"][number],
) {
  const fusion = localCultureFusionForProject(projectFacts);
  return [
    `本土文化融合 Skill：${fusion.city} / ${fusion.province}`,
    fusion.proposal_notice,
    `文化锚点：${fusion.cultural_anchors.join("；") || "没有已确认的地域文化锚点"}`,
    `可确认设计提案：${fusion.design_directions.join("；") || "不生成地域文化提案"}`,
    `视觉转译：${fusion.visual_translation.join("；") || "不生成地域文化视觉要求"}`,
    page ? `当前页：${page.headline_zh}；${page.core_message}` : "",
    "不得生成未经任务书或用户确认的地名、历史断言、尺寸、材料性能或永久建筑结论。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function localCultureInstallationVisualDna(
  projectFacts: DesignReportProjectFacts,
) {
  const fusion = localCultureFusionForProject(projectFacts);
  const installationIds = [
    ...new Set(
      projectFacts.facts
        .map((fact) => fact.field_path.match(/^installation\.([^.]+)\./u)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const taskBoundaries = installationIds.flatMap((id) => {
    const facts = projectFacts.facts.filter(
      (fact) =>
        fact.status !== "superseded" &&
        fact.status !== "conflict" &&
        fact.field_path.startsWith(`installation.${id}.`),
    );
    const core = facts.find((fact) => fact.field_path.endsWith(".core"))?.value_raw;
    const product = facts.find((fact) =>
      /\.(?:product|gift)$/u.test(fact.field_path),
    )?.value_raw;
    const interaction = facts.find((fact) =>
      fact.field_path.endsWith(".interaction"),
    )?.value_raw;
    const values = [core, product, interaction]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    return values.length
      ? [`对象${id}任务边界：${values.join("；")}`]
      : [];
  });
  return [
    ...taskBoundaries,
    ...(fusion.visual_translation.length
      ? [`本土文化视觉提案：${fusion.visual_translation.join("；")}`]
      : []),
    "具体方案名称、主体轮廓、材料组合和互动构件必须由当前任务的全篇设计系统模型原创生成；不得读取代码默认造型或复制参考案例。",
    "同一对象跨页保持主体轮廓、主色、核心材质线索和互动构件一致；不同对象不得互换主题。",
  ];
}

export function localCultureFusionProposal(
  projectFacts: DesignReportProjectFacts,
) {
  const fusion = localCultureFusionForProject(projectFacts);
  if (!fusion.design_directions.length) return undefined;
  const factRefs = projectFacts.facts
    .filter((fact) =>
      /^site\.|^installation\.|^brand\.|^event\./u.test(fact.field_path),
    )
    .map((fact) => fact.fact_id);
  const designMoves: [string, ...string[]] =
    fusion.visual_translation.length > 0
      ? [fusion.visual_translation[0], ...fusion.visual_translation.slice(1)]
      : [fusion.design_directions[0] ?? "本土文化转译"];
  return {
    missing_item_id: "M_CULTURE_FUSION",
    missing_label: "设计概念" as const,
    origin: "agent_missing" as const,
    user_defined_title: `${fusion.city}本土文化融合`,
    status: "awaiting_choice" as const,
    question: "是否采用本土文化融合提案，并将其用于内容、证据和视觉草案？",
    task_brief_fact_refs: factRefs,
    options: [
      {
        option_id: "M_CULTURE_FUSION_O1",
        title: `${fusion.city}材料与生活动作的当代表达`,
        summary: fusion.design_directions.join("；"),
        design_moves: designMoves,
        rationale: `依据任务书提供的城市与活动语境，提取${fusion.city}的材料、器物或生活动作作为年轻化设计提案。`,
        task_brief_fact_refs: factRefs,
        assumptions: [fusion.proposal_notice],
        validation_needed: ["用户确认文化转译方向", "视觉草案检查是否落入仿古复刻"],
      },
    ],
    selected_option_id: null,
    user_input: "",
    confirmed_direction: "",
  } satisfies NonNullable<DesignReportProjectFacts["gate_b_proposals"]>[number];
}
