"use client";

import type { InputDocument, PipelineResult } from "@/app/lib/pipeline";
import {
  createVisualTask,
  isSystemRenderingPage,
  legacyGeneratedImageFromSlots,
  migrateLegacyVisualReferenceSelections,
  normalizeSingleSectionImagePage,
} from "@/app/lib/visual-task";
import { normalizeProjectUnderstandingChapter } from "@/app/lib/report-chapter-policy";
import { normalizePageHeadline } from "@/app/lib/presentation-copy";

const DATABASE_NAME = "architectural-report-agent";
const DATABASE_VERSION = 2;
const STORE_NAME = "project-drafts";
const ACTIVE_PROJECT_KEY = "active-single-project";
const PROJECT_INDEX_KEY = "project-index-v2";
const PROJECT_KEY_PREFIX = "project-v2:";
const SYSTEM_RENDERING_RECIPE_ID = "HQE_RX_068";

const p20SpatialMoves = [
  "连续基座连接地铁与绿地",
  "三塔错位形成高低梯度",
  "空中庭院与连桥延伸公共界面",
  "立体绿化回应热湿气候",
] as const;

function normalizeP20ConceptSequencePage(
  page: PipelineResult["pagePlan"]["pages"][number],
  projectFacts: PipelineResult["projectFacts"],
) {
  const isP20 =
    page.display_page_number === 20 || /^P0*20$/iu.test(page.page_id);
  if (!isP20 || page.page_type !== "concept") return page;

  const conceptFact = projectFacts.facts.find(
    (fact) =>
      fact.field_path === "proposal.design_concept" &&
      fact.status !== "superseded" &&
      fact.status !== "conflict",
  );
  const conceptName =
    String(conceptFact?.value_raw ?? "").trim() ||
    page.headline_zh.match(/从四项条件推导(.+)/u)?.[1]?.trim() ||
    "生态垂直聚落";
  const conceptNameEn =
    (page.headline_en ?? "").match(/^DERIVING\s+(.+?)\s+FROM\b/iu)?.[1]?.trim() ||
    "ECOLOGICAL VERTICAL VILLAGE";

  const normalizedPage = {
    ...page,
    headline_zh: `从四项条件推导${conceptName}`,
    headline_en: `DERIVING ${conceptNameEn} FROM FOUR CONDITIONS TO FOUR SPATIAL MOVES`,
    core_message: `高密度复合功能、运营独立、公共空间连续性和热湿气候四项条件，分别转化为${p20SpatialMoves.join("、")}，逐步形成${conceptName}的空间组织。`,
    core_message_en:
      "Four project conditions become four spatial moves: a continuous podium linking metro and park, staggered towers with a height gradient, sky gardens and bridges extending the public realm, and vertical greenery responding to the hot-humid climate.",
    visual_requirements: [...p20SpatialMoves],
    visual_brief: [...p20SpatialMoves],
  };

  return normalizedPage;
}

