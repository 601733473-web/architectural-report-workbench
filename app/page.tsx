import { Workbench } from "@/app/components/Workbench";
import { defaultReferenceDocument } from "@/app/lib/default-reference";
import { runPipeline } from "@/app/lib/pipeline";

export default function Home() {
  const documents = [defaultReferenceDocument];
  const initialResult = runPipeline(documents, "SINGLE_PROJECT");

  return (
    <Workbench
      initialDocuments={documents}
      initialResult={initialResult}
    />
  );
}
