const backstageFieldPattern =
  /结构化经验|历史样本|历史参考|参考样本|经验配方|页面配方|素材槽|匹配依据|主视觉|辅助视觉|文字密度|layout[_\s-]?(?:family|hint)?|page[_\s-]?role|recipe[_\s-]?(?:id)?|style[_\s-]?example|experience[_\s-]?recipe|visual[_\s-]?(?:requirements|brief|task)|body[_\s-]?copy|speaker[_\s-]?notes|core[_\s-]?message|fact[_\s-]?refs?|source[_\s-]?document|generation[_\s-]?status|SYS_REFERENCE|RSE_[A-Z0-9_]+|[A-Z0-9]+_RX_\d+|site[_\s-]?map|\b(?:low|medium|high)\b/i;

const productionInstructionPattern =
  /图像建议|视觉建议|排版建议|版式建议|构图建议|生成提示词|提示词|prompt|后台(?:数据|信息|说明)|低(?:分辨率|清)(?:图像|图片|意向图|概念图)?|AI\s*(?:生成|意向)|人工智能生成|仅用于(?:排版|视觉|方向|生成)|占位(?:图|符|文字|内容)?|待补(?:充|图|资料|素材)|证据不足|暂不生成设计结论|当前项目图像与设计动作待补|图面区域待补|讲述时|写作时|汇报时先|用于组织图面|可直接印在汇报|模型返回|schema|JSON/i;

const layoutDirectivePattern =
  /(?:本页|该页|页面)(?:建议|可采用|应采用|需要|需|将使用|使用).{0,48}(?:版式|排版|构图|图像|图片|图纸|素材|标注|标签|图注|留白)|(?:建议|请|需要|需)(?:使用|采用|放置|配置|配图|补充).{0,48}(?:版式|构图|图像|图片|素材|标注|标签|图注)|(?:左|右|上|下)(?:侧|方).{0,36}(?:放置|排布|排列|展示|配图)|留出.{0,24}(?:文字|标题|图注|空白)/i;

const labelPrefixPattern =
  /^(?:(?:label|diagram[_\s-]?label|图解标签|图像建议|视觉建议|版式建议)\s*\d*\s*(?:zh|cn|中文)?\s*[:：]\s*)/i;