export function migrateLegacyStructurePageToSystemRendering(
  pagePlan: PipelineResult["pagePlan"],
  projectFacts: PipelineResult["projectFacts"],
) {
  const result = structuredClone(pagePlan);
  const technicalSection = result.sections.find(
    (section) => section.section_id === "S05",
  );
  if (technicalSection) {
    technicalSection.purpose =
      "用立面、材料、系统剖切渲染与环境性能说明方案的实施路径。";
  }
  const systemEvidencePaths = new Set([
    "proposal.design_concept",
    "proposal.concept_statement",
    "proposal.masterplan",
    "proposal.key_spaces",
    "circulation.design",
    "technical.facade",
  ]);
  const systemFactRefs = projectFacts.facts
    .filter(
      (fact) =>
        systemEvidencePaths.has(fact.field_path) &&
        fact.status !== "superseded",
    )
    .map((fact) => fact.fact_id);
  const summaryFactRefs = projectFacts.facts
    .filter(
      (fact) =>
        fact.status !== "superseded" && fact.status !== "conflict",
    )
    .map((fact) => fact.fact_id);
  const confirmedProposalText = (projectFacts.gate_b_proposals ?? [])
    .filter((proposal) => proposal.status === "confirmed")
    .map(
      (proposal) =>
        `${proposal.missing_label} ${proposal.confirmed_direction}`,
    )
    .join(" ");
  const hasSummaryInput = (pattern: RegExp, fieldPaths: string[]) =>
    pattern.test(confirmedProposalText) ||
    projectFacts.facts.some(
      (fact) =>
        fieldPaths.includes(fact.field_path) &&
        fact.status !== "superseded" &&
        fact.status !== "conflict",
    );
  const summaryMissingInformation = [
    hasSummaryInput(/概念|理念|母题/, [
      "proposal.design_concept",
      "proposal.concept_statement",
    ])
      ? null
      : "已确认的设计概念",
    hasSummaryInput(/总图|总体布局|形态|体量/, ["proposal.masterplan"])
      ? null
      : "已确认的总体布局",
    hasSummaryInput(/重点空间|公共空间|效果图|空间体验/, [
      "proposal.key_spaces",
    ])
      ? null
      : "已确认的重点空间",
  ].filter((item): item is string => Boolean(item));

  for (const page of result.pages) {
    if (
      page.page_type === "section_divider" &&
      page.section_id === "S05" &&
      page.headline_zh === "技术与实施"
    ) {
      page.core_message =
        "以立面、材料、系统剖切渲染和环境性能说明空间方案的技术支撑与实施路径。";
      page.core_message_en =
        "Facade, materials, system cutaway rendering and environmental performance establish the delivery logic.";
      page.visual_requirements = ["章节标题", "立面或系统剖切渲染主视觉"];
      page.visual_brief = [...page.visual_requirements];
    }
    if (
      page.page_type === "summary" &&
      ["以可追溯证据收束方案价值", "可追溯证据收束方案价值"].includes(
        page.headline_zh,
      )
    ) {
      page.headline_zh = "方案设计总结";
      page.headline_en = "DESIGN SUMMARY";
      page.core_message =
        "综合城市与场地回应、空间与功能组织、公共体验和环境策略，总结方案如何落实任务书目标与已确认设计方向。";
      page.core_message_en =
        "The summary consolidates how the proposal responds to the brief through urban context, spatial organization, public experience and environmental strategy.";
      page.body_zh = "";
      page.body_en = "";
      page.body_copy = "";
      page.diagram_labels = [];
      page.diagram_labels_en = [];
      page.speaker_notes = "";
      page.callouts = [];
      page.visual_requirements = [
        "总体鸟瞰或建筑整体效果图",
        "公共空间或入口效果图",
        "重点空间或室内效果图",
      ];
      page.visual_brief = [...page.visual_requirements];
      page.fact_refs = summaryFactRefs;
      page.missing_information = summaryMissingInformation;
      page.unresolved_items = [...summaryMissingInformation];
      page.generation_status = summaryMissingInformation.length
        ? "placeholder"
        : "ready";
      delete page.visual_task;
    }
    const legacyStructurePage =
      page.page_type === "technical" &&
      ["以结构体系支撑空间实现", "结构体系支撑空间实现"].includes(
        page.headline_zh,
      );
    const existingSystemRenderingPage = isSystemRenderingPage(page);
    if (!legacyStructurePage && !existingSystemRenderingPage) {
      continue;
    }
    const visualTaskPromptText = [
      page.visual_task?.image_prompt?.prompt_zh,
      page.visual_task?.generated_image?.prompt_zh,
      ...(page.visual_task?.generated_images?.map((image) => image.prompt_zh) ?? []),
      ...(page.visual_task?.image_slots?.map(
        (slot) => `${slot.label} ${slot.purpose} ${slot.prompt_focus}`,
      ) ?? []),
    ]
      .filter(Boolean)
      .join(" ");
    const usedLegacyWholeBuildingMeaning =
      legacyStructurePage ||
      /空间组织、垂直交通、围护界面|cutaway axonometric model|垂直功能分区|垂直功能分层|酒店.{0,12}公寓.{0,12}办公.{0,12}商业|完整塔楼.{0,12}功能分区/.test(
        `${page.core_message} ${page.body_zh} ${page.body_copy} ${page.diagram_labels.join(" ")} ${visualTaskPromptText}`,
      );
    page.page_type = "rendering";
    page.headline_zh = "系统剖切渲染整合建筑关系";
    page.headline_en =
      "INTEGRATING FACADE AND ENVIRONMENTAL SYSTEMS THROUGH A SECTIONAL RENDERING";
    page.core_message =
      "通过局部切开连续三至五层典型楼层与立面系统，呈现室内空间、楼板、幕墙、水平遮阳、垂直绿化与自然通风路径之间的协同关系。";
    page.core_message_en =
      "A close facade-system sectional rendering reveals how interiors, slabs, curtain wall, horizontal shading, vertical planting and natural ventilation work together across several typical floors.";
    if (usedLegacyWholeBuildingMeaning) {
      page.body_zh = "";
      page.body_en = "";
      page.body_copy = "";
      page.diagram_labels = [];
      page.diagram_labels_en = [];
      page.speaker_notes = "";
      page.callouts = [];
      page.proposal_coverage = [];
    }
    page.visual_requirements = [
      "局部立面系统剖切渲染",
      "近距离切开连续三至五层典型楼层与一至两个立面开间，展示室内、楼板、幕墙、遮阳、通风构件与环境路径",
      "采用局部系统剖切的标准尺度：左侧短文案，右侧局部立面系统剖切主视觉；不得采用 P50 的整栋 section perspective 或其他远距离剖透视表达",
    ];
    page.visual_brief = [...page.visual_requirements];
    page.fact_refs = systemFactRefs;
    page.experience_recipe_refs = [SYSTEM_RENDERING_RECIPE_ID];
    page.missing_information = [];
    page.unresolved_items = (page.unresolved_items ?? []).filter(
      (item) =>
        !/当前方案模型|系统剖切视角|结构方案|效果图|视觉清单/.test(item),
    );
    if (usedLegacyWholeBuildingMeaning) {
      page.generation_status = "ready";
      delete page.visual_task;
    }
  }

  const systemRenderingPages = result.pages.filter((page) =>
    isSystemRenderingPage(page),
  );
  if (systemRenderingPages.length > 1) {
    const scoreSystemPage = (page: (typeof result.pages)[number]) =>
      (page.generation_status === "reviewed" ? 40 : 0) +
      (page.generation_status === "generated" ? 30 : 0) +
      (page.body_zh?.trim() || page.body_copy.trim() ? 20 : 0) +
      (page.experience_recipe_refs?.includes(SYSTEM_RENDERING_RECIPE_ID)
        ? 10
        : 0) +
      (page.display_page_number ?? 0) / 100;
    const keeper = [...systemRenderingPages].sort(
      (left, right) => scoreSystemPage(right) - scoreSystemPage(left),
    )[0];

    for (const duplicate of systemRenderingPages) {
      if (duplicate.page_id === keeper.page_id) continue;
      duplicate.page_type = "section_divider";
      duplicate.headline_zh = "技术与实施";
      duplicate.headline_en = "TECHNICAL DEVELOPMENT & DELIVERY";
      duplicate.core_message =
        "以立面、材料、系统剖切渲染和环境性能说明空间方案的技术支撑与实施路径。";
      duplicate.core_message_en =
        "Facade, materials, system cutaway rendering and environmental performance establish the delivery logic.";
      duplicate.body_zh = "";
      duplicate.body_en = "";
      duplicate.body_copy = "";
      duplicate.diagram_labels = [];
      duplicate.diagram_labels_en = [];
      duplicate.speaker_notes = "";
      duplicate.callouts = [];
      duplicate.fact_refs = [];
      duplicate.proposal_refs = [];
      duplicate.proposal_coverage = [];
      duplicate.visual_requirements = [
        "章节标题",
        "立面或系统剖切渲染主视觉",
      ];
      duplicate.visual_brief = [...duplicate.visual_requirements];
      duplicate.experience_recipe_refs = [];
      duplicate.missing_information = [];
      duplicate.unresolved_items = [];
      duplicate.generation_status = "ready";
      delete duplicate.visual_task;
    }
  }
  return result;
}

