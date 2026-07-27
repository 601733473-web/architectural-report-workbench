import { NextResponse } from "next/server";
import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  auditGeneratedPages,
  generateSinglePage,
  runPipeline,
  type InputDocument,
  type NodeOutput,
} from "@/app/lib/pipeline";
import { getModelRuntime } from "@/app/lib/model-client";
import {
  auditPagesWithModel,
  generatePageWithModel,
  runModelPipeline,
} from "@/app/lib/model-pipeline";
import {
  assertPagePlan,
  assertProjectFacts,
} from "@/app/lib/schema-validator";

type RunRequest = {
  action: "run";
  projectId?: string;
  documents: InputDocument[];
};

type GenerateRequest = {
  action: "generate_page";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  pageId: string;
  nodeOutputs?: NodeOutput[];
};

type AuditRequest = {
  action: "audit";
  projectFacts: DesignReportProjectFacts;
  pagePlan: DesignReportPagePlan;
  nodeOutputs?: NodeOutput[];
};

type PipelineRequest = RunRequest | GenerateRequest | AuditRequest;

function markFallback<T extends {
  nodeOutputs: NodeOutput[];
  modelCallCount: number;
}>(result: T, reason: string) {
  return {
    ...result,
    nodeOutputs: result.nodeOutputs.map((output) => ({
      ...output,
      execution: "local_fallback" as const,
      fallback_reason: reason,
    })),
    executionMode: "local_fallback" as const,
    modelName: getModelRuntime().model,
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as PipelineRequest;

    if (payload.action === "run") {
      const projectId = payload.projectId ?? "SINGLE_PROJECT";
      let result;
      if (getModelRuntime().configured) {
        try {
          result = await runModelPipeline(payload.documents, projectId);
        } catch (modelError) {
          const reason =
            modelError instanceof Error ? modelError.message : "真实模型调用失败";
          result = markFallback(
            runPipeline(payload.documents, projectId),
            reason,
          );
        }
      } else {
        result = markFallback(
          runPipeline(payload.documents, projectId),
          "缺少 OPENAI_API_KEY，资料未发送给外部模型。",
        );
      }
      assertProjectFacts(result.projectFacts);
      assertPagePlan(result.pagePlan);
      return NextResponse.json(result);
    }

    assertProjectFacts(payload.projectFacts);
    assertPagePlan(payload.pagePlan);

    if (payload.action === "generate_page") {
      let pagePlan: DesignReportPagePlan;
      let modelNode: NodeOutput;
      if (getModelRuntime().configured) {
        try {
          const modeled = await generatePageWithModel(
            payload.projectFacts,
            payload.pagePlan,
            payload.pageId,
          );
          pagePlan = modeled.pagePlan;
          modelNode = {
            node: "page_generation",
            execution: "openai_model",
            model_calls: 1,
            model: modeled.call.model,
            response_id: modeled.call.responseId,
            token_usage: {
              input: modeled.call.inputTokens,
              output: modeled.call.outputTokens,
            },
            output: pagePlan.pages.find(
              (page) => page.page_id === payload.pageId,
            ),
          };
        } catch (modelError) {
          const reason =
            modelError instanceof Error ? modelError.message : "真实模型调用失败";
          pagePlan = generateSinglePage(
            payload.projectFacts,
            payload.pagePlan,
            payload.pageId,
          );
          modelNode = {
            node: "page_generation",
            execution: "local_fallback",
            model_calls: 0,
            fallback_reason: reason,
            output: pagePlan.pages.find(
              (page) => page.page_id === payload.pageId,
            ),
          };
        }
      } else {
        pagePlan = generateSinglePage(
          payload.projectFacts,
          payload.pagePlan,
          payload.pageId,
        );
        modelNode = {
          node: "page_generation",
          execution: "local_fallback",
          model_calls: 0,
          fallback_reason: "缺少 OPENAI_API_KEY。",
          output: pagePlan.pages.find(
            (page) => page.page_id === payload.pageId,
          ),
        };
      }
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
        modelName: getModelRuntime().model,
      });
    }

    if (payload.action === "audit") {
      let pagePlan: DesignReportPagePlan;
      let modelNode: NodeOutput;
      if (getModelRuntime().configured) {
        try {
          const modeled = await auditPagesWithModel(
            payload.projectFacts,
            payload.pagePlan,
          );
          pagePlan = modeled.pagePlan;
          modelNode = {
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
        } catch (modelError) {
          const reason =
            modelError instanceof Error ? modelError.message : "真实模型调用失败";
          pagePlan = auditGeneratedPages(
            payload.projectFacts,
            payload.pagePlan,
          );
          modelNode = {
            node: "consistency_audit",
            execution: "local_fallback",
            model_calls: 0,
            fallback_reason: reason,
            output: pagePlan.audit_report,
          };
        }
      } else {
        pagePlan = auditGeneratedPages(
          payload.projectFacts,
          payload.pagePlan,
        );
        modelNode = {
          node: "consistency_audit",
          execution: "local_fallback",
          model_calls: 0,
          fallback_reason: "缺少 OPENAI_API_KEY。",
          output: pagePlan.audit_report,
        };
      }
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
        modelName: getModelRuntime().model,
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Pipeline failed.",
      },
      { status: 400 },
    );
  }
}
