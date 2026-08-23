import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import fixtureDocuments from "../fixtures/virtual-project/source-documents.json";
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
import { synchronizeProposalCoverage } from "../app/lib/gate-b-proposals";
import { isSystemRenderingPage } from "../app/lib/visual-task";
import { matchVisualReferences } from "../app/lib/visual-reference";
import { migrateLegacyStructurePageToSystemRendering } from "../app/lib/local-project-store";
import type { DesignReportProjectFacts } from "../app/generated/contracts";

const documents = fixtureDocuments as InputDocument[];
const base = runPipeline(documents, "VIRTUAL_RIVERFRONT_CULTURE");
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

await writeFile(
  resolve("fixtures", "virtual-project", "full-run.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);

const reviewedPage = audited.pages.find((page) => page.page_id === "P003");
if (audited.pages.length !== DEFAULT_TARGET_PAGE_COUNT) {
  throw new Error(
    `Fixture page plan must contain ${DEFAULT_TARGET_PAGE_COUNT} pages.`,
  );
}
if (reviewedPage?.generation_status !== "reviewed") {
  throw new Error("Fixture page P003 did not complete generation and audit.");
}
if (base.projectFacts.documents.some((document) =>
  document.role === "company_info" &&
  base.projectFacts.facts.some(
    (fact) => fact.source.document_id === document.document_id,
  ),
)) {
  throw new Error("Company information leaked into project facts.");
}

type Proposal = NonNullable<
  DesignReportProjectFacts["gate_b_proposals"]
>[number];

function confirmedProposal(
  id: string,
  label: string,
  title: string,
  summary: string,
  designMoves: [string, ...string[]],
): Proposal {
  return {
    missing_item_id: id,
    missing_label: label,
    status: "confirmed",
    question: `确认${label}`,
    task_brief_fact_refs: [],
    options: [
      {
        option_id: `${id}_O1`,
        title,
        summary,
        design_moves: designMoves,
        rationale: "用于验证提案驱动页面同步。",
        task_brief_fact_refs: [],
        assumptions: ["仍需后续图纸验证。"],
        validation_needed: ["相关页面图纸验证"],
      },
    ],
    selected_option_id: `${id}_O1`,
    user_input: "",
    confirmed_direction: summary,
  };
}

const proposalFacts = structuredClone(base.projectFacts);
proposalFacts.gate_b_proposals = [
  confirmedProposal(
    "M_TEST_GOAL",
    "设计目标",
    "场地问题导向",
    "在高密度复合功能约束下兼顾垂直效率与独立运营。",
    ["垂直功能叠合", "独立运营"],
  ),
  confirmedProposal(
    "M_TEST_EVAL",
    "评审条件",
    "任务书显性条件",
    "以垂直城市效率与公共性平衡作为评审响应主线。",
    ["建立证据链"],
  ),
  confirmedProposal(
    "M_TEST_CONCEPT",
    "设计概念",
    "公共价值型",
    "提出“生态垂直聚落”概念，通过空中庭院和自然通风组织复合功能。",
    ["拆分垂直体块", "嵌入空中花园", "形成通风缝隙"],
  ),
  confirmedProposal(
    "M_TEST_MASTERPLAN",
    "总体布局",
    "集中整合",
    "以垂直叠合集中主要功能并释放连续地面公共空间。",
    ["集中主要体量", "释放公共空间"],
  ),
  confirmedProposal(
    "M_TEST_CIRCULATION",
    "交通组织",
    "共享慢行",
    "以地面慢行网络为核心，弱化并隐藏车行，保持后勤独立。",
    ["建立慢行主轴", "隐藏车行入口"],
  ),
  confirmedProposal(
    "M_TEST_SPACE",
    "重点空间",
    "连续街巷",
    "以连续可达的立体漫游路径串联商业与城市界面。",
    ["stepped_massing_strategy", "elevated_public_walkway", "ground_floor_permeability"],
  ),
  confirmedProposal(
    "M_TEST_FACADE",
    "立面方案",
    "气候响应",
    "通过遮阳、垂直绿化和可开启构件回应热湿气候。",
    ["分朝向遮阳", "组织自然通风"],
  ),
];
const synchronizedProposalTest = synchronizeProposalCoverage(
  proposalFacts,
  base.pagePlan,
);
const proposalDriven = synchronizedProposalTest.pagePlan;
const proposalPage = (pageNumber: number) =>
  proposalDriven.pages.find(
    (page) => page.display_page_number === pageNumber,
  );
if (proposalPage(19)?.headline_zh !== "核心概念：生态垂直聚落") {
  throw new Error("Confirmed concept did not update the core-concept page.");
}
if (!proposalPage(17)?.headline_zh.includes("共享慢行")) {
  throw new Error(
    `Confirmed circulation did not update the strategy page: ${proposalPage(17)?.headline_zh ?? "missing"}; ${JSON.stringify(synchronizedProposalTest.projectFacts.gate_b_proposals?.map((proposal) => [proposal.missing_label, proposal.selected_option_id, proposal.options[0]?.title]))}`,
  );
}
if (
  !["M_TEST_MASTERPLAN", "M_TEST_CIRCULATION", "M_TEST_SPACE", "M_TEST_FACADE"].every(
    (proposalId) => proposalPage(14)?.proposal_refs?.includes(proposalId),
  )
) {
  throw new Error("Strategy overview did not receive all four confirmed directions.");
}
if (/彻底分流|明确分流/.test(proposalPage(17)?.core_message ?? "")) {
  throw new Error("Shared pedestrian proposal still conflicts with strict separation copy.");
}
if (!proposalPage(23)?.headline_zh.includes("集中整合")) {
  throw new Error("Confirmed masterplan did not update the masterplan page.");
}
if (!proposalPage(32)?.visual_requirements.some((item) =>
  item.includes("不得生成完整塔楼"),
)) {
  throw new Error("System rendering lost its local-facade composition guard.");
}
const legacyTypedSystemRenderingPage = {
  ...proposalPage(32)!,
  page_type: "technical" as const,
};
if (!isSystemRenderingPage(legacyTypedSystemRenderingPage)) {
  throw new Error(
    "A legacy technical page with the curated system-rendering recipe was not recognized.",
  );
}
const legacySystemReferences = matchVisualReferences(
  legacyTypedSystemRenderingPage,
  synchronizedProposalTest.projectFacts,
  1,
);
if (legacySystemReferences[0]?.entry.visual_id !== "VR_HQ_MULTI_OPTION_P111") {
  throw new Error(
    `Legacy system rendering did not select the curated P111 sample: ${legacySystemReferences[0]?.entry.visual_id ?? "none"}`,
  );
}
const duplicateSystemPlan = structuredClone(proposalDriven);
const duplicateTarget = duplicateSystemPlan.pages.find(
  (page) => page.display_page_number === 31,
);
if (!duplicateTarget) throw new Error("Fixture page P31 is missing.");
Object.assign(duplicateTarget, {
  page_type: "rendering",
  headline_zh: "系统剖切渲染整合建筑关系",
  headline_en:
    "INTEGRATING FACADE AND ENVIRONMENTAL SYSTEMS THROUGH A SECTIONAL RENDERING",
  core_message:
    "通过局部切开连续三至五层典型楼层与立面系统，呈现室内空间、楼板、幕墙、水平遮阳与自然通风路径之间的协同关系。",
  body_zh: "",
  body_copy: "",
  experience_recipe_refs: ["HQE_RX_068"],
  generation_status: "ready",
});
const deduplicatedSystemPlan = migrateLegacyStructurePageToSystemRendering(
  duplicateSystemPlan,
  synchronizedProposalTest.projectFacts,
);
if (
  deduplicatedSystemPlan.pages.filter(isSystemRenderingPage).length !== 1 ||
  deduplicatedSystemPlan.pages.find(
    (page) => page.display_page_number === 30,
  )?.page_type !== "section_divider"
) {
  throw new Error(
    "Legacy migration did not collapse duplicate system-rendering pages.",
  );
}
if (!proposalPage(34)?.headline_zh.includes("生态垂直聚落")) {
  throw new Error("Confirmed concept did not reach the summary page.");
}
if (
  proposalDriven.pages.some((page) =>
    /。，|，。|；。/.test(page.core_message),
  )
) {
  throw new Error("Proposal-driven page copy contains broken punctuation joins.");
}

console.log(
  `Fixture PASS: ${base.projectFacts.facts.length} facts, ${audited.pages.length} pages, ${audited.audit_report?.issues.length ?? 0} audit issues, proposal-driven page sync, 0 model calls.`,
);