function migrateStoredResult(result: PipelineResult) {
  const chapterPolicyPlan = normalizeProjectUnderstandingChapter(
    result.pagePlan,
  );
  const systemRenderingPlan = migrateLegacyStructurePageToSystemRendering(
    chapterPolicyPlan,
    result.projectFacts,
  );
  const normalizedDefaultPlan = normalizeCurrentDefaultPagePlan(
    systemRenderingPlan,
  );
  normalizedDefaultPlan.pages = normalizedDefaultPlan.pages.map(
    normalizeSingleSectionImagePage,
  );
  normalizedDefaultPlan.pages = normalizedDefaultPlan.pages.map((page) =>
    normalizeP20ConceptSequencePage(page, result.projectFacts),
  );
  normalizedDefaultPlan.pages = normalizedDefaultPlan.pages.map((page) => ({
    ...page,
    headline_zh: normalizePageHeadline(page.headline_zh, "当前页"),
  }));
  const keySpacePage = normalizedDefaultPlan.pages.find(
    (page) =>
      page.display_page_number === 21 &&
      page.page_type === "rendering" &&
      /重点空间呈现核心概念/u.test(page.headline_zh),
  );
  if (keySpacePage) {
    const keySpaceTask = createVisualTask(result.projectFacts, keySpacePage);
    const existingImages = keySpacePage.visual_task?.generated_images?.length
      ? keySpacePage.visual_task.generated_images
      : keySpacePage.visual_task?.generated_image
        ? [keySpacePage.visual_task.generated_image]
        : [];
    const reusableImages = normalizedDefaultPlan.pages
      .filter(
        (page) =>
          page.page_id !== keySpacePage.page_id &&
          page.page_type === "rendering" &&
          /重点空间|公共生活|公共体验/u.test(page.headline_zh),
      )
      .flatMap((page) =>
        page.visual_task?.generated_images?.length
          ? page.visual_task.generated_images
          : page.visual_task?.generated_image
            ? [page.visual_task.generated_image]
            : [],
      );
    const images = [...existingImages, ...reusableImages]
      .filter(
        (image, index, all) =>
          Boolean(image.image_url) &&
          all.findIndex((candidate) => candidate.image_url === image.image_url) ===
            index,
      )
      .slice(0, 3)
      .map((image, index) => ({
        ...image,
        slot_id: keySpaceTask.image_slots[index]?.slot_id ?? `S${index + 1}`,
      })) as unknown as NonNullable<
      NonNullable<typeof keySpaceTask.generated_images>
    >;
    keySpacePage.visual_task = {
      ...keySpaceTask,
      generated_images: images.length ? images : undefined,
      generated_image: images.length
        ? legacyGeneratedImageFromSlots(
            images,
            keySpacePage.visual_task?.generated_image,
          )
        : undefined,
    };
  }
  const migratedPagePlan = migrateLegacyVisualReferenceSelections(
    normalizedDefaultPlan,
  );
  const migratedKeySpacePage = migratedPagePlan.pages.find(
    (page) =>
      page.display_page_number === 21 &&
      page.page_type === "rendering" &&
      /重点空间呈现核心概念/u.test(page.headline_zh),
  );
  if (migratedKeySpacePage?.visual_task) {
    const reusableImages = migratedPagePlan.pages
      .toSorted((left, right) =>
        (left.page_type === "summary" ? 0 : 1) -
        (right.page_type === "summary" ? 0 : 1),
      )
      .filter(
        (page) =>
          page.page_id !== migratedKeySpacePage.page_id &&
          ["summary", "rendering"].includes(page.page_type) &&
          /重点空间|公共体验|统合城市效率与公共性/u.test(page.headline_zh),
      )
      .flatMap((page) =>
        page.visual_task?.generated_images?.length
          ? page.visual_task.generated_images
          : page.visual_task?.generated_image
            ? [page.visual_task.generated_image]
            : [],
      )
      .filter(
        (image, index, all) =>
          Boolean(image.image_url) &&
          all.findIndex((candidate) => candidate.image_url === image.image_url) ===
            index,
      )
      .slice(0, 3)
      .map((image, index) => ({
        ...image,
        slot_id:
          migratedKeySpacePage.visual_task?.image_slots[index]?.slot_id ??
          `S${index + 1}`,
      })) as unknown as NonNullable<
      NonNullable<typeof migratedKeySpacePage.visual_task.generated_images>
    >;
    if (reusableImages.length) {
      migratedKeySpacePage.visual_task = {
        ...migratedKeySpacePage.visual_task,
        generated_images: reusableImages,
        generated_image: legacyGeneratedImageFromSlots(
          reusableImages,
          migratedKeySpacePage.visual_task.generated_image,
        ),
      };
    }
  }
  return {
    ...result,
    pagePlan: migratedPagePlan,
  };
}

