import type { DesignReportProjectFacts } from "@/app/generated/contracts";

export const USER_PROPOSAL_TOPICS = [
  {
    value: "设计目标",
    label: "设计目标",
    targetPageTypes: ["toc", "analysis", "strategy", "concept", "summary"],
  },
  {
    value: "评审条件",
    label: "评审条件",
    targetPageTypes: ["toc", "analysis", "strategy", "data", "summary"],
  },
  {
    value: "设计概念",
    label: "设计概念",
    targetPageTypes: ["concept", "strategy", "section_divider"],
  },
  {
    value: "总体布局",
    label: "总体布局",
    targetPageTypes: ["masterplan", "strategy", "comparison"],
  },
  {
    value: "交通组织",
    label: "交通组织",
    targetPageTypes: ["analysis", "strategy", "masterplan", "plan"],
  },
  {
    value: "重点空间",
    label: "重点空间",
    targetPageTypes: ["plan", "section", "rendering"],
  },
  {
    value: "立面方案",
    label: "立面方案",
    targetPageTypes: ["technical", "rendering"],
  },
] as const;

export type UserProposalTopic =
  (typeof USER_PROPOSAL_TOPICS)[number]["value"];

export function preserveUserDefinedProposals(
  previousFacts: DesignReportProjectFacts,
  nextFacts: DesignReportProjectFacts,
) {
  const preservedProposals = (previousFacts.gate_b_proposals ?? []).filter(
    (proposal) =>
      proposal.origin === "user_created" || proposal.status === "confirmed",
  );
  if (!preservedProposals.length) return nextFacts;
  const result = structuredClone(nextFacts);
  const preservedIds = new Set(
    preservedProposals.map((proposal) => proposal.missing_item_id),
  );
  result.gate_b_proposals = [
    ...(result.gate_b_proposals ?? []).filter(
      (proposal) =>
        proposal.origin !== "user_created" &&
        !preservedIds.has(proposal.missing_item_id),
    ),
    ...structuredClone(preservedProposals),
  ];
  return result;
}
