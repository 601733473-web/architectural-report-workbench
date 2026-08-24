"use client";

import {
  AlertTriangle,
  BookOpenText,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardPaste,
  Download,
  FileSearch,
  FileText,
  FolderOpen,
  History,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  LogOut,
  Pencil,
  Play,
  Plus,
  Presentation,
  Quote,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import { fileToInputDocument } from "@/app/lib/pdf-client";
import {
  clearLocalProjectDraft,
  deleteLocalProjectDraft,
  listLocalProjectDrafts,
  loadLocalProjectDraft,
  migrateStoredProjectDraft,
  renameLocalProjectDraft,
  saveLocalProjectDraft,
  type PersistedVisualImageJob,
  type PersistedVisualImageJobStage,
  type ProjectHistoryEntry,
  type LocalProjectDraft,
  type StoredProjectSummary,
} from "@/app/lib/local-project-store";
import {
  CloudProjectConflictError,
  deleteCloudProject,
  getCloudStoreStatus,
  listCloudProjects,
  loadCloudProject,
  renameCloudProject,
  saveCloudProject,
  type CloudStoreStatus,
  type PersistedImageUrlUpdate,
} from "@/app/lib/project-store-client";
import {
  preserveConfirmedFactRevisions,
  reviseProjectFact,
} from "@/app/lib/fact-revisions";
import {
  preserveUserDefinedProposals,
  USER_PROPOSAL_TOPICS,
  type UserProposalTopic,
} from "@/app/lib/proposal-topics";
import { DEFAULT_TARGET_PAGE_COUNT } from "@/app/lib/report-config";
import {
  cleanPresentationLabel,
  contextualDiagramLabels,
  containsBackstagePresentationText,
  extractConceptName,
  extractEnglishConceptName,
  normalizePageHeadline,
  sanitizePresentationItems,
  sanitizePresentationText,
} from "@/app/lib/presentation-copy";
import {
  englishCoreFallback,
  englishLabelFallback,
  englishPresentationText,
  pageTypeEnglishLabels,
} from "@/app/lib/bilingual-copy";
import {
  canGenerateVisualImageForSlot,
  getVisualFrameLayout,
  getVisualImageSlotCount,
  getVisualImageSlotCountForPage,
  getVisualImageSuitability,
  isSystemRenderingPage,
  legacyGeneratedImageFromSlots,
  updatePageVisualTask,
} from "@/app/lib/visual-task";
import { isMetricBoundaryPage } from "@/app/lib/visual-reference";
import {
  proposalValidationItemsForPage,
  synchronizeProposalCoverage,
} from "@/app/lib/gate-b-proposals";
import {
  SMALL_MODE_DESIGN_DIRECTION_ITEM_ID,
  ensureSmallModeDesignDirectionState,
  smallModeDesignDirectionCards,
  smallModeDesignDirectionFacts,
} from "@/app/lib/small-mode-design-directions";
import { evaluatePageContentDepth } from "@/app/lib/content-depth";
import type {
  InputDocument,
  NodeOutput,
  PipelineResult,
  SourceRole,
} from "@/app/lib/pipeline";
import { runPipeline } from "@/app/lib/pipeline";
import type {
  PageTextTranslation,
  PageTextTranslationInput,
} from "@/app/lib/page-text-translation-model";
import {
  DEFAULT_TASK_MODE,
  isolateSmallBuildingProjectFacts,
  isSmallBuildingMode,
  type TaskMode,
} from "@/app/lib/task-mode";
import {
  preserveSiteResearchFacts,
  removeSiteResearchFact,
} from "@/app/lib/site-research";
import { evaluateSmallModeImageReadiness } from "@/app/lib/small-mode-local-readiness";

type LeftTab = "documents" | "facts" | "issues";
type DetailTab = "preview" | "visual" | "content";
type VisualImageJobStage = PersistedVisualImageJobStage;
type VisualImageJobState = PersistedVisualImageJob;
type AutosaveMode = "15m" | "30m" | "manual";

const DEFAULT_COMPANY_NAME = "设计汇报 DESIGN PRESENTATION";
const SMALL_COVER_REPORT_TITLE_EN =
  "THREE-THEME INSTALLATION DESIGN PRESENTATION";

const AUTOSAVE_INTERVAL_MS = 15 * 60 * 1000;
const AUTOSAVE_INTERVAL_30M_MS = 30 * 60 * 1000;

interface AgentWorkDisplay {
  title: string;
  detail: string;
  pageLabel: string;
}

const visualImageStageOrder: VisualImageJobStage[] = [
  "queued",
  "preparing_prompt",
  "uploading_reference",
  "model_generating",
  "retrying",
  "completed",
];

const visualImageStageLabels: Record<VisualImageJobStage, string> = {
  queued: "排队中",
  preparing_prompt: "正在整理提示词",
  uploading_reference: "正在上传参考图",
  model_generating: "模型生成中",
  retrying: "自动重试中",
  completed: "已完成",
  failed: "失败",
};

function agentWorkDisplay(
  busy: string,
  pagePlan: DesignReportPagePlan,
  selectedPageId: string | undefined,
  visualImageJob: VisualImageJobState | null,
): AgentWorkDisplay {
  const totalPages = pagePlan.pages.length;
  const activePageId =
    busy === "visual-image" && visualImageJob?.pageId
      ? visualImageJob.pageId
      : selectedPageId;
  const activePageIndex = pagePlan.pages.findIndex(
    (page) => page.page_id === activePageId,
  );
  const activePageNumber =
    activePageIndex >= 0
      ? pagePlan.pages[activePageIndex]?.display_page_number ??
        activePageIndex + 1
      : undefined;
  const pageLabel = activePageNumber
    ? `正在处理第 ${activePageNumber}/${Math.max(totalPages, 1)} 页`
    : totalPages
      ? `处理范围：第 1–${totalPages} 页`
      : "正在建立页面框架";
  const wholeDeckLabel = totalPages
    ? `处理范围：第 1–${totalPages} 页（共 ${totalPages} 页）`
    : "正在建立页面框架";

  if (busy === "generate") {
    return {
      title: "Agent 正在生成当前页文案",
      detail: "正在核对任务书事实、已确认提案、页面结论和证据来源。",
      pageLabel,
    };
  }
  if (busy === "visual") {
    return {
      title: "Agent 正在建立当前页视觉任务单",
      detail: "正在理解页面主题、图框用途，并为每个图框整理待生成内容。",
      pageLabel,
    };
  }
  if (busy === "visual-image") {
    return {
      title: `Agent ${visualImageStageLabels[visualImageJob?.stage ?? "queued"]}`,
      detail:
        visualImageJob?.message ??
        "正在根据当前图框和当前项目资料生成视觉意向图。",
      pageLabel,
    };
  }
  if (busy === "visual-image-all") {
    return {
      title: "Agent 正在生成整套 AI 图纸",
      detail:
        visualImageJob?.message ??
        "正在逐图调用提示词模型与图像模型，并保持全篇方案形态一致。",
      pageLabel: wholeDeckLabel,
    };
  }
  if (busy === "add-page") {
    const insertionNumber =
      activePageIndex >= 0 ? activePageIndex + 2 : totalPages + 1;
    return {
      title: "Agent 正在起草新增页面",
      detail: "正在根据用户提示补充页面结论、正文、证据与视觉任务。",
      pageLabel: `正在生成第 ${insertionNumber}/${totalPages + 1} 页`,
    };
  }
  if (busy === "audit") {
    return {
      title: "Agent 正在审核整套汇报",
      detail: "正在逐页检查内容完整度、提案落实、事实引用和视觉证据。",
      pageLabel: wholeDeckLabel,
    };
  }
  if (busy === "run-fast" || busy === "upload") {
    return {
      title:
        busy === "upload"
          ? "Agent 正在读取任务书"
          : "Agent 正在快速建立汇报框架",
      detail: "正在提取项目事实，并结合历史参考库组织章节与页面结构。",
      pageLabel: wholeDeckLabel,
    };
  }
  if (busy === "site-research") {
    return {
      title: "Agent 正在研究项目场地",
      detail: "正在查询场地坐标、公共交通、周边节点、景观资源与地形高程，并保存可追溯来源。",
      pageLabel: "场地研究阶段 · 不修改页面框架",
    };
  }
  if (busy === "run-deep") {
    return {
      title: "Agent 正在深度优化整套汇报",
      detail: "正在优化章节、页面标题和每页核心结论。",
      pageLabel: wholeDeckLabel,
    };
  }
  if (busy === "project-save") {
    return {
      title: "正在保存当前设计",
      detail: "正在将当前设计方案保存到云端或浏览器存档。",
      pageLabel: "不修改页面内容",
    };
  }
  if (busy === "generate-all") {
    return {
      title: "Agent 正在生成整套终稿文案",
      detail: "正在并行生成每页中英正文、图解标签和讲述提示，并完成全篇一致性审核。",
      pageLabel: wholeDeckLabel,
    };
  }
  if (busy === "visual-all") {
    return {
      title: "Agent 正在建立整套视觉任务",
      detail: "正在按每页内容生成独立图框、差异化图片说明和统一的跨页形态约束。",
      pageLabel: wholeDeckLabel,
    };
  }
  if (busy === "export-pdf") {
    return {
      title: "Agent 正在整理 PDF 终稿",
      detail: "正在逐页整理中英标题、正文、证据与导出前审核。",
      pageLabel: wholeDeckLabel,
    };
  }
  if (busy === "export-docx") {
    return {
      title: "Agent 正在编写设计说明",
      detail: "正在汇总事实、提案、数据和各页正文，形成约 2000 字说明文本。",
      pageLabel: wholeDeckLabel,
    };
  }
  if (busy.startsWith("gate-b-") || busy.startsWith("user-proposal-")) {
    return {
      title: "Agent 正在更新设计提案",
      detail: "正在校验提案内容，并同步检查其对相关页面的实质影响。",
      pageLabel,
    };
  }
  if (busy.startsWith("fact-")) {
    return {
      title: "Agent 正在更新项目事实",
      detail: "正在核对来源，并重新检查当前页正文与证据引用。",
      pageLabel,
    };
  }
  if (busy === "api-test") {
    return {
      title: "Agent 正在检查模型接口",
      detail: "正在验证文本模型与图像模型是否可用。",
      pageLabel: activePageNumber
        ? `当前停留在第 ${activePageNumber}/${Math.max(totalPages, 1)} 页`
        : "不修改页面内容",
    };
  }
  return {
    title: "Agent 正在处理当前任务",
    detail: "任务完成前请保持当前页面打开，完成后会自动更新结果。",
    pageLabel,
  };
}

interface WorkbenchProps {
  initialDocuments: InputDocument[];
  initialResult: PipelineResult;
  initialApiSettings: {
    baseUrl: string;
    model: string;
    imageBaseUrl: string;
    imageModel: string;
    configured: boolean;
    imageConfigured: boolean;
    mapConfigured: boolean;
  };
}

interface ApiSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  imageBaseUrl: string;
  imageModel: string;
  imageApiKey: string;
  amapApiKey: string;
}

function historySafeDocuments(documents: InputDocument[]) {
  return documents.map((document) => ({
    ...document,
    file_data: undefined,
    visual_pages: undefined,
  }));
}

function historySafeResult(result: PipelineResult): PipelineResult {
  const isEmbeddedImage = (value: string | undefined) =>
    Boolean(value?.startsWith("data:") || value?.startsWith("blob:"));
  return {
    ...result,
    pagePlan: {
      ...result.pagePlan,
      pages: result.pagePlan.pages.map((page) => {
        if (!page.visual_task) return page;
        const task = { ...page.visual_task };
        if (isEmbeddedImage(task.generated_image?.image_url)) {
          delete task.generated_image;
        }
        if (
          task.generated_images?.some((image) =>
            isEmbeddedImage(image.image_url),
          )
        ) {
          delete task.generated_images;
        }
        return { ...page, visual_task: task };
      }),
    },
    nodeOutputs: result.nodeOutputs.map((nodeOutput) => ({
      ...nodeOutput,
      output: {
        history_compacted: true,
        node: nodeOutput.node,
      },
    })),
  };
}

const PERSISTED_HISTORY_LIMIT = 5;

function persistedHistoryResult(result: PipelineResult): PipelineResult {
  const compacted = historySafeResult(result);
  return {
    ...compacted,
    projectFacts: {
      ...compacted.projectFacts,
      // Historical versions only need project-specific state. The immutable
      // reference library is reattached from the live project when undoing.
      reference_experience: undefined,
      reference_style_examples: undefined,
    },
  };
}

function persistedProjectHistory(history: ProjectHistoryEntry[]) {
  return history.slice(-PERSISTED_HISTORY_LIMIT).map((entry) => ({
    ...entry,
    documents: historySafeDocuments(entry.documents),
    result: persistedHistoryResult(entry.result),
  }));
}

function persistedProjectDocuments(documents: InputDocument[]) {
  return documents.map((document) => ({
    ...document,
    // After upload, extracted text and the selected site pages are sufficient.
    // Keeping the complete PDF Base64 payload in IndexedDB can exhaust browser
    // storage and has triggered Chromium renderer crashes on large briefs.
    file_data: undefined,
    visual_pages: undefined,
  }));
}

function persistedProjectResult(
  result: PipelineResult,
  storage: "memfire" | "browser",
) {
  const compacted = storage === "browser"
    ? historySafeResult(result)
    : structuredClone(result);
  if (storage === "memfire") {
    compacted.pagePlan = {
      ...compacted.pagePlan,
      pages: compacted.pagePlan.pages.map((page) => {
        if (!page.visual_task?.generated_images?.length) return page;
        const visualTask = { ...page.visual_task };
        // generated_images is canonical. The legacy alias duplicates the same
        // base64 payload and can make a cloud save exceed the request limit.
        delete visualTask.generated_image;
        return { ...page, visual_task: visualTask };
      }),
    };
  }
  return {
    ...compacted,
    projectFacts: {
      ...compacted.projectFacts,
      // The reference library has its own backend store and is reattached at
      // load time. Duplicating it inside every project makes autosaves huge.
      reference_experience: undefined,
      reference_style_examples: undefined,
    },
    nodeOutputs: compacted.nodeOutputs.map((nodeOutput) => ({
      ...nodeOutput,
      output: {
        persisted_compacted: true,
        node: nodeOutput.node,
      },
    })),
  } satisfies PipelineResult;
}

interface ApiConnectionStatus {
  state: "success" | "warning" | "error";
  message: string;
}

interface TokenUsageSummary {
  input: number;
  output: number;
  imageInput: number;
  imageOutput: number;
  imageCalls: number;
  images: number;
}

interface FactEditDraft {
  value: string;
  message: string;
}

interface UserProposalDraft {
  topic: UserProposalTopic;
  title: string;
  direction: string;
}

interface EditableTextPair {
  zh: string;
  en: string;
  factRef?: string;
}

interface EditableSectionText {
  sectionId: string;
  titleZh: string;
  titleEn: string;
  purpose: string;
}

interface PageTextDraft {
  pageId: string;
  projectName: string;
  sectionTitleZh: string;
  sectionTitleEn: string;
  headlineZh: string;
  headlineEn: string;
  coreMessage: string;
  coreMessageEn: string;
  bodyZh: string;
  bodyEn: string;
  diagramLabels: EditableTextPair[];
  callouts: EditableTextPair[];
  speakerNotes: string;
  tocSections: EditableSectionText[];
}

type PageTextTranslationStatus =
  | "idle"
  | "waiting"
  | "translating"
  | "completed"
  | "failed";

interface PageTextTranslationResponse extends PipelineResult {
  translation: PageTextTranslation;
}

type LocalDraftStatus =
  | "loading"
  | "ready"
  | "saving"
  | "saved"
  | "warning"
  | "error";

const roleLabels: Record<SourceRole, string> = {
  authoritative: "权威资料",
  proposal: "方案资料",
  reference_style: "风格参考",
  site_research: "场地研究",
  company_info: "公司信息",
  unknown: "待判断",
};

const statusLabels: Record<string, string> = {
  ready: "可生成",
  placeholder: "占位",
  blocked: "阻断",
  generated: "已生成",
  reviewed: "文案已审核",
};

function pageStatusLabel(status: string) {
  if (status === "ready" || status === "placeholder") return "文案待生成";
  if (status === "generated") return "文案已生成";
  if (status === "reviewed") return "文案已审核";
  return statusLabels[status] ?? status;
}

const pageTypeLabels: Record<string, string> = {
  cover: "封面",
  toc: "目录",
  section_divider: "章节",
  position: "区位",
  analysis: "分析",
  strategy: "策略",
  concept: "概念",
  comparison: "比选",
  masterplan: "总图",
  plan: "图纸",
  section: "剖面",
  rendering: "效果",
  technical: "技术",
  data: "数据",
  summary: "总结",
};

function displayPageTypeLabel(
  page: DesignReportPagePlan["pages"][number],
) {
  return isSystemRenderingPage(page)
    ? "系统渲染"
    : pageTypeLabels[page.page_type] ?? "页面";
}

function displayPageHeadline(
  page: DesignReportPagePlan["pages"][number],
  smallMode: boolean,
) {
  return normalizePageHeadline(
    smallMode && page.page_type === "summary" ? "设计总结" : page.headline_zh,
    displayPageTypeLabel(page),
  );
}

function strategyStepDescription(label: string, index: number) {
  const safeLabel = sanitizePresentationText(
    label,
    `策略步骤 ${index + 1}`,
  );
  if (/慢行|步行|共享/.test(safeLabel)) {
    return "以连续步行路径串联主要入口、公共空间与城市界面。";
  }
  if (/车行|落客/.test(safeLabel)) {
    return "梳理车行到达与落客路径，减少对主要步行界面的干扰。";
  }
  if (/后勤|货运|运营/.test(safeLabel)) {
    return "将后勤出入口与公共到达分开，保障运营流线独立。";
  }
  if (/到达|入口|整合/.test(safeLabel)) {
    return "整合入口、落客与公共空间，形成清晰可读的到达序列。";
  }
  if (/垂直|叠合|竖向/.test(safeLabel)) {
    return "整合竖向交通与复合功能，建立清晰的垂直空间关系。";
  }
  if (/地面|释放|广场/.test(safeLabel)) {
    return "集中组织建筑与交通，释放连续的地面公共空间。";
  }
  if (/枢纽|连接|城市/.test(safeLabel)) {
    return "强化城市联系与场地接口，建立清晰的公共到达关系。";
  }
  return [
    `以“${safeLabel}”明确策略起点及其对应条件。`,
    `将“${safeLabel}”转化为可执行的空间组织动作。`,
    `通过“${safeLabel}”协调功能、流线与公共空间关系。`,
    `以“${safeLabel}”收束策略链，并交由后续图纸验证。`,
  ][index] ?? `落实“${safeLabel}”并通过后续图纸验证。`;
}

function formatFactValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const factFieldLabels: Record<string, string> = {
  "planning.site_area": "用地面积",
  "planning.far": "容积率",
  "planning.height_limit": "建筑限高",
  "area.total_gfa": "总建筑面积",
  "site.location": "项目区位",
  "site.location_detail": "地块具体位置",
  "site.location_visual": "图面识别区位",
  "site.boundaries": "地块四至与边界",
  "site.adjacencies": "相邻关系",
  "site.transport_anchors": "图面交通锚点",
  "site.urban_anchors": "城市重要节点",
  "site.landscape_anchors": "图面景观资源",
  "site.research.geocoded_location": "场地定位",
  "site.research.transport": "周边公共交通",
  "site.research.landmarks": "周边重要节点",
  "site.research.landscape": "景观与开放空间资源",
  "site.research.terrain": "场地地形高程",
};

function displayFactFieldPath(fieldPath: string) {
  return factFieldLabels[fieldPath] ?? fieldPath;
}

function safePdfFileName(value: string) {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "建筑设计汇报";
}

const SMALL_BUILDING_IMAGE_MODEL = "gpt-5.5";

function imageApiSettingsForTaskMode(
  settings: ApiSettings,
  taskMode: TaskMode,
) {
  return isSmallBuildingMode(taskMode)
    ? { ...settings, imageModel: SMALL_BUILDING_IMAGE_MODEL }
    : settings;
}

function pageTextTranslationInput(
  draft: PageTextDraft,
  pageType: string,
): PageTextTranslationInput {
  return {
    project_name: draft.projectName,
    page_type: pageType,
    section_title_zh: draft.sectionTitleZh,
    headline_zh: normalizePageHeadline(draft.headlineZh, "当前页"),
    core_message_zh: draft.coreMessage,
    body_zh: draft.bodyZh,
    diagram_labels_zh: draft.diagramLabels.map((item) => item.zh),
    callouts_zh: draft.callouts.map((item) => item.zh),
    toc_sections: draft.tocSections.map((item) => ({
      section_id: item.sectionId,
      title_zh: item.titleZh,
    })),
  };
}

function applyPageTextTranslation(
  draft: PageTextDraft,
  translation: PageTextTranslation,
): PageTextDraft {
  const tocEnglishById = new Map(
    translation.toc_sections_en.map((section) => [
      section.section_id,
      section.title_en,
    ]),
  );
  return {
    ...draft,
    sectionTitleEn: translation.section_title_en,
    headlineEn: translation.headline_en,
    coreMessageEn: translation.core_message_en,
    bodyEn: translation.body_en,
    diagramLabels: draft.diagramLabels.map((item, index) => ({
      ...item,
      en: translation.diagram_labels_en[index] ?? "",
    })),
    callouts: draft.callouts.map((item, index) => ({
      ...item,
      en: translation.callouts_en[index] ?? "",
    })),
    tocSections: draft.tocSections.map((section) => ({
      ...section,
      titleEn: tocEnglishById.get(section.sectionId) ?? "",
    })),
  };
}

function replaceBrowserDocumentTitle(value: string) {
  window.document.title = value;
}

class PipelineClientError extends Error {
  constructor(
    message: string,
    readonly code = "PIPELINE",
    readonly retryable = false,
    readonly stage = "pipeline",
    readonly requestId = "",
    readonly attemptCount = 1,
    readonly retryAfterMs = 0,
  ) {
    super(message);
    this.name = "PipelineClientError";
  }
}

function compactVisualImageProjectFacts(
  projectFacts: DesignReportProjectFacts,
  page: DesignReportPagePlan["pages"][number],
) {
  const contextFields = new Set([
    "project.name",
    "site.location",
    "program.primary",
    "evaluation.design_goal",
    "evaluation.priorities",
    "circulation.requirement",
  ]);
  const factIds = new Set(page.fact_refs);
  for (const proposal of projectFacts.gate_b_proposals ?? []) {
    if (proposal.status !== "confirmed") continue;
    for (const factId of proposal.task_brief_fact_refs) factIds.add(factId);
    const selected = proposal.options.find(
      (option) => option.option_id === proposal.selected_option_id,
    );
    for (const factId of selected?.task_brief_fact_refs ?? []) {
      factIds.add(factId);
    }
  }
  const compactFacts = projectFacts.facts.filter(
    (fact) => factIds.has(fact.fact_id) || contextFields.has(fact.field_path),
  );
  const recipeIds = new Set(page.visual_task?.reference_recipe_refs ?? []);
  const referenceExperience = projectFacts.reference_experience;
  const pageRecipes =
    referenceExperience?.page_recipes.filter((recipe) =>
      recipeIds.has(recipe.recipe_id),
    ) ?? [];
  // 小型模式完全隔离历史参考库。不要把“当前页没有历史配方”压缩成
  // reference_experience.source_documents=[]：该对象的契约要求至少一个来源，
  // 而小型模式本来就不应提交这个对象。
  if (isSmallBuildingMode(projectFacts.task_mode ?? DEFAULT_TASK_MODE)) {
    const smallFacts = { ...projectFacts };
    delete smallFacts.reference_experience;
    return {
      ...smallFacts,
      task_mode: "small_building_or_interior" as const,
      facts: compactFacts,
      conflicts: [],
      missing_items: [],
      style_observations: [],
      reference_style_examples: [],
    } as unknown as DesignReportProjectFacts;
  }
  const sourceDocumentIds = new Set(
    pageRecipes.map((recipe) => recipe.source_document_id),
  );
  return {
    ...projectFacts,
    facts: compactFacts,
    conflicts: [],
    missing_items: [],
    style_observations: [],
    reference_style_examples: [],
    ...(referenceExperience
      ? {
          reference_experience: {
            ...referenceExperience,
            source_documents: referenceExperience.source_documents.filter(
              (source) => sourceDocumentIds.has(source.source_document_id),
            ),
            narrative_pages: [],
            transition_patterns: [],
            page_recipes: pageRecipes,
          },
        }
      : {}),
  } as unknown as DesignReportProjectFacts;
}

function compactVisualImagePagePlan(
  pagePlan: DesignReportPagePlan,
  pageId: string,
) {
  const selectedPage = pagePlan.pages.find((page) => page.page_id === pageId);
  if (!selectedPage) throw new Error(`Page not found: ${pageId}`);
  const page = structuredClone(selectedPage);
  if (page.visual_task) {
    delete page.visual_task.generated_images;
    delete page.visual_task.generated_image;
    page.visual_task.conversation = page.visual_task.conversation.slice(-2);
  }
  return {
    ...pagePlan,
    target_page_count: 1,
    sections: pagePlan.sections.filter(
      (section) => section.section_id === page.section_id,
    ),
    pages: [page],
  } satisfies DesignReportPagePlan;
}

function verifiedSmallModeImageNodeOutputs(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  nodeOutputs: NodeOutput[],
) {
  const existing = nodeOutputs
    .filter(
      (nodeOutput) =>
        nodeOutput.node === "export_preparation" &&
        Boolean(
          (
            nodeOutput.output as {
              small_mode_content_match?: boolean;
            }
          )?.small_mode_content_match,
        ),
    )
    .slice(-1);
  if (existing.length) return existing;
  const readiness = evaluateSmallModeImageReadiness(projectFacts, pagePlan);
  if (!readiness.match) {
    throw new Error(
      `小型建筑/装置本地终稿审查未通过，已停止 AI 生图：${readiness.issues.join("；")}`,
    );
  }
  return [
    {
      node: "export_preparation",
      execution: "local_rule",
      model_calls: 0,
      output: {
        small_mode_content_match: true,
        verification: "deterministic_current_plan",
        covered_requirements: readiness.coveredRequirements,
      },
    } satisfies NodeOutput,
  ];
}

function mergeVisualImagePipelineResult(
  current: PipelineResult,
  next: PipelineResult,
  pageId: string,
  slotId: string,
) {
  const responsePage = next.pagePlan.pages.find(
    (page) => page.page_id === pageId,
  );
  const responseTask = responsePage?.visual_task;
  const responseImage = responseTask?.generated_images?.find(
    (image) => image.slot_id === slotId,
  );
  if (!responseTask || !responseImage) {
    throw new Error("图像模型已返回，但没有找到当前图框的生成结果。");
  }
  const visualNode = [...next.nodeOutputs]
    .reverse()
    .find((nodeOutput) => nodeOutput.node === "visual_image_generation");
  const visualNodeKey = visualNode ? tokenResponseKey(visualNode) : null;
  const shouldAppendVisualNode = Boolean(
    visualNode &&
      (!visualNodeKey ||
        !current.nodeOutputs.some(
          (nodeOutput) => tokenResponseKey(nodeOutput) === visualNodeKey,
        )),
  );
  return {
    ...current,
    pagePlan: {
      ...current.pagePlan,
      pages: current.pagePlan.pages.map((currentPage) => {
        if (currentPage.page_id !== pageId) return currentPage;
        const currentTask = currentPage.visual_task ?? responseTask;
        const mergedImages = [
          ...(currentTask.generated_images ?? []).filter(
            (image) => image.slot_id !== slotId,
          ),
          responseImage,
        ].sort(
          (left, right) =>
            currentTask.image_slots.findIndex(
              (slot) => slot.slot_id === left.slot_id,
            ) -
            currentTask.image_slots.findIndex(
              (slot) => slot.slot_id === right.slot_id,
            ),
        );
        const responseConversationEntry = responseTask.conversation.at(-1);
        const conversation = responseConversationEntry
          ? [
              ...currentTask.conversation.filter(
                (entry) =>
                  !(
                    entry.role === responseConversationEntry.role &&
                    entry.round === responseConversationEntry.round &&
                    entry.content === responseConversationEntry.content
                  ),
              ),
              responseConversationEntry,
            ]
          : currentTask.conversation;
        return {
          ...currentPage,
          visual_task: {
            ...currentTask,
            image_prompt: responseTask.image_prompt,
            generated_images:
              mergedImages as typeof currentTask.generated_images,
            generated_image: legacyGeneratedImageFromSlots(
              mergedImages as NonNullable<PageVisualTask["generated_images"]>,
              responseTask.generated_image,
            ),
            conversation,
          },
        };
      }),
    },
    nodeOutputs:
      shouldAppendVisualNode && visualNode
        ? [...current.nodeOutputs, visualNode]
        : current.nodeOutputs,
    modelCallCount:
      current.modelCallCount +
      (shouldAppendVisualNode && visualNode ? visualNode.model_calls : 0),
    executionMode: next.executionMode ?? current.executionMode,
    modelName: next.modelName ?? current.modelName,
  } satisfies PipelineResult;
}

async function callPipeline<T = PipelineResult>(
  body: unknown,
  apiSettings: ApiSettings,
  options: {
    transportRetries?: number;
    onTransportRetry?: (attempt: number) => void;
  } = {},
) {
  const requestBody = JSON.stringify({
    ...(body as Record<string, unknown>),
    apiConfig: {
      baseUrl: apiSettings.baseUrl,
      model: apiSettings.model,
      imageBaseUrl: apiSettings.imageBaseUrl,
      imageModel: apiSettings.imageModel,
      ...(apiSettings.apiKey ? { apiKey: apiSettings.apiKey } : {}),
      ...(apiSettings.imageApiKey
        ? { imageApiKey: apiSettings.imageApiKey }
        : {}),
    },
  });
  const maxAttempts = 1 + (options.transportRetries ?? 0);
  let response: Response | null = null;
  let transportError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      response = await fetch("/api/pipeline", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(body &&
          typeof body === "object" &&
          ((body as { action?: unknown }).action === "generate_visual_image" ||
            ((body as { action?: unknown; projectFacts?: { task_mode?: string } }).action ===
              "prepare_export" &&
              (body as { projectFacts?: { task_mode?: string } }).projectFacts
                ?.task_mode === "small_building_or_interior"))
            ? { accept: "text/event-stream" }
            : {}),
        },
        body: requestBody,
      });
      break;
    } catch (caught) {
      transportError = caught;
      if (attempt + 1 >= maxAttempts) break;
      options.onTransportRetry?.(attempt + 1);
      await new Promise((resolve) =>
        window.setTimeout(resolve, attempt === 0 ? 600 : 1_500),
      );
    }
  }
  if (!response) {
    throw new PipelineClientError(
      `本机服务连接中断${
        maxAttempts > 1 ? `，已自动重试 ${maxAttempts - 1} 次` : ""
      }。任务已保留，可直接恢复。`,
      "LOCAL_TRANSPORT",
      true,
      "本机请求",
      "",
      maxAttempts,
    );
  }
  const rawResponse = await response.text();
  const isEventStream = response.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("text/event-stream");
  let data: {
    error?: string;
    errorCode?: string;
    retryable?: boolean;
    stage?: string;
    requestId?: string;
    attemptCount?: number;
    retryAfterMs?: number;
  } & T;
  if (isEventStream) {
    const terminalEvent = rawResponse
      .split(/\r?\n\r?\n/)
      .map((block) =>
        block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join(""),
      )
      .filter(Boolean)
      .map((value) => {
        try {
          return JSON.parse(value) as {
            type?: string;
            payload?: typeof data;
            error?: string;
            errorCode?: string;
            retryable?: boolean;
            stage?: string;
            requestId?: string;
            attemptCount?: number;
            retryAfterMs?: number;
          };
        } catch {
          return null;
        }
      })
      .filter(
        (event): event is NonNullable<typeof event> =>
          event !== null &&
          (event.type === "result" || event.type === "error"),
      )
      .at(-1);
    if (!terminalEvent) {
      throw new PipelineClientError(
        "云端长任务连接已中断，未收到最终结果；任务已保留，可直接恢复。",
        "INVALID_RESPONSE",
        true,
        "服务端响应",
        response.headers.get("x-request-id") ??
          response.headers.get("x-cloudbase-request-id") ??
          "",
        1,
        45_000,
      );
    }
    data = (
      terminalEvent.type === "result"
        ? terminalEvent.payload ?? {}
        : terminalEvent
    ) as typeof data;
  } else {
    try {
      data = (rawResponse ? JSON.parse(rawResponse) : {}) as typeof data;
    } catch {
    const requestId =
      response.headers.get("x-request-id") ??
      response.headers.get("x-cloudbase-request-id") ??
      "";
    const retryable = [408, 425, 429, 500, 502, 503, 504].includes(
      response.status,
    );
    const statusLabel = response.status
      ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
      : "无状态码";
    const action =
      body && typeof body === "object"
        ? (body as { action?: unknown }).action
        : undefined;
    const stageLabel = action === "prepare_export" ? "终稿文案整理" : "生图";
    const message = retryable
      ? `云端服务暂时不可用（${statusLabel}）。网关提前结束了等待，${stageLabel}请求可能仍在上游处理；任务已保留，可用原任务编号恢复。`
      : `云端返回了无法解析的响应（${statusLabel}），请检查服务配置后重试。`;
    throw new PipelineClientError(
      message,
      "INVALID_RESPONSE",
      retryable,
      "服务端响应",
      requestId,
      1,
      0,
    );
    }
  }
  if (!response.ok || data.error) {
    throw new PipelineClientError(
      data.error ?? "处理失败",
      data.errorCode,
      data.retryable,
      data.stage,
      data.requestId,
      data.attemptCount,
      data.retryAfterMs,
    );
  }
  void transportError;
  return data;
}

const visualImageDataUrlCache = new Map<string, string>();

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("当前项目已生成图面读取失败。"));
    reader.onerror = () => reject(new Error("当前项目已生成图面读取失败。"));
    reader.readAsDataURL(blob);
  });
}

async function compactContinuityImage(blob: Blob) {
  if (typeof createImageBitmap !== "function") return blob;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob);
    const maxEdge = 1024;
    const scale = Math.min(
      1,
      maxEdge / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0, width, height);
    const compacted = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.76),
    );
    return compacted && compacted.size < blob.size ? compacted : blob;
  } catch {
    return blob;
  } finally {
    bitmap?.close();
  }
}

function rememberVisualImageDataUrl(imageUrl: string, dataUrl: string) {
  visualImageDataUrlCache.set(imageUrl, dataUrl);
  while (visualImageDataUrlCache.size > 6) {
    const oldestKey = visualImageDataUrlCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    visualImageDataUrlCache.delete(oldestKey);
  }
}

async function visualImageToDataUrl(imageUrl: string) {
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(imageUrl)) {
    return imageUrl;
  }
  const cached = visualImageDataUrlCache.get(imageUrl);
  if (cached) return cached;
  if (imageUrl.startsWith("/reference-library/")) {
    throw new Error("后台素材库图片不得作为当前项目生图输入。");
  }
  if (
    !/^https?:\/\//i.test(imageUrl)
  ) {
    throw new Error("当前项目已生成图面无法作为跨页形态锚点读取。");
  }
  let response: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(imageUrl, { cache: "force-cache" });
      break;
    } catch (caught) {
      lastError = caught;
      if (attempt < 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 300),
        );
      }
    }
  }
  if (!response) {
    void lastError;
    throw new PipelineClientError(
      "读取当前项目已生成图面时网络中断，已自动重试 1 次。任务已保留，可直接恢复。",
      "REFERENCE_FETCH",
      true,
      "上传参考图",
      "",
      2,
    );
  }
  if (!response.ok) {
    throw new Error("无法读取当前项目已生成图面，请重新生成后再试。");
  }
  let blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const detectedType =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
        ? "image/png"
        : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          ? "image/jpeg"
          : new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
            ? "image/webp"
            : "";
    if (!detectedType) {
      throw new Error("当前项目已生成图面不是有效图片。");
    }
    blob = new Blob([bytes], { type: detectedType });
  }
  if (blob.size > 8_000_000) {
    throw new Error("当前项目已生成图面文件过大，请重新生成后再试。");
  }
  const compactedBlob = await compactContinuityImage(blob);
  const dataUrl = await blobToDataUrl(compactedBlob);
  rememberVisualImageDataUrl(imageUrl, dataUrl);
  return dataUrl;
}

async function testApiConnection(apiSettings: ApiSettings) {
  const response = await fetch("/api/pipeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "test_connection",
      apiConfig: {
        baseUrl: apiSettings.baseUrl,
        model: apiSettings.model,
        imageBaseUrl: apiSettings.imageBaseUrl,
        imageModel: apiSettings.imageModel,
        ...(apiSettings.apiKey ? { apiKey: apiSettings.apiKey } : {}),
        ...(apiSettings.imageApiKey
          ? { imageApiKey: apiSettings.imageApiKey }
          : {}),
      },
    }),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    modelAvailable?: boolean | null;
    imageModelAvailable?: boolean | null;
    availableImageModels?: string[];
    availableModelCount?: number | null;
    error?: string;
  };
  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? "模型连接测试失败");
  }
  return data;
}

function sumTokenUsage(
  nodeOutputs: PipelineResult["nodeOutputs"],
): TokenUsageSummary {
  return nodeOutputs.reduce(
    (total, nodeOutput) => {
      const isImageWorkflow =
        nodeOutput.node === "visual_image_generation";
      return {
        input:
          total.input +
          (isImageWorkflow ? 0 : nodeOutput.token_usage?.input ?? 0),
        output:
          total.output +
          (isImageWorkflow ? 0 : nodeOutput.token_usage?.output ?? 0),
        imageInput:
          total.imageInput +
          (isImageWorkflow ? nodeOutput.token_usage?.input ?? 0 : 0),
        imageOutput:
          total.imageOutput +
          (isImageWorkflow ? nodeOutput.token_usage?.output ?? 0 : 0),
        imageCalls:
          total.imageCalls +
          (isImageWorkflow ? nodeOutput.image_count ?? 0 : 0),
        images: total.images + (nodeOutput.image_count ?? 0),
      };
    },
    {
      input: 0,
      output: 0,
      imageInput: 0,
      imageOutput: 0,
      imageCalls: 0,
      images: 0,
    },
  );
}