function normalizeCurrentDefaultPagePlan(
  pagePlan: PipelineResult["pagePlan"],
) {
  const result = structuredClone(pagePlan);
  const comparisonIndex = result.pages.findIndex(
    (page) =>
      (page.display_page_number === 22 || page.page_id === "P022") &&
      (page.page_type === "comparison" || /方案比选/u.test(page.headline_zh)),
  );
  if (comparisonIndex >= 0) result.pages.splice(comparisonIndex, 1);

  const keySpacePage = result.pages[20];
  if (keySpacePage) {
    keySpacePage.page_type = "rendering";
    keySpacePage.headline_zh = "以重点空间呈现核心概念";
    keySpacePage.headline_en = "KEY SPACES EXPRESS THE CORE CONCEPT";
    keySpacePage.core_message =
      "围绕 P19 提出的核心概念，选择三个重点精彩空间效果图，分别呈现公共到达、核心共享空间与重点室内体验。";
    keySpacePage.visual_requirements = [
      "三个重点精彩空间效果图",
      "公共到达与开放界面",
      "核心共享空间与概念体验",
      "重点室内空间与材料氛围",
      "三张图均需回应 P19 核心概念",
    ];
    keySpacePage.visual_brief = [...keySpacePage.visual_requirements];
    keySpacePage.generation_status = "ready";
    delete keySpacePage.visual_task;
  }

  const sectionIndex = result.pages.findIndex(
    (page) => page.page_type === "section",
  );
  const p29Index = Math.min(28, result.pages.length - 1);
  if (sectionIndex >= 0 && p29Index >= 0 && sectionIndex !== p29Index) {
    const sectionPage = result.pages[sectionIndex];
    const p29Page = result.pages[p29Index];
    result.pages[sectionIndex] = {
      ...p29Page,
      page_id: sectionPage.page_id,
      display_page_number: sectionPage.display_page_number,
    };
    result.pages[p29Index] = {
      ...sectionPage,
      page_id: p29Page.page_id,
      display_page_number: p29Page.display_page_number,
    };
  }
  result.pages = result.pages.map((page, index) => ({
    ...page,
    page_id: `P${String(index + 1).padStart(3, "0")}`,
    display_page_number: index + 1,
  }));
  result.target_page_count = result.pages.length;
  return result;
}

