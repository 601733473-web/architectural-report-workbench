import type { DesignReportPagePlan } from "@/app/generated/contracts";

type PageType = DesignReportPagePlan["pages"][number]["page_type"];

export const pageTypeEnglishLabels: Record<PageType, string> = {
  cover: "DESIGN REPORT",
  toc: "CONTENTS",
  section_divider: "SECTION",
  position: "SITE CONTEXT",
  analysis: "ANALYSIS",
  strategy: "DESIGN STRATEGY",
  concept: "DESIGN CONCEPT",
  comparison: "OPTION COMPARISON",
  masterplan: "MASTERPLAN",
  plan: "PLAN",
  section: "SECTION",
  rendering: "SPATIAL EXPERIENCE",
  technical: "TECHNICAL DESIGN",
  data: "KEY METRICS",
  summary: "DESIGN SUMMARY",
};

const knownTranslations: Record<string, string> = {
  开篇: "OPENING",
  项目理解: "PROJECT UNDERSTANDING",
  核心议题与规划策略: "KEY ISSUES & PLANNING STRATEGIES",
  设计概念: "DESIGN CONCEPT",
  立体街道: "VERTICAL STREET",
  立体连廊: "VERTICAL LINK",
  空间与功能落实: "SPATIAL & FUNCTIONAL DEVELOPMENT",
  技术与实施: "TECHNICAL DEVELOPMENT & DELIVERY",
  方案总结: "DESIGN SUMMARY",
  目录: "CONTENTS",
  以明确指标建立设计边界: "DEFINING DESIGN BOUNDARIES WITH KEY METRICS",
  从城市关系识别场地机会: "IDENTIFYING SITE OPPORTUNITIES IN THE URBAN CONTEXT",
  从场地周边识别开放界面: "IDENTIFYING OPEN INTERFACES AROUND THE SITE",
  识别场地限制与建设条件: "IDENTIFYING SITE CONSTRAINTS AND DEVELOPMENT CONDITIONS",
  以交通要求梳理到达秩序: "ORGANIZING ARRIVAL THROUGH TRAFFIC REQUIREMENTS",
  从功能要求理解空间构成: "TRANSLATING PROGRAM REQUIREMENTS INTO SPATIAL STRUCTURE",
  以评审重点校准汇报方向: "ALIGNING THE REPORT WITH EVALUATION PRIORITIES",
  建立任务要求响应矩阵: "BUILDING A TASK-RESPONSE MATRIX",
  聚焦必须回答的核心议题: "FOCUSING ON THE KEY QUESTIONS",
  以策略链统领设计响应: "COORDINATING DESIGN RESPONSES THROUGH A STRATEGY CHAIN",
  以公共性组织空间骨架: "ORGANIZING THE SPATIAL FRAMEWORK AROUND PUBLIC VALUE",
  以城市关系回应场地条件: "RESPONDING TO SITE CONDITIONS THROUGH URBAN CONNECTIONS",
  以功能复合提升使用效率: "IMPROVING EFFICIENCY THROUGH MIXED-USE ORGANIZATION",
  以分流原则保障交通效率: "ENSURING TRAFFIC EFFICIENCY THROUGH SEPARATED FLOWS",
  以核心概念统领空间动作: "GUIDING SPATIAL MOVES WITH A CORE CONCEPT",
  以城市意象建立概念母题: "BUILDING THE CONCEPT FROM URBAN IDENTITY",
  以体量生成回应场地条件: "RESPONDING TO SITE CONDITIONS THROUGH MASSING",
  以界面生成统一空间表达: "UNIFYING SPATIAL EXPRESSION THROUGH INTERFACE DESIGN",
  以方案比选明确取舍依据: "CLARIFYING DESIGN CHOICES THROUGH OPTION COMPARISON",
  以总体布局统筹场地关系: "COORDINATING SITE RELATIONSHIPS THROUGH THE MASTERPLAN",
  以开放空间串联公共体验: "CONNECTING PUBLIC EXPERIENCE THROUGH OPEN SPACE",
  以竖向分区组织功能关系: "ORGANIZING FUNCTIONS THROUGH VERTICAL ZONING",
  以首层平面承接公共活动: "ACCOMMODATING PUBLIC LIFE ON THE GROUND FLOOR",
  以典型层平面验证使用效率: "TESTING OPERATIONAL EFFICIENCY WITH TYPICAL FLOOR PLANS",
  以剖面关系建立空间层次: "BUILDING SPATIAL HIERARCHY THROUGH SECTIONAL RELATIONSHIPS",
  以重点空间呈现完整体验: "PRESENTING THE COMPLETE EXPERIENCE THROUGH KEY SPACES",
  以立面策略回应空间与环境: "RESPONDING TO SPACE AND CLIMATE THROUGH FACADE STRATEGY",
  以系统剖切渲染整合建筑关系: "INTEGRATING FACADE AND ENVIRONMENTAL SYSTEMS THROUGH A SECTIONAL RENDERING",
  "整合材料、构造与环境性能": "INTEGRATING MATERIALS, CONSTRUCTION AND ENVIRONMENTAL PERFORMANCE",
  以可追溯证据收束方案价值: "SUMMARIZING DESIGN VALUE WITH TRACEABLE EVIDENCE",
  方案设计总结: "DESIGN SUMMARY",
  汇报目录: "REPORT CONTENTS",
  规划策略: "PLANNING STRATEGY",
  方案比较: "OPTION COMPARISON",
  "三类产品与三件装置的主题矩阵": "THREE PRODUCT THEMES & THREE INSTALLATIONS",
  "共同设计语言：轻国风、强互动、可传播":
    "SHARED DESIGN LANGUAGE: LIGHT GUOFENG, STRONG INTERACTION & SHAREABILITY",
  "从看见到参与：现场体验如何发生":
    "FROM SEEING TO PARTICIPATING: HOW THE EXPERIENCE UNFOLDS",
  "装置1｜山泉水的“真”": "INSTALLATION 1 | THE TRUTH OF SPRING WATER",
  "装置1｜从源头联想到产品":
    "INSTALLATION 1 | FROM SOURCE TO PRODUCT",
  "装置1｜搭建、赠送与复用边界":
    "INSTALLATION 1 | SETUP, GIFTING & REUSE BOUNDARIES",
  "装置2｜泡茶水的“甜”": "INSTALLATION 2 | THE SWEETNESS OF TEA WATER",
  "装置2｜让“泡茶甜”成为互动体验":
    "INSTALLATION 2 | MAKING TEA-WATER SWEETNESS INTERACTIVE",
  "装置2｜产品发布会的体验节点":
    "INSTALLATION 2 | PRODUCT LAUNCH EXPERIENCE NODE",
  "装置3｜斗器大会·瓷之器":
    "INSTALLATION 3 | DOUQI FESTIVAL · PORCELAIN AS VESSEL",
  "装置3｜从瓷都文化到共创现场":
    "INSTALLATION 3 | FROM PORCELAIN CULTURE TO CO-CREATION",
  "装置3｜共创、赠品与年度复用":
    "INSTALLATION 3 | CO-CREATION, GIFTS & ANNUAL REUSE",
  "三件装置的体验与传播分工":
    "THREE INSTALLATIONS: EXPERIENCE & COMMUNICATION ROLES",
  "轻国风少女 IP：从平面形象到现场角色":
    "LIGHT GUOFENG GIRL IP: FROM GRAPHIC TO LIVE CHARACTER",
  "IP与三件装置的现场联动":
    "IP & THE THREE INSTALLATIONS: LIVE ACTIVATION",
  "搭建、收起与明年复用": "SETUP, PACK-DOWN & NEXT-YEAR REUSE",
  重点空间: "KEY SPACE",
  功能指标: "PROGRAM METRICS",
  技术设计: "TECHNICAL DESIGN",
  图纸与空间证据: "DRAWINGS & SPATIAL EVIDENCE",
  城市关系: "SITE CONTEXT",
  建筑设计汇报: "ARCHITECTURAL DESIGN REPORT",
  草案: "DRAFT",
  预览: "PREVIEW",
};

