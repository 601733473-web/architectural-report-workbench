import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import { pagePlanSchema } from "@/app/generated/schema-data";
import {
  createStructuredResponse,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import {
  VISUAL_REFERENCE_RERANK_PROMPT,
} from "@/app/lib/model-prompts";
import {
  createVisualDraft,
  createVisualImageSlots,
  createReferenceCrop,
  createSlotReferenceCrop,
  createVisualTask,
  getVisualImageSuitability,
  isSystemRenderingPage,
  type VisualIntent,
  type VisualTask,
} from "@/app/lib/visual-task";
import {
  isMetricBoundaryPage,
  isSystemRenderingCutawayReference,
  METRIC_BOUNDARY_REFERENCE_VISUAL_ID,
  matchVisualReferences,
  visualReferenceEntriesById,
} from "@/app/lib/visual-reference";
import {
  isProjectUnderstandingPage,
  PROJECT_UNDERSTANDING_ALLOWED_VISUAL_TYPES,
  visualTypeAllowedInProjectUnderstanding,
} from "@/app/lib/report-chapter-policy";

const visualTaskSchema = (
  pagePlanSchema.properties.pages.items.properties as Record<
    string,
    unknown
  >
).visual_task as Record<string, unknown>;
const visualTaskProperties = visualTaskSchema.properties as Record<
  string,
  unknown
>;
function visualReferenceDecisionSchema(
  candidateIds: string[],
  slotIds: string[],
) {
  const referenceSelection = structuredClone(
    visualTaskProperties.reference_selection,
  ) as {
    properties?: Record<string, unknown>;
  };
  referenceSelection.properties = {
    ...(referenceSelection.properties ?? {}),
    status: { type: "string", const: "matched" },
    selection_method: {
      type: "string",
      const: "model_semantic_rerank",
    },
    selected_visual_id: {
      type: "string",
      enum: candidateIds,
    },
  };
  return {
    type: "object",
    required: [
      "visual_intent",
      "reference_selection",
      "slot_reference_selections",
    ],
    properties: {
      visual_intent: visualTaskProperties.visual_intent,
      reference_selection: referenceSelection,
      slot_reference_selections: {
        type: "array",
        minItems: slotIds.length,
        maxItems: slotIds.length,
        items: {
          type: "object",
          required: [
            "slot_id",
            "selected_visual_id",
            "confidence",
            "internal_rationale",
          ],
          properties: {
            slot_id: { type: "string", enum: slotIds },
            selected_visual_id: {
              type: "string",
              enum: candidateIds,
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            internal_rationale: { type: "string" },
          },
        },
      },
    },
  };
}

type ReferenceSelection = NonNullable<
  VisualTask["reference_selection"]
>;
type VisualReferenceDecision = {
  visual_intent: VisualIntent;
  reference_selection: ReferenceSelection;
  slot_reference_selections: Array<{
    slot_id: string;
    selected_visual_id: string;
    confidence: number;
    internal_rationale: string;
  }>;
};

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function containsSerializedVisualFields(value: string) {
  const normalized = value.trim();
  return (
    /^[\[{]/.test(normalized) ||
    /["']?(?:graphic_elements|search_focus|layout_logic|visual_intent|evidence_needed|relationship_to_show)["']?\s*[:：]/i.test(
      normalized,
    )
  );
}

function nonEmptyString(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /[\p{L}\p{N}\u3400-\u9fff]/u.test(trimmed) &&
    !containsSerializedVisualFields(trimmed)
    ? trimmed
    : fallback;
}

function stringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(
      (item) =>
        /[\p{L}\p{N}\u3400-\u9fff]/u.test(item) &&
        !containsSerializedVisualFields(item),
    );
  return items.length ? unique(items) : fallback;
}

function sanitizeVisualIntent(
  value: VisualIntent | undefined,
  baseline: VisualIntent,
): VisualIntent {
  const relationships = new Set<VisualIntent["relationship_to_show"]>([
    "sequence",
    "comparison",
    "hierarchy",
    "spatial_relationship",
    "evidence_mapping",
    "atmosphere",
    "index",
  ]);
  return {
    conclusion_to_prove: nonEmptyString(
      value?.conclusion_to_prove,
      baseline.conclusion_to_prove,
    ),
    relationship_to_show:
      value && relationships.has(value.relationship_to_show)
        ? value.relationship_to_show
        : baseline.relationship_to_show,
    evidence_needed: stringList(
      value?.evidence_needed,
      baseline.evidence_needed,
    ).slice(0, 8) as VisualIntent["evidence_needed"],
    graphic_elements: stringList(
      value?.graphic_elements,
      baseline.graphic_elements,
    ).slice(0, 8) as VisualIntent["graphic_elements"],
    search_focus: stringList(
      value?.search_focus,
      baseline.search_focus,
    ).slice(0, 8) as VisualIntent["search_focus"],
    layout_logic: nonEmptyString(
      value?.layout_logic,
      baseline.layout_logic,
    ),
  };
}

function allowedVisualTypesForSlot(
  pageType: DesignReportPagePlan["pages"][number]["page_type"],
  slotIndex: number,
  projectUnderstanding = false,
  slotCount = 1,
) {
  if (projectUnderstanding) {
    return PROJECT_UNDERSTANDING_ALLOWED_VISUAL_TYPES;
  }
  if (slotIndex === 0) {
    if (pageType === "plan") return new Set(["floor_plan"]);
    if (pageType === "masterplan") {
      return new Set(["masterplan", "site_map"]);
    }
    if (pageType === "section") return new Set(["section"]);
  }
  if (pageType === "plan") {
    return new Set([
      "floor_plan",
      "analysis_diagram",
      "rendering",
      "photo",
    ]);
  }
  if (pageType === "masterplan") {
    return new Set([
      "masterplan",
      "site_map",
      "analysis_diagram",
      "rendering",
    ]);
  }
  if (pageType === "section") {
    return new Set([
      "section",
      "analysis_diagram",
      "rendering",
    ]);
  }
  if (pageType === "concept") {
    return slotCount > 1
      ? new Set(["concept_diagram", "analysis_diagram"])
      : new Set(["rendering", "concept_diagram"]);
  }
  if (pageType === "strategy") {
    return new Set(["analysis_diagram", "concept_diagram", "masterplan"]);
  }
  if (pageType === "comparison") {
    return new Set([
      "concept_diagram",
      "analysis_diagram",
      "rendering",
      "masterplan",
    ]);
  }
  return undefined;
}

export async function selectVisualReferenceWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  pageId: string,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const result = structuredClone(pagePlan);
  const page = result.pages.find(
    (candidate) => candidate.page_id === pageId,
  );
  if (!page?.visual_task) throw new Error(`Page not found: ${pageId}`);

  const task = page.visual_task;
  const projectUnderstanding = isProjectUnderstandingPage(pagePlan, page);
  const systemRendering = isSystemRenderingPage(page);

  const savedEntries = task.visual_reference_refs
    .map((visualId) => visualReferenceEntriesById.get(visualId))
    .filter((entry) => entry?.crop_quality.accepted);
  const candidateLimit = Math.min(
    12,
    Math.max(8, task.image_slots.length * 3),
  );
  const supplementedEntries = matchVisualReferences(
    page,
    projectFacts,
    Math.max(12, task.image_slots.length * 4),
    task.visual_intent,
  ).map((match) => match.entry);
  const slotSpecificMatches = new Map(
    task.image_slots.map((slot, slotIndex) => {
      const allowedTypes = allowedVisualTypesForSlot(
        page.page_type,
        slotIndex,
        projectUnderstanding,
        task.image_slots.length,
      );
      const matches = matchVisualReferences(page, projectFacts, 12, {
        relationship_to_show: task.visual_intent.relationship_to_show,
        evidence_needed: [slot.label],
        graphic_elements: [slot.label],
        search_focus: [slot.label],
        slot_focus_only: true,
        preserve_source_diversity: false,
      }).filter(
        (match) => !allowedTypes || allowedTypes.has(match.entry.visual_type),
      );
      return [slot.slot_id, matches];
    }),
  );
  // Interleave per-slot candidates before the page-level list. A page-level
  // query tends to return several generally similar concept diagrams while
  // omitting the one circulation, public-space or climate reference needed by
  // an individual frame. Round-robin keeps every frame represented without
  // increasing the model prompt beyond the existing candidate limit.
  const slotSpecificEntries: typeof supplementedEntries = [];
  for (let rank = 0; rank < 5; rank += 1) {
    for (const slot of task.image_slots) {
      const entry = slotSpecificMatches.get(slot.slot_id)?.[rank]?.entry;
      if (
        entry &&
        !slotSpecificEntries.some(
          (candidate) => candidate.visual_id === entry.visual_id,
        )
      ) {
        slotSpecificEntries.push(entry);
      }
    }
  }
  const candidatePool = [
    ...slotSpecificEntries,
    ...supplementedEntries,
    ...savedEntries,
  ].filter(
    (entry, index, entries) =>
      Boolean(entry) &&
      (!systemRendering ||
        isSystemRenderingCutawayReference(entry!)) &&
      (!projectUnderstanding ||
        visualTypeAllowedInProjectUnderstanding(entry!.visual_type)) &&
      entries.findIndex((candidate) => candidate?.visual_id === entry?.visual_id) === index,
  );
  const candidateEntries = task.image_slots
    .reduce<typeof candidatePool>((selected, _slot, slotIndex) => {
      const allowedVisualTypes = allowedVisualTypesForSlot(
        page.page_type,
        slotIndex,
        projectUnderstanding,
        task.image_slots.length,
      );
      if (!allowedVisualTypes) return selected;
      const compatible = candidatePool.find(
        (entry) =>
          allowedVisualTypes.has(entry!.visual_type) &&
          !selected.some(
            (candidate) => candidate!.visual_id === entry!.visual_id,
          ),
      );
      return compatible ? [...selected, compatible] : selected;
    }, []);
  for (const entry of candidatePool) {
    if (candidateEntries.length >= candidateLimit) break;
    if (
      !candidateEntries.some(
        (candidate) => candidate!.visual_id === entry!.visual_id,
      )
    ) {
      candidateEntries.push(entry);
    }
  }
  candidateEntries.splice(candidateLimit);
  const candidates = candidateEntries
    .map((entry, index) => ({
      visual_id: entry!.visual_id,
      retrieval_rank: index + 1,
      page_type: entry!.page_type,
      page_role: entry!.page_role,
      topics: entry!.topics,
      page_intents: entry!.page_intents,
      visual_type: entry!.visual_type,
      evidence_types: entry!.evidence_types,
      layout_family: entry!.layout_family,
      required_current_assets: entry!.required_current_assets,
      quality: entry!.quality,
      crop_quality_score: entry!.crop_quality.score,
      semantic_summary: entry!.retrieval_text.slice(0, 240),
    }));
  if (!candidates.length) {
    throw new Error("视觉素材库没有可供语义匹配的候选");
  }

  const facts = page.fact_refs
    .map((factId) =>
      projectFacts.facts.find((fact) => fact.fact_id === factId),
    )
    .filter(Boolean)
    .map((fact) => ({
      field_path: fact!.field_path,
      value_raw: fact!.value_raw,
      source_role: fact!.source_role,
    }));
  const evaluatedAt = new Date().toISOString();
  const candidateIds = candidates.map((candidate) => candidate.visual_id);
  const slotCandidateIds = new Map(
    task.image_slots.map((slot) => [
      slot.slot_id,
      (slotSpecificMatches.get(slot.slot_id) ?? [])
        .map((match) => match.entry.visual_id)
        .filter((visualId) => candidateIds.includes(visualId)),
    ]),
  );
  const requestedSlotIds = task.image_slots.map((slot) => slot.slot_id);
  const response = await createStructuredResponse<VisualReferenceDecision>({
    name: "visual_reference_decision",
    schema: visualReferenceDecisionSchema(
      candidateIds,
      requestedSlotIds,
    ),
    instructions: VISUAL_REFERENCE_RERANK_PROMPT,
    content: [
      {
        type: "input_text",
        text: JSON.stringify({
          page: {
            section_title:
              pagePlan.sections.find(
                (section) => section.section_id === page.section_id,
              )?.title_zh ?? "",
            page_type: page.page_type,
            headline_zh: page.headline_zh,
            core_message: page.core_message,
            visual_requirements: page.visual_requirements,
          },
          first_principles_visual_intent: task.visual_intent,
          image_slots: task.image_slots.map((slot) => ({
            slot_id: slot.slot_id,
            label: slot.label,
            purpose: slot.purpose,
            aspect_ratio: slot.aspect_ratio,
          })),
          slot_match_requirements: task.image_slots.map((slot, index) => {
            const allowedVisualTypes = allowedVisualTypesForSlot(
              page.page_type,
              index,
              projectUnderstanding,
              task.image_slots.length,
            );
            return {
              slot_id: slot.slot_id,
              subclaim_to_prove: slot.label,
              required_content: slot.purpose,
              semantic_focus: slot.prompt_focus.slice(0, 180),
              allowed_visual_types: allowedVisualTypes
                ? [...allowedVisualTypes]
                : [],
              allowed_visual_ids: (() => {
                const slotIds = slotCandidateIds.get(slot.slot_id) ?? [];
                const typeCompatibleIds = allowedVisualTypes
                  ? candidates
                      .filter((candidate) =>
                        allowedVisualTypes.has(candidate.visual_type),
                      )
                      .map((candidate) => candidate.visual_id)
                  : candidateIds;
                const focusedIds = slotIds.filter((visualId) =>
                  typeCompatibleIds.includes(visualId),
                );
                return focusedIds.length ? focusedIds : typeCompatibleIds;
              })(),
            rejection_rule:
                systemRendering
                  ? "本页是局部立面 system rendering，只能选择局部立面系统剖切视角；同系统外观视角只能用于双图对照页，不能替代当前剖切主图；严禁整栋 section perspective、建筑体量轴测、城市鸟瞰和功能分区效果图。"
                : projectUnderstanding
                  ? "本页属于第一章项目理解，只能使用区位图、现状照片、任务解读、指标或关系分析图；严禁总平面、楼层平面、立面、剖面和技术成果图。"
                  : index === 0 && allowedVisualTypes
                  ? `主图必须属于 ${[...allowedVisualTypes].join(" / ")}，不得用照片、效果图或无关页代替图纸。`
                  : "必须从允许候选中选出内容与构图相对最接近的一张作为视觉草案参考，并用置信度表达匹配质量；不得返回空值。",
            };
          }),
          current_project_facts: facts,
          candidate_visual_references: candidates,
          evaluated_at: evaluatedAt,
        }),
      },
    ],
    reasoningEffort: "low",
    runtimeOverride,
    timeoutMs: 60_000,
    maxAttempts: 1,
  });

  const validCandidateIds = new Set(
    candidates.map((candidate) => candidate.visual_id),
  );
  const visualIntent = sanitizeVisualIntent(
    response.value.visual_intent,
    task.visual_intent,
  );
  // The page framework owns slot geometry. Semantic reranking may replace the
  // image inside a slot, but must never recreate slot count, order, labels or
  // aspect ratios from the model's revised visual intent.
  const imageSlots = task.image_slots.length
    ? structuredClone(task.image_slots)
    : createVisualImageSlots(page, task.visual_intent);
  if (!imageSlots.length) {
    throw new Error("当前页面没有需要素材库填充的图片槽");
  }
  const rawSlotSelections = Array.isArray(
    response.value.slot_reference_selections,
  )
    ? response.value.slot_reference_selections
    : [];
  const rawConfidence = Number(
    response.value.reference_selection.confidence,
  );
  const normalizedOverallConfidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0;
  const usedVisualIds = new Set<string>();
  const slotReferenceCrops = imageSlots.flatMap((slot, slotIndex) => {
    const allowedVisualTypes = allowedVisualTypesForSlot(
      page.page_type,
      slotIndex,
      projectUnderstanding,
      imageSlots.length,
    );
    const compatibleCandidates = allowedVisualTypes
      ? candidates.filter((candidate) =>
          allowedVisualTypes.has(candidate.visual_type),
        )
      : candidates;
    const modeledSelection =
      rawSlotSelections.find((item) => item?.slot_id === slot.slot_id) ??
      rawSlotSelections[slotIndex];
    const modeledVisualId =
      typeof modeledSelection?.selected_visual_id === "string"
        ? modeledSelection.selected_visual_id.trim()
        : "";
    let selectedVisualId: string | undefined =
      validCandidateIds.has(modeledVisualId) &&
      compatibleCandidates.some(
        (candidate) => candidate.visual_id === modeledVisualId,
      )
      ? modeledVisualId
      : compatibleCandidates.find(
          (candidate) => !usedVisualIds.has(candidate.visual_id),
        )?.visual_id;
    if (
      isMetricBoundaryPage(page) &&
      slotIndex === 0 &&
      compatibleCandidates.some(
        (candidate) =>
          candidate.visual_id === METRIC_BOUNDARY_REFERENCE_VISUAL_ID,
      )
    ) {
      selectedVisualId = METRIC_BOUNDARY_REFERENCE_VISUAL_ID;
    }
    if (
      selectedVisualId &&
      usedVisualIds.has(selectedVisualId) &&
      compatibleCandidates.length >= imageSlots.length
    ) {
      selectedVisualId = compatibleCandidates.find(
        (candidate) => !usedVisualIds.has(candidate.visual_id),
      )?.visual_id;
    }
    if (!selectedVisualId) return [];
    usedVisualIds.add(selectedVisualId);
    const crop = createSlotReferenceCrop(
      task,
      slot.slot_id,
      selectedVisualId,
    );
    if (!crop) {
      return [];
    }
    return [crop];
  });
  const selectedVisualId = slotReferenceCrops[0]?.visual_id ?? null;
  const confidence = normalizedOverallConfidence;
  const selection: ReferenceSelection = {
    status: "matched",
    selection_method: "model_semantic_rerank",
    selected_visual_id: selectedVisualId,
    confidence,
    internal_rationale: nonEmptyString(
      response.value.reference_selection.internal_rationale,
      "模型依据本页结论、关系、证据需求与 Graphic 元素，从候选中为每个图框选择相对最合适的视觉草案参考。",
    ),
    evaluated_at: evaluatedAt,
  };

  const {
    reference_crop: previousReferenceCrop,
    slot_reference_crops: previousSlotReferenceCrops,
    ...taskWithoutReferenceCrop
  } = task;
  void previousReferenceCrop;
  void previousSlotReferenceCrops;
  const referenceCrop = selectedVisualId
    ? createReferenceCrop(task, selectedVisualId)
    : undefined;
  const updatedTask = {
    ...taskWithoutReferenceCrop,
    visual_intent: visualIntent,
    primary_visual: visualIntent.graphic_elements[0],
    image_slots: imageSlots,
    visual_reference_refs: candidateIds,
  } as VisualTask;
  page.visual_task = {
    ...updatedTask,
    draft_output: createVisualDraft(updatedTask),
    reference_selection: selection,
    ...(referenceCrop ? { reference_crop: referenceCrop } : {}),
    ...(slotReferenceCrops.length
      ? {
          slot_reference_crops:
            slotReferenceCrops as unknown as NonNullable<
              VisualTask["slot_reference_crops"]
            >,
        }
      : {}),
    conversation: [
      ...task.conversation,
      {
        round:
          Math.max(0, ...task.conversation.map((item) => item.round)) +
          1,
        role: "assistant",
        content: slotReferenceCrops.length
          ? `已由模型完成素材库语义匹配，并为 ${slotReferenceCrops.length}/${imageSlots.length} 个图片槽填入可替换的视觉草案参考。`
          : "模型接口没有返回有效候选，请重新匹配。",
      },
    ],
  };

  return { pagePlan: result, call: response.call };
}

type BatchVisualReferenceDecision = {
  page_selections: Array<{
    page_id: string;
    slot_selections: Array<{
      slot_id: string;
      selected_visual_id: string;
      confidence: number;
    }>;
  }>;
};

export async function matchMissingVisualReferencesForExport(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const result = structuredClone(pagePlan);
  const contexts: Array<{
    page: DesignReportPagePlan["pages"][number];
    task: VisualTask;
    candidateIds: string[];
    allowedIdsBySlot: Map<string, string[]>;
    payload: Record<string, unknown>;
  }> = [];

  for (const page of result.pages) {
    if (!getVisualImageSuitability(page.page_type).eligible) continue;
    if (!page.visual_task) {
      page.visual_task = createVisualTask(projectFacts, page);
    }
    const task = page.visual_task;
    if (!task.image_slots.length) continue;
    const generatedSlotIds = new Set(
      task.generated_images?.map((image) => image.slot_id) ?? [],
    );
    const existingCrops =
      task.slot_reference_crops ??
      (task.reference_crop && task.image_slots[0]
        ? [
            {
              ...task.reference_crop,
              slot_id: task.image_slots[0].slot_id,
            },
          ]
        : []);
    const matchedSlotIds = new Set([
      ...generatedSlotIds,
      ...existingCrops.map((crop) => crop.slot_id),
    ]);
    if (
      task.image_slots.every((slot) => matchedSlotIds.has(slot.slot_id))
    ) {
      continue;
    }

    const projectUnderstanding = isProjectUnderstandingPage(
      result,
      page,
    );
    const systemRendering = isSystemRenderingPage(page);
    const candidateEntries = matchVisualReferences(
      page,
      projectFacts,
      Math.max(8, task.image_slots.length * 2),
      task.visual_intent,
    )
      .map((match) => match.entry)
      .filter(
        (entry) =>
          (!systemRendering ||
            isSystemRenderingCutawayReference(entry)) &&
          (!projectUnderstanding ||
            visualTypeAllowedInProjectUnderstanding(entry.visual_type)),
      );
    if (!candidateEntries.length) continue;
    const candidateIds = candidateEntries.map((entry) => entry.visual_id);
    const allowedIdsBySlot = new Map<string, string[]>();
    const slotPayload = task.image_slots.map((slot, slotIndex) => {
      const allowedTypes = allowedVisualTypesForSlot(
        page.page_type,
        slotIndex,
        projectUnderstanding,
        task.image_slots.length,
      );
      const allowedIds = allowedTypes
        ? candidateEntries
            .filter((entry) => allowedTypes.has(entry.visual_type))
            .map((entry) => entry.visual_id)
        : candidateIds;
      allowedIdsBySlot.set(
        slot.slot_id,
        allowedIds.length ? allowedIds : candidateIds,
      );
      return {
        slot_id: slot.slot_id,
        label: slot.label,
        purpose: slot.purpose,
        prompt_focus: slot.prompt_focus.slice(0, 180),
        allowed_visual_ids: allowedIds.length ? allowedIds : candidateIds,
        already_filled: matchedSlotIds.has(slot.slot_id),
      };
    });
    contexts.push({
      page,
      task,
      candidateIds,
      allowedIdsBySlot,
      payload: {
        page_id: page.page_id,
        display_page_number: page.display_page_number,
        page_type: page.page_type,
        headline_zh: page.headline_zh,
        core_message: page.core_message,
        visual_intent: task.visual_intent,
        image_slots: slotPayload,
        candidates: candidateEntries.map((entry) => ({
          visual_id: entry.visual_id,
          visual_type: entry.visual_type,
          topics: entry.topics,
          page_intents: entry.page_intents,
          evidence_types: entry.evidence_types,
          layout_family: entry.layout_family,
          semantic_summary: entry.retrieval_text.slice(0, 180),
          quality: entry.quality,
        })),
      },
    });
  }

  if (!contexts.length) {
    return { pagePlan: result, call: undefined, matchedPageIds: [] };
  }
  const pageIds = contexts.map((context) => context.page.page_id);
  const allCandidateIds = unique(
    contexts.flatMap((context) => context.candidateIds),
  );
  const response = await createStructuredResponse<BatchVisualReferenceDecision>({
    name: "visual_reference_export_batch",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["page_selections"],
      properties: {
        page_selections: {
          type: "array",
          minItems: 1,
          maxItems: contexts.length,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["page_id", "slot_selections"],
            properties: {
              page_id: { type: "string", enum: pageIds },
              slot_selections: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "slot_id",
                    "selected_visual_id",
                    "confidence",
                  ],
                  properties: {
                    slot_id: { type: "string" },
                    selected_visual_id: {
                      type: "string",
                      enum: allCandidateIds,
                    },
                    confidence: {
                      type: "number",
                      minimum: 0,
                      maximum: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    instructions: `你是建筑设计汇报的整册视觉编辑。一次完成所有页面图片槽的素材库语义匹配。
1. 每个图片槽只从该槽 allowed_visual_ids 中选择一项。
2. 首先理解页面核心结论和该槽要证明的具体关系，再选择内容与构图最匹配的参考；不要只按页面类型机械匹配。
3. 同一页面的多个槽尽量使用不同参考；整册也应避免同一素材反复出现，除非它确实最匹配。
4. 图纸主槽必须保持总图、平面、剖面等证据类型；分析和策略槽可使用分析图、场地图、渲染或照片，但必须逐槽吻合。
5. system rendering 单主图只允许局部立面系统剖切；同一系统外观视角仅可作为双图页辅图，严禁整栋功能分区、鸟瞰、体量轴测或 section perspective。
6. already_filled=true 的槽可以省略；不要输出候选之外的编号。`,
    content: [
      {
        type: "input_text",
        text: JSON.stringify({ pages: contexts.map((item) => item.payload) }),
      },
    ],
    reasoningEffort: "low",
    runtimeOverride,
    timeoutMs: 75_000,
    maxAttempts: 1,
  });

  const usedAcrossDeck = new Set<string>();
  const matchedPageIds: string[] = [];
  for (const context of contexts) {
    const { page, task, allowedIdsBySlot } = context;
    const existingCrops =
      task.slot_reference_crops ??
      (task.reference_crop && task.image_slots[0]
        ? [
            {
              ...task.reference_crop,
              slot_id: task.image_slots[0].slot_id,
            },
          ]
        : []);
    const generatedSlotIds = new Set(
      task.generated_images?.map((image) => image.slot_id) ?? [],
    );
    const modeledPage = response.value.page_selections.find(
      (selection) => selection.page_id === page.page_id,
    );
    const selectedInPage = new Set(existingCrops.map((crop) => crop.visual_id));
    const crops = [...existingCrops];
    for (const slot of task.image_slots) {
      if (
        generatedSlotIds.has(slot.slot_id) ||
        crops.some((crop) => crop.slot_id === slot.slot_id)
      ) {
        continue;
      }
      const allowedIds = allowedIdsBySlot.get(slot.slot_id) ?? [];
      const modeledId = modeledPage?.slot_selections.find(
        (selection) => selection.slot_id === slot.slot_id,
      )?.selected_visual_id;
      let selectedId =
        modeledId && allowedIds.includes(modeledId)
          ? modeledId
          : undefined;
      if (
        selectedId &&
        (selectedInPage.has(selectedId) || usedAcrossDeck.has(selectedId)) &&
        allowedIds.some(
          (id) => !selectedInPage.has(id) && !usedAcrossDeck.has(id),
        )
      ) {
        selectedId = undefined;
      }
      selectedId ??= allowedIds.find(
        (id) => !selectedInPage.has(id) && !usedAcrossDeck.has(id),
      );
      selectedId ??= allowedIds.find((id) => !selectedInPage.has(id));
      selectedId ??= allowedIds[0];
      if (!selectedId) continue;
      const crop = createSlotReferenceCrop(task, slot.slot_id, selectedId);
      if (!crop) continue;
      crops.push(crop);
      selectedInPage.add(selectedId);
      usedAcrossDeck.add(selectedId);
    }
    if (!crops.length) continue;
    const firstCrop = crops.find(
      (crop) => crop.slot_id === task.image_slots[0]?.slot_id,
    ) ?? crops[0];
    const firstReference = firstCrop
      ? createReferenceCrop(task, firstCrop.visual_id)
      : undefined;
    const updatedTask = {
      ...task,
      visual_reference_refs: unique([
        ...task.visual_reference_refs,
        ...context.candidateIds,
      ]),
      slot_reference_crops:
        crops as NonNullable<VisualTask["slot_reference_crops"]>,
      ...(firstReference ? { reference_crop: firstReference } : {}),
      reference_selection: {
        status: "matched",
        selection_method: "model_semantic_rerank",
        selected_visual_id: firstCrop?.visual_id ?? null,
        confidence: 0.75,
        internal_rationale:
          "导出前由模型一次性按页面结论、证据关系与图片槽语义完成整册参考匹配。",
        evaluated_at: new Date().toISOString(),
      },
      conversation: [
        ...task.conversation,
        {
          round:
            Math.max(0, ...task.conversation.map((item) => item.round)) + 1,
          role: "assistant" as const,
          content: `导出前视觉补全已完成，为 ${crops.length}/${task.image_slots.length} 个图框填入语义匹配参考。`,
        },
      ],
    } as VisualTask;
    updatedTask.draft_output = createVisualDraft(updatedTask);
    page.visual_task = updatedTask;
    matchedPageIds.push(page.page_id);
  }

  return {
    pagePlan: result,
    call: response.call,
    matchedPageIds,
  };
}
