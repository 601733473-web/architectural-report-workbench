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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as PipelineRequest;

    if (payload.action === "run") {
      const result = runPipeline(
        payload.documents,
        payload.projectId ?? "SINGLE_PROJECT",
      );
      assertProjectFacts(result.projectFacts);
      assertPagePlan(result.pagePlan);
      return NextResponse.json(result);
    }

    assertProjectFacts(payload.projectFacts);
    assertPagePlan(payload.pagePlan);

    if (payload.action === "generate_page") {
      const pagePlan = generateSinglePage(
        payload.projectFacts,
        payload.pagePlan,
        payload.pageId,
      );
      assertPagePlan(pagePlan);
      return NextResponse.json({
        projectFacts: payload.projectFacts,
        pagePlan,
        nodeOutputs: [
          ...(payload.nodeOutputs ?? []),
          {
            node: "page_generation",
            execution: "local_rule",
            model_calls: 0,
            output: pagePlan.pages.find(
              (page) => page.page_id === payload.pageId,
            ),
          },
        ],
        modelCallCount: 0,
      });
    }

    if (payload.action === "audit") {
      const pagePlan = auditGeneratedPages(
        payload.projectFacts,
        payload.pagePlan,
      );
      assertPagePlan(pagePlan);
      return NextResponse.json({
        projectFacts: payload.projectFacts,
        pagePlan,
        nodeOutputs: [
          ...(payload.nodeOutputs ?? []),
          {
            node: "consistency_audit",
            execution: "local_rule",
            model_calls: 0,
            output: pagePlan.audit_report,
          },
        ],
        modelCallCount: 0,
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