export function englishPresentationText(
  value: string | undefined,
  fallback = "",
) {
  const clean = value?.trim() ?? "";
  if (!clean) return fallback;
  if (knownTranslations[clean]) return knownTranslations[clean];
  if (knownTranslations[`以${clean}`]) return knownTranslations[`以${clean}`];
  if (!/[\u3400-\u9fff]/.test(clean)) return clean;
  return fallback;
}

export function englishCoreFallback(pageType: PageType) {
  const messages: Record<PageType, string> = {
    cover: "A fact-grounded architectural design report.",
    toc: "The report is organized by chapters and page sequence.",
    section_divider: "This section establishes the next stage of the design argument.",
    position: "Urban context and site connections define the design opportunity.",
    analysis: "Current project evidence establishes the conditions and relationships shown on this page.",
    strategy: "The strategy translates project requirements into spatial actions that can be verified by drawings.",
    concept: "The design concept is developed through explicit and verifiable spatial moves.",
    comparison: "The options are compared through spatial value, functional efficiency and delivery constraints.",
    masterplan: "The masterplan coordinates buildings, open space, access and urban interfaces.",
    plan: "The plan verifies functional organization, circulation and spatial efficiency.",
    section: "The section verifies vertical circulation, spatial hierarchy and key relationships.",
    rendering: "The key view communicates the intended spatial experience.",
    technical: "Technical systems support the spatial concept and its implementation.",
    data: "Verified project metrics define the design boundary.",
    summary: "The conclusion consolidates design value supported by facts and drawings.",
  };
  return messages[pageType];
}

export function englishLabelFallback(pageType: PageType, index: number) {
  if (pageType === "summary") {
    return [
      "URBAN & SITE RESPONSE",
      "SPATIAL & FUNCTIONAL ORGANIZATION",
      "PUBLIC EXPERIENCE & ENVIRONMENT",
    ][index] ?? `DESIGN SUMMARY ${String(index + 1).padStart(2, "0")}`;
  }
  const singular: Record<PageType, string> = {
    cover: "PROJECT IDENTITY",
    toc: "CHAPTER",
    section_divider: "SECTION",
    position: "CONTEXT EVIDENCE",
    analysis: "ANALYSIS EVIDENCE",
    strategy: "STRATEGY",
    concept: "CONCEPT MOVE",
    comparison: "OPTION",
    masterplan: "MASTERPLAN EVIDENCE",
    plan: "PLAN EVIDENCE",
    section: "SECTION EVIDENCE",
    rendering: "SPATIAL VIEW",
    technical: "TECHNICAL EVIDENCE",
    data: "KEY METRIC",
    summary: "DESIGN VALUE",
  };
  return `${singular[pageType]} ${String(index + 1).padStart(2, "0")}`;
}