function normalizeStoredTokenUsage(
  stored: Partial<TokenUsageSummary> | undefined,
  nodeOutputs: PipelineResult["nodeOutputs"],
): TokenUsageSummary {
  if (
    stored &&
    typeof stored.imageInput === "number" &&
    typeof stored.imageOutput === "number" &&
    typeof stored.imageCalls === "number"
  ) {
    return {
      input: stored.input ?? 0,
      output: stored.output ?? 0,
      imageInput: stored.imageInput,
      imageOutput: stored.imageOutput,
      imageCalls: stored.imageCalls,
      images: stored.images ?? 0,
    };
  }
  return sumTokenUsage(nodeOutputs);
}

function tokenResponseKey(
  nodeOutput: PipelineResult["nodeOutputs"][number],
) {
  return nodeOutput.response_id?.trim() || null;
}

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function StatusPill({
  status,
}: {
  status: string;
}) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {pageStatusLabel(status)}
    </span>
  );
}

function GatePill({
  label,
  status,
}: {
  label: string;
  status?: string;
}) {
  return (
    <div className={`gate-pill gate-${status ?? "waiting"}`}>
      {status === "ready" || status === "confirmed" ? (
        <Check size={13} />
      ) : (
        <CircleDot size={13} />
      )}
      <span>{label}</span>
      <strong>
        {!status
          ? "待判断"
          : status === "ready"
            ? "已就绪"
            : status === "confirmed"
              ? "已就绪"
            : status === "partial"
              ? "部分就绪"
              : "未就绪"}
      </strong>
    </div>
  );
}

function userFacingReadinessIssue(value: string) {
  return value
    .replace(/^Gate A 缺少：/, "事实缺少：")
    .replace(/^Gate B 缺少：/, "提案缺少：");
}

function FieldLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="field-label">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function documentTextLength(document: InputDocument) {
  return document.text
    .replace(/={3,}\s*PAGE\s+\d+\s*={3,}/gi, "")
    .trim().length;
}

const protectedHistoricalReferenceTerms = [
  "DK05",
  "SKP",
  "黄埔路",
  "马场",
  "中央公园",
  "奥林匹克体育中心",
  "天河公园",
  "珠江新城",
  "珠江公园",
  "广州塔",
  "广州会展",
  "广州金融城",
  "琶洲",
  "云骧双耀",
  "TWIN SKY PAVILION",
];

function visibleReferenceTerms(
  styleExamples: NonNullable<
    DesignReportProjectFacts["reference_style_examples"]
  >,
) {
  return [
    ...new Set([
      ...protectedHistoricalReferenceTerms,
      ...styleExamples.flatMap((example) => example.forbidden_terms),
    ]),
  ];
}

function hasForeignReferenceTerm(
  value: string,
  facts: DesignReportProjectFacts["facts"],
  styleExamples: NonNullable<
    DesignReportProjectFacts["reference_style_examples"]
  >,
) {
  const evidence = facts
    .map((fact) => `${String(fact.value_raw)} ${fact.source.quote}`)
    .join("\n");
  return visibleReferenceTerms(styleExamples).some(
    (term) => value.includes(term) && !evidence.includes(term),
  );
}

function hasSubstantialEnglishText(value: string) {
  return /[A-Za-z]{3,}/u.test(value);
}

function presentationBody(
  page: DesignReportPagePlan["pages"][number],
  facts: DesignReportProjectFacts["facts"],
  styleExamples: NonNullable<
    DesignReportProjectFacts["reference_style_examples"]
  >,
) {
  if (
    page.generation_status === "blocked" ||
    hasForeignReferenceTerm(page.body_copy, facts, styleExamples)
  ) {
    return "";
  }
  const preferredBody = hasSubstantialEnglishText(page.body_copy)
    ? page.body_zh
    : page.body_copy;
  const body = sanitizePresentationText(preferredBody);
  if (body) return body;
  if (
    !["ready", "generated", "reviewed"].includes(
      page.generation_status,
    ) ||
    ["cover", "toc", "section_divider"].includes(page.page_type)
  ) {
    return "";
  }
  const fieldLabels: Record<string, string> = {
    "project.name": "项目名称",
    "project.design_stage": "设计阶段",
    "site.location": "项目区位",
    "site.context": "场地周边",
    "site.constraints": "场地条件",
    "planning.site_area": "用地面积",
    "planning.far": "容积率",
    "planning.height_limit": "建筑限高",
    "area.total_gfa": "总建筑面积",
    "program.primary": "主要功能",
    "circulation.requirement": "交通要求",
    "evaluation.priorities": "评审重点",
    "evaluation.design_goal": "设计目标",
  };
  const evidenceItems = [
    ...new Set(
      facts
        .map((fact) => {
          const value = sanitizePresentationText(
            String(fact.value_raw),
          ).replace(/[。；;，,\s]+$/g, "");
          if (!value) return "";
          const label =
            fieldLabels[fact.field_path] ??
            sanitizePresentationText(fact.source.location_note) ??
            "当前项目信息";
          return `${label}：${value}`;
        })
        .filter(Boolean),
    ),
  ].slice(0, 3);
  return evidenceItems.length
    ? `当前项目证据包括：${evidenceItems.join("；")}。`
    : "";
}

function userFacingFactSource(
  fact: DesignReportProjectFacts["facts"][number],
) {
  if (fact.source_role === "brief_fact") {
    return `任务书第 ${fact.source.page} 页`;
  }
  if (fact.source_role === "proposal_fact") {
    return `当前方案资料第 ${fact.source.page} 页`;
  }
  if (fact.source_role === "research_fact") {
    return "公开地理数据";
  }
  return `当前资料第 ${fact.source.page} 页`;
}

function taskBriefPageLabels(
  projectFacts: DesignReportProjectFacts,
  factRefs: string[],
) {
  const pages = [
    ...new Set(
      factRefs
        .map((factId) =>
          projectFacts.facts.find((fact) => fact.fact_id === factId),
        )
        .filter(
          (fact): fact is DesignReportProjectFacts["facts"][number] =>
            Boolean(fact) && fact!.source_role === "brief_fact",
        )
        .map((fact) => fact.source.page),
    ),
  ].sort((left, right) => left - right);
  return pages.map((page) => `第 ${page} 页`).join("、");
}

function presentationLabels(
  page: DesignReportPagePlan["pages"][number],
  facts: DesignReportProjectFacts["facts"],
  styleExamples: NonNullable<
    DesignReportProjectFacts["reference_style_examples"]
  >,
  smallMode = false,
) {
  const safe = sanitizePresentationItems(page.diagram_labels)
    .filter(
      (label) => !hasForeignReferenceTerm(label, facts, styleExamples),
    );
  const uniqueSafe = [...new Set(safe)];
  if (page.page_type === "strategy") {
    if (smallMode) {
      const specific = [
        ...uniqueSafe,
        ...(page.callouts ?? []).map((callout) => callout.label_zh),
        ...page.visual_requirements,
      ]
        .map((item) => sanitizePresentationText(item))
        .filter(
          (item, index, all) =>
            Boolean(item) &&
            !containsBackstagePresentationText(item) &&
            !/^全篇设计系统｜|^对象/u.test(item) &&
            all.indexOf(item) === index,
        );
      return specific.slice(0, 4);
    }
    const fallback = contextualDiagramLabels(
      page.page_type,
      page.headline_zh,
      page.core_message,
      4,
    );
    return Array.from(
      { length: 4 },
      (_, index) =>
        uniqueSafe[index] ?? fallback[index] ?? `策略步骤 ${index + 1}`,
    );
  }
  if (uniqueSafe.length) return uniqueSafe.slice(0, 6);
  return contextualDiagramLabels(
    page.page_type,
    page.headline_zh,
    page.core_message,
    6,
  );
}

type PageVisualTask = NonNullable<
  DesignReportPagePlan["pages"][number]["visual_task"]
>;
type PageVisualAsset =
  | NonNullable<PageVisualTask["generated_image"]>
  | NonNullable<PageVisualTask["generated_images"]>[number]
  | NonNullable<PageVisualTask["reference_crop"]>;

interface VisualAssetPreviewState {
  asset: PageVisualAsset;
  title: string;
  fileName: string;
}

const visualTaskDisplayTitles: Record<
  DesignReportPagePlan["pages"][number]["page_type"],
  string
> = {
  cover: "封面主视觉",
  toc: "目录信息组织",
  section_divider: "章节主视觉",
  position: "场地定位与关键证据",
  analysis: "专题分析与判断依据",
  strategy: "策略动作与落位证据",
  concept: "概念表达与空间关系",
  comparison: "方案比较与评价依据",
  masterplan: "总体布局与空间关系",
  plan: "平面图纸与功能证据",
  section: "剖面关系与空间证据",
  rendering: "效果展示与空间体验",
  technical: "技术系统与构造证据",
  data: "数据关系与结论",
  summary: "方案总结与效果展示",
};

const visualTaskDefaultElements: Record<
  DesignReportPagePlan["pages"][number]["page_type"],
  string[]
> = {
  cover: ["项目主视觉", "项目名称", "设计阶段"],
  toc: ["章节名称", "章节顺序", "起始页码"],
  section_divider: ["章节主题", "空间氛围", "章节标题"],
  position: ["空间底图", "关键位置", "结论标注"],
  analysis: ["现状证据", "问题判断", "分析结论"],
  strategy: ["问题依据", "设计动作", "落位结果"],
  concept: ["概念起点", "空间动作", "设计结果"],
  comparison: ["评价维度", "方案差异", "比较结论"],
  masterplan: ["总平面主图", "关键空间", "关系标注"],
  plan: ["平面主图", "功能关系", "局部证据"],
  section: ["剖面主图", "空间关系", "局部证据"],
  rendering: ["整体空间", "重点场景", "体验线索"],
  technical: ["系统主图", "构造关系", "技术结论"],
  data: ["关键数据", "关系比较", "结论"],
  summary: ["方案结论", "整体效果", "重点空间"],
};

function isBackstageVisualPayload(value: string) {
  const normalized = value.trim();
  return (
    !normalized ||
    /^[\[{]/.test(normalized) ||
    /["']?(?:graphic_elements|search_focus|layout_logic|visual_intent|evidence_needed|relationship_to_show)["']?\s*[:：]/i.test(
      normalized,
    )
  );
}

function userFacingVisualText(value: string | undefined, fallback: string) {
  return value && !isBackstageVisualPayload(value) ? value.trim() : fallback;
}

function promptSummary(value: string | undefined, fallback: string) {
  const safe = userFacingVisualText(value, fallback).replace(/\s+/g, " ");
  return safe.length > 48 ? `${safe.slice(0, 47)}…` : safe;
}

function differentiatedVisualPromptSummary(
  label: string | undefined,
  promptFocus: string | undefined,
  purpose: string | undefined,
  fallback: string,
) {
  const safePrompt = userFacingVisualText(promptFocus, "");
  const focusedPart = safePrompt.match(
    /(?:当前图框只聚焦|当前画面只聚焦|本图只聚焦)\s*([^；。]+)/u,
  )?.[1];
  const differentiatedPart = userFacingVisualText(
    focusedPart || label,
    userFacingVisualText(purpose, fallback),
  ).replace(/^图片(?:\s*\d+)?待生成\s*[:：]?\s*/u, "");
  return `图片待生成：${promptSummary(differentiatedPart, fallback)}`;
}

function userFacingVisualItems(values: string[], fallback: string[]) {
  const safe = values
    .map((item) => item.trim())
    .filter((item) => !isBackstageVisualPayload(item));
  return safe.length ? [...new Set(safe)] : fallback;
}

function userFacingMissingMaterials(values: string[]) {
  const safe = userFacingVisualItems(values, []).map((item) =>
    /\b(?:DOC_UPLOAD|FACT|SOURCE|RSE|[A-Z0-9]+_RX)_?[A-Z0-9_-]*\b|^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+/i.test(
      item,
    )
      ? "需要补充对应的当前项目资料"
      : item,
  );
  return [...new Set(safe)];
}

function visualAssetStyle(asset?: PageVisualAsset) {
  if (!asset) return undefined;
  const isLibraryReference =
    "crop_zoom" in asset ||
    asset.image_url.startsWith("/reference-library/");
  return {
    backgroundImage: `url("${asset.image_url}")`,
    backgroundPosition:
      "background_position" in asset
        ? asset.background_position
        : "center",
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundColor: isLibraryReference ? "#fff" : undefined,
  };
}

function applyPersistedImageUrlUpdates(
  result: PipelineResult,
  updates: PersistedImageUrlUpdate[] | undefined,
) {
  if (!updates?.length) return result;
  const updatesBySlot = new Map(
    updates.map((update) => [`${update.pageId}:${update.slotId}`, update]),
  );
  return {
    ...result,
    pagePlan: {
      ...result.pagePlan,
      pages: result.pagePlan.pages.map((page) => {
        const task = page.visual_task;
        if (!task) return page;
        const updateFor = (slotId: string | undefined, currentUrl: string) => {
          if (!slotId) return currentUrl;
          const update = updatesBySlot.get(`${page.page_id}:${slotId}`);
          return update &&
            (currentUrl === update.sourceImageUrl || currentUrl === update.imageUrl)
            ? update.imageUrl
            : currentUrl;
        };
        const generatedImages = task.generated_images?.map((image) => ({
          ...image,
          image_url: updateFor(image.slot_id, image.image_url),
        }));
        const firstSlotId = task.image_slots[0]?.slot_id;
        const generatedImage = task.generated_image
          ? {
              ...task.generated_image,
              image_url: updateFor(
                firstSlotId,
                task.generated_image.image_url,
              ),
            }
          : undefined;
        return {
          ...page,
          visual_task: {
            ...task,
            generated_images: generatedImages,
            generated_image: generatedImage,
          },
        };
      }),
    },
  } as PipelineResult;
}

async function waitForPdfVisualAssets() {
  const assetUrls = new Set<string>();
  for (const element of window.document.querySelectorAll(
    ".pdf-export-deck [style*='background-image']",
  )) {
    const backgroundImage = window.getComputedStyle(element).backgroundImage;
    for (const match of backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)) {
      if (match[1]) assetUrls.add(match[1]);
    }
  }
  const loadAsset = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`PDF 图片加载失败：${url}`));
      image.src = url;
      if (image.complete && image.naturalWidth > 0) resolve();
    });
  await Promise.all(
    [...assetUrls].map(async (url) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await loadAsset(url);
          return;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) =>
            window.setTimeout(resolve, attempt * 500),
          );
        }
      }
      throw lastError ?? new Error(`PDF 图片加载失败：${url}`);
    }),
  );
  await new Promise<void>((resolve) =>
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve()),
    ),
  );
}

type PdfExportPpi = 144 | 300;

async function preparePdfRasterAssets(ppi: PdfExportPpi) {
  const elements = [...window.document.querySelectorAll<HTMLElement>(
    ".pdf-export-deck [style*='background-image']",
  )];
  const originalStyles = elements.map((element) => ({
    element,
    backgroundImage: element.style.backgroundImage,
  }));
  const targetBoxes = new Map<string, { width: number; height: number }>();
  const cssPixelScale = ppi / 96;

  for (const element of elements) {
    const backgroundImage = window.getComputedStyle(element).backgroundImage;
    const rect = element.getBoundingClientRect();
    for (const match of backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)) {
      const url = match[1];
      if (!url) continue;
      const current = targetBoxes.get(url) ?? { width: 0, height: 0 };
      targetBoxes.set(url, {
        width: Math.max(current.width, rect.width * cssPixelScale),
        height: Math.max(current.height, rect.height * cssPixelScale),
      });
    }
  }

  const rasterUrls = new Map<string, string>();
  for (const [url, target] of targetBoxes) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const sourceBlob = await response.blob();
      const bitmap = await createImageBitmap(sourceBlob);
      const requiredScale = Math.max(
        target.width / bitmap.width,
        target.height / bitmap.height,
      );
      if (requiredScale >= 0.98) {
        bitmap.close();
        continue;
      }
      const width = Math.max(1, Math.round(bitmap.width * requiredScale));
      const height = Math.max(1, Math.round(bitmap.height * requiredScale));
      const canvas = window.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        bitmap.close();
        continue;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const outputBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", ppi === 300 ? 0.96 : 0.9),
      );
      if (outputBlob) rasterUrls.set(url, URL.createObjectURL(outputBlob));
    } catch {
      // Keep the original image if a cross-origin source cannot be resampled.
    }
  }

  for (const element of elements) {
    let backgroundImage = window.getComputedStyle(element).backgroundImage;
    for (const [sourceUrl, rasterUrl] of rasterUrls) {
      backgroundImage = backgroundImage.replaceAll(
        `url("${sourceUrl}")`,
        `url("${rasterUrl}")`,
      );
      backgroundImage = backgroundImage.replaceAll(
        `url('${sourceUrl}')`,
        `url("${rasterUrl}")`,
      );
      backgroundImage = backgroundImage.replaceAll(
        `url(${sourceUrl})`,
        `url("${rasterUrl}")`,
      );
    }
    element.style.backgroundImage = backgroundImage;
  }

  await waitForPdfVisualAssets();
  return () => {
    for (const { element, backgroundImage } of originalStyles) {
      element.style.backgroundImage = backgroundImage;
    }
    for (const rasterUrl of rasterUrls.values()) URL.revokeObjectURL(rasterUrl);
  };
}

const a3AutoFitTextSelector = [
  ".a3-project-name",
  ".a3-section-title",
  ".a3-reference-heading strong",
  ".a3-reference-heading > span",
  ".a3-toc-heading p",
  ".a3-toc-copy strong",
  ".a3-toc-copy span",
  ".a3-generated-multi-grid article > strong",
  ".a3-generated-multi-grid article > small",
  ".a3-generated-visual-copy h3",
  ".a3-generated-visual-copy > p",
  ".a3-strategy-caption strong",
  ".a3-strategy-caption small",
  ".a3-option-note b",
  ".a3-option-note small",
  ".a3-concept-copy h3",
  ".a3-concept-copy h4",
  ".a3-concept-copy p",
  ".a3-rendering-band p",
  ".a3-summary-copy h3",
  ".a3-summary-copy > p",
  ".a3-summary-claims strong",
  ".a3-summary-visuals article > span",
  ".a3-section-feature-copy > p",
  ".a3-section-feature-points strong",
  ".a3-section-feature-points article > small",
  ".a3-metric-panel strong",
  ".a3-program-cards strong",
  ".a3-program-cards span",
  ".a3-data-statement",
  ".a3-supporting-caption strong",
  ".a3-supporting-caption span",
  ".a3-position-copy h3",
  ".a3-position-core",
  ".a3-position-body",
  ".a3-position-evidence strong",
  ".a3-copy-column h3",
  ".a3-core-message",
  ".a3-body-copy",
  ".a3-callout-grid strong",
  ".a3-callout-grid small",
  ".a3-callout-grid em",
  ".small-mode-cover-content h1",
  ".small-mode-cover-content p",
  ".small-mode-cover-content small",
  ".small-mode-page-copy h3",
  ".small-mode-page-core",
  ".small-mode-info-grid span",
  ".small-mode-visual-caption strong",
  ".small-mode-visual-caption small",
].join(",");

const a3TextConstraintSelector = [
  ".a3-header",
  ".a3-reference-heading",
  ".a3-toc-heading",
  ".a3-toc-copy",
  ".a3-generated-multi-grid article",
  ".a3-generated-visual-copy",
  ".a3-strategy-caption",
  ".a3-option-note",
  ".a3-concept-copy",
  ".a3-rendering-band",
  ".a3-summary-copy",
  ".a3-summary-claims > div",
  ".a3-summary-visuals article",
  ".a3-metric-panel > div",
  ".a3-program-cards article",
  ".a3-supporting-caption",
  ".a3-position-copy",
  ".a3-position-evidence > div",
  ".a3-copy-column",
  ".a3-callout-grid article",
  ".small-mode-cover-content",
  ".small-mode-page-copy",
  ".small-mode-visual-caption",
].join(",");

function textExceedsA3Frame(element: HTMLElement, sheet: HTMLElement) {
  // Hidden/conditional content in the offscreen PDF deck has no measurable
  // box. It must not turn a whole page into a false-positive overflow.
  if (element.clientWidth === 0 && element.clientHeight === 0) {
    return false;
  }
  const dimensionTolerance = 4;
  if (
    element.scrollHeight > element.clientHeight + dimensionTolerance ||
    element.scrollWidth > element.clientWidth + dimensionTolerance
  ) {
    return true;
  }

  const elementRect = element.getBoundingClientRect();
  const constraint = element.parentElement?.closest<HTMLElement>(
    a3TextConstraintSelector,
  );
  if (constraint && constraint !== element) {
    const constraintRect = constraint.getBoundingClientRect();
    if (
      elementRect.bottom > constraintRect.bottom + 1 ||
      elementRect.right > constraintRect.right + 1
    ) {
      return true;
    }
  }
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== sheet) {
    const overflow = window.getComputedStyle(ancestor).overflow;
    if (overflow === "hidden" || overflow === "clip") {
      const ancestorRect = ancestor.getBoundingClientRect();
      if (
        elementRect.bottom > ancestorRect.bottom + 1 ||
        elementRect.right > ancestorRect.right + 1
      ) {
        return true;
      }
    }
    ancestor = ancestor.parentElement;
  }
  return false;
}

