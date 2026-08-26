import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";

export type SmallModeLocalReadiness = {
  match: boolean;
  issues: string[];
  coveredRequirements: string[];
};

const chainPrefixes = [
  "产品诉求",
  "装置转译",
  "空间形态",
  "互动动作",
  "材料灯光",
  "传播/复用",
] as const;

function activeFactCorpus(projectFacts: DesignReportProjectFacts) {
  return projectFacts.facts
    .filter((fact) => fact.status !== "superseded" && fact.status !== "conflict")
    .map((fact) => `${fact.field_path} ${String(fact.value_raw)} ${fact.source.quote}`)
    .join("\n");
}

/**
 * Deterministic fail-closed verification used only when the current small-mode
 * deck already exists but the text-review provider is temporarily unavailable.
 * It never generates or repairs content; it only decides whether image calls
 * may start from the current task-brief-derived plan.
 */
export function evaluateSmallModeImageReadiness(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  options?: { pageId?: string },
): SmallModeLocalReadiness {
  const issues: string[] = [];
  const sourceCorpus = activeFactCorpus(projectFacts);
  const pagesToCheck = options?.pageId
    ? pagePlan.pages.filter((page) => page.page_id === options.pageId)
    : pagePlan.pages;
  if (options?.pageId && pagesToCheck.length === 0) {
    issues.push(`找不到当前图片页：${options.pageId}`);
  }
  const visibleCorpus = pagePlan.pages
    .flatMap((page) => [
      page.headline_zh,
      page.core_message,
      page.body_zh || page.body_copy,
      ...(page.callouts ?? []).map((callout) => callout.label_zh),
      ...(page.diagram_labels ?? []),
      ...(page.visual_requirements ?? []),
      ...(page.visual_task?.image_slots ?? []).flatMap((slot) => [
        slot.label,
        slot.purpose,
        slot.prompt_focus,
      ]),
    ])
    .filter(Boolean)
    .join("\n");

  const installationIds = [
    ...new Set(
      projectFacts.facts
        .map((fact) => fact.field_path.match(/^installation\.([^.]+)\./u)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const minimumPageCount = Math.max(8, 5 + installationIds.length * 3);
  if (pagePlan.pages.length < minimumPageCount) {
    issues.push(
      `当前小型建筑/装置汇报为 ${pagePlan.pages.length} 页，依据 ${installationIds.length || "当前"} 个空间节点至少应形成 ${minimumPageCount} 页骨架`,
    );
  }
  if (!projectFacts.facts.some((fact) => fact.source_role === "brief_fact")) {
    issues.push("当前项目没有可核验的任务书事实");
  }

  const forbiddenPageTypes = pagePlan.pages.filter((page) =>
    ["position", "analysis", "masterplan", "plan", "section"].includes(
      page.page_type,
    ),
  );
  if (forbiddenPageTypes.length) {
    issues.push(
      `小型建筑/装置管线仍包含禁止页面：${forbiddenPageTypes
        .map((page) => page.headline_zh)
        .join("、")}`,
    );
  }

  const requirements = [
    {
      label: "当前任务书的项目主题、目标与场景",
      matched: projectFacts.facts.some((fact) => /^(?:project|event)\./u.test(fact.field_path)) &&
        /主题|目标|活动|空间|节点|入口|场地/u.test(visibleCorpus),
    },
    {
      label: "当前任务书列出的各空间节点及对应方向",
      matched: installationIds.length === 0 || installationIds.every((id) =>
        new RegExp(`(?:装置|节点)\\s*0?${id}`, "u").test(visibleCorpus),
      ),
    },
    {
      label: "任务书要求的互动、传播或使用结果",
      matched:
        !projectFacts.facts.some((fact) => /互动|传播|体验|共创|分享|使用/u.test(`${fact.field_path} ${String(fact.value_raw)}`)) ||
        /互动|传播|体验|共创|分享|停留|使用/u.test(visibleCorpus),
    },
    {
      label: "任务书要求的建造、运营或复用边界",
      matched:
        !projectFacts.facts.some((fact) => /reuse|复用|收起|安装|运输|运营|安全/u.test(`${fact.field_path} ${String(fact.value_raw)}`)) ||
        /收起|复用|安装|运输|运营|安全|维护/u.test(visibleCorpus),
    },
  ];
  for (const requirement of requirements) {
    if (!requirement.matched) issues.push(`整套汇报未覆盖：${requirement.label}`);
  }

  for (const page of pagesToCheck) {
    if (page.page_type === "cover") continue;
    if (!["generated", "reviewed"].includes(page.generation_status)) {
      issues.push(`${page.page_id}“${page.headline_zh}”文案尚未完成`);
    }
    if (!(page.body_zh || page.body_copy).trim()) {
      issues.push(`${page.page_id}“${page.headline_zh}”缺少正文`);
    }
    const visibleUnits =
      (page.body_zh || page.body_copy ? 1 : 0) +
      Math.min(6, page.callouts?.length ?? 0) +
      Math.min(6, page.visual_task?.image_slots.length ?? 0);
    if (visibleUnits < 4) {
      issues.push(`${page.page_id}“${page.headline_zh}”只有 ${visibleUnits} 个可见信息单元`);
    }
    if (
      page.page_type === "concept" &&
      /(?:装置|节点)\s*0?[0-9一二三四五六七八九十]+/u.test(page.headline_zh)
    ) {
      const callouts = (page.callouts ?? []).map((callout) => callout.label_zh);
      const missing = chainPrefixes.filter(
        (prefix) => !callouts.some((callout) => callout.startsWith(`${prefix}｜`)),
      );
      if (missing.length) {
        issues.push(`${page.page_id}“${page.headline_zh}”六段设计链缺少：${missing.join("、")}`);
      }
      const designLine = (page.visual_brief ?? []).find((line) =>
        /^对象(?:[0-9一二三四五六七八九十]+)｜/u.test(line),
      );
      if (
        !designLine ||
        !["轮廓=", "空间=", "互动=", "材料灯光=", "构造组件=", "传播复用="].every(
          (field) => designLine.includes(field),
        )
      ) {
        issues.push(`${page.page_id}“${page.headline_zh}”缺少完整的造型与建造性母题`);
      }
    }
  }

  const unsupportedTerms = [
    "机械式压力触发",
    "压力感应",
    "机械呼吸花瓣",
    "机械开合的“花瓣”",
    "香氛机",
    "自动售货机",
    "可擦写釉水笔",
    "素烧瓷片墙",
    "永久复用",
    "无需改动即可复用",
  ];
  for (const term of unsupportedTerms) {
    if (visibleCorpus.includes(term) && !sourceCorpus.includes(term)) {
      issues.push(`页面仍包含任务书未确认的配置：${term}`);
    }
  }

  return {
    match: issues.length === 0,
    issues,
    coveredRequirements: requirements
      .filter((requirement) => requirement.matched)
      .map((requirement) => requirement.label),
  };
}
