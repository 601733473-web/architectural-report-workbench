import type { DesignReportProjectFacts } from "@/app/generated/contracts";
import { projectFactsSchema } from "@/app/generated/schema-data";
import {
  createStructuredResponse,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import { GATE_B_PROPOSAL_PROMPT } from "@/app/lib/model-prompts";
import {
  createLocalSmallModeDesignDirectionProposal,
  smallModeDesignDirectionPrompt,
} from "@/app/lib/small-mode-design-directions";
import { isSmallBuildingMode } from "@/app/lib/task-mode";
import {
  createLocalGateBProposal,
  gateBBriefFacts,
  sanitizeGateBProposal,
  upsertGateBProposal,
  type GateBProposal,
} from "@/app/lib/gate-b-proposals";

const factProperties = projectFactsSchema.properties as Record<
  string,
  unknown
>;
const gateBProposalSchema = (
  factProperties.gate_b_proposals as {
    items: Record<string, unknown>;
  }
).items;

type CachedProposal = {
  proposal: GateBProposal;
  call: Awaited<ReturnType<typeof createStructuredResponse>>["call"];
};

const gateBProposalCache = (() => {
  const root = globalThis as typeof globalThis & {
    __ARCH_REPORT_GATE_B_CACHE__?: Map<
      string,
      { createdAt: number; promise: Promise<CachedProposal> }
    >;
  };
  return (root.__ARCH_REPORT_GATE_B_CACHE__ ??= new Map());
})();

function pruneGateBProposalCache() {
  const expiry = Date.now() - 10 * 60_000;
  for (const [key, entry] of gateBProposalCache) {
    if (entry.createdAt < expiry) gateBProposalCache.delete(key);
  }
  while (gateBProposalCache.size > 24) {
    const oldest = gateBProposalCache.keys().next().value;
    if (typeof oldest !== "string") break;
    gateBProposalCache.delete(oldest);
  }
}

export async function generateGateBProposalWithModel(
  projectFacts: DesignReportProjectFacts,
  missingItemId: string,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const isSmallDirection =
    isSmallBuildingMode(projectFacts.task_mode ?? "large_public_building") &&
    missingItemId === "M_SMALL_DESIGN_DIRECTION";
  const baseline = isSmallDirection
    ? createLocalSmallModeDesignDirectionProposal(projectFacts)
    : createLocalGateBProposal(projectFacts, missingItemId);
  const evidence = gateBBriefFacts(
    projectFacts,
    baseline.missing_label,
  ).map((fact) => ({
    fact_id: fact.fact_id,
    field_path: fact.field_path,
    value_raw: fact.value_raw,
    status: fact.status,
    source_page: fact.source.page,
    source_quote: fact.source.quote.slice(0, 240),
  }));
  const compactBaseline = {
    ...baseline,
    options: baseline.options.slice(0, isSmallDirection ? 3 : 2).map((option) => ({
      option_id: option.option_id,
      title: option.title,
      summary: option.summary,
      design_moves: option.design_moves,
    })),
  };
  const cacheKey = JSON.stringify({
    missingItemId,
    evidence: evidence.map((fact) => [
      fact.fact_id,
      fact.value_raw,
      fact.status,
    ]),
    model: runtimeOverride?.model,
    baseUrl: runtimeOverride?.baseUrl,
  });
  pruneGateBProposalCache();
  let cached = gateBProposalCache.get(cacheKey);
  const cacheHit = Boolean(cached);
  if (!cached) {
    const promise = (async (): Promise<CachedProposal> => {
      const response = await createStructuredResponse<GateBProposal>({
        name: isSmallDirection
          ? "small_mode_design_directions"
          : "gate_b_design_proposal",
        schema: gateBProposalSchema,
        instructions: isSmallDirection
          ? smallModeDesignDirectionPrompt(projectFacts)
          : GATE_B_PROPOSAL_PROMPT,
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              missing_item: {
                missing_item_id: baseline.missing_item_id,
                missing_label: baseline.missing_label,
              },
              current_project_task_brief_facts: evidence,
              local_safe_baseline: compactBaseline,
              output_count: isSmallDirection ? 3 : 2,
              policy:
                "选项是待确认的设计方向，不是带原文出处的项目事实；不得写入 facts。",
            }),
          },
        ],
        reasoningEffort: "low",
        runtimeOverride,
        timeoutMs: 60_000,
        maxAttempts: 1,
      });
      return {
        proposal: sanitizeGateBProposal(
          response.value,
          baseline,
          projectFacts,
        ),
        call: response.call,
      };
    })();
    cached = { createdAt: Date.now(), promise };
    gateBProposalCache.set(cacheKey, cached);
    promise.catch(() => gateBProposalCache.delete(cacheKey));
  }
  const modeled = await cached.promise;
  const proposal = sanitizeGateBProposal(
    modeled.proposal,
    baseline,
    projectFacts,
  );
  return {
    projectFacts: upsertGateBProposal(projectFacts, proposal),
    proposal,
    call: modeled.call,
    cacheHit,
  };
}