export function migrateStoredProjectDraft(draft: LocalProjectDraft) {
  return {
    ...draft,
    result: migrateStoredResult(draft.result),
    history: draft.history?.map((entry) => ({
      ...entry,
      result: migrateStoredResult(entry.result),
    })),
  } satisfies LocalProjectDraft;
}

export interface LocalProjectDraft {
  version: 1;
  projectId?: string;
  title?: string;
  companyName?: string;
  status?: "active" | "archived";
  archivedAt?: string;
  updatedAt: string;
  documents: InputDocument[];
  result: PipelineResult;
  selectedPageId?: string;
  documentsChanged: boolean;
  sessionTokenUsage: {
    input: number;
    output: number;
    imageInput?: number;
    imageOutput?: number;
    imageCalls?: number;
    images: number;
  };
  gateBInputs: Record<string, string>;
  history?: ProjectHistoryEntry[];
  visualImageJob?: PersistedVisualImageJob;
}

export interface StoredProjectSummary {
  projectId: string;
  title: string;
  status: "active" | "archived";
  updatedAt: string;
  archivedAt?: string;
  storage: "browser" | "memfire";
}

interface LocalProjectIndex {
  version: 2;
  activeProjectId?: string;
  projects: StoredProjectSummary[];
}

export type PersistedVisualImageJobStage =
  | "queued"
  | "preparing_prompt"
  | "uploading_reference"
  | "model_generating"
  | "retrying"
  | "completed"
  | "failed";

