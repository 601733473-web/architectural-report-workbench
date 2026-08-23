import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import briefDocuments from "../fixtures/brief-only/task-brief.json";
import { defaultReferenceDocument } from "../app/lib/default-reference";
import {
  auditGeneratedPages,
  generateSinglePage,
  runPipeline,
  type InputDocument,
  type NodeOutput,
} from "../app/lib/pipeline";
import {
  assertPagePlan,
  assertProjectFacts,
} from "../app/lib/schema-validator";
import { DEFAULT_TARGET_PAGE_COUNT } from "../app/lib/report-config";

const documents = [
  defaultReferenceDocument,
  ...(briefDocuments as InputDocument[]),
];
const base = runPipeline(documents, "VIRTUAL_BRIEF_ONLY");
const generated = generateSinglePage(
  base.projectFacts,
  base.pagePlan,
  "P003",
);
const audited = auditGeneratedPages(base.projectFacts, generated);

assertProjectFacts(base.projectFacts);
assertPagePlan(audited);

const addedOutputs: NodeOutput[] = [
  {
    node: "page_generation",
    execution: "local_rule",
    model_calls: 0,
    output: generated.pages.find((page) => page.page_id === "P003"),
  },
  {
    node: "consistency_audit",
    execution: "local_rule",
    model_calls: 0,
    output: audited.audit_report,
  },
];
const output = {
  projectFacts: base.projectFacts,
  pagePlan: audited,
  nodeOutputs: [...base.nodeOutputs, ...addedOutputs],
  modelCallCount: 0,
};

