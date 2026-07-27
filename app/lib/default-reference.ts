import type { InputDocument } from "@/app/lib/pipeline";

export const DEFAULT_REFERENCE_ID = "SYS_REFERENCE_DK05_PRESENTATION";

/**
 * Isolated style profile derived from the user's 109-page A3 presentation.
 * It intentionally contains no project metrics, design claims, company names,
 * or other facts that could leak into a new project's evidence library.
 */
export const defaultReferenceDocument: InputDocument = {
  document_id: DEFAULT_REFERENCE_ID,
  file_name: "26_0610 PRESENTATION_LR.pdf",
  role: "reference_style",
  version_or_date: "2026-06-10",
  authority_rank: 6,
  page_count: 109,
  text: `===== PAGE 2 =====
推荐章节结构：项目理解、规划策略、设计概念、空间与功能落实、技术支撑、方案总结。
表达风格：横版 A3、中英双语、一页一个核心结论，以短标题配合大比例图像。
===== PAGE 4 =====
页型节奏：项目理解先用城市区位与场地关系建立背景，再进入规划指标和核心问题。
版面规则：分析页以白底或深色航拍底图承载图解，左上角保持章节定位。
===== PAGE 9 =====
页型节奏：方案比选采用并列卡片或分栏布局，每个选项同时说明优点、局限和取舍。
===== PAGE 11 =====
页型节奏：规划策略采用连续编号的策略链，每项由短标题、关键动作和一张主图组成。
===== PAGE 26 =====
版面规则：概念页使用深色全幅背景、居中概念名和短篇幅双语阐释，文字不与分析图争夺层级。
===== PAGE 39 =====
视觉比例：功能指标页以轴测或体量分解图为主，指标卡作为辅助，视觉占比高于正文。
===== PAGE 42 =====
版面规则：重点空间与效果页采用大图主导，底部深色文字带收束空间价值。
===== PAGE 45 =====
视觉比例：平面页以图纸为主、场景图为辅，用统一色彩和短标签标记流线与功能。
===== PAGE 75 =====
页型节奏：技术页在设计叙事之后集中呈现幕墙、材料与构造，不提前作无证据承诺。
===== PAGE 96 =====
表达风格：章节过渡页保持克制，使用全幅背景与大号章节标题；总结页只回收前文已经证明的价值。`,
};

export function isDefaultReference(documentId: string) {
  return documentId === DEFAULT_REFERENCE_ID;
}