export interface PersistedVisualImageJob {
  pageId: string;
  slotId: string;
  taskId: string;
  stage: PersistedVisualImageJobStage;
  retryAttempted: boolean;
  referenceSkipped?: boolean;
  retryable?: boolean;
  errorCode?: string;
  requestId?: string;
  attemptCount?: number;
  retryAfterMs?: number;
  retryAvailableAt?: string;
  failedAt?: string;
  message: string;
}

export interface ProjectHistoryEntry {
  historyId: string;
  createdAt: string;
  label: string;
  documents: InputDocument[];
  result: PipelineResult;
  selectedPageId?: string;
  documentsChanged: boolean;
  gateBInputs: Record<string, string>;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("本机项目存档读写失败。"));
  });
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("当前浏览器不支持本机项目存档。"));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("无法打开本机项目存档。"));
  });
}

function isLocalProjectDraft(value: unknown): value is LocalProjectDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<LocalProjectDraft>;
  return (
    draft.version === 1 &&
    Array.isArray(draft.documents) &&
    Boolean(draft.result?.projectFacts) &&
    Boolean(draft.result?.pagePlan) &&
    Array.isArray(draft.result?.nodeOutputs)
  );
}

function projectKey(projectId: string) {
  return `${PROJECT_KEY_PREFIX}${projectId}`;
}

function draftProjectId(draft: LocalProjectDraft) {
  return draft.projectId?.trim() || "legacy-active-project";
}

function draftSummary(draft: LocalProjectDraft): StoredProjectSummary {
  return {
    projectId: draftProjectId(draft),
    title:
      draft.title?.trim() ||
      draft.result.projectFacts.project_name_anonymized ||
      "未命名设计",
    status: draft.status ?? "active",
    updatedAt: draft.updatedAt,
    archivedAt: draft.archivedAt,
    storage: "browser",
  };
}

async function readIndex(database: IDBDatabase) {
  const transaction = database.transaction(STORE_NAME, "readonly");
  const value = await requestResult(
    transaction.objectStore(STORE_NAME).get(PROJECT_INDEX_KEY),
  );
  if (!value || typeof value !== "object") {
    return { version: 2, projects: [] } satisfies LocalProjectIndex;
  }
  const index = value as Partial<LocalProjectIndex>;
  return {
    version: 2,
    activeProjectId: index.activeProjectId,
    projects: Array.isArray(index.projects) ? index.projects : [],
  } satisfies LocalProjectIndex;
}