function textSegments(value: string) {
  return (
    value
      .replace(/\r\n?/g, "\n")
      .match(/[^。！？；\n]+[。！？；]?/g) ?? []
  )
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function containsBackstagePresentationText(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  return (
    backstageFieldPattern.test(normalized) ||
    productionInstructionPattern.test(normalized) ||
    layoutDirectivePattern.test(normalized)
  );
}

export function cleanPresentationLabel(value: string) {
  return value
    .trim()
    .replace(labelPrefixPattern, "")
    .replace(/^[-–—•·]\s*/, "")
    .trim();
}

export function sanitizePresentationText(
  value: string | undefined,
  fallback = "",
) {
  const safe = textSegments(value ?? "")
    .filter((segment) => !containsBackstagePresentationText(segment))
    .join("");
  if (safe) return safe;
  const safeFallback = textSegments(fallback)
    .filter((segment) => !containsBackstagePresentationText(segment))
    .join("");
  return safeFallback;
}

export function normalizePageHeadline(
  value: string | undefined,
  fallback = "",
) {
  const headline = sanitizePresentationText(value, fallback);
  return (
    headline.replace(/^以\s*/, "").trim() || sanitizePresentationText(fallback)
  );
}

const genericConceptNamePattern =
  /^(?:设计概念|核心概念|空间概念|概念名称|概念生成|概念推导)$/;

function normalizeConceptName(value: string) {
  const normalized = sanitizePresentationText(value)
    .replace(/^[“”"'《》\s]+|[“”"'《》\s，。；;：:]+$/g, "")
    .replace(/^(?:名为|命名为)\s*/, "")
    .trim();
  if (
    normalized.length < 2 ||
    normalized.length > 28 ||
    genericConceptNamePattern.test(normalized) ||
    /[。！？；;]/.test(normalized)
  ) {
    return "";
  }
  return normalized;
}

/**
 * 从当前页已生成/已编辑的可见文案中提取真正的概念名称。
 * 只有在页面文字没有给出名称时，才使用已确认的概念事实作为兜底；
 * 不再把“设计概念 / DESIGN CONCEPT”这样的模板占位词印在汇报页上。
 */
export function extractConceptName(
  pageText: Array<string | undefined>,
  confirmedConceptValues: Array<string | undefined> = [],
) {
  const values = [...pageText, ...confirmedConceptValues]
    .map((value) => sanitizePresentationText(value))
    .filter(Boolean);
  const patterns = [
    /(?:设计|核心|空间)?概念(?:名称)?\s*(?:以|为|是|：|:|命名为)?\s*[“"《]([^”"》]{2,28})[”"》]/,
    /(?:方案|设计)\s*以\s*[“"《]([^”"》]{2,28})[”"》]\s*(?:为|作为)\s*(?:核心|空间)?概念/,
    /[“"《]([^”"》]{2,28})[”"》]\s*(?:为|作为)\s*(?:核心|空间)?概念/,
    /核心概念\s*[：:]\s*([^，。；;：:\n]{2,28})/,
  ];

  for (const value of values) {
    for (const pattern of patterns) {
      const candidate = normalizeConceptName(value.match(pattern)?.[1] ?? "");
      if (candidate) return candidate;
    }
  }

  for (const value of confirmedConceptValues) {
    const candidate = normalizeConceptName(value ?? "");
    if (candidate && !/[，,]/.test(candidate)) return candidate;
  }
  return "";
}

export function extractEnglishConceptName(
  pageText: Array<string | undefined>,
) {
  const patterns = [
    /(?:core|design|spatial)\s+concept\s*(?:is|uses|takes|named|called|:)?\s*[“"']([^”"']{2,60})[”"']/i,
    /[“"']([^”"']{2,60})[”"']\s*(?:as\s+)?(?:the\s+)?(?:core|design|spatial)\s+concept/i,
    /core\s+concept\s*:\s*([a-z][a-z0-9 &\-/]{1,59})/i,
  ];
  for (const rawValue of pageText) {
    const value = sanitizePresentationText(rawValue);
    if (!value) continue;
    for (const pattern of patterns) {
      const candidate = value
        .match(pattern)?.[1]
        ?.replace(/[.,;:!?\s]+$/g, "")
        .trim();
      if (candidate && candidate.length <= 60) return candidate.toUpperCase();
    }
  }
  return "";
}

export function sanitizePresentationItems(
  values: string[],
  limit = 6,
) {
  return [
    ...new Set(
      values
        .map(cleanPresentationLabel)
        .filter(Boolean)
        .filter((value) => !containsBackstagePresentationText(value)),
    ),
  ].slice(0, limit);
}

export function contextualDiagramLabels(
  pageType: string,
  headline: string,
  coreMessage: string,
  limit = 6,
) {
  const context = `${headline} ${coreMessage}`;
  let labels: string[];

  if (pageType === "analysis" || pageType === "position") {
    if (/开放|公共空间|界面|滨水/.test(context)) {
      labels = ["周边公共空间", "城市道路与到达", "主要开放界面"];
    } else if (/交通|流线|到达|车行|人行/.test(context)) {
      labels = ["道路与入口", "人车到达关系", "交通问题判断"];
    } else if (/限制|边界|控制|建设条件/.test(context)) {
      labels = ["用地与现状边界", "控制条件叠加", "可建设范围判断"];
    } else if (/功能|业态|活动/.test(context)) {
      labels = ["任务功能构成", "共享与邻接关系", "空间组织问题"];
    } else if (/景观|绿地|生态/.test(context)) {
      labels = ["现状景观基础", "生态联系", "景观机会判断"];
    } else {
      labels = ["现状证据", "空间关系", "问题结论"];
    }
  } else if (pageType === "strategy") {
    labels = /交通|流线|到达/.test(context)
      ? ["慢行优先", "车行分流", "后勤独立", "到达整合"]
      : ["现状依据", "核心问题", "设计动作", "落位结果"];
  } else if (pageType === "comparison") {
    labels = ["统一比较基准", "关键方案差异", "推荐判断"];
  } else if (pageType === "masterplan") {
    labels = ["总体布局关系", "开放空间结构", "交通组织校验"];
  } else if (pageType === "plan") {
    labels = ["功能与邻接", "主要流线", "关键空间节点"];
  } else if (pageType === "section") {
    labels = ["竖向交通关系", "空间层次", "关键剖面节点"];
  } else if (pageType === "technical") {
    labels = ["技术原则", "关键构造关系", "性能验证"];
  } else if (pageType === "concept") {
    if (/体量|形态|切分|抬升|围合|连接/.test(context)) {
      labels = [
        "场地基底",
        "边界响应",
        "体量切分",
        "公共空间嵌入",
        "立体连接",
        "形态结果",
      ];
    } else if (/条件|推导|生成逻辑|推演|过程/.test(context)) {
      labels = ["任务条件", "场地约束", "空间动作", "概念生成"];
    } else {
      labels = ["核心概念主视觉", "空间原型", "价值结果"];
    }
  } else if (pageType === "data") {
    labels = ["核心指标", "指标关系", "边界结论"];
  } else if (pageType === "summary") {
    labels = ["城市与场地回应", "空间与功能组织", "公共体验与环境策略"];
  } else {
    labels = ["关键信息", "证据关系", "本页结论"];
  }

  return sanitizePresentationItems(labels, limit);
}
