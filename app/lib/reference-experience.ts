import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import safeExperienceData from "@/app/data/reference-experience.safe.json";

export type ReferenceExperience = NonNullable<
  DesignReportProjectFacts["reference_experience"]
>;
export type ExperienceRecipe = ReferenceExperience["page_recipes"][number];
type ReportPage = DesignReportPagePlan["pages"][number];
type PageType = ReportPage["page_type"];

export type ExperienceQuery = Pick<ReportPage, "page_type" | "core_message"> &
  Partial<
    Pick<
      ReportPage,
      | "section_id"
      | "headline_zh"
      | "visual_requirements"
      | "visual_brief"
      | "experience_recipe_refs"
    >
  >;

export interface ExperienceMatch {
  recipe: ExperienceRecipe;
  score: number;
  reasons: string[];
  layoutFamily: string;
  typeRank: number;
  priorityTopicMatches: number;
}

export interface ExperienceAssignment {
  recipes: ExperienceRecipe[];
  reasons: string[];
}

export const defaultReferenceExperience =
  safeExperienceData as unknown as ReferenceExperience;

const compatiblePageTypes: Record<PageType, PageType[]> = {
  cover: ["cover", "section_divider", "rendering"],
  toc: ["toc", "section_divider", "analysis"],
  section_divider: ["section_divider", "cover", "concept"],
  position: ["position", "analysis", "data"],
  analysis: ["analysis", "position", "strategy", "comparison", "data"],
  strategy: ["strategy", "concept", "analysis", "masterplan"],
  concept: ["concept", "strategy", "rendering"],
  comparison: ["comparison", "analysis", "strategy"],
  masterplan: ["masterplan", "plan", "strategy", "analysis"],
  plan: ["plan", "masterplan", "section", "technical"],
  section: ["section", "plan", "technical"],
  rendering: ["rendering", "concept"],
  technical: ["technical", "section", "data", "plan"],
  data: ["data", "analysis", "technical"],
  summary: ["summary", "section_divider", "rendering", "concept"],
};

const topicPatterns: Record<string, RegExp> = {
  identity: /项目名称|项目身份|封面|开篇/,
  location: /区位|城市关系|周边|城市资源|区域|位置/,
  site_context: /场地|基地|边界|界面|视线|开放方向/,
  constraints: /建设条件|限制|强度|限高|规模|指标|边界/,
  circulation: /交通|流线|到达|人行|车行|后勤|停车|地铁|轨道|接驳/,
  public_space: /公共|开放空间|广场|场所|节点|活动|体验/,
  program: /功能|业态|复合|面积|分区|运营|使用效率/,
  massing: /体量|形体|形态|高度|切分|抬升|围合|生成/,
  concept: /概念|意象|母题|空间语言|设计动作/,
  landscape: /景观|绿地|花园|生态空间/,
  sustainability: /绿色|生态|低碳|节能|环境性能|认证/,
  masterplan: /总体|总图|总平面|总体布局/,
  plan: /平面|首层|典型层|地下|楼层/,
  section: /剖面|垂直|层高|竖向/,
  facade: /立面|幕墙|表皮|材料|建筑界面/,
  structure: /结构|跨度|构造/,
  technical: /技术|实施|构造|材料|性能/,
  rendering: /效果图|效果|场景|鸟瞰|透视|主视觉/,
  system_rendering:
    /system rendering|系统渲染|系统剖切|局部立面系统|facade system sectional rendering/i,
  comparison: /比选|比较|取舍|方案选项/,
  data: /数据|指标|面积|容积率|限高/,
  summary: /总结|收束|价值回收/,
  strategy_overview: /策略链|策略总览|策略框架|证据计划/,
};

const evidencePatterns: Record<string, RegExp> = {
  text: /文字|标题|目录|章节/,
  map: /地图|区位|场地底图|site_map/,
  analysis_diagram: /分析图|关系图|流线图|策略图|图解|analysis_diagram/,
  concept_diagram: /概念图|生成序列|体量动作|concept_diagram/,
  masterplan: /总平面|总图|masterplan/,
  floor_plan: /平面图|floor_plan/,
  section: /剖面图|section/,
  elevation: /立面图|elevation/,
  rendering: /效果图|场景图|鸟瞰|透视|rendering/,
  data_table: /指标卡|数据表|面积表|矩阵|data_table/,
  photo: /照片|实景|photo/,
};

