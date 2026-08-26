import { Workbench } from "@/app/components/Workbench";
import type { InputDocument, PipelineResult } from "@/app/lib/pipeline";
import { createVisualTask } from "@/app/lib/visual-task";
import { normalizeExistingSmallModePlan } from "@/app/lib/model-pipeline";
import taskBrief from "@/fixtures/jingdezhen-small/task-brief.json";
import fixtureResult from "@/fixtures/jingdezhen-small/full-run.json";

export const dynamic = "force-static";

const visualAssets = {
  cover: "/jingdezhen-ai/cover-atmosphere.png",
  trueSpring: "/jingdezhen-ai/installation-true.png",
  sweetTea: "/jingdezhen-ai/installation-sweet.png",
  porcelain: "/jingdezhen-ai/installation-porcelain.png",
  ip: "/jingdezhen-ai/ip-character-sheet.png",
  coCreation: "/jingdezhen-ai/porcelain-co-creation.png",
  reuse: "/jingdezhen-ai/modular-reuse.png",
} as const;

const pageAssetMap: Record<number, string[]> = {
  1: [visualAssets.cover],
  2: [visualAssets.cover, visualAssets.trueSpring, visualAssets.sweetTea, visualAssets.porcelain],
  3: [visualAssets.trueSpring, visualAssets.sweetTea, visualAssets.porcelain],
  4: [visualAssets.cover, visualAssets.trueSpring, visualAssets.sweetTea, visualAssets.porcelain],
  5: [visualAssets.trueSpring, visualAssets.cover, visualAssets.coCreation],
  6: [visualAssets.trueSpring, visualAssets.coCreation],
  7: [visualAssets.reuse, visualAssets.trueSpring],
  8: [visualAssets.sweetTea, visualAssets.cover, visualAssets.coCreation],
  9: [visualAssets.sweetTea, visualAssets.coCreation],
  10: [visualAssets.sweetTea, visualAssets.reuse],
  11: [visualAssets.porcelain, visualAssets.coCreation, visualAssets.trueSpring],
  12: [visualAssets.porcelain, visualAssets.coCreation],
  13: [visualAssets.porcelain, visualAssets.reuse],
  14: [visualAssets.trueSpring, visualAssets.sweetTea, visualAssets.porcelain],
  15: [visualAssets.ip, visualAssets.coCreation, visualAssets.cover],
  16: [visualAssets.ip, visualAssets.coCreation],
  17: [visualAssets.reuse],
  18: [visualAssets.cover, visualAssets.porcelain, visualAssets.coCreation],
};

type PreviewPage = PipelineResult["pagePlan"]["pages"][number];
type PreviewVisualTask = NonNullable<PreviewPage["visual_task"]>;
type PreviewGeneratedImages = NonNullable<PreviewVisualTask["generated_images"]>;

function withPreviewVisualAssets(result: PipelineResult): PipelineResult {
  const previewResult = structuredClone(result);
  previewResult.pagePlan = normalizeExistingSmallModePlan(
    previewResult.projectFacts,
    previewResult.pagePlan,
  );
  previewResult.pagePlan.pages = previewResult.pagePlan.pages.map((page) => {
    const visualTask = createVisualTask(previewResult.projectFacts, page);
    const urls = pageAssetMap[page.display_page_number ?? 0] ?? [];
    const generatedImages = urls
      .slice(0, visualTask.image_slots.length)
      .map((image_url, index) => ({
        slot_id: visualTask.image_slots[index].slot_id,
        prompt_focus: visualTask.image_slots[index].prompt_focus,
        status: "generated" as const,
        model: "codex-imagegen",
        prompt_zh: "根据当前任务书与页面设计方向生成的小型装置视觉草案。",
        prompt_provenance: "submitted_to_image_model" as const,
        size: "1536x1024",
        image_url,
        generated_at: "2026-08-19T00:00:00.000Z",
        provider_response_id: `codex-imagegen-jingdezhen-${page.page_id}-${index + 1}`,
        image_count: 1,
        attempt_count: 1,
        disclaimer: "AI生成视觉草案；事实与设计诉求来自当前任务书。",
      })) as unknown as PreviewGeneratedImages;
    return {
      ...page,
      visual_task: {
        ...visualTask,
        ...(generatedImages.length
          ? { generated_images: generatedImages }
          : {}),
      },
    };
  });
  return previewResult;
}

export default function JingdezhenPreview() {
  const previewResult = withPreviewVisualAssets(
    fixtureResult as unknown as PipelineResult,
  );
  return (
    <Workbench
      initialDocuments={taskBrief as InputDocument[]}
      initialResult={previewResult}
      initialApiSettings={{
        baseUrl: "",
        model: "local-rule",
        imageBaseUrl: "",
        imageModel: "gpt-image-2",
        configured: false,
        imageConfigured: false,
        mapConfigured: false,
      }}
    />
  );
}
