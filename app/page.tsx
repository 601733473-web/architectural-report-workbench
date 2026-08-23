import { Workbench } from "@/app/components/Workbench";
import LoginPage from "@/app/login/page";
import { defaultReferenceDocument } from "@/app/lib/default-reference";
import { getModelRuntime } from "@/app/lib/model-client";
import { runPipeline } from "@/app/lib/pipeline";
import { getAppUser } from "@/app/lib/app-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await getAppUser())) return <LoginPage />;
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
      initialApiSettings={{
        baseUrl: runtime.baseUrl,
        model: runtime.model,
        imageBaseUrl: runtime.imageBaseUrl,
        imageModel: runtime.imageModel,
        configured: runtime.configured,
        imageConfigured: Boolean(runtime.imageApiKey),
        mapConfigured: Boolean(process.env.AMAP_WEB_SERVICE_KEY),
      }}
    />
  );
}
