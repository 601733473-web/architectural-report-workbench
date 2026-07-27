import { Workbench } from "@/app/components/Workbench";
import { defaultReferenceDocument } from "@/app/lib/default-reference";
import { getModelRuntime } from "@/app/lib/model-client";
import { runPipeline } from "@/app/lib/pipeline";

export default function Home() {
  const documents = [defaultReferenceDocument];
  const runtime = getModelRuntime();
  const initialResult = {
    ...runPipeline(documents, "SINGLE_PROJECT"),
    executionMode: runtime.configured
      ? ("openai_model" as const)
      : ("local_fallback" as const),
    modelName: runtime.model,
  };

  return (
    <Workbench
      initialDocuments={documents}
      initialResult={initialResult}
    />
  );
}
