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
if (audited.pages.length < 8 || audited.pages.length > 12) {
  throw new Error("Brief-only plan must contain 8-12 pages.");
}
if (
  audited.pages.find((page) => page.page_id === "P003")
    ?.generation_status !== "reviewed"
) {
  throw new Error("Brief-only evidence page did not complete generation and audit.");
}

console.log(
  `Brief-only PASS: ${base.projectFacts.facts.length} facts, ${base.projectFacts.style_observations?.length ?? 0} isolated style observations, ${audited.pages.length} pages, 0 model calls.`,
);
