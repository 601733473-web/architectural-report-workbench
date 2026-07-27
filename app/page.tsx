import fixtureDocuments from "@/fixtures/virtual-project/source-documents.json";
import { Workbench } from "@/app/components/Workbench";
import {
  auditGeneratedPages,
  generateSinglePage,
  runPipeline,
  type InputDocument,
} from "@/app/lib/pipeline";

export default function Home() {
  const documents = fixtureDocuments as InputDocument[];
  const base = runPipeline(documents, "VIRTUAL_RIVERFRONT_CULTURE");
  const generated = generateSinglePage(
    base.projectFacts,
    base.pagePlan,
    "P003",
  );
  const audited = auditGeneratedPages(base.projectFacts, generated);
  const initialResult = {
    ...base,
    pagePlan: audited,
    nodeOutputs: [
      ...base.nodeOutputs,
      {
        node: "page_generation" as const,
        execution: "local_rule" as const,
        model_calls: 0 as const,
        output: generated.pages.find((page) => page.page_id === "P003"),
      },
      {
        node: "consistency_audit" as const,
        execution: "local_rule" as const,
        model_calls: 0 as const,
        output: audited.audit_report,
      },
    ],
  };

  return (
    <Workbench
      initialDocuments={documents}
      initialResult={initialResult}
    />
  );
}
