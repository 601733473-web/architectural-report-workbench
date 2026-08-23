import { NextResponse } from "next/server";
import { AppAuthError, requireAppUser } from "@/app/lib/app-auth";
import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  type InputDocument,
  type NodeOutput,
  generateSinglePage,
} from "@/app/lib/pipeline";
import {
  getModelRuntime,
  ModelRequestError,
  testModelConnection,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import {
  auditPagesWithModel,
  generatePageWithModel,
  prepareExportWithModel,
  runDeepOptimizationPipeline,
  runFastPipeline,
} from "@/app/lib/model-pipeline";
import {
  assertPagePlan,
  assertProjectFacts,
} from "@/app/lib/schema-validator";
import { generateGateBProposalWithModel } from "@/app/lib/gate-b-proposal-model";
import {
  createUserDefinedProposal,
  removeUserDefinedProposal,
  synchronizeProposalCoverage,
  updateGateBProposal,
  type GateBProposalOperation,
} from "@/app/lib/gate-b-proposals";
import type { UserProposalTopic } from "@/app/lib/proposal-topics";
import {
  canGenerateVisualImageForSlot,
  getVisualImageSuitability,
  migrateLegacyVisualReferenceSelections,
  updatePageVisualTask,
} from "@/app/lib/visual-task";
import {
  generateVisualImageWithModel,
} from "@/app/lib/visual-image-model";
import { reviseProjectFact } from "@/app/lib/fact-revisions";
import { addPageWithModel } from "@/app/lib/page-addition-model";
import { generateDesignNarrativeWithModel } from "@/app/lib/design-narrative-model";
import {
  translatePageTextWithModel,
  type PageTextTranslationInput,
} from "@/app/lib/page-text-translation-model";
import { researchSiteContext } from "@/app/lib/site-research";
import { analyzeSiteVisualPagesWithModel } from "@/app/lib/site-visual-analysis-model";
import { selectSiteResearchSourcePages } from "@/app/lib/site-source-pages";
import { ensureSmallModeContentMatch } from "@/app/lib/small-mode-content-gate";
import {
  DEFAULT_TASK_MODE,
  isolateSmallBuildingProjectFacts,
  isSmallBuildingMode,
  type TaskMode,
} from "@/app/lib/task-mode";

type RunRequest = {
  action: "run";
  projectId?: string;
  documents: InputDocument[];
  mode?: "fast" | "deep";
  taskMode?: TaskMode;
  projectFacts?: DesignReportProjectFacts;
  pagePlan?: DesignReportPagePlan;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type GenerateRequest = {
  action: "generate_page";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  pageId: string;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type SiteResearchRequest = {
  action: "site_research";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  documents?: InputDocument[];
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
  mapConfig?: { amapApiKey?: string };
};

type AuditRequest = {
  action: "audit";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type PrepareExportRequest = {
  action: "prepare_export";
  format: "pdf" | "docx";
  taskId?: string;
  layoutOverflowPageIds?: string[];
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  documents?: InputDocument[];
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type VisualTaskRequest = {
  action: "visual_task";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  pageId: string;
  message?: string;
  rematch?: boolean;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type VisualImageRequest = {
  action: "generate_visual_image";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  pageId: string;
  slotId: string;
  taskId?: string;
  frameAspectRatio?: number;
  visibleCaption?: {
    title: string;
    detail?: string;
  };
  referenceImage?: {
    visualId: string;
    imageUrl: string;
    dataUrl: string;
    sourceKind?: "library" | "generated";
  };
  continuityReference?: {
    sourcePageId: string;
    imageUrl: string;
    dataUrl: string;
  };
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type PipelineErrorCode =
  | "AUTH"
  | "RATE_LIMIT"
  | "UPSTREAM_CAPACITY"
  | "UPSTREAM_SERVER"
  | "TIMEOUT"
  | "DNS"
  | "TLS"
  | "CONNECTION_RESET"
  | "NETWORK"
  | "PROVIDER_RESPONSE"
  | "PIPELINE";

class PipelineOperationError extends Error {
  constructor(
    message: string,
    readonly code: PipelineErrorCode,
    readonly retryable: boolean,
    readonly httpStatus: number,
    readonly stage: string,
    readonly requestId = "",
    readonly attemptCount = 1,
    readonly retryAfterMs = 0,
  ) {
    super(message);
    this.name = "PipelineOperationError";
  }
}

type VisualImageModeledResult = Awaited<
  ReturnType<typeof generateVisualImageWithModel>
>;
type VisualJobCacheEntry = {
  createdAt: number;
  promise: Promise<VisualImageModeledResult>;
};

type PrepareExportJobCacheEntry = {
  createdAt: number;
  promise: Promise<Record<string, unknown>>;
};

const prepareExportJobCache = (() => {
  const root = globalThis as typeof globalThis & {
    __ARCH_REPORT_PREPARE_EXPORT_JOB_CACHE__?: Map<
      string,
      PrepareExportJobCacheEntry
    >;
  };
  return (root.__ARCH_REPORT_PREPARE_EXPORT_JOB_CACHE__ ??= new Map());
})();

function prunePrepareExportJobCache() {
  const expiry = Date.now() - 30 * 60_000;
  for (const [key, entry] of prepareExportJobCache) {
    if (entry.createdAt < expiry) prepareExportJobCache.delete(key);
  }
  while (prepareExportJobCache.size > 10) {
    const oldest = prepareExportJobCache.keys().next().value;
    if (typeof oldest !== "string") break;
    prepareExportJobCache.delete(oldest);
  }
}

async function runRecoverablePrepareExportJob(
  taskId: string,
  run: () => Promise<Record<string, unknown>>,
) {
  prunePrepareExportJobCache();
  const cached = prepareExportJobCache.get(taskId);
  if (cached) return await cached.promise;
  const promise = run();
  prepareExportJobCache.set(taskId, { createdAt: Date.now(), promise });
  try {
    return await promise;
  } catch (error) {
    prepareExportJobCache.delete(taskId);
    throw error;
  }
}
const visualJobCache = (() => {
  const root = globalThis as typeof globalThis & {
    __ARCH_REPORT_VISUAL_JOB_CACHE__?: Map<string, VisualJobCacheEntry>;
  };
  return (root.__ARCH_REPORT_VISUAL_JOB_CACHE__ ??= new Map());
})();

function pruneVisualJobCache() {
  const expiry = Date.now() - 30 * 60_000;
  for (const [key, entry] of visualJobCache) {
    if (entry.createdAt < expiry) visualJobCache.delete(key);
  }
  while (visualJobCache.size > 20) {
    const oldest = visualJobCache.keys().next().value;
    if (typeof oldest !== "string") break;
    visualJobCache.delete(oldest);
  }
}

async function runRecoverableVisualJob(
  taskId: string | undefined,
  pageId: string,
  slotId: string,
  run: () => Promise<VisualImageModeledResult>,
) {
  if (!taskId) return { value: await run(), cacheHit: false };
  pruneVisualJobCache();
  const key = `${taskId}:${pageId}:${slotId}`;
  const cached = visualJobCache.get(key);
  if (cached) return { value: await cached.promise, cacheHit: true };
  const promise = run();
  visualJobCache.set(key, { createdAt: Date.now(), promise });
  try {
    return { value: await promise, cacheHit: false };
  } catch (error) {
    visualJobCache.delete(key);
    throw error;
  }
}

type GateBProposalRequest = {
  action: "gate_b_proposal";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  missingItemId: string;
  operation: GateBProposalOperation;
  selectedOptionId?: string;
  userInput?: string;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type AddPageRequest = {
  action: "add_page";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  prompt: string;
  afterPageId?: string;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type TranslatePageTextRequest = {
  action: "translate_page_text";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  pageId: string;
  text: PageTextTranslationInput;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type ReviseFactRequest = {
  action: "revise_fact";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  factId: string;
  proposedValue: string;
  userMessage: string;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type UserProposalRequest = {
  action: "user_proposal";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  operation: "create" | "delete";
  topic?: UserProposalTopic;
  title?: string;
  direction?: string;
  proposalId?: string;
  nodeOutputs?: NodeOutput[];
  apiConfig?: ModelRuntimeOverride;
};

type TestConnectionRequest = {
  action: "test_connection";
  apiConfig?: ModelRuntimeOverride;
};

type PipelineRequest =
  | RunRequest
  | SiteResearchRequest
  | GenerateRequest
  | AuditRequest
  | PrepareExportRequest
  | VisualTaskRequest
  | VisualImageRequest
  | GateBProposalRequest
  | AddPageRequest
  | TranslatePageTextRequest
  | ReviseFactRequest
  | UserProposalRequest
  | TestConnectionRequest;

function requiredModelFailure(
  step: string,
  error: unknown,
  fallbackRequestId = "",
) {
  const raw = error instanceof Error ? error.message : "真实模型调用失败";
  if (error instanceof ModelRequestError) {
    return new PipelineOperationError(
      `${step}未完成：${raw}。本次没有生成或保存本地替代结果。`,
      error.code,
      error.retryable,
      error.status,
      step,
      error.requestId || fallbackRequestId,
      error.attemptCount,
      error.retryAfterMs,
    );
  }
  if (
    /aborted due to timeout|timed out|timeout/i.test(raw) ||
    (error instanceof Error && error.name === "TimeoutError")
  ) {
    return new PipelineOperationError(
      `${step}未完成：真实模型调用超时。本次没有生成或保存本地替代结果。`,
      "TIMEOUT",
      true,
      504,
      step,
      fallbackRequestId,
    );
  }
  return new PipelineOperationError(
    `${step}未完成：${raw}。本次没有生成或保存本地替代结果。`,
    "PIPELINE",
    false,
    400,
    step,
    fallbackRequestId,
  );
}

function requireConfiguredModel(
  configured: boolean,
  step: string,
) {
  if (!configured) {
    throw new Error(
      `${step}需要真实模型，但当前缺少 API 密钥。本次没有生成本地替代结果。`,
    );
  }
}

function sanitizeApiConfig(
  value?: ModelRuntimeOverride,
): ModelRuntimeOverride | undefined {
  if (!value) return undefined;
  const baseUrl = value.baseUrl?.trim().replace(/\/+$/, "");
  const imageBaseUrl = value.imageBaseUrl?.trim().replace(/\/+$/, "");
  const model = value.model?.trim();
  const imageModel = value.imageModel?.trim();
  const apiKey = value.apiKey?.trim();
  const imageApiKey = value.imageApiKey?.trim();
  for (const [label, candidate] of [
    ["API", baseUrl],
    ["图像 API", imageBaseUrl],
  ] as const) {
    if (!candidate) continue;
    const parsed = new URL(candidate);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error(`${label} 地址只支持 http 或 https。`);
    }
  }
  if (model && model.length > 128) {
    throw new Error("模型名称过长。");
  }
  if (imageModel && imageModel.length > 128) {
    throw new Error("图像模型名称过长。");
  }
  if (apiKey && apiKey.length > 1024) {
    throw new Error("API 密钥格式异常。");
  }
  if (imageApiKey && imageApiKey.length > 1024) {
    throw new Error("图像 API 密钥格式异常。");
  }
  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(imageBaseUrl ? { imageBaseUrl } : {}),
    ...(model ? { model } : {}),
    ...(imageModel ? { imageModel } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(imageApiKey ? { imageApiKey } : {}),
  };
}

function preserveGeneratedVisualAssets(
  sourcePlan: DesignReportPagePlan,
  nextPlan: DesignReportPagePlan,
) {
  const sourcePages = new Map(
    sourcePlan.pages.map((page) => [page.page_id, page]),
  );
  const result = structuredClone(nextPlan);
  result.pages = result.pages.map((page) => {
    const sourceTask = sourcePages.get(page.page_id)?.visual_task;
    if (
      !sourceTask ||
      (!sourceTask.generated_images?.length &&
        !sourceTask.generated_image)
    ) {
      return page;
    }
    if (!page.visual_task) {
      return { ...page, visual_task: structuredClone(sourceTask) };
    }
    return {
      ...page,
      visual_task: {
        ...page.visual_task,
        ...(sourceTask.generated_images?.length
          ? {
              generated_images: structuredClone(
                sourceTask.generated_images,
              ),
            }
          : {}),
        ...(sourceTask.generated_image
          ? {
              generated_image: structuredClone(
                sourceTask.generated_image,
              ),
            }
          : {}),
      },
    };
  });
  return result;
}

function stripVisibleReferenceLibraryAssets(
  sourcePlan: DesignReportPagePlan,
) {
  const result = structuredClone(sourcePlan);
  result.pages = result.pages.map((page) => {
    if (!page.visual_task) return page;
    const task = { ...page.visual_task };
    delete task.reference_crop;
    delete task.slot_reference_crops;
    delete task.reference_selection;
    task.visual_reference_refs = [];
    return { ...page, visual_task: task };
  });
  return result;
}

function pipelineErrorPayload(error: unknown, fallbackRequestId = "") {
  const operationError =
    error instanceof PipelineOperationError ? error : null;
  const modelError = error instanceof ModelRequestError ? error : null;
  return {
    error: error instanceof Error ? error.message : "Pipeline failed.",
    errorCode: operationError?.code ?? modelError?.code ?? "PIPELINE",
    retryable:
      operationError?.retryable ?? modelError?.retryable ?? false,
    stage: operationError?.stage ?? "pipeline",
    requestId:
      operationError?.requestId ||
      modelError?.requestId ||
      fallbackRequestId ||
      undefined,
    attemptCount:
      operationError?.attemptCount ?? modelError?.attemptCount ?? 1,
    retryAfterMs:
      operationError?.retryAfterMs ?? modelError?.retryAfterMs ?? 0,
  };
}

function pipelineEventStream(
  run: () => Promise<Record<string, unknown>>,
  requestTaskId: string,
  stage: string,
  message: string,
) {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: Record<string, unknown>) => {
        if (cancelled) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
        );
      };
      const sendHeartbeat = () =>
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      send({
        type: "progress",
        stage,
        taskId: requestTaskId || undefined,
        message,
      });
      heartbeat = setInterval(sendHeartbeat, 15_000);
      void run()
        .then((payload) => {
          if (heartbeat) clearInterval(heartbeat);
          if (cancelled) return;
          send({ type: "result", payload });
          controller.close();
        })
        .catch((error) => {
          if (heartbeat) clearInterval(heartbeat);
          if (cancelled) return;
          send({
            type: "error",
            ...pipelineErrorPayload(error, requestTaskId),
          });
          controller.close();
        });
    },
    cancel() {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function visualImageEventStream(
  run: () => Promise<Record<string, unknown>>,
  requestTaskId: string,
) {
  return pipelineEventStream(
    run,
    requestTaskId,
    "model_generating",
    "图像模型正在生成，连接保持中。",
  );
}

export async function POST(request: Request) {
  let requestTaskId = "";
  try {
    await requireAppUser();
    const payload = (await request.json()) as PipelineRequest;
    requestTaskId =
      payload.action === "generate_visual_image"
        ? payload.taskId?.trim() ?? ""
        : payload.action === "prepare_export"
          ? payload.taskId?.trim() ?? crypto.randomUUID()
          : "";
    const runtimeOverride = sanitizeApiConfig(payload.apiConfig);
    const runtime = getModelRuntime(runtimeOverride);

    if (payload.action === "test_connection") {
      const connection = await testModelConnection(runtimeOverride);
      return NextResponse.json({ ok: true, ...connection });
    }

    if (payload.action === "run") {
      const projectId = payload.projectId ?? "SINGLE_PROJECT";
      const analysisMode = payload.mode === "deep" ? "deep" : "fast";
      const taskMode = payload.taskMode ?? payload.projectFacts?.task_mode ?? DEFAULT_TASK_MODE;
      let result;
      if (analysisMode === "fast") {
        result = runFastPipeline(payload.documents, projectId, taskMode);
      } else {
        requireConfiguredModel(runtime.configured, "深度优化");
        try {
          if (payload.projectFacts) assertProjectFacts(payload.projectFacts);
          if (payload.pagePlan) assertPagePlan(payload.pagePlan);
          result = await runDeepOptimizationPipeline(
            payload.documents,
            projectId,
            runtimeOverride,
            payload.projectFacts && payload.pagePlan
              ? {
                  projectFacts: payload.projectFacts,
                  pagePlan: payload.pagePlan,
                  nodeOutputs: payload.nodeOutputs ?? [],
                }
              : undefined,
            taskMode,
          );
        } catch (modelError) {
          throw requiredModelFailure("深度优化", modelError);
        }
      }
      assertProjectFacts(result.projectFacts);
      assertPagePlan(result.pagePlan);
      return NextResponse.json({ ...result, analysisMode });
    }

    if (payload.action === "site_research") {
      assertProjectFacts(payload.projectFacts);
      assertPagePlan(payload.pagePlan);
      let factsForResearch = payload.projectFacts;
      let visualCall: Awaited<
        ReturnType<typeof analyzeSiteVisualPagesWithModel>
      > | undefined;
      let visualWarning = "";
      const hasVisualPages = (payload.documents ?? []).some(
        (document) => (document.visual_pages?.length ?? 0) > 0,
      );
      const hasSiteSourcePages =
        selectSiteResearchSourcePages(payload.documents ?? [], 1).length > 0;
      if (hasSiteSourcePages && runtime.configured) {
        try {
          visualCall = await analyzeSiteVisualPagesWithModel(
            payload.documents ?? [],
            payload.projectFacts,
            runtimeOverride,
          );
          factsForResearch = visualCall.projectFacts;
          if (!hasVisualPages) {
            visualWarning =
              "当前存档没有区位页图像，本次已直接读取任务书相关页面文字层；无需重新上传也可以继续场地分析。";
          }
        } catch (error) {
          visualWarning = `任务书场地信息识别未完成：${error instanceof Error ? error.message : "模型调用失败"}`;
        }
      } else if (!hasSiteSourcePages) {
        visualWarning =
          "当前资料没有找到区位相关页面图像或文字；场地研究仅保留已有任务书事实。";
      } else {
        visualWarning =
          "未配置文本／视觉理解模型，暂时只保留任务书已提取的场地事实。";
      }
      const amapApiKey = payload.mapConfig?.amapApiKey?.trim();
      if (amapApiKey && amapApiKey.length > 256) {
        throw new Error("高德 Web 服务 Key 格式异常。");
      }
      const research = await researchSiteContext(
        factsForResearch,
        fetch,
        amapApiKey ? { amapApiKey } : undefined,
      );
      assertProjectFacts(research.projectFacts);
      const warnings = [visualWarning, ...research.warnings].filter(Boolean);
      const researchNode: NodeOutput = {
        node: "site_research",
        execution: visualCall ? "openai_model" : "local_rule",
        model_calls: visualCall ? 1 : 0,
        ...(visualCall
          ? {
              model: visualCall.call.model,
              response_id: visualCall.call.responseId,
              token_usage: {
                input: visualCall.call.inputTokens,
                output: visualCall.call.outputTokens,
              },
            }
          : {}),
        output: {
          status: research.status,
          query: research.query,
          summary: [
            visualCall?.summary,
            research.summary,
          ].filter(Boolean).join("；"),
          fact_count: research.factCount,
          visual_observation_count: visualCall?.observationCount ?? 0,
          warnings,
          page_framework_changed: false,
        },
      };
      const nodeOutputs = [...(payload.nodeOutputs ?? []), researchNode];
      return NextResponse.json({
        projectFacts: research.projectFacts,
        pagePlan: payload.pagePlan,
        nodeOutputs,
        modelCallCount: nodeOutputs.reduce(
          (sum, output) => sum + output.model_calls,
          0,
        ),
        executionMode: visualCall ? "openai_model" : "local_rule",
        modelName: runtime.model,
        siteResearch: {
          status: research.status,
          summary: [visualCall?.summary, research.summary]
            .filter(Boolean)
            .join("；"),
          factCount:
            research.factCount + (visualCall?.observationCount ?? 0),
          warnings,
        },
      });
    }

    assertProjectFacts(payload.projectFacts);
    payload.pagePlan = migrateLegacyVisualReferenceSelections(
      payload.pagePlan,
    );
    assertPagePlan(payload.pagePlan);
    const synchronizedCoverage = synchronizeProposalCoverage(
      payload.projectFacts,
      payload.pagePlan,
    );
    payload.projectFacts = synchronizedCoverage.projectFacts;
    payload.pagePlan = synchronizedCoverage.pagePlan;

    if (payload.action === "translate_page_text") {
      requireConfiguredModel(runtime.configured, "页面英文自动翻译");
      try {
        const modeled = await translatePageTextWithModel(
          payload.text,
          runtimeOverride,
        );
        const translationNode: NodeOutput = {
          node: "page_text_translation",
          execution: "openai_model",
          model_calls: 1,
          model: modeled.call.model,
          response_id: modeled.call.responseId,
          token_usage: {
            input: modeled.call.inputTokens,
            output: modeled.call.outputTokens,
          },
          output: {
            page_id: payload.pageId,
            translated_fields: [
              "section_title_en",
              "headline_en",
              "core_message_en",
              "body_en",
              "diagram_labels_en",
              "callouts_en",
              "toc_sections_en",
            ],
          },
        };
        const nodeOutputs = [
          ...(payload.nodeOutputs ?? []),
          translationNode,
        ];
        return NextResponse.json({
          projectFacts: payload.projectFacts,
          pagePlan: payload.pagePlan,
          translation: modeled.translation,
          nodeOutputs,
          modelCallCount: nodeOutputs.reduce(
            (sum, output) => sum + output.model_calls,
            0,
          ),
          executionMode: "openai_model",
          modelName: modeled.call.model,
        });
      } catch (modelError) {
        throw requiredModelFailure("页面英文自动翻译", modelError);
      }
    }

    if (payload.action === "revise_fact") {
      const projectFacts = reviseProjectFact(
        payload.projectFacts,
        payload.factId,
        payload.proposedValue,
        payload.userMessage,
      );
      assertProjectFacts(projectFacts);
      const revisedFact = projectFacts.facts.find(
        (fact) => fact.fact_id === payload.factId,
      );
      const revisionNode: NodeOutput = {
        node: "fact_revision",
        execution: "local_rule",
        model_calls: 0,
        output: revisedFact?.revision_history?.at(-1),
      };
      const nodeOutputs = [...(payload.nodeOutputs ?? []), revisionNode];
      return NextResponse.json({
        projectFacts,
        pagePlan: payload.pagePlan,
        nodeOutputs,
        modelCallCount: nodeOutputs.reduce(
          (sum, output) => sum + output.model_calls,
          0,
        ),
        executionMode: "local_rule",
        modelName: runtime.model,
      });
    }

    if (payload.action === "add_page") {
      requireConfiguredModel(runtime.configured, "新增页面初稿");
      try {
        const modeled = await addPageWithModel(
          payload.projectFacts,
          payload.pagePlan,
          payload.prompt,
          payload.afterPageId,
          runtimeOverride,
        );
        assertProjectFacts(modeled.projectFacts);
        assertPagePlan(modeled.pagePlan);
        const additionNode: NodeOutput = {
          node: "page_addition",
          execution: "openai_model",
          model_calls: 1,
          model: modeled.call.model,
          response_id: modeled.call.responseId,
          token_usage: {
            input: modeled.call.inputTokens,
            output: modeled.call.outputTokens,
          },
          output: {
            added_page_id: modeled.addedPage.page_id,
            inserted_after_page_id: payload.afterPageId,
          },
        };
        const nodeOutputs = [
          ...(payload.nodeOutputs ?? []),
          additionNode,
        ];
        return NextResponse.json({
          projectFacts: modeled.projectFacts,
          pagePlan: modeled.pagePlan,
          nodeOutputs,
          modelCallCount: nodeOutputs.reduce(
            (sum, output) => sum + output.model_calls,
            0,
          ),
          executionMode: "openai_model",
          modelName: modeled.call.model,
        });
      } catch (modelError) {
        throw requiredModelFailure("新增页面初稿", modelError);
      }
    }

    if (payload.action === "user_proposal") {
      const updatedProjectFacts =
        payload.operation === "create"
          ? createUserDefinedProposal(
              payload.projectFacts,
              payload.topic ?? "设计概念",
              payload.title ?? "",
              payload.direction ?? "",
            )
          : removeUserDefinedProposal(
              payload.projectFacts,
              payload.proposalId ?? "",
            );
      const synchronized = synchronizeProposalCoverage(
        updatedProjectFacts,
        payload.pagePlan,
      );
      const projectFacts = synchronized.projectFacts;
      assertProjectFacts(projectFacts);
      const proposalNode: NodeOutput = {
        node: "user_proposal",
        execution: "local_rule",
        model_calls: 0,
        output:
          payload.operation === "create"
            ? projectFacts.gate_b_proposals?.at(-1)
            : { removed_proposal_id: payload.proposalId },
      };
      const nodeOutputs = [...(payload.nodeOutputs ?? []), proposalNode];
      return NextResponse.json({
        projectFacts,
        pagePlan: synchronized.pagePlan,
        nodeOutputs,
        modelCallCount: nodeOutputs.reduce(
          (sum, output) => sum + output.model_calls,
          0,
        ),
        executionMode: "local_rule",
        modelName: runtime.model,
      });
    }

    if (payload.action === "gate_b_proposal") {
      let projectFacts: DesignReportProjectFacts;
      let pagePlan = payload.pagePlan;
      let proposalNode: NodeOutput;
      if (payload.operation === "generate") {
        requireConfiguredModel(runtime.configured, "内容设计提案");
        try {
          const modeled = await generateGateBProposalWithModel(
            payload.projectFacts,
            payload.missingItemId,
            runtimeOverride,
          );
          projectFacts = modeled.projectFacts;
          proposalNode = {
            node: "gate_b_proposal",
            execution: "openai_model",
            model_calls: modeled.cacheHit ? 0 : 1,
            model: modeled.call.model,
            response_id: modeled.call.responseId,
            ...(modeled.cacheHit
              ? {}
              : {
                  token_usage: {
                    input: modeled.call.inputTokens,
                    output: modeled.call.outputTokens,
                  },
                }),
            output: modeled.proposal,
          };
        } catch (modelError) {
          throw requiredModelFailure("内容设计提案", modelError);
        }
      } else {
        projectFacts = updateGateBProposal(
          payload.projectFacts,
          payload.missingItemId,
          payload.operation,
          payload.selectedOptionId,
          payload.userInput,
        );
        proposalNode = {
          node: "gate_b_proposal",
          execution: "local_rule",
          model_calls: 0,
          output: projectFacts.gate_b_proposals?.find(
            (proposal) =>
              proposal.missing_item_id === payload.missingItemId,
          ),
          };
      }
      const synchronized = synchronizeProposalCoverage(
        projectFacts,
        pagePlan,
      );
      projectFacts = synchronized.projectFacts;
      pagePlan = synchronized.pagePlan;
      assertProjectFacts(projectFacts);
      assertPagePlan(pagePlan);
      const nodeOutputs = [
        ...(payload.nodeOutputs ?? []),
        proposalNode,
      ];
      const modelCallCount = nodeOutputs.reduce(
        (sum, output) => sum + output.model_calls,
        0,
      );
      return NextResponse.json({
        projectFacts,
        pagePlan,
        nodeOutputs,
        modelCallCount,
        executionMode: modelCallCount > 0 ? "openai_model" : "local_rule",
        modelName: runtime.model,
      });
    }

    if (payload.action === "visual_task") {
      const pagePlan = stripVisibleReferenceLibraryAssets(updatePageVisualTask(
        payload.projectFacts,
        payload.pagePlan,
        payload.pageId,
        payload.message,
        payload.rematch === true,
      ));
      const visualNode: NodeOutput = {
        node: "visual_planning",
        execution: "local_rule",
        model_calls: 0,
        output: pagePlan.pages.find(
          (page) => page.page_id === payload.pageId,
        )?.visual_task,
      };
      assertPagePlan(pagePlan);
      const nodeOutputs = [...(payload.nodeOutputs ?? []), visualNode];
      const modelCallCount = nodeOutputs.reduce(
        (sum, output) => sum + output.model_calls,
        0,
      );
      return NextResponse.json({
        projectFacts: payload.projectFacts,
        pagePlan,
        nodeOutputs,
        modelCallCount,
        executionMode: modelCallCount > 0 ? "openai_model" : "local_rule",
        modelName: runtime.model,
      });
    }

    if (payload.action === "generate_visual_image") {
      // 老项目存档可能仍带有空的 reference_experience。小型模式不提交
      // 历史经验对象，避免在真正调用图像模型前被共享事实契约拦截。
      const visualProjectFacts = isSmallBuildingMode(
        payload.projectFacts.task_mode ?? DEFAULT_TASK_MODE,
      )
        ? isolateSmallBuildingProjectFacts(payload.projectFacts)
        : payload.projectFacts;
      let imageRequestPagePlan = payload.pagePlan;
      const incomingImagePage = imageRequestPagePlan.pages.find(
        (page) => page.page_id === payload.pageId,
      );
      const incomingHasRequestedSlot = Boolean(
        incomingImagePage?.visual_task?.image_slots.some(
          (slot) => slot.slot_id === payload.slotId,
        ),
      );
      if (
        isSmallBuildingMode(
          payload.projectFacts.task_mode ?? DEFAULT_TASK_MODE,
        )
      ) {
        // Rebuild the small-mode slot recipe on every generation request so
        // updated page-specific prompts, one-image strategy pages, and named
        // proposal slots replace stale tasks from older project snapshots.
        imageRequestPagePlan = updatePageVisualTask(
          visualProjectFacts,
          imageRequestPagePlan,
          payload.pageId,
          undefined,
          true,
        );
      }
      // The slot is intentionally refreshed even when incomingHasRequestedSlot
      // is true; the old !incomingHasRequestedSlot branch is retained only as
      // a compatibility marker while replacing stale small-mode recipes
      // from older snapshots.
      void incomingHasRequestedSlot;
      let imagePage = imageRequestPagePlan.pages.find(
        (page) => page.page_id === payload.pageId,
      );
      let imageSlot = imagePage?.visual_task?.image_slots.find(
        (slot) => slot.slot_id === payload.slotId,
      );
      if (imagePage && !imageSlot) {
        imageRequestPagePlan = updatePageVisualTask(
          visualProjectFacts,
          imageRequestPagePlan,
          payload.pageId,
        );
        imagePage = imageRequestPagePlan.pages.find(
          (page) => page.page_id === payload.pageId,
        );
        imageSlot = imagePage?.visual_task?.image_slots.find(
          (slot) => slot.slot_id === payload.slotId,
        );
      }
      if (!imagePage || !imageSlot) {
        const availablePageIds = imageRequestPagePlan.pages
          .map((candidate) => candidate.page_id)
          .join(", ");
        const availableSlotIds = imagePage?.visual_task?.image_slots
          .map((candidate) => candidate.slot_id)
          .join(", ") ?? "无";
        throw requiredModelFailure(
          "视觉意向图生成",
          new Error(
            `当前页面或图片槽不存在：请求页面 ${payload.pageId}、槽位 ${payload.slotId}；收到页面 ${availablePageIds || "无"}；该页槽位 ${availableSlotIds}。`,
          ),
        );
      }
      const pageImageSuitability = getVisualImageSuitability(
        imagePage.page_type,
      );
      if (!pageImageSuitability.eligible) {
        throw requiredModelFailure(
          "视觉意向图生成",
          new Error(pageImageSuitability.reason),
        );
      }
      if (
        !canGenerateVisualImageForSlot(imagePage.page_type, imageSlot)
      ) {
        throw requiredModelFailure(
          "视觉意向图生成",
          new Error(
            "当前图框不支持 AI 生图，请重新选择一个可生成的图片槽。",
          ),
        );
      }
      requireConfiguredModel(runtime.configured, "视觉意向图生成");
      // 合规边界：公司汇报素材库中的图片不参与生图流程。视觉任务单
      // 只提交当前项目事实、已确认提案、页面文案和图框比例；跨页连续性
      // 只允许由前端显式提供的当前项目已生成图面承担。
      const generationReference = undefined;
      const runVisualImage = async () => {
        let contentGateCalls: Array<{
          model: string;
          responseId?: string;
          inputTokens: number;
          outputTokens: number;
        }> = [];
        // Keep the content gate inside the streamed job. The response and its
        // heartbeat are established first, so a valid model review cannot be
        // cut off by the Cloud Run gateway before image generation starts.
        const smallModeContentMatchVerified = (payload.nodeOutputs ?? []).some(
          (nodeOutput) =>
            nodeOutput.node === "export_preparation" &&
            Boolean(
              (
                nodeOutput.output as {
                  small_mode_content_match?: boolean;
                }
              )?.small_mode_content_match,
            ),
        );
        if (
          isSmallBuildingMode(
            payload.projectFacts.task_mode ?? DEFAULT_TASK_MODE,
          ) &&
          !smallModeContentMatchVerified
        ) {
          if (imageRequestPagePlan.pages.length <= 1) {
            throw requiredModelFailure(
              "小型建筑/装置文本匹配审查",
              new Error(
                "请先点击“生成整套终稿文案”完成整套内容匹配审查，再生成 AI 图。",
              ),
              requestTaskId,
            );
          }
          try {
            const contentGate = await ensureSmallModeContentMatch(
              visualProjectFacts,
              imageRequestPagePlan,
              runtimeOverride,
            );
            imageRequestPagePlan = contentGate.pagePlan;
            contentGateCalls = contentGate.calls;
            imagePage = imageRequestPagePlan.pages.find(
              (page) => page.page_id === payload.pageId,
            );
            imageSlot = imagePage?.visual_task?.image_slots.find(
              (slot) => slot.slot_id === payload.slotId,
            );
            if (imagePage && !imageSlot) {
              imageRequestPagePlan = updatePageVisualTask(
                visualProjectFacts,
                imageRequestPagePlan,
                payload.pageId,
              );
            }
          } catch (modelError) {
            throw requiredModelFailure(
              "小型建筑/装置文本匹配审查",
              modelError,
              requestTaskId,
            );
          }
        }
        const generationPagePlan = stripVisibleReferenceLibraryAssets(
          imageRequestPagePlan,
        );
        let modeled: VisualImageModeledResult;
        let recoveredFromCache = false;
        try {
          const job = await runRecoverableVisualJob(
            requestTaskId,
            payload.pageId,
            payload.slotId,
            () =>
              generateVisualImageWithModel(
                visualProjectFacts,
                generationPagePlan,
                payload.pageId,
                payload.slotId,
                generationReference,
                payload.continuityReference,
                payload.frameAspectRatio,
                payload.visibleCaption,
                runtimeOverride,
              ),
          );
          modeled = job.value;
          recoveredFromCache = job.cacheHit;
        } catch (modelError) {
          throw requiredModelFailure(
            "视觉意向图生成",
            modelError,
            requestTaskId,
          );
        }
        const pagePlan = stripVisibleReferenceLibraryAssets(modeled.pagePlan);
        const imageCalls = modeled.imageCalls;
        const auditCalls = modeled.auditCalls;
        const promptModelCallCount =
          modeled.promptCall.inputTokens > 0 ||
          modeled.promptCall.outputTokens > 0
            ? 1
            : 0;
        const calledModels = [
          ...contentGateCalls.map((call) => call.model),
          ...(promptModelCallCount ? [modeled.promptCall.model] : []),
          ...imageCalls.map((call) => call.model),
          ...auditCalls.map((call) => call.model),
        ];
        const visualNode: NodeOutput = {
          node: "visual_image_generation",
          execution: "openai_model",
          model_calls:
            contentGateCalls.length +
            promptModelCallCount +
            imageCalls.length +
            auditCalls.length,
          model: [...new Set(calledModels)].join(" + "),
          response_id:
            imageCalls.find((call) => call.responseId)?.responseId ||
            modeled.promptCall.responseId,
          token_usage: {
            input:
              contentGateCalls.reduce(
                (sum, call) => sum + call.inputTokens,
                0,
              ) +
              modeled.promptCall.inputTokens +
              auditCalls.reduce(
                (sum, call) => sum + call.inputTokens,
                0,
              ),
            output:
              contentGateCalls.reduce(
                (sum, call) => sum + call.outputTokens,
                0,
              ) +
              modeled.promptCall.outputTokens +
              auditCalls.reduce(
                (sum, call) => sum + call.outputTokens,
                0,
              ),
          },
          image_count: imageCalls.reduce(
            (sum, call) => sum + call.imageCount,
            0,
          ),
          output: pagePlan.pages.find(
            (page) => page.page_id === payload.pageId,
          )?.visual_task,
        };
        assertPagePlan(pagePlan);
        const nodeOutputs = [...(payload.nodeOutputs ?? []), visualNode];
        return {
          projectFacts: payload.projectFacts,
          pagePlan,
          nodeOutputs,
          modelCallCount: nodeOutputs.reduce(
            (sum, output) => sum + output.model_calls,
            0,
          ),
          executionMode: "openai_model",
          modelName: runtime.model,
          visualTaskId: requestTaskId || undefined,
          recoveredFromCache,
        };
      };
      if (request.headers.get("accept")?.includes("text/event-stream")) {
        return visualImageEventStream(runVisualImage, requestTaskId);
      }
      return NextResponse.json(await runVisualImage());
    }

    if (payload.action === "generate_page") {
      const smallMode = isSmallBuildingMode(
        payload.projectFacts.task_mode ??
          payload.pagePlan.task_mode ??
          DEFAULT_TASK_MODE,
      );
      if (!runtime.configured && !smallMode) {
        requireConfiguredModel(runtime.configured, "当前页文案生成");
      }
      let modeled;
      try {
        modeled = runtime.configured
          ? await generatePageWithModel(
              payload.projectFacts,
              payload.pagePlan,
              payload.pageId,
              runtimeOverride,
            )
          : null;
      } catch (modelError) {
        if (!smallMode) {
          throw requiredModelFailure("当前页文案生成", modelError);
        }

        const fallbackPlan = generateSinglePage(
          payload.projectFacts,
          payload.pagePlan,
          payload.pageId,
        );
        const fallbackPage = fallbackPlan.pages.find(
          (page) => page.page_id === payload.pageId,
        );
        const fallbackReason =
          modelError instanceof ModelRequestError && modelError.status === 404
            ? "文本模型名称在腾讯云已保存的接口中不可用，已改用任务书本地生成结果；请在模型配置中选择接口返回的可用文本模型后再启用模型润色。"
            : "文本模型本次不可用，已改用任务书本地生成结果；当前页面没有被阻断。";
        const fallbackNode: NodeOutput = {
          node: "page_generation",
          execution: "local_fallback",
          model_calls: 0,
          model: runtime.model,
          fallback_reason: fallbackReason,
          output: fallbackPage,
        };
        assertPagePlan(fallbackPlan);
        return NextResponse.json({
          projectFacts: payload.projectFacts,
          pagePlan: fallbackPlan,
          nodeOutputs: [...(payload.nodeOutputs ?? []), fallbackNode],
          modelCallCount: (payload.nodeOutputs ?? []).reduce(
            (sum, output) => sum + output.model_calls,
            0,
          ),
          executionMode: "local_fallback",
          modelName: runtime.model,
        });
      }
      if (!modeled) {
        const fallbackPlan = generateSinglePage(
          payload.projectFacts,
          payload.pagePlan,
          payload.pageId,
        );
        const fallbackPage = fallbackPlan.pages.find(
          (page) => page.page_id === payload.pageId,
        );
        const fallbackNode: NodeOutput = {
          node: "page_generation",
          execution: "local_fallback",
          model_calls: 0,
          fallback_reason:
            "当前未配置可用文本模型，已直接依据任务书生成页面内容；当前页面没有被阻断。",
          output: fallbackPage,
        };
        assertPagePlan(fallbackPlan);
        return NextResponse.json({
          projectFacts: payload.projectFacts,
          pagePlan: fallbackPlan,
          nodeOutputs: [...(payload.nodeOutputs ?? []), fallbackNode],
          modelCallCount: (payload.nodeOutputs ?? []).reduce(
            (sum, output) => sum + output.model_calls,
            0,
          ),
          executionMode: "local_fallback",
          modelName: runtime.model,
        });
      }
      const pagePlan = modeled.pagePlan;
      const pageCalls = modeled.calls;
      const modelNode: NodeOutput = {
        node: "page_generation",
        execution: "openai_model",
        model_calls: pageCalls.length,
        model: [...new Set(pageCalls.map((call) => call.model))].join(" + "),
        response_id: modeled.call.responseId,
        token_usage: {
          input: pageCalls.reduce(
            (sum, call) => sum + call.inputTokens,
            0,
          ),
          output: pageCalls.reduce(
            (sum, call) => sum + call.outputTokens,
            0,
          ),
        },
        output: pagePlan.pages.find(
          (page) => page.page_id === payload.pageId,
        ),
      };
      assertPagePlan(pagePlan);
      return NextResponse.json({
        projectFacts: payload.projectFacts,
        pagePlan,
        nodeOutputs: [
          ...(payload.nodeOutputs ?? []),
          modelNode,
        ],
        modelCallCount:
          (payload.nodeOutputs ?? []).reduce(
            (sum, output) => sum + output.model_calls,
            0,
          ) + modelNode.model_calls,
        executionMode: modelNode.execution,
        modelName: runtime.model,
      });
    }

    if (payload.action === "prepare_export") {
      requireConfiguredModel(runtime.configured, "导出终稿整理");
      const runPrepareExport = async () => {
        let modeled;
        const sourcePlanBeforeExport = structuredClone(payload.pagePlan);
        try {
          modeled = await prepareExportWithModel(
            payload.projectFacts,
            payload.pagePlan,
            payload.format,
            runtimeOverride,
            { layoutOverflowPageIds: payload.layoutOverflowPageIds },
          );
        } catch (modelError) {
          throw requiredModelFailure("导出终稿整理", modelError);
        }
        let pagePlan = preserveGeneratedVisualAssets(
          sourcePlanBeforeExport,
          modeled.pagePlan,
        );
        pagePlan = stripVisibleReferenceLibraryAssets(pagePlan);
        let designNarrative;
        let allCalls = modeled.calls;
        let smallModeContentMatch = false;
        let smallModeBuildabilityScore: number | undefined;
        let smallModeBuildabilityDecision: string | undefined;
        if (smallMode) {
          try {
            const contentGate = await ensureSmallModeContentMatch(
              payload.projectFacts,
              pagePlan,
              runtimeOverride,
            );
            pagePlan = preserveGeneratedVisualAssets(
              sourcePlanBeforeExport,
              contentGate.pagePlan,
            );
            pagePlan = stripVisibleReferenceLibraryAssets(pagePlan);
            const isolatedSmallFacts = isolateSmallBuildingProjectFacts(
              payload.projectFacts,
            );
            pagePlan = pagePlan.pages.reduce(
              (currentPlan, page) =>
                updatePageVisualTask(
                  isolatedSmallFacts,
                  currentPlan,
                  page.page_id,
                  undefined,
                  true,
                ),
              pagePlan,
            );
            allCalls = [...allCalls, ...contentGate.calls];
            smallModeContentMatch = contentGate.match.match;
            smallModeBuildabilityScore = contentGate.buildability.score;
            smallModeBuildabilityDecision =
              contentGate.buildability.decision;
          } catch (modelError) {
            throw requiredModelFailure(
              "小型建筑/装置文本匹配审查",
              modelError,
              requestTaskId,
            );
          }
        }
        const visualMatchedPageIds: string[] = [];
        if (payload.format === "docx") {
          try {
            const narrativeResult =
              await generateDesignNarrativeWithModel(
                payload.projectFacts,
                pagePlan,
                payload.documents ?? [],
                runtimeOverride,
              );
            designNarrative = narrativeResult.narrative;
            allCalls = [...allCalls, narrativeResult.call];
          } catch (modelError) {
            throw requiredModelFailure(
              "完整设计说明编写",
              modelError,
            );
          }
        }
        const inputTokens = allCalls.reduce(
          (sum, call) => sum + call.inputTokens,
          0,
        );
        const outputTokens = allCalls.reduce(
          (sum, call) => sum + call.outputTokens,
          0,
        );
        const exportNode: NodeOutput = {
          node: "export_preparation",
          execution: "openai_model",
          model_calls: allCalls.length,
          model: [...new Set(allCalls.map((call) => call.model))].join(
            " + ",
          ),
          response_id: allCalls.at(-1)?.responseId,
          token_usage: {
            input: inputTokens,
            output: outputTokens,
          },
          output: {
            format: payload.format,
            generated_page_ids: modeled.generatedPageIds,
            reused_page_ids: modeled.reusedPageIds,
            audit_reused: modeled.auditReused,
            visual_matched_page_ids: visualMatchedPageIds,
            audited_page_ids:
              pagePlan.audit_report?.reviewed_page_ids ?? [],
            design_narrative_generated: Boolean(designNarrative),
            ...(smallMode
              ? {
                  small_mode_content_match: smallModeContentMatch,
                  small_mode_buildability_score:
                    smallModeBuildabilityScore,
                  small_mode_buildability_decision:
                    smallModeBuildabilityDecision,
                }
              : {}),
          },
        };
        assertPagePlan(pagePlan);
        const nodeOutputs = [
          ...(payload.nodeOutputs ?? []),
          exportNode,
        ];
        return {
          projectFacts: payload.projectFacts,
          pagePlan,
          nodeOutputs,
          modelCallCount: nodeOutputs.reduce(
            (sum, output) => sum + output.model_calls,
            0,
          ),
          executionMode: "openai_model",
          modelName: runtime.model,
          ...(designNarrative ? { designNarrative } : {}),
        };
      };
      const smallMode = isSmallBuildingMode(
        payload.projectFacts.task_mode ?? DEFAULT_TASK_MODE,
      );
      if (
        smallMode &&
        request.headers.get("accept")?.includes("text/event-stream")
      ) {
        return pipelineEventStream(
          () => runRecoverablePrepareExportJob(requestTaskId, runPrepareExport),
          requestTaskId,
          "final_text_generation",
          "Agent 正在生成整套终稿文案并审核，连接保持中。",
        );
      }
      return NextResponse.json(
        await runRecoverablePrepareExportJob(requestTaskId, runPrepareExport),
      );
    }

    if (payload.action === "audit") {
      requireConfiguredModel(runtime.configured, "模型一致性审核");
      let modeled;
      try {
        modeled = await auditPagesWithModel(
          payload.projectFacts,
          payload.pagePlan,
          runtimeOverride,
        );
      } catch (modelError) {
        throw requiredModelFailure("模型一致性审核", modelError);
      }
      const pagePlan = modeled.pagePlan;
      const modelNode: NodeOutput = {
        node: "consistency_audit",
        execution: "openai_model",
        model_calls: 1,
        model: modeled.call.model,
        response_id: modeled.call.responseId,
        token_usage: {
          input: modeled.call.inputTokens,
          output: modeled.call.outputTokens,
        },
        output: pagePlan.audit_report,
      };
      assertPagePlan(pagePlan);
      return NextResponse.json({
        projectFacts: payload.projectFacts,
        pagePlan,
        nodeOutputs: [
          ...(payload.nodeOutputs ?? []),
          modelNode,
        ],
        modelCallCount:
          (payload.nodeOutputs ?? []).reduce(
            (sum, output) => sum + output.model_calls,
            0,
          ) + modelNode.model_calls,
        executionMode: modelNode.execution,
        modelName: runtime.model,
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const operationError =
      error instanceof PipelineOperationError ? error : null;
    const modelError = error instanceof ModelRequestError ? error : null;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Pipeline failed.",
        errorCode: operationError?.code ?? modelError?.code ?? "PIPELINE",
        retryable:
          operationError?.retryable ?? modelError?.retryable ?? false,
        stage: operationError?.stage ?? "pipeline",
        requestId:
          operationError?.requestId ||
          modelError?.requestId ||
          requestTaskId ||
          undefined,
        attemptCount:
          operationError?.attemptCount ?? modelError?.attemptCount ?? 1,
        retryAfterMs:
          operationError?.retryAfterMs ?? modelError?.retryAfterMs ?? 0,
      },
      {
        status:
          error instanceof AppAuthError
            ? error.status
            : operationError?.httpStatus ?? modelError?.status ?? 400,
      },
    );
  }
}
