import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import type { ReferenceStyleExample } from "@/app/lib/reference-style-examples";

type PageType = DesignReportPagePlan["pages"][number]["page_type"];

const compatiblePageTypes: Record<PageType, PageType[]> = {
  cover: ["cover", "section_divider", "concept", "rendering"],
  toc: ["toc", "section_divider", "analysis"],
  section_divider: ["section_divider", "cover", "concept"],
  position: ["position", "analysis"],
  analysis: ["analysis", "position", "data"],
  strategy: ["strategy", "analysis", "comparison"],
  concept: ["concept", "strategy"],
  comparison: ["comparison", "strategy"],
  masterplan: ["masterplan", "plan", "analysis", "data"],
  plan: ["plan", "masterplan", "section"],
  section: ["section", "plan", "technical"],
  rendering: ["rendering", "concept"],
  technical: ["technical", "section", "data"],
  data: ["data", "analysis"],
  summary: ["summary", "section_divider", "rendering", "concept"],
};

export function matchReferenceStyleExamples(
  pageType: PageType,
  examples: ReferenceStyleExample[],
  limit = 2,
) {
  const preference = compatiblePageTypes[pageType];
  return [...examples]
    .sort((a, b) => {
      const rankA = preference.indexOf(a.page_type);
      const rankB = preference.indexOf(b.page_type);
      return (
        (rankA === -1 ? Number.MAX_SAFE_INTEGER : rankA) -
          (rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB) ||
        a.example_id.localeCompare(b.example_id)
      );
    })
    .filter((example) => preference.includes(example.page_type))
    .slice(0, limit);
}

export function styleExampleRefsForPage(
  pageType: PageType,
  projectFacts: DesignReportProjectFacts,
) {
  return matchReferenceStyleExamples(
    pageType,
    projectFacts.reference_style_examples ?? [],
  ).map((example) => example.example_id);
}

export function styleGuidanceForPage(
  page: DesignReportPagePlan["pages"][number],
  projectFacts: DesignReportProjectFacts,
) {
  const examples = projectFacts.reference_style_examples ?? [];
  const byId = new Map(examples.map((example) => [example.example_id, example]));
  const explicitlyMatched = (page.style_example_refs ?? [])
    .map((exampleId) => byId.get(exampleId))
    .filter(
      (example): example is ReferenceStyleExample => example !== undefined,
    );
  const matched = explicitlyMatched.length
    ? explicitlyMatched.slice(0, 3)
    : matchReferenceStyleExamples(page.page_type, examples);

  return matched.map((example) => ({
    example_id: example.example_id,
    matched_page_type: example.page_type,
    source: {
      document_id: example.source.document_id,
      page: example.source.page,
    },
    sanitized_template: example.sanitized_template,
    rhetorical_pattern: example.rhetorical_pattern,
    headline_pattern: example.headline_pattern,
    layout_recipe: example.layout_recipe,
    style_tags: example.style_tags,
    forbidden_terms: example.forbidden_terms,
  }));
}

export function styleLayoutRequirements(
  pageType: PageType,
  projectFacts: DesignReportProjectFacts,
) {
  return matchReferenceStyleExamples(
    pageType,
    projectFacts.reference_style_examples ?? [],
    1,
  ).flatMap((example) =>
    example.layout_recipe.map(
      (rule) =>
        `历史样本 ${example.example_id}（第 ${example.source.page} 页）版式规则：${rule}`,
    ),
  );
}
