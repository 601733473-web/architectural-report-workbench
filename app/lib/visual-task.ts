import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  isMetricBoundaryPage,
  versionedVisualReferenceCropUrl,
  visualReferenceEntriesById,
} from "@/app/lib/visual-reference";
import { contextualDiagramLabels } from "@/app/lib/presentation-copy";
import {
  isProjectUnderstandingPage,
  visualTypeAllowedInProjectUnderstanding,
} from "@/app/lib/report-chapter-policy";
import { isSmallBuildingMode } from "@/app/lib/task-mode";
import { localCultureFusionPrompt } from "@/app/lib/local-culture-fusion";

type ReportPage = DesignReportPagePlan["pages"][number];
export type VisualTask = NonNullable<ReportPage["visual_task"]>;
export type VisualIntent = VisualTask["visual_intent"];
export type VisualFrameLayout = NonNullable<VisualTask["frame_layout"]>;

export function legacyGeneratedImageFromSlots(
  images: NonNullable<VisualTask["generated_images"]>,
  fallback?: VisualTask["generated_image"],
) {
  const first = images[0];
  if (!first) return fallback;
  return {
    status: "generated" as const,
    model: first.model,
    prompt_zh: first.prompt_zh,
    submitted_prompt_zh: first.submitted_prompt_zh,
    submitted_negative_prompt_zh: first.submitted_negative_prompt_zh,
    size: first.size,
    image_url: first.image_url,
    generated_at: first.generated_at,
    provider_response_id: first.provider_response_id,
    image_count: first.image_count,
    attempt_count: first.attempt_count,
    reference_guidance: first.reference_guidance,
    disclaimer: first.disclaimer,
  } satisfies NonNullable<VisualTask["generated_image"]>;
}

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

function meaningfulVisualText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /[\p{L}\p{N}\u3400-\u9fff]/u.test(trimmed) &&
    !containsSerializedVisualFields(trimmed)
    ? trimmed
    : fallback;
}