export async function loadLocalProjectDraft(projectId?: string) {
  const database = await openDatabase();
  try {
    const index = await readIndex(database);
    const selectedProjectId = projectId ?? index.activeProjectId;
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await requestResult(
      transaction
        .objectStore(STORE_NAME)
        .get(selectedProjectId ? projectKey(selectedProjectId) : ACTIVE_PROJECT_KEY),
    );
    if (!isLocalProjectDraft(value)) return undefined;
    return migrateStoredProjectDraft(value);
  } finally {
    database.close();
  }
}

export async function saveLocalProjectDraft(draft: LocalProjectDraft) {
  const database = await openDatabase();
  try {
    const projectId = draftProjectId(draft);
    const normalizedDraft = {
      ...draft,
      projectId,
      title: draftSummary(draft).title,
      status: draft.status ?? "active",
    } satisfies LocalProjectDraft;
    const index = await readIndex(database);
    const summary = draftSummary(normalizedDraft);
    const projects = [
      summary,
      ...index.projects.filter((item) => item.projectId !== projectId),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await requestResult(store.put(normalizedDraft, projectKey(projectId)));
    await requestResult(
      store.put(
        {
          version: 2,
          activeProjectId:
            normalizedDraft.status === "active"
              ? projectId
              : index.activeProjectId === projectId
                ? undefined
                : index.activeProjectId,
          projects,
        } satisfies LocalProjectIndex,
        PROJECT_INDEX_KEY,
      ),
    );
  } finally {
    database.close();
  }
}

export async function listLocalProjectDrafts() {
  const database = await openDatabase();
  try {
    const index = await readIndex(database);
    return index.projects;
  } finally {
    database.close();
  }
}

export async function archiveLocalProjectDraft(draft: LocalProjectDraft) {
  const archivedAt = new Date().toISOString();
  await saveLocalProjectDraft({
    ...draft,
    status: "archived",
    archivedAt,
    updatedAt: archivedAt,
  });
}

export async function renameLocalProjectDraft(
  projectId: string,
  title: string,
) {
  const normalizedProjectId = projectId.trim();
  const normalizedTitle = title.trim();
  if (!normalizedProjectId) throw new Error("缺少项目编号。");
  if (!normalizedTitle) throw new Error("设计名称不能为空。");
  const draft = await loadLocalProjectDraft(normalizedProjectId);
  if (!draft) throw new Error("没有找到该设计存档。");
  const updatedAt = new Date().toISOString();
  await saveLocalProjectDraft({
    ...draft,
    title: normalizedTitle,
    updatedAt,
  });
  return { updatedAt };
}

export async function deleteLocalProjectDraft(projectId: string) {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) throw new Error("缺少项目编号。");
  const database = await openDatabase();
  try {
    const index = await readIndex(database);
    const summary = index.projects.find(
      (item) => item.projectId === normalizedProjectId,
    );
    if (!summary) throw new Error("没有找到该设计存档。");
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await requestResult(store.delete(projectKey(normalizedProjectId)));
    await requestResult(
      store.put(
        {
          ...index,
          activeProjectId:
            index.activeProjectId === normalizedProjectId
              ? undefined
              : index.activeProjectId,
          projects: index.projects.filter(
            (item) => item.projectId !== normalizedProjectId,
          ),
        } satisfies LocalProjectIndex,
        PROJECT_INDEX_KEY,
      ),
    );
  } finally {
    database.close();
  }
}

export async function clearLocalProjectDraft() {
  const database = await openDatabase();
  try {
    const index = await readIndex(database);
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    if (index.activeProjectId) {
      await requestResult(store.delete(projectKey(index.activeProjectId)));
      await requestResult(
        store.put(
          {
            ...index,
            activeProjectId: undefined,
            projects: index.projects.filter(
              (item) => item.projectId !== index.activeProjectId,
            ),
          } satisfies LocalProjectIndex,
          PROJECT_INDEX_KEY,
        ),
      );
    } else {
      await requestResult(store.delete(ACTIVE_PROJECT_KEY));
    }
  } finally {
    database.close();
  }
}
