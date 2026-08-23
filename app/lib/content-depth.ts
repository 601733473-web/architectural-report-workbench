import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import { confirmedGateBProposalsForPage } from "@/app/lib/gate-b-proposals";
import { getVisualImageSlotCountForPage } from "@/app/lib/visual-task";

type ReportPage = DesignReportPagePlan["pages"][number];
type ContentDepthCheck = NonNullable<ReportPage["content_depth_check"]>;

const STRUCTURAL_PAGE_TYPES = new Set<ReportPage["page_type"]>([
  "cover",
  "toc",
  "section_divider",
]);

const PROPOSAL_REQUIRED_PAGE_TYPES = new Set<ReportPage["page_type"]>([
  "strategy",
  "concept",
  "comparison",
  "masterplan",
  "plan",
  "section",
  "rendering",
  "technical",
  "summary",
]);

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function extractNumbers(text: string) {
  return unique(
    [...text.matchAll(/(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?(?![A-Za-z0-9])/g)].map((match) =>
      match[0].replace(/,/g, ""),
    ),
  );
}

export function visibleBodyPoints(body: string) {
  return body
    .replace(/^[\s•·\-—–]+/gm, "")
    .split(/[。！？；\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

export function evaluatePageContentDepth(
  projectFacts: DesignReportProjectFacts,
  page: ReportPage,
): ContentDepthCheck {
  const evaluatedAt = new Date().toISOString();
  if (STRUCTURAL_PAGE_TYPES.has(page.page_type)) {
    return {
      status: "pass",
      applicable: false,
      evaluated_at: evaluatedAt,
      conclusion_present: Boolean(page.core_message.trim()),
      body_point_count: 0,
      evidence_count: 0,
      image_caption_count: 0,
      required_image_caption_count: 0,
      confirmed_proposal_count: 0,
      unsupported_numbers: [],
      issues: [],
    };
  }

  const validFacts = page.fact_refs
    .map((factId) =>
      projectFacts.facts.find((fact) => fact.fact_id === factId),
    )
    .filter((fact) => Boolean(fact));
  const validFactIds = new Set(validFacts.map((fact) => fact!.fact_id));
  const confirmedProposals = confirmedGateBProposalsForPage(
    projectFacts,
    page,
  );
  const confirmedProposalIds = new Set(
    confirmedProposals.map((proposal) => proposal.missing_item_id),
  );
  const coveredProposalIds = unique([
    ...(page.proposal_refs ?? []).filter((proposalId) =>
      confirmedProposalIds.has(proposalId),
    ),
    ...(page.proposal_coverage ?? [])
      .filter((coverage) => confirmedProposalIds.has(coverage.proposal_id))
      .map((coverage) => coverage.proposal_id),
  ]);
  // Fact callouts are alternate presentations of the same source and confirmed
  // proposals are reported separately below. Counting either again made a page
  // with four sourced facts appear to contain nine independent pieces of
  // evidence, which incorrectly triggered the over-density warning.
  const evidenceCount = validFactIds.size;
  const bodyPointCount = visibleBodyPoints(page.body_zh || page.body_copy).length;
  const conclusionPresent = page.core_message.trim().length >= 6;
  const imageCaptionCount = page.diagram_labels.filter(
    (label) => label.trim().length >= 2,
  ).length;
  const requiredImageCaptionCount =
    page.visual_task?.image_slots.length ??
    getVisualImageSlotCountForPage(page);
  const visibleText = [
    page.headline_zh,
    page.core_message,
    page.body_zh || page.body_copy,
    ...page.diagram_labels,
    ...(page.callouts ?? []).map((callout) => callout.label_zh),
  ].join("\n");
  const supportedNumbers = new Set(
    validFacts.flatMap((fact) =>
      extractNumbers(
        `${String(fact!.value_raw)} ${fact!.source.quote}`,
      ),
    ),
  );
  const unsupportedNumbers = extractNumbers(visibleText).filter(
    (number) => !supportedNumbers.has(number),
  );
  const issues: string[] = [];

  if (!conclusionPresent) issues.push("缺少一个明确、可直接上版的核心结论");
  if (bodyPointCount < 2) issues.push("正文说明少于 2 条");
  if (bodyPointCount > 4) issues.push("正文说明超过 4 条，需要压缩层级");
  if (evidenceCount < 2 && coveredProposalIds.length === 0) {
    issues.push("有效事实或已确认提案证据少于 2 条");
  }
  if (evidenceCount > 4) issues.push("本页证据超过 4 条，建议拆页或收敛重点");
  if (imageCaptionCount < requiredImageCaptionCount) {
    issues.push(
      `图片图注不足：${imageCaptionCount}/${requiredImageCaptionCount} 个图框已有独立图注`,
    );
  }
  if (
    PROPOSAL_REQUIRED_PAGE_TYPES.has(page.page_type) &&
    confirmedProposals.length > 0 &&
    coveredProposalIds.length === 0
  ) {
    issues.push("本页尚未实质体现任何一项相关的已确认提案");
  }
  if (unsupportedNumbers.length > 0) {
    issues.push(`存在无来源数字：${unsupportedNumbers.join("、")}`);
  }

  return {
    status: issues.length ? "needs_improvement" : "pass",
    applicable: true,
    evaluated_at: evaluatedAt,
    conclusion_present: conclusionPresent,
    body_point_count: bodyPointCount,
    evidence_count: evidenceCount,
    image_caption_count: imageCaptionCount,
    required_image_caption_count: requiredImageCaptionCount,
    confirmed_proposal_count: coveredProposalIds.length,
    unsupported_numbers: unsupportedNumbers,
    issues,
  };
}
