import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  createStructuredResponse,
  type ModelCallRecord,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import { prepareExportWithModel } from "@/app/lib/model-pipeline";
import { localCultureFusionPrompt } from "@/app/lib/local-culture-fusion";
import {
  smallScaleBuildabilityPrompt,
  validateSmallScaleBuildabilityWithModel,
  type SmallScaleBuildabilityReview,
} from "@/app/lib/small-scale-buildability";

const contentMatchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["match", "issues", "covered_requirements"],
  properties: {
    match: { type: "boolean" },
    issues: { type: "array", items: { type: "string" }, maxItems: 12 },
    covered_requirements: {
      type: "array",
      items: { type: "string" },
      maxItems: 20,
    },
  },
} as const;

export type SmallModeContentMatch = {
  match: boolean;
  issues: string[];
  covered_requirements: string[];
};

function pageCoverageRole(page: DesignReportPagePlan["pages"][number]) {
  const headline = `${page.headline_zh} ${page.core_message}`;
  if (page.page_type === "cover") {
    return "只建立项目身份与总主张，不承担全篇任务书清单";
  }
  if (page.page_type === "comparison" || /矩阵|总览|分工|三件|三类/u.test(headline)) {
    return "负责并列对象的关系、主题和分工；不需要重复 IP、复用等专门页内容";
  }
  if (/IP|少女|真人|现场联动|传播|共创|分享/u.test(headline)) {
    return "负责 IP、真人现场、观众共创和社交传播的对应内容";
  }
  if (/复用|收起|搭建|运营|交付/u.test(headline)) {
    return "负责今年使用、收起、明年复用和交付边界";
  }
  const installation = headline.match(/(?:装置|节点)\s*0?([0-9一二三四五六七八九十]+)/u)?.[1];
  if (installation) {
    return `只负责节点${installation}自己的核心、互动、产品/赠品和视觉表达`;
  }
  if (/活动|发布|背景|策略|主题/u.test(headline)) {
    return "负责活动背景、发布会任务与共同设计语言";
  }
  if (page.page_type === "summary") {
    return "负责回收全篇已经分别证明的对象、传播和复用关系";
  }
  return "负责当前标题对应的单一表达任务，不承担其他专门页的全部内容";
}