function A3PagePreview({
  page,
  section,
  sections,
  pages,
  facts,
  projectName,
  companyName = DEFAULT_COMPANY_NAME,
  taskMode = DEFAULT_TASK_MODE,
  referenceStyleLibrary,
  visualMode = false,
  referenceDraftsAllowed = false,
  selectedVisualSlotId,
  onSelectVisualSlot,
  onGenerateVisualSlot,
  onOpenVisualAsset,
  visualImageGenerating = false,
}: {
  page: DesignReportPagePlan["pages"][number];
  section?: DesignReportPagePlan["sections"][number];
  sections: DesignReportPagePlan["sections"];
  pages: DesignReportPagePlan["pages"];
  facts: DesignReportProjectFacts["facts"];
  projectName: string;
  companyName?: string;
  taskMode?: TaskMode;
  referenceStyleLibrary: NonNullable<
    DesignReportProjectFacts["reference_style_examples"]
  >;
  visualMode?: boolean;
  referenceDraftsAllowed?: boolean;
  selectedVisualSlotId?: string | null;
  onSelectVisualSlot?: (slotId: string) => void;
  onGenerateVisualSlot?: (slotId: string) => void;
  onOpenVisualAsset?: (asset: PageVisualAsset, title: string) => void;
  visualImageGenerating?: boolean;
}) {
  const smallMode = isSmallBuildingMode(taskMode);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [slotActionPosition, setSlotActionPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const reportBody = presentationBody(
    page,
    facts,
    referenceStyleLibrary,
  );
  const reportHeadline = normalizePageHeadline(
    smallMode && page.page_type === "summary" ? "设计总结" : page.headline_zh,
    displayPageTypeLabel(page),
  );
  const reportHeadlineEn = sanitizePresentationText(
    smallMode && page.page_type === "cover"
      ? SMALL_COVER_REPORT_TITLE_EN
      : smallMode && page.page_type === "summary"
        ? "DESIGN SUMMARY"
        : page.headline_en,
    englishPresentationText(
      page.headline_zh,
      pageTypeEnglishLabels[page.page_type],
    ),
  );
  const reportCoreMessage = hasSubstantialEnglishText(page.core_message)
    ? ""
    : sanitizePresentationText(page.core_message);
  const reportBodyWithCore =
    reportBody && reportCoreMessage && !reportBody.includes(reportCoreMessage)
      ? `${reportCoreMessage} ${reportBody}`
      : reportBody || reportCoreMessage;
  const pageFactIds = new Set(page.fact_refs ?? []);
  const confirmedConceptValues = facts
    .filter(
      (fact) =>
        fact.field_path === "proposal.design_concept" &&
        fact.status !== "superseded" &&
        fact.status !== "conflict",
    )
    .sort(
      (left, right) =>
        Number(pageFactIds.has(right.fact_id)) -
        Number(pageFactIds.has(left.fact_id)),
    )
    .map((fact) => formatFactValue(fact.value_raw));
  const conceptName =
    page.page_type === "concept"
      ? extractConceptName(
          [reportHeadline, reportCoreMessage, reportBody],
          confirmedConceptValues,
        )
      : "";
  const conceptNameEn = conceptName
    ? extractEnglishConceptName([
        page.headline_en,
        page.core_message_en,
        page.body_en,
      ]) || englishPresentationText(conceptName, "")
    : "";
  const coreConceptHeadline = conceptName
    ? `核心概念：${conceptName}`
    : reportHeadline;
  const coreConceptHeadlineEn = conceptName
    ? `CORE CONCEPT${conceptNameEn ? `: ${conceptNameEn}` : ""}`
    : reportHeadlineEn;
  const reportDiagramLabels = presentationLabels(
    page,
    facts,
    referenceStyleLibrary,
    smallMode,
  );
  const verifiedMetricLabels = facts
    .filter(
      (fact) =>
        fact.status !== "superseded" &&
        /^(?:planning\.|area\.)/.test(fact.field_path),
    )
    .slice(0, 5)
    .map(
      (fact) =>
        `${factFieldLabels[fact.field_path] ?? fact.field_path} ${formatFactValue(fact.value_raw)}`,
    );
  const callouts =
    page.callouts?.length
      ? page.callouts.map((callout) => {
          const fact = callout.fact_ref
            ? facts.find((item) => item.fact_id === callout.fact_ref)
            : undefined;
          return {
            label:
              cleanPresentationLabel(callout.label_zh) &&
              !containsBackstagePresentationText(callout.label_zh) &&
              !hasForeignReferenceTerm(
                callout.label_zh,
                facts,
                referenceStyleLibrary,
              )
                ? cleanPresentationLabel(callout.label_zh)
                : "当前项目要点",
            source: fact?.source,
          };
        })
      : facts.slice(0, 4).map((fact) => ({
          label: String(fact.value_raw),
          source: fact.source,
        }));
  const smallModeInstallationPage = /装置\s*[0-9一二三四五六七八九十]+/u.test(
    page.headline_zh,
  );
  const smallModeInfoLimit =
    smallModeInstallationPage && page.page_type === "concept" ? 6 : 4;
  const smallModeInfoItems = [
    ...callouts.map((item) => item.label),
    ...reportBodyWithCore
      .split(/[。；]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 8 && item.length <= 42),
  ]
    .map((item) => sanitizePresentationText(item))
    .filter(
      (item, index, all) =>
        Boolean(item) &&
        !/任务书|事实与证据|本页核心结论|页面正文|图解标签|讲述提示/.test(
          item,
        ) &&
        all.indexOf(item) === index,
    )
    .slice(0, smallModeInfoLimit);
  const strategyDescriptions =
    page.page_type === "strategy"
      ? reportDiagramLabels.slice(0, 4).map((label, index) => {
          const explicitDescription =
            (page.callouts?.length ?? 0) >= 4
              ? callouts[index]?.label
              : "";
          return explicitDescription && explicitDescription !== label
            ? explicitDescription
            : smallMode
              ? sanitizePresentationText(
                  page.visual_requirements.find(
                    (item) =>
                      !containsBackstagePresentationText(item) &&
                      !/^全篇设计系统｜|^对象/u.test(item) &&
                      item !== label,
                  ),
                  reportCoreMessage,
                )
              : strategyStepDescription(label, index);
        })
      : [];
  const imageSlots = page.visual_task?.image_slots ?? [];
  // Page type fixes the frame count before any visual material is matched.
  // Later visual work may fill frames, but must not change the A3 layout.
  const expectedImageSlotCount = Math.max(
    imageSlots.length,
    smallMode
      ? page.page_type === "summary"
        ? 3
        : 1
      : getVisualImageSlotCountForPage(page),
  );
  const frameLayout =
    page.visual_task?.frame_layout ??
    getVisualFrameLayout(
      page,
      page.visual_task?.visual_intent,
      expectedImageSlotCount,
    );
  const storedGeneratedVisuals: PageVisualAsset[] =
    page.visual_task?.generated_images?.length
      ? page.visual_task.generated_images
      : page.visual_task?.generated_image
        ? [page.visual_task.generated_image]
        : [];
  const summaryReuseVisuals: Array<PageVisualAsset | undefined> =
    smallMode && page.page_type === "summary"
      ? (pages
          .filter((candidate) => candidate.page_type === "rendering")
          .sort(
            (left, right) =>
              (left.display_page_number ?? 0) -
              (right.display_page_number ?? 0),
          )
          .filter((candidate) => /装置\s*[123]/u.test(candidate.headline_zh))
          .slice(0, 3)
          .map(
            (candidate) =>
              candidate.visual_task?.generated_images?.[0] ??
              candidate.visual_task?.generated_image,
          ) as Array<PageVisualAsset | undefined>)
      : [];
  const generatedModelVisuals: PageVisualAsset[] = storedGeneratedVisuals.filter(
    (asset, index) => {
      const slot =
        imageSlots.find(
          (candidate) =>
            "slot_id" in asset && candidate.slot_id === asset.slot_id,
        ) ??
        imageSlots[index];
      return canGenerateVisualImageForSlot(page.page_type, slot);
    },
  );
  const visualForSlot = (index: number): PageVisualAsset | undefined => {
    if (summaryReuseVisuals.length && page.page_type === "summary") {
      return summaryReuseVisuals[index];
    }
    const slot = imageSlots[index];
    const slotId = slot?.slot_id;
    const canUseGeneratedImage = canGenerateVisualImageForSlot(
      page.page_type,
      slot,
    );
    const generatedForSlot = slotId && canUseGeneratedImage
      ? page.visual_task?.generated_images?.find(
          (asset) => asset.slot_id === slotId,
        )
      : undefined;
    if (generatedForSlot) return generatedForSlot;
    if (
      index === 0 &&
      canUseGeneratedImage &&
      page.visual_task?.generated_image
    ) {
      return page.visual_task.generated_image;
    }
    // Metric-boundary references can contain historical project numbers.
    // Keep them backstage for model guidance and render only current-project
    // programmatic metrics until the user generates a replacement image.
    if (isMetricBoundaryPage(page) || !referenceDraftsAllowed) return undefined;
    const libraryReferenceForSlot = slotId
      ? page.visual_task?.slot_reference_crops?.find(
          (asset) => asset.slot_id === slotId,
        )
      : undefined;
    if (libraryReferenceForSlot) return libraryReferenceForSlot;
    if (index > 0) return undefined;
    return page.visual_task?.reference_crop;
  };
  const generatedVisual = visualForSlot(0);
  const generatedVisualStyle = visualAssetStyle(generatedVisual);
  // Keep the generated core-concept image inside its explicit backdrop frame.
  // Applying it to the entire sheet made the visible frame remain empty even
  // though the image had been generated successfully.
  const usesFullBleedConceptVisual = false;
  const conceptBackdropVisual = generatedVisual;
  const generatedVisualForSlot = (index: number) => {
    return visualForSlot(index);
  };
  const slotVisuals = Array.from(
    { length: expectedImageSlotCount },
    (_, index) => visualForSlot(index),
  );
  const usesMultipleVisualFrames = expectedImageSlotCount > 1;
  const visibleCaptionForSlot = (index: number) => {
    const slot = imageSlots[index];
    const defaultTitle =
      reportDiagramLabels[index] || slot?.label || reportHeadline;
    const defaultDetail =
      callouts[index]?.label && callouts[index]?.label !== defaultTitle
        ? callouts[index].label
        : slot?.purpose || reportCoreMessage;
    if (smallMode) {
      if (/IP与三件装置|现场联动/u.test(page.headline_zh)) {
        return {
          title: slot?.label || "轻国风少女 IP 串联三处现场",
          detail: "真人角色现场互动",
        };
      }
      const cleanAudienceText = (values: Array<string | undefined>, fallback: string) => {
        const candidate = values
          .map((value) => sanitizePresentationText(value))
          .find(
            (value) =>
              Boolean(value) &&
              !containsBackstagePresentationText(value) &&
              !/(只用一张|必须|不得|当前图框|提示词|证明本页|任务书|图像需要|图像必须)/u.test(
                value,
              ),
          );
        return candidate || fallback;
      };
      const captionCharacterCount = (value: string | undefined) =>
        Array.from(String(value ?? "").replace(/\s+/gu, "")).length;
      const shortCaptionFallback = (contextOverride?: string) => {
        const context =
          contextOverride ?? `${reportHeadline} ${reportCoreMessage} ${slot?.label ?? ""}`;
        if (/泡茶|泡茶水|茶香|甜/u.test(context)) return "泡茶闻香体验";
        if (/器|瓷|共创/u.test(context)) return "瓷器共创体验";
        if (/真|山泉|源头/u.test(context)) return "源头真实体验";
        if (/IP|少女|角色/u.test(context)) return "现场角色互动";
        if (/复用|收起|再部署/u.test(context)) return "收起与再次部署";
        if (/总结|收束|总览/u.test(context)) return "三件装置整体收束";
        return `图片${index + 1}设计证据`;
      };
      const rawCaption = cleanAudienceText(
        [callouts[index]?.label, reportDiagramLabels[index], slot?.label],
        `${reportHeadline} · ${index + 1}`,
      );
      const captionParts = rawCaption.match(
        /^([^｜|:：]{1,32})[｜|:：]\s*(.+)$/u,
      );
      const title = captionParts?.[1]?.trim() || rawCaption;
      const embeddedDetail = captionParts?.[2]?.trim();
      const detail = [
        embeddedDetail,
        callouts[index]?.label,
        reportDiagramLabels[index],
        slot?.label,
      ]
        .map((value) => sanitizePresentationText(value))
        .find(
          (value) =>
            Boolean(value) &&
            value !== title &&
            captionCharacterCount(value) <= 25,
        );
      const boundedDetail =
        detail || shortCaptionFallback(`${title} ${slot?.label ?? ""}`);
      return { title, detail: boundedDetail };
    }
    if (page.page_type === "strategy") {
      return {
        title: previewItems[index] || defaultTitle,
        detail: strategyDescriptions[index] || defaultDetail,
      };
    }
    if (page.page_type === "comparison") {
      return {
        title: previewItems[index] || defaultTitle,
        detail: `方案 ${index + 1}的图像必须直接表达该图注，不得借用其他方案内容。`,
      };
    }
    if (page.page_type === "summary") {
      const summaryLabels = ["总体形象", "公共空间", "重点空间"];
      return {
        title: summaryLabels[index] || defaultTitle,
        detail: previewItems[index] || defaultDetail,
      };
    }
    return { title: defaultTitle, detail: defaultDetail };
  };
  const pendingVisualPrompt = (index: number) => {
    const slot = imageSlots[index];
    return differentiatedVisualPromptSummary(
      slot?.label,
      slot?.prompt_focus,
      slot?.purpose,
      reportDiagramLabels[index] || `图片 ${index + 1}待生成`,
    );
  };
  const slotInteraction = (index: number) => {
    const slotId = imageSlots[index]?.slot_id;
    const visibleCaption = visibleCaptionForSlot(index);
    const asset = visualForSlot(index);
    const openInteraction =
      asset && onOpenVisualAsset
        ? {
            title: "双击查看大图并保存",
            onDoubleClick: (event: React.MouseEvent<HTMLElement>) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenVisualAsset(
                asset,
                visibleCaption.title || `${reportHeadline} 图片 ${index + 1}`,
              );
            },
          }
        : {};
    const pendingLabel = { "data-pending-label": pendingVisualPrompt(index) };
    if (!visualMode || !slotId || !onSelectVisualSlot) {
      return { ...pendingLabel, ...openInteraction };
    }
    return {
      ...pendingLabel,
      role: "button" as const,
      tabIndex: 0,
      "data-visual-slot-id": slotId,
      "data-visual-slot-caption-title": visibleCaption.title,
      "data-visual-slot-caption-detail": visibleCaption.detail,
      "aria-pressed": selectedVisualSlotId === slotId,
      onClick: () => onSelectVisualSlot(slotId),
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectVisualSlot(slotId);
        }
      },
      ...openInteraction,
    };
  };
  const slotClassName = (index: number, base: string) => {
    const slotId = imageSlots[index]?.slot_id;
    const pendingClass =
      !visualForSlot(index) && !base.includes("a3-concept-layout")
        ? "a3-pending-image-slot"
        : "";
    return `${base} ${
      visualMode && slotId ? "a3-selectable-image-slot" : ""
    } ${
      visualMode && slotId && selectedVisualSlotId === slotId
        ? "is-selected"
        : ""
    } ${pendingClass}`.trim();
  };
  // A3 visible copy comes only from the current page's presentation fields.
  // Visual briefs, prompts, material gaps, and draft zones remain backstage.
  const visualItems = reportDiagramLabels;
  const previewItems = Array.from({ length: 5 }, (_, index) =>
    reportDiagramLabels[index] ?? "",
  );
  const isP21KeySpacePage =
    page.display_page_number === 21 || /^P0*21$/iu.test(page.page_id);
  const isP20ConceptSequencePage =
    page.display_page_number === 20 || /^P0*20$/iu.test(page.page_id);
  const isP24ProgramPage =
    page.display_page_number === 24 || /^P0*24$/iu.test(page.page_id);
  const isP29FeatureSection =
    page.page_type === "section" &&
    (page.display_page_number === 29 || /^P0*29$/iu.test(page.page_id));
  const p24MetricEnglish = [
    "RETAIL PODIUM OPENS TO METRO AND PARK",
    "STAGGERED TOWERS SUPPORT INDEPENDENT USES",
    "SHARED LEVELS COORDINATE VERTICAL PUBLIC LINKS",
    "SEPARATE GROUND ENTRANCES SPLIT PEOPLE AND FREIGHT",
  ];
  const p20CaptionEnglish = [
    "CONTINUOUS PODIUM LINKS METRO AND PARK",
    "STAGGERED TOWERS FORM A HEIGHT GRADIENT",
    "SKY GARDENS AND BRIDGES EXTEND THE PUBLIC REALM",
    "VERTICAL GREENERY RESPONDS TO THE HOT-HUMID CLIMATE",
  ];
  const p29SectionNotes = [
    {
      title: "基座与地下接驳",
      titleEn: "PUBLIC PODIUM & METRO LINK",
      detail: "连续商业基座承接地面公共空间，并向下连接地铁与地下商业步行系统。",
    },
    {
      title: "空中庭院与连廊",
      titleEn: "SKY GARDENS & PUBLIC LINKS",
      detail: "错层空中庭院和公共连廊把首层公共体验延伸至塔楼高区。",
    },
    {
      title: "独立运营边界",
      titleEn: "CONTROLLED OPERATING BOUNDARIES",
      detail: "酒店、公寓与办公保持独立交通组织，并通过受控界面建立共享联系。",
    },
  ];
  const tocItems = sections
    .filter((item) => item.section_id !== page.section_id)
    .map((item) => ({
      ...item,
      startPage: pages.find(
        (candidate) => candidate.section_id === item.section_id,
      )?.display_page_number,
    }));
  const isHeroPage = page.page_type === "section_divider";
  const usesReferenceLayout = [
    "cover",
    "toc",
    "section_divider",
    "position",
    "strategy",
    "concept",
    "comparison",
    "masterplan",
    "plan",
    "section",
    "rendering",
    "technical",
    "data",
    "summary",
  ].includes(page.page_type);
  const pageNumber =
    page.display_page_number == null
      ? "—"
      : String(page.display_page_number).padStart(2, "0");
  const completeProjectName = projectName.trim() || "当前项目";
  const projectNameLength = [...completeProjectName].length;
  const projectNameLengthClass =
    projectNameLength > 32
      ? "is-very-long"
      : projectNameLength > 20
        ? "is-long"
        : "";

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    let animationFrame = 0;
    const fitTextWithoutTruncation = () => {
      delete sheet.dataset.a3LayoutOverflow;
      sheet
        .querySelectorAll<HTMLElement>("[data-a3-overflow-container]")
        .forEach((container) => {
          delete container.dataset.a3OverflowContainer;
          container.style.removeProperty("overflow");
        });
      const textNodes = Array.from(
        sheet.querySelectorAll<HTMLElement>(a3AutoFitTextSelector),
      );

      textNodes.forEach((element) => {
        element.dataset.a3Autofit = "true";
        delete element.dataset.a3Overflow;
        element.style.removeProperty("font-size");
        element.style.removeProperty("overflow");

        if (!textExceedsA3Frame(element, sheet)) return;

        const initialFontSize = Number.parseFloat(
          window.getComputedStyle(element).fontSize,
        );
        if (!Number.isFinite(initialFontSize)) return;

        const minimumFontSize = Math.max(3.5, initialFontSize * 0.62);
        let fittedFontSize = initialFontSize;
        while (
          fittedFontSize > minimumFontSize &&
          textExceedsA3Frame(element, sheet)
        ) {
          fittedFontSize = Math.max(minimumFontSize, fittedFontSize - 0.25);
          element.style.fontSize = `${fittedFontSize}px`;
        }

        if (textExceedsA3Frame(element, sheet)) {
          element.dataset.a3Overflow = "true";
          if (!smallMode) {
            element.style.overflow = "visible";
            let ancestor = element.parentElement;
            while (ancestor && ancestor !== sheet) {
              const overflow = window.getComputedStyle(ancestor).overflow;
              if (overflow === "hidden" || overflow === "clip") {
                ancestor.dataset.a3OverflowContainer = "true";
                ancestor.style.overflow = "visible";
              }
              ancestor = ancestor.parentElement;
            }
          }
        }
      });
      if (
        textNodes.some((element) => element.dataset.a3Overflow === "true")
      ) {
        sheet.dataset.a3LayoutOverflow = "true";
      }
    };

    const scheduleFit = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(fitTextWithoutTruncation);
    };
    scheduleFit();

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(sheet);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [
    page,
    section,
    projectName,
    reportBody,
    reportHeadline,
    reportHeadlineEn,
    reportCoreMessage,
    smallMode,
  ]);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !visualMode || !selectedVisualSlotId) {
      setSlotActionPosition(null);
      return;
    }
    const selectedFrame = Array.from(
      sheet.querySelectorAll<HTMLElement>("[data-visual-slot-id]"),
    ).find(
      (element) => element.dataset.visualSlotId === selectedVisualSlotId,
    );
    if (!selectedFrame) {
      setSlotActionPosition(null);
      return;
    }

    let animationFrame = 0;
    const placeAction = () => {
      const sheetRect = sheet.getBoundingClientRect();
      const frameRect = selectedFrame.getBoundingClientRect();
      const scaleX = sheetRect.width / Math.max(1, sheet.clientWidth);
      const scaleY = sheetRect.height / Math.max(1, sheet.clientHeight);
      const frameTop = (frameRect.top - sheetRect.top) / scaleY;
      const frameRight = (frameRect.right - sheetRect.left) / scaleX;
      setSlotActionPosition({
        left: Math.min(sheet.clientWidth - 8, Math.max(148, frameRight - 8)),
        top: frameTop > 42 ? frameTop - 36 : frameTop + 8,
      });
    };
    const schedulePlacement = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(placeAction);
    };
    schedulePlacement();
    const resizeObserver = new ResizeObserver(schedulePlacement);
    resizeObserver.observe(sheet);
    resizeObserver.observe(selectedFrame);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [page, selectedVisualSlotId, visualMode]);

  return (
    <div className="a3-preview-frame">
      <div
        ref={sheetRef}
        data-a3-page-id={page.page_id}
        className={`a3-sheet a3-page-${page.page_id.toLowerCase()} a3-type-${page.page_type} ${
          isHeroPage ? "a3-hero-sheet" : ""
         } ${usesReferenceLayout ? "a3-reference-sheet" : ""} ${
           visualMode ? "a3-visual-editing" : ""
         } ${
          page.page_type === "concept" && usesMultipleVisualFrames
            ? "a3-concept-sequence-sheet"
            : ""
        } ${
          usesFullBleedConceptVisual
            ? "a3-concept-page-background"
            : ""
        } ${smallMode ? "a3-small-mode-sheet" : ""} ${
          smallMode && page.page_type === "cover"
            ? "a3-small-cover-sheet"
            : ""
        }`}
        aria-label={`${reportHeadline} A3 页面预览`}
        style={
          usesFullBleedConceptVisual
            ? generatedVisualStyle
            : undefined
        }
      >
        <div className="a3-grid-lines" aria-hidden="true" />
        <header className="a3-header">
          <div>
            <span className="a3-section-index">{section?.section_id ?? page.section_id}</span>
            <span className="a3-section-title">
              {sanitizePresentationText(
                section?.title_zh,
                displayPageTypeLabel(page),
              )}
              <small>
                {sanitizePresentationText(
                  section?.title_en,
                  pageTypeEnglishLabels[page.page_type],
                )}
              </small>
            </span>
          </div>
          <div className="a3-header-meta">
            <span
              className={`a3-project-name ${projectNameLengthClass}`}
              title={completeProjectName}
            >
              {completeProjectName}
            </span>
          </div>
        </header>

        <div className="a3-main">
          {smallMode && page.page_type === "cover" ? (
            <section
              className="small-mode-cover-layout"
              style={generatedVisual ? generatedVisualStyle : undefined}
            >
              <div className="small-mode-cover-atmosphere" aria-hidden="true">
                <span className="small-mode-cover-orbit small-mode-cover-orbit-one" />
                <span className="small-mode-cover-orbit small-mode-cover-orbit-two" />
                <span className="small-mode-cover-pool" />
                <span className="small-mode-cover-mountain small-mode-cover-mountain-one" />
                <span className="small-mode-cover-mountain small-mode-cover-mountain-two" />
              </div>
              <div className="small-mode-cover-content">
                <span className="small-mode-cover-kicker">
                  {reportHeadlineEn}
                </span>
                <h1>{reportHeadline}</h1>
                <span className="small-mode-cover-rule" aria-hidden="true" />
                <p>{reportCoreMessage || reportBody}</p>
              </div>
            </section>
          ) : smallMode ? (
            <section
              className={`small-mode-page-layout small-mode-layout-${page.page_type} small-mode-slots-${Math.max(
                1,
                Math.min(6, expectedImageSlotCount),
              )}`}
            >
              <aside className="small-mode-page-copy">
                <h3>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </h3>
                <p className="small-mode-page-core">
                  {reportBodyWithCore}
                </p>
                {smallModeInfoItems.length ? (
                  <div className="small-mode-info-grid">
                    {smallModeInfoItems.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
              </aside>
              <div
                className={`small-mode-visual-grid small-mode-visual-count-${Math.max(
                  1,
                  Math.min(6, expectedImageSlotCount),
                )}`}
              >
                {slotVisuals.slice(0, 6).map((asset, index) => {
                  const caption = visibleCaptionForSlot(index);
                  return (
                  <article key={imageSlots[index]?.slot_id ?? `small-slot-${index}`}>
                    <div
                      className={slotClassName(index, asset ? "a3-ai-image-slot" : "")}
                      role={asset ? "img" : undefined}
                      aria-label={`${reportHeadline} 图片槽 ${index + 1}`}
                      style={visualAssetStyle(asset)}
                      {...slotInteraction(index)}
                    />
                    <div className="small-mode-visual-caption">
                      <strong>{caption.title}</strong>
                      <small>{caption.detail}</small>
                    </div>
                  </article>
                  );
                })}
              </div>
            </section>
          ) : page.page_type === "toc" ? (
            <section className="a3-reference-layout a3-toc-layout">
              <div className="a3-toc-heading">
                <div>
                  <span>汇报目录 / REPORT CONTENTS</span>
                  <h3>
                    目录
                    <small>CONTENTS</small>
                  </h3>
                </div>
                <p>
                  {reportCoreMessage}
                </p>
              </div>
              <div className="a3-toc-grid">
                {tocItems.map((item, index) => (
                  <article key={item.section_id}>
                    <div className="a3-toc-number">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="a3-toc-copy">
                      <strong>
                        {sanitizePresentationText(item.title_zh, "章节")}
                        <small>
                          {sanitizePresentationText(
                            item.title_en,
                            "SECTION",
                          )}
                        </small>
                      </strong>
                      <span>
                        {sanitizePresentationText(item.purpose)}
                      </span>
                    </div>
                    <b>
                      {item.startPage == null
                        ? "—"
                        : String(item.startPage).padStart(2, "0")}
                    </b>
                  </article>
                ))}
              </div>
            </section>
          ) : usesMultipleVisualFrames &&
            ![
              "strategy",
              "comparison",
              "masterplan",
              "plan",
              "section",
              "technical",
              "summary",
            ].includes(page.page_type) ? (
            <section
              className={`a3-generated-multi-layout ${
                page.page_type === "concept"
                  ? "a3-concept-sequence-layout"
                  : ""
              }`}
              style={
                isP21KeySpacePage
                  ? {
                      height: "100%",
                      gridTemplateRows: "minmax(0, 1fr)",
                    }
                  : undefined
              }
            >
              <div className="a3-generated-multi-copy">
                <span>{displayPageTypeLabel(page)}</span>
                <h3>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </h3>
                <p className="a3-generated-multi-core">
                  {reportCoreMessage}
                </p>
                {reportBody && reportBody !== reportCoreMessage ? (
                  <p className="a3-generated-multi-body">
                    {reportBody}
                  </p>
                ) : null}
              </div>
              <div
                className={`a3-generated-multi-grid a3-frame-layout-${frameLayout} a3-frame-count-${expectedImageSlotCount}`}
              >
                {slotVisuals.map((asset, index) => (
                  <article
                    key={
                      imageSlots[index]?.slot_id ?? `visual-slot-${index}`
                    }
                  >
                    <div
                      className={slotClassName(
                        index,
                        asset ? "a3-ai-image-slot" : "",
                      )}
                      role={asset ? "img" : undefined}
                      aria-label={`${reportHeadline} 图片槽 ${index + 1}`}
                      style={visualAssetStyle(asset)}
                      {...slotInteraction(index)}
                    />
                    <strong>
                      {reportDiagramLabels[index] ??
                        imageSlots[index]?.label ??
                        `视觉证据 ${index + 1}`}
                    </strong>
                    {isP20ConceptSequencePage ? (
                      <small className="a3-generated-caption-en">
                        {p20CaptionEnglish[index] ??
                          englishLabelFallback(page.page_type, index)}
                      </small>
                    ) : callouts[index]?.label &&
                    callouts[index].label !== reportDiagramLabels[index] ? (
                      <small>{callouts[index].label}</small>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : page.page_type === "strategy" ? (
            <section className="a3-reference-layout a3-strategy-layout">
              <div className="a3-reference-heading">
                <strong>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </strong>
                <span>规划策略 / PLANNING STRATEGY</span>
              </div>
              <div className="a3-strategy-cards">
                {previewItems.slice(0, 4).map((item, index) => {
                  const slotVisual = generatedVisualForSlot(index);
                  return (
                    <article key={`${item}-${index}`}>
                      <div className="a3-strategy-number">
                        <strong>策略{["一", "二", "三", "四"][index]}</strong>
                        <span>STRATEGY {index + 1}</span>
                      </div>
                      <div
                        className={slotClassName(
                          index,
                          `a3-strategy-visual ${
                            slotVisual ? "a3-ai-image-slot" : ""
                          }`,
                        )}
                        role={slotVisual ? "img" : undefined}
                        aria-label={
                          slotVisual
                            ? `${reportHeadline} 策略图框 ${index + 1}`
                            : undefined
                        }
                        style={visualAssetStyle(slotVisual)}
                        {...slotInteraction(index)}
                      >
                        <i aria-hidden="true" />
                      </div>
                      <div className="a3-strategy-caption">
                        <strong>
                          {item}
                        </strong>
                        <small>{strategyDescriptions[index]}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : page.page_type === "comparison" ? (
            <section className="a3-reference-layout a3-comparison-layout">
              <div className="a3-reference-heading">
                <strong>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </strong>
                <span>方案比较 / OPTION COMPARISON</span>
              </div>
              <div className="a3-comparison-columns">
                {previewItems.slice(0, 3).map((item, index) => {
                  const slotVisual = generatedVisualForSlot(index);
                  return (
                    <article key={`${item}-${index}`}>
                      <div className="a3-option-index">{index + 1}</div>
                      <div
                        className={slotClassName(
                          index,
                          `a3-option-diagram ${
                            slotVisual ? "a3-ai-image-slot" : ""
                          }`,
                        )}
                        role={slotVisual ? "img" : undefined}
                        aria-label={
                          slotVisual
                            ? `${reportHeadline} 方案图框 ${index + 1}`
                            : undefined
                        }
                        style={visualAssetStyle(slotVisual)}
                        {...slotInteraction(index)}
                      >
                        <span />
                        <span />
                        <span />
                      </div>
                      <strong>方案 {index + 1} / OPTION {index + 1}</strong>
                      <div className="a3-option-note">
                        <b>
                          {item}
                        </b>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : page.page_type === "summary" ? (
            <section className="a3-reference-layout a3-summary-layout">
              <div className="a3-summary-copy">
                <span>方案总结 / DESIGN SUMMARY</span>
                <h3>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </h3>
                <p>
                  {reportBody || reportCoreMessage}
                </p>
                <div className="a3-summary-claims">
                  {previewItems.slice(0, 3).map((item, index) => (
                    <div key={`${item}-${index}`}>
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      <strong>
                        {item}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="a3-summary-visuals">
                {["总体形象", "公共空间", "重点空间"].map(
                  (label, index) => {
                    const slotVisual = generatedVisualForSlot(index);
                    return (
                      <article key={label}>
                        <div
                          className={slotClassName(
                            index,
                            `a3-summary-image ${
                              slotVisual ? "a3-ai-image-slot" : ""
                            }`,
                          )}
                          role={slotVisual ? "img" : undefined}
                          aria-label={
                            slotVisual
                              ? `${reportHeadline} ${label}效果图`
                              : undefined
                          }
                          style={visualAssetStyle(slotVisual)}
                          {...slotInteraction(index)}
                        />
                        <span>{label}</span>
                      </article>
                    );
                  },
                )}
              </div>
            </section>
          ) : page.page_type === "concept" ||
            page.page_type === "cover" ||
            page.page_type === "section_divider" ? (
            <section
              className={slotClassName(
                0,
                `a3-reference-layout a3-concept-layout ${
                  generatedVisual ? "a3-has-background-visual" : ""
                }`,
              )}
              {...slotInteraction(0)}
            >
              <div
                className={`a3-concept-backdrop ${
                  conceptBackdropVisual ? "a3-ai-image-slot" : ""
                } ${conceptBackdropVisual ? "" : "a3-pending-image-slot"}`}
                role={conceptBackdropVisual ? "img" : undefined}
                aria-label={
                  conceptBackdropVisual
                    ? `${reportHeadline} 图片素材`
                    : undefined
                }
                aria-hidden={conceptBackdropVisual ? undefined : "true"}
                style={visualAssetStyle(conceptBackdropVisual)}
                data-pending-label={pendingVisualPrompt(0)}
              >
                <span />
                <span />
                <span />
              </div>
              <div className="a3-concept-copy">
                <div className="a3-concept-index">
                  {page.page_type === "section_divider"
                    ? section?.section_id ?? page.section_id
                    : displayPageTypeLabel(page)}
                </div>
                <h3>
                  {coreConceptHeadline}
                  <small>{coreConceptHeadlineEn}</small>
                </h3>
                <p>
                  {reportBody || reportCoreMessage}
                </p>
              </div>
            </section>
          ) : page.page_type === "rendering" ? (
            <section
              className={`a3-reference-layout a3-rendering-layout ${
                isSystemRenderingPage(page)
                  ? "a3-system-rendering-layout"
                  : ""
              }`}
            >
              <div
                className={slotClassName(
                  0,
                  `a3-rendering-scene ${
                    generatedVisual ? "a3-ai-image-slot" : ""
                  }`,
                )}
                role={generatedVisual ? "img" : undefined}
                aria-label={
                  generatedVisual
                    ? `${reportHeadline} 图片素材`
                    : undefined
                }
                aria-hidden={generatedVisual ? undefined : "true"}
                style={generatedVisualStyle}
                {...slotInteraction(0)}
              >
                <span />
                <span />
                <span />
              </div>
              <div className="a3-rendering-title">
                <strong>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </strong>
                <span>
                  {isSystemRenderingPage(page)
                    ? "系统渲染 / SYSTEM RENDERING"
                    : "重点空间 / KEY SPACE"}
                </span>
              </div>
              <div className="a3-rendering-band">
                <p>
                  {reportBody || reportCoreMessage}
                </p>
                <span>
                  {previewItems[0]}
                </span>
              </div>
            </section>
          ) : page.page_type === "data" ? (
            <section className="a3-reference-layout a3-data-layout">
              <div className="a3-reference-heading">
                <strong>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </strong>
                <span>功能指标 / PROGRAM METRICS</span>
              </div>
              <div
                className={`a3-data-stage ${
                  isMetricBoundaryPage(page)
                    ? "a3-data-stage-single-visual"
                    : ""
                }`}
                style={
                  isP24ProgramPage ? { background: "#f5f6f4" } : undefined
                }
              >
                {!isMetricBoundaryPage(page) ? (
                  <div className="a3-metric-panel">
                  {(verifiedMetricLabels.length
                    ? verifiedMetricLabels
                    : callouts.length
                      ? callouts
                      : previewItems.slice(0, 4)
                  ).map(
                    (item, index) => {
                      const label =
                        typeof item === "string" ? item : item.label;
                      return (
                        <div key={`${label}-${index}`}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <strong>
                            {label}
                            {isP24ProgramPage ? (
                              <small>{p24MetricEnglish[index]}</small>
                            ) : null}
                          </strong>
                        </div>
                      );
                    },
                  )}
                  </div>
                ) : null}
                <div
                  className={slotClassName(
                    0,
                    `a3-massing-model ${
                      generatedVisual ? "a3-ai-image-slot" : ""
                    }`,
                  )}
                  role={generatedVisual ? "img" : undefined}
                  aria-label={
                    generatedVisual
                      ? `${reportHeadline} 辅助图片素材`
                      : undefined
                  }
                  aria-hidden={generatedVisual ? undefined : "true"}
                  style={
                    isMetricBoundaryPage(page) && generatedVisualStyle
                      ? {
                          ...generatedVisualStyle,
                          backgroundPosition: "center",
                          backgroundSize: "contain",
                        }
                      : isP24ProgramPage
                        ? {
                            ...generatedVisualStyle,
                            backgroundColor: "#f5f6f4",
                          }
                        : generatedVisualStyle
                  }
                  {...slotInteraction(0)}
                >
                  <span />
                  <span />
                  <span />
                  <span />
                  {isMetricBoundaryPage(page) &&
                  !generatedVisual &&
                  verifiedMetricLabels.length ? (
                    <div className="a3-massing-metric-labels">
                      {verifiedMetricLabels.map((label, index) => (
                        <em key={`${label}-${index}`}>{label}</em>
                      ))}
                    </div>
                  ) : null}
                </div>
                {!isMetricBoundaryPage(page) ? (
                  <div className="a3-program-cards">
                    {previewItems.slice(0, 3).map((item, index) => (
                      <article key={`${item}-${index}`}>
                        <strong>{item}</strong>
                        <span>功能 {index + 1} / PROGRAM {index + 1}</span>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="a3-data-statement">
                {reportCoreMessage}
              </p>
            </section>
          ) : ["masterplan", "plan", "section", "technical"].includes(
              page.page_type,
            ) ? (
            <section className="a3-reference-layout a3-drawing-layout">
              <div className="a3-reference-heading">
                <strong>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </strong>
                <span>
                  {page.page_type === "technical"
                    ? "技术设计 / TECHNICAL DESIGN"
                    : "图纸与空间证据 / DRAWINGS & SPATIAL EVIDENCE"}
                </span>
              </div>
              <div
                className={`a3-drawing-grid ${
                  page.page_type === "technical"
                    ? "a3-technical-image-grid"
                    : ""
                } ${
                  isP29FeatureSection ? "a3-section-feature-grid" : ""
                }`}
              >
                {isP29FeatureSection ? (
                  <div className="a3-section-feature-copy">
                    <span>剖面说明 / SECTION NOTES</span>
                    <p>{reportCoreMessage}</p>
                    <div className="a3-section-feature-points">
                      {p29SectionNotes.map((note, index) => (
                        <article key={note.title}>
                          <i>{String(index + 1).padStart(2, "0")}</i>
                          <div>
                            <strong>
                              {note.title}
                              <small>{note.titleEn}</small>
                            </strong>
                            <p>{note.detail}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
                {page.page_type !== "technical" ? (
                  (() => {
                    const mainDrawingVisual = generatedVisualForSlot(0);
                    return (
                      <div
                        className={slotClassName(
                          0,
                          `a3-main-drawing ${
                            mainDrawingVisual ? "a3-ai-image-slot" : ""
                          }`,
                        )}
                        role={mainDrawingVisual ? "img" : undefined}
                        aria-label={
                          mainDrawingVisual
                            ? `${reportHeadline} 主图`
                            : `${reportHeadline} 主图待匹配`
                        }
                        style={visualAssetStyle(mainDrawingVisual)}
                        {...slotInteraction(0)}
                      />
                    );
                  })()
                ) : null}
                {!isP29FeatureSection ? (
                  <div
                    className={`a3-supporting-views ${
                      page.page_type === "technical"
                        ? "a3-technical-views"
                        : ""
                    } a3-supporting-view-count-${
                      page.page_type === "technical"
                        ? Math.min(2, expectedImageSlotCount)
                        : Math.max(0, Math.min(2, expectedImageSlotCount - 1))
                    }`}
                  >
                  {(page.page_type === "technical"
                    ? previewItems.slice(0, 2).map((item, index) => ({
                        item,
                        slotIndex: index,
                      }))
                    : previewItems
                        .slice(1, Math.min(3, expectedImageSlotCount))
                        .map((item, index) => ({
                        item,
                        slotIndex: index + 1,
                      }))).map(({ item, slotIndex }, index) => {
                    const slotVisual = generatedVisualForSlot(slotIndex);
                    return (
                      <article key={`${item}-${index}`}>
                        <div
                          className={slotClassName(
                            slotIndex,
                            slotVisual ? "a3-ai-image-slot" : "",
                          )}
                          role={slotVisual ? "img" : undefined}
                          aria-label={
                            slotVisual
                              ? `${reportHeadline} 辅助图框 ${index + 1}`
                              : undefined
                          }
                          style={visualAssetStyle(slotVisual)}
                          {...slotInteraction(slotIndex)}
                        />
                        <div className="a3-supporting-caption">
                          <span>
                            视图 / VIEW {String(index + 1).padStart(2, "0")}
                          </span>
                          <strong>
                            {item}
                          </strong>
                        </div>
                      </article>
                    );
                  })}
                  </div>
                ) : null}
              </div>
            </section>
          ) : page.page_type === "position" ? (
            <section className="a3-reference-layout a3-position-layout">
              <div className="a3-position-copy">
                <span>城市关系 / SITE CONTEXT</span>
                <h3>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </h3>
                <p className="a3-position-core">
                  {reportCoreMessage}
                </p>
                {reportBody ? (
                  <p className="a3-position-body">
                    {reportBody}
                  </p>
                ) : null}
                <div className="a3-position-evidence">
                  {callouts.slice(0, 3).map((item, index) => (
                    <div key={`${item.label}-${index}`}>
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      <strong>
                        {item.label}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              <div
                className={slotClassName(
                  0,
                  `a3-position-visual ${
                    generatedVisual ? "a3-ai-image-slot" : ""
                  }`,
                )}
                role={generatedVisual ? "img" : undefined}
                aria-label={
                  generatedVisual
                    ? `${reportHeadline} 辅助图片素材`
                    : undefined
                }
                aria-hidden={generatedVisual ? undefined : "true"}
                style={generatedVisualStyle}
                {...slotInteraction(0)}
              >
                {!generatedVisual ? (
                  <div className="a3-position-visual-placeholder">
                    <span>VISUAL MATERIAL</span>
                    <strong>区位图 / 城市关系图</strong>
                    <small>等待当前项目素材或 AI Graphic</small>
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <>
              <section className="a3-copy-column">
                <div className="a3-kicker">
                  {displayPageTypeLabel(page)} /{" "}
                  {pageTypeEnglishLabels[page.page_type]} / {page.page_id}
                </div>
                <h3>
                  {reportHeadline}
                  <small>{reportHeadlineEn}</small>
                </h3>
                <div className="a3-accent-rule" />
                <p className="a3-core-message">
                  {reportCoreMessage}
                </p>
                {reportBody ? (
                  <p className="a3-body-copy">
                    {reportBody}
                  </p>
                ) : (
                  <div className="a3-copy-placeholder">
                    <span aria-hidden="true">&nbsp;</span>
                  </div>
                )}
              </section>

              <section className="a3-visual-column">
                <div
                  className={slotClassName(
                    0,
                    `a3-visual-stage ${
                      generatedVisual ? "a3-ai-image-slot" : ""
                    }`,
                  )}
                  aria-label={
                    generatedVisual
                      ? `${reportHeadline} 图片素材`
                      : "图面区域占位预览"
                  }
                  style={generatedVisualStyle}
                  {...slotInteraction(0)}
                >
                  <div className="a3-visual-orbit" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="a3-visual-axis" aria-hidden="true" />
                  <div className="a3-visual-labels">
                    {visualItems.slice(0, 3).map((item, index) => (
                      <span key={`${item}-${index}`}>
                        <i>{String(index + 1).padStart(2, "0")}</i>
                        <span>
                          {item}
                        </span>
                      </span>
                    ))}
                  </div>
                  {!visualItems.length ? (
                    <div className="a3-empty-visual">
                      视觉区域 / VISUAL AREA
                    </div>
                  ) : null}
                </div>

                {callouts.length ? (
                  <div className="a3-callout-grid">
                    {callouts.map((callout, index) => (
                      <article key={`${callout.label}-${index}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>
                          {callout.label}
                        </strong>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          )}
        </div>

        {visualMode &&
        selectedVisualSlotId &&
        slotActionPosition &&
        onGenerateVisualSlot ? (
          <button
            type="button"
            className="a3-slot-inline-action"
            style={{
              left: `${slotActionPosition.left}px`,
              top: `${slotActionPosition.top}px`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              onGenerateVisualSlot(selectedVisualSlotId);
            }}
            disabled={visualImageGenerating}
            aria-label={`AI 生成当前图：${
              imageSlots.find(
                (slot) => slot.slot_id === selectedVisualSlotId,
              )?.label ?? selectedVisualSlotId
            }`}
          >
            {visualImageGenerating ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Sparkles size={14} />
            )}
            {visualImageGenerating ? "正在生成当前图" : "AI 生成当前图"}
          </button>
        ) : null}

        <footer className="a3-footer">
          <span>{companyName.trim() || DEFAULT_COMPANY_NAME}</span>
          <div>
            {page.generation_status === "generated" ? <span>草案</span> : null}
            <strong>{pageNumber}</strong>
          </div>
        </footer>
      </div>
      <div className="a3-preview-caption">
        <span>A3 横版 · 420 × 297 mm</span>
        <span>
          {visualMode
            ? generatedVisual
              ? `图文分层 · ${
                  generatedModelVisuals.length
                    ? "图片槽使用 AI 素材"
                    : "图片槽使用当前项目素材"
                }`
              : "图文分层 · 图片待生成"
            : "仅显示可进入汇报的页面内容"}
        </span>
      </div>
    </div>
  );
}

function DocumentCard({
  document,
  locked,
  onRoleChange,
  onRemove,
}: {
  document: InputDocument;
  locked?: boolean;
  onRoleChange: (documentId: string, role: SourceRole) => void;
  onRemove: (documentId: string) => void;
}) {
  const textLength = documentTextLength(document);
  return (
    <article
      className={`document-card ${locked ? "system-document" : ""}`}
      key={document.document_id}
    >
      <div className="document-icon">
        <FileText size={17} />
      </div>
      <div className="document-main">
        <div className="document-title" title={document.file_name}>
          {document.file_name}
          {locked ? <span className="system-badge">系统内置</span> : null}
        </div>
        <div className="document-meta">
          {document.page_count ?? 1} 页 ·{" "}
          {locked ? "已提取结构与版式档案" : `已读取 ${textLength.toLocaleString()} 字`}
        </div>
        {!locked && (document.visual_pages?.length ?? 0) > 0 ? (
          <div className="pdf-visual-pages-ready">
            已提取 {document.visual_pages?.length} 张区位／场地相关页面，供图面识别
          </div>
        ) : null}
        {!locked && textLength < 30 ? (
          <div className="pdf-text-warning">
            未读到有效文字层；扫描 PDF 需要 OCR。
          </div>
        ) : (
          <details className="text-preview">
            <summary>{locked ? "查看参考档案" : "查看识别文本"}</summary>
            <pre>{document.text.slice(0, 1200)}</pre>
          </details>
        )}
        {locked ? (
          <div className="locked-role">历史参考 · 只影响结构与表达风格</div>
        ) : (
          <select
            className={`role-select role-${document.role}`}
            value={document.role}
            onChange={(event) =>
              onRoleChange(
                document.document_id,
                event.target.value as SourceRole,
              )
            }
            aria-label={`${document.file_name}角色`}
          >
            {Object.entries(roleLabels)
              .filter(([value]) => value !== "site_research")
              .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
              ))}
          </select>
        )}
      </div>
      {!locked ? (
        <button
          className="remove-button"
          onClick={() => onRemove(document.document_id)}
          aria-label={`移除${document.file_name}`}
        >
          <X size={14} />
        </button>
      ) : null}
    </article>
  );
}

function VisualTaskPanel({
  task,
  pageType,
  busy,
  generatingImage,
  onCreate,
  selectedSlotId,
  onSelectSlot,
  imageJob,
  onRetryImageJob,
  onOpenImage,
}: {
  task?: NonNullable<
    DesignReportPagePlan["pages"][number]["visual_task"]
  >;
  pageType: DesignReportPagePlan["pages"][number]["page_type"];
  busy: boolean;
  generatingImage: boolean;
  onCreate: () => void;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  imageJob: VisualImageJobState | null;
  onRetryImageJob: (job: VisualImageJobState) => void;
  onOpenImage: (asset: PageVisualAsset, title: string) => void;
}) {
  if (!task) {
    return (
      <div className="visual-task-empty">
        <Sparkles size={24} />
        <strong>为当前页建立视觉任务单</strong>
        <p>
          系统会从本页结论、需要说明的关系、当前项目证据和素材缺口出发，自动判断真正需要的 Graphic。
        </p>
        <small>
          点击后只建立稳定图框和内容要求，不检索、不显示历史参考图；空图框统一标记“图片待生成”。
        </small>
        <button
          className="primary-button"
          onClick={onCreate}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Braces size={15} />
          )}
          生成视觉任务单
        </button>
      </div>
    );
  }

  const statusLabels: Record<typeof task.status, string> = {
    draft: "草拟中",
    awaiting_choice: "正在理解",
    awaiting_materials: "待补素材",
    ready: "可以生成",
    approved: "视觉需求已确认",
  };
  const imageSuitability = getVisualImageSuitability(pageType);
  const aiGeneratableSlotIds = new Set(
    task.image_slots
      .filter((slot) => canGenerateVisualImageForSlot(pageType, slot))
      .map((slot) => slot.slot_id),
  );
  const aiImageGenerationAvailable = aiGeneratableSlotIds.size > 0;
  const requiredImageCount = imageSuitability.eligible
    ? task.image_slots?.length || getVisualImageSlotCount(pageType)
    : 0;
  const generatedImageCount = task.generated_images?.length
    ? task.generated_images.filter((image) =>
        aiGeneratableSlotIds.has(image.slot_id),
      ).length
    : task.generated_image &&
        task.image_slots[0] &&
        aiGeneratableSlotIds.has(task.image_slots[0].slot_id)
      ? 1
      : 0;
  const hasGeneratedImages = generatedImageCount > 0;
  const generationComplete =
    aiGeneratableSlotIds.size > 0 &&
    generatedImageCount === aiGeneratableSlotIds.size;
  const selectedSlot = task.image_slots?.find(
    (slot) => slot.slot_id === selectedSlotId,
  );
  const selectedSlotAllowsAi = selectedSlot
    ? canGenerateVisualImageForSlot(pageType, selectedSlot)
    : false;
  const selectedGeneratedImage = selectedSlotAllowsAi && selectedSlot
    ? task.generated_images?.find(
        (image) => image.slot_id === selectedSlot.slot_id,
      ) ??
      (task.image_slots?.[0]?.slot_id === selectedSlot.slot_id
        ? task.generated_image
        : undefined)
    : undefined;
  const selectedPromptIsVerified =
    selectedGeneratedImage?.prompt_provenance ===
    "submitted_to_image_model";
  const selectedGeneratedPrompt =
    selectedGeneratedImage && selectedPromptIsVerified
    ? userFacingVisualText(
        selectedGeneratedImage.submitted_prompt_zh ??
          selectedGeneratedImage.prompt_zh,
        "本次生成记录没有保存可验证的最终提交提示词。",
      )
    : "";
  const selectedGeneratedNegativePrompt =
    selectedGeneratedImage && selectedPromptIsVerified
      ? userFacingVisualText(
          selectedGeneratedImage.submitted_negative_prompt_zh,
          "",
        )
      : "";
  const backstagePromptSummary = userFacingVisualText(
    task.image_prompt?.prompt_zh,
    "",
  );
  const displayTitle = visualTaskDisplayTitles[pageType];
  const displayElements = userFacingVisualItems(
    task.visual_intent.graphic_elements,
    visualTaskDefaultElements[pageType],
  );
  const displayConclusion = userFacingVisualText(
    task.visual_intent.conclusion_to_prove,
    "说明本页核心结论及其设计依据。",
  );
  const displayLayoutLogic = userFacingVisualText(
    task.visual_intent.layout_logic,
    "按证据重要度组织画面，清晰呈现从依据到结论的关系。",
  );
  const displayObjective = userFacingVisualText(
    task.objective,
    `用当前项目证据完成“${displayTitle}”。`,
  );
  const displayMissingInputs = userFacingMissingMaterials(
    task.missing_inputs,
  );
  const displayGenerationSteps = aiImageGenerationAvailable
    ? [
        "根据本页结论判断每个图框真正需要的图片内容",
        "视觉任务阶段只显示空图框，不读取或展示历史项目图片",
        "用户点选单个图框后，直接调用图像模型；不读取、不裁剪、不展示历史素材库图片",
      ]
    : [
        "根据本页结论判断每个图框需要的真实图纸内容",
        "依据当前项目事实、已确认提案、页面文案和图框比例调用图像模型",
        "将 AI 结果填入视觉草案；不得冒充准确图纸、尺寸、标注或技术结论",
      ];
  const selectedSlotLabel = selectedSlot
    ? userFacingVisualText(selectedSlot.label, "当前图片")
    : "当前图片";

  return (
    <div className="visual-task-panel">
      <section className="visual-task-summary">
        <div>
          <span>视觉任务</span>
          <strong>{displayTitle}</strong>
        </div>
        <em className={`visual-task-status status-${task.status}`}>
          {statusLabels[task.status]}
        </em>
        <p>{displayObjective}</p>
        <small>
          {busy
            ? "正在根据本页结论建立稳定图框和图片要求…"
            : "视觉任务单已就绪；历史素材库图片不会进入任务单或图框，点选图框后才调用 AI 生图。"}
        </small>
      </section>

      {imageJob ? (
        <section
          className={`visual-image-job status-${imageJob.stage}`}
          aria-live="polite"
        >
          <div className="visual-image-job-heading">
            <span>生图任务状态</span>
            <strong>{visualImageStageLabels[imageJob.stage]}</strong>
          </div>
          <ol>
            {visualImageStageOrder.map((stage) => {
              const currentIndex = visualImageStageOrder.indexOf(
                imageJob.stage === "failed" ? "completed" : imageJob.stage,
              );
              const stageIndex = visualImageStageOrder.indexOf(stage);
              const isRetryStage = stage === "retrying";
              const isSkippedReference =
                stage === "uploading_reference" &&
                imageJob.referenceSkipped;
              const isSkippedRetry =
                isRetryStage &&
                !imageJob.retryAttempted &&
                ["completed", "failed"].includes(imageJob.stage);
              const isActive =
                imageJob.stage === stage && !isSkippedReference;
              const isDone =
                !isSkippedRetry &&
                !isSkippedReference &&
                (stageIndex < currentIndex ||
                  (imageJob.stage === "failed" &&
                    stage !== "completed" &&
                    (!isRetryStage || imageJob.retryAttempted)));
              return (
                <li
                  key={stage}
                  className={
                    isActive
                      ? "is-active"
                      : isDone
                        ? "is-done"
                        : isSkippedRetry
                          ? "is-skipped"
                          : isSkippedReference
                            ? "is-skipped"
                          : ""
                  }
                >
                  <i>{isDone ? <Check size={10} /> : stageIndex + 1}</i>
                  <span>{visualImageStageLabels[stage]}</span>
                </li>
              );
            })}
            {imageJob.stage === "failed" ? (
              <li className="is-failed">
                <i>
                  <X size={10} />
                </i>
                <span>失败</span>
              </li>
            ) : null}
          </ol>
          <p>{imageJob.message}</p>
          {imageJob.stage === "failed" && imageJob.retryable ? (
            <div className="visual-image-job-recovery">
              <button
                type="button"
                className="secondary-button"
                onClick={() => onRetryImageJob(imageJob)}
                disabled={generatingImage}
              >
                <RefreshCw size={13} />
                {generatingImage ? "正在恢复…" : "恢复这次生图任务"}
              </button>
              <small>
                {imageJob.retryAfterMs
                  ? `原任务已保留；恢复时会先等待约 ${Math.max(
                      1,
                      Math.ceil(imageJob.retryAfterMs / 1_000),
                    )} 秒再请求上游，不会重新匹配素材。`
                  : "原页面、图框、参考图关系和任务编号均已保留，不会重新匹配素材。"}
              </small>
            </div>
          ) : null}
          {imageJob.requestId ? (
            <small className="visual-image-job-request-id">
              请求编号：{imageJob.requestId}
            </small>
          ) : null}
        </section>
      ) : null}

      <section className="visual-task-section">
        <div className="field-label">
          <span>本页视觉内容</span>
        </div>
        <div className="visual-intent-summary">
          <div>
            <span>本页要说明</span>
            <strong>{displayConclusion}</strong>
          </div>
          <div>
            <span>画面内容</span>
            <p>{displayElements.join("、")}</p>
          </div>
          <div>
            <span>画面组织</span>
            <p>{displayLayoutLogic}</p>
          </div>
          <div>
            <span>图片数量</span>
            <p>
              {requiredImageCount
                ? aiGeneratableSlotIds.size === requiredImageCount
                  ? `${requiredImageCount} 个固定图框；初始显示“图片待生成”，可逐张使用 AI 生成`
                  : aiGeneratableSlotIds.size > 0
                    ? `${requiredImageCount} 个图框；图纸图框锁定真实素材，其余 ${aiGeneratableSlotIds.size} 个图框可逐张用 AI 替换`
                    : `${requiredImageCount} 个图框；只使用当前项目图纸或素材库真实图纸，不允许 AI 重新生图`
                : "本页不需要图像模型生成图片"}
            </p>
          </div>
        </div>
      </section>

      {task.image_slots?.length ? (
        <section className="visual-task-section">
          <div className="field-label">
            <span>当前页图片</span>
          </div>
          <div className="visual-slot-picker">
            {task.image_slots.map((slot, index) => {
              const slotLabel = userFacingVisualText(
                slot.label,
                `图片 ${index + 1}`,
              );
              const generated = canGenerateVisualImageForSlot(pageType, slot)
                ? task.generated_images?.find(
                    (image) => image.slot_id === slot.slot_id,
                  )
                : undefined;
              const visibleImage = generated;
              const slotAllowsAi = canGenerateVisualImageForSlot(
                pageType,
                slot,
              );
              return (
                <button
                  key={slot.slot_id}
                  className={
                    selectedSlotId === slot.slot_id ? "is-selected" : ""
                  }
                  onClick={() => onSelectSlot(slot.slot_id)}
                  onDoubleClick={(event) => {
                    if (!visibleImage) return;
                    event.preventDefault();
                    onOpenImage(
                      visibleImage as PageVisualAsset,
                      slotLabel,
                    );
                  }}
                  disabled={!visibleImage && !slotAllowsAi}
                  aria-pressed={selectedSlotId === slot.slot_id}
                  aria-label={`${slotLabel} · ${
                    generated
                      ? "AI 图片"
                      : slotAllowsAi
                          ? "可直接 AI 生成"
                          : "图片待生成"
                  }`}
                  title={`${slotLabel} · ${
                    generated
                      ? "AI 图片 · 双击查看大图并保存"
                      : slotAllowsAi
                          ? "可直接 AI 生成"
                          : "图片待生成"
                  }`}
                >
                  <span
                    className={
                      generated
                        ? "visual-slot-ai-image"
                        : "visual-slot-pending"
                    }
                    data-pending-label={differentiatedVisualPromptSummary(
                      slot.label,
                      slot.prompt_focus,
                      slot.purpose,
                      `图片 ${index + 1}待生成`,
                    )}
                    style={visualAssetStyle(
                      visibleImage as PageVisualAsset | undefined,
                    )}
                  />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {selectedGeneratedImage ? (
        <section className="visual-generation-receipt">
          <div className="field-label">
            <span>本次 AI 生图记录</span>
          </div>
          <dl>
            <div>
              <dt>生图模型</dt>
              <dd>{selectedGeneratedImage.model}</dd>
            </div>
            <div>
              <dt>实际提交给图像模型 · 提示正文</dt>
              <dd>
                {selectedGeneratedPrompt ||
                  "旧版记录未保存提示词来源标记，不能确认这段内容是否真正提交给图像模型；重新生成后会保存可验证的最终提交词。"}
              </dd>
            </div>
            {selectedGeneratedNegativePrompt ? (
              <div>
                <dt>实际提交给图像模型 · 负向提示词</dt>
                <dd>{selectedGeneratedNegativePrompt}</dd>
              </div>
            ) : null}
            {backstagePromptSummary ? (
              <div>
                <dt>后台提示词导演草稿（未直接提交）</dt>
                <dd>{backstagePromptSummary}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="visual-task-columns">
        <div>
          <span>已有输入</span>
          <em>
            {task.available_inputs.length
              ? `已关联 ${task.available_inputs.length} 条当前项目证据`
              : "当前页尚无可直接引用的项目素材"}
          </em>
        </div>
        <div className={displayMissingInputs.length ? "has-missing" : ""}>
          <span>仍需补充</span>
          {displayMissingInputs.length ? (
            <ul>
              {displayMissingInputs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <em>当前任务所需输入已齐备</em>
          )}
        </div>
      </section>

      <section className="visual-task-section">
        <div className="field-label">
          <span>生成步骤</span>
        </div>
        <ol className="visual-generation-steps">
          {displayGenerationSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <div className="visual-policy">
          {imageSuitability.usage === "source_drawing" &&
          aiImageGenerationAvailable
            ? "总平面、平面、剖面、立面和技术图框现在均可逐张尝试 AI 概念重绘；不读取、不裁剪、不上传后台素材库或公司汇报文件图片，准确设计证据仍以当前项目资料为准。"
            : aiImageGenerationAvailable
              ? "AI 只替换你明确点选的单个图片槽；页面文字、准确数据、程序化标注和其他图框保持不变。"
              : "本页没有可交给图像模型的图片槽。"}
        </div>
        {selectedSlot &&
        selectedSlotAllowsAi ? (
          <div className="visual-image-boundary is-ready">
            <Sparkles size={14} />
            <span>
              已选中“{selectedSlotLabel}”；
              生成时只结合当前项目事实、已确认提案、图注和图框比例调用图像模型；不读取、不裁剪、不提交历史素材库图片。
            </span>
          </div>
        ) : imageSuitability.eligible && !selectedSlot ? (
          <div className="visual-image-boundary">
            <CircleDot size={14} />
            <span>
              请先点击一个图框，再选择 AI 生成当前图。
            </span>
          </div>
        ) : null}
        {selectedSlot && !selectedSlotAllowsAi ? (
          <div className="visual-image-boundary">
            <ShieldCheck size={14} />
            <span>
              当前选中的是平面、剖面、立面或技术图纸图框；不会产生生图调用，也不会被 AI 图片覆盖。
            </span>
          </div>
        ) : null}
      </section>

      {hasGeneratedImages ? (
        <section className="visual-asset-ready">
          <Check size={14} />
          <div>
            <strong>
              {generationComplete
                ? `${generatedImageCount} 张 AI Graphic 已替换对应图框`
                : `当前已有 ${generatedImageCount}/${requiredImageCount} 张 AI 图片回填页面`}
            </strong>
            <p>
              {aiImageGenerationAvailable
                ? "未生成的图框继续显示“图片待生成”；历史参考图不会出现在页面或导出文件中。"
                : "本页没有可交给图像模型的图片槽。"}
            </p>
          </div>
        </section>
      ) : null}

      {task.draft_output ? (
        <section
          className={`visual-draft-disclaimer ${
            task.draft_output.status === "conceptual" ? "warning" : ""
          }`}
        >
          <AlertTriangle size={13} />
          <div>
            <strong>
              {generationComplete
                ? `${generatedImageCount} 张图片素材已经分别填入上方 A3 图框`
                : hasGeneratedImages
                  ? `${generatedImageCount} 个图框已使用 AI 图，其余图框保持空白`
                  : imageSuitability.eligible
                  ? "视觉需求已判断，图框显示“图片待生成”"
                  : "视觉需求已判断，本页保留程序化图解"}
            </strong>
            <p>
              {userFacingVisualText(
                task.draft_output.disclaimer,
                "视觉草案需在导出前与当前项目图纸和数据核对。",
              )}
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function VisualAssetLightbox({
  preview,
  onClose,
}: {
  preview: VisualAssetPreviewState | null;
  onClose: () => void;
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, preview]);

  if (!preview) return null;

  const saveImage = async () => {
    setSaveState("saving");
    try {
      const response = await fetch(preview.asset.image_url);
      if (!response.ok) throw new Error("图片下载失败");
      const blob = await response.blob();
      const extension = blob.type.includes("jpeg")
        ? "jpg"
        : blob.type.includes("webp")
          ? "webp"
          : "png";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${safePdfFileName(preview.fileName)}.${extension}`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setSaveState("idle");
    } catch {
      setSaveState("failed");
    }
  };

  return (
    <div
      className="visual-lightbox-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="visual-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={`${preview.title} 大图预览`}
      >
        <header>
          <div>
            <span>当前图片</span>
            <strong>{preview.title}</strong>
          </div>
          <div className="visual-lightbox-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void saveImage()}
              disabled={saveState === "saving"}
            >
              {saveState === "saving" ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Download size={15} />
              )}
              {saveState === "saving" ? "正在保存" : "保存图片"}
            </button>
            <button
              type="button"
              className="visual-lightbox-close"
              onClick={onClose}
              aria-label="关闭大图预览"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="visual-lightbox-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.asset.image_url} alt={preview.title} />
        </div>
        <footer>
          <span>双击图框可再次打开 · 按 Esc 关闭</span>
          {"model" in preview.asset && preview.asset.model ? (
            <span>生成模型：{preview.asset.model}</span>
          ) : null}
          {saveState === "failed" ? (
            <strong>图片保存失败，请稍后重试。</strong>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function TextArchitectureGuide({
  open,
  plan,
  taskMode,
  selectedPageId,
  onClose,
  onSelectPage,
}: {
  open: boolean;
  plan: DesignReportPagePlan;
  taskMode: TaskMode;
  selectedPageId?: string;
  onClose: () => void;
  onSelectPage: (pageId: string) => void;
}) {
  const activePageRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const animationFrame = window.requestAnimationFrame(() => {
      activePageRef.current?.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      });
    });

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="text-architecture-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <aside
        id="text-architecture-guide"
        className="text-architecture-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-architecture-title"
      >
        <header className="text-architecture-header">
          <div>
            <div className="eyebrow">CURRENT NARRATIVE MAP</div>
            <h2 id="text-architecture-title">当前文本架构导览</h2>
            <p>沿章节查看全篇逻辑，点击任一页面可直接返回对应 A3 预览。</p>
          </div>
          <button
            className="text-architecture-close"
            onClick={onClose}
            aria-label="收起文本架构导览"
          >
            <X size={18} />
          </button>
        </header>

        <div className="text-architecture-overview">
          <div>
            <span>全篇主张</span>
            <strong>{sanitizePresentationText(plan.narrative_claim)}</strong>
          </div>
          <dl>
            <div>
              <dt>章节</dt>
              <dd>{plan.sections.length}</dd>
            </div>
            <div>
              <dt>页面</dt>
              <dd>{plan.pages.length}</dd>
            </div>
          </dl>
        </div>

        <div className="text-architecture-scroll">
          {plan.sections.map((section, sectionIndex) => {
            const sectionPages = plan.pages.filter(
              (page) => page.section_id === section.section_id,
            );
            if (!sectionPages.length) return null;

            return (
              <section
                className="text-architecture-section"
                key={section.section_id}
                aria-labelledby={`architecture-section-${section.section_id}`}
              >
                <div className="text-architecture-section-heading">
                  <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 id={`architecture-section-${section.section_id}`}>
                      {sanitizePresentationText(section.title_zh, "未命名章节")}
                    </h3>
                    <p>{sanitizePresentationText(section.purpose)}</p>
                  </div>
                </div>

                <div className="text-architecture-page-chain">
                  {sectionPages.map((page, pageIndex) => {
                    const isSelected = page.page_id === selectedPageId;
                    const isStructural = [
                      "cover",
                      "toc",
                      "section_divider",
                    ].includes(page.page_type);

                    return (
                      <button
                        ref={isSelected ? activePageRef : undefined}
                        className={`text-architecture-page ${
                          isSelected ? "selected" : ""
                        } ${isStructural ? "structural" : ""}`}
                        key={page.page_id}
                        onClick={() => onSelectPage(page.page_id)}
                        aria-current={isSelected ? "page" : undefined}
                      >
                        <span className="text-architecture-page-number">
                          P
                          {String(
                            page.display_page_number ?? pageIndex + 1,
                          ).padStart(2, "0")}
                        </span>
                        <span className="text-architecture-page-type">
                          {displayPageTypeLabel(page)}
                        </span>
                        <strong>
                          {displayPageHeadline(page, isSmallBuildingMode(taskMode))}
                        </strong>
                        <p>{sanitizePresentationText(page.core_message)}</p>
                        <span className="text-architecture-page-status">
                          {pageStatusLabel(page.generation_status)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="text-architecture-footer">
          <span>
            <i className="architecture-legend-dot current" />
            当前页
          </span>
          <span>
            <i className="architecture-legend-dot structural" />
            封面 / 目录 / 章节页
          </span>
          <span>页面顺序从左向右</span>
        </footer>
      </aside>
    </div>
  );
}

export function Workbench({
  initialDocuments,
  initialResult,
  initialApiSettings,
}: WorkbenchProps) {
  const [documents, setDocuments] =
    useState<InputDocument[]>(initialDocuments);
  const [result, setResult] = useState<PipelineResult>(() => {
    const initialTaskMode =
      initialResult.projectFacts.task_mode ??
      initialResult.pagePlan.task_mode ??
      DEFAULT_TASK_MODE;
    const normalizedFacts = ensureSmallModeDesignDirectionState(
      { ...initialResult.projectFacts, task_mode: initialTaskMode },
    );
    const synchronized = synchronizeProposalCoverage(
      normalizedFacts,
      initialResult.pagePlan,
    );
    return {
      ...initialResult,
      ...synchronized,
    };
  });
  const latestResultRef = useRef(result);
  const [leftTab, setLeftTab] = useState<LeftTab>("documents");
  const [detailTab, setDetailTab] = useState<DetailTab>("preview");
  const [selectedPageId, setSelectedPageId] = useState(
    initialResult.projectFacts.facts.length
      ? initialResult.pagePlan.pages[0]?.page_id
      : undefined,
  );
  const [selectedVisualSlotChoice, setSelectedVisualSlotChoice] = useState<{
    pageId: string;
    slotId: string;
  } | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [pasteRole, setPasteRole] = useState<SourceRole>("authoritative");
  const [showPaste, setShowPaste] = useState(false);
  const [gateBInputs, setGateBInputs] = useState<Record<string, string>>({});
  const [showUserProposalForm, setShowUserProposalForm] = useState(false);
  const [userProposalDraft, setUserProposalDraft] =
    useState<UserProposalDraft>({
      topic: "设计概念",
      title: "",
      direction: "",
    });
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [factEditDrafts, setFactEditDrafts] = useState<
    Record<string, FactEditDraft>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfExportPpi, setPdfExportPpi] = useState<PdfExportPpi>(144);
  const [backgroundTask, setBackgroundTask] = useState<string | null>(null);
  const [visualImageJob, setVisualImageJob] =
    useState<VisualImageJobState | null>(null);
  const latestSelectedPageIdRef = useRef(selectedPageId);
  const latestVisualImageJobRef = useRef(visualImageJob);
  const [error, setError] = useState("");
  const [documentsChanged, setDocumentsChanged] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showTextArchitecture, setShowTextArchitecture] = useState(false);
  const [visualAssetPreview, setVisualAssetPreview] =
    useState<VisualAssetPreviewState | null>(null);
  const [showAddPageComposer, setShowAddPageComposer] = useState(false);
  const [addPagePrompt, setAddPagePrompt] = useState("");
  const [pageTextDraft, setPageTextDraft] =
    useState<PageTextDraft | null>(null);
  const [pageTextTranslationStatus, setPageTextTranslationStatus] =
    useState<PageTextTranslationStatus>("idle");
  const [pageTextTranslationError, setPageTextTranslationError] =
    useState("");
  const [translatedPageTextSource, setTranslatedPageTextSource] =
    useState("");
  const [translationRetryNonce, setTranslationRetryNonce] = useState(0);
  const latestTranslationSourceRef = useRef("");
  const translatedSourceRef = useRef("");
  const translationRequestRef = useRef(0);
  const [history, setHistory] = useState<ProjectHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showProjectArchive, setShowProjectArchive] = useState(false);
  // The identifier must exist before the first autosave. Previously the save
  // payload generated a UUID ad hoc while state was still empty, so every
  // autosave after a failed cloud restore created a new database row.
  const [projectId, setProjectId] = useState(() => crypto.randomUUID());
  const [projectTitle, setProjectTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taskMode, setTaskMode] = useState<TaskMode>(
    initialResult.projectFacts.task_mode ??
      initialResult.pagePlan.task_mode ??
      DEFAULT_TASK_MODE,
  );
  const [showTaskModePicker, setShowTaskModePicker] = useState(false);
  const [projectCatalog, setProjectCatalog] = useState<StoredProjectSummary[]>([]);
  const [cloudStoreStatus, setCloudStoreStatus] =
    useState<CloudStoreStatus | null>(null);
  const [apiSettings, setApiSettings] = useState<ApiSettings>({
    baseUrl: initialApiSettings.baseUrl,
    model: initialApiSettings.model,
    apiKey: "",
    imageBaseUrl: initialApiSettings.imageBaseUrl,
    imageModel: initialApiSettings.imageModel,
    imageApiKey: "",
    amapApiKey: "",
  });
  const [apiConnectionStatus, setApiConnectionStatus] =
    useState<ApiConnectionStatus | null>(null);
  const accountedModelResponses = useRef(
    new Set(
      initialResult.nodeOutputs
        .map(tokenResponseKey)
        .filter((key): key is string => Boolean(key)),
    ),
  );
  const [sessionTokenUsage, setSessionTokenUsage] =
    useState<TokenUsageSummary>(() => sumTokenUsage(initialResult.nodeOutputs));
  const [localDraftHydrated, setLocalDraftHydrated] = useState(false);
  const [localDraftStatus, setLocalDraftStatus] =
    useState<LocalDraftStatus>("loading");
  const [localDraftError, setLocalDraftError] = useState("");
  const [autosaveMode, setAutosaveMode] = useState<AutosaveMode>("15m");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectTransitionRef = useRef(false);
  const cloudRevisionRef = useRef<string | undefined>(undefined);
  const siteResearchRequestRef = useRef(0);
  const latestProjectIdRef = useRef(projectId);
  const autosaveInFlightRef = useRef<Promise<void> | null>(null);
  const queuedAutosaveRef = useRef<(() => Promise<void>) | null>(null);
  const lastCloudPersistedVisualImageRef = useRef("");

  useEffect(() => {
    latestResultRef.current = result;
  }, [result]);

  useEffect(() => {
    latestSelectedPageIdRef.current = selectedPageId;
  }, [selectedPageId]);

  useEffect(() => {
    latestVisualImageJobRef.current = visualImageJob;
  }, [visualImageJob]);

  useEffect(() => {
    latestProjectIdRef.current = projectId;
    siteResearchRequestRef.current += 1;
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const restoreDraft = (saved: LocalProjectDraft) => {
      if (!active) return;
          saved = migrateStoredProjectDraft(saved);
          setProjectTitle(saved.title?.trim() ?? "");
          setCompanyName(saved.companyName?.trim() ?? "");
          const restoredTaskMode =
            saved.result.projectFacts.task_mode ??
            saved.result.pagePlan.task_mode ??
            DEFAULT_TASK_MODE;
          setTaskMode(restoredTaskMode);
          cloudRevisionRef.current = saved.updatedAt;
          const builtInDocumentIds = new Set(
            initialDocuments.map((document) => document.document_id),
          );
          setDocuments([
            ...initialDocuments,
            ...saved.documents.filter(
              (document) => !builtInDocumentIds.has(document.document_id),
            ),
          ]);
          const restoredProjectFacts = isSmallBuildingMode(restoredTaskMode)
            ? isolateSmallBuildingProjectFacts(
                ensureSmallModeDesignDirectionState({
                  ...saved.result.projectFacts,
                  task_mode: restoredTaskMode,
                }),
              )
            : {
                ...saved.result.projectFacts,
                task_mode: restoredTaskMode,
                reference_experience:
                  initialResult.projectFacts.reference_experience,
                reference_style_examples:
                  initialResult.projectFacts.reference_style_examples,
              };
          const synchronized = isSmallBuildingMode(restoredTaskMode)
            ? {
                projectFacts: restoredProjectFacts,
                pagePlan: {
                  ...saved.result.pagePlan,
                  task_mode: restoredTaskMode,
                  pages: saved.result.pagePlan.pages.map((page) => ({
                    ...page,
                    style_example_refs: [],
                    experience_recipe_refs: [],
                    proposal_refs: [],
                    proposal_coverage: [],
                  })),
                },
              }
            : synchronizeProposalCoverage(
                restoredProjectFacts,
                saved.result.pagePlan,
              );
          setResult({
            ...saved.result,
            ...synchronized,
          });
          setSelectedPageId(
            saved.selectedPageId &&
              saved.result.pagePlan.pages.some(
                (page) => page.page_id === saved.selectedPageId,
              )
              ? saved.selectedPageId
              : saved.result.pagePlan.pages[0]?.page_id,
          );
          setDocumentsChanged(saved.documentsChanged);
          setProjectId(saved.projectId ?? crypto.randomUUID());
          setSessionTokenUsage(
            normalizeStoredTokenUsage(
              saved.sessionTokenUsage,
              saved.result.nodeOutputs,
            ),
          );
          setGateBInputs(saved.gateBInputs ?? {});
          if (saved.visualImageJob?.stage !== "completed") {
            setVisualImageJob(
              saved.visualImageJob?.stage === "failed"
                ? saved.visualImageJob
                : saved.visualImageJob
                  ? {
                      ...saved.visualImageJob,
                      stage: "failed",
                      retryable: true,
                      errorCode: "INTERRUPTED",
                      failedAt: new Date().toISOString(),
                      message:
                        "上次生图任务在页面关闭或刷新时中断，任务参数已经保留，可直接恢复。",
                    }
                  : null,
            );
          }
          setHistory(
            (saved.history ?? []).map((entry) => ({
              ...entry,
              documents: historySafeDocuments(entry.documents),
              result: historySafeResult(entry.result),
            })),
          );
          accountedModelResponses.current = new Set(
            saved.result.nodeOutputs
              .map(tokenResponseKey)
              .filter((key): key is string => Boolean(key)),
          );
          setLocalDraftStatus("saved");
          setLocalDraftError("");
    };
    void (async () => {
      const cloudStatus = await getCloudStoreStatus().catch(
        (caught): CloudStoreStatus => ({
          configured: true,
          connected: false,
          referenceLibraryConnected: false,
          error:
            caught instanceof Error ? caught.message : "MemFire 状态读取失败",
        }),
      );
      if (!active) return;
      setCloudStoreStatus(cloudStatus);
      let saved: LocalProjectDraft | undefined;
      if (cloudStatus.connected) {
        const cloudProjects = await listCloudProjects();
        if (!active) return;
        setProjectCatalog(cloudProjects);
        const activeProject = cloudProjects.find(
          (project) => project.status === "active",
        );
        if (activeProject) {
          saved = await loadCloudProject(activeProject.projectId);
        } else {
          const localDraft = await loadLocalProjectDraft().catch(() => undefined);
          if (localDraft) {
            const migratedDraft = {
              ...localDraft,
              projectId: localDraft.projectId ?? crypto.randomUUID(),
              status: "active" as const,
            };
            const savedCloud = await saveCloudProject(migratedDraft);
            await clearLocalProjectDraft().catch(() => undefined);
            saved = { ...migratedDraft, updatedAt: savedCloud.updatedAt };
            setProjectCatalog(await listCloudProjects());
          }
        }
      } else {
        const [localDraft, localProjects] = await Promise.all([
          loadLocalProjectDraft().catch(() => undefined),
          listLocalProjectDrafts().catch(() => []),
        ]);
        saved = localDraft;
        if (active) setProjectCatalog(localProjects);
      }
      if (!active) return;
      if (saved) restoreDraft(saved);
      else setLocalDraftStatus("ready");
      setLocalDraftHydrated(true);
    })()
      .catch((caught) => {
        if (active) {
          setLocalDraftStatus("error");
          setLocalDraftError(
            caught instanceof Error ? caught.message : "项目恢复失败。",
          );
        }
      });
      // A failed restore must not unlock autosave. Otherwise the initial
      // fixture can overwrite cloud state or create a second project before
      // the user has recovered the original record.
    return () => {
      active = false;
    };
  }, [
    initialDocuments,
    initialResult.projectFacts.reference_experience,
  ]);

  const facts = result.projectFacts;
  const plan = result.pagePlan;
  const projectDocuments = documents.filter(
    (document) => document.role !== "reference_style",
  );
  const referenceLibraryConnected = cloudStoreStatus?.configured
    ? Boolean(
        cloudStoreStatus.connected &&
          cloudStoreStatus.referenceLibraryConnected,
      )
    : Boolean(facts.reference_experience);
  const hasProjectSource = projectDocuments.some((document) =>
    ["authoritative", "proposal"].includes(document.role),
  );
  const selectedPage = plan.pages.find(
    (page) => page.page_id === selectedPageId,
  );
  const activeAgentWork = useMemo(
    () =>
      busy || backgroundTask
        ? agentWorkDisplay(
            busy ?? backgroundTask ?? "site-research",
            plan,
            selectedPageId,
            visualImageJob,
          )
        : null,
    [backgroundTask, busy, plan, selectedPageId, visualImageJob],
  );
  const editingSelectedPageText =
    Boolean(selectedPage) && pageTextDraft?.pageId === selectedPage?.page_id;

  const beginPageTextEdit = () => {
    if (!selectedPage) return;
    setError("");
    setPageTextTranslationStatus("idle");
    setPageTextTranslationError("");
    setTranslatedPageTextSource("");
    translatedSourceRef.current = "";
    const section = plan.sections.find(
      (candidate) => candidate.section_id === selectedPage.section_id,
    );
    const pageFacts = (selectedPage.fact_refs ?? [])
      .map((factId) => facts.facts.find((fact) => fact.fact_id === factId))
      .filter(Boolean) as DesignReportProjectFacts["facts"];
    const visibleLabels = presentationLabels(
      selectedPage,
      pageFacts,
      facts.reference_style_examples ?? [],
    );
    const bodyZh =
      selectedPage.body_zh ||
      selectedPage.body_copy ||
      presentationBody(
        selectedPage,
        pageFacts,
        facts.reference_style_examples ?? [],
      );
    const labelCount = Math.max(
      visibleLabels.length,
      selectedPage.diagram_labels_en?.length ?? 0,
    );
    const visibleCallouts: EditableTextPair[] = selectedPage.callouts?.length
      ? selectedPage.callouts.map((callout) => ({
          zh: callout.label_zh,
          en: callout.label_en ?? "",
          factRef: callout.fact_ref,
        }))
      : selectedPage.page_type === "strategy"
        ? visibleLabels.slice(0, 4).map((label, index) => ({
            zh: strategyStepDescription(label, index),
            en: "",
          }))
        : pageFacts.slice(0, 4).map((fact) => ({
            zh: String(fact.value_raw),
            en: "",
            factRef: fact.fact_id,
          }));
    setPageTextDraft({
      pageId: selectedPage.page_id,
      projectName:
        facts.project_name_anonymized ??
        String(
          facts.facts.find((fact) => fact.field_path === "project.name")
            ?.value_raw ?? "",
        ),
      sectionTitleZh: section?.title_zh ?? "",
      sectionTitleEn: section?.title_en ?? "",
      headlineZh: normalizePageHeadline(selectedPage.headline_zh, "当前页"),
      headlineEn: selectedPage.headline_en ?? "",
      coreMessage: selectedPage.core_message,
      coreMessageEn: selectedPage.core_message_en ?? "",
      bodyZh,
      bodyEn: selectedPage.body_en ?? "",
      diagramLabels: Array.from({ length: labelCount }, (_, index) => ({
        zh: visibleLabels[index] ?? "",
        en:
          selectedPage.diagram_labels_en?.[index] ??
          englishLabelFallback(selectedPage.page_type, index),
      })),
      callouts: visibleCallouts,
      speakerNotes: selectedPage.speaker_notes,
      tocSections: plan.sections
        .filter(
          (item) =>
            selectedPage.page_type !== "toc" ||
            item.section_id !== selectedPage.section_id,
        )
        .map((item) => ({
          sectionId: item.section_id,
          titleZh: item.title_zh,
          titleEn: item.title_en ?? "",
          purpose: item.purpose,
        })),
    });
  };

  const cancelPageTextEdit = () => {
    translationRequestRef.current += 1;
    setPageTextDraft(null);
    setPageTextTranslationStatus("idle");
    setPageTextTranslationError("");
    setTranslatedPageTextSource("");
  };

  const selectPage = (pageId: string) => {
    if (pageId !== selectedPageId) cancelPageTextEdit();
    setSelectedPageId(pageId);
  };

  const updatePageTextDraft = <K extends keyof PageTextDraft>(
    field: K,
    value: PageTextDraft[K],
  ) => {
    setPageTextTranslationStatus("waiting");
    setPageTextTranslationError("");
    setPageTextDraft((current) =>
      current ? { ...current, [field]: value } : current,
    );
  };

  const pageTextTranslationPayload = useMemo(
    () =>
      pageTextDraft && selectedPage
        ? pageTextTranslationInput(pageTextDraft, selectedPage.page_type)
        : null,
    [pageTextDraft, selectedPage],
  );
  const pageTextTranslationSource = useMemo(
    () =>
      pageTextTranslationPayload
        ? JSON.stringify(pageTextTranslationPayload)
        : "",
    [pageTextTranslationPayload],
  );

  useEffect(() => {
    latestTranslationSourceRef.current = pageTextTranslationSource;
    if (
      !editingSelectedPageText ||
      !pageTextTranslationPayload ||
      !pageTextTranslationSource ||
      pageTextTranslationSource === translatedSourceRef.current
    ) {
      return;
    }
    const sourceAtSchedule = pageTextTranslationSource;
    const payloadAtSchedule = pageTextTranslationPayload;
    const timer = window.setTimeout(() => {
      const requestId = translationRequestRef.current + 1;
      translationRequestRef.current = requestId;
      setPageTextTranslationStatus("translating");
      setPageTextTranslationError("");
      void callPipeline<PageTextTranslationResponse>(
        {
          action: "translate_page_text",
          projectFacts: facts,
          pagePlan: plan,
          pageId: selectedPage?.page_id,
          text: payloadAtSchedule,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      )
        .then((response) => {
          if (
            translationRequestRef.current !== requestId ||
            latestTranslationSourceRef.current !== sourceAtSchedule
          ) {
            return;
          }
          translatedSourceRef.current = sourceAtSchedule;
          setTranslatedPageTextSource(sourceAtSchedule);
          setPageTextDraft((current) =>
            current
              ? applyPageTextTranslation(current, response.translation)
              : current,
          );
          const translationNode = [...response.nodeOutputs]
            .reverse()
            .find((node) => node.node === "page_text_translation");
          if (translationNode) {
            const responseKey = tokenResponseKey(translationNode);
            if (
              responseKey &&
              !accountedModelResponses.current.has(responseKey) &&
              translationNode.token_usage
            ) {
              accountedModelResponses.current.add(responseKey);
              setSessionTokenUsage((current) => ({
                ...current,
                input:
                  current.input + translationNode.token_usage!.input,
                output:
                  current.output + translationNode.token_usage!.output,
              }));
            }
            setResult((current) => ({
              ...current,
              nodeOutputs: current.nodeOutputs.some(
                (node) => tokenResponseKey(node) === responseKey,
              )
                ? current.nodeOutputs
                : [...current.nodeOutputs, translationNode],
              modelCallCount:
                current.modelCallCount + translationNode.model_calls,
              executionMode: "openai_model",
              modelName: translationNode.model ?? current.modelName,
            }));
          }
          setPageTextTranslationStatus("completed");
        })
        .catch((caught) => {
          if (
            translationRequestRef.current !== requestId ||
            latestTranslationSourceRef.current !== sourceAtSchedule
          ) {
            return;
          }
          setPageTextTranslationStatus("failed");
          setPageTextTranslationError(
            caught instanceof Error
              ? caught.message
              : "英文自动翻译失败，请重试。",
          );
        });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    apiSettings,
    editingSelectedPageText,
    facts,
    pageTextTranslationPayload,
    pageTextTranslationSource,
    plan,
    result.nodeOutputs,
    selectedPage?.page_id,
    translationRetryNonce,
  ]);

  const savePageTextEdit = () => {
    if (!selectedPage || !pageTextDraft) return;
    if (
      pageTextTranslationStatus === "waiting" ||
      pageTextTranslationStatus === "translating" ||
      pageTextTranslationSource !== translatedPageTextSource
    ) {
      setPageTextTranslationError(
        "Agent 正在根据最新中文生成英文，请完成后再保存。",
      );
      return;
    }
    const normalize = (value: string) =>
      value.replace(/\r\n?/g, "\n").trim();
    const draft = {
      ...pageTextDraft,
      projectName: normalize(pageTextDraft.projectName),
      sectionTitleZh: normalize(pageTextDraft.sectionTitleZh),
      sectionTitleEn: normalize(pageTextDraft.sectionTitleEn),
      headlineZh: normalize(pageTextDraft.headlineZh),
      headlineEn: normalize(pageTextDraft.headlineEn),
      coreMessage: normalize(pageTextDraft.coreMessage),
      coreMessageEn: normalize(pageTextDraft.coreMessageEn),
      bodyZh: normalize(pageTextDraft.bodyZh),
      bodyEn: normalize(pageTextDraft.bodyEn),
      diagramLabels: pageTextDraft.diagramLabels
        .map((item) => ({ zh: normalize(item.zh), en: normalize(item.en) }))
        .filter((item) => item.zh || item.en),
      callouts: pageTextDraft.callouts
        .map((item) => ({
          zh: normalize(item.zh),
          en: normalize(item.en),
          factRef: item.factRef,
        }))
        .filter((item) => item.zh || item.en),
      speakerNotes: normalize(pageTextDraft.speakerNotes),
      tocSections: pageTextDraft.tocSections.map((item) => ({
        ...item,
        titleZh: normalize(item.titleZh),
        titleEn: normalize(item.titleEn),
        purpose: normalize(item.purpose),
      })),
    };
    if (!draft.headlineZh) {
      setError("当前页中文标题不能为空。");
      return;
    }
    const presentationTexts = [
      draft.sectionTitleZh,
      draft.sectionTitleEn,
      draft.headlineZh,
      draft.headlineEn,
      draft.coreMessage,
      draft.coreMessageEn,
      draft.bodyZh,
      draft.bodyEn,
      ...draft.diagramLabels.flatMap((item) => [item.zh, item.en]),
      ...draft.callouts.flatMap((item) => [item.zh, item.en]),
      ...(selectedPage.page_type === "toc"
        ? draft.tocSections.flatMap((item) => [
            item.titleZh,
            item.titleEn,
            item.purpose,
          ])
        : []),
    ];
    if (presentationTexts.some(containsBackstagePresentationText)) {
      setError(
        "可见文字中仍包含图像建议、排版提示或后台生产信息，请删除后再保存。",
      );
      return;
    }
    recordHistory("编辑当前页全部文字");
    setResult((current) => ({
      ...current,
      projectFacts: (() => {
        const currentName = current.projectFacts.project_name_anonymized ?? "";
        if (!draft.projectName || draft.projectName === currentName) {
          return current.projectFacts;
        }
        const projectNameFact = current.projectFacts.facts.find(
          (fact) => fact.field_path === "project.name",
        );
        return projectNameFact
          ? reviseProjectFact(
              current.projectFacts,
              projectNameFact.fact_id,
              draft.projectName,
              "在当前页文字编辑器中确认页眉项目名称。",
            )
          : {
              ...current.projectFacts,
              project_name_anonymized: draft.projectName,
            };
      })(),
      pagePlan: {
        ...current.pagePlan,
        sections: current.pagePlan.sections.map((section) => {
          const tocSection =
            selectedPage.page_type === "toc"
              ? draft.tocSections.find(
                  (item) => item.sectionId === section.section_id,
                )
              : undefined;
          if (tocSection) {
            return {
              ...section,
              title_zh: tocSection.titleZh,
              title_en: tocSection.titleEn,
              purpose: tocSection.purpose,
            };
          }
          if (section.section_id !== selectedPage.section_id) return section;
          return {
            ...section,
            title_zh: draft.sectionTitleZh,
            title_en: draft.sectionTitleEn,
          };
        }),
        pages: current.pagePlan.pages.map((page) => {
          if (page.page_id !== selectedPage.page_id) return page;
          const nextCallouts = draft.callouts.map((item, index) => {
            const original = page.callouts?.[index];
            return {
              label_zh: item.zh,
              ...(item.en ? { label_en: item.en } : {}),
              ...(item.factRef &&
              (!original || original.label_zh === item.zh)
                ? { fact_ref: item.factRef }
                : {}),
            };
          }) as NonNullable<typeof page.callouts>;
          const nextPage = {
            ...page,
            headline_zh: normalizePageHeadline(
              draft.headlineZh,
              "当前页",
            ),
            headline_en: draft.headlineEn,
            core_message: draft.coreMessage,
            core_message_en: draft.coreMessageEn,
            body_zh: draft.bodyZh,
            body_en: draft.bodyEn,
            body_copy: draft.bodyZh,
            diagram_labels: draft.diagramLabels.map((item) => item.zh),
            diagram_labels_en: draft.diagramLabels.map((item) => item.en),
            callouts: nextCallouts,
            speaker_notes: draft.speakerNotes,
            generation_status: draft.bodyZh || draft.coreMessage
              ? ("generated" as const)
              : page.missing_information.length
                ? ("placeholder" as const)
                : ("ready" as const),
          };
          return {
            ...nextPage,
            content_depth_check: evaluatePageContentDepth(
              current.projectFacts,
              nextPage,
            ),
          };
        }),
      },
    }));
    translationRequestRef.current += 1;
    setPageTextDraft(null);
    setPageTextTranslationStatus("idle");
    setPageTextTranslationError("");
    setTranslatedPageTextSource("");
    setError("");
  };
  const selectedVisualSlotId =
    selectedVisualSlotChoice &&
    selectedVisualSlotChoice.pageId === selectedPageId
      ? selectedVisualSlotChoice.slotId
      : null;
  const selectVisualSlot = (slotId: string) => {
    if (!selectedPageId) return;
    setSelectedVisualSlotChoice({ pageId: selectedPageId, slotId });
  };
  const openVisualAsset = (asset: PageVisualAsset, title: string) => {
    const pageLabel = selectedPage?.display_page_number
      ? `P${String(selectedPage.display_page_number).padStart(2, "0")}`
      : selectedPage?.page_id ?? "当前页";
    setVisualAssetPreview({
      asset,
      title,
      fileName: `${facts.project_name_anonymized || "当前项目"}_${pageLabel}_${title}`,
    });
  };
  const selectedFacts = useMemo(
    () =>
      (selectedPage?.fact_refs ?? [])
        .map((factId) => facts.facts.find((fact) => fact.fact_id === factId))
        .filter(Boolean) as DesignReportProjectFacts["facts"],
    [facts.facts, selectedPage],
  );
  const selectedReportBody = selectedPage
    ? presentationBody(
        selectedPage,
        selectedFacts,
        facts.reference_style_examples ?? [],
      )
    : "";
  const selectedReportLabels = selectedPage
    ? presentationLabels(
        selectedPage,
        selectedFacts,
        facts.reference_style_examples ?? [],
      )
    : [];
  const selectedReportHeadline = selectedPage
    ? displayPageHeadline(selectedPage, isSmallBuildingMode(taskMode))
    : "";
  const selectedReportCoreMessage = selectedPage
    ? sanitizePresentationText(selectedPage.core_message)
    : "";
  const selectedSection = plan.sections.find(
    (section) => section.section_id === selectedPage?.section_id,
  );
  const textEditorPreviewSections =
    editingSelectedPageText && pageTextDraft
      ? plan.sections.map((section) => {
          const tocSection = pageTextDraft.tocSections.find(
            (item) => item.sectionId === section.section_id,
          );
          if (tocSection) {
            return {
              ...section,
              title_zh: tocSection.titleZh,
              title_en: tocSection.titleEn,
              purpose: tocSection.purpose,
            };
          }
          return section.section_id === selectedPage?.section_id
            ? {
                ...section,
                title_zh: pageTextDraft.sectionTitleZh,
                title_en: pageTextDraft.sectionTitleEn,
              }
            : section;
        })
      : plan.sections;
  const textEditorPreviewPage =
    selectedPage && editingSelectedPageText && pageTextDraft
      ? ({
          ...selectedPage,
          headline_zh: normalizePageHeadline(
            pageTextDraft.headlineZh,
            "当前页",
          ),
          headline_en: pageTextDraft.headlineEn,
          core_message: pageTextDraft.coreMessage,
          core_message_en: pageTextDraft.coreMessageEn,
          body_zh: pageTextDraft.bodyZh,
          body_en: pageTextDraft.bodyEn,
          body_copy: pageTextDraft.bodyZh,
          diagram_labels: pageTextDraft.diagramLabels.map((item) => item.zh),
          diagram_labels_en: pageTextDraft.diagramLabels.map(
            (item) => item.en,
          ),
          callouts: pageTextDraft.callouts.map((item) => ({
            label_zh: item.zh,
            ...(item.en ? { label_en: item.en } : {}),
            ...(item.factRef ? { fact_ref: item.factRef } : {}),
          })) as NonNullable<typeof selectedPage.callouts>,
          speaker_notes: pageTextDraft.speakerNotes,
        } satisfies typeof selectedPage)
      : selectedPage;
  const textEditorPreviewSection = textEditorPreviewSections.find(
    (section) => section.section_id === textEditorPreviewPage?.section_id,
  );
  const selectedProposalValidationItems = selectedPage
    ? proposalValidationItemsForPage(selectedPage)
    : [];
  const selectedContentDepth = selectedPage
    ? evaluatePageContentDepth(facts, selectedPage)
    : null;
  const selectedRequiredImageCount = selectedPage
    ? selectedPage.visual_task?.image_slots?.length ||
      getVisualImageSlotCountForPage(selectedPage)
    : 0;
  const selectedGeneratedImageCount = selectedPage
    ? selectedPage.visual_task?.generated_images?.length ||
      (selectedPage.visual_task?.generated_image ? 1 : 0)
    : 0;
  const selectedVisualSlot =
    selectedPage?.visual_task?.image_slots?.find(
      (slot) => slot.slot_id === selectedVisualSlotId,
    ) ?? null;
  const currentResultTokenUsage = useMemo(
    () => sumTokenUsage(result.nodeOutputs),
    [result.nodeOutputs],
  );
  const sessionTokenTotal =
    sessionTokenUsage.input +
    sessionTokenUsage.output +
    sessionTokenUsage.imageInput +
    sessionTokenUsage.imageOutput;
  const textTokenTotal =
    sessionTokenUsage.input + sessionTokenUsage.output;
  const referenceGroundedPageCount = plan.pages.filter(
    (page) =>
      (page.experience_recipe_refs?.length ?? 0) > 0 &&
      (page.style_example_refs?.length ?? 0) > 0,
  ).length;
  const confirmedMissingItemIds = useMemo(
    () =>
      new Set(
        (facts.gate_b_proposals ?? [])
          .filter((proposal) => proposal.status === "confirmed")
          .map((proposal) => proposal.missing_item_id),
      ),
    [facts.gate_b_proposals],
  );
  const userCreatedProposals = useMemo(
    () =>
      (facts.gate_b_proposals ?? []).filter(
        (proposal) => proposal.origin === "user_created",
      ),
    [facts.gate_b_proposals],
  );
  const unresolvedIssueCount =
    facts.missing_items.filter(
      (item) => !confirmedMissingItemIds.has(item.item_id),
    ).length + facts.conflicts.length;
  const proposalPanelCount =
    (facts.gate_b_proposals?.length ?? 0) +
    facts.missing_items.filter(
      (item) =>
        !(facts.gate_b_proposals ?? []).some(
          (proposal) => proposal.missing_item_id === item.item_id,
        ),
    ).length +
    facts.conflicts.length;
  const hasConfirmedGateBBlocker = facts.missing_items.some(
    (item) =>
      item.severity === "blocking" &&
      item.description.startsWith("Gate B 缺少：") &&
      confirmedMissingItemIds.has(item.item_id),
  );
  const hasUnresolvedBlockingItem = facts.missing_items.some(
    (item) =>
      item.severity === "blocking" &&
      !confirmedMissingItemIds.has(item.item_id),
  );
  const gateBDisplayStatus =
    hasConfirmedGateBBlocker && !hasUnresolvedBlockingItem
      ? "confirmed"
      : facts.gate_report?.generation_readiness;
  const visualImagePersistenceKey = visualImageJob
    ? visualImageJob.stage === "failed"
      ? `${visualImageJob.taskId}:failed:${visualImageJob.attemptCount ?? 0}`
      : visualImageJob.stage === "completed"
        ? `${visualImageJob.taskId}:completed`
        : `${visualImageJob.taskId}:active`
    : "none";

  useEffect(() => {
    if (!localDraftHydrated) return;
    if (autosaveMode === "manual") return;
    const autosaveDelayMs =
      autosaveMode === "30m"
        ? AUTOSAVE_INTERVAL_30M_MS
        : AUTOSAVE_INTERVAL_MS;
    const saveTimer = window.setTimeout(() => {
      if (projectTransitionRef.current) return;
      setLocalDraftStatus("saving");
      const draft: LocalProjectDraft = {
            version: 1,
            projectId,
            title:
              projectTitle.trim() ||
              facts.project_name_anonymized ||
              "未命名设计",
            companyName: companyName.trim(),
            status: "active",
            updatedAt: new Date().toISOString(),
            documents: persistedProjectDocuments(documents),
            result: persistedProjectResult(
              result,
              cloudStoreStatus?.connected ? "memfire" : "browser",
            ),
            selectedPageId: latestSelectedPageIdRef.current,
            documentsChanged,
            sessionTokenUsage,
            gateBInputs,
            history: persistedProjectHistory(history),
            visualImageJob:
              latestVisualImageJobRef.current?.stage === "completed"
                ? undefined
                : latestVisualImageJobRef.current ?? undefined,
          };
      const persist = async () => {
        if (!hasProjectSource) {
          if (documentsChanged) await clearLocalProjectDraft();
          setLocalDraftStatus("ready");
          setLocalDraftError("");
          return;
        }
        let currentCloudStatus = cloudStoreStatus;
        if (currentCloudStatus?.configured && !currentCloudStatus.connected) {
          currentCloudStatus = await getCloudStoreStatus().catch(
            () => currentCloudStatus,
          );
          setCloudStoreStatus(currentCloudStatus);
        }
        if (currentCloudStatus?.connected) {
          try {
            const savedCloud = await saveCloudProject({
              ...draft,
              result: persistedProjectResult(result, "memfire"),
             }, cloudRevisionRef.current);
             cloudRevisionRef.current = savedCloud.updatedAt;
             if (latestProjectIdRef.current === projectId) {
               setResult((current) =>
                 applyPersistedImageUrlUpdates(
                   current,
                   savedCloud.imageUrls,
                 ),
               );
             }
             setProjectCatalog((current) => [
               {
                 projectId,
                 title: draft.title ?? "未命名设计",
                 status: "active",
                 updatedAt: savedCloud.updatedAt,
                 storage: "memfire",
               },
               ...current.filter((item) => item.projectId !== projectId),
             ]);
             await clearLocalProjectDraft().catch(() => undefined);
            setLocalDraftStatus("saved");
            setLocalDraftError("");
            return;
          } catch (caught) {
            const reason =
              caught instanceof Error ? caught.message : "MemFire 保存失败";
            await saveLocalProjectDraft({
              ...draft,
              result: persistedProjectResult(result, "browser"),
            });
            if (caught instanceof CloudProjectConflictError) {
              setLocalDraftStatus("warning");
              setLocalDraftError(
                `${reason} 当前编辑已保存在本浏览器，没有覆盖云端新版。`,
              );
              return;
            }
            setCloudStoreStatus({
              ...currentCloudStatus,
              connected: false,
              error: reason,
            });
            setLocalDraftStatus("warning");
            setLocalDraftError(`${reason}；已保存浏览器轻量备份，将自动重试。`);
            return;
          }
        }
        await saveLocalProjectDraft({
          ...draft,
          result: persistedProjectResult(result, "browser"),
        });
        setProjectCatalog((current) => [
          {
            projectId,
            title: draft.title ?? "未命名设计",
            status: "active",
            updatedAt: draft.updatedAt,
            storage: "browser",
          },
          ...current.filter((item) => item.projectId !== projectId),
        ]);
        setLocalDraftStatus(
          currentCloudStatus?.configured ? "warning" : "saved",
        );
        setLocalDraftError(
          currentCloudStatus?.configured
            ? `${currentCloudStatus.error ?? "MemFire 暂时不可用"}；已保存浏览器轻量备份，将自动重试。`
            : "",
        );
      };
      queuedAutosaveRef.current = persist;
      if (!autosaveInFlightRef.current) {
        const runQueuedAutosave = () => {
          const nextPersist = queuedAutosaveRef.current;
          if (!nextPersist) return;
          queuedAutosaveRef.current = null;
          const inFlight = nextPersist()
            .catch((caught) => {
              setLocalDraftStatus("error");
              setLocalDraftError(
                caught instanceof Error ? caught.message : "项目存档失败。",
              );
            })
            .finally(() => {
              autosaveInFlightRef.current = null;
              if (queuedAutosaveRef.current) runQueuedAutosave();
            });
          autosaveInFlightRef.current = inFlight;
        };
        runQueuedAutosave();
      }
    }, autosaveDelayMs);
    return () => window.clearTimeout(saveTimer);
  }, [
    documents,
    documentsChanged,
    gateBInputs,
    history,
    hasProjectSource,
    localDraftHydrated,
    cloudStoreStatus?.connected,
    facts.project_name_anonymized,
    projectId,
    projectTitle,
    result,
    sessionTokenUsage,
    autosaveMode,
    visualImagePersistenceKey,
  ]);

  const createHistoryEntry = (
    label: string,
    overrides?: Partial<
      Pick<
        ProjectHistoryEntry,
        | "documents"
        | "result"
        | "selectedPageId"
        | "documentsChanged"
        | "gateBInputs"
      >
    >,
  ): ProjectHistoryEntry => ({
    historyId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    label,
    documents: structuredClone(
      historySafeDocuments(overrides?.documents ?? documents),
    ),
    result: structuredClone(historySafeResult(overrides?.result ?? result)),
    selectedPageId: overrides?.selectedPageId ?? selectedPageId,
    documentsChanged:
      overrides?.documentsChanged ?? documentsChanged,
    gateBInputs: structuredClone(overrides?.gateBInputs ?? gateBInputs),
  });

  const recordHistory = (
    label: string,
    overrides?: Parameters<typeof createHistoryEntry>[1],
  ) => {
    const entry = createHistoryEntry(label, overrides);
    setHistory((current) => [...current, entry].slice(-20));
  };

  const applyHistoryEntry = (entry: ProjectHistoryEntry) => {
    const historyProjectFacts = {
      ...entry.result.projectFacts,
      reference_experience:
        entry.result.projectFacts.reference_experience ??
        result.projectFacts.reference_experience,
      reference_style_examples:
        entry.result.projectFacts.reference_style_examples ??
        result.projectFacts.reference_style_examples,
    };
    const synchronized = synchronizeProposalCoverage(
      historyProjectFacts,
      entry.result.pagePlan,
    );
    const liveDocuments = new Map(
      documents.map((document) => [document.document_id, document]),
    );
    setDocuments(
      structuredClone(
        entry.documents.map((document) => {
          const live = liveDocuments.get(document.document_id);
          return {
            ...document,
            ...(live?.file_data ? { file_data: live.file_data } : {}),
            ...(live?.visual_pages?.length
              ? { visual_pages: live.visual_pages }
              : {}),
          };
        }),
      ),
    );
    setResult({
      ...structuredClone(entry.result),
      ...synchronized,
    });
    setSelectedPageId(
      entry.selectedPageId &&
        entry.result.pagePlan.pages.some(
          (page) => page.page_id === entry.selectedPageId,
        )
        ? entry.selectedPageId
        : entry.result.pagePlan.pages[0]?.page_id,
    );
    setDocumentsChanged(entry.documentsChanged);
    setGateBInputs(structuredClone(entry.gateBInputs));
    setSelectedVisualSlotChoice(null);
    cancelPageTextEdit();
    setError("");
  };

  const undoLastChange = () => {
    const entry = history.at(-1);
    if (!entry || busy) return;
    setHistory((current) => current.slice(0, -1));
    applyHistoryEntry(entry);
    setShowHistory(false);
  };

  const restoreHistoryEntry = (entry: ProjectHistoryEntry) => {
    if (busy) return;
    const currentEntry = createHistoryEntry("恢复历史版本前");
    setHistory((current) =>
      [
        ...current.filter(
          (candidate) => candidate.historyId !== entry.historyId,
        ),
        currentEntry,
      ].slice(-20),
    );
    applyHistoryEntry(entry);
    setShowHistory(false);
  };

  const acceptPipelineResult = (
    next: PipelineResult,
    historyLabel = "更新项目",
    historyBaseResult?: PipelineResult,
  ) => {
    if (historyBaseResult) {
      recordHistory(historyLabel, { result: historyBaseResult });
    } else {
      recordHistory(historyLabel);
    }
    const synchronized = synchronizeProposalCoverage(
      next.projectFacts,
      next.pagePlan,
    );
    const nextWithMode = {
      ...next,
      ...synchronized,
      analysisMode: next.analysisMode ?? result.analysisMode,
    };
    latestResultRef.current = nextWithMode;
    let addedInput = 0;
    let addedOutput = 0;
    let addedImageInput = 0;
    let addedImageOutput = 0;
    let addedImageCalls = 0;
    let addedImages = 0;
    for (const nodeOutput of nextWithMode.nodeOutputs) {
      const responseKey = tokenResponseKey(nodeOutput);
      if (
        !responseKey ||
        accountedModelResponses.current.has(responseKey) ||
        !nodeOutput.token_usage
      ) {
        continue;
      }
      accountedModelResponses.current.add(responseKey);
      if (nodeOutput.node === "visual_image_generation") {
        addedImageInput += nodeOutput.token_usage.input;
        addedImageOutput += nodeOutput.token_usage.output;
        addedImageCalls += nodeOutput.image_count ?? 0;
      } else {
        addedInput += nodeOutput.token_usage.input;
        addedOutput += nodeOutput.token_usage.output;
      }
      addedImages += nodeOutput.image_count ?? 0;
    }
    if (
      addedInput ||
      addedOutput ||
      addedImageInput ||
      addedImageOutput ||
      addedImages
    ) {
      setSessionTokenUsage((current) => ({
        input: current.input + addedInput,
        output: current.output + addedOutput,
        imageInput: current.imageInput + addedImageInput,
        imageOutput: current.imageOutput + addedImageOutput,
        imageCalls: current.imageCalls + addedImageCalls,
        images: current.images + addedImages,
      }));
    }
    setResult(nextWithMode);
  };

  const acceptVisualImageResult = (
    next: PipelineResult,
    pageId: string,
    slotId: string,
  ) => {
    const responsePage = next.pagePlan.pages.find(
      (page) => page.page_id === pageId,
    );
    const responseTask = responsePage?.visual_task;
    const responseImage = responseTask?.generated_images?.find(
      (image) => image.slot_id === slotId,
    );
    if (!responseTask || !responseImage) {
      throw new Error("图像模型已返回，但没有找到当前图框的生成结果。");
    }

    recordHistory("重新生成单张视觉图片", {
      result: latestResultRef.current,
    });

    let addedInput = 0;
    let addedOutput = 0;
    let addedImageInput = 0;
    let addedImageOutput = 0;
    let addedImageCalls = 0;
    let addedImages = 0;
    for (const nodeOutput of next.nodeOutputs) {
      const responseKey = tokenResponseKey(nodeOutput);
      if (
        !responseKey ||
        accountedModelResponses.current.has(responseKey) ||
        !nodeOutput.token_usage
      ) {
        continue;
      }
      accountedModelResponses.current.add(responseKey);
      if (nodeOutput.node === "visual_image_generation") {
        addedImageInput += nodeOutput.token_usage.input;
        addedImageOutput += nodeOutput.token_usage.output;
        addedImageCalls += nodeOutput.image_count ?? 0;
      } else {
        addedInput += nodeOutput.token_usage.input;
        addedOutput += nodeOutput.token_usage.output;
      }
      addedImages += nodeOutput.image_count ?? 0;
    }
    if (
      addedInput ||
      addedOutput ||
      addedImageInput ||
      addedImageOutput ||
      addedImages
    ) {
      setSessionTokenUsage((current) => ({
        input: current.input + addedInput,
        output: current.output + addedOutput,
        imageInput: current.imageInput + addedImageInput,
        imageOutput: current.imageOutput + addedImageOutput,
        imageCalls: current.imageCalls + addedImageCalls,
        images: current.images + addedImages,
      }));
    }

    setResult((current) => {
      const visualNode = [...next.nodeOutputs]
        .reverse()
        .find((nodeOutput) => nodeOutput.node === "visual_image_generation");
      const visualNodeKey = visualNode
        ? tokenResponseKey(visualNode)
        : null;
      const shouldAppendVisualNode = Boolean(
        visualNode &&
          (!visualNodeKey ||
            !current.nodeOutputs.some(
              (nodeOutput) =>
                tokenResponseKey(nodeOutput) === visualNodeKey,
            )),
      );

      const mergedResult = {
        ...current,
        pagePlan: {
          ...current.pagePlan,
          pages: current.pagePlan.pages.map((currentPage) => {
            if (currentPage.page_id !== pageId) return currentPage;
            const currentTask = currentPage.visual_task ?? responseTask;
            const mergedImages = [
              ...(currentTask.generated_images ?? []).filter(
                (image) => image.slot_id !== slotId,
              ),
              responseImage,
            ].sort(
              (left, right) =>
                currentTask.image_slots.findIndex(
                  (slot) => slot.slot_id === left.slot_id,
                ) -
                currentTask.image_slots.findIndex(
                  (slot) => slot.slot_id === right.slot_id,
                ),
            );
            const responseConversationEntry =
              responseTask.conversation.at(-1);
            const conversation = responseConversationEntry
              ? [
                  ...currentTask.conversation.filter(
                    (entry) =>
                      !(
                        entry.role === responseConversationEntry.role &&
                        entry.round === responseConversationEntry.round &&
                        entry.content === responseConversationEntry.content
                      ),
                  ),
                  responseConversationEntry,
                ]
              : currentTask.conversation;

            return {
              ...currentPage,
              visual_task: {
                ...currentTask,
                image_prompt: responseTask.image_prompt,
                generated_images:
                  mergedImages as typeof currentTask.generated_images,
                generated_image: legacyGeneratedImageFromSlots(
                  mergedImages as NonNullable<
                    PageVisualTask["generated_images"]
                  >,
                  responseTask.generated_image,
                ),
                conversation,
              },
            };
          }),
        },
        nodeOutputs:
          shouldAppendVisualNode && visualNode
            ? [...current.nodeOutputs, visualNode]
            : current.nodeOutputs,
        modelCallCount:
          current.modelCallCount +
          (shouldAppendVisualNode && visualNode
            ? visualNode.model_calls
            : 0),
        executionMode: next.executionMode ?? current.executionMode,
        modelName: next.modelName ?? current.modelName,
      };
      latestResultRef.current = mergedResult;
      return mergedResult;
    });
  };

  const addPageFromPrompt = async () => {
    const prompt = addPagePrompt.trim();
    if (!prompt) {
      setError("请先说明新增页面要表达什么。");
      return;
    }
    setBusy("add-page");
    setError("");
    try {
      const existingPageIds = new Set(
        plan.pages.map((page) => page.page_id),
      );
      const next = await callPipeline(
        {
          action: "add_page",
          projectFacts: facts,
          pagePlan: plan,
          prompt,
          afterPageId: selectedPage?.page_id,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      );
      const addedPage = next.pagePlan.pages.find(
        (page) => !existingPageIds.has(page.page_id),
      );
      if (!addedPage) throw new Error("模型返回后没有找到新增页面。");
      acceptPipelineResult(next, "新增页面");
      setSelectedPageId(addedPage.page_id);
      setDetailTab("content");
      setShowAddPageComposer(false);
      setAddPagePrompt("");
      cancelPageTextEdit();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "新增页面失败",
      );
    } finally {
      setBusy(null);
    }
  };

  const deleteSelectedPage = () => {
    if (!selectedPage) return;
    if (plan.pages.length <= 1) {
      setError("汇报至少需要保留一页。");
      return;
    }
    const confirmed = window.confirm(
      `确定删除第 ${selectedPage.display_page_number} 页“${selectedPage.headline_zh}”吗？此操作会同时删除该页正文和视觉草案。`,
    );
    if (!confirmed) return;
    recordHistory("删除页面");

    const removedIndex = plan.pages.findIndex(
      (page) => page.page_id === selectedPage.page_id,
    );
    const remainingPages = plan.pages
      .filter((page) => page.page_id !== selectedPage.page_id)
      .map((page, index) => ({
        ...page,
        display_page_number: index + 1,
      }));
    const usedSectionIds = new Set(
      remainingPages.map((page) => page.section_id),
    );
    const nextPlan: DesignReportPagePlan = {
      ...plan,
      sections: plan.sections.filter((section) =>
        usedSectionIds.has(section.section_id),
      ),
      pages: remainingPages,
      target_page_count: remainingPages.length,
      audit_report: undefined,
    };
    const synchronized = synchronizeProposalCoverage(facts, nextPlan);
    const nextSelectedPage =
      remainingPages[
        Math.min(Math.max(0, removedIndex), remainingPages.length - 1)
      ];
    setResult((current) => ({
      ...current,
      ...synchronized,
    }));
    setSelectedPageId(nextSelectedPage?.page_id);
    cancelPageTextEdit();
    setError("");
  };

  const startBackgroundSiteResearch = (
    baseResult: PipelineResult,
    sourceDocuments: InputDocument[],
  ) => {
    const requestId = siteResearchRequestRef.current + 1;
    siteResearchRequestRef.current = requestId;
    const requestProjectId = latestProjectIdRef.current;
    setBackgroundTask("site-research");

    void callPipeline(
      {
        action: "site_research",
        projectFacts: baseResult.projectFacts,
        pagePlan: baseResult.pagePlan,
        documents: sourceDocuments,
        nodeOutputs: baseResult.nodeOutputs,
        mapConfig: apiSettings.amapApiKey
          ? { amapApiKey: apiSettings.amapApiKey }
          : undefined,
      },
      apiSettings,
    )
      .then((researched) => {
        if (
          siteResearchRequestRef.current !== requestId ||
          latestProjectIdRef.current !== requestProjectId
        ) {
          return;
        }
        const current = latestResultRef.current;
        const visualFacts = researched.projectFacts.facts.filter(
          (fact) => fact.fact_id.startsWith("F_SITE_VISUAL_"),
        );
        const mergedResearchFacts = preserveSiteResearchFacts(
          researched.projectFacts,
          current.projectFacts,
        );
        const projectFacts = {
          ...mergedResearchFacts,
          facts: [
            ...mergedResearchFacts.facts.filter(
              (fact) => !fact.fact_id.startsWith("F_SITE_VISUAL_"),
            ),
            ...visualFacts,
          ],
        };
        const synchronized = synchronizeProposalCoverage(
          projectFacts,
          current.pagePlan,
        );
        const researchNodes = researched.nodeOutputs.filter(
          (nodeOutput) => nodeOutput.node === "site_research",
        );
        const existingNodeKeys = new Set(
          current.nodeOutputs
            .map(tokenResponseKey)
            .filter((key): key is string => Boolean(key)),
        );
        const appendedResearchNodes = researchNodes.filter((nodeOutput) => {
          const key = tokenResponseKey(nodeOutput);
          return !key || !existingNodeKeys.has(key);
        });
        const merged: PipelineResult = {
          ...current,
          ...synchronized,
          nodeOutputs: [
            ...current.nodeOutputs,
            ...appendedResearchNodes,
          ],
          modelCallCount:
            current.modelCallCount +
            appendedResearchNodes.reduce(
              (sum, nodeOutput) => sum + nodeOutput.model_calls,
              0,
            ),
          siteResearch: researched.siteResearch,
        };
        acceptPipelineResult(
          merged,
          "后台场地研究完成",
          current,
        );
        if (researched.siteResearch?.status === "skipped") {
          setError(researched.siteResearch.summary);
        }
      })
      .catch((caught) => {
        if (
          siteResearchRequestRef.current === requestId &&
          latestProjectIdRef.current === requestProjectId
        ) {
          setError(
            caught instanceof Error
              ? `场地研究未完成：${caught.message}`
              : "场地研究未完成。",
          );
        }
      })
      .finally(() => {
        if (siteResearchRequestRef.current === requestId) {
          setBackgroundTask(null);
        }
      });
  };

  const processDocuments = async (
    nextDocuments: InputDocument[],
    mode: "fast" | "deep" = "fast",
  ) => {
    setBusy(mode === "fast" ? "run-fast" : "run-deep");
    setError("");
    try {
      const next = await callPipeline(
        {
          action: "run",
          projectId: "SINGLE_PROJECT",
          documents: nextDocuments,
          mode,
          taskMode,
          ...(mode === "deep"
            ? {
                projectFacts: facts,
                pagePlan: plan,
                nodeOutputs: result.nodeOutputs,
              }
            : {}),
        },
        apiSettings,
      );
      let preservedFacts = preserveUserDefinedProposals(
        facts,
        preserveConfirmedFactRevisions(
          facts,
          next.projectFacts,
        ),
      );
      if (mode === "deep") {
        preservedFacts = preserveSiteResearchFacts(facts, preservedFacts);
      }
      const smallModeProposalIds = new Set(
        (preservedFacts.gate_b_proposals ?? [])
          .filter((proposal) => proposal.status === "confirmed")
          .map((proposal) => proposal.missing_item_id),
      );
      const synchronized = isSmallBuildingMode(taskMode)
        ? {
            projectFacts: isolateSmallBuildingProjectFacts(
              ensureSmallModeDesignDirectionState({
                ...preservedFacts,
                task_mode: taskMode,
              }),
            ),
            pagePlan: {
              ...next.pagePlan,
              task_mode: taskMode,
              pages: next.pagePlan.pages.map((page) => ({
                ...page,
                style_example_refs: [],
                experience_recipe_refs: [],
                proposal_refs: (page.proposal_refs ?? []).filter((proposalId) =>
                  smallModeProposalIds.has(proposalId),
                ),
                proposal_coverage: (page.proposal_coverage ?? []).filter((coverage) =>
                  smallModeProposalIds.has(coverage.proposal_id),
                ),
              })),
            },
          }
        : mode === "deep"
          ? synchronizeProposalCoverage(preservedFacts, next.pagePlan)
          : { projectFacts: preservedFacts, pagePlan: next.pagePlan };
      const completedResult: PipelineResult = {
        ...next,
        projectFacts: synchronized.projectFacts,
        pagePlan: synchronized.pagePlan,
      };
      setTaskMode(completedResult.projectFacts.task_mode ?? taskMode);
      acceptPipelineResult(
        completedResult,
        mode === "deep" ? "深度优化" : "快速重建",
      );
      setSelectedPageId(completedResult.pagePlan.pages[0]?.page_id);
      setDocumentsChanged(false);
      if (mode === "fast" && !isSmallBuildingMode(taskMode)) {
        startBackgroundSiteResearch(completedResult, nextDocuments);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运行失败");
    } finally {
      setBusy(null);
    }
  };

  const run = () => processDocuments(documents, "fast");
  const runDeepAnalysis = () => processDocuments(documents, "deep");

  const runSiteResearch = () => {
    if (!hasProjectSource || busy || backgroundTask === "site-research") {
      return;
    }
    setError("");
    startBackgroundSiteResearch(latestResultRef.current, documents);
  };

  const beginFactRevision = (
    fact: DesignReportProjectFacts["facts"][number],
  ) => {
    setEditingFactId(fact.fact_id);
    setFactEditDrafts((current) => ({
      ...current,
      [fact.fact_id]: {
        value: formatFactValue(fact.value_raw),
        message: "",
      },
    }));
  };

  const cancelFactRevision = () => {
    setEditingFactId(null);
  };

  const deleteSiteResearchFact = (factId: string) => {
    const fact = facts.facts.find((candidate) => candidate.fact_id === factId);
    const isSiteEnrichment =
      fact?.source_role === "research_fact" ||
      fact?.fact_id.startsWith("F_SITE_VISUAL_");
    if (!fact || !isSiteEnrichment || busy) return;
    if (!window.confirm("删除这条场地研究事实？删除后可通过“撤销”恢复。")) {
      return;
    }
    recordHistory("删除场地研究事实");
    const nextFacts = removeSiteResearchFact(facts, factId);
    const nextPlan: DesignReportPagePlan = {
      ...plan,
      pages: plan.pages.map((page) => {
        if (!page.fact_refs.includes(factId)) return page;
        return {
          ...page,
          fact_refs: page.fact_refs.filter((ref) => ref !== factId),
          body_zh: "",
          body_en: "",
          body_copy: "",
          diagram_labels: [],
          diagram_labels_en: [],
          callouts: [],
          speaker_notes: "",
          generation_status: "ready",
          visual_task: undefined,
        };
      }),
      audit_report: undefined,
    };
    const synchronized = synchronizeProposalCoverage(nextFacts, nextPlan);
    setResult((current) => ({ ...current, ...synchronized }));
    if (editingFactId === factId) cancelFactRevision();
    setError("");
  };

  const confirmFactRevision = async (factId: string) => {
    const draft = factEditDrafts[factId];
    if (!draft) return;
    setBusy(`fact-${factId}`);
    setError("");
    try {
      const next = await callPipeline(
        {
          action: "revise_fact",
          projectFacts: facts,
          pagePlan: plan,
          factId,
          proposedValue: draft.value,
          userMessage: draft.message,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      );
      acceptPipelineResult(next, "修改项目事实");
      setEditingFactId(null);
      setFactEditDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[factId];
        return nextDrafts;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "事实修改失败");
    } finally {
      setBusy(null);
    }
  };

  const generatePage = async () => {
    if (!selectedPage) return;
    setBusy("generate");
    setError("");
    try {
      const next = await callPipeline(
        {
          action: "generate_page",
          projectFacts: facts,
          pagePlan: plan,
          pageId: selectedPage.page_id,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      );
      acceptPipelineResult(next, "生成当前页中英双语文案");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "页面生成失败");
    } finally {
      setBusy(null);
    }
  };

  const updateVisualTask = async (
    message?: string,
    rematch = false,
  ) => {
    if (!selectedPage) return;
    setBusy("visual");
    setError("");
    try {
      const next = await callPipeline(
        {
          action: "visual_task",
          projectFacts: facts,
          pagePlan: plan,
          pageId: selectedPage.page_id,
          message,
          rematch,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      );
      acceptPipelineResult(
        next,
        rematch ? "重新匹配视觉参考" : "更新视觉任务",
      );
      setVisualImageJob((current) =>
        current?.pageId === selectedPage.page_id ? null : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "视觉任务更新失败");
    } finally {
      setBusy(null);
    }
  };

  const generateVisualImage = async (
    slotId: string,
    existingTaskId?: string,
  ) => {
    if (!selectedPage) return;
    if (
      isSmallBuildingMode(taskMode) &&
      selectedPage.page_type === "summary"
    ) {
      setError("设计总结页直接复用三个方案效果页的主效果图，不单独调用图像模型。根据方案页生图即可更新。",
      );
      return;
    }
    const selectedSlot = selectedPage.visual_task?.image_slots.find(
      (slot) => slot.slot_id === slotId,
    );
    if (
      !selectedSlot ||
      !canGenerateVisualImageForSlot(selectedPage.page_type, selectedSlot)
    ) {
      setError(
        "当前图框不支持 AI 生图，请重新选择一个可生成的图片槽。",
      );
      return;
    }
    let smallModeVerificationNodes: NodeOutput[] = [];
    if (isSmallBuildingMode(taskMode)) {
      try {
        smallModeVerificationNodes = verifiedSmallModeImageNodeOutputs(
          facts,
          plan,
          latestResultRef.current.nodeOutputs,
        );
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "小型建筑/装置本地终稿审查失败",
        );
        return;
      }
    }
    setBusy("visual-image");
    setError("");
    const taskId = existingTaskId ?? crypto.randomUUID();
    const jobBase = {
      pageId: selectedPage.page_id,
      slotId,
      taskId,
    };
    let referenceSkipped = false;
    const selectedFrame = Array.from(
      document.querySelectorAll<HTMLElement>("[data-visual-slot-id]"),
    ).find((element) => element.dataset.visualSlotId === slotId);
    const selectedFrameRect = selectedFrame?.getBoundingClientRect();
    const frameAspectRatio =
      selectedFrameRect && selectedFrameRect.height > 0
        ? selectedFrameRect.width / selectedFrameRect.height
        : undefined;
    const visibleCaption = {
      title:
        selectedFrame?.dataset.visualSlotCaptionTitle?.trim() ||
        selectedSlot.label,
      detail:
        selectedFrame?.dataset.visualSlotCaptionDetail?.trim() ||
        selectedSlot.purpose,
    };
    setVisualImageJob({
      ...jobBase,
      stage: "queued",
      retryAttempted: false,
      message: "生图任务已进入当前项目队列。",
    });
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      setVisualImageJob({
        ...jobBase,
        stage: "preparing_prompt",
        retryAttempted: false,
        message: "正在结合本页结论、图框用途和当前项目事实整理提示词。",
      });
      const firstVisualAssetForPage = (
        page: DesignReportPagePlan["pages"][number],
      ) =>
        page.visual_task?.generated_images?.[0] ??
        page.visual_task?.generated_image;
      const continuityAnchorPage =
        isSmallBuildingMode(taskMode) || isSystemRenderingPage(selectedPage)
        ? undefined
        : [
            ...plan.pages.filter(
              (page) =>
                page.page_id !== selectedPage.page_id &&
                page.page_type === "concept",
            ),
            ...plan.pages.filter(
              (page) =>
                page.page_id !== selectedPage.page_id &&
                page.page_type === "cover",
            ),
          ].find((page) => Boolean(firstVisualAssetForPage(page)?.image_url));
      const continuityAnchor = continuityAnchorPage
        ? firstVisualAssetForPage(continuityAnchorPage)
        : undefined;
      let continuityReferenceDataUrl: string | undefined;
      if (
        continuityAnchor?.image_url &&
        continuityAnchor.image_url
      ) {
        try {
          continuityReferenceDataUrl = await visualImageToDataUrl(
            continuityAnchor.image_url,
          );
        } catch {
          // A continuity anchor improves cross-page form consistency, but a
          // transient read failure must not block the selected-slot workflow.
          continuityReferenceDataUrl = undefined;
        }
      }
      referenceSkipped = true;
      setVisualImageJob({
        ...jobBase,
        stage: "model_generating",
        retryAttempted: false,
        referenceSkipped,
        message: "正在仅依据当前项目事实、已确认提案和图框要求调用图像模型；不会读取或提交历史素材库图片。",
      });
      const next = await callPipeline(
        {
          action: "generate_visual_image",
          taskId,
          projectFacts: compactVisualImageProjectFacts(facts, selectedPage),
          pagePlan: compactVisualImagePagePlan(
            plan,
            selectedPage.page_id,
          ),
          pageId: selectedPage.page_id,
          slotId,
          frameAspectRatio,
          visibleCaption,
          referenceImage: undefined,
          continuityReference:
            continuityAnchorPage &&
            continuityAnchor?.image_url &&
            continuityReferenceDataUrl
              ? {
                  sourcePageId: continuityAnchorPage.page_id,
                  imageUrl: continuityAnchor.image_url,
                  dataUrl: continuityReferenceDataUrl,
                }
              : undefined,
          nodeOutputs: isSmallBuildingMode(taskMode)
            ? smallModeVerificationNodes
            : [],
        },
        imageApiSettingsForTaskMode(apiSettings, taskMode),
        {
          transportRetries: 2,
          onTransportRetry: (attempt) =>
            setVisualImageJob({
              ...jobBase,
              stage: "retrying",
              retryAttempted: true,
              retryable: true,
              referenceSkipped,
              attemptCount: attempt + 1,
              message: `本机与服务端连接中断，正在自动恢复第 ${attempt} 次；已保留原任务编号。`,
            }),
        },
      );
      const completedPage = next.pagePlan.pages.find(
        (page) => page.page_id === selectedPage.page_id,
      );
      const completedImage = completedPage?.visual_task?.generated_images?.find(
        (image) => image.slot_id === slotId,
      );
      const attemptCount = completedImage?.attempt_count ?? 1;
      if (attemptCount > 1) {
        setVisualImageJob({
          ...jobBase,
          stage: "retrying",
          retryAttempted: true,
          referenceSkipped,
          message: `上游曾短暂拥堵，系统自动重试 ${attemptCount - 1} 次后取得结果。`,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
      acceptVisualImageResult(
        next,
        selectedPage.page_id,
        slotId,
      );
      setVisualImageJob({
        ...jobBase,
        stage: "completed",
        retryAttempted: attemptCount > 1,
        retryable: false,
        referenceSkipped,
        requestId:
          (next as PipelineResult & { visualTaskId?: string }).visualTaskId ??
          taskId,
        attemptCount,
        message:
          attemptCount > 1
            ? `已完成；本次共请求 ${attemptCount} 次。`
            : "已完成并替换当前图框。",
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "低分辨率意向图生成失败";
      const retryAttempted = /自动重试|已自动重试|上游仍无可用容量/.test(
        message,
      );
      const pipelineError =
        caught instanceof PipelineClientError ? caught : null;
      const retryAfterMs = pipelineError?.retryAfterMs ?? 0;
      const rateLimited = ["RATE_LIMIT", "UPSTREAM_CAPACITY"].includes(
        pipelineError?.code ?? "",
      );
      const recoverableMessage = rateLimited
        ? `${message} 当前任务及图框已保留；恢复时系统会进入限流队列，不会立即连续请求。`
        : message;
      const failedAt = new Date();
      setVisualImageJob({
        ...jobBase,
        stage: "failed",
        retryAttempted:
          retryAttempted || (pipelineError?.attemptCount ?? 1) > 1,
        referenceSkipped,
        retryable: pipelineError?.retryable ?? false,
        errorCode: pipelineError?.code ?? "PIPELINE",
        requestId: pipelineError?.requestId || taskId,
        attemptCount: pipelineError?.attemptCount ?? 1,
        retryAfterMs,
        retryAvailableAt: retryAfterMs
          ? new Date(failedAt.getTime() + retryAfterMs).toISOString()
          : undefined,
        failedAt: failedAt.toISOString(),
        message: recoverableMessage,
      });
      setError(recoverableMessage);
    } finally {
      setBusy(null);
    }
  };

  const generateAllVisualImages = async () => {
    if (!hasProjectSource || busy) return;
    let workingResult = structuredClone(latestResultRef.current);
    let smallModeVerificationNodes: NodeOutput[] = [];
    if (isSmallBuildingMode(taskMode)) {
      for (const page of [...workingResult.pagePlan.pages]) {
        workingResult = {
          ...workingResult,
          pagePlan: updatePageVisualTask(
            workingResult.projectFacts,
            workingResult.pagePlan,
            page.page_id,
            undefined,
            true,
          ),
        };
      }
      latestResultRef.current = workingResult;
      setResult(workingResult);
      try {
        smallModeVerificationNodes = verifiedSmallModeImageNodeOutputs(
          workingResult.projectFacts,
          workingResult.pagePlan,
          workingResult.nodeOutputs,
        );
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "小型建筑/装置本地终稿审查失败",
        );
        return;
      }
    }
    const jobs = workingResult.pagePlan.pages.flatMap((page) => {
      if (
        isSmallBuildingMode(taskMode) &&
        page.page_type === "summary"
      ) {
        return [];
      }
      const generatedSlotIds = new Set(
        page.visual_task?.generated_images?.map((image) => image.slot_id) ?? [],
      );
      return (page.visual_task?.image_slots ?? [])
        .filter(
          (slot) =>
            canGenerateVisualImageForSlot(page.page_type, slot) &&
            !generatedSlotIds.has(slot.slot_id),
        )
        .map((slot) => ({ pageId: page.page_id, slotId: slot.slot_id }));
    });
    if (!jobs.length) {
      setError("整套汇报的可生成图框已经全部完成。");
      return;
    }
    const totalJobCount = jobs.length;

    setBusy("visual-image-all");
    setError("");
    recordHistory("生成整套 AI 图纸", { result: latestResultRef.current });
    let completedCount = 0;
    const failures: string[] = [];
    const aspectRatioValue = (value: string) => {
      if (value === "square") return 1;
      if (value === "portrait") return 3 / 4;
      if (value === "landscape") return 4 / 3;
      return 16 / 9;
    };
    let continuitySourcePageId: string | undefined;
    let continuityImageUrl: string | undefined;
    let continuityDataUrl: string | undefined;

    const refreshContinuityAnchor = async () => {
      const anchorPage = [
        ...workingResult.pagePlan.pages.filter(
          (page) => page.page_type === "cover",
        ),
        ...workingResult.pagePlan.pages.filter(
          (page) => page.page_type === "concept",
        ),
      ].find((page) =>
        Boolean(
          page.visual_task?.generated_images?.[0]?.image_url ??
            page.visual_task?.generated_image?.image_url,
        ),
      );
      const anchor =
        anchorPage?.visual_task?.generated_images?.[0] ??
        anchorPage?.visual_task?.generated_image;
      if (!anchorPage || !anchor?.image_url) return;
      continuitySourcePageId = anchorPage.page_id;
      continuityImageUrl = anchor.image_url;
      try {
        continuityDataUrl = await visualImageToDataUrl(anchor.image_url);
      } catch {
        continuityDataUrl = undefined;
      }
    };

    const runJob = async (job: { pageId: string; slotId: string }) => {
      const taskId = crypto.randomUUID();
      const maxJobAttempts = isSmallBuildingMode(taskMode) ? 3 : 2;
      for (let attempt = 1; attempt <= maxJobAttempts; attempt += 1) {
        const currentPage = workingResult.pagePlan.pages.find(
          (page) => page.page_id === job.pageId,
        );
        const slot = currentPage?.visual_task?.image_slots.find(
          (candidate) => candidate.slot_id === job.slotId,
        );
        if (!currentPage || !slot) return;
        setVisualImageJob({
          pageId: job.pageId,
          slotId: job.slotId,
          taskId,
          stage: "model_generating",
          retryAttempted: attempt > 1,
          retryable: true,
          attemptCount: attempt,
          referenceSkipped: true,
          message: `正在生成第 ${completedCount + 1}/${totalJobCount} 张：P${String(currentPage.display_page_number ?? "").padStart(2, "0")} · ${slot.label}。每张图均先整理独立提示词，再调用图像模型。`,
        });
        try {
          const next = await callPipeline(
            {
              action: "generate_visual_image",
              taskId,
              projectFacts: compactVisualImageProjectFacts(
                workingResult.projectFacts,
                currentPage,
              ),
              pagePlan: compactVisualImagePagePlan(
                workingResult.pagePlan,
                currentPage.page_id,
              ),
              pageId: currentPage.page_id,
              slotId: slot.slot_id,
              frameAspectRatio: aspectRatioValue(slot.aspect_ratio),
              visibleCaption: {
                title: slot.label,
                detail: slot.purpose,
              },
              referenceImage: undefined,
              continuityReference:
                !isSmallBuildingMode(taskMode) &&
                continuitySourcePageId &&
                continuityImageUrl &&
                continuityDataUrl &&
                continuitySourcePageId !== currentPage.page_id &&
                !isSystemRenderingPage(currentPage)
                  ? {
                      sourcePageId: continuitySourcePageId,
                      imageUrl: continuityImageUrl,
                      dataUrl: continuityDataUrl,
                    }
                  : undefined,
              nodeOutputs: isSmallBuildingMode(taskMode)
                ? smallModeVerificationNodes
                : [],
            },
            imageApiSettingsForTaskMode(apiSettings, taskMode),
            { transportRetries: 2 },
          );
          workingResult = mergeVisualImagePipelineResult(
            workingResult,
            next,
            currentPage.page_id,
            slot.slot_id,
          );
          latestResultRef.current = workingResult;
          setResult(workingResult);
          completedCount += 1;
          return;
        } catch (caught) {
          const pipelineError =
            caught instanceof PipelineClientError ? caught : null;
          const rateLimited = ["RATE_LIMIT", "UPSTREAM_CAPACITY"].includes(
            pipelineError?.code ?? "",
          );
          const retryableFailure = rateLimited || Boolean(pipelineError?.retryable);
          if (attempt < maxJobAttempts && retryableFailure) {
            const waitMs = Math.min(
              Math.max(pipelineError?.retryAfterMs ?? 15000, 5000),
              45000,
            );
            await new Promise((resolve) => window.setTimeout(resolve, waitMs));
            continue;
          }
          const message =
            caught instanceof Error ? caught.message : "图像生成失败";
          failures.push(`P${currentPage.display_page_number}-${slot.label}：${message}`);
          return;
        }
      }
    };

    try {
      const coverJobIndex = jobs.findIndex((job) => {
        const page = workingResult.pagePlan.pages.find(
          (candidate) => candidate.page_id === job.pageId,
        );
        return page?.page_type === "cover";
      });
      if (coverJobIndex >= 0) {
        const [coverJob] = jobs.splice(coverJobIndex, 1);
        await runJob(coverJob);
      }
      await refreshContinuityAnchor();
      let nextJobIndex = 0;
      const workers = Array.from(
        {
          length: Math.min(
            isSmallBuildingMode(taskMode) ? 1 : 2,
            jobs.length,
          ),
        },
        async () => {
          while (nextJobIndex < jobs.length) {
            const jobIndex = nextJobIndex;
            nextJobIndex += 1;
            await runJob(jobs[jobIndex]);
          }
        },
      );
      await Promise.all(workers);
      latestResultRef.current = workingResult;
      setResult(workingResult);
      setSessionTokenUsage(sumTokenUsage(workingResult.nodeOutputs));
      setVisualImageJob({
        pageId: jobs.at(-1)?.pageId ?? "P001",
        slotId: jobs.at(-1)?.slotId ?? "S1",
        taskId: crypto.randomUUID(),
        stage: failures.length ? "failed" : "completed",
        retryAttempted: false,
        retryable: failures.length > 0,
        referenceSkipped: true,
        message: failures.length
          ? `已完成 ${completedCount} 张，另有 ${failures.length} 张等待自动补生成。`
          : `整套 ${completedCount} 张 AI 图纸已全部生成。`,
      });
      if (failures.length) {
        setError(
          `整套生图已完成 ${completedCount} 张；${failures.length} 张暂未完成。可再次点击“生成整套 AI 图纸”仅补生成失败图框。`,
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const updateGateBProposal = async (
    missingItemId: string,
    operation: "generate" | "select" | "custom" | "confirm",
    selectedOptionId?: string,
  ) => {
    setBusy(`gate-b-${missingItemId}`);
    setError("");
    try {
      const next = await callPipeline(
        {
          action: "gate_b_proposal",
          projectFacts: facts,
          pagePlan: plan,
          missingItemId,
          operation,
          selectedOptionId,
          userInput:
            operation === "custom" ? gateBInputs[missingItemId] ?? "" : undefined,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      );
      acceptPipelineResult(next, "更新设计提案");
      if (operation === "custom") {
        setGateBInputs((current) => ({
          ...current,
          [missingItemId]: "",
        }));
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "内容提案更新失败",
      );
    } finally {
      setBusy(null);
    }
  };

  const createUserProposal = async () => {
    setBusy("user-proposal-create");
    setError("");
    try {
      const next = await callPipeline(
        {
          action: "user_proposal",
          operation: "create",
          projectFacts: facts,
          pagePlan: plan,
          topic: userProposalDraft.topic,
          title: userProposalDraft.title,
          direction: userProposalDraft.direction,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      );
      acceptPipelineResult(next, "新增用户提案");
      setUserProposalDraft({
        topic: "设计概念",
        title: "",
        direction: "",
      });
      setShowUserProposalForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "用户提案新增失败");
    } finally {
      setBusy(null);
    }
  };

  const deleteUserProposal = async (proposalId: string) => {
    setBusy(`user-proposal-delete-${proposalId}`);
    setError("");
    try {
      const next = await callPipeline(
        {
          action: "user_proposal",
          operation: "delete",
          projectFacts: facts,
          pagePlan: plan,
          proposalId,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      );
      acceptPipelineResult(next, "删除用户提案");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "用户提案删除失败");
    } finally {
      setBusy(null);
    }
  };

  const audit = async () => {
    setBusy("audit");
    setError("");
    try {
      const next = await callPipeline(
        {
          action: "audit",
          projectFacts: facts,
          pagePlan: plan,
          nodeOutputs: result.nodeOutputs,
        },
        apiSettings,
      );
      acceptPipelineResult(next, "审核整套汇报");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "审核失败");
    } finally {
      setBusy(null);
    }
  };

  const updateRole = (documentId: string, role: SourceRole) => {
    recordHistory("修改资料角色");
    setDocuments((current) =>
      current.map((document) =>
        document.document_id === documentId
          ? { ...document, role }
          : document,
      ),
    );
    setDocumentsChanged(true);
  };

  const addPasted = async () => {
    if (!pastedText.trim()) return;
    let noteIndex =
      documents.filter((document) =>
        document.document_id.startsWith("DOC_NOTE_"),
      ).length + 1;
    while (
      documents.some(
        (document) =>
          document.document_id ===
          `DOC_NOTE_${String(noteIndex).padStart(3, "0")}`,
      )
    ) {
      noteIndex += 1;
    }
    const nextDocument: InputDocument = {
      document_id: `DOC_NOTE_${String(noteIndex).padStart(3, "0")}`,
      file_name: `用户文字说明_${projectDocuments.length + 1}.md`,
      role: pasteRole,
      version_or_date: "user-input",
      authority_rank: pasteRole === "authoritative" ? 3 : 5,
      page_count: 1,
      text: `===== PAGE 1 =====\n${pastedText.trim()}`,
    };
    const nextDocuments = [...documents, nextDocument];
    setDocuments(nextDocuments);
    setPastedText("");
    setShowPaste(false);
    await processDocuments(nextDocuments);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload");
    setError("");
    try {
      const parsedRaw = await Promise.all([...files].map(fileToInputDocument));
      const initialTaskBriefUpload = projectDocuments.length === 0;
      const parsed = parsedRaw.map((document, index) =>
        initialTaskBriefUpload && index === 0
          ? {
              ...document,
              role: "authoritative" as const,
              authority_rank: 3,
            }
          : document,
      );
      const nextDocuments = [...documents, ...parsed];
      setDocuments(nextDocuments);
      await processDocuments(nextDocuments);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文件读取失败");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeDocument = (documentId: string) => {
    recordHistory("移除资料");
    setDocuments((current) =>
      current.filter((document) => document.document_id !== documentId),
    );
    setDocumentsChanged(true);
  };

  const verifyApiConnection = async () => {
    setBusy("api-test");
    setApiConnectionStatus(null);
    try {
      const connection = await testApiConnection(apiSettings);
      if (connection.modelAvailable === false) {
        setApiConnectionStatus({
          state: "warning",
          message: `接口连接成功，但模型列表中没有“${apiSettings.model}”。`,
        });
      } else if (connection.imageModelAvailable === false) {
        setApiConnectionStatus({
          state: "warning",
          message: connection.availableImageModels?.length
            ? `文本接口连接成功，但没有图像模型“${apiSettings.imageModel}”。当前可用：${connection.availableImageModels.join("、")}。`
            : `文本接口连接成功，但模型列表中没有图像模型“${apiSettings.imageModel}”。`,
        });
      } else {
        setApiConnectionStatus({
          state: "success",
          message:
            connection.availableModelCount == null
              ? "API 鉴权成功，可以开始调用。"
              : `API 鉴权成功，文本模型与图像模型均可用，共读取到 ${connection.availableModelCount} 个模型。`,
        });
      }
    } catch (caught) {
      setApiConnectionStatus({
        state: "error",
        message:
          caught instanceof Error ? caught.message : "模型连接测试失败",
      });
    } finally {
      setBusy(null);
    }
  };

  const resetSessionTokenUsage = () => {
    accountedModelResponses.current = new Set(
      result.nodeOutputs
        .map(tokenResponseKey)
        .filter((key): key is string => Boolean(key)),
    );
    setSessionTokenUsage({
      input: 0,
      output: 0,
      imageInput: 0,
      imageOutput: 0,
      imageCalls: 0,
      images: 0,
    });
  };

  const prepareExport = (
    format: "pdf" | "docx",
    taskId = crypto.randomUUID(),
    exportProjectFacts = facts,
    exportPagePlan = plan,
    layoutOverflowPageIds: string[] = [],
  ) =>
    callPipeline(
      {
        action: "prepare_export",
        format,
        taskId,
        projectFacts: exportProjectFacts,
        pagePlan: exportPagePlan,
        layoutOverflowPageIds,
        documents:
          format === "docx"
            ? documents
                .filter((document) =>
                  ["authoritative", "proposal"].includes(
                    document.role,
                  ),
                )
                .map((document) => ({
                  ...document,
                  file_data: undefined,
                }))
            : undefined,
        nodeOutputs: result.nodeOutputs,
      },
      apiSettings,
    );

  const readPdfLayoutOverflowPageIds = () =>
    Array.from(document.querySelectorAll<HTMLElement>(".pdf-export-deck [data-a3-page-id]"))
      .filter((sheet) =>
        Array.from(sheet.querySelectorAll<HTMLElement>("[data-a3-overflow=\"true\"]")).some(
          (element) => element.clientWidth > 0 && element.clientHeight > 0,
        ),
      )
      .map((sheet) => sheet.dataset.a3PageId)
      .filter((pageId): pageId is string => Boolean(pageId));

  const waitForA3Layout = async () => {
    // The preview's fit pass runs from a layout effect and then a
    // requestAnimationFrame. Wait for two complete frames after each model
    // response so the measurement reflects the newly rendered copy.
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => resolve()),
      ),
    );
  };

  const rewriteUntilA3Fits = async (
    initial: PipelineResult,
    statusLabel: string,
  ) => {
    let next = initial;
    const maxRewriteRounds = 4;
    for (let round = 0; round < maxRewriteRounds; round += 1) {
      await waitForA3Layout();
      const overflowPageIds = readPdfLayoutOverflowPageIds();
      if (overflowPageIds.length === 0) {
        return next;
      }
      setError(
        `已检测到 ${overflowPageIds.join("、")} 页真实文本框溢出，Agent 正在按当前版面进行第 ${round + 1} 轮整体重写。`,
      );
      next = await prepareExportWithRecovery(
        "pdf",
        next.projectFacts,
        next.pagePlan,
        overflowPageIds,
      );
      acceptPipelineResult(
        next,
        `${statusLabel}（按 A3 实际溢出第 ${round + 1} 轮）`,
      );
    }
    await waitForA3Layout();
    // Keep the latest complete rewrite and let the user inspect it. A
    // character-count result is not treated as an export-blocking failure;
    // the real A3 measurement remains the source of truth.
    return next;
  };

  const prepareExportWithRecovery = async (
    format: "pdf" | "docx",
    exportProjectFacts = facts,
    exportPagePlan = plan,
    layoutOverflowPageIds: string[] = [],
  ) => {
    const taskId = crypto.randomUUID();
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prepareExport(
          format,
          taskId,
          exportProjectFacts,
          exportPagePlan,
          layoutOverflowPageIds,
        );
      } catch (caught) {
        lastError = caught;
        const recoverable =
          caught instanceof PipelineClientError && caught.retryable;
        if (!recoverable || attempt >= 2) throw caught;
        setError(
          `云端终稿任务连接短暂中断，正在接回原任务（第 ${attempt + 1} 次恢复）；不会重复生成已在云端运行的页面。`,
        );
        await new Promise((resolve) =>
          window.setTimeout(resolve, attempt === 0 ? 1_200 : 3_000),
        );
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("云端终稿任务恢复失败");
  };

  const exportPdf = async () => {
    if (!hasProjectSource) return;
    setBusy("export-pdf");
    setError("");
    const previousTitle = window.document.title;
    let restorePdfRasterAssets: (() => void) | undefined;
    try {
      let next = await prepareExportWithRecovery("pdf");
      acceptPipelineResult(next, "模型整理 PDF 导出终稿");
      next = await rewriteUntilA3Fits(next, "按 A3 实际溢出重写终稿");
      await waitForPdfVisualAssets();
      restorePdfRasterAssets = await preparePdfRasterAssets(pdfExportPpi);
      replaceBrowserDocumentTitle(safePdfFileName(
        `${next.projectFacts.project_name_anonymized ?? next.projectFacts.project_id}_A3设计汇报_${pdfExportPpi}PPI`,
      ));
      window.print();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "PDF 导出终稿整理失败",
      );
    } finally {
      restorePdfRasterAssets?.();
      replaceBrowserDocumentTitle(previousTitle);
      setBusy(null);
    }
  };

  const generateAllPageCopy = async () => {
    if (!hasProjectSource) return;
    setBusy("generate-all");
    setError("");
    try {
      const next = await prepareExportWithRecovery("pdf");
      acceptPipelineResult(next, "生成整套终稿文案");
      await rewriteUntilA3Fits(next, "按 A3 实际溢出重写终稿");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "整套终稿文案生成失败",
      );
    } finally {
      setBusy(null);
    }
  };

  const createAllVisualTasks = () => {
    if (!hasProjectSource || busy) return;
    setBusy("visual-all");
    setError("");
    try {
      let nextPlan = plan;
      for (const page of plan.pages) {
        nextPlan = updatePageVisualTask(
          facts,
          nextPlan,
          page.page_id,
          undefined,
          true,
        );
      }
      acceptPipelineResult(
        { ...result, pagePlan: nextPlan },
        "建立整套视觉任务",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "整套视觉任务建立失败",
      );
    } finally {
      setBusy(null);
    }
  };

  const exportDocx = async () => {
    if (!hasProjectSource) return;
    setBusy("export-docx");
    setError("");
    try {
      const next = await prepareExport("docx");
      acceptPipelineResult(next, "模型整理 DOCX 设计说明");
      const exportFacts = next.projectFacts;
      const exportPlan = next.pagePlan;
      const designNarrative = next.designNarrative;
      if (!designNarrative) {
        throw new Error(
          "模型没有返回完整设计说明，本次未导出本地拼接版本。",
        );
      }
      const referenceStyleLibrary =
        exportFacts.reference_style_examples ?? [];
      const exportPages = exportPlan.pages.map((page) => {
        const pageFacts = (page.fact_refs ?? [])
          .map((factId) =>
            exportFacts.facts.find(
              (fact) => fact.fact_id === factId,
            ),
          )
          .filter(Boolean) as DesignReportProjectFacts["facts"];
        const sourceKeys = new Set<string>();
        const sources = pageFacts
          .map((fact) => ({
            documentId: fact.source.document_id,
            page: fact.source.page,
          }))
          .filter((source) => {
            const key = `${source.documentId}::${source.page}`;
            if (sourceKeys.has(key)) return false;
            sourceKeys.add(key);
            return true;
          });
        return {
          pageId: page.page_id,
          pageNumber: String(page.display_page_number),
          pageType:
            displayPageTypeLabel(page),
          headline: displayPageHeadline(page, isSmallBuildingMode(taskMode)),
          coreMessage: sanitizePresentationText(page.core_message),
          bodyText:
            presentationBody(
              page,
              pageFacts,
              referenceStyleLibrary,
            ) || sanitizePresentationText(page.core_message),
          diagramLabels: sanitizePresentationItems(
            page.diagram_labels,
            12,
          ),
          sources,
        };
      });
      const { createDesignNarrativeDocx } = await import(
        "@/app/lib/docx-export"
      );
      const blob = await createDesignNarrativeDocx({
        projectName:
          exportFacts.project_name_anonymized ??
          exportFacts.project_id,
        projectId: exportFacts.project_id,
        narrative: designNarrative,
        generatedAt: new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "long",
          timeStyle: "short",
        }).format(new Date()),
        facts: exportFacts.facts.filter(
          (fact) => fact.status !== "superseded",
        ),
        proposals: exportFacts.gate_b_proposals ?? [],
        sourceDocuments: documents
          .filter((document) =>
            ["authoritative", "proposal"].includes(document.role),
          )
          .map((document) => ({
            documentId: document.document_id,
            fileName: document.file_name,
            role: roleLabels[document.role],
            versionOrDate: document.version_or_date,
            pageCount: document.page_count,
          })),
        pages: exportPages,
      });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${safePdfFileName(
        exportFacts.project_name_anonymized ??
          exportFacts.project_id,
      )}_建筑设计说明.docx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "DOCX 导出失败",
      );
    } finally {
      setBusy(null);
    }
  };

  const currentProjectDraft = (
    resultOverride: PipelineResult = latestResultRef.current,
  ): LocalProjectDraft => ({
    version: 1,
    projectId,
    title: projectTitle.trim() || facts.project_name_anonymized || "未命名设计",
    companyName: companyName.trim(),
    status: "active",
    updatedAt: new Date().toISOString(),
    documents: persistedProjectDocuments(documents),
    result: persistedProjectResult(
      resultOverride,
      cloudStoreStatus?.connected ? "memfire" : "browser",
    ),
    selectedPageId,
    documentsChanged,
    sessionTokenUsage,
    gateBInputs,
    history: persistedProjectHistory(history),
    visualImageJob:
      visualImageJob?.stage === "completed"
        ? undefined
        : visualImageJob ?? undefined,
  });

  const refreshProjectCatalog = async () => {
    const projects = cloudStoreStatus?.connected
      ? await listCloudProjects()
      : await listLocalProjectDrafts();
    setProjectCatalog(projects);
  };

  const saveCurrentProjectNow = async () => {
    if (!hasProjectSource) return;
    const draft = currentProjectDraft(latestResultRef.current);
    if (cloudStoreStatus?.connected) {
      const savedCloud = await saveCloudProject(
        draft,
        cloudRevisionRef.current,
      );
      cloudRevisionRef.current = savedCloud.updatedAt;
      if (latestProjectIdRef.current === projectId) {
        setResult((current) =>
          applyPersistedImageUrlUpdates(current, savedCloud.imageUrls),
        );
      }
    }
    else await saveLocalProjectDraft(draft);
  };

  useEffect(() => {
    if (
      !localDraftHydrated ||
      !cloudStoreStatus?.connected ||
      visualImageJob?.stage !== "completed"
    ) {
      return;
    }
    const persistenceKey = [
      projectId,
      visualImageJob.taskId,
      visualImageJob.pageId,
      visualImageJob.slotId,
    ].join(":");
    if (lastCloudPersistedVisualImageRef.current === persistenceKey) return;
    lastCloudPersistedVisualImageRef.current = persistenceKey;
    void saveCurrentProjectNow().catch((caught) => {
      lastCloudPersistedVisualImageRef.current = "";
      setLocalDraftStatus("warning");
      setLocalDraftError(
        caught instanceof Error ? caught.message : "AI 图片云端保存失败。",
      );
    });
  }, [
    cloudStoreStatus?.connected,
    localDraftHydrated,
    projectId,
    saveCurrentProjectNow,
    visualImageJob?.pageId,
    visualImageJob?.slotId,
    visualImageJob?.stage,
    visualImageJob?.taskId,
  ]);

  const saveCurrentProjectManually = async () => {
    if (busy || !hasProjectSource) return;
    setBusy("project-save");
    setLocalDraftStatus("saving");
    setLocalDraftError("");
    setError("");
    try {
      await saveCurrentProjectNow();
      await refreshProjectCatalog();
      setLocalDraftStatus(
        cloudStoreStatus?.connected
          ? "saved"
          : cloudStoreStatus?.configured
            ? "warning"
            : "saved",
      );
      if (cloudStoreStatus?.configured && !cloudStoreStatus.connected) {
        setLocalDraftError("云端暂不可用，已保存浏览器轻量备份。");
      }
    } catch (caught) {
      setLocalDraftStatus("error");
      setLocalDraftError(
        caught instanceof Error ? caught.message : "项目存档失败。",
      );
      setError(caught instanceof Error ? caught.message : "项目存档失败。");
    } finally {
      setBusy(null);
    }
  };

  const resetForNewProject = (nextTaskMode: TaskMode) => {
    siteResearchRequestRef.current += 1;
    setBackgroundTask(null);
    cloudRevisionRef.current = undefined;
    const isolatedReferenceDocuments = initialDocuments.filter(
      (document) => document.role === "reference_style",
    );
    // Rebuild the empty baseline from the isolated reference layer. Reusing
    // `initialResult` here leaves the previous project's facts, page copy,
    // visual tasks, and generated assets visible after clicking New Design.
    // The reference document is intentionally retained only as a style/layout
    // layer; current-project documents and facts are rebuilt from zero.
    const emptyBaseline = runPipeline(
      isolatedReferenceDocuments,
      crypto.randomUUID(),
      nextTaskMode,
    );
    const emptyResult: PipelineResult = {
      ...emptyBaseline,
      executionMode: "local_rule",
      analysisMode: "fast",
    };
    setDocuments(isolatedReferenceDocuments);
    setResult(emptyResult);
    setTaskMode(nextTaskMode);
    setProjectId(crypto.randomUUID());
    setProjectTitle("");
    setSelectedPageId(undefined);
    setSelectedVisualSlotChoice(null);
    setDocumentsChanged(false);
    setGateBInputs({});
    setHistory([]);
    setVisualImageJob(null);
    setPageTextDraft(null);
    setVisualAssetPreview(null);
    setSessionTokenUsage(sumTokenUsage(emptyResult.nodeOutputs));
    accountedModelResponses.current = new Set(
      emptyResult.nodeOutputs
        .map(tokenResponseKey)
        .filter((key): key is string => Boolean(key)),
    );
    setLocalDraftStatus("ready");
    setError("");
  };

  const createNewProject = async () => {
    if (busy) return;
    setShowTaskModePicker(true);
  };

  const confirmNewProject = async (nextTaskMode: TaskMode) => {
    if (busy) return;
    setShowTaskModePicker(false);
    setBusy("project-new");
    projectTransitionRef.current = true;
    setError("");
    try {
      await saveCurrentProjectNow();
      await refreshProjectCatalog();
      resetForNewProject(nextTaskMode);
      setShowProjectArchive(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "新建设计失败");
    } finally {
      projectTransitionRef.current = false;
      setBusy(null);
    }
  };

  const openStoredProject = async (summary: StoredProjectSummary) => {
    if (busy || summary.projectId === projectId) return;
    siteResearchRequestRef.current += 1;
    setBackgroundTask(null);
    setBusy("project-load");
    projectTransitionRef.current = true;
    setError("");
    try {
      await saveCurrentProjectNow();
      const saved = cloudStoreStatus?.connected
        ? await loadCloudProject(summary.projectId)
        : await loadLocalProjectDraft(summary.projectId);
      if (!saved) throw new Error("没有找到该设计存档。");
      cloudRevisionRef.current = saved.updatedAt;
      const builtInDocumentIds = new Set(
        initialDocuments.map((document) => document.document_id),
      );
      setDocuments([
        ...initialDocuments,
        ...saved.documents.filter(
          (document) => !builtInDocumentIds.has(document.document_id),
        ),
      ]);
      const restoredTaskMode =
        saved.result.projectFacts.task_mode ?? DEFAULT_TASK_MODE;
      const restoredProjectFacts = isSmallBuildingMode(restoredTaskMode)
        ? isolateSmallBuildingProjectFacts(
            ensureSmallModeDesignDirectionState({
              ...saved.result.projectFacts,
              task_mode: restoredTaskMode,
            }),
          )
        : {
            ...saved.result.projectFacts,
            task_mode: restoredTaskMode,
            reference_experience: initialResult.projectFacts.reference_experience,
            reference_style_examples: initialResult.projectFacts.reference_style_examples,
          };
      const synchronized = isSmallBuildingMode(
        restoredProjectFacts.task_mode ?? DEFAULT_TASK_MODE,
      )
          ? {
            projectFacts: {
              ...restoredProjectFacts,
            },
            pagePlan: {
              ...saved.result.pagePlan,
              task_mode: "small_building_or_interior" as const,
              pages: saved.result.pagePlan.pages.map((page) => ({
                ...page,
                style_example_refs: [],
                experience_recipe_refs: [],
                proposal_refs: [],
                proposal_coverage: [],
              })),
            },
          }
        : synchronizeProposalCoverage(restoredProjectFacts, saved.result.pagePlan);
      setResult({ ...saved.result, ...synchronized });
      setTaskMode(restoredProjectFacts.task_mode ?? DEFAULT_TASK_MODE);
      setProjectId(summary.projectId);
      setProjectTitle(saved.title?.trim() ?? summary.title);
      setSelectedPageId(
        saved.selectedPageId ?? saved.result.pagePlan.pages[0]?.page_id,
      );
      setDocumentsChanged(saved.documentsChanged);
      setSessionTokenUsage(
        normalizeStoredTokenUsage(
          saved.sessionTokenUsage,
          saved.result.nodeOutputs,
        ),
      );
      setGateBInputs(saved.gateBInputs ?? {});
      setHistory(saved.history ?? []);
      setVisualImageJob(saved.visualImageJob ?? null);
      setLocalDraftStatus("saved");
      setLocalDraftError("");
      setShowProjectArchive(false);
      await refreshProjectCatalog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设计存档打开失败");
    } finally {
      projectTransitionRef.current = false;
      setBusy(null);
    }
  };

  const renameStoredProject = async (summary: StoredProjectSummary) => {
    if (busy) return;
    const nextTitle = window.prompt("请输入新的设计名称", summary.title)?.trim();
    if (!nextTitle || nextTitle === summary.title) return;
    setBusy("project-rename");
    projectTransitionRef.current = true;
    setError("");
    try {
      if (summary.projectId === projectId) await saveCurrentProjectNow();
      if (cloudStoreStatus?.connected) {
        const renamed = await renameCloudProject(summary.projectId, nextTitle);
        if (summary.projectId === projectId) {
          cloudRevisionRef.current = renamed.updatedAt;
          setProjectTitle(nextTitle);
        }
      } else {
        await renameLocalProjectDraft(summary.projectId, nextTitle);
        if (summary.projectId === projectId) setProjectTitle(nextTitle);
      }
      await refreshProjectCatalog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设计重命名失败");
    } finally {
      projectTransitionRef.current = false;
      setBusy(null);
    }
  };

  const deleteStoredProject = async (summary: StoredProjectSummary) => {
    if (busy) return;
    if (
      !window.confirm(
        `确定删除设计“${summary.title}”吗？删除后将同时移除云端存档，且无法恢复。`,
      )
    ) {
      return;
    }
    setBusy("project-delete");
    projectTransitionRef.current = true;
    setError("");
    try {
      if (cloudStoreStatus?.connected) {
        await deleteCloudProject(summary.projectId);
      } else {
        await deleteLocalProjectDraft(summary.projectId);
      }
      await refreshProjectCatalog();
      if (summary.projectId === projectId) {
        resetForNewProject(taskMode);
        setShowProjectArchive(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设计删除失败");
    } finally {
      projectTransitionRef.current = false;
      setBusy(null);
    }
  };

  return (
    <main
      className={`workbench-shell ${busy || backgroundTask ? "agent-is-working" : ""}`}
    >
      {showTaskModePicker ? (
        <div className="task-mode-dialog-backdrop" role="presentation">
          <section
            className="task-mode-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-mode-dialog-title"
          >
            <div className="task-mode-dialog-heading">
              <span>NEW TASK / 新建设计任务</span>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowTaskModePicker(false)}
                aria-label="取消新建设计"
              >
                <X size={15} />
              </button>
            </div>
            <h2 id="task-mode-dialog-title">这是什么类型的设计任务？</h2>
            <p>选择后会决定页面逻辑、证据规则和是否使用大型公共建筑历史参考。</p>
            <div className="task-mode-options">
              <button
                type="button"
                className="task-mode-option"
                onClick={() => void confirmNewProject("large_public_building")}
              >
                <strong>大型公共建筑</strong>
                <span>适用于综合体、公共建筑、城市更新等复杂项目。</span>
                <small>沿用建筑汇报章节、历史参考和 Gate B 方案确认。</small>
              </button>
              <button
                type="button"
                className="task-mode-option is-small"
                onClick={() => void confirmNewProject("small_building_or_interior")}
              >
                <strong>小型建筑/装置</strong>
                <span>适用于小型建筑、公共艺术装置、快闪、展亭、景观构筑物和展陈结构。</span>
                <small>只依据任务书事实和已有设计方向，把单张概念图拆成 PPT 页面。</small>
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <header className="topbar">
        <div className="brand-block">
          <div>
            <div className="eyebrow">DESIGN REPORT STUDIO</div>
            <h1>智能建筑汇报文本工作台</h1>
          </div>
        </div>
        <div className="project-summary">
          <div
            className={`local-draft-status local-draft-${localDraftStatus}`}
            title={
              localDraftError || (cloudStoreStatus?.connected
                ? "任务书解析结果、事实库、页面框架和生成结果自动保存在 MemFire"
                : "MemFire 尚未接入，当前使用浏览器临时存档，配置后会自动迁移")
            }
          >
            {localDraftStatus === "loading" ||
            localDraftStatus === "saving" ? (
              <LoaderCircle className="spin" size={13} />
            ) : localDraftStatus === "error" ? (
              <AlertTriangle size={13} />
            ) : (
              <Check size={13} />
            )}
            <span>
              {localDraftStatus === "loading"
                ? "正在恢复项目"
                : localDraftStatus === "saving"
                  ? cloudStoreStatus?.connected
                    ? "正在保存到 MemFire"
                    : "正在保存到浏览器"
                  : localDraftStatus === "saved"
                    ? cloudStoreStatus?.connected
                      ? "已保存在云端"
                      : "浏览器暂存 · 待迁移"
                    : localDraftStatus === "error"
                      ? "项目存档失败"
                  : localDraftStatus === "warning"
                        ? "浏览器已备份 · 云端重试中"
                      : cloudStoreStatus?.connected
                        ? autosaveMode === "manual"
                          ? "仅手动保存"
                          : autosaveMode === "30m"
                            ? "自动保存 · 每30分钟"
                            : "自动保存 · 每15分钟"
                        : "MemFire 未接入"}
            </span>
          </div>
          <button
            className="secondary-button project-save-button"
            onClick={() => void saveCurrentProjectManually()}
            disabled={!hasProjectSource || Boolean(busy)}
            title="立即保存当前设计"
          >
            {busy === "project-save" ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Save size={14} />
            )}
            {busy === "project-save" ? "正在保存" : "保存设计"}
          </button>
          <label
            className="autosave-control"
            title="自动保存按选定频次执行，也可以选择仅手动保存"
          >
            <span>自动保存</span>
            <select
              value={autosaveMode}
              onChange={(event) =>
                setAutosaveMode(event.target.value as AutosaveMode)
              }
              disabled={Boolean(busy)}
              aria-label="自动保存频次"
            >
              <option value="15m">每15分钟</option>
              <option value="30m">每30分钟</option>
              <option value="manual">仅手动保存</option>
            </select>
          </label>
          <button
            className={`secondary-button project-archive-button ${showProjectArchive ? "active" : ""}`}
            onClick={() => setShowProjectArchive((current) => !current)}
            aria-expanded={showProjectArchive}
          >
            <FolderOpen size={14} />
            设计档案
            {projectCatalog.length ? (
              <b>{projectCatalog.length}</b>
            ) : null}
          </button>
          <button
            className="secondary-button new-project-button"
            onClick={() => void createNewProject()}
            disabled={Boolean(busy)}
          >
            <Plus size={14} />
            新建设计
          </button>
          <button
            className="secondary-button auth-logout-button"
            onClick={async () => {
              await fetch("/api/auth?action=logout", { method: "POST" });
              window.location.replace("/login");
            }}
            title="退出当前账号"
          >
            <LogOut size={14} />
            退出登录
          </button>
          <div className="project-name">
            <span>当前项目</span>
            <strong>
              {hasProjectSource
                ? projectTitle.trim() || facts.project_name_anonymized
              : "等待上传任务书"}
            </strong>
            <small>
              {isSmallBuildingMode(taskMode)
                ? "小型建筑/装置 · 任务书拆页模式"
                : "大型公共建筑 · 完整建筑汇报模式"}
            </small>
          </div>
          <GatePill
            label="事实就绪"
            status={
              hasProjectSource
                ? facts.gate_report?.planner_readiness
                : undefined
            }
          />
          {!isSmallBuildingMode(taskMode) ? (
            <GatePill
              label="提案就绪"
              status={
                hasProjectSource
                  ? gateBDisplayStatus
                  : undefined
              }
            />
          ) : (
            <span className="task-mode-inline-status">任务书方向直达页面</span>
          )}
          <label className="pdf-resolution-select" title="控制 PDF 中图片的采样精度；文字保持矢量">
            <span>PDF</span>
            <select
              value={pdfExportPpi}
              onChange={(event) =>
                setPdfExportPpi(Number(event.target.value) as PdfExportPpi)
              }
              disabled={Boolean(busy)}
              aria-label="PDF 导出分辨率"
            >
              <option value={144}>144 PPI · 快速</option>
              <option value={300}>300 PPI · 高清</option>
            </select>
          </label>
          <button
            className="secondary-button export-pdf-button"
            onClick={() => void exportPdf()}
            disabled={!hasProjectSource || Boolean(busy)}
            title="先调用文本模型生成整套中英双语终稿并审核，再打开系统打印窗口"
          >
            {busy === "export-pdf" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Download size={15} />
            )}
            {busy === "export-pdf"
              ? "模型整理 PDF"
              : "导出 PDF"}
          </button>
          {!hasProjectSource ? (
            <button
              className="primary-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(busy)}
              title={
                isSmallBuildingMode(taskMode)
                  ? "上传任务书并自动建立小型项目汇报框架"
                  : "上传任务书并自动快速建立34页框架"
              }
            >
              {busy === "upload" || busy === "run-fast" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Upload size={15} />
              )}
              {busy === "upload"
                ? "读取任务书"
                : busy === "run-fast"
                  ? "正在建立框架"
                  : "上传任务书"}
            </button>
          ) : null}
          <details className="topbar-more-tools">
            <summary>
              <Settings2 size={15} />
              更多工具
            </summary>
            <div className="topbar-more-menu">
              <button
                className="ghost-button"
                onClick={() => void runDeepAnalysis()}
                disabled={!hasProjectSource || Boolean(busy)}
                title="使用文本模型优化整套章节、34页标题和每页核心结论"
              >
                {busy === "run-deep" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
                {busy === "run-deep" ? "深度优化中" : "深度优化"}
              </button>
              <button
                className="ghost-button"
                onClick={() => void exportDocx()}
                disabled={!hasProjectSource || Boolean(busy)}
                title="先调用文本模型生成并审核设计说明，再导出不含图纸的 DOCX"
              >
                {busy === "export-docx" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <FileText size={15} />
                )}
                {busy === "export-docx" ? "模型编写 DOCX" : "导出 DOCX"}
              </button>
              <button
                className="ghost-button"
                onClick={() => void generateAllPageCopy()}
                disabled={!hasProjectSource || Boolean(busy)}
                title="并行生成所有未完成页面的中英正文、图解标签与讲述提示，并完成全篇审核"
              >
                <Sparkles size={15} />
                生成整套终稿文案
              </button>
              <button
                className="ghost-button"
                onClick={createAllVisualTasks}
                disabled={!hasProjectSource || Boolean(busy)}
                title="为 34 页建立空图框、差异化图片说明和跨页一致性约束；不会调用或裁剪公司素材库图片"
              >
                <Presentation size={15} />
                建立整套视觉任务
              </button>
              <button
                className="ghost-button"
                onClick={() => void generateAllVisualImages()}
                disabled={!hasProjectSource || Boolean(busy)}
                title="仅补生成尚未完成的图框；每张图都会先调用提示词模型，再调用图像模型，最多两路并发"
              >
                <ImageIcon size={15} />
                生成整套 AI 图纸
              </button>
              <button
                className="ghost-button history-undo-button"
                onClick={undoLastChange}
                disabled={!history.length || Boolean(busy)}
                title={
                  history.length
                    ? `撤销：${history.at(-1)?.label}`
                    : "暂无可撤销操作"
                }
              >
                <RotateCcw size={15} />
                撤销上一步
              </button>
              <button
                className={`ghost-button ${showHistory ? "active" : ""}`}
                onClick={() => setShowHistory((current) => !current)}
                aria-expanded={showHistory}
                aria-controls="project-history-panel"
                disabled={!hasProjectSource && !history.length}
              >
                <History size={15} />
                历史版本
                {history.length ? <b>{history.length}</b> : null}
              </button>
              <button
                className={`ghost-button text-architecture-trigger ${
                  showTextArchitecture ? "active" : ""
                }`}
                onClick={() =>
                  setShowTextArchitecture((current) => !current)
                }
                aria-expanded={showTextArchitecture}
                aria-controls="text-architecture-guide"
                disabled={!hasProjectSource || !plan.pages.length}
              >
                <Layers3 size={15} />
                文本架构导览
              </button>
              <button
                className={`ghost-button ${showApiSettings ? "active" : ""}`}
                onClick={() => setShowApiSettings((current) => !current)}
                aria-expanded={showApiSettings}
              >
                <Settings2 size={15} />
                API 设置
              </button>
            </div>
          </details>
        </div>
      </header>

      {showProjectArchive ? (
        <section className="project-archive-panel" aria-label="设计档案">
          <div className="project-archive-heading">
            <div>
              <span>设计档案</span>
              <strong>
                {cloudStoreStatus?.connected
                  ? "项目保存在 MemFire"
                  : "当前为浏览器临时存档"}
              </strong>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowProjectArchive(false)}
              aria-label="关闭设计档案"
            >
              <X size={16} />
            </button>
          </div>
          <div className="project-archive-list">
            <strong className="project-archive-list-title">所有设计方案</strong>
            {projectCatalog.length ? (
              <div className="project-archive-group">
                <strong>已保存的设计方案</strong>
                {projectCatalog.map((project) => (
                  <div className="project-archive-card" key={project.projectId}>
                    <button
                      type="button"
                      className="project-archive-card-main"
                      onClick={() => void openStoredProject(project)}
                      disabled={Boolean(busy)}
                    >
                      <FolderOpen size={16} />
                      <span>
                        <strong>{project.title}</strong>
                        <small>
                          {project.projectId === projectId ? "当前项目" : "已保存"} · {new Date(project.updatedAt).toLocaleString("zh-CN")}
                        </small>
                      </span>
                      <em>{project.storage === "memfire" ? "云端" : "浏览器"}</em>
                    </button>
                    <div className="project-archive-card-actions">
                      <button
                        type="button"
                        className="project-archive-rename-button"
                        onClick={() => void renameStoredProject(project)}
                        disabled={Boolean(busy)}
                        aria-label={`重命名设计 ${project.title}`}
                        title="重命名设计"
                      >
                        <Pencil size={14} />
                        重命名
                      </button>
                    <button
                      type="button"
                      className="project-archive-delete-button"
                      onClick={() => void deleteStoredProject(project)}
                      disabled={Boolean(busy)}
                      aria-label={`删除设计 ${project.title}`}
                      title="删除设计"
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {!projectCatalog.length ? (
              <p>尚无设计项目。</p>
            ) : null}
            {projectCatalog.length ? (
              <p className="project-archive-empty">
                保存设计后会自动出现在这里；点击方案可切换，右侧可重命名或删除。
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeAgentWork ? (
        <section
          className="agent-work-banner"
          role="status"
          aria-live="polite"
          aria-label={`${activeAgentWork.title}，${activeAgentWork.pageLabel}`}
        >
          <div className="agent-work-indicator" aria-hidden="true">
            <LoaderCircle className="spin" size={20} />
          </div>
          <div className="agent-work-copy">
            <strong>
              {activeAgentWork.title}
              <em>{activeAgentWork.pageLabel}</em>
            </strong>
            <span>{activeAgentWork.detail}</span>
          </div>
          <div className="agent-work-progress" aria-hidden="true">
            <i />
          </div>
        </section>
      ) : null}

      <section className="workflow-rail" aria-label="首次使用操作路径">
        <div className="workflow-rail-intro">
          <span>快速开始</span>
          <strong>
            {!hasProjectSource
              ? "先上传任务书"
              : isSmallBuildingMode(taskMode)
                ? "任务书方向已进入 19 页汇报骨架"
              : unresolvedIssueCount > 0
                ? `还有 ${unresolvedIssueCount} 项提案待确认`
                : "按页完善文案与视觉证据"}
          </strong>
        </div>
        <button
          type="button"
          className={`workflow-step ${hasProjectSource ? "done" : "active"}`}
          onClick={() => {
            setLeftTab("documents");
            if (!hasProjectSource) fileInputRef.current?.click();
          }}
        >
          <b>1</b>
          <span>
            <strong>上传资料</strong>
            <small>建立项目事实</small>
          </span>
        </button>
        <button
          type="button"
          className={`workflow-step ${
            hasProjectSource &&
            (isSmallBuildingMode(taskMode) || unresolvedIssueCount === 0)
              ? "done"
              : hasProjectSource
                ? "active"
                : ""
          }`}
          onClick={() => setLeftTab("issues")}
          disabled={!hasProjectSource}
        >
          <b>2</b>
          <span>
            <strong>
              {isSmallBuildingMode(taskMode) ? "任务书直达" : "确认提案"}
            </strong>
            <small>
              {isSmallBuildingMode(taskMode) ? "已有方向直接深化" : "补齐设计判断"}
            </small>
          </span>
        </button>
        <button
          type="button"
          className={`workflow-step ${
            hasProjectSource &&
            (isSmallBuildingMode(taskMode) || unresolvedIssueCount === 0)
              ? "active"
              : ""
          }`}
          onClick={() => {
            if (!selectedPageId && plan.pages[0]) {
              selectPage(plan.pages[0].page_id);
            }
            setDetailTab("content");
          }}
          disabled={!hasProjectSource}
        >
          <b>3</b>
          <span>
            <strong>逐页完善</strong>
            <small>文案、证据与图片</small>
          </span>
        </button>
        <div className="workflow-step workflow-step-static">
          <b>4</b>
          <span>
            <strong>审核导出</strong>
            <small>PDF 与设计说明</small>
          </span>
        </div>
        <p className="workflow-rail-help">
          左侧管理项目资料，中间选择页面，右侧完成当前页。
        </p>
      </section>

      {showHistory ? (
        <section
          className="project-history-panel"
          id="project-history-panel"
          aria-label="项目历史版本"
        >
          <div className="project-history-heading">
            <div>
              <span>PROJECT HISTORY</span>
              <strong>历史版本</strong>
              <p>最多保留最近 20 个重要操作前的完整项目快照。</p>
            </div>
            <button
              type="button"
              className="remove-button"
              onClick={() => setShowHistory(false)}
              aria-label="关闭历史版本"
            >
              <X size={14} />
            </button>
          </div>
          {history.length ? (
            <div className="project-history-list">
              {[...history].reverse().map((entry, index) => (
                <article key={entry.historyId}>
                  <div>
                    <span>
                      {index === 0 ? "上一步" : `历史 ${index + 1}`}
                    </span>
                    <strong>{entry.label}</strong>
                    <small>
                      {new Intl.DateTimeFormat("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(entry.createdAt))}
                      {" · "}
                      {entry.result.pagePlan.pages.length} 页
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => restoreHistoryEntry(entry)}
                    disabled={Boolean(busy)}
                  >
                    <RotateCcw size={13} />
                    恢复此版本
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-note">
              完成一次编辑、生成或提案确认后，这里会自动留下版本。
            </div>
          )}
        </section>
      ) : null}

      <TextArchitectureGuide
        open={showTextArchitecture}
        plan={plan}
        taskMode={taskMode}
        selectedPageId={selectedPageId}
        onClose={() => setShowTextArchitecture(false)}
        onSelectPage={(pageId) => {
          selectPage(pageId);
          setDetailTab("preview");
          setShowTextArchitecture(false);
        }}
      />

      {showApiSettings ? (
        <section className="api-settings-panel" aria-label="API 设置">
          <div className="api-settings-heading">
            <div>
              <div className="eyebrow">MODEL CONNECTION</div>
              <strong>API 设置</strong>
              <p>
                修改后从下一次“分析、生成或审核”开始生效，不会写入调试数据。
              </p>
            </div>
            <button
              className="remove-button"
              onClick={() => setShowApiSettings(false)}
              aria-label="关闭API设置"
            >
              <X size={14} />
            </button>
          </div>
          <div className="api-provider-stack">
            <section className="api-provider-card api-provider-text">
              <div className="api-provider-heading">
                <div>
                  <span>01 · TEXT MODEL</span>
                  <strong>文本模型接口</strong>
                </div>
                <p>负责任务书分析、页面文案、提案、审核和生图提示词。</p>
              </div>
              <div className="api-settings-grid">
                <label>
                  <span>① 文本 API 地址</span>
                  <input
                    type="url"
                    value={apiSettings.baseUrl}
                    onChange={(event) =>
                      setApiSettings((current) => ({
                        ...current,
                        baseUrl: event.target.value,
                      }))
                    }
                    placeholder="https://example.com/v1"
                    aria-label="文本 API 地址"
                  />
                </label>
                <label>
                  <span>② 文本模型名称</span>
                  <input
                    type="text"
                    value={apiSettings.model}
                    onChange={(event) =>
                      setApiSettings((current) => ({
                        ...current,
                        model: event.target.value,
                      }))
                    }
                    placeholder="qwen3.7-plus"
                    aria-label="文本模型名称"
                  />
                </label>
                <label>
                  <span>③ 这套文本接口的 API Key</span>
                  <input
                    type="password"
                    value={apiSettings.apiKey}
                    onChange={(event) =>
                      setApiSettings((current) => ({
                        ...current,
                        apiKey: event.target.value,
                      }))
                    }
                    placeholder={
                      initialApiSettings.configured
                        ? "留空则使用本机文本密钥"
                        : "输入文本接口 API Key"
                    }
                    autoComplete="off"
                    aria-label="文本 API Key"
                  />
                </label>
              </div>
              <div className="api-binding-note">
                <ShieldCheck size={14} />
                <span>
                  此 Key 仅发送到 <b>{apiSettings.baseUrl || "尚未填写地址"}</b>，
                  并调用 <b>{apiSettings.model || "尚未填写模型"}</b>。
                  {apiSettings.apiKey
                    ? " 当前使用网页临时文本 Key，刷新后清除。"
                    : initialApiSettings.configured
                      ? " 当前使用本机已配置的文本 Key。"
                      : " 当前没有可用文本 Key。"}
                </span>
              </div>
            </section>

            <section className="api-provider-card api-provider-image">
              <div className="api-provider-heading">
                <div>
                  <span>02 · IMAGE MODEL</span>
                  <strong>图像生成接口</strong>
                </div>
                <p>只负责生成当前选中图框的视觉意向图，不改页面文字。</p>
              </div>
              <div className="api-settings-grid">
                <label>
                  <span>① 图像 API 地址</span>
                  <input
                    type="url"
                    value={apiSettings.imageBaseUrl}
                    onChange={(event) =>
                      setApiSettings((current) => ({
                        ...current,
                        imageBaseUrl: event.target.value,
                      }))
                    }
                    placeholder="https://example.com/v1"
                    aria-label="图像 API 地址"
                  />
                </label>
                <label>
                  <span>② 图像模型名称</span>
                  <input
                    type="text"
                    value={apiSettings.imageModel}
                    onChange={(event) =>
                      setApiSettings((current) => ({
                        ...current,
                        imageModel: event.target.value,
                      }))
                    }
                    placeholder="gpt-5.5"
                    aria-label="图像模型名称"
                  />
                </label>
                <label>
                  <span>③ 这套图像接口的 API Key</span>
                  <input
                    type="password"
                    value={apiSettings.imageApiKey}
                    onChange={(event) =>
                      setApiSettings((current) => ({
                        ...current,
                        imageApiKey: event.target.value,
                      }))
                    }
                    placeholder={
                      initialApiSettings.imageConfigured
                        ? "留空则使用本机图像密钥"
                        : "输入图像接口 API Key"
                    }
                    autoComplete="off"
                    aria-label="图像 API Key"
                  />
                </label>
              </div>
              <div className="api-binding-note">
                <ShieldCheck size={14} />
                <span>
                  此 Key 仅发送到 <b>{apiSettings.imageBaseUrl || "尚未填写地址"}</b>，
                  并调用 <b>{apiSettings.imageModel || "尚未填写模型"}</b>。
                  {apiSettings.imageApiKey
                    ? " 当前使用网页临时图像 Key，刷新后清除。"
                    : initialApiSettings.imageConfigured
                      ? " 当前使用本机已配置的图像 Key。"
                      : apiSettings.imageBaseUrl === apiSettings.baseUrl
                        ? " 与文本接口地址相同，后台可复用文本 Key。"
                        : " 当前没有可用图像 Key。"}
                </span>
              </div>
            </section>

            <section className="api-provider-card">
              <div className="api-provider-heading">
                <div>
                  <span>03 · MAP DATA</span>
                  <strong>高德公开地图服务</strong>
                </div>
                <p>只用于场地坐标与周边公共设施增强；任务书图面和文字仍是主要依据。</p>
              </div>
              <div className="api-settings-grid">
                <label>
                  <span>高德 Web 服务 Key</span>
                  <input
                    type="password"
                    value={apiSettings.amapApiKey}
                    onChange={(event) =>
                      setApiSettings((current) => ({
                        ...current,
                        amapApiKey: event.target.value,
                      }))
                    }
                    placeholder={
                      initialApiSettings.mapConfigured
                        ? "留空则使用本机高德 Key"
                        : "输入高德 Web 服务 Key"
                    }
                    autoComplete="off"
                    aria-label="高德 Web 服务 Key"
                  />
                </label>
              </div>
              <div className="api-binding-note">
                <ShieldCheck size={14} />
                <span>
                  此 Key 只发送到 <b>restapi.amap.com</b>。
                  {apiSettings.amapApiKey
                    ? " 当前使用网页临时高德 Key，刷新后清除。"
                    : initialApiSettings.mapConfigured
                      ? " 当前使用本机已配置的高德 Key。"
                      : " 未配置时仍会读取任务书场地信息，但不请求外部地图。"}
                </span>
              </div>
            </section>
          </div>
          <div className="token-usage-card">
            <div className="token-usage-heading">
              <div>
                <span>SESSION MODEL USAGE</span>
                <strong>本次模型用量</strong>
              </div>
              <button
                className="remove-button"
                onClick={resetSessionTokenUsage}
                disabled={sessionTokenTotal === 0}
              >
                本次累计清零
              </button>
            </div>
            <div className="model-usage-groups">
              <section className="model-usage-group model-usage-text">
                <div className="model-usage-group-heading">
                  <div>
                    <span>文本模型</span>
                    <strong>{formatTokenCount(textTokenTotal)} Token</strong>
                  </div>
                  <small>{apiSettings.model || "未设置模型"}</small>
                </div>
                <div className="token-usage-grid">
                  <div>
                    <span>输入 Token</span>
                    <strong>{formatTokenCount(sessionTokenUsage.input)}</strong>
                  </div>
                  <div>
                    <span>输出 Token</span>
                    <strong>{formatTokenCount(sessionTokenUsage.output)}</strong>
                  </div>
                  <div>
                    <span>当前项目累计</span>
                    <strong>
                      {formatTokenCount(
                        currentResultTokenUsage.input +
                          currentResultTokenUsage.output,
                      )}
                    </strong>
                  </div>
                </div>
              </section>
              <section className="model-usage-group model-usage-image">
                <div className="model-usage-group-heading">
                  <div>
                    <span>图像生成链路</span>
                    <strong>{sessionTokenUsage.images} 张图片</strong>
                  </div>
                  <small>{apiSettings.imageModel || "未设置模型"}</small>
                </div>
                <div className="token-usage-grid">
                  <div>
                    <span>提示词输入 Token</span>
                    <strong>{formatTokenCount(sessionTokenUsage.imageInput)}</strong>
                  </div>
                  <div>
                    <span>提示词输出 Token</span>
                    <strong>{formatTokenCount(sessionTokenUsage.imageOutput)}</strong>
                  </div>
                  <div>
                    <span>图像模型调用</span>
                    <strong>{formatTokenCount(sessionTokenUsage.imageCalls)} 次</strong>
                  </div>
                  <div className="image-provider-usage">
                    <span>图像模型 Token</span>
                    <strong>平台未返回</strong>
                  </div>
                </div>
              </section>
            </div>
            <small>
              生图前的提示词整理由文本模型完成，因此单独计入“图像生成链路”；当前图像接口只返回成功张数，没有返回可核算的图像 Token。失败请求和连接测试不计入。
            </small>
          </div>
          <div className="api-settings-actions">
            <span>
              文本：{apiSettings.baseUrl || "未设置"} ·{" "}
              {apiSettings.model || "未设置文本模型"} ·{" "}
              图像：{apiSettings.imageBaseUrl || "未设置"} ·{" "}
              {apiSettings.imageModel || "未设置图像模型"} · 地图：高德
            </span>
            <button
              className="secondary-button"
              onClick={() => {
                setApiSettings({
                  baseUrl: initialApiSettings.baseUrl,
                  model: initialApiSettings.model,
                  apiKey: "",
                  imageBaseUrl: initialApiSettings.imageBaseUrl,
                  imageModel: initialApiSettings.imageModel,
                  imageApiKey: "",
                  amapApiKey: "",
                });
                setApiConnectionStatus(null);
              }}
            >
              恢复本机默认
            </button>
            <button
              className="secondary-button"
              onClick={verifyApiConnection}
              disabled={
                Boolean(busy) ||
                !apiSettings.baseUrl.trim() ||
                !apiSettings.model.trim()
              }
            >
              {busy === "api-test" ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <ShieldCheck size={14} />
              )}
              测试连接
            </button>
            <button
              className="primary-button"
              onClick={() => setShowApiSettings(false)}
              disabled={!apiSettings.baseUrl.trim() || !apiSettings.model.trim()}
            >
              应用到下一次运行
            </button>
          </div>
          {apiConnectionStatus ? (
            <div
              className={`api-connection-status api-connection-${apiConnectionStatus.state}`}
              role="status"
            >
              {apiConnectionStatus.state === "success" ? (
                <Check size={14} />
              ) : (
                <AlertTriangle size={14} />
              )}
              <span>{apiConnectionStatus.message}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="error-banner">
          <AlertTriangle size={15} />
          {error}
          <button onClick={() => setError("")} aria-label="关闭错误">
            <X size={14} />
          </button>
        </div>
      ) : null}

      {result.executionMode === "local_fallback" ? (
        <div className="model-warning">
          <AlertTriangle size={15} />
          <span>
            真实模型尚未启用；当前结果来自本地规则。
            {result.nodeOutputs.find((output) => output.fallback_reason)
              ?.fallback_reason ?? "需要配置 OPENAI_API_KEY。"}
          </span>
        </div>
      ) : null}

      {hasProjectSource && result.analysisMode === "fast" ? (
        <div className="fast-analysis-note">
          <BookOpenText size={15} />
          <span>
            {isSmallBuildingMode(taskMode)
              ? `小型项目 ${plan.pages.length} 页专属骨架已生成；大型公共建筑历史页面配方、文风样本和图片均保持隔离。`
              : `快速骨架已生成：${referenceGroundedPageCount}/${plan.pages.length} 页已同时匹配历史页面配方与精选文风样本。需要进一步重构章节时，再使用“深度优化”。`}
          </span>
        </div>
      ) : null}

      <section className="workbench-grid">
        <aside className="panel left-panel">
          <div className="tabbar">
            <button
              className={leftTab === "documents" ? "active" : ""}
              onClick={() => setLeftTab("documents")}
            >
              资料 <span>{documents.length}</span>
            </button>
            <button
              className={leftTab === "facts" ? "active" : ""}
              onClick={() => setLeftTab("facts")}
            >
              事实 <span>{hasProjectSource ? facts.facts.length : 0}</span>
            </button>
            <button
              className={leftTab === "issues" ? "active" : ""}
              onClick={() => setLeftTab("issues")}
            >
              {isSmallBuildingMode(taskMode) ? "设计方向" : "提案"}{" "}
              <span>
                {hasProjectSource
                  ? isSmallBuildingMode(taskMode)
                    ? smallModeDesignDirectionCards(facts).length
                    : proposalPanelCount
                  : 0}
              </span>
            </button>
          </div>

          {leftTab === "documents" ? (
            <>
              <div className="panel-toolbar">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                  hidden
                  onChange={(event) => uploadFiles(event.target.files)}
                />
                <button
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy === "upload"}
                >
                  {busy === "upload" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Upload size={15} />
                  )}
                  上传任务书
                </button>
                <button
                  className="icon-text-button"
                  onClick={() => setShowPaste((current) => !current)}
                >
                  <ClipboardPaste size={15} />
                  粘贴补充说明
                </button>
              </div>

              {documentsChanged ? (
                <div className="recognition-notice">
                  <div>
                    <strong>资料角色已调整</strong>
                    <span>重新分析后会同步更新证据、Gate 和目录。</span>
                  </div>
                  <button onClick={run} disabled={Boolean(busy)}>
                    {busy === "run" ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <Play size={13} fill="currentColor" />
                    )}
                    重新分析
                  </button>
                </div>
              ) : !hasProjectSource ? (
                <div className="fixture-notice">
                  {isSmallBuildingMode(taskMode)
                    ? "小型建筑/装置已隔离大型公共建筑历史参考。现在只需上传本项目任务书。"
                    : "历史汇报参考库已在后台接入。现在只需上传本项目任务书。"}
                </div>
              ) : null}

              {showPaste ? (
                <div className="paste-card">
                  <textarea
                    value={pastedText}
                    onChange={(event) => setPastedText(event.target.value)}
                    placeholder="可直接粘贴任务书摘录、补遗或用户说明，无需整理成字段表。"
                    rows={5}
                  />
                  <div className="paste-actions">
                    <select
                      value={pasteRole}
                      onChange={(event) =>
                        setPasteRole(event.target.value as SourceRole)
                      }
                      aria-label="文字说明角色"
                    >
                      {Object.entries(roleLabels)
                        .filter(([value]) => value !== "site_research")
                        .map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                        ))}
                    </select>
                    <button
                      className="small-primary"
                      onClick={addPasted}
                      disabled={!pastedText.trim()}
                    >
                      <Plus size={14} />
                      加入资料
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="scroll-area document-list">
                <section className="document-zone">
                  <div className="zone-heading">
                    <span>① 当前项目证据库</span>
                    <strong>{projectDocuments.length}</strong>
                  </div>
                  <p>仅权威资料和当前方案可以提供项目事实。</p>
                  {projectDocuments.length ? (
                    projectDocuments.map((document) => (
                      <DocumentCard
                        key={document.document_id}
                        document={document}
                        onRoleChange={updateRole}
                        onRemove={removeDocument}
                      />
                    ))
                  ) : (
                    <button
                      className="empty-upload"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={17} />
                      <strong>上传本项目任务书</strong>
                      <span>支持 PDF 文字层、TXT 和 Markdown</span>
                    </button>
                  )}
                </section>

                <section className="document-zone reference-zone">
                  <div className="zone-heading">
                    <span>② 历史汇报参考库</span>
                    <strong>
                      {isSmallBuildingMode(taskMode)
                        ? "已隔离"
                        : referenceLibraryConnected
                          ? "已接入"
                          : "未接入"}
                    </strong>
                  </div>
                  <p>
                    {isSmallBuildingMode(taskMode)
                      ? "本模式不读取大型公共建筑历史汇报的事实、页面配方、文风样本或图片。"
                      : "只学习章节结构、页型节奏和表达风格，不提供项目事实。"}
                  </p>
                  <div
                    className={`reference-library-connection ${isSmallBuildingMode(taskMode) || referenceLibraryConnected ? "connected" : "disconnected"}`}
                  >
                    {isSmallBuildingMode(taskMode) || referenceLibraryConnected ? (
                      <Check size={16} />
                    ) : (
                      <AlertTriangle size={16} />
                    )}
                    <div>
                      <strong>
                        {isSmallBuildingMode(taskMode)
                          ? "小型建筑参考已接入"
                          : referenceLibraryConnected
                          ? "参考库已接入"
                          : "参考库未接入"}
                      </strong>
                      <span>
                        {isSmallBuildingMode(taskMode)
                          ? "页面架构、文案与图像只依据当前任务书和用户确认的设计方向。"
                          : "参考项目名称、页码、配方和素材详情仅供后台检索，不在用户端展示。"}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="document-zone company-name-zone">
                  <div className="zone-heading">
                    <span>③ 公司名称</span>
                  </div>
                  <p>将显示在每页左下角；留空时使用默认名称。</p>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    onBlur={() => void saveCurrentProjectNow()}
                    placeholder={DEFAULT_COMPANY_NAME}
                    aria-label="设计公司名称"
                    maxLength={80}
                  />
                </section>
              </div>
            </>
          ) : null}

          {leftTab === "facts" ? (
            <div className="scroll-area fact-list">
              {hasProjectSource ? (
                <div className="site-research-block">
                  <div className="site-research-toolbar">
                    <div>
                      <strong>场地研究</strong>
                      <span>
                        当前 {facts.facts.filter((fact) => fact.source_role === "research_fact" || fact.fact_id.startsWith("F_SITE_VISUAL_")).length} 条任务书场地／公开数据事实
                      </span>
                    </div>
                    <button
                      type="button"
                      className="fact-edit-button"
                      onClick={() => void runSiteResearch()}
                      disabled={
                        Boolean(busy) || backgroundTask === "site-research"
                      }
                    >
                      {backgroundTask === "site-research" ? (
                        <LoaderCircle className="spin" size={13} />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      {backgroundTask === "site-research"
                        ? "研究进行中"
                        : facts.facts.some((fact) => fact.source_role === "research_fact" || fact.fact_id.startsWith("F_SITE_VISUAL_"))
                          ? "重新研究"
                          : "开始研究"}
                    </button>
                  </div>
                  {result.siteResearch ? (
                    <div className={`site-research-summary site-research-${result.siteResearch.status}`}>
                      <strong>
                        {result.siteResearch.status === "completed"
                          ? "研究完成"
                          : result.siteResearch.status === "partial"
                            ? "片区级研究已完成"
                            : "等待补充定位"}
                      </strong>
                      <span>{result.siteResearch.summary}</span>
                      {result.siteResearch.warnings.length ? (
                        <details>
                          <summary>查看 {result.siteResearch.warnings.length} 条精度／接口说明</summary>
                          <ul>
                            {result.siteResearch.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {facts.facts.length ? facts.facts.map((fact) => {
                const isEditing = editingFactId === fact.fact_id;
                const isResearch = fact.source_role === "research_fact";
                const isVisualResearch = fact.fact_id.startsWith("F_SITE_VISUAL_");
                const isSiteEnrichment = isResearch || isVisualResearch;
                const draft = factEditDrafts[fact.fact_id];
                const revisionCount = fact.revision_history?.length ?? 0;
                const factBusy = busy === `fact-${fact.fact_id}`;
                return (
                  <article
                    className={`fact-card ${
                      fact.value_origin === "user_confirmed"
                        ? "fact-user-confirmed"
                        : isSiteEnrichment
                          ? "fact-site-research"
                        : ""
                    }`}
                    key={fact.fact_id}
                  >
                    <div className="fact-topline">
                      <code>{fact.fact_id}</code>
                      <div className="fact-card-actions">
                        <span className={`fact-status fact-${fact.status}`}>
                          {fact.value_origin === "user_confirmed"
                            ? "用户确认"
                            : isResearch
                              ? "场地研究"
                            : isVisualResearch
                              ? "图面识别"
                            : fact.status === "conflict"
                              ? "冲突"
                              : "来源确认"}
                        </span>
                        {!isEditing && !isResearch ? (
                          <button
                            type="button"
                            className="fact-edit-button"
                            onClick={() => beginFactRevision(fact)}
                            disabled={Boolean(busy)}
                            aria-label={`修改 ${fact.field_path}`}
                          >
                            <Settings2 size={12} />
                            修改
                          </button>
                        ) : null}
                        {isSiteEnrichment ? (
                          <button
                            type="button"
                            className="fact-edit-button fact-delete-button"
                            onClick={() => deleteSiteResearchFact(fact.fact_id)}
                            disabled={Boolean(busy)}
                            aria-label={`删除 ${fact.field_path}`}
                          >
                            <Trash2 size={12} />
                            删除
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="fact-path">
                      {displayFactFieldPath(fact.field_path)}
                    </div>
                    {!isEditing ? (
                      <div className="fact-current-value">
                        <span>当前采用值</span>
                        <strong>{formatFactValue(fact.value_raw)}</strong>
                      </div>
                    ) : (
                      <div className="fact-edit-form">
                        <label>
                          当前采用值
                          <textarea
                            rows={2}
                            value={draft?.value ?? ""}
                            onChange={(event) =>
                              setFactEditDrafts((current) => ({
                                ...current,
                                [fact.fact_id]: {
                                  value: event.target.value,
                                  message:
                                    current[fact.fact_id]?.message ?? "",
                                },
                              }))
                            }
                            disabled={factBusy}
                          />
                        </label>
                        <label>
                          本轮修改说明
                          <textarea
                            rows={2}
                            value={draft?.message ?? ""}
                            placeholder="例如：业主刚确认总建筑面积调整为……"
                            onChange={(event) =>
                              setFactEditDrafts((current) => ({
                                ...current,
                                [fact.fact_id]: {
                                  value:
                                    current[fact.fact_id]?.value ??
                                    formatFactValue(fact.value_raw),
                                  message: event.target.value,
                                },
                              }))
                            }
                            disabled={factBusy}
                          />
                        </label>
                        <div className="fact-edit-actions">
                          <button
                            type="button"
                            onClick={cancelFactRevision}
                            disabled={factBusy}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="primary"
                            onClick={() =>
                              void confirmFactRevision(fact.fact_id)
                            }
                            disabled={
                              factBusy ||
                              !draft?.value.trim() ||
                              !draft?.message.trim()
                            }
                          >
                            {factBusy ? (
                              <LoaderCircle className="spin" size={13} />
                            ) : (
                              <Check size={13} />
                            )}
                            确认本轮修改
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="fact-source-evidence">
                      {isResearch ? (
                        <>
                          <div className="source-line">
                            公开数据依据（只读）
                            {fact.source.retrieved_at
                              ? ` · ${new Date(fact.source.retrieved_at).toLocaleString("zh-CN")}`
                              : ""}
                            {fact.source.url ? (
                              <>
                                {" · "}
                                <a
                                  href={fact.source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  查看来源
                                </a>
                              </>
                            ) : null}
                          </div>
                          <details className="fact-revision-history">
                            <summary>查看原始检索记录</summary>
                            <blockquote>{fact.source.quote}</blockquote>
                          </details>
                        </>
                      ) : (
                        <>
                          <div className="source-line">
                            原始任务书证据（只读） · {fact.source.document_id} · P
                            {fact.source.page}
                          </div>
                          <blockquote>{fact.source.quote}</blockquote>
                        </>
                      )}
                    </div>

                    {revisionCount ? (
                      <details className="fact-revision-history">
                        <summary>查看 {revisionCount} 轮修订记录</summary>
                        {[...(fact.revision_history ?? [])]
                          .reverse()
                          .map((revision) => (
                            <div
                              className="fact-revision-round"
                              key={revision.revision_id}
                            >
                              <div>
                                <strong>第 {revision.round} 轮</strong>
                                <time>
                                  {new Date(
                                    revision.created_at,
                                  ).toLocaleString("zh-CN")}
                                </time>
                              </div>
                              <p>
                                {formatFactValue(revision.previous_value)}
                                <ChevronRight size={11} />
                                <strong>
                                  {formatFactValue(
                                    revision.confirmed_value,
                                  )}
                                </strong>
                              </p>
                              <blockquote>{revision.user_message}</blockquote>
                              <small>{revision.assistant_message}</small>
                            </div>
                          ))}
                      </details>
                    ) : null}
                  </article>
                );
              }) : (
                <div className="empty-tab-state">
                  <FileSearch size={21} />
                  <strong>还没有当前项目事实</strong>
                  <p>上传任务书后，事实会带着文件、页码和原文显示在这里。</p>
                </div>
              )}
            </div>
          ) : null}

          {leftTab === "issues" ? (
            <div className="scroll-area issue-list">
              {!hasProjectSource ? (
                <div className="empty-tab-state">
                  <Sparkles size={21} />
                  <strong>还没有设计提案</strong>
                  <p>上传任务书后，可以查看 Agent 识别的缺项，也可以新增自己的设计提案。</p>
                </div>
              ) : (
                <>
              {isSmallBuildingMode(taskMode) ? (
                <section className="small-mode-direction-panel">
                  <div className="proposal-section-heading">
                    <div className="issue-section-title">
                      <Sparkles size={15} />
                      当前设计方向
                    </div>
                    <span className="small-mode-direction-badge">
                      {smallModeDesignDirectionCards(facts).length
                        ? "任务书已提取"
                        : "Agent 待确认"}
                    </span>
                  </div>
                  {smallModeDesignDirectionCards(facts).length ? (
                    <>
                      <p className="small-mode-direction-intro">
                        以下三个方向来自当前项目资料，已浓缩为可直接编辑和继续深化的标题与内容；任务书来源继续保留用于追溯。
                      </p>
                      <div className="small-mode-direction-source-list">
                        {smallModeDesignDirectionCards(facts).map((card) => (
                          <article key={card.title}>
                            <strong>{card.title}</strong>
                            <p>{card.content}</p>
                            <small>
                              任务书依据 · {[...new Set(card.sourceFacts.map((fact) => `${fact.source.document_id} · P${fact.source.page}`))].join("；")}
                            </small>
                          </article>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setShowUserProposalForm(true);
                          setUserProposalDraft({
                            topic: "设计概念",
                            title: "任务书设计方向",
                            direction: smallModeDesignDirectionFacts(facts)
                              .map((fact) => String(fact.value_raw).trim())
                              .join("；"),
                          });
                        }}
                        disabled={Boolean(busy)}
                      >
                        编辑并确认当前方向
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="small-mode-direction-intro">
                        任务书没有明确设计方向，Agent 已先生成三个候选方向。它们会从当前事实出发，并按形式—结构—构件—材料—连接—运输—装配—锚固—维护链条约束。
                      </p>
                      {!facts.gate_b_proposals?.some(
                        (proposal) =>
                          proposal.missing_item_id ===
                          SMALL_MODE_DESIGN_DIRECTION_ITEM_ID,
                      ) ? (
                        <div className="empty-note">正在准备候选方向。</div>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}
              <div className="proposal-section-heading">
                <div className="issue-section-title">
                  <Sparkles size={15} />
                  用户自定义提案
                </div>
                <button
                  type="button"
                  className="fact-edit-button"
                  onClick={() =>
                    setShowUserProposalForm((current) => !current)
                  }
                  disabled={Boolean(busy)}
                >
                  {showUserProposalForm ? <X size={12} /> : <Plus size={12} />}
                  {showUserProposalForm ? "收起" : "新增卡片"}
                </button>
              </div>
              {showUserProposalForm ? (
                <div className="user-proposal-form">
                  <label>
                    关联设计主题
                    <select
                      value={userProposalDraft.topic}
                      onChange={(event) =>
                        setUserProposalDraft((current) => ({
                          ...current,
                          topic: event.target.value as UserProposalTopic,
                        }))
                      }
                      disabled={Boolean(busy)}
                    >
                      {USER_PROPOSAL_TOPICS.map((topic) => (
                        <option value={topic.value} key={topic.value}>
                          {topic.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    提案标题
                    <input
                      value={userProposalDraft.title}
                      onChange={(event) =>
                        setUserProposalDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="例如：屋顶公共花园"
                      disabled={Boolean(busy)}
                    />
                  </label>
                  <label>
                    设计方向
                    <textarea
                      rows={4}
                      value={userProposalDraft.direction}
                      onChange={(event) =>
                        setUserProposalDraft((current) => ({
                          ...current,
                          direction: event.target.value,
                        }))
                      }
                      placeholder="说明希望采用的空间动作、关系或设计判断……"
                      disabled={Boolean(busy)}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-button user-proposal-submit"
                    onClick={() => void createUserProposal()}
                    disabled={
                      Boolean(busy) ||
                      !userProposalDraft.title.trim() ||
                      !userProposalDraft.direction.trim()
                    }
                  >
                    {busy === "user-proposal-create" ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                    新增并确认
                  </button>
                  <small>
                    该内容属于用户确认的设计决策，不会写入任务书事实。
                  </small>
                </div>
              ) : null}
              {userCreatedProposals.length ? (
                <div className="user-proposal-list">
                  {userCreatedProposals.map((proposal) => (
                    <article
                      className="issue-card issue-confirmed user-proposal-card"
                      key={proposal.missing_item_id}
                    >
                      <div className="user-proposal-card-topline">
                        <span>用户提案 · {proposal.missing_label}</span>
                        <button
                          type="button"
                          className="remove-button"
                          aria-label={`删除提案 ${proposal.user_defined_title ?? proposal.question}`}
                          onClick={() =>
                            void deleteUserProposal(
                              proposal.missing_item_id,
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          {busy ===
                          `user-proposal-delete-${proposal.missing_item_id}` ? (
                            <LoaderCircle className="spin" size={12} />
                          ) : (
                            <X size={12} />
                          )}
                        </button>
                      </div>
                      <strong>
                        {proposal.user_defined_title ?? proposal.question}
                      </strong>
                      <p>{proposal.confirmed_direction}</p>
                      <small>
                        confirmed · 后续相关页面将采用这个设计方向
                      </small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-note">
                  还没有用户自定义提案，可按需新增。
                </div>
              )}
              <div className="issue-section-title">
                <AlertTriangle size={15} />
                {isSmallBuildingMode(taskMode)
                  ? "Agent 生成的设计方向"
                  : "Agent 识别的设计缺项"}
              </div>
              {facts.missing_items.map((item) => {
                const proposal = facts.gate_b_proposals?.find(
                  (candidate) =>
                    candidate.missing_item_id === item.item_id,
                );
                const isGateB = item.description.startsWith("Gate B 缺少：");
                const isConfirmed =
                  isGateB && proposal?.status === "confirmed";
                const itemBusy = busy === `gate-b-${item.item_id}`;
                return (
                  <article
                    className={`issue-card issue-${item.severity} ${
                      isGateB ? "gate-b-proposal-card" : ""
                    } ${isConfirmed ? "issue-confirmed" : ""}`}
                    key={item.item_id}
                  >
                    <span>{isConfirmed ? "confirmed" : item.severity}</span>
                    <strong>{userFacingReadinessIssue(item.description)}</strong>
                    <p>{item.suggested_source}</p>
                    {isGateB ? (
                      proposal ? (
                        <div className="gate-b-proposal">
                          <div className="gate-b-proposal-heading">
                            <Sparkles size={13} />
                            <strong>{proposal.question}</strong>
                          </div>
                          {proposal.task_brief_fact_refs.length ? (
                            <div className="gate-b-fact-refs">
                              任务书依据：
                              {taskBriefPageLabels(
                                facts,
                                proposal.task_brief_fact_refs,
                              ) || "已引用任务书"}
                            </div>
                          ) : (
                            <div className="gate-b-fact-refs warning">
                              当前任务书依据有限，以下内容只能作为设计假设。
                            </div>
                          )}
                          <div className="gate-b-options">
                            {proposal.options.map((option) => (
                              <button
                                type="button"
                                className={
                                  proposal.selected_option_id ===
                                  option.option_id
                                    ? "selected"
                                    : ""
                                }
                                key={option.option_id}
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  updateGateBProposal(
                                    item.item_id,
                                    "select",
                                    option.option_id,
                                  )
                                }
                              >
                                <strong>{option.title}</strong>
                                <p>{option.summary}</p>
                                <small>
                                  {option.design_moves.join(" → ")}
                                </small>
                              </button>
                            ))}
                          </div>
                          <div className="gate-b-custom">
                            <textarea
                              value={gateBInputs[item.item_id] ?? ""}
                              onChange={(event) =>
                                setGateBInputs((current) => ({
                                  ...current,
                                  [item.item_id]: event.target.value,
                                }))
                              }
                              placeholder="或者输入你自己的设计方向……"
                              aria-label={`${proposal.missing_label}自定义设计方向`}
                            />
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={
                                Boolean(busy) ||
                                !(gateBInputs[item.item_id] ?? "").trim()
                              }
                              onClick={() =>
                                updateGateBProposal(item.item_id, "custom")
                              }
                            >
                              采用并确认我的输入
                            </button>
                          </div>
                          {proposal.status === "selected" ||
                          proposal.status === "user_defined" ? (
                            <button
                              type="button"
                              className="primary-button gate-b-confirm"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                updateGateBProposal(item.item_id, "confirm")
                              }
                            >
                              <Check size={13} />
                              确认这个设计方向
                            </button>
                          ) : null}
                          {proposal.status === "confirmed" ? (
                            <div className="gate-b-confirmed">
                              <Check size={13} />
                              <div>
                                <strong>已确认为设计方向</strong>
                                <p>{proposal.confirmed_direction}</p>
                                <small>
                                  这是用户确认的方案决策，不会伪装成任务书事实。
                                </small>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="secondary-button gate-b-generate"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            updateGateBProposal(item.item_id, "generate")
                          }
                        >
                          {itemBusy ? (
                            <LoaderCircle className="spin" size={13} />
                          ) : (
                            <Sparkles size={13} />
                          )}
                          结合任务书生成设计提案
                        </button>
                      )
                    ) : null}
                  </article>
                );
              })}
              <div className="issue-section-title">
                <RefreshCw size={15} />
                数值冲突
              </div>
              {facts.conflicts.length ? (
                facts.conflicts.map((conflict) => (
                  <article className="issue-card conflict-card" key={conflict.conflict_id}>
                    <span>{conflict.severity}</span>
                    <strong>{conflict.field_path}</strong>
                    <p>{conflict.fact_ids.join(" · ")}</p>
                  </article>
                ))
              ) : (
                <div className="empty-note">没有检测到冲突。</div>
              )}
                </>
              )}
            </div>
          ) : null}
        </aside>

        <section className="panel outline-panel">
          {!hasProjectSource ? (
            <div className="planner-onboarding">
              <div className="onboarding-kicker">
                {isSmallBuildingMode(taskMode)
                  ? "SMALL PROJECT MODE"
                  : "HISTORICAL REFERENCE READY"}
              </div>
              <h2>
                {isSmallBuildingMode(taskMode) ? (
                  <>大型建筑信息已隔离，<br />现在只需上传任务书。</>
                ) : (
                  <>历史参考已经准备好，<br />现在只需上传任务书。</>
                )}
              </h2>
              <p>
                上传完成后，Agent 会自动读取文字与表格、建立当前项目证据库、
                检查完整度，并生成 {isSmallBuildingMode(taskMode) ? "小型项目专属" : `${DEFAULT_TARGET_PAGE_COUNT} 页`} A3 汇报骨架。
              </p>
              <div className="onboarding-flow">
                <span>任务书</span>
                <ChevronRight size={15} />
                <span>证据与 Gate</span>
                <ChevronRight size={15} />
                <span>页级目录</span>
              </div>
              <button
                className="primary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(busy)}
              >
                <Upload size={16} />
                选择任务书
              </button>
              <small>不会要求你先填写“设计目标”等字段。</small>
            </div>
          ) : (
            <>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">PAGE-LEVEL PLAN</div>
              <h2>页级目录</h2>
            </div>
            <div className="page-plan-heading-actions">
              <div className="page-count">{plan.pages.length} 页</div>
              <button
                type="button"
                className={`page-add-trigger ${
                  showAddPageComposer ? "active" : ""
                }`}
                onClick={() =>
                  setShowAddPageComposer((current) => !current)
                }
                aria-expanded={showAddPageComposer}
              >
                <Plus size={13} />
                新增页面
              </button>
            </div>
          </div>
          <div className="narrative-card">
            <Layers3 size={16} />
            <div>
              <span>全篇主张</span>
              <p>{plan.narrative_claim}</p>
            </div>
          </div>
          {showAddPageComposer ? (
            <section className="page-add-composer">
              <div className="page-add-composer-heading">
                <div>
                  <strong>让 Agent 起草一个新页面</strong>
                  <span>
                    将插入在第{" "}
                    {selectedPage?.display_page_number ??
                      plan.pages.at(-1)?.display_page_number ??
                      plan.pages.length}{" "}
                    页之后
                  </span>
                </div>
                <button
                  type="button"
                  className="remove-button"
                  onClick={() => {
                    setShowAddPageComposer(false);
                    setAddPagePrompt("");
                  }}
                  aria-label="关闭新增页面"
                >
                  <X size={13} />
                </button>
              </div>
              <textarea
                value={addPagePrompt}
                onChange={(event) =>
                  setAddPagePrompt(event.target.value)
                }
                maxLength={800}
                rows={4}
                placeholder="例如：增加一页滨水公共空间策略，说明从城市道路到水岸的三段空间序列，并突出全天候开放。"
                aria-label="新增页面提示词"
                autoFocus
              />
              <div className="page-add-composer-actions">
                <span>{addPagePrompt.length} / 800 字</span>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void addPageFromPrompt()}
                  disabled={
                    Boolean(busy) || !addPagePrompt.trim()
                  }
                >
                  {busy === "add-page" ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {busy === "add-page"
                    ? "Agent 正在起草"
                    : "生成并插入页面"}
                </button>
              </div>
              <small>
                只调用一次文本模型；生成后可继续编辑正文、制作视觉草案或删除页面。
              </small>
            </section>
          ) : null}
          <div className="scroll-area page-list">
            {plan.pages.map((page) => (
              <button
                className={`page-row ${
                  selectedPageId === page.page_id ? "selected" : ""
                } ${
                  ["cover", "toc", "section_divider"].includes(
                    page.page_type,
                  )
                    ? "structural-page"
                    : ""
                }`}
                key={page.page_id}
                onClick={() => selectPage(page.page_id)}
              >
                <div className="page-number">
                  {String(page.display_page_number).padStart(2, "0")}
                </div>
                <div className="page-row-main">
                  <div className="page-row-top">
                    <span>{displayPageTypeLabel(page)}</span>
                    <StatusPill
                      status={page.generation_status}
                    />
                  </div>
                  <strong>
                    {displayPageHeadline(page, isSmallBuildingMode(taskMode))}
                  </strong>
                  <p>{sanitizePresentationText(page.core_message)}</p>
                  <div className="page-evidence">
                    <Quote size={12} />
                    {page.fact_refs.length} 条事实
                    {page.missing_information.length ? (
                      <span>· 缺 {page.missing_information.length}</span>
                    ) : null}
                  </div>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
            </>
          )}
        </section>

        <aside className="panel detail-panel">
          {!hasProjectSource ? (
            <div className="empty-detail waiting-detail">
              <FileSearch size={26} />
              <strong>等待当前项目证据</strong>
              <p>目录生成后，在这里选择一页查看文案、缺失信息和事实引用。</p>
            </div>
          ) : selectedPage ? (
            <>
              <div className="detail-heading">
                <div className="page-index-block">
                  <span>PAGE</span>
                  <strong>
                    {String(selectedPage.display_page_number).padStart(2, "0")}
                  </strong>
                </div>
                <div className="detail-title">
                  <div>
                    <StatusPill
                      status={selectedPage.generation_status}
                    />
                    <span className="page-type-label">
                      {displayPageTypeLabel(selectedPage)}
                    </span>
                  </div>
                  <h2>{selectedReportHeadline}</h2>
                </div>
              </div>

              <div className="detail-actions">
                <button
                  className="primary-button generate-button"
                  onClick={generatePage}
                  disabled={
                    Boolean(busy) ||
                    selectedPage.generation_status === "blocked"
                  }
                >
                  {busy === "generate" ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {selectedPage.page_type === "summary"
                    ? "Agent 生成方案设计总结"
                    : "生成当前页中英双语文案"}
                </button>
                <button
                  className="secondary-button"
                  onClick={audit}
                  disabled={Boolean(busy)}
                >
                  {busy === "audit" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <ShieldCheck size={15} />
                  )}
                  审核已生成页
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setDetailTab("content");
                    beginPageTextEdit();
                  }}
                  disabled={Boolean(busy)}
                >
                  <Pencil size={15} />
                  编辑当前页全部文字
                </button>
                <button
                  className="delete-page-button"
                  onClick={deleteSelectedPage}
                  disabled={Boolean(busy) || plan.pages.length <= 1}
                  title="删除当前页及其正文、视觉草案"
                >
                  <Trash2 size={14} />
                  删除当前页
                </button>
              </div>

              <div className="detail-view-tabs" role="tablist" aria-label="单页查看方式">
                <button
                  className={detailTab === "preview" ? "active" : ""}
                  onClick={() => setDetailTab("preview")}
                  role="tab"
                  aria-selected={detailTab === "preview"}
                >
                  <Presentation size={14} />
                  A3 页面预览
                </button>
                <button
                  className={detailTab === "content" ? "active" : ""}
                  onClick={() => setDetailTab("content")}
                  role="tab"
                  aria-selected={detailTab === "content"}
                >
                  <BookOpenText size={14} />
                  内容与证据
                </button>
                <button
                  className={detailTab === "visual" ? "active" : ""}
                  onClick={() => setDetailTab("visual")}
                  role="tab"
                  aria-selected={detailTab === "visual"}
                >
                  <Sparkles size={14} />
                  视觉草案
                </button>
              </div>

              {detailTab === "preview" ? (
                <div className="scroll-area preview-scroll">
                  <A3PagePreview
                    page={selectedPage}
                    section={selectedSection}
                    sections={plan.sections}
                    pages={plan.pages}
                    facts={selectedFacts}
                    projectName={facts.project_name_anonymized ?? "当前项目"}
                    companyName={companyName}
                    taskMode={taskMode}
                    referenceStyleLibrary={
                      facts.reference_style_examples ?? []
                    }
                  />
                  <div className="preview-notice">
                    <Presentation size={15} />
                    <div>
                      <strong>当前为排版预览</strong>
                      <p>
                        正常预览只显示可进入汇报的正文、图解标签和事实标注；视觉建议保留在后台视觉任务中。
                      </p>
                    </div>
                  </div>
                </div>
              ) : detailTab === "visual" ? (
                <div className="scroll-area visual-task-scroll">
                  <section className="visual-linked-preview">
                    <div className="visual-linked-preview-heading">
                      <div>
                        <span>A3 视觉草案</span>
                        <strong>与当前页文案同步的视觉草案</strong>
                      </div>
                      <div className="visual-linked-preview-actions">
                        <em>
                          {selectedVisualSlot
                            ? `已选：${selectedVisualSlot.label}`
                            : selectedGeneratedImageCount > 0
                              ? `${selectedRequiredImageCount} 个固定图框 · ${selectedGeneratedImageCount} 个 AI 素材已就绪`
                              : `${selectedRequiredImageCount} 个固定图框 · 图片待生成`}
                        </em>
                      </div>
                    </div>
                    <A3PagePreview
                      page={selectedPage}
                      section={selectedSection}
                      sections={plan.sections}
                      pages={plan.pages}
                      facts={selectedFacts}
                      projectName={facts.project_name_anonymized ?? "当前项目"}
                      companyName={companyName}
                      taskMode={taskMode}
                      referenceStyleLibrary={
                        facts.reference_style_examples ?? []
                      }
                      visualMode
                      selectedVisualSlotId={selectedVisualSlotId}
                      onSelectVisualSlot={selectVisualSlot}
                      onGenerateVisualSlot={generateVisualImage}
                      onOpenVisualAsset={openVisualAsset}
                      visualImageGenerating={busy === "visual-image"}
                    />
                  </section>
                  <VisualTaskPanel
                    task={selectedPage.visual_task}
                    pageType={selectedPage.page_type}
                    busy={busy === "visual"}
                    generatingImage={busy === "visual-image"}
                    onCreate={() => updateVisualTask()}
                    selectedSlotId={selectedVisualSlotId}
                    onSelectSlot={selectVisualSlot}
                    imageJob={
                      visualImageJob?.pageId === selectedPage.page_id
                        ? visualImageJob
                        : null
                    }
                    onRetryImageJob={(job) =>
                      void generateVisualImage(job.slotId, job.taskId)
                    }
                    onOpenImage={openVisualAsset}
                  />
                </div>
              ) : (
              <div className="scroll-area detail-scroll">
                <section className="detail-section page-text-editor-section">
                  <div className="body-copy-heading">
                    <FieldLabel icon={<Pencil size={14} />}>
                      当前页文字
                    </FieldLabel>
                    {!editingSelectedPageText ? (
                      <button
                        type="button"
                        className="body-copy-edit-button"
                        onClick={beginPageTextEdit}
                      >
                        <Pencil size={13} />
                        编辑全部文字
                      </button>
                    ) : null}
                  </div>
                  {editingSelectedPageText && pageTextDraft ? (
                    <div className="page-text-editor">
                      <div
                        className={`page-text-translation-status status-${pageTextTranslationStatus}`}
                      >
                        {pageTextTranslationStatus === "translating" ||
                        pageTextTranslationStatus === "waiting" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : pageTextTranslationStatus === "failed" ? (
                          <AlertTriangle size={15} />
                        ) : (
                          <Sparkles size={15} />
                        )}
                        <div>
                          <strong>
                            {pageTextTranslationStatus === "waiting"
                              ? "等待输入完成，随后自动翻译"
                              : pageTextTranslationStatus === "translating"
                                ? "Agent 正在生成右侧英文"
                                : pageTextTranslationStatus === "completed"
                                  ? "英文已与当前中文同步"
                                  : pageTextTranslationStatus === "failed"
                                    ? "英文自动翻译未完成"
                                    : "只需编辑中文，英文由 Agent 生成"}
                          </strong>
                          <span>
                            {pageTextTranslationError ||
                              "停止输入约 1 秒后批量翻译本页，避免每个字都调用一次模型。"}
                          </span>
                        </div>
                        {pageTextTranslationStatus === "failed" ? (
                          <button
                            type="button"
                            onClick={() => {
                              translatedSourceRef.current = "";
                              setTranslatedPageTextSource("");
                              setPageTextTranslationError("");
                              setPageTextTranslationStatus("waiting");
                              setTranslationRetryNonce((current) => current + 1);
                            }}
                          >
                            <RefreshCw size={13} /> 重试
                          </button>
                        ) : null}
                      </div>
                      {textEditorPreviewPage ? (
                        <div className="page-text-live-preview">
                          <div>
                            <strong>实时A3预览</strong>
                            <span>修改任一字段后立即显示，保存前不会覆盖当前版本。</span>
                          </div>
                          <A3PagePreview
                            page={textEditorPreviewPage}
                            section={textEditorPreviewSection}
                            sections={textEditorPreviewSections}
                            pages={plan.pages.map((page) =>
                              page.page_id === textEditorPreviewPage.page_id
                                ? textEditorPreviewPage
                                : page,
                            )}
                            facts={selectedFacts}
                            projectName={
                              pageTextDraft.projectName || "当前项目"
                            }
                            companyName={companyName}
                            taskMode={taskMode}
                            referenceStyleLibrary={
                              facts.reference_style_examples ?? []
                            }
                          />
                        </div>
                      ) : null}
                      <fieldset>
                        <legend>页眉与章节</legend>
                        <label className="page-text-field is-wide">
                          <span>页眉项目名称 <em>修改后同步整套汇报</em></span>
                          <input
                            value={pageTextDraft.projectName}
                            onChange={(event) =>
                              updatePageTextDraft(
                                "projectName",
                                event.target.value,
                              )
                            }
                            maxLength={160}
                          />
                        </label>
                        <label className="page-text-field">
                          <span>章节中文名 <em>同步本章节全部页面</em></span>
                          <input
                            value={pageTextDraft.sectionTitleZh}
                            onChange={(event) =>
                              updatePageTextDraft(
                                "sectionTitleZh",
                                event.target.value,
                              )
                            }
                            maxLength={100}
                          />
                        </label>
                        <div className="page-text-field agent-translation-field">
                          <span>Agent 英文</span>
                          <div>{pageTextDraft.sectionTitleEn || "等待自动翻译…"}</div>
                        </div>
                      </fieldset>

                      <fieldset>
                        <legend>页面标题与结论</legend>
                        <label className="page-text-field">
                          <span>中文标题</span>
                          <input
                            value={pageTextDraft.headlineZh}
                            onChange={(event) =>
                              updatePageTextDraft(
                                "headlineZh",
                                event.target.value,
                              )
                            }
                            maxLength={160}
                            autoFocus
                          />
                        </label>
                        <div className="page-text-field agent-translation-field">
                          <span>Agent 英文标题</span>
                          <div>{pageTextDraft.headlineEn || "等待自动翻译…"}</div>
                        </div>
                        <label className="page-text-field">
                          <span>核心结论</span>
                          <textarea
                            value={pageTextDraft.coreMessage}
                            onChange={(event) =>
                              updatePageTextDraft(
                                "coreMessage",
                                event.target.value,
                              )
                            }
                            rows={3}
                            maxLength={600}
                          />
                        </label>
                        <div className="page-text-field agent-translation-field">
                          <span>Agent 英文结论</span>
                          <div>{pageTextDraft.coreMessageEn || "等待自动翻译…"}</div>
                        </div>
                      </fieldset>

                      <fieldset>
                        <legend>页面正文</legend>
                        <label className="page-text-field">
                          <span>中文正文</span>
                          <textarea
                            value={pageTextDraft.bodyZh}
                            onChange={(event) =>
                              updatePageTextDraft("bodyZh", event.target.value)
                            }
                            rows={8}
                            maxLength={4000}
                          />
                        </label>
                        <div className="page-text-field agent-translation-field">
                          <span>Agent 英文正文 <em>留档，不在A3中显示小字英文</em></span>
                          <div className="is-long">
                            {pageTextDraft.bodyEn || "等待自动翻译…"}
                          </div>
                        </div>
                      </fieldset>

                      <fieldset className="page-text-repeatable">
                        <div className="page-text-fieldset-heading">
                          <legend>图片图注 / 策略标题</legend>
                          <button
                            type="button"
                            onClick={() =>
                              updatePageTextDraft("diagramLabels", [
                                ...pageTextDraft.diagramLabels,
                                { zh: "", en: "" },
                              ])
                            }
                            disabled={pageTextDraft.diagramLabels.length >= 8}
                          >
                            <Plus size={12} /> 新增
                          </button>
                        </div>
                        {pageTextDraft.diagramLabels.map((item, index) => (
                          <div className="page-text-pair-row" key={`diagram-${index}`}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <input
                              value={item.zh}
                              onChange={(event) =>
                                updatePageTextDraft(
                                  "diagramLabels",
                                  pageTextDraft.diagramLabels.map((candidate, itemIndex) =>
                                    itemIndex === index
                                      ? { ...candidate, zh: event.target.value }
                                      : candidate,
                                  ),
                                )
                              }
                              placeholder="中文图注"
                            />
                            <div className="agent-translation-inline">
                              {item.en || "等待 Agent 英文…"}
                            </div>
                            <button
                              type="button"
                              className="page-text-remove"
                              onClick={() =>
                                updatePageTextDraft(
                                  "diagramLabels",
                                  pageTextDraft.diagramLabels.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                              aria-label={`删除图注 ${index + 1}`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </fieldset>

                      <fieldset className="page-text-repeatable">
                        <div className="page-text-fieldset-heading">
                          <legend>图面补充说明 / 策略说明</legend>
                          <button
                            type="button"
                            onClick={() =>
                              updatePageTextDraft("callouts", [
                                ...pageTextDraft.callouts,
                                { zh: "", en: "" },
                              ])
                            }
                            disabled={pageTextDraft.callouts.length >= 8}
                          >
                            <Plus size={12} /> 新增
                          </button>
                        </div>
                        {pageTextDraft.callouts.map((item, index) => (
                          <div className="page-text-pair-row" key={`callout-${index}`}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <input
                              value={item.zh}
                              onChange={(event) =>
                                updatePageTextDraft(
                                  "callouts",
                                  pageTextDraft.callouts.map((candidate, itemIndex) =>
                                    itemIndex === index
                                      ? { ...candidate, zh: event.target.value }
                                      : candidate,
                                  ),
                                )
                              }
                              placeholder="中文说明"
                            />
                            <div className="agent-translation-inline">
                              {item.en || "等待 Agent 英文…"}
                            </div>
                            <button
                              type="button"
                              className="page-text-remove"
                              onClick={() =>
                                updatePageTextDraft(
                                  "callouts",
                                  pageTextDraft.callouts.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                              aria-label={`删除补充说明 ${index + 1}`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </fieldset>

                      {selectedPage.page_type === "toc" ? (
                        <fieldset className="page-text-repeatable toc-text-editor">
                          <legend>目录中的全部章节</legend>
                          {pageTextDraft.tocSections.map((item, index) => (
                            <div className="toc-text-row" key={item.sectionId}>
                              <span>{String(index + 1).padStart(2, "0")}</span>
                              <input
                                value={item.titleZh}
                                onChange={(event) =>
                                  updatePageTextDraft(
                                    "tocSections",
                                    pageTextDraft.tocSections.map((candidate) =>
                                      candidate.sectionId === item.sectionId
                                        ? { ...candidate, titleZh: event.target.value }
                                        : candidate,
                                    ),
                                  )
                                }
                                placeholder="章节中文名"
                              />
                              <div className="agent-translation-inline">
                                {item.titleEn || "等待 Agent 英文…"}
                              </div>
                              <textarea
                                value={item.purpose}
                                onChange={(event) =>
                                  updatePageTextDraft(
                                    "tocSections",
                                    pageTextDraft.tocSections.map((candidate) =>
                                      candidate.sectionId === item.sectionId
                                        ? { ...candidate, purpose: event.target.value }
                                        : candidate,
                                    ),
                                  )
                                }
                                rows={2}
                                placeholder="目录中的章节说明"
                              />
                            </div>
                          ))}
                        </fieldset>
                      ) : null}

                      <fieldset>
                        <legend>演讲备注</legend>
                        <label className="page-text-field is-wide">
                          <span>讲述提示 <em>不进入PDF页面</em></span>
                          <textarea
                            value={pageTextDraft.speakerNotes}
                            onChange={(event) =>
                              updatePageTextDraft(
                                "speakerNotes",
                                event.target.value,
                              )
                            }
                            rows={5}
                            maxLength={3000}
                          />
                        </label>
                      </fieldset>

                      <div className="body-copy-editor-actions page-text-editor-actions">
                        <span>用户只编辑中文；Agent 英文同步完成后一起保存。</span>
                        <div>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={cancelPageTextEdit}
                          >
                            <X size={13} /> 取消
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={savePageTextEdit}
                            disabled={
                              pageTextTranslationStatus === "waiting" ||
                              pageTextTranslationStatus === "translating" ||
                              pageTextTranslationStatus === "failed" ||
                              pageTextTranslationSource !==
                                translatedPageTextSource
                            }
                          >
                            {pageTextTranslationStatus === "waiting" ||
                            pageTextTranslationStatus === "translating" ? (
                              <LoaderCircle className="spin" size={13} />
                            ) : (
                              <Save size={13} />
                            )}
                            {pageTextTranslationStatus === "waiting" ||
                            pageTextTranslationStatus === "translating"
                              ? "等待英文同步"
                              : "保存中英文字"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="page-text-editor-summary">
                      标题、核心结论、正文、图片图注、策略说明、章节名称和页眉项目名均可编辑；只需输入中文，英文由 Agent 自动生成。
                    </p>
                  )}
                </section>

                <section className="detail-section core-message">
                  <FieldLabel icon={<CircleDot size={14} />}>
                    CORE MESSAGE
                  </FieldLabel>
                  <p>{selectedReportCoreMessage}</p>
                  <small>
                    {selectedPage.core_message_en ||
                      englishCoreFallback(selectedPage.page_type)}
                  </small>
                </section>

                {selectedContentDepth?.applicable ? (
                  <section
                    className={`detail-section content-depth-card ${
                      selectedContentDepth.status === "pass"
                        ? "is-pass"
                        : "needs-improvement"
                    }`}
                  >
                    <div className="content-depth-heading">
                      <FieldLabel
                        icon={
                          selectedContentDepth.status === "pass" ? (
                            <Check size={14} />
                          ) : (
                            <AlertTriangle size={14} />
                          )
                        }
                      >
                        单页内容深度
                      </FieldLabel>
                      <strong>
                        {selectedContentDepth.status === "pass"
                          ? "达到最低标准"
                          : "仍需补充"}
                      </strong>
                    </div>
                    <div className="content-depth-metrics">
                      <span>
                        核心结论
                        <b>
                          {selectedContentDepth.conclusion_present
                            ? "1/1"
                            : "0/1"}
                        </b>
                      </span>
                      <span>
                        正文说明
                        <b>{selectedContentDepth.body_point_count}/2–4</b>
                      </span>
                      <span>
                        有效证据
                        <b>{selectedContentDepth.evidence_count}/2–4</b>
                      </span>
                      <span>
                        图片图注
                        <b>
                          {selectedContentDepth.image_caption_count}/
                          {selectedContentDepth.required_image_caption_count}
                        </b>
                      </span>
                      <span>
                        已落实提案
                        <b>{selectedContentDepth.confirmed_proposal_count}</b>
                      </span>
                      <span>
                        无来源数字
                        <b>{selectedContentDepth.unsupported_numbers.length}</b>
                      </span>
                    </div>
                    {selectedContentDepth.issues.length ? (
                      <ul className="content-depth-issues">
                        {selectedContentDepth.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="confirmed-note">
                        <Check size={13} /> 当前页结论、正文、证据和图注均已齐备
                      </p>
                    )}
                  </section>
                ) : null}

                <section className="detail-section">
                  <FieldLabel icon={<BookOpenText size={14} />}>
                    BODY COPY
                  </FieldLabel>
                  <div
                    className={`copy-block ${
                      selectedReportBody ? "" : "empty"
                    }`}
                  >
                    {selectedReportBody ||
                      (selectedPage.generation_status === "blocked"
                        ? "本页证据不足，生成已阻断。"
                        : "选择“生成当前页中英双语文案”后显示正文。")}
                  </div>
                  {selectedPage.body_en ? (
                    <div className="copy-block bilingual-copy-en">
                      {selectedPage.body_en}
                    </div>
                  ) : null}
                </section>

                <section className="detail-section">
                  <FieldLabel icon={<FileSearch size={14} />}>
                    DIAGRAM LABELS
                  </FieldLabel>
                  <div className="chip-list">
                    {selectedReportLabels.length ? (
                      selectedReportLabels.map((label, index) => (
                        <span key={label}>
                          {label}
                          <small>
                            {selectedPage.diagram_labels_en?.[index] ??
                              englishLabelFallback(
                                selectedPage.page_type,
                                index,
                              )}
                          </small>
                        </span>
                      ))
                    ) : (
                      <em>尚未生成图上标注</em>
                    )}
                  </div>
                </section>

                <section className="detail-section">
                  <FieldLabel>缺失信息</FieldLabel>
                  {selectedPage.missing_information.length ? (
                    <ul className="missing-list">
                      {selectedPage.missing_information.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="confirmed-note">
                      <Check size={13} /> 当前页所需字段已齐备
                    </p>
                  )}
                </section>

                {selectedProposalValidationItems.length ? (
                  <section className="detail-section">
                    <FieldLabel icon={<ShieldCheck size={14} />}>
                      提案确认后的待验证事项
                    </FieldLabel>
                    <ul className="missing-list proposal-validation-list">
                      {selectedProposalValidationItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p className="proposal-validation-note">
                      已确认提案可以支持文案草案；以上图纸、计算或专业复核仍需后续补齐。
                    </p>
                  </section>
                ) : null}

                <section className="detail-section">
                  <FieldLabel>SPEAKER NOTES</FieldLabel>
                  <p className="speaker-notes">
                    {selectedPage.speaker_notes || "生成页面后补充讲述提示。"}
                  </p>
                </section>

                <section className="detail-section reference-library-status-only">
                  <FieldLabel icon={<Layers3 size={14} />}>
                    {isSmallBuildingMode(taskMode)
                      ? "大型公共建筑参考隔离"
                      : "历史汇报参考库"}
                  </FieldLabel>
                  <p className="confirmed-note">
                    {isSmallBuildingMode(taskMode) || referenceLibraryConnected ? (
                      <Check size={13} />
                    ) : (
                      <AlertTriangle size={13} />
                    )}
                    {isSmallBuildingMode(taskMode)
                      ? "本页只使用当前任务书事实和用户确认的设计方向。"
                      : referenceLibraryConnected
                      ? "后台参考库已接入；具体项目、页码和配方不在用户端展示。"
                      : "后台参考库尚未接入。"}
                  </p>
                </section>

                <section className="detail-section">
                  <FieldLabel icon={<Quote size={14} />}>
                    FACT REFERENCES
                  </FieldLabel>
                  <div className="reference-list">
                    {selectedFacts.length ? (
                      selectedFacts.map((fact) => (
                        <article key={fact.fact_id}>
                          <div>
                            <code>项目依据</code>
                            <span>{userFacingFactSource(fact)}</span>
                          </div>
                          <strong>{String(fact.value_raw)}</strong>
                          <blockquote>{fact.source.quote}</blockquote>
                        </article>
                      ))
                    ) : (
                      <div className="empty-note">当前页没有可用事实引用。</div>
                    )}
                  </div>
                </section>

                {plan.audit_report ? (
                  <section className="detail-section audit-section">
                    <FieldLabel icon={<ShieldCheck size={14} />}>
                      一致性审核
                    </FieldLabel>
                    <p>{plan.audit_report.summary}</p>
                    {plan.audit_report.issues
                      .filter((issue) =>
                        issue.pages.includes(selectedPage.page_id),
                      )
                      .map((issue, index) => (
                        <article key={`${issue.issue}-${index}`}>
                          <span>{issue.severity}</span>
                          <strong>{issue.issue}</strong>
                          <p>{issue.recommended_fix}</p>
                        </article>
                      ))}
                  </section>
                ) : null}

              </div>
              )}
            </>
          ) : (
            <div className="empty-detail">请选择一页。</div>
          )}
        </aside>
      </section>
      {hasProjectSource ? (
        <div
          className="pdf-export-deck"
          data-export-ppi={pdfExportPpi}
          aria-hidden="true"
        >
          {plan.pages.map((page) => {
            const pageFacts = (page.fact_refs ?? [])
              .map((factId) =>
                facts.facts.find((fact) => fact.fact_id === factId),
              )
              .filter(Boolean) as DesignReportProjectFacts["facts"];
            const pageSection = plan.sections.find(
              (section) => section.section_id === page.section_id,
            );
            return (
              <section
                className="pdf-export-page"
                key={`pdf-${page.page_id}`}
              >
                <A3PagePreview
                  page={page}
                  section={pageSection}
                  sections={plan.sections}
                  pages={plan.pages}
                  facts={pageFacts}
                  projectName={
                    facts.project_name_anonymized ?? "当前项目"
                  }
                  companyName={companyName}
                  taskMode={taskMode}
                  referenceStyleLibrary={
                    facts.reference_style_examples ?? []
                  }
                  referenceDraftsAllowed={false}
                />
              </section>
            );
          })}
        </div>
      ) : null}
      <VisualAssetLightbox
        key={visualAssetPreview?.asset.image_url ?? "closed"}
        preview={visualAssetPreview}
        onClose={() => setVisualAssetPreview(null)}
      />
    </main>
  );
}
