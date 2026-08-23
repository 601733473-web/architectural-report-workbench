import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  createStructuredResponse,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";

type SmallPage = DesignReportPagePlan["pages"][number];

const buildabilityReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "decision", "issues", "optimizations", "verification_items"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    decision: {
      enum: ["buildable", "buildable_with_optimization", "redesign_required"],
    },
    issues: { type: "array", items: { type: "string" }, maxItems: 12 },
    optimizations: { type: "array", items: { type: "string" }, maxItems: 12 },
    verification_items: { type: "array", items: { type: "string" }, maxItems: 12 },
  },
} as const;

export type SmallScaleBuildabilityReview = {
  score: number;
  decision: "buildable" | "buildable_with_optimization" | "redesign_required";
  issues: string[];
  optimizations: string[];
  verification_items: string[];
};

function projectReality(projectFacts: DesignReportProjectFacts) {
  const corpus = projectFacts.facts
    .filter((fact) => fact.status !== "superseded" && fact.status !== "conflict")
    .map((fact) => `${fact.field_path} ${String(fact.value_raw)}`)
    .join("；");
  return {
    likely_project_type: /装置|展亭|快闪|展陈/u.test(corpus)
      ? "temporary_or_demountable_installation"
      : "small_scale_building",
    likely_environment: /室外|地标|广场|户外|滨水/u.test(corpus)
      ? "outdoor_or_exposed"
      : /室内/u.test(corpus)
        ? "indoor"
        : "environment_unknown",
    likely_lifespan: /收起|明年|复用|活动|开幕式/u.test(corpus)
      ? "event_cycle_with_reuse"
      : "lifespan_unknown",
    public_access: /观众|游客|公众|互动|参与/u.test(corpus)
      ? "publicly_accessible"
      : "access_unknown",
  };
}

function pageFocus(page?: SmallPage) {
  if (!page) return "整套方案";
  if (page.page_type === "concept") return "形态、结构系统与模块合理化";
  if (page.page_type === "rendering") {
    return "真实厚度、支撑、锚固、人物接触与维护可达性";
  }
  if (page.page_type === "technical") {
    return "构件、连接、预制、运输、装配、排水、收纳与复用";
  }
  return "与当前页面表达任务相匹配的建造性证据";
}

export function smallScaleBuildabilityPrompt(
  projectFacts: DesignReportProjectFacts,
  page?: SmallPage,
) {
  const reality = projectReality(projectFacts);
  return [
    "Small-Scale Architecture & Installation Buildability Skill（仅小型建筑/装置管线）：",
    `项目现实判断：${JSON.stringify(reality)}`,
    `当前检查焦点：${pageFocus(page)}`,
    "每个主要形式必须能解释为：形式→结构系统→构件→材料→连接→加工→运输→现场装配→锚固→维护。",
    "优先一个清晰主结构系统和少量重复构件；以标准件、标准加工件和有限定制件为主，把特殊加工集中在最有感知价值的位置。",
    "优先平面或单曲构件；双曲或自由曲面必须能通过折面、条带、三角化或平板分片实现。不得出现无限薄、无支撑、无落地、无法运输、无法装配或无法维护的造型。",
    "室外方案必须考虑抗风稳定、地面连接、排水路径、材料耐候和公众接触安全；临时或复用装置优先工厂预制、现场干式装配、可拆分运输和分类收纳。",
    "不执行或伪造结构计算，不生成精确荷载、杆件尺寸、基础尺寸、价格或法规合规结论。信息不足时写‘概念假设’‘需工程师复核’或‘需造价复核’。",
    "建造性优化必须保留轮廓、空间体验、光影、序列、取景和材料氛围，不得把设计退化为无识别度的通用构筑物。",
  ].join("\n");
}

export async function validateSmallScaleBuildabilityWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const response = await createStructuredResponse<SmallScaleBuildabilityReview>({
    name: "small_scale_buildability_review",
    schema: buildabilityReviewSchema,
    instructions: [
      smallScaleBuildabilityPrompt(projectFacts),
      "按以下权重评分：结构逻辑20、材料现实15、连接逻辑15、加工15、运输与装配10、耐候与耐久10、成本控制10、维护与安全5。",
      "85—100为buildable；70—84为buildable_with_optimization；低于70为redesign_required。不要因为缺少施工图而扣分，但必须识别概念层面无法解释的形式。",
      "任务书没有给出的精确尺寸、货车规格、节点详图、设备型号、给排水接法、材料牌号、法规或工程计算，只能列入 verification_items，不能仅因这些信息尚待深化就判定方案不可建造或大幅扣分。不要擅自要求把具体模数、材料替换、RFID/NFC、围挡、食品接触等级等新设计写入最终方案。只有当前方案明确承诺了无法成立的结构、湿作业、用水、公众安全或即时交付机制时，才把它列为 issue。",
      "只审查小型建筑/装置建造性，不要求大型建筑的平面、剖面、系统或流线图。只返回JSON。",
    ].join("\n"),
    content: [
      {
        type: "input_text",
        text: JSON.stringify({
          project_reality: projectReality(projectFacts),
          facts: projectFacts.facts
            .filter((fact) => fact.status !== "superseded" && fact.status !== "conflict")
            .map((fact) => ({
              field_path: fact.field_path,
              value: fact.value_raw,
              source_page: fact.source.page,
            })),
          pages: pagePlan.pages.map((page) => ({
            page_id: page.page_id,
            page_type: page.page_type,
            headline: page.headline_zh,
            body: page.body_zh || page.body_copy,
            callouts: (page.callouts ?? []).map((callout) => callout.label_zh),
            visual_requirements: page.visual_requirements,
            image_slots: page.visual_task?.image_slots.map((slot) => ({
              label: slot.label,
              purpose: slot.purpose,
            })),
          })),
        }),
      },
    ],
    reasoningEffort: "high",
    runtimeOverride,
    timeoutMs: 90_000,
    maxAttempts: 1,
  });
  return { ...response.value, call: response.call };
}