function meaningfulVisualList(value: unknown, fallback: string[]) {
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

function sanitizeStoredVisualIntent(
  value: VisualIntent,
  fallback: VisualIntent,
): VisualIntent {
  return {
    conclusion_to_prove: meaningfulVisualText(
      value.conclusion_to_prove,
      fallback.conclusion_to_prove,
    ),
    relationship_to_show: value.relationship_to_show,
    evidence_needed: meaningfulVisualList(
      value.evidence_needed,
      fallback.evidence_needed,
    ) as VisualIntent["evidence_needed"],
    graphic_elements: meaningfulVisualList(
      value.graphic_elements,
      fallback.graphic_elements,
    ) as VisualIntent["graphic_elements"],
    search_focus: meaningfulVisualList(
      value.search_focus,
      fallback.search_focus,
    ) as VisualIntent["search_focus"],
    layout_logic: meaningfulVisualText(
      value.layout_logic,
      fallback.layout_logic,
    ),
  };
}

function isCoreConceptPage(page: ReportPage) {
  return (
    page.page_type === "concept" &&
    /核心概念|设计概念|概念统领/.test(
      `${page.headline_zh} ${page.core_message}`,
    )
  );
}

function isKeySpaceConceptRenderingPage(page: ReportPage) {
  return (
    page.page_type === "rendering" &&
    /重点空间呈现核心概念|三个重点精彩空间|P19.*核心概念|核心概念.*重点空间/u.test(
      `${page.headline_zh} ${page.core_message} ${page.visual_requirements.join(" ")}`,
    )
  );
}

function isTaskRequirementsMatrixPage(page: ReportPage) {
  return /任务要求响应矩阵/u.test(
    `${page.headline_zh} ${page.core_message}`,
  );
}

export function isTrafficRequirementsAnalysisPage(page: ReportPage) {
  return (
    page.page_type === "analysis" &&
    (page.display_page_number === 8 ||
      /交通要求梳理到达秩序|交通组织.*到达秩序/u.test(
        `${page.headline_zh} ${page.core_message}`,
      ))
  );
}

function isFourConditionConceptPage(page: ReportPage) {
  return /四项条件.*推导|从四项条件推导/u.test(
    `${page.headline_zh} ${page.core_message}`,
  );
}

function isVerticalSettlementGenerationPage(page: ReportPage) {
  return /拆分、错层与连通|垂直聚落.*生成|生成.*垂直聚落/u.test(
    `${page.headline_zh} ${page.core_message}`,
  );
}

function isGroundUndergroundCirculationPlanPage(page: ReportPage) {
  return (
    page.page_type === "plan" &&
    /首层与地下一层|地上地下分流闭环/u.test(
      `${page.headline_zh} ${page.core_message}`,
    )
  );
}

function isTypicalFloorEfficiencyPlanPage(page: ReportPage) {
  return (
    page.page_type === "plan" &&
    /典型层平面|典型层.*使用效率/u.test(
      `${page.headline_zh} ${page.core_message}`,
    )
  );
}

export function isSystemRenderingPage(page: ReportPage) {
  if (["cover", "toc", "section_divider"].includes(page.page_type)) {
    return false;
  }
  const recipeIds = new Set(page.experience_recipe_refs ?? []);
  const explicitlyTagged =
    recipeIds.has("HQE_RX_068") || recipeIds.has("URB_RX_018");
  const semanticText = `${page.headline_zh} ${page.headline_en ?? ""} ${page.core_message} ${page.visual_requirements.join(" ")}`;

  // Older saved projects may still classify this page as `technical`. The
  // explicit page meaning and manually curated recipe are more reliable than
  // that legacy enum value.
  return (
    explicitlyTagged ||
    /局部立面系统剖切|立面系统渲染|系统剖切(?:渲染)?|system rendering|facade system sectional rendering/i.test(
      semanticText,
    )
  );
}

export interface VisualImageSuitability {
  eligible: boolean;
  usage: "image_slot" | "programmatic_diagram" | "source_drawing";
  reason: string;
}

export function canGenerateVisualImageForSlot(
  pageType: ReportPage["page_type"],
  slot?: VisualTask["image_slots"][number],
) {
  const suitability = getVisualImageSuitability(pageType);
  return suitability.eligible && Boolean(slot);
}

export function getVisualImageSlotCount(
  pageType: ReportPage["page_type"],
) {
  if (pageType === "strategy") return 4;
  if (
    pageType === "comparison" ||
    pageType === "analysis" ||
    pageType === "summary"
  ) {
    return 3;
  }
  if (["masterplan", "plan", "section"].includes(pageType)) {
    return 3;
  }
  if (pageType === "technical") {
    return 2;
  }
  if (pageType === "toc") return 0;
  if (pageType === "section_divider") return 1;
  return 1;
}

export function isSingleSectionImagePage(page: ReportPage) {
  return (
    page.page_type === "section" &&
    (page.display_page_number === 29 || /^P0*29$/iu.test(page.page_id))
  );
}

export function isSiteConstraintOverviewPage(page: ReportPage) {
  return /(?:识别)?场地限制与建设条件|边界.*开发强度.*高度|用地边界.*容积率.*限高/u.test(
    `${page.headline_zh} ${page.core_message}`,
  );
}

export function getVisualImageSlotCountForPage(page: ReportPage) {
  if (isSingleSectionImagePage(page)) return 1;
  if (isSiteConstraintOverviewPage(page)) return 1;
  if (isMetricBoundaryPage(page)) return 1;
  if (isTaskRequirementsMatrixPage(page)) return 2;
  if (isVerticalSettlementGenerationPage(page)) return 4;
  if (isGroundUndergroundCirculationPlanPage(page)) return 2;
  if (isTypicalFloorEfficiencyPlanPage(page)) return 3;
  if (page.page_type !== "concept" || isCoreConceptPage(page)) {
    return getVisualImageSlotCount(page.page_type);
  }
  const context = `${page.headline_zh} ${page.core_message} ${page.visual_requirements.join(" ")}`;
  if (/六步|6\s*步|体量生成|形态生成|切分.*抬升|抬升.*围合/u.test(context)) {
    return 6;
  }
  if (/条件.*推导|推导.*逻辑|生成逻辑|概念生成|形态推演/u.test(context)) {
    return 4;
  }
  return 3;
}

export function getVisualFrameLayout(
  page: ReportPage,
  visualIntent: VisualIntent = inferVisualIntent(page),
  slotCount = getVisualImageSlotCountForPage(page),
): VisualFrameLayout {
  if (slotCount <= 1) return "single";
  if (slotCount === 6) return "two_by_three";
  if (slotCount === 4 && page.page_type !== "strategy") {
    return "two_by_two";
  }
  if (["strategy", "comparison"].includes(page.page_type)) return "row";
  if (page.page_type === "summary") return "lead_left";
  if (page.page_type === "concept") {
    return slotCount === 4 ? "two_by_two" : "lead_top";
  }
  if (page.page_type === "analysis") {
    if (
      ["sequence", "comparison"].includes(
        visualIntent.relationship_to_show,
      ) ||
      /步骤|流程|连续|先后|演变/u.test(
        `${page.headline_zh} ${page.core_message}`,
      )
    ) {
      return "row";
    }
    const pageNumber = page.display_page_number ?? 0;
    return pageNumber % 3 === 0
      ? "lead_top"
      : pageNumber % 3 === 1
        ? "lead_left"
        : "row";
  }
  if (slotCount === 4) return "two_by_two";
  if (slotCount === 3) {
    return (page.display_page_number ?? 0) % 2 === 0
      ? "lead_top"
      : "lead_left";
  }
  return "row";
}

export function createVisualImageSlots(
  page: ReportPage,
  visualIntent: VisualIntent = inferVisualIntent(page),
): VisualTask["image_slots"] {
  const suitability = getVisualImageSuitability(page.page_type);
  if (!suitability.eligible) return [];

  if (isSingleSectionImagePage(page)) {
    return [
      {
        slot_id: "S1",
        label: "关键剖面主图",
        purpose: "用一张关键剖面图完整呈现当前项目的竖向空间、层高和主要空间关系。",
        prompt_focus: `${page.headline_zh}；${page.core_message}；只保留一张关键剖面图，完整表达当前项目竖向空间、层高和主要空间关系；不得拆分为多张剖面图、交通辅助图或节点图，不得生成整张汇报页面。`,
        aspect_ratio: "wide",
      },
    ] as unknown as VisualTask["image_slots"];
  }

  const count = getVisualImageSlotCountForPage(page);
  if (isSiteConstraintOverviewPage(page)) {
    return [
      {
        slot_id: "S1",
        label: "场地边界与建设指标综合图",
        purpose:
          "用一张正投影或轻轴测场地图完整概括建设边界：清楚画出‘南北长约165米’、‘东西宽约135米’的尺寸线，横向标签必须写‘宽约’而不是‘长约’，并同时标注用地面积22,197㎡、容积率4.01、建筑限高120m；以用地红线、尺寸引线和高度控制线把五项信息挂接到对应对象，周边关系只保留必要的方向提示。",
        prompt_focus:
          "单张场地建设条件综合图；南北长约165米；东西宽约135米；用地面积22,197㎡；容积率4.01；建筑限高120m；红线边界、水平与垂直尺寸线、高度控制虚线、指标标注逐项挂接；横向标签必须写‘宽约’而不是‘长约’；所有数字逐字采用当前项目事实；不得拆成三张图，不得遗漏场地长宽、容积率或限高",
        aspect_ratio: "wide",
      },
    ] as unknown as VisualTask["image_slots"];
  }
  if (isMetricBoundaryPage(page)) {
    return [
      {
        slot_id: "S1",
        label: "指标约束与功能体量图解",
        purpose:
          "以灰白场地或城市模型为底图，用不同颜色的抽象建筑体块表达主要功能和体量层级；必须把当前项目已核验的用地面积、容积率、建筑限高、总建筑面积及可用的分项面积直接标注在对应体块或指标引线上。",
        prompt_focus:
          "当前项目指标边界；灰白场地模型底图；彩色抽象功能体块；面积、容积率、建筑限高、总建筑面积与分项规模标注；数字必须逐字采用 current_project_facts，不得沿用历史参考图数值，不得生成无指标的纯体量效果图",
        aspect_ratio: "wide",
      },
    ] as unknown as VisualTask["image_slots"];
  }
  if (isTaskRequirementsMatrixPage(page)) {
    return [
      {
        slot_id: "S1",
        label: "功能业态：酒店 / 公寓 / 办公 / 零售",
        purpose:
          "用一张清晰功能关系图概括四类主要业态及其共享与独立运营关系。",
        prompt_focus:
          "当前项目功能业态响应；酒店、公寓、办公、零售四类功能；共享基座与独立塔体；简洁关系图；不得出现A3幅面、中英双语、胶装成册或其他成果规范内容",
        aspect_ratio: "landscape",
      },
      {
        slot_id: "S2",
        label: "交通接驳：地铁 / 地下环道 / 地面货运",
        purpose:
          "用一张分层交通关系图概括地铁接驳、地下环道和地面独立货运三类到达系统。",
        prompt_focus:
          "当前项目交通接驳响应；地铁13号线、地下环道、地面独立货运；人车货分层；简洁关系图；不得出现A3幅面、中英双语、胶装成册或其他成果规范内容",
        aspect_ratio: "landscape",
      },
    ] as unknown as VisualTask["image_slots"];
  }
  if (["cover", "section_divider"].includes(page.page_type)) {
    const label =
      page.page_type === "cover"
        ? "生态垂直聚落封面主视觉"
        : `${page.headline_zh}章节主视觉`;
    const sectionLighting = [
      "清晨日景",
      "柔和阴天日景",
      "有天空层次的蓝调黄昏",
      "明亮日景",
      "暖色日落前",
      "清晨日景",
    ][Math.abs(page.display_page_number ?? 0) % 6];
    const purpose =
      page.page_type === "cover"
        ? `生成一张与“${page.headline_zh}”直接对应的全幅建筑主视觉；延续同一组三塔、连续商业基座、空中庭院与局部连桥的方案形态，标题和页码由页面系统叠加。`
        : `生成一张与“${page.headline_zh}”主题直接对应的${sectionLighting}全幅建筑主视觉；图像自身不得采用纯夜景，页面深色效果由前端黑底与50%透明度完成。`;
    const promptFocus =
      page.page_type === "cover"
        ? `${page.headline_zh}；${page.core_message}；当前图框只聚焦${label}；同一组三座错位纤细塔体、连续商业基座、空中庭院、局部连桥与立体绿化；主体避开标题区；图内不得生成文字、Logo、边框、拼贴或整张汇报页面`
        : `${page.headline_zh}；${page.core_message}；当前图框只聚焦${label}；${sectionLighting}，保留清晰天空与建筑轮廓，禁止纯夜景、深夜天空和全画面人工灯光；同一组三座错位纤细塔体、连续商业基座、空中庭院、局部连桥与立体绿化；主体避开标题区；深色叠加只由前端以50%透明度覆盖黑底实现；图内不得生成文字、Logo、边框、拼贴或整张汇报页面`;
    return [
      {
        slot_id: "S1",
        label,
        purpose,
        prompt_focus: promptFocus,
        aspect_ratio: "wide",
      },
    ] as unknown as VisualTask["image_slots"];
  }
  if (page.page_type === "summary") {
    const summarySlots = [
      {
        label: "总体鸟瞰或建筑整体效果图",
        purpose:
          "用一张整体效果图呈现建筑与场地、城市界面和总体空间关系；可保留帮助理解空间关系的少量必要标注。",
      },
      {
        label: "公共空间或入口效果图",
        purpose:
          "用一张公共空间效果图呈现主要到达、开放界面、人物活动与场所尺度；可保留帮助理解空间关系的少量必要标注。",
      },
      {
        label: "重点空间或室内效果图",
        purpose:
          "用一张重点空间效果图呈现核心功能、空间体验、自然采光与材料氛围；可保留帮助理解空间关系的少量必要标注。",
      },
    ];
    return summarySlots.map((slot, index) => ({
      slot_id: `S${index + 1}`,
      label: slot.label,
      purpose: slot.purpose,
      prompt_focus: `${page.headline_zh}；${page.core_message}；${slot.label}；只生成当前项目的一张独立建筑效果图素材；与已确认方案方向和前文结论一致；图内严禁任何文字、数字、字母、尺寸、箭头、图例、Logo、标题、标签或水印；不得生成拼贴或整张汇报页面`,
      aspect_ratio: index === 0 ? "wide" : "landscape",
    })) as unknown as VisualTask["image_slots"];
  }
  if (isKeySpaceConceptRenderingPage(page)) {
    const conceptAnchor =
      "P19 核心概念是当前唯一概念锚点；三张图必须呈现同一方案形态和同一空间语言，只改变观看场景。";
    const slots = [
      ["公共到达与开放界面", "呈现从城市到达进入公共空间的连续体验与开放关系。"],
      ["核心共享空间", "呈现最能代表核心概念的共享空间、公共活动和空间尺度。"],
      ["重点室内空间", "呈现重点功能室内的材料、采光、界面和可感知氛围。"],
    ];
    return slots.map(([label, purpose], index) => ({
      slot_id: `S${index + 1}`,
      label,
      purpose: `${purpose}${conceptAnchor}`,
      prompt_focus: `${page.headline_zh}；${conceptAnchor}；当前图框只聚焦${label}；${purpose}；三张图保持同一组三塔、连续基座、空中庭院、连桥与立体绿化的方案形态；只生成一张干净的建筑空间效果图，不生成汇报页面；图内严禁任何文字、数字、字母、尺寸、箭头、图例、Logo、标题、标签或水印`,
      aspect_ratio: index === 0 ? "wide" : "landscape",
    })) as unknown as VisualTask["image_slots"];
  }
  if (isSystemRenderingPage(page)) {
    return [
      {
        slot_id: "S1",
        label: "局部立面系统剖切渲染",
        purpose:
          "生成一张局部立面系统剖切渲染：近距离切开连续三至五层典型楼层与一至两个立面开间，真实展示室内使用空间、楼板、吊顶、幕墙、水平遮阳、可开启通风构件和环境路径之间的关系；允许少量系统箭头与简体中文短标签。",
        prompt_focus: `${visualIntent.conclusion_to_prove}；facade system sectional rendering；局部立面剖切近景；只截取连续三至五层典型楼层和一至两个立面开间；清晰看到室内、楼板、吊顶、幕墙、水平遮阳、可开启通风构件与自然通风路径；写实建筑系统模型与克制技术图解结合；允许少量必要系统箭头和简体中文短标签；严禁整栋建筑、城市鸟瞰、塔楼全景、功能分区色块、建筑体量轴测、section perspective、大段正文、Logo 或整张汇报页面`,
        aspect_ratio: "wide",
      },
    ];
  }
  if (isCoreConceptPage(page)) {
    return [
      {
        slot_id: "S1",
        label: "核心概念背景效果图",
        purpose:
          "生成一张能够整页铺底的干净建筑空间效果图，用空间氛围、尺度与构图承载核心概念；标题、说明和全部标注只由页面系统叠加。",
        prompt_focus: `${visualIntent.conclusion_to_prove}；清晨或柔和日景的全幅建筑效果图背景；同一组三座错位纤细塔体并保持一高一中一低、连续商业基座、空中庭院与局部连桥；主体偏右或居中；为概念标题保留干净区域；图内禁止任何文字、数字、箭头、Logo、边框或完整页面`,
        aspect_ratio: "wide",
      },
    ];
  }
  if (isFourConditionConceptPage(page)) {
    const slots = [
      ["连续基座连接地铁与绿地", "只强化连续商业基座、地铁接驳和绿地公共带"],
      ["三塔错位形成高低梯度", "在同一基座上明确三座塔楼一高一中一低的错位关系"],
      ["空中庭院与连桥延伸公共界面", "在同一三塔母型上只强化空中庭院与局部连桥"],
      ["立体绿化回应热湿气候", "在同一三塔母型上只强化立体绿化、遮阳与通风路径"],
    ];
    return slots.map(([label, action], index) => ({
      slot_id: `S${index + 1}`,
      label,
      purpose: `${action}；四张图必须使用完全相同的正轴测镜头、场地底图、三塔轮廓和相对高度，只改变当前步骤的高亮内容。`,
      prompt_focus: `${page.headline_zh}；概念推导第${index + 1}步；${action}；固定同一正轴测镜头和同一白色场地模型；项目范围始终恰好三座主塔并保持一高一中一低、连续商业基座与相同连桥位置；克制单色模型仅用一种强调色标出本步骤；图内禁止任何文字、数字、箭头、Logo、边框或整张汇报页面`,
      aspect_ratio: "landscape",
    })) as unknown as VisualTask["image_slots"];
  }
  if (isVerticalSettlementGenerationPage(page)) {
    const slots = [
      ["基座整合：连续公共底盘", "以连续商业基座整合地铁、绿地和地面公共空间"],
      ["垂直拆分：三塔高低梯度", "从共同基座上明确拆分出一高一中一低三座塔楼"],
      ["错层退台：庭院与通风缝隙", "在同一三塔轮廓中加入错层空中庭院和自然通风缝隙"],
      ["水平连通：连桥与立体绿化", "以局部连桥和立体绿化完成垂直聚落"],
    ];
    return slots.map(([label, action], index) => ({
      slot_id: `S${index + 1}`,
      label,
      purpose: `${action}；四张图必须保持同一正轴测镜头、相同场地范围和完全一致的三塔数量及相对高度。`,
      prompt_focus: `${page.headline_zh}；形态生成第${index + 1}步；${action}；固定同一正轴测镜头、同一白色场地模型和同一组三座主塔；三塔始终保持一高一中一低，连续商业基座、连桥位置和体量边界前后对应；只用一种强调色显示本步骤新增动作；禁止局部摄影近景、改变镜头、增加第四塔、图内文字、数字、箭头、Logo、边框或整张汇报页面`,
      aspect_ratio: "landscape",
    })) as unknown as VisualTask["image_slots"];
  }
  if (isGroundUndergroundCirculationPlanPage(page)) {
    return [
      {
        slot_id: "S1",
        label: "1F 首层公共空间与入口平面",
        purpose:
          "以严格正投影首层平面呈现连续商业基座、三座塔楼落位与核心筒、地铁接驳入口、公共慢行轴、商业入口及办公/酒店/公寓独立入口。",
        prompt_focus: `${page.headline_zh}；只生成1F首层建筑平面，不生成总平面、鸟瞰或透视图；固定当前项目场地边界、连续商业基座及一高一中一低三座塔楼的落位，清楚表达公共慢行、商业到达、地铁接驳入口与三类塔楼独立门厅；图内仅保留必要简体中文短标签，禁止虚构尺寸、轴号和完整汇报页面`,
        aspect_ratio: "wide",
      },
      {
        slot_id: "S2",
        label: "B1 地铁接驳与后勤平面",
        purpose:
          "以同一场地范围和同一核心筒几何呈现地下一层地铁接驳、地下商业步行主轴、停车到达、设备后勤及地面货运环线衔接。",
        prompt_focus: `${page.headline_zh}；只生成B1地下一层建筑平面，不生成总平面、鸟瞰或透视图；必须以同页1F图为image-to-image几何锚点，场地边界、连续基座外轮廓、三座塔楼投影、核心筒位置和柱网方向前后一致，只改变地下商业、地铁接驳、停车到达、设备后勤和货运衔接内容；图内仅保留必要简体中文短标签，禁止虚构尺寸、轴号和完整汇报页面`,
        aspect_ratio: "wide",
      },
    ] as unknown as VisualTask["image_slots"];
  }
  if (isTypicalFloorEfficiencyPlanPage(page)) {
    const typicalFloorSlots = [
      {
        label: "办公塔典型层平面",
        purpose:
          "保持三塔相对位置与核心筒几何不变，以左侧办公塔为唯一高亮主体，精绘开放办公、会议、支持空间、独立交通核与疏散组织；中部酒店塔和右侧公寓塔只保留浅灰轮廓作为对应参照。",
        accent: "蓝色",
      },
      {
        label: "酒店塔典型层平面",
        purpose:
          "保持三塔相对位置与核心筒几何不变，以中部酒店塔为唯一高亮主体，精绘客房模块、中央走道、服务后勤、布草与独立交通核；左侧办公塔和右侧公寓塔只保留浅灰轮廓作为对应参照。",
        accent: "紫色",
      },
      {
        label: "公寓塔典型层平面",
        purpose:
          "保持三塔相对位置与核心筒几何不变，以右侧公寓塔为唯一高亮主体，精绘公寓单元、公共走道、共享节点、服务后勤与独立交通核；左侧办公塔和中部酒店塔只保留浅灰轮廓作为对应参照。",
        accent: "暖黄色",
      },
    ];
    return typicalFloorSlots.map((slot, index) => ({
      slot_id: `S${index + 1}`,
      label: slot.label,
      purpose: slot.purpose,
      prompt_focus: `${page.headline_zh}；${slot.label}；固定与P26、P27相同的正投影朝向、三塔相对位置、塔楼外轮廓、核心筒位置和柱网方向；只用${slot.accent}高亮并精绘当前塔楼，另外两塔降为浅灰参照轮廓；必须清楚表现当前业态的典型层使用效率，不得把办公、酒店、公寓三种功能混在同一高亮区域；不得改画总平面、首层基座、鸟瞰、透视或剖面；图内只保留必要简体中文短标签`,
      aspect_ratio: "wide",
    })) as unknown as VisualTask["image_slots"];
  }
  if (["masterplan", "plan", "section"].includes(page.page_type)) {
    const drawingSlots =
      page.page_type === "masterplan"
        ? [
            ["总体布局主图", "完整呈现当前项目总体布局、场地边界、建筑与开放空间关系。"],
            ["开放空间辅助图", "补充呈现开放空间结构及其与主要城市界面的联系。"],
            ["交通组织辅助图", "补充呈现人行、车行、后勤与主要入口之间的关系。"],
          ]
        : page.page_type === "section"
          ? [
              ["关键剖面主图", "完整呈现当前项目关键剖面、竖向空间与层高关系。"],
              ["竖向交通辅助图", "补充呈现垂直交通与主要公共空间的连接关系。"],
              ["空间节点辅助图", "补充呈现重点剖面节点、采光或室内外衔接。"],
            ]
          : [
              ["当前项目平面主图", "完整呈现当前项目本层平面、功能分区和主要空间边界。"],
              ["功能与邻接辅助图", "补充呈现主要功能之间的邻接、共享与运营关系。"],
              ["流线与公共节点辅助图", "补充呈现人行、车行、后勤流线及公共空间节点。"],
            ];
    return drawingSlots.map(([label, purpose], index) => ({
      slot_id: `S${index + 1}`,
      label,
      purpose,
      prompt_focus: `${page.headline_zh}；${page.core_message}；当前图框只聚焦${label}；${purpose}；优先匹配完整、清晰且与当前页主题一致的图纸或图解，不得匹配纯文字页、装饰性效果图或整张汇报页面`,
      aspect_ratio: index === 0 ? "wide" : "landscape",
    })) as unknown as VisualTask["image_slots"];
  }
  if (isTrafficRequirementsAnalysisPage(page)) {
    const trafficSlots = [
      ["地铁13号线马场站人行接驳", "衔接地铁13号线马场站及地下商业人行流线。"],
      ["地面独立货运入口", "货运因高度受限从地面独立进入，不进入地下环形车道。"],
      ["多业态落客与人员分流", "分离酒店、公寓、办公及商业人员与落客流线。"],
    ];
    return trafficSlots.map(([label, purpose], index) => ({
      slot_id: `S${index + 1}`,
      label,
      purpose: `${purpose} 当前项目范围内必须清晰保持恰好三座主塔，一高、一中、一低，由连续商业基座连接。`,
      prompt_focus: `${page.headline_zh}；当前图框只聚焦${label}；${purpose}；以当前项目为主体，项目范围内恰好三座主塔并保持一高、一中、一低的稳定关系；连续商业基座、三塔相对位置和主要场地边界保持一致；交通箭头和节点只能服务于三塔项目，不得增加第四座项目塔楼或额外塔状体量；图内不生成整张汇报页面`,
      aspect_ratio: index === 0 ? "wide" : "landscape",
    })) as unknown as VisualTask["image_slots"];
  }
  const contextualLabels = contextualDiagramLabels(
    page.page_type,
    page.headline_zh,
    page.core_message,
    count,
  );
  const genericDiagramLabels = new Set([
    "视觉证据 1",
    "视觉证据 2",
    "视觉证据 3",
    "视觉证据 4",
    "现状条件",
    "关键关系",
    "问题判断",
    "策略动作",
    "作用对象",
    "预期结果",
    "空间底图",
    "专题证据层",
    "关键位置",
    "结论标注",
  ]);
  const labels = unique([
    ...page.diagram_labels.filter(
      (label) => !genericDiagramLabels.has(label),
    ),
    ...contextualLabels,
    ...visualIntent.graphic_elements,
  ]);
  return Array.from({ length: count }, (_, index) => {
    const label =
      labels[index] ??
      (page.page_type === "strategy"
        ? `策略步骤 ${index + 1}`
        : page.page_type === "comparison"
          ? `方案 ${index + 1}`
          : `视觉证据 ${index + 1}`);
    const aspectRatio =
      ["strategy", "comparison"].includes(page.page_type)
        ? "square"
        : count === 1
          ? "wide"
          : "landscape";
    return {
      slot_id: `S${index + 1}`,
      label,
      purpose: `只用一张独立图片证明“${label}”这一项子证据，并与其他图框共同支撑本页结论“${visualIntent.conclusion_to_prove}”；可包含少量必要标签或图例，但不能只因页型相似就采用无关图片。`,
      prompt_focus: `${page.headline_zh}；${page.core_message}；当前图框只聚焦${label}；${visualIntent.relationship_to_show}；${visualIntent.search_focus.join("；")}；${visualIntent.layout_logic}`,
      aspect_ratio: aspectRatio,
    };
  }) as unknown as VisualTask["image_slots"];
}

export function createSmallModeVisualImageSlots(
  page: ReportPage,
): VisualTask["image_slots"] {
  const context = `${page.headline_zh}；${page.core_message}`;
  const installationId = page.headline_zh.match(
    /装置\s*([0-9一二三四五六七八九十]+)/u,
  )?.[1];
  const relevantDesignSystemLines = (page.visual_brief ?? []).filter((item) =>
    /^全篇设计系统｜/u.test(item) ||
    (installationId
      ? item.startsWith(`对象${installationId}｜`)
      : /^对象/u.test(item)),
  );
  const designSystemContext = relevantDesignSystemLines.join("；");
  const designObjectName = (objectId: string) => {
    const line = (page.visual_brief ?? []).find((item) =>
      item.startsWith(`对象${objectId}｜`),
    );
    const name = line?.match(/方案名=([^｜]+)/u)?.[1]?.trim();
    if (
      name &&
      !/^(?:装置|对象|方案)\s*[一二三四五六七八九十\d]+$/u.test(name)
    ) {
      return name;
    }
    const titleName = page.headline_zh
      .split("｜")
      .slice(1)
      .join("｜")
      .replace(/^装置\s*[一二三四五六七八九十\d]+\s*[|｜:]?/u, "")
      .trim();
    return titleName || `主题方案${objectId}`;
  };
  const slot = (
    slotId: string,
    label: string,
    purpose: string,
    aspectRatio: "wide" | "landscape" | "portrait" | "square" = "wide",
  ) => ({
    slot_id: slotId,
    label,
    purpose,
    prompt_focus: `${context}；${designSystemContext}；当前图框任务：${purpose}；严格沿用全篇设计系统中当前对象的方案名、主体轮廓、空间机制、材料灯光和互动构件。只生成独立视觉资产，不生成整张汇报页面、标题、Logo、边框或拼贴文字。`,
    aspect_ratio: aspectRatio,
  });

  if (page.page_type === "cover") {
    return [
      slot(
        "S1",
        `${page.headline_zh}封面主视觉`,
        "以全篇设计系统为唯一造型依据，把全部对象的共同语言凝练成一个居中的当代艺术意象；主体位于画面中下部，上半部保持浅色安静留白，封面不偏向任何单一对象。",
      ),
    ] as VisualTask["image_slots"];
  }
  if (/轻国风少女\s*IP|平面形象到现场角色/u.test(page.headline_zh)) {
    return [
      slot("S1", "轻国风少女 IP 主形象", "呈现与当前项目文化、产品和共同色彩系统一致的年轻化轻国风少女主形象。", "portrait"),
      slot("S2", "IP 服装与动作设定", "呈现同一角色的服装层次、关键配饰和与当前项目体验相关的动作设定。", "landscape"),
      slot("S3", "真人 IP 现场互动", "呈现真人穿着同一套角色服装，在当前项目现场引导观众参与的真实尺度场景。", "landscape"),
    ] as VisualTask["image_slots"];
  }
  if (/三类产品与三件装置|主题矩阵|三件装置的.*分工/u.test(page.headline_zh)) {
    const objectIds = [
      ...new Set(
        (page.visual_brief ?? [])
          .map((item) => item.match(/^对象([^｜]+)｜/u)?.[1])
          .filter(
            (value): value is string =>
              typeof value === "string" &&
              /^[0-9一二三四五六七八九十]+$/u.test(value),
          ),
      ),
    ];
    const ids = objectIds.length ? objectIds : ["1", "2", "3"];
    return ids.slice(0, 6).map((id, index) =>
      slot(
        `S${index + 1}`,
        `${designObjectName(id)}主题与现场体验`,
        `呈现“${designObjectName(id)}”对应的产品主题，以及全篇设计系统为该对象确定的主体轮廓、观众动作和产品或赠品触点；各图共享共同语言，但不得混用其他对象的造型与互动。`,
        "landscape",
      ),
    ) as VisualTask["image_slots"];
  }
  if (
    page.page_type === "strategy" &&
    !/从看见到参与|体验如何发生/u.test(page.headline_zh)
  ) {
    if (/活动背景|发布会|发布任务/u.test(page.headline_zh)) {
      return [
        slot(
          "S1",
          "活动背景与发布会任务",
          "用一张现场总览图说明活动背景、产品发布会任务与观众参与关系；只保留一张能同时支撑这三个关系的现场画面。",
          "landscape",
        ),
      ] as VisualTask["image_slots"];
    }
    const labels = unique([
      ...page.diagram_labels,
      ...(page.callouts ?? []).map((callout) => callout.label_zh),
      ...page.visual_requirements.filter(
        (item) => !/^全篇设计系统｜|^对象/u.test(item),
      ),
    ]).slice(0, 3);
    const strategyLabels = labels.length >= 3
      ? labels
      : ["项目任务与活动目标", "设计语言与体验机制", "传播与复用结果"];
    return strategyLabels.map((label, index) =>
      slot(
        `S${index + 1}`,
        label,
        `把“${label}”转译为一张与当前页正文直接对应的场景或对象关系图；图像承担当前策略的具体证据，不生成大型建筑分析图。`,
        "landscape",
      ),
    ) as VisualTask["image_slots"];
  }
  if (/从看见到参与|体验如何发生/u.test(page.headline_zh)) {
    return [
      slot(
        "S1",
        "三件装置的完整参与路径",
        "用一张横向现场全景同时呈现全篇设计系统中的全部对象及其不同参与动作；以真实人物行为连接各体验节点，每个对象必须保持已锁定的轮廓和互动构件。",
      ),
    ] as VisualTask["image_slots"];
  }
  if (/IP与三件装置|现场联动/u.test(page.headline_zh)) {
    return [
      slot(
        "S1",
        "轻国风少女 IP 串联三处现场",
        "同一张横向现场全景呈现全篇设计系统中的全部对象及其稳定母型；同一位真人 IP 以任务书明确的现场互动连接各体验节点，观众的参与、拍摄与分享动作清晰可见。",
      ),
    ] as VisualTask["image_slots"];
  }
  if (
    page.page_type === "technical" &&
    !installationId &&
    /复用|收起|搭建/u.test(page.headline_zh)
  ) {
    return [
      slot(
        "S1",
        "三件装置的可拆分构件总览",
        "在同一干净场景中并列呈现全篇设计系统中各对象可识别的主体构件、互动构件和分类收纳单元；表达可拆分、可运输和可收纳，不生成尺寸、节点详图或工程参数。",
        "landscape",
      ),
      slot(
        "S2",
        "今年使用—收起—明年再部署",
        "用连续的真实场景表达全部对象从现场使用、构件分类收起到再次部署的关系；各对象的稳定母型仍可识别，不生成流程图、箭头、尺寸和工程节点。",
        "landscape",
      ),
    ] as VisualTask["image_slots"];
  }
  if (page.page_type === "technical") {
    const prefix = installationId
      ? designObjectName(installationId)
      : page.headline_zh;
    return [
      slot("S1", `${prefix}互动与产品触点`, "近距离呈现当前页明确的观众动作、产品或赠品触点，主体构件必须与该装置主视觉保持一致。", "landscape"),
      slot("S2", `${prefix}收起与复用场景`, "呈现活动使用、收起和再次部署的可理解场景，只表达任务书已有的复用要求，不虚构结构参数。", "landscape"),
    ] as VisualTask["image_slots"];
  }
  if (page.page_type === "summary") {
    const summaryObjectName = (objectId: string, fallback: string) => {
      const line = (page.visual_brief ?? []).find((item) =>
        item.startsWith(`对象${objectId}｜`),
      );
      const name = line?.match(/方案名=([^｜]+)/u)?.[1]?.trim();
      return name && !/^(?:装置|对象|方案)\s*[一二三四五六七八九十\d]+$/u.test(name)
        ? name
        : fallback;
    };
    const summaryNames = [
      summaryObjectName("1", "第一方案"),
      summaryObjectName("2", "第二方案"),
      summaryObjectName("3", "第三方案"),
    ];
    return [
      slot(
        "S1",
        `${summaryNames[0]}主效果图`,
        `直接复用${summaryNames[0]}效果页已经生成的主效果图，作为总结页的总体形象证据；不重新调用图像模型。`,
        "landscape",
      ),
      slot(
        "S2",
        `${summaryNames[1]}主效果图`,
        `直接复用${summaryNames[1]}效果页已经生成的主效果图，作为总结页的公共空间与互动证据；不重新调用图像模型。`,
        "landscape",
      ),
      slot(
        "S3",
        `${summaryNames[2]}主效果图`,
        `直接复用${summaryNames[2]}效果页已经生成的主效果图，作为总结页的重点空间与文化体验证据；不重新调用图像模型。`,
        "landscape",
      ),
    ] as VisualTask["image_slots"];
  }

  const label = installationId
    ? page.page_type === "rendering"
      ? `${designObjectName(installationId)}现场互动效果图`
      : `${designObjectName(installationId)}整体概念主视觉`
    : `${page.headline_zh}主视觉`;
  return [
    slot(
      "S1",
      label,
      page.page_type === "rendering"
        ? "以一张完整现场效果图证明本页的空间主张、观众动作、产品触点和文化氛围；人物、装置和前后页面使用同一设计语言。"
        : "以一张清晰主视觉证明本页唯一结论，并为正文保留稳定留白；画面对象必须逐项对应当前页标题和任务书事实。",
    ),
  ] as VisualTask["image_slots"];
}

export function getVisualImageSuitability(
  pageType: ReportPage["page_type"],
): VisualImageSuitability {
  if (pageType === "section_divider") {
    return {
      eligible: true,
      usage: "image_slot",
      reason:
        "章节页使用一张与本章内容一致的深色主视觉；图像以 50% 透明度叠在黑底上，标题与页码由页面系统清晰叠加。",
    };
  }
  if (pageType === "summary") {
    return {
      eligible: true,
      usage: "image_slot",
      reason:
        "方案总结页使用三张独立效果图素材，分别呈现总体形象、公共空间和重点空间；总结正文与准确结论由页面系统生成并保留。",
    };
  }
  if (["cover", "concept", "rendering", "summary"].includes(pageType)) {
    return {
      eligible: true,
      usage: "image_slot",
      reason:
        "本页可以生成一张独立视觉素材填入图片槽；允许少量必要标签，正式标题、正文和准确数据仍由页面系统叠加。",
    };
  }
  if (pageType === "strategy") {
    return {
      eligible: true,
      usage: "image_slot",
      reason:
        "本页只生成辅助性视觉素材；允许少量步骤标签或方向标注，策略名称、正式逻辑关系和证据标注继续使用程序化图解。",
    };
  }
  if (["masterplan", "plan", "section", "technical"].includes(pageType)) {
    return {
      eligible: true,
      usage: "source_drawing",
      reason:
        "本页允许用户逐图框调用 AI 生成概念性视觉草案；系统不读取、不裁剪、不展示后台素材库或旧汇报图，AI 结果不得冒充可施工图纸、准确尺寸、标注或技术结论。",
    };
  }
  if (pageType === "position" || pageType === "analysis") {
    return {
      eligible: true,
      usage: "programmatic_diagram",
      reason:
        "本页地图、航拍和分析证据继续使用当前项目素材；AI 只填充辅助图片槽，不替代真实区位与图解标注。",
    };
  }
  if (pageType === "comparison") {
    return {
      eligible: true,
      usage: "programmatic_diagram",
      reason:
        "方案比较继续使用同尺度、同规则的程序化框架；AI 只生成辅助图片槽素材，不代替三组方案证据。",
    };
  }
  if (pageType === "data") {
    return {
      eligible: true,
      usage: "programmatic_diagram",
      reason:
        "指标页允许 AI 生成抽象彩色体块 diagram；系统必须把当前页已核验事实连同来源交给模型，模型可以在图中绘入这些准确指标，但不得省略、改写或新增任何数据。",
    };
  }
  return {
    eligible: false,
    usage: "programmatic_diagram",
    reason:
      "目录页以准确章节和页码为主，不需要图片素材；其余页面仍可在选择方向后使用生图功能。",
  };
}

export function migrateLegacyVisualReferenceSelections(
  pagePlan: DesignReportPagePlan,
) {
  const result = structuredClone(pagePlan);
  for (const page of result.pages) {
    const task = page.visual_task;
    if (!task) continue;
    const mutableTask = task as unknown as Record<string, unknown>;
    if (isProjectUnderstandingPage(result, page)) {
      const visualIdIsDisallowed = (visualId: unknown) => {
        if (typeof visualId !== "string") return false;
        const reference = visualReferenceEntriesById.get(visualId);
        return Boolean(
          reference &&
            !visualTypeAllowedInProjectUnderstanding(reference.visual_type),
        );
      };
      const storedVisualIds = [
        ...task.visual_reference_refs,
        task.reference_crop?.visual_id,
        ...(task.slot_reference_crops ?? []).map((crop) => crop.visual_id),
        task.generated_image?.reference_guidance?.visual_id,
        ...(task.generated_images ?? []).map(
          (image) => image.reference_guidance?.visual_id,
        ),
      ];
      const removedDisallowedReference = storedVisualIds.some(
        visualIdIsDisallowed,
      );
      if (removedDisallowedReference) {
        mutableTask.visual_reference_refs = task.visual_reference_refs.filter(
          (visualId) => !visualIdIsDisallowed(visualId),
        );
        delete mutableTask.reference_crop;
        delete mutableTask.slot_reference_crops;
        delete mutableTask.generated_image;
        delete mutableTask.generated_images;
        mutableTask.reference_selection = {
          status: "no_suitable_reference",
          selection_method: "model_semantic_rerank",
          selected_visual_id: null,
          confidence: 0,
          internal_rationale:
            "项目理解章节不得提前使用总平面、楼层平面、立面、剖面或技术成果图，旧匹配已清除并等待重新匹配。",
          evaluated_at: new Date().toISOString(),
        };
        mutableTask.conversation = [
          ...task.conversation,
          {
            round:
              Math.max(
                0,
                ...task.conversation.map((item) => item.round),
              ) + 1,
            role: "assistant",
            content:
              "已清除项目理解章节中提前出现的方案图纸；重新匹配时只使用区位、现状、任务解读、指标和关系分析素材。",
          },
        ];
      }
    }
    if (!mutableTask.visual_intent) {
      mutableTask.visual_intent = inferVisualIntent(page);
    }
    const validVisualTaskStatuses = new Set<VisualTask["status"]>([
      "draft",
      "awaiting_choice",
      "awaiting_materials",
      "ready",
      "approved",
    ]);
    if (
      !validVisualTaskStatuses.has(
        mutableTask.status as VisualTask["status"],
      )
    ) {
      mutableTask.status = task.missing_inputs.length
        ? "awaiting_materials"
        : "ready";
    }
    const inferredIntent = inferVisualIntent(page);
    let migratedIntent = sanitizeStoredVisualIntent(
      mutableTask.visual_intent as VisualIntent,
      inferredIntent,
    );
    mutableTask.visual_intent = migratedIntent;
    const metricBoundaryPage = isMetricBoundaryPage(page);
    const metricTaskNeedsMigration =
      metricBoundaryPage &&
      (task.image_slots.length !== 1 ||
        !task.image_slots.some(
          (slot) => slot.label === "指标约束与功能体量图解",
        ) ||
        !task.visual_intent.graphic_elements.includes(
          "按功能分类的彩色抽象体块",
        ));
    if (metricTaskNeedsMigration) {
      migratedIntent = inferredIntent;
      mutableTask.visual_intent = migratedIntent;
      mutableTask.production_mode = "diagram";
      mutableTask.primary_visual = migratedIntent.graphic_elements[0];
      mutableTask.visual_reference_refs = [
        "VR_URBAN_A3_P017",
        ...task.visual_reference_refs.filter(
          (visualId) => visualId !== "VR_URBAN_A3_P017",
        ),
      ];
      mutableTask.reference_recipe_refs = [
        "URB_RX_006",
        ...task.reference_recipe_refs.filter(
          (recipeId) => recipeId !== "URB_RX_006",
        ),
      ];
      delete mutableTask.reference_crop;
      delete mutableTask.slot_reference_crops;
      delete mutableTask.reference_selection;
      delete mutableTask.generated_image;
      delete mutableTask.generated_images;
      mutableTask.conversation = [
        ...task.conversation,
        {
          round:
            Math.max(
              0,
              ...task.conversation.map((item) => item.round),
            ) + 1,
            role: "assistant",
            content:
              "指标边界页已收敛为一张灰白场地底图、彩色抽象功能体块与真实指标挂接的总览图；旧的多图拆分、无指标体量图和参考匹配已清除。",
        },
      ];
    }
    if (
      isCoreConceptPage(page) &&
      migratedIntent.relationship_to_show !== "atmosphere"
    ) {
      migratedIntent = inferredIntent;
      mutableTask.visual_intent = migratedIntent;
      mutableTask.production_mode = "render_direction";
    }
    mutableTask.primary_visual = migratedIntent.graphic_elements[0];
    let migratedSlots = !isCoreConceptPage(page) &&
      !metricTaskNeedsMigration &&
      getVisualImageSuitability(page.page_type).eligible &&
      Array.isArray(mutableTask.image_slots)
      ? (mutableTask.image_slots as VisualTask["image_slots"])
      : createVisualImageSlots(page, migratedIntent);
    const desiredSlots = createVisualImageSlots(page, migratedIntent);
    if (page.page_type === "summary") {
      // Summary visuals are standalone image assets. Any text, labels, arrows,
      // or diagram legends belong to the page layer, never inside the image.
      migratedSlots = desiredSlots;
    }
    const isLegacyDrawingSlotSet =
      ["masterplan", "plan", "section"].includes(page.page_type) &&
      migratedSlots.length !== desiredSlots.length;
    if (isLegacyDrawingSlotSet) {
      const oldSlots = migratedSlots;
      const remapSlotId = (slotId: string) => {
        const oldIndex = oldSlots.findIndex(
          (slot) => slot.slot_id === slotId,
        );
        return desiredSlots[Math.max(0, oldIndex) + 1]?.slot_id;
      };
      const remapAssets = <T extends { slot_id: string }>(assets: T[]) =>
        assets.flatMap((asset) => {
          const slotId = remapSlotId(asset.slot_id);
          return slotId ? [{ ...asset, slot_id: slotId }] : [];
        });
      if (Array.isArray(mutableTask.generated_images)) {
        mutableTask.generated_images = remapAssets(
          mutableTask.generated_images as NonNullable<
            VisualTask["generated_images"]
          >,
        );
      } else if (task.generated_image && desiredSlots[1]) {
        mutableTask.generated_images = [
          {
            slot_id: desiredSlots[1].slot_id,
            prompt_focus: desiredSlots[1].prompt_focus,
            ...task.generated_image,
          },
        ];
      }
      if (Array.isArray(mutableTask.slot_reference_crops)) {
        mutableTask.slot_reference_crops = remapAssets(
          mutableTask.slot_reference_crops as NonNullable<
            VisualTask["slot_reference_crops"]
          >,
        );
      } else if (task.reference_crop && desiredSlots[1]) {
        mutableTask.slot_reference_crops = [
          {
            slot_id: desiredSlots[1].slot_id,
            ...task.reference_crop,
          },
        ];
      }
      migratedSlots = desiredSlots;
      delete mutableTask.generated_image;
      delete mutableTask.reference_crop;
      delete mutableTask.reference_selection;
      mutableTask.conversation = [
        ...task.conversation,
        {
          round:
            Math.max(
              0,
              ...task.conversation.map((item) => item.round),
            ) + 1,
          role: "assistant",
          content:
            "图纸页已从旧版两张辅助图升级为一张真实主图加两张辅助图；原有辅助素材已保留，主图需要重新匹配。",
        },
      ];
    }
    const isLegacyConceptSlotSet =
      page.page_type === "concept" &&
      migratedSlots.length !== desiredSlots.length;
    if (isLegacyConceptSlotSet) {
      migratedSlots = desiredSlots;
      mutableTask.frame_layout = getVisualFrameLayout(
        page,
        migratedIntent,
        desiredSlots.length,
      );
      delete mutableTask.reference_selection;
      mutableTask.conversation = [
        ...task.conversation,
        {
          round:
            Math.max(
              0,
              ...task.conversation.map((item) => item.round),
            ) + 1,
          role: "assistant",
          content:
            desiredSlots.length === 1
              ? "核心概念页已锁定为一张主视觉与精炼概念文字。"
              : `概念页已按内容关系重构为 ${desiredSlots.length} 个独立图框，并采用稳定的分行或主次编排。`,
        },
      ];
    }
    const legacyGenericSlotLabels = new Set([
      "视觉证据 1",
      "视觉证据 2",
      "视觉证据 3",
      "视觉证据 4",
      "现状条件",
      "关键关系",
      "问题判断",
      "策略动作",
      "作用对象",
      "预期结果",
      "空间底图",
      "专题证据层",
      "关键位置",
      "结论标注",
    ]);
    const needsContextualSlotMigration =
      ["analysis", "position", "strategy", "comparison"].includes(
        page.page_type,
      ) &&
      migratedSlots.some((slot) =>
        legacyGenericSlotLabels.has(slot.label),
      );
    if (needsContextualSlotMigration) {
      migratedSlots = createVisualImageSlots(page, migratedIntent);
      delete mutableTask.reference_crop;
      delete mutableTask.slot_reference_crops;
      delete mutableTask.reference_selection;
      mutableTask.conversation = [
        ...task.conversation,
        {
          round:
            Math.max(
              0,
              ...task.conversation.map((item) => item.round),
            ) + 1,
          role: "assistant",
          content:
            "图框已经按当前页面的具体子证据重新拆分；旧版通用标签及其参考图匹配已失效，需要重新匹配。",
        },
      ];
    }
    mutableTask.image_slots = migratedSlots;
    mutableTask.frame_layout =
      mutableTask.frame_layout ??
      getVisualFrameLayout(page, migratedIntent, migratedSlots.length);
    if (
      task.generated_image &&
      !Array.isArray(mutableTask.generated_images) &&
      migratedSlots[0]
    ) {
      mutableTask.generated_images = [
        {
          slot_id: migratedSlots[0].slot_id,
          prompt_focus: migratedSlots[0].prompt_focus,
          ...task.generated_image,
        },
      ];
    }
    if (
      task.reference_crop &&
      !Array.isArray(mutableTask.slot_reference_crops) &&
      migratedSlots[0]
    ) {
      mutableTask.slot_reference_crops = [
        {
          slot_id: migratedSlots[0].slot_id,
          ...task.reference_crop,
        },
      ];
    }
    if (mutableTask.reference_crop) {
      const legacyCrop = mutableTask.reference_crop as {
        visual_id?: unknown;
        image_url?: unknown;
      };
      const reference =
        typeof legacyCrop.visual_id === "string"
          ? visualReferenceEntriesById.get(legacyCrop.visual_id)
          : undefined;
      if (reference) {
        legacyCrop.image_url =
          versionedVisualReferenceCropUrl(reference);
      }
    }
    if (Array.isArray(mutableTask.slot_reference_crops)) {
      for (const item of mutableTask.slot_reference_crops as Array<{
        visual_id?: unknown;
        image_url?: unknown;
      }>) {
        const reference =
          typeof item.visual_id === "string"
            ? visualReferenceEntriesById.get(item.visual_id)
            : undefined;
        if (reference) {
          item.image_url =
            versionedVisualReferenceCropUrl(reference);
        }
      }
    }
    if (mutableTask.status === "awaiting_choice") {
      mutableTask.status = task.missing_inputs.length
        ? "awaiting_materials"
        : "ready";
    }
    delete mutableTask.options;
    delete mutableTask.selected_option_id;
    mutableTask.draft_output = createVisualDraft(
      mutableTask as unknown as VisualTask,
    );
    if (!task.reference_selection) continue;
    const legacySelection = task.reference_selection as unknown as {
      status?: unknown;
      selected_visual_id?: unknown;
      confidence?: unknown;
      selection_method?: unknown;
      internal_rationale?: unknown;
      evaluated_at?: unknown;
    };
    const confidence = Number(legacySelection.confidence);
    const validMatchedSelection =
      legacySelection.status === "matched" &&
      typeof legacySelection.selected_visual_id === "string" &&
      legacySelection.selected_visual_id.trim().length > 0 &&
      Number.isFinite(confidence);
    const validEmptySelection =
      legacySelection.status === "no_suitable_reference" &&
      legacySelection.selected_visual_id == null;
    if (validMatchedSelection) continue;
    if (validEmptySelection) {
      delete mutableTask.reference_crop;
      delete mutableTask.slot_reference_crops;
      continue;
    }
    mutableTask.reference_selection = {
      status: "no_suitable_reference",
      selection_method: "model_semantic_rerank",
      selected_visual_id: null,
      confidence: Number.isFinite(confidence)
        ? Math.min(1, Math.max(0, confidence))
        : 0,
      internal_rationale:
        typeof legacySelection.internal_rationale === "string" &&
        legacySelection.internal_rationale.trim()
          ? legacySelection.internal_rationale
          : "旧版匹配结果不完整或置信度不足，已停止强制套用参考图。",
      evaluated_at:
        typeof legacySelection.evaluated_at === "string"
          ? legacySelection.evaluated_at
          : new Date().toISOString(),
    };
    delete mutableTask.reference_crop;
    delete mutableTask.slot_reference_crops;
  }
  return result;
}

export function createReferenceCrop(
  task: VisualTask,
  visualId?: string,
): VisualTask["reference_crop"] | undefined {
  const requestedIds = visualId && visualReferenceEntriesById.has(visualId)
    ? [visualId, ...task.visual_reference_refs.filter((id) => id !== visualId)]
    : task.visual_reference_refs;
  const reference = requestedIds
    .map((id) => visualReferenceEntriesById.get(id))
    .find((entry) => entry?.crop_quality.accepted);
  if (!reference) return undefined;
  return {
    status: "selected",
    visual_id: reference.visual_id,
    image_url: versionedVisualReferenceCropUrl(reference),
    background_position: "center",
    crop_zoom: 1,
    selected_at: new Date().toISOString(),
  };
}

export function createSlotReferenceCrop(
  task: VisualTask,
  slotId: string,
  visualId?: string,
): NonNullable<VisualTask["slot_reference_crops"]>[number] | undefined {
  const crop = createReferenceCrop(task, visualId);
  if (!crop) return undefined;
  return {
    slot_id: slotId,
    ...crop,
  };
}

function productionMode(
  pageType: ReportPage["page_type"],
): VisualTask["production_mode"] {
  if (["concept", "comparison"].includes(pageType)) return "concept_sequence";
  if (["rendering", "cover", "section_divider", "summary"].includes(pageType)) {
    return "render_direction";
  }
  if (["masterplan", "plan", "section", "technical"].includes(pageType)) {
    return "source_rework";
  }
  if (["strategy", "analysis", "position", "data", "toc"].includes(pageType)) {
    return "diagram";
  }
  return "mixed";
}

function visualSpecificMissing(page: ReportPage) {
  if (["concept", "strategy", "comparison"].includes(page.page_type)) {
    return ["当前方案的设计判断、空间动作或草图"];
  }
  if (["masterplan", "plan", "section", "technical"].includes(page.page_type)) {
    return ["当前项目对应图纸"];
  }
  if (["rendering", "cover", "section_divider", "summary"].includes(page.page_type)) {
    return ["当前方案模型、效果图或明确视角"];
  }
  if (["position", "analysis"].includes(page.page_type)) {
    return ["可用于绘制的场地底图、地图或航拍"];
  }
  return [];
}

export function inferVisualIntent(page: ReportPage): VisualIntent {
  const conclusion = page.core_message || page.headline_zh;
  const evidenceNeeded = unique([
    ...page.visual_requirements.slice(0, 4),
    ...visualSpecificMissing(page),
  ]).slice(0, 8);
  const shared = {
    conclusion_to_prove: conclusion,
    evidence_needed: evidenceNeeded.length
      ? evidenceNeeded
      : ["当前页核心结论与可核对信息"],
  };
  const base = shared as {
    conclusion_to_prove: string;
    evidence_needed: VisualIntent["evidence_needed"];
  };

  if (isMetricBoundaryPage(page)) {
    return {
      ...base,
      relationship_to_show: "evidence_mapping",
      evidence_needed: [
        "当前项目用地面积及来源",
        "当前项目容积率及来源",
        "当前项目建筑限高及来源",
        "当前项目总建筑面积及分项规模",
      ],
      graphic_elements: [
        "灰白场地或城市模型底图",
        "按功能分类的彩色抽象体块",
        "体块与功能之间的对应关系",
        "面积、容积率、高度和规模指标标注",
      ],
      search_focus: [
        "彩色功能体块指标图解",
        "建筑面积与高度标注",
        "program massing diagram",
        "data table",
        "concept diagram",
        conclusion,
      ],
      layout_logic:
        "以灰白场地模型承载空间关系，以彩色抽象体块区分功能和规模，并把每项已核验指标直接挂接到对应体块；图解负责显示空间与数据关系，页面系统保留标题和正文。",
    };
  }

  if (isSystemRenderingPage(page)) {
    return {
      ...base,
      relationship_to_show: "spatial_relationship",
      evidence_needed: [
        "连续三至五层典型楼层的局部剖切关系",
        "室内空间、楼板与立面围护的交接关系",
        "遮阳、可开启通风构件与环境路径",
      ],
      graphic_elements: [
        "局部立面系统剖切近景",
        "连续三至五层室内空间与楼板",
        "幕墙、水平遮阳与可开启通风构件",
        "太阳辐射与自然通风路径箭头",
      ],
      search_focus: [
        "facade system sectional rendering",
        "局部立面系统剖切渲染",
        "典型楼层幕墙遮阳通风",
        "室内楼板与围护界面近景",
        conclusion,
      ],
      layout_logic:
        "以近距离局部立面系统剖切渲染作为绝对主视觉，仅截取连续三至五层和少量立面开间，展示室内—楼板—幕墙—遮阳—通风的连续关系；不得扩大为整栋建筑或功能分区透视。",
    };
  }

  if (page.page_type === "summary") {
    return {
      ...base,
      relationship_to_show: "hierarchy",
      graphic_elements: [
        "总体鸟瞰或建筑整体效果图",
        "公共空间或入口效果图",
        "重点空间或室内效果图",
        "三项方案设计总结",
      ],
      search_focus: [
        "建筑方案总结页",
        "总体效果图",
        "公共空间效果图",
        "重点空间效果图",
        conclusion,
      ],
      layout_logic:
        "左侧用实际方案结论形成设计总结，右侧三张等高效果图并列排布，三张图的底边严格对齐，依次建立总体、公共空间与重点空间的体验层级。",
    };
  }

  if (page.page_type === "concept") {
    if (isCoreConceptPage(page)) {
      return {
        ...base,
        relationship_to_show: "atmosphere",
        graphic_elements: [
          "全幅背景效果图",
          "核心空间焦点",
          "人物与尺度线索",
          "概念标题留白",
        ],
        search_focus: [
          "建筑概念效果图",
          "全幅背景",
          "空间氛围与尺度",
          conclusion,
        ],
        layout_logic:
          "以一张全幅建筑空间效果图作为页面背景，通过明确空间焦点说明核心概念，并在低干扰区域叠加标题与简短说明。",
      };
    }
    return {
      ...base,
      relationship_to_show: "sequence",
      graphic_elements: ["任务条件", "核心矛盾", "空间动作", "设计结果"],
      search_focus: ["概念推导", "空间动作序列", "体量或空间关系", conclusion],
      layout_logic: "由原因到动作再到结果，形成单向、可追踪的视觉推导链。",
    };
  }
  if (page.page_type === "strategy") {
    return {
      ...base,
      relationship_to_show: "evidence_mapping",
      graphic_elements: ["现状证据", "问题判断", "设计动作", "落位结果"],
      search_focus: ["问题—策略—结果", "策略落位", "证据驱动图解", conclusion],
      layout_logic: "让每个策略动作与其问题依据和图纸落位一一对应。",
    };
  }
  if (["position", "analysis"].includes(page.page_type)) {
    return {
      ...base,
      relationship_to_show: "evidence_mapping",
      graphic_elements: ["空间底图", "专题证据层", "关键位置", "结论标注"],
      search_focus: ["场地证据地图", "专题叠加分析", "空间定位", conclusion],
      layout_logic: "以真实底图为证据载体，逐层叠加信息并收束为一个判断。",
    };
  }
  if (page.page_type === "comparison") {
    return {
      ...base,
      relationship_to_show: "comparison",
      graphic_elements: ["统一评价维度", "并列方案", "差异证据", "比较结论"],
      search_focus: ["同尺度方案比较", "设计证据矩阵", "并列视觉结构", conclusion],
      layout_logic: "所有方案使用同一尺度和同一评价维度，突出可验证差异。",
    };
  }
  if (["masterplan", "plan", "section", "technical"].includes(page.page_type)) {
    return {
      ...base,
      relationship_to_show: "spatial_relationship",
      graphic_elements: ["当前项目主图纸", "关键关系图层", "局部证据", "结论标注"],
      search_focus: ["主图纸证据页", "图纸叠加图解", "关键关系标注", conclusion],
      layout_logic: "当前项目准确图纸占主导，辅助图解只解释与核心结论直接相关的关系。",
    };
  }
  if (["cover", "section_divider", "rendering", "summary"].includes(page.page_type)) {
    return {
      ...base,
      relationship_to_show: "atmosphere",
      graphic_elements: ["主视觉焦点", "空间尺度线索", "必要留白", "核心结论"],
      search_focus: ["建筑主视觉", "空间氛围", "叙事焦点", conclusion],
      layout_logic: "用一个明确视觉焦点建立情绪和尺度，其余区域为标题与结论保留干净留白。",
    };
  }
  if (page.page_type === "toc") {
    return {
      ...base,
      relationship_to_show: "index",
      graphic_elements: ["章节层级", "章节名称", "起始页码", "阅读顺序"],
      search_focus: ["章节索引", "目录信息层级", "阅读导航"],
      layout_logic: "按章节顺序建立清晰索引，不使用装饰性图片干扰阅读。",
    };
  }
  return {
    ...base,
    relationship_to_show: "hierarchy",
    graphic_elements: ["核心结论", "主要证据", "辅助关系", "结论标注"],
    search_focus: ["信息层级", "证据图解", "核心结论", conclusion],
    layout_logic: "以核心结论为主导，按证据重要度建立清晰的主次层级。",
  };
}

export function createVisualTask(
  projectFacts: DesignReportProjectFacts,
  page: ReportPage,
): VisualTask {
  const pageFacts = page.fact_refs
    .map((factId) =>
      projectFacts.facts.find((fact) => fact.fact_id === factId),
    )
    .filter(Boolean);
  const availableInputs = pageFacts.map(
    (fact) =>
      `${fact!.field_path} · ${fact!.source.document_id} P${fact!.source.page}`,
  );
  const missingInputs = unique([
    ...page.missing_information,
    ...(pageFacts.length ? [] : visualSpecificMissing(page)),
  ]);
  const mode = isCoreConceptPage(page)
    ? "render_direction"
    : productionMode(page.page_type);
  const visualIntent = inferVisualIntent(page);
  const projectUnderstanding = page.section_id === "S01";
  const smallMode = isSmallBuildingMode(
    projectFacts.task_mode ?? "large_public_building",
  );
  const imageSuitability = getVisualImageSuitability(page.page_type);
  const imageSlots = smallMode
    ? createSmallModeVisualImageSlots(page)
    : createVisualImageSlots(page, visualIntent);
  const localCultureGuidance = smallMode
    ? localCultureFusionPrompt(projectFacts, page)
    : "";
  const status: VisualTask["status"] = missingInputs.length
    ? "awaiting_materials"
    : "ready";
  const taskBase = {
    page_id: page.page_id,
    status,
    objective: `用当前项目证据把“${page.core_message}”转译为与页面关系匹配的一组可验证视觉证据。`,
    production_mode: mode,
    primary_visual: visualIntent.graphic_elements[0],
    frame_layout: getVisualFrameLayout(
      page,
      visualIntent,
      imageSlots.length,
    ),
    visual_intent: visualIntent,
    image_slots: imageSlots,
    available_inputs: availableInputs,
    missing_inputs: missingInputs,
    generation_steps: [
      "理解本页唯一要证明的结论",
      "判断需要呈现的关系与证据类型",
      "形成 Graphic 元素、检索语义和版面逻辑",
      `按 ${imageSlots.length || 1} 个实际图框拆分独立图片任务`,
      smallMode
        ? "小型建筑/装置管线不检索、不展示大型公共建筑历史参考图"
        : "视觉任务单阶段只建立空图框，不检索或展示历史参考图",
      smallMode
        ? "用户点选某一图框后，系统直接依据任务书事实、已有设计方向、页面文案和图框比例调用图像模型"
        : "用户点选某一图框后，系统才调用图像模型；生图只依据当前项目事实、已确认提案、页面文案和图框比例",
      ...(localCultureGuidance
        ? ["调用本土文化融合 Skill，把城市文化作为待确认设计提案转译为材料、动作、色彩与场景，不生成历史建筑复刻"]
        : []),
      "逐一回填 A3 Graphic 图框并检查图文一致性",
    ],
    constraints: [
      "历史素材库和公司汇报文件中的图片禁止进入页面、任务单、提示词、模型输入或导出文件",
      ...(localCultureGuidance ? [localCultureGuidance] : []),
      "没有来源页码和原文引用的数字或设计结论不得进入图面",
      ...(isMetricBoundaryPage(page)
        ? [
            "本页不得使用无数字标注的纯体量效果图；主图必须同时出现抽象彩色功能体块与当前项目已核验的面积、容积率、高度或规模指标",
            "历史图中的功能名称和数值只用于理解图解语法，严禁复制；图面数字必须逐项来自当前页 fact_refs",
          ]
        : []),
      ...(isSystemRenderingPage(page)
        ? [
            "system rendering 在本项目中专指局部立面系统剖切渲染，不是整栋建筑剖透视、建筑体量轴测或功能分区效果图",
            "画面必须近距离截取连续三至五层典型楼层和一至两个立面开间，清楚展示室内、楼板、幕墙、遮阳与自然通风路径",
            "严禁整栋塔楼全景、城市鸟瞰、酒店公寓办公商业的整栋彩色功能分区、核心筒总览或 section perspective",
          ]
        : []),
      ...(projectUnderstanding
        ? [
            "项目理解章节只使用区位、现状、任务解读、指标和关系分析素材，严禁提前出现总平面、楼层平面、立面、剖面或技术成果图",
          ]
        : []),
    ],
    ai_generation_policy:
      imageSuitability.eligible
        ? imageSuitability.reason
        : `${imageSuitability.reason} 图面结论必须由当前项目证据支撑。`,
    reference_recipe_refs: smallMode
      ? []
      : isMetricBoundaryPage(page)
      ? [
          "URB_RX_006",
          ...(page.experience_recipe_refs ?? []).filter(
            (recipeId) => recipeId !== "URB_RX_006",
          ),
        ]
      : isSystemRenderingPage(page)
        ? unique([
            "HQE_RX_068",
            ...(page.experience_recipe_refs ?? []),
          ])
      : page.experience_recipe_refs ?? [],
    visual_reference_refs: [],
    conversation: [
      {
        round: 1,
        role: "assistant" as const,
        content: `已从 P${String(page.display_page_number ?? "").padStart(2, "0")} 的核心结论、证据关系和素材条件形成视觉需求判断；图片槽保持为空，等待用户逐张生成。`,
      },
    ],
  };

  return {
    ...taskBase,
    draft_output: createVisualDraft(taskBase as unknown as VisualTask),
  } as unknown as VisualTask;
}

export function normalizeSingleSectionImagePage(page: ReportPage) {
  if (!isSingleSectionImagePage(page) || !page.visual_task) return page;
  const task = page.visual_task;
  const imageSlots = createVisualImageSlots(page, task.visual_intent);
  const firstGeneratedImage =
    task.generated_images?.[0] ?? task.generated_image;
  const generatedImages = firstGeneratedImage
    ? [
        {
          ...firstGeneratedImage,
          slot_id: imageSlots[0]?.slot_id ?? "S1",
        },
      ]
    : undefined;
  const generatedImage = generatedImages?.length
    ? legacyGeneratedImageFromSlots(
        generatedImages as NonNullable<VisualTask["generated_images"]>,
        task.generated_image,
      )
    : undefined;
  return {
    ...page,
    visual_task: {
      ...task,
      image_slots: imageSlots,
      frame_layout: "single" as const,
      generated_images: generatedImages,
      generated_image: generatedImage,
      slot_reference_crops: task.slot_reference_crops?.slice(0, 1),
    },
  } as unknown as ReportPage;
}

function visualDraftFormat(
  mode: VisualTask["production_mode"],
): NonNullable<VisualTask["draft_output"]>["format"] {
  if (mode === "concept_sequence") return "concept_sequence";
  if (mode === "source_rework") return "drawing_rework_plan";
  if (mode === "render_direction") return "render_shot_list";
  return "diagram_wireframe";
}

export function createVisualDraft(
  task: VisualTask,
): NonNullable<VisualTask["draft_output"]> {
  const evidenceRefs = task.available_inputs.slice(0, 4);
  const zoneItems = task.visual_intent.graphic_elements
    .slice(0, 6)
    .map((content, index) => ({
    zone_id: `Z${index + 1}`,
    label: index === 0 ? "主视觉" : `辅助区 ${index}`,
    content,
    evidence_refs: evidenceRefs,
    }));
  const zones = zoneItems as unknown as NonNullable<
    VisualTask["draft_output"]
  >["zones"];
  return {
    status: task.missing_inputs.length ? "conceptual" : "material_ready",
    title: task.primary_visual,
    format: visualDraftFormat(task.production_mode),
    description: task.visual_intent.layout_logic,
    zones,
    prompt_zh: `横版 A3 建筑设计汇报页面。围绕“${task.visual_intent.conclusion_to_prove}”组织画面，按“${task.visual_intent.graphic_elements.join("—")}”建立主次层级；${task.visual_intent.layout_logic} 使用当前项目证据，不复制历史项目内容。`,
    disclaimer: task.missing_inputs.length
      ? `当前为结构草案，仍缺：${task.missing_inputs.join("、")}。不得作为最终设计成果。`
      : "当前为可进入图解或参考图制作的构图草案，最终图面仍需与当前项目图纸核对。",
  };
}

export function refineVisualTask(
  task: VisualTask,
  message?: string,
): VisualTask {
  const trimmedMessage = message?.trim() ?? "";
  const round =
    Math.max(0, ...task.conversation.map((item) => item.round)) + 1;
  const conversation = [...task.conversation];

  if (trimmedMessage) {
    conversation.push({
      round,
      role: "user",
      content: trimmedMessage,
    });
  }

  if (trimmedMessage) {
    conversation.push({
      round,
      role: "assistant",
      content:
        "已记录补充要求；系统将重新理解本页要证明的内容，图片槽继续保持为空，等待逐张生成。",
    });
  }

  const {
    generated_image: previousGeneratedImage,
    generated_images: previousGeneratedImages,
    image_prompt: previousImagePrompt,
    reference_crop: previousReferenceCrop,
    slot_reference_crops: previousSlotReferenceCrops,
    reference_selection: previousReferenceSelection,
    ...taskWithoutVisualAsset
  } = task;
  void previousGeneratedImage;
  void previousGeneratedImages;
  void previousImagePrompt;
  void previousReferenceCrop;
  void previousSlotReferenceCrops;
  void previousReferenceSelection;
  const baseTask = trimmedMessage ? taskWithoutVisualAsset : task;

  return {
    ...baseTask,
    status: task.missing_inputs.length ? "awaiting_materials" : "ready",
    draft_output: createVisualDraft(task),
    constraints: trimmedMessage
      ? unique([...task.constraints, `用户补充：${trimmedMessage}`])
      : task.constraints,
    conversation,
  };
}

export function updatePageVisualTask(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  pageId: string,
  message?: string,
  rebuildFromCurrentPage = false,
) {
  const result = structuredClone(pagePlan);
  const page = result.pages.find((candidate) => candidate.page_id === pageId);
  if (!page) throw new Error(`Page not found: ${pageId}`);

  if (
    rebuildFromCurrentPage ||
    isMetricBoundaryPage(page) ||
    isSystemRenderingPage(page)
  ) {
    const previousTask = page.visual_task;
    const specializedTask = createVisualTask(projectFacts, page);
    if (rebuildFromCurrentPage && previousTask) {
      const previousSlots = new Map(
        previousTask.image_slots.map((slot) => [slot.slot_id, slot.label]),
      );
      const compatibleSlotIds = new Set(
        specializedTask.image_slots
          .filter(
            (slot) => previousSlots.get(slot.slot_id) === slot.label,
          )
          .map((slot) => slot.slot_id),
      );
      const compatibleImages = previousTask.generated_images?.filter(
        (image) => compatibleSlotIds.has(image.slot_id),
      );
      if (compatibleImages?.length) {
        specializedTask.generated_images =
          compatibleImages as unknown as NonNullable<
            VisualTask["generated_images"]
          >;
      } else {
        delete specializedTask.generated_images;
      }
      const firstCompatibleImage = specializedTask.generated_images?.[0];
      specializedTask.generated_image = firstCompatibleImage
        ? {
            status: firstCompatibleImage.status,
            model: firstCompatibleImage.model,
            prompt_zh: firstCompatibleImage.prompt_zh,
            size: firstCompatibleImage.size,
            image_url: firstCompatibleImage.image_url,
            generated_at: firstCompatibleImage.generated_at,
            provider_response_id: firstCompatibleImage.provider_response_id,
            image_count: firstCompatibleImage.image_count,
            attempt_count: firstCompatibleImage.attempt_count,
            reference_guidance: firstCompatibleImage.reference_guidance,
            disclaimer: firstCompatibleImage.disclaimer,
          }
        : undefined;
    }
    page.visual_task = message
      ? refineVisualTask(specializedTask, message)
      : specializedTask;
  } else {
    page.visual_task = page.visual_task
      ? refineVisualTask(page.visual_task, message)
      : createVisualTask(projectFacts, page);
  }

  page.visual_task = normalizeSingleSectionImagePage(page).visual_task;

  return result;
}