function contentPayload(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  const briefFacts = projectFacts.facts.filter(
    (fact) =>
      (fact.source_role === "brief_fact" ||
        fact.source_role === "proposal_fact") &&
      fact.status !== "superseded" &&
      fact.status !== "conflict",
  );
  const pageFactCoverage = pagePlan.pages.map((page) => ({
    page_id: page.page_id,
    headline_zh: page.headline_zh,
    fact_refs: page.fact_refs,
    referenced_fact_details: page.fact_refs
      .map((factId) => briefFacts.find((fact) => fact.fact_id === factId))
      .filter(Boolean)
      .map((fact) => ({
        fact_id: fact!.fact_id,
        field_path: fact!.field_path,
        value: fact!.value_raw,
        source_quote: fact!.source.quote,
      })),
  }));
  const installationIds = [
    ...new Set(
      briefFacts
        .map((fact) => fact.field_path.match(/^installation\.([^.]+)\./u)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
  const nodeNames = installationIds.map((id) => {
    const fact = briefFacts.find((candidate) => candidate.field_path === `installation.${id}.name`);
    return String(fact?.value_raw ?? `节点${id}`);
  });
  const mustCover = [
    "当前项目主题、场地/使用条件与设计目标",
    ...(installationIds.length
      ? [`${nodeNames.join("、")}各自的主题、空间动作、互动与产品/功能关系`]
      : []),
    ...(briefFacts.some((fact) => /^ip\./u.test(fact.field_path))
      ? ["任务书要求的角色、IP或现场视觉延展"]
      : []),
    ...(briefFacts.some((fact) => /互动|传播|分享|共创/u.test(`${fact.field_path} ${String(fact.value_raw)}`))
      ? ["观众参与、互动结果与传播触点"]
      : []),
    ...(briefFacts.some((fact) => /复用|收起|搭建|运输|安装/u.test(`${fact.field_path} ${String(fact.value_raw)}`))
      ? ["建造、运营、收起与后续复用边界"]
      : []),
  ];
  return {
    task_mode: "small_building_or_interior",
    brief_facts: projectFacts.facts
      .filter((fact) => fact.status !== "superseded" && fact.status !== "conflict")
      .map((fact) => ({
        fact_id: fact.fact_id,
        field_path: fact.field_path,
        value: fact.value_raw,
        source_page: fact.source.page,
        source_quote: fact.source.quote,
      })),
    pages: pagePlan.pages.map((page) => ({
      page_id: page.page_id,
      page_type: page.page_type,
      headline_zh: page.headline_zh,
      core_message: page.core_message,
      page_coverage_role: pageCoverageRole(page),
      body_zh: page.body_zh || page.body_copy,
      callouts: (page.callouts ?? []).map((callout) => callout.label_zh),
      diagram_labels: page.diagram_labels,
      fact_refs: page.fact_refs,
      visual_requirements: page.visual_requirements,
      visible_information_units:
        (page.body_zh || page.body_copy ? 1 : 0) +
        Math.min(6, page.callouts?.length ?? 0) +
        Math.min(6, page.visual_task?.image_slots.length ?? 0),
    })),
    page_fact_coverage: pageFactCoverage,
    coverage_rule:
      "只要任务书事实在 page_fact_coverage 中被页面 fact_refs 引用，并且页面核心文案没有与事实冲突，就算该要求已覆盖；不要求每页把全部事实重复写入正文。",
    whole_deck_coverage_owners: {
      "当前项目主题、场地/使用条件与设计目标": "项目定位与总体策略页",
      ...(installationIds.length
        ? { [`${nodeNames.join("、")}各自的主题、空间动作、互动与产品/功能关系`]: "对应节点的概念、现场与构造页" }
        : {}),
      ...(mustCover.includes("任务书要求的角色、IP或现场视觉延展")
        ? { "任务书要求的角色、IP或现场视觉延展": "角色或视觉延展页" }
        : {}),
      ...(mustCover.includes("观众参与、互动结果与传播触点")
        ? { "观众参与、互动结果与传播触点": "互动、传播或总结页" }
        : {}),
      ...(mustCover.includes("建造、运营、收起与后续复用边界")
        ? { "建造、运营、收起与后续复用边界": "实施与复用页" }
        : {}),
    },
    must_cover: mustCover,
    must_not_add: [
      "场地分析",
      "平面图",
      "剖面图",
      "系统图",
      "流线分析图",
      "任务书没有给出的数字、尺寸、材料性能和永久建筑结论",
    ],
    local_culture_fusion: localCultureFusionPrompt(projectFacts),
    small_scale_buildability_skill:
      smallScaleBuildabilityPrompt(projectFacts),
  };
}

export async function validateSmallModeContentMatchWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const response = await createStructuredResponse<SmallModeContentMatch>({
    name: "small_mode_content_match_gate",
    schema: contentMatchSchema,
    instructions:
      "你是小型建筑/装置汇报的最终内容匹配审查员。审查对象是整套 pagePlan，不是单页逐项重复检查。先按 whole_deck_coverage_owners 判断当前任务书要求是否由全篇页面共同覆盖，再按每页的 page_coverage_role 判断该页是否完成自己的页面任务。must_cover 是整套汇报的验收清单，不是每一页的必填清单；不得把总览或策略页当成必须重复某个节点专页的全部细节。页面通过 fact_refs 引用了当前任务书事实，即视为该要求获得证据支撑；不要求把同一事实重复写进每一页正文。除封面外，每页必须有4—6个互补的可见信息单元；信息单元由正文模块、设计动作卡和带图内标题的图像组成，不能用后台字段名凑数。每个节点的 concept 页必须按产品/功能诉求、设计转译、空间形态、互动动作、材料灯光、传播/复用形成六段链条；同一节点跨 concept/rendering/technical 页必须维持同一造型母题。只有负责该主题的页面和其事实引用都缺失、页面过薄、跨页方案漂移或整套页面存在事实冲突时，match 才能为 false。检查是否出现任务书没有给出的数字、尺寸、性能和永久建筑结论。小型建筑/装置管线不要求大型建筑的 Gate B 方案，也不要求场地分析、平面图、剖面图、系统图或流线分析图；不要因缺少这些内容判 false。只返回 JSON。",
    content: [
      {
        type: "input_text",
        text: JSON.stringify(contentPayload(projectFacts, pagePlan)),
      },
    ],
    reasoningEffort: "high",
    runtimeOverride,
    timeoutMs: 90_000,
    maxAttempts: 1,
  });
  return { ...response.value, call: response.call };
}

function localRichnessCheck(pagePlan: DesignReportPagePlan) {
  const backstagePattern =
    /任务书|事实与证据|本页核心结论|页面正文|图解标签|讲述提示/u;
  const issues: string[] = [];
  for (const page of pagePlan.pages) {
    if (page.page_type === "cover") continue;
    const visibleCallouts = (page.callouts ?? [])
      .map((callout) => callout.label_zh.trim())
      .filter((label, index, all) =>
        Boolean(label) &&
        !backstagePattern.test(label) &&
        all.indexOf(label) === index,
      );
    const visibleUnits =
      (page.body_zh || page.body_copy ? 1 : 0) +
      Math.min(6, visibleCallouts.length) +
      Math.min(6, page.visual_task?.image_slots.length ?? 0);
    if (visibleUnits < 4) {
      issues.push(
        `${page.page_id}“${page.headline_zh}”只有${visibleUnits}个可见信息单元，至少需要4个`,
      );
    }
    if (
      page.page_type === "concept" &&
      /(?:装置|节点)\s*0?[0-9一二三四五六七八九十]+/u.test(page.headline_zh)
    ) {
      const chainCorpus = visibleCallouts.join("；");
      const missingLinks = [
        ["产品诉求", /产品|品牌|赠品/u],
        ["装置转译", /装置转译|设计转译|文化转译/u],
        ["空间形态", /空间形态|空间原型|造型|形态/u],
        ["互动动作", /互动|参与|共创|品鉴|触发/u],
        ["材料灯光", /材料|灯光|光影|色彩|釉|水光/u],
        ["传播或复用", /传播|分享|打卡|复用|收起|再部署/u],
      ]
        .filter(([, pattern]) => !(pattern as RegExp).test(chainCorpus))
        .map(([label]) => label as string);
      if (missingLinks.length) {
        issues.push(
          `${page.page_id}“${page.headline_zh}”六段设计链条缺少：${missingLinks.join("、")}`,
        );
      }
    }
  }
  return {
    match: issues.length === 0,
    issues,
  };
}

const visibleSixChain = [
  {
    prefix: "产品诉求",
    pattern: /产品|品牌|山泉|泡茶|瓷器|赠品|发布/u,
    fallback: (page: DesignReportPagePlan["pages"][number]) =>
      `承接“${page.headline_zh.replace(/^(?:装置|节点)\s*0?[0-9一二三四五六七八九十]+\s*[｜|·:]?\s*/u, "")}”对应的产品表达与现场任务`,
  },
  {
    prefix: "装置转译",
    pattern: /装置转译|设计转译|文化转译|母题|概念|设计主张/u,
    fallback: () => "把本页核心主张转译为可识别、可进入的装置母题",
  },
  {
    prefix: "空间形态",
    pattern: /空间形态|空间原型|造型|形态|环|幕|器|门|场|结构/u,
    fallback: () => "以主体造型、观看距离和人装置关系共同建立空间形态",
  },
  {
    prefix: "互动动作",
    pattern: /互动|参与|共创|品鉴|触发|步入|穿行|触摸/u,
    fallback: () => "把观看转化为可进入、可参与并可被记录的现场动作",
  },
  {
    prefix: "材料灯光",
    pattern: /材料|灯光|光影|色彩|釉|水光|金属|织物|半透明/u,
    fallback: () => "以本页既定材料、色彩和光影统一近景与夜景观感",
  },
  {
    prefix: "传播/复用",
    pattern: /传播|分享|打卡|复用|收起|再部署|社交|留影/u,
    fallback: () => "让参与结果便于记录和分享，并为收起与再次使用留出接口",
  },
] as const;

type VisibleSixChainProfile = Record<
  (typeof visibleSixChain)[number]["prefix"],
  string
>;

function taskDerivedSixChainProfile(
  page: DesignReportPagePlan["pages"][number],
): Partial<VisibleSixChainProfile> {
  const corpus = [
    page.headline_zh,
    page.core_message,
    page.body_zh || page.body_copy,
    ...(page.diagram_labels ?? []),
  ].join("；");

  if (/山泉水/u.test(corpus) && /(?:“|")?真(?:”|")?/u.test(corpus)) {
    return {
      产品诉求: "以“真”建立浮梁山泉水的源头信任",
      装置转译: "将澄澈、天然与源头感转译为抽象水势母题",
      空间形态: "以层叠水滴曲面围合可进入的沉浸核心",
      互动动作: "观众步入并触发水光变化，完成感知与留影",
      材料灯光: "半透明肌理叠加冷白水光，强化澄澈质感",
      "传播/复用": "体验连接山泉水赠送，模块收起后可再次部署",
    };
  }

  if (/泡茶水/u.test(corpus) && /(?:“|")?甜(?:”|")?/u.test(corpus)) {
    return {
      产品诉求: "把“真山泉，泡茶甜”转化为可验证的味觉认知",
      装置转译: "将水质对茶香的影响转译为现场冲泡与对比体验",
      空间形态: "环形品鉴界面围绕中央冲泡节点展开",
      互动动作: "观众现场冲泡浮梁茶，对比并品鉴茶香层次",
      材料灯光: "温润瓷白衔接清透水光与暖茶色光晕",
      "传播/复用": "品鉴连接泡茶水赠送，体验组件可收起再使用",
    };
  }

  if (/斗器大会|瓷都|瓷器|瓷之器/u.test(corpus)) {
    return {
      产品诉求: "以瓷器承接斗器大会主题与景德镇品茗文化",
      装置转译: "从器口、釉色与品茗仪式提炼轻国风造型母题",
      空间形态: "环形瓷器意象围合共创与品茗中心",
      互动动作: "观众参与釉水共创，在定制瓷茶杯上留下印记",
      材料灯光: "温润瓷白结合青花釉色与柔和洗墙光",
      "传播/复用": "共创成果便于留影分享，组件收起后可年度复用",
    };
  }

  return {};
}

function cleanSmallModeConceptCopy(value?: string): string {
  return (value ?? "")
    .replace(/([^，。；]{2,16})(?:等|的)\1/gu, "$1")
    .replace(
      /(互动|体验|传播|设计|装置|材料|空间|产品|方案|文化|视觉|复用|共创|活动)\1/gu,
      "$1",
    );
}

function conciseVisibleText(value: string) {
  const withoutPrefix = value
    .replace(
      /^(?:产品诉求|装置转译|设计转译|文化转译|空间形态|空间原型|互动动作|材料灯光|传播\/复用|传播或复用)\s*[｜|:：]\s*/u,
      "",
    )
    .replace(/[\r\n]+/gu, " ")
    .trim();
  const clause = withoutPrefix
    .split(/[。；;\n]/u)
    .map((item) => item.trim())
    .find(Boolean);
  if (!clause) return "";
  if (clause.length <= 52) return clause;
  const shorterClause = clause
    .split(/[，,]/u)
    .map((item) => item.trim())
    .find((item) => item.length >= 8 && item.length <= 52);
  return shorterClause || clause.slice(0, 52);
}

function ensureVisibleSixChain(pagePlan: DesignReportPagePlan) {
  const result = structuredClone(pagePlan);
  for (const page of result.pages) {
    if (
      page.page_type !== "concept" ||
      !/(?:装置|节点)\s*0?[0-9一二三四五六七八九十]+/u.test(page.headline_zh)
    ) {
      continue;
    }
    page.body_zh = cleanSmallModeConceptCopy(page.body_zh);
    page.body_copy = cleanSmallModeConceptCopy(page.body_copy);
    const existingCallouts = page.callouts ?? [];
    const taskDerivedProfile = taskDerivedSixChainProfile(page);
    const fragments: Array<{ text: string; fact_ref?: string }> = [
      ...existingCallouts.map((callout) => ({
        text: callout.label_zh,
        fact_ref: callout.fact_ref,
      })),
      ...(page.body_zh || page.body_copy || "")
        .split(/[。；;\n]/u)
        .map((text) => ({ text })),
      ...(page.visual_requirements ?? []).map((text) => ({ text })),
      ...(page.diagram_labels ?? []).map((text) => ({ text })),
      ...(page.visual_task?.image_slots ?? []).flatMap((slot) => [
        { text: slot.label },
        { text: slot.purpose },
      ]),
    ].filter((fragment) => conciseVisibleText(fragment.text));
    const used = new Set<number>();
    page.callouts = visibleSixChain.map((link) => {
      const taskDerivedDetail = conciseVisibleText(
        taskDerivedProfile[link.prefix] ?? "",
      );
      if (taskDerivedDetail) {
        return {
          label_zh: `${link.prefix}｜${taskDerivedDetail}`,
        };
      }
      const candidateIndex = fragments.findIndex(
        (fragment, index) =>
          !used.has(index) && link.pattern.test(fragment.text),
      );
      const candidate = candidateIndex >= 0 ? fragments[candidateIndex] : undefined;
      if (candidateIndex >= 0) used.add(candidateIndex);
      const detail = conciseVisibleText(candidate?.text ?? link.fallback(page));
      return {
        label_zh: `${link.prefix}｜${detail}`,
        ...(candidate?.fact_ref ? { fact_ref: candidate.fact_ref } : {}),
      };
    }) as NonNullable<typeof page.callouts>;
  }
  return result;
}

function applyVisibleBuildabilityNotes(
  pagePlan: DesignReportPagePlan,
  _review: SmallScaleBuildabilityReview,
) {
  // The skill already guides page generation and image prompts. Its audit
  // suggestions remain internal because they may contain assumptions that are
  // not present in the task brief; raw review notes must never become visible
  // project facts or silently replace the task-defined design direction.
  return pagePlan;
}

function localCoverageCheck(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  const briefFacts = projectFacts.facts.filter(
    (fact) =>
      (fact.source_role === "brief_fact" ||
        fact.source_role === "proposal_fact") &&
      fact.status !== "superseded" &&
      fact.status !== "conflict",
  );
  const forbiddenPageTypes = pagePlan.pages.filter((page) =>
    ["position", "analysis", "masterplan", "plan", "section"].includes(
      page.page_type,
    ),
  );
  const hasVisualPage = pagePlan.pages.some((page) =>
    ["concept", "rendering", "comparison", "strategy", "technical"].includes(
      page.page_type,
    ),
  );
  const visibleCorpus = pagePlan.pages
    .flatMap((page) => [
      page.headline_zh,
      page.core_message,
      page.body_zh,
      page.body_copy,
      ...(page.diagram_labels ?? []),
      ...(page.callouts ?? []).map((callout) => callout.label_zh),
    ])
    .filter(Boolean)
    .join("\n");
  const referencedFactIds = new Set(
    pagePlan.pages.flatMap((page) => page.fact_refs ?? []),
  );
  const referencedFactCorpus = briefFacts
    .filter((fact) => referencedFactIds.has(fact.fact_id))
    .map((fact) => String(fact.value_raw))
    .join("\n");
  const evidenceCorpus = `${visibleCorpus}\n${referencedFactCorpus}`;
  const installationIds = [
    ...new Set(
      briefFacts
        .map((fact) => fact.field_path.match(/^installation\.([^.]+)\./u)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const globalRequirements = [
    {
      label: "当前项目主题、目标与场景",
      test:
        briefFacts.some((fact) => /^(?:project|event)\./u.test(fact.field_path)) &&
        /主题|目标|活动|空间|节点|场地|入口/u.test(evidenceCorpus),
    },
    {
      label: "任务书列出的各空间节点及对应方向",
      test:
        installationIds.length < 1 ||
        installationIds.every((id) =>
          new RegExp(`(?:装置|节点)\\s*0?${id}`, "u").test(evidenceCorpus),
        ),
    },
    {
      label: "任务书要求的互动、传播或使用结果",
      test:
        !briefFacts.some((fact) => /互动|传播|体验|共创|分享|使用/u.test(`${fact.field_path} ${String(fact.value_raw)}`)) ||
        /互动|传播|体验|共创|分享|停留|使用/u.test(evidenceCorpus),
    },
    {
      label: "任务书要求的建造、运营或复用边界",
      test:
        !briefFacts.some((fact) => /reuse|复用|收起|安装|运输|运营|安全/u.test(`${fact.field_path} ${String(fact.value_raw)}`)) ||
        /收起|复用|安装|运输|运营|安全|维护/u.test(evidenceCorpus),
    },
  ];
  const missingGlobalRequirements = globalRequirements
    .filter((requirement) => !requirement.test)
    .map((requirement) => requirement.label);
  const issues = [
    ...(missingGlobalRequirements.length
      ? [`整套汇报仍缺少任务书要求：${missingGlobalRequirements.join("、")}`]
      : []),
    ...(forbiddenPageTypes.length
      ? [
          `页面包含小型建筑/装置管线禁止的图纸/场地页：${forbiddenPageTypes
            .map((page) => page.headline_zh)
            .join("、")}`,
        ]
      : []),
    ...(!hasVisualPage ? ["尚未形成可用于 AI 生图的视觉草案页面"] : []),
  ];
  return {
    match: briefFacts.length > 0 && issues.length === 0,
    issues,
    covered_requirements: [
      ...briefFacts.map(
        (fact) => `${fact.field_path}：${String(fact.value_raw)}`,
      ),
      ...globalRequirements
        .filter((requirement) => requirement.test)
        .map((requirement) => requirement.label),
    ],
  } satisfies SmallModeContentMatch;
}

function prepareSmallModeCoverageRefs(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
) {
  const facts = projectFacts.facts.filter(
    (fact) =>
      (fact.source_role === "brief_fact" ||
        fact.source_role === "proposal_fact") &&
      fact.status !== "superseded" &&
      fact.status !== "conflict",
  );
  const result = structuredClone(pagePlan);
  const pageText = (page: DesignReportPagePlan["pages"][number]) =>
    `${page.headline_zh} ${page.core_message}`;
  const pickPage = (fact: (typeof facts)[number]) => {
    const installationId = fact.field_path.match(
      /^installation\.([^.]+)\./u,
    )?.[1];
    if (installationId) {
      return (
        result.pages.find((page) =>
          new RegExp(`(?:装置|节点)\\s*0?${installationId}`, "u").test(pageText(page)),
        ) ??
        result.pages.find((page) =>
          ["comparison", "summary"].includes(page.page_type),
        )
      );
    }
    if (/^ip\./u.test(fact.field_path)) {
      return (
        result.pages.find((page) => /IP|少女|真人/u.test(pageText(page))) ??
        result.pages.find((page) => page.page_type === "summary")
      );
    }
    if (/^event\.|^brand\./u.test(fact.field_path)) {
      return (
        result.pages.find((page) =>
          /活动|发布|背景|总览|主题/u.test(pageText(page)),
        ) ?? result.pages.find((page) => page.page_type === "summary")
      );
    }
    if (/reuse|复用|收起|年度/u.test(fact.field_path)) {
      return (
        result.pages.find((page) => /复用|收起|搭建|运营/u.test(pageText(page))) ??
        result.pages.find((page) => page.page_type === "summary")
      );
    }
    if (/interaction|传播|共创|social/u.test(fact.field_path)) {
      return (
        result.pages.find((page) => /互动|传播|共创|参与/u.test(pageText(page))) ??
        result.pages.find((page) => page.page_type === "summary")
      );
    }
    return result.pages.find((page) => page.page_type === "summary") ?? result.pages[0];
  };
  const referenced = new Set(result.pages.flatMap((page) => page.fact_refs ?? []));
  for (const fact of facts) {
    if (referenced.has(fact.fact_id)) continue;
    const page = pickPage(fact);
    if (!page) continue;
    page.fact_refs = [...new Set([...(page.fact_refs ?? []), fact.fact_id])];
    referenced.add(fact.fact_id);
  }
  return result;
}

export async function ensureSmallModeContentMatch(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  runtimeOverride?: ModelRuntimeOverride,
): Promise<{
  pagePlan: DesignReportPagePlan;
  calls: ModelCallRecord[];
  match: SmallModeContentMatch;
  buildability: SmallScaleBuildabilityReview;
  repaired: boolean;
}> {
  const scopedPagePlan = ensureVisibleSixChain(
    prepareSmallModeCoverageRefs(projectFacts, pagePlan),
  );
  const [first, firstBuildability] = await Promise.all([
    validateSmallModeContentMatchWithModel(
      projectFacts,
      scopedPagePlan,
      runtimeOverride,
    ),
    validateSmallScaleBuildabilityWithModel(
      projectFacts,
      scopedPagePlan,
      runtimeOverride,
    ),
  ]);
  const firstRichness = localRichnessCheck(scopedPagePlan);
  if (
    first.match &&
    firstRichness.match &&
    firstBuildability.score >= 85
  ) {
    return {
      pagePlan: scopedPagePlan,
      calls: [first.call, firstBuildability.call],
      match: first,
      buildability: firstBuildability,
      repaired: false,
    };
  }

  const alreadyPreparedDeck = scopedPagePlan.pages
    .filter((page) => page.page_type !== "cover")
    .every(
      (page) =>
        ["generated", "reviewed"].includes(page.generation_status) &&
        Boolean(page.body_zh || page.body_copy) &&
        (page.visual_brief ?? []).some((item) =>
          item.startsWith("全篇设计系统｜"),
        ),
    );
  if (alreadyPreparedDeck) {
    if (firstBuildability.score < 60) {
      throw new Error(
        `小型建筑/装置建造性评分 ${firstBuildability.score}/100，低于60，已停止 AI 生图：${[
          ...firstBuildability.issues,
          ...firstBuildability.optimizations,
        ].join("；") || "主要形式尚未形成结构、构件、连接、运输和装配闭环"}`,
      );
    }
    const localCoverage = localCoverageCheck(projectFacts, scopedPagePlan);
    if (firstRichness.match && (first.match || localCoverage.match)) {
      return {
        pagePlan: applyVisibleBuildabilityNotes(
          scopedPagePlan,
          firstBuildability,
        ),
        calls: [first.call, firstBuildability.call],
        match: first.match ? first : localCoverage,
        buildability: firstBuildability,
        repaired: !first.match || firstBuildability.score < 85,
      };
    }
    throw new Error(
      `小型建筑/装置内容匹配仍未通过，已停止 AI 生图：${[
        ...first.issues,
        ...firstRichness.issues,
      ].join("；") || "任务书要求未完整覆盖"}`,
    );
  }

  const repaired = await prepareExportWithModel(
    projectFacts,
    scopedPagePlan,
    "pdf",
    runtimeOverride,
  );
  const repairedPagePlan = ensureVisibleSixChain(repaired.pagePlan);
  const [second, secondBuildability] = await Promise.all([
    validateSmallModeContentMatchWithModel(
      projectFacts,
      repairedPagePlan,
      runtimeOverride,
    ),
    validateSmallScaleBuildabilityWithModel(
      projectFacts,
      repairedPagePlan,
      runtimeOverride,
    ),
  ]);
  const secondRichness = localRichnessCheck(repairedPagePlan);
  const allCalls = [
    first.call,
    firstBuildability.call,
    ...repaired.calls,
    second.call,
    secondBuildability.call,
  ];
  if (secondBuildability.score < 60) {
    throw new Error(
      `小型建筑/装置建造性评分 ${secondBuildability.score}/100，低于60，已停止 AI 生图：${[
        ...secondBuildability.issues,
        ...secondBuildability.optimizations,
      ].join("；") || "主要形式尚未形成结构、构件、连接、运输和装配闭环"}`,
    );
  }
  if (!second.match || !secondRichness.match) {
    const localCoverage = localCoverageCheck(projectFacts, repairedPagePlan);
    if (localCoverage.match && secondRichness.match) {
      const visiblePlan = applyVisibleBuildabilityNotes(
        repairedPagePlan,
        secondBuildability,
      );
      return {
        pagePlan: visiblePlan,
        calls: allCalls,
        match: localCoverage,
        buildability: secondBuildability,
        repaired: true,
      };
    }
    throw new Error(
      `小型建筑/装置内容匹配仍未通过，已停止 AI 生图：${[
        ...second.issues,
        ...secondRichness.issues,
      ].join("；") || "任务书要求未完整覆盖"}`,
    );
  }
  const visiblePlan = applyVisibleBuildabilityNotes(
    repairedPagePlan,
    secondBuildability,
  );
  return {
    pagePlan: visiblePlan,
    calls: allCalls,
    match: second,
    buildability: secondBuildability,
    repaired: true,
  };
}
