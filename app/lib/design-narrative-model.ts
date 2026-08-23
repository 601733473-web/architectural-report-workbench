import type {
  DesignReportNarrative,
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import { designNarrativeSchema } from "@/app/generated/schema-data";
import {
  createStructuredResponse,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import { DESIGN_NARRATIVE_PROMPT } from "@/app/lib/model-prompts";
import type { InputDocument } from "@/app/lib/pipeline";
import { assertDesignNarrative } from "@/app/lib/schema-validator";

const MAX_SOURCE_TEXT_CHARACTERS = 900_000;

function sourceDocumentsPayload(documents: InputDocument[]) {
  const eligible = documents.filter((document) =>
    ["authoritative", "proposal"].includes(document.role),
  );
  const perDocumentLimit = Math.max(
    80_000,
    Math.floor(
      MAX_SOURCE_TEXT_CHARACTERS / Math.max(eligible.length, 1),
    ),
  );
  return eligible.map((document) => ({
    document_id: document.document_id,
    file_name: document.file_name,
    role: document.role,
    version_or_date: document.version_or_date,
    page_count: document.page_count ?? null,
    extracted_text: document.text.slice(0, perDocumentLimit),
    text_truncated: document.text.length > perDocumentLimit,
  }));
}

function visiblePagePayload(pagePlan: DesignReportPagePlan) {
  return pagePlan.pages.map((page) => ({
    page_id: page.page_id,
    display_page_number: page.display_page_number,
    section_id: page.section_id,
    page_type: page.page_type,
    headline_zh: page.headline_zh,
    core_message: page.core_message,
    body_zh: page.body_zh || page.body_copy,
    diagram_labels: page.diagram_labels,
    callouts: page.callouts,
    fact_refs: page.fact_refs,
    unresolved_items: page.unresolved_items,
    missing_information: page.missing_information,
  }));
}

function validReferenceSet(values: string[], allowed: Set<string>) {
  return [...new Set(values.filter((value) => allowed.has(value)))];
}

function sanitizeNarrativeReferences(
  narrative: DesignReportNarrative,
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  sourceDocumentIds: string[],
) {
  const factIds = new Set(
    projectFacts.facts
      .filter((fact) => fact.status !== "superseded")
      .map((fact) => fact.fact_id),
  );
  const proposalIds = new Set(
    (projectFacts.gate_b_proposals ?? []).map(
      (proposal) => proposal.missing_item_id,
    ),
  );
  const pageIds = new Set(pagePlan.pages.map((page) => page.page_id));
  const sanitizeRefs = <
    T extends {
      fact_refs: string[];
      proposal_refs: string[];
      page_refs: string[];
    },
  >(
    value: T,
  ): T => ({
    ...value,
    fact_refs: validReferenceSet(value.fact_refs, factIds),
    proposal_refs: validReferenceSet(
      value.proposal_refs,
      proposalIds,
    ),
    page_refs: validReferenceSet(value.page_refs, pageIds),
  });

  const knownGaps = [
    ...narrative.coverage.known_gaps,
    ...projectFacts.missing_items.map((item) => item.description),
    ...projectFacts.conflicts.map(
      (conflict) =>
        `${conflict.field_path}：${
          conflict.resolution_note || "存在尚未解决的来源冲突"
        }`,
    ),
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  const result = {
    ...narrative,
    executive_concept: sanitizeRefs(narrative.executive_concept),
    chapters: narrative.chapters
      .sort((left, right) => left.order - right.order)
      .map((chapter, index) => ({
        ...sanitizeRefs(chapter),
        chapter_id: `N${String(index + 1).padStart(2, "0")}`,
        order: index + 1,
        subsections: chapter.subsections.map(sanitizeRefs),
      })),
    value_summary: narrative.value_summary.map(sanitizeRefs),
    coverage: {
      source_document_ids: [...new Set(sourceDocumentIds)],
      fact_refs: [...factIds],
      proposal_refs: [...proposalIds],
      page_refs: [...pageIds],
      known_gaps: [...new Set(knownGaps)],
    },
  } as unknown as DesignReportNarrative;
  assertDesignNarrative(result);
  return result;
}

export async function generateDesignNarrativeWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  documents: InputDocument[],
  runtimeOverride?: ModelRuntimeOverride,
) {
  const sourceDocuments = sourceDocumentsPayload(documents);
  if (!sourceDocuments.length) {
    throw new Error(
      "设计说明生成需要任务书或方案 PDF 的文本内容。",
    );
  }
  const activeFacts = projectFacts.facts.filter(
    (fact) => fact.status !== "superseded",
  );
  const response = await createStructuredResponse<DesignReportNarrative>({
    name: "design_narrative",
    schema: designNarrativeSchema as unknown as Record<string, unknown>,
    instructions: DESIGN_NARRATIVE_PROMPT,
    content: [
      {
        type: "input_text",
        text: JSON.stringify({
          document_purpose: "建筑概念方案正式设计说明",
          target_length_zh_characters: "900-1100（约 1000 字正文，不含附录）",
          source_documents: sourceDocuments,
          project_facts: {
            project_id: projectFacts.project_id,
            project_name_anonymized:
              projectFacts.project_name_anonymized,
            facts: activeFacts,
            conflicts: projectFacts.conflicts,
            missing_items: projectFacts.missing_items,
            gate_report: projectFacts.gate_report,
          },
          design_proposals: projectFacts.gate_b_proposals ?? [],
          report_framework: {
            narrative_claim: pagePlan.narrative_claim,
            sections: pagePlan.sections,
            pages: visiblePagePayload(pagePlan),
          },
        }),
      },
    ],
    reasoningEffort: "high",
    runtimeOverride,
    timeoutMs: 180_000,
    maxAttempts: 1,
  });
  if (
    response.value.executive_concept.keywords_zh.length < 3 ||
    response.value.chapters.length < 8 ||
    response.value.value_summary.length < 3 ||
    response.value.chapters.some(
      (chapter) =>
        !chapter.subsections.length ||
        chapter.subsections.some(
          (subsection) => !subsection.paragraphs_zh.length,
        ),
    )
  ) {
    throw new Error(
      "模型返回的设计说明篇章过少，未达到完整设计说明要求。",
    );
  }
  const narrative = sanitizeNarrativeReferences(
    response.value,
    projectFacts,
    pagePlan,
    sourceDocuments.map((document) => document.document_id),
  );
  return { narrative, call: response.call };
}