const roleIntents: Record<string, string[]> = {
  section_divider: ["transition", "introduce"],
  fact_evidence: ["orient", "analyze"],
  problem_definition: ["define_problem", "analyze"],
  strategy_statement: ["state_strategy"],
  design_action: ["explain_generation", "verify_design"],
  technical_proof: ["prove_technical", "verify_design"],
  visual_showcase: ["showcase"],
};

function tagsFromText(text: string, patterns: Record<string, RegExp>) {
  return Object.entries(patterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([tag]) => tag);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function queryText(page: ExperienceQuery) {
  return [
    page.headline_zh,
    page.core_message,
    ...(page.visual_requirements ?? []),
    ...(page.visual_brief ?? []),
  ].join(" ");
}

function recipeText(recipe: ExperienceRecipe) {
  return [
    recipe.page_type_label,
    recipe.canonical_page_type,
    recipe.page_role,
    recipe.scheme_branch,
    recipe.parallel_step_key,
    recipe.primary_visual,
    ...recipe.supporting_visuals,
    ...recipe.asset_slots.flatMap((slot) => [
      slot.slot,
      slot.visual_type,
      slot.label,
    ]),
    recipe.layout_hint,
  ].join(" ");
}

function topicsForPage(page: ExperienceQuery) {
  const topics = tagsFromText(queryText(page), topicPatterns);
  const defaults: Partial<Record<PageType, string[]>> = {
    position: ["location", "site_context"],
    masterplan: ["masterplan", "site_context"],
    plan: ["plan", "program"],
    section: ["section", "technical"],
    rendering: ["rendering"],
    technical: ["technical"],
    data: ["data", "constraints"],
    concept: ["concept", "massing"],
    comparison: ["comparison"],
    summary: ["summary"],
  };
  return unique([...topics, ...(defaults[page.page_type] ?? [])]);
}

function topicsForRecipe(recipe: ExperienceRecipe) {
  const declared = recipe.topics ?? [];
  const inferred = tagsFromText(recipeText(recipe), topicPatterns);
  const canonicalDefaults: Partial<Record<PageType, string[]>> = {
    cover: ["identity"],
    position: ["location", "site_context"],
    comparison: ["comparison"],
    masterplan: ["masterplan"],
    plan: ["plan", "program"],
    section: ["section"],
    rendering: ["rendering"],
    technical: ["technical"],
    data: ["data", "constraints"],
    concept: ["concept"],
    summary: ["summary"],
  };
  const visualDefaults: Record<string, string[]> = {
    site_map: ["location", "site_context"],
    masterplan: ["masterplan", "site_context"],
    floor_plan: ["plan", "program"],
    section: ["section", "technical"],
    elevation: ["facade", "technical"],
    concept_diagram: ["concept", "massing"],
    rendering: ["rendering"],
    data_table: ["data", "constraints"],
  };
  return unique([
    ...declared,
    ...inferred,
    ...(canonicalDefaults[recipe.canonical_page_type] ?? []),
    ...(visualDefaults[recipe.primary_visual] ?? []),
  ]);
}

function evidenceForPage(page: ExperienceQuery) {
  const inferred = tagsFromText(queryText(page), evidencePatterns);
  const defaults: Partial<Record<PageType, string[]>> = {
    cover: ["rendering"],
    toc: ["text"],
    section_divider: ["text"],
    position: ["map"],
    analysis: ["analysis_diagram"],
    strategy: ["analysis_diagram"],
    concept: ["concept_diagram"],
    comparison: ["analysis_diagram"],
    masterplan: ["masterplan"],
    plan: ["floor_plan"],
    section: ["section"],
    rendering: ["rendering"],
    technical: ["elevation", "section"],
    data: ["data_table"],
    summary: ["rendering"],
  };
  return unique([...inferred, ...(defaults[page.page_type] ?? [])]);
}

function evidenceForRecipe(recipe: ExperienceRecipe) {
  return unique([
    ...(recipe.evidence_types ?? []),
    ...tagsFromText(recipeText(recipe), evidencePatterns),
    recipe.primary_visual,
    ...recipe.supporting_visuals,
    ...recipe.asset_slots.map((slot) => slot.visual_type),
  ]);
}

function expectedRoles(page: ExperienceQuery) {
  if (
    page.page_type === "comparison" ||
    /问题|矛盾|议题|取舍|比选/.test(page.core_message)
  ) {
    return ["problem_definition", "fact_evidence", "visual_showcase"];
  }
  const roles: Partial<Record<PageType, string[]>> = {
    cover: ["section_divider"],
    toc: ["section_divider"],
    section_divider: ["section_divider"],
    position: ["fact_evidence"],
    analysis: ["fact_evidence", "problem_definition"],
    strategy: ["strategy_statement"],
    concept: ["strategy_statement", "design_action"],
    masterplan: ["design_action", "technical_proof"],
    plan: ["technical_proof", "design_action"],
    section: ["technical_proof", "design_action"],
    rendering: ["visual_showcase"],
    technical: ["technical_proof"],
    data: ["fact_evidence", "technical_proof"],
    summary: ["section_divider", "strategy_statement"],
  };
  return roles[page.page_type] ?? [];
}

function layoutFamily(recipe: ExperienceRecipe) {
  return (
    recipe.layout_family ??
    [
      recipe.canonical_page_type,
      recipe.primary_visual,
      recipe.text_weight,
      recipe.layout_hint,
    ].join("|")
  );
}

function overlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function scoreRecipe(page: ExperienceQuery, recipe: ExperienceRecipe) {
  const projectUnderstanding =
    page.section_id === "S01" ||
    /项目理解|project understanding/i.test(
      `${page.headline_zh ?? ""} ${page.core_message}`,
    );
  if (
    projectUnderstanding &&
    evidenceForRecipe(recipe).some((evidence) =>
      ["masterplan", "floor_plan", "section", "elevation"].includes(
        evidence,
      ),
    )
  ) {
    return null;
  }
  const compatible = compatiblePageTypes[page.page_type];
  const typeIndex = compatible.indexOf(recipe.canonical_page_type);
  if (typeIndex === -1) return null;

  const reasons: string[] = [];
  const roleIndex = expectedRoles(page).indexOf(recipe.page_role);
  const pageTopics = topicsForPage(page);
  const recipeTopics = topicsForRecipe(recipe);
  const matchedTopics = overlap(pageTopics, recipeTopics);
  const priorityTopics = ["cover", "toc", "section_divider"].includes(
    page.page_type,
  )
    ? []
    : tagsFromText(page.headline_zh ?? "", topicPatterns);
  const matchedPriorityTopics = overlap(priorityTopics, recipeTopics);
  const matchedSupportingTopics = matchedTopics.filter(
    (topic) => !matchedPriorityTopics.includes(topic),
  );
  const pageEvidence = evidenceForPage(page);
  const recipeEvidence = evidenceForRecipe(recipe);
  const matchedEvidence = overlap(pageEvidence, recipeEvidence);
  const declaredIntents = recipe.page_intents ?? roleIntents[recipe.page_role] ?? [];

  let score = 96 - typeIndex * 28;
  reasons.push(
    typeIndex === 0
      ? `页型一致：${recipe.canonical_page_type}`
      : `兼容页型：${recipe.canonical_page_type}`,
  );

  if (roleIndex >= 0) {
    score += 36 - roleIndex * 8;
    reasons.push(`页面角色一致：${recipe.page_role}`);
  }
  if (matchedPriorityTopics.length) {
    score += Math.min(72, matchedPriorityTopics.length * 36);
    reasons.push(`标题主题匹配：${matchedPriorityTopics.join("、")}`);
  }
  if (matchedSupportingTopics.length) {
    score += Math.min(60, matchedSupportingTopics.length * 20);
    reasons.push(`内容主题匹配：${matchedSupportingTopics.join("、")}`);
  }
  if (priorityTopics.length > 0 && matchedPriorityTopics.length === 0) {
    score -= 24;
  }
  if (matchedEvidence.length) {
    score += Math.min(48, matchedEvidence.length * 18);
    reasons.push(`证据/素材匹配：${matchedEvidence.join("、")}`);
  }
  if (
    declaredIntents.some((intent) =>
      (roleIntents[expectedRoles(page)[0]] ?? []).includes(intent),
    )
  ) {
    score += 10;
  }
  score +=
    recipe.reuse_level === "representative"
      ? 16
      : recipe.reuse_level === "supporting"
        ? 6
        : 0;
  if (recipe.source_pages.length > 1) score += 3;

  return {
    recipe,
    score,
    reasons,
    layoutFamily: layoutFamily(recipe),
    typeRank: typeIndex,
    priorityTopicMatches: matchedPriorityTopics.length,
  } satisfies ExperienceMatch;
}

export function matchExperienceRecipeScores(
  page: ExperienceQuery,
  experience?: ReferenceExperience,
  limit = 2,
) {
  if (!experience) return [];
  const preferred = new Set(page.experience_recipe_refs ?? []);
  return experience.page_recipes
    .map((recipe) => scoreRecipe(page, recipe))
    .filter((item): item is ExperienceMatch => item !== null)
    .map((item) => ({
      ...item,
      score: item.score + (preferred.has(item.recipe.recipe_id) ? 12 : 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.recipe.recipe_id.localeCompare(b.recipe.recipe_id),
    )
    .slice(0, limit);
}

export function matchExperienceRecipes(
  page: ExperienceQuery,
  experience?: ReferenceExperience,
  limit = 2,
) {
  return matchExperienceRecipeScores(page, experience, limit).map(
    (item) => item.recipe,
  );
}

export function assignExperienceRecipesForPlan(
  pages: ExperienceQuery[],
  experience?: ReferenceExperience,
  limit = 2,
) {
  if (!experience) {
    return pages.map(() => ({ recipes: [], reasons: [] }));
  }
  const primaryUsage = new Map<string, number>();
  const referenceUsage = new Map<string, number>();
  const recentFamilies: string[] = [];

  return pages.map((page) => {
    const rawCandidates = matchExperienceRecipeScores(
      page,
      experience,
      experience.page_recipes.length,
    );
    const exactSemanticCandidates = rawCandidates.filter(
      (candidate) =>
        candidate.typeRank === 0 && candidate.priorityTopicMatches > 0,
    );
    const semanticCandidates = rawCandidates.filter(
      (candidate) => candidate.priorityTopicMatches > 0,
    );
    const candidates = (
      exactSemanticCandidates.length
        ? exactSemanticCandidates
        : semanticCandidates.length
          ? semanticCandidates
          : rawCandidates
    )
      .map((candidate) => {
        const primaryCount = primaryUsage.get(candidate.recipe.recipe_id) ?? 0;
        const referenceCount =
          referenceUsage.get(candidate.recipe.recipe_id) ?? 0;
        const familyDistance = recentFamilies.lastIndexOf(
          candidate.layoutFamily,
        );
        const recentPenalty =
          familyDistance === recentFamilies.length - 1
            ? 80
            : familyDistance >= Math.max(0, recentFamilies.length - 3)
              ? 18
              : 0;
        const reusePenalty =
          primaryCount === 0
            ? 0
            : primaryCount === 1
              ? 8
              : 40 + (primaryCount - 2) * 15;
        return {
          ...candidate,
          adjustedScore:
            candidate.score - recentPenalty - reusePenalty - referenceCount * 4,
          diversityReason:
            recentPenalty || reusePenalty
              ? `全篇去重：复用惩罚 ${reusePenalty}，相邻布局惩罚 ${recentPenalty}`
              : "全篇去重：未触发复用惩罚",
        };
      })
      .sort(
        (a, b) =>
          b.adjustedScore - a.adjustedScore ||
          a.recipe.recipe_id.localeCompare(b.recipe.recipe_id),
      );

    const primary = candidates[0];
    if (!primary) return { recipes: [], reasons: [] };

    const secondary = candidates
      .slice(1)
      .filter(
        (candidate) =>
          candidate.recipe.recipe_id !== primary.recipe.recipe_id &&
          candidate.layoutFamily !== primary.layoutFamily,
      )
      .sort(
        (a, b) =>
          b.adjustedScore - a.adjustedScore ||
          a.recipe.recipe_id.localeCompare(b.recipe.recipe_id),
      )[0];

    primaryUsage.set(
      primary.recipe.recipe_id,
      (primaryUsage.get(primary.recipe.recipe_id) ?? 0) + 1,
    );
    for (const selected of [primary, secondary].filter(
      (item): item is typeof primary => item !== undefined,
    )) {
      referenceUsage.set(
        selected.recipe.recipe_id,
        (referenceUsage.get(selected.recipe.recipe_id) ?? 0) + 1,
      );
    }
    recentFamilies.push(primary.layoutFamily);
    if (recentFamilies.length > 3) recentFamilies.shift();

    return {
      recipes: [primary.recipe, ...(secondary ? [secondary.recipe] : [])].slice(
        0,
        limit,
      ),
      reasons: [...primary.reasons, primary.diversityReason],
    };
  });
}

export function experienceRecipeRefsForPage(
  page: ExperienceQuery,
  projectFacts: DesignReportProjectFacts,
) {
  return matchExperienceRecipes(page, projectFacts.reference_experience).map(
    (recipe) => recipe.recipe_id,
  );
}

export function experienceGuidanceForPage(
  page: ReportPage,
  projectFacts: DesignReportProjectFacts,
) {
  const experience = projectFacts.reference_experience;
  if (!experience) return [];
  const byId = new Map(
    experience.page_recipes.map((recipe) => [recipe.recipe_id, recipe]),
  );
  const explicit = (page.experience_recipe_refs ?? [])
    .map((recipeId) => byId.get(recipeId))
    .filter((recipe): recipe is ExperienceRecipe => recipe !== undefined);
  return explicit.length
    ? explicit.slice(0, 3)
    : matchExperienceRecipes(page, experience);
}

export function experienceLayoutRequirementsForRecipes(
  recipes: ExperienceRecipe[],
  reasons: string[] = [],
) {
  const primary = recipes[0];
  if (!primary) return [];
  const slots = primary.asset_slots
    .map((slot) => `${slot.label}×${slot.count}`)
    .join("、");
  const pages = primary.source_pages.join("、");
  const branchLabels: Record<string, string> = {
    shared: "公共章节",
    one_tower: "单塔分支",
    two_tower: "双塔分支",
    comparison: "方案比较",
  };
  const sourceLabel = primary.source_document_id
    .replace(/^SYS_REFERENCE_/, "")
    .replaceAll("_", " ");
  const branchLabel = branchLabels[primary.scheme_branch] ?? "公共章节";
  const parallelStep = primary.parallel_step_key
    ? `；平行步骤 ${primary.parallel_step_key}`
    : "";
  return [
    `结构化经验 ${primary.recipe_id}（样本 ${sourceLabel}，${branchLabel}${parallelStep}，原汇报第 ${pages} 页）：${primary.layout_hint}`,
    `结构化经验素材槽：主视觉 ${primary.primary_visual}；${slots}；文字密度 ${primary.text_weight}`,
    ...(reasons.length
      ? [`结构化经验匹配依据：${reasons.join("；")}`]
      : []),
  ];
}

export function experienceLayoutRequirements(
  page: ExperienceQuery,
  projectFacts: DesignReportProjectFacts,
) {
  const recipes = experienceGuidanceForPage(
    page as ReportPage,
    projectFacts,
  );
  return experienceLayoutRequirementsForRecipes(recipes);
}

export function plannerExperiencePayload(
  experience?: ReferenceExperience,
) {
  if (!experience) return null;
  const roleDistribution = Object.entries(
    Object.groupBy(experience.narrative_pages, (page) => page.page_role),
  )
    .map(([role, pages]) => ({ role, count: pages?.length ?? 0 }))
    .sort((a, b) => b.count - a.count);
  return {
    source_page_count: experience.source_page_count,
    source_documents: experience.source_documents,
    role_distribution: roleDistribution,
    transition_patterns: experience.transition_patterns,
    page_recipes: experience.page_recipes,
    policy:
      "这些字段只描述历史汇报的叙事和版式。不得从中推断当前项目的功能、数字、名称或设计结论。",
  };
}