await mkdir(resolve("fixtures", "brief-only"), { recursive: true });
await writeFile(
  resolve("fixtures", "brief-only", "full-run.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);

const referenceId = defaultReferenceDocument.document_id;
if (base.projectFacts.facts.some((fact) => fact.source.document_id === referenceId)) {
  throw new Error("Historical reference leaked into current project facts.");
}
if ((base.projectFacts.style_observations?.length ?? 0) < 8) {
  throw new Error("Default historical reference profile was not preserved.");
}
if ((base.projectFacts.reference_style_examples?.length ?? 0) < 9) {
  throw new Error("Curated historical reference examples were not preserved.");
}
if (
  (base.projectFacts.reference_experience?.narrative_pages.length ?? 0) !==
    494 ||
  (base.projectFacts.reference_experience?.transition_patterns.length ?? 0) !==
    159 ||
  (base.projectFacts.reference_experience?.page_recipes.length ?? 0) !== 244 ||
  (base.projectFacts.reference_experience?.source_documents.length ?? 0) !== 5
) {
  throw new Error("Structured reference experience was not preserved.");
}
const strategyPage = base.pagePlan.pages.find(
  (page) => page.page_type === "strategy",
);
if (
  !strategyPage?.style_example_refs?.includes("RSE_DK05_STRATEGY_011")
) {
  throw new Error("Strategy page did not retrieve the matching style sample.");
}
if (
  strategyPage.visual_requirements.some((requirement) =>
    requirement.startsWith("历史样本 "),
  )
) {
  throw new Error(
    "Text style sample overrode the semantically matched visual recipe.",
  );
}
if (
  !(strategyPage.experience_recipe_refs?.length) ||
  !strategyPage.visual_requirements.some((requirement) =>
    /^结构化经验 [A-Z0-9]+_RX_/.test(requirement),
  )
) {
  throw new Error("Structured page recipe did not guide the strategy page.");
}
const recipeById = new Map(
  (base.projectFacts.reference_experience?.page_recipes ?? []).map((recipe) => [
    recipe.recipe_id,
    recipe,
  ]),
);
const headquartersSource =
  base.projectFacts.reference_experience?.source_documents.find(
    (source) =>
      source.source_document_id === "SYS_REFERENCE_HQ_MULTI_OPTION",
  );
if (
  headquartersSource?.source_page_count !== 127 ||
  headquartersSource.narrative_page_count !== 126 ||
  headquartersSource.recipe_count !== 81
) {
  throw new Error("Third enhanced reference source was not imported correctly.");
}
const headquartersNarrative =
  base.projectFacts.reference_experience?.narrative_pages.filter(
    (page) =>
      page.source_document_id === "SYS_REFERENCE_HQ_MULTI_OPTION",
  ) ?? [];
if (headquartersNarrative.some((page) => page.page_number === 127)) {
  throw new Error("Excluded closing page P127 entered narrative retrieval.");
}
if (
  headquartersNarrative.filter(
    (page) => page.parallel_step_key === "masterplan",
  ).length !== 2
) {
  throw new Error("Parallel single-/two-tower masterplan steps were not linked.");
}
const headquartersRecipes =
  base.projectFacts.reference_experience?.page_recipes.filter(
    (recipe) =>
      recipe.source_document_id === "SYS_REFERENCE_HQ_MULTI_OPTION",
  ) ?? [];
for (const correctedPage of [14, 15]) {
  const correctedRecipe = headquartersRecipes.find((recipe) =>
    recipe.source_pages.includes(correctedPage),
  );
  if (
    correctedRecipe?.primary_visual !== "photo" ||
    !correctedRecipe.evidence_types?.includes("photo")
  ) {
    throw new Error(`P${correctedPage} photo recipe correction was lost.`);
  }
}
const primaryRecipeIds = base.pagePlan.pages.map(
  (page) => page.experience_recipe_refs?.[0],
);
if (base.pagePlan.pages.some((page) => page.page_type === "comparison")) {
  throw new Error("The default brief plan still contains the removed comparison page.");
}
if (new Set(primaryRecipeIds.filter(Boolean)).size < 25) {
  throw new Error("Whole-deck retrieval did not produce enough recipe diversity.");
}
if (
  !base.pagePlan.pages.every((page) =>
    page.visual_requirements.some((requirement) =>
      requirement.startsWith("结构化经验匹配依据："),
    ),
  )
) {
  throw new Error("Recipe retrieval reasons were not preserved for every page.");
}
let previousLayoutFamily = "";
let layoutFamilyStreak = 0;
for (const primaryRecipeId of primaryRecipeIds) {
  const currentLayoutFamily =
    recipeById.get(primaryRecipeId ?? "")?.layout_family ?? "";
  layoutFamilyStreak =
    currentLayoutFamily && currentLayoutFamily === previousLayoutFamily
      ? layoutFamilyStreak + 1
      : 1;
  if (layoutFamilyStreak > 2) {
    throw new Error(
      `Three consecutive pages reused layout family ${currentLayoutFamily}.`,
    );
  }
  previousLayoutFamily = currentLayoutFamily;
}
const circulationStrategy = base.pagePlan.pages.find((page) =>
  page.headline_zh.includes("分流原则"),
);
const circulationRecipe = recipeById.get(
  circulationStrategy?.experience_recipe_refs?.[0] ?? "",
);
if (!circulationRecipe?.topics?.includes("circulation")) {
  throw new Error("Circulation strategy did not retrieve a circulation recipe.");
}
const publicSpaceStrategy = base.pagePlan.pages.find((page) =>
  page.headline_zh.includes("公共性"),
);
const publicSpaceRecipe = recipeById.get(
  publicSpaceStrategy?.experience_recipe_refs?.[0] ?? "",
);
if (!publicSpaceRecipe?.topics?.includes("public_space")) {
  throw new Error("Public-space strategy did not retrieve a public-space recipe.");
}
const contaminatedPlan = structuredClone(base.pagePlan);
const contaminatedStrategyPage = contaminatedPlan.pages.find(
  (page) => page.page_id === strategyPage.page_id,
);
if (!contaminatedStrategyPage) {
  throw new Error("Strategy page disappeared from the contamination fixture.");
}
contaminatedStrategyPage.body_copy = "联动SKP，形成当前项目的门户形象。";
contaminatedStrategyPage.generation_status = "generated";
const contaminatedAudit = auditGeneratedPages(
  base.projectFacts,
  contaminatedPlan,
);
if (
  !contaminatedAudit.audit_report?.issues.some(
    (issue) =>
      issue.severity === "blocking" &&
      issue.issue.includes("历史参考项目"),
  )
) {
  throw new Error("Historical project leakage was not blocked by the audit.");
}
if (audited.pages.length !== DEFAULT_TARGET_PAGE_COUNT) {
  throw new Error(
    `Brief-only plan must contain ${DEFAULT_TARGET_PAGE_COUNT} pages.`,
  );
}
if (
  audited.pages.find((page) => page.page_id === "P003")
    ?.generation_status !== "reviewed"
) {
  throw new Error("Brief-only evidence page did not complete generation and audit.");
}

console.log(
  `Brief-only PASS: ${base.projectFacts.facts.length} facts, ${base.projectFacts.style_observations?.length ?? 0} style observations, ${base.projectFacts.reference_style_examples?.length ?? 0} curated examples, ${audited.pages.length} pages, 0 model calls.`,
);
