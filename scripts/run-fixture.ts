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
if (audited.pages.length < 8 || audited.pages.length > 12) {
  throw new Error("Fixture page plan must contain 8-12 pages.");
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

console.log(
  `Fixture PASS: ${base.projectFacts.facts.length} facts, ${audited.pages.length} pages, ${audited.audit_report?.issues.length ?? 0} audit issues, 0 model calls.`,
);

