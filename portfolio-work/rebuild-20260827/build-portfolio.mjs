import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "C:/Users/60173/Documents/设计汇报文本Agent/output/AI产品经理作品集_建筑设计汇报文本Agent.pptx";
const PREVIEW = "C:/Users/60173/Documents/设计汇报文本Agent/portfolio-work/rebuild-20260827/rendered";
const W = 1280;
const H = 720;
const C = {
  ink: "#17201D",
  text: "#24312C",
  muted: "#6D7972",
  paper: "#F7F8F5",
  panel: "#E8EDE9",
  rule: "#C7D0CA",
  accent: "#D95D38",
  accentSoft: "#F0D7CE",
  green: "#365947",
  greenSoft: "#DDE8DF",
  blue: "#7898A9",
  blueSoft: "#E3EDF1",
  white: "#FFFFFF",
};

async function writeBlob(path, blob) {
  await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

function shape(slide, geometry, name, left, top, width, height, fill = "none", lineFill = "none", lineWidth = 0) {
  return slide.shapes.add({
    geometry,
    name,
    position: { left, top, width, height },
    fill,
    line: { style: "solid", fill: lineFill, width: lineWidth },
  });
}

function rect(slide, name, left, top, width, height, fill, lineFill = "none", lineWidth = 0) {
  return shape(slide, "rect", name, left, top, width, height, fill, lineFill, lineWidth);
}

function text(slide, name, value, left, top, width, height, style = {}) {
  const item = shape(slide, "textbox", name, left, top, width, height);
  item.text = value;
  item.text.style = {
    fontFamily: "Arial",
    fontSize: 18,
    color: C.text,
    alignment: "left",
    verticalAlignment: "middle",
    breakLine: false,
    ...style,
  };
  return item;
}

function rule(slide, name, left, top, width, color = C.rule, height = 2) {
  return rect(slide, name, left, top, width, height, color);
}

function header(slide, page, kicker, section, dark = false) {
  const muted = dark ? "#B9C7BF" : C.muted;
  const ruleColor = dark ? "#405249" : C.rule;
  text(slide, `page-${page}`, String(page).padStart(2, "0"), 72, 32, 64, 24, { fontSize: 14, bold: true, color: C.accent });
  text(slide, `kicker-${page}`, kicker.toUpperCase(), 148, 32, 650, 24, { fontSize: 13, bold: true, color: muted, letterSpacing: 1.1 });
  text(slide, `section-${page}`, section.toUpperCase(), 930, 32, 278, 24, { fontSize: 13, color: muted, alignment: "right", letterSpacing: 0.9 });
  rule(slide, `header-rule-${page}`, 72, 72, 1136, ruleColor, 1);
}

function footer(slide, page, dark = false) {
  rule(slide, `footer-rule-${page}`, 72, 676, 1136, dark ? "#405249" : C.rule, 1);
  text(slide, `footer-${page}`, "AI PRODUCT MANAGER · ARCHITECTURAL REPORT AGENT", 72, 686, 650, 18, { fontSize: 11, bold: true, color: dark ? "#AAB8B0" : C.muted, letterSpacing: 0.9 });
  text(slide, `footer-page-${page}`, String(page).padStart(2, "0"), 1120, 686, 88, 18, { fontSize: 11, bold: true, color: dark ? C.accent : C.muted, alignment: "right" });
}

function title(slide, name, value, subtitle = "") {
  text(slide, name, value, 72, 112, 1136, 58, { fontSize: 43, bold: true, color: C.ink, lineSpacingMultiple: 0.95 });
  if (subtitle) text(slide, `${name}-subtitle`, subtitle, 74, 178, 1120, 34, { fontSize: 19, color: C.muted });
}

function darkTitle(slide, name, value, subtitle = "") {
  text(slide, name, value, 72, 122, 900, 110, { fontSize: 48, bold: true, color: C.white, lineSpacingMultiple: 0.94 });
  if (subtitle) text(slide, `${name}-subtitle`, subtitle, 76, 252, 820, 48, { fontSize: 20, color: "#D3DFD7" });
}

function flowNode(slide, name, x, y, w, h, heading, body, fill = C.panel, headingColor = C.ink) {
  rect(slide, `${name}-surface`, x, y, w, h, fill, C.rule, 1);
  text(slide, `${name}-heading`, heading, x + 20, y + 14, w - 40, 34, { fontSize: 22, bold: true, color: headingColor });
  text(slide, `${name}-body`, body, x + 20, y + 56, w - 40, h - 70, { fontSize: 16, color: C.muted, lineSpacingMultiple: 1.06 });
}

function arrow(slide, name, x, y, w, color = C.accent) {
  rect(slide, `${name}-line`, x, y, w - 14, 3, color);
  rect(slide, `${name}-head`, x + w - 18, y - 5, 18, 13, color);
}

function bullet(slide, name, heading, body, x, y, width, color = C.green) {
  rect(slide, `${name}-mark`, x, y + 9, 10, 10, color);
  text(slide, `${name}-heading`, heading, x + 24, y, width - 24, 30, { fontSize: 22, bold: true, color: C.ink });
  text(slide, `${name}-body`, body, x + 24, y + 34, width - 24, 44, { fontSize: 17, color: C.muted, lineSpacingMultiple: 1.05 });
}

function metric(slide, name, value, label, x, y, width, fill, color = C.ink) {
  rect(slide, `${name}-surface`, x, y, width, 104, fill);
  text(slide, `${name}-value`, value, x + 20, y + 14, width - 40, 42, { fontSize: 31, bold: true, color });
  text(slide, `${name}-label`, label, x + 20, y + 62, width - 40, 26, { fontSize: 16, color: C.muted });
}

function makeSlides() {
  const p = Presentation.create({ slideSize: { width: W, height: H } });

  // 01 — Product thesis
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    rect(s, "cover-accent", 72, 72, 14, 576, C.accent);
    text(s, "cover-kicker", "AI PRODUCT MANAGER · WORK SAMPLE", 120, 104, 620, 28, { fontSize: 16, bold: true, color: "#B9C7BF", letterSpacing: 1.4 });
    text(s, "cover-title", "把任务书变成\n可交付的设计决策", 120, 184, 820, 168, { fontSize: 58, bold: true, color: C.white, lineSpacingMultiple: 0.91 });
    text(s, "cover-sub", "建筑设计汇报文本 Agent · 双管线生成式工作台", 124, 404, 820, 38, { fontSize: 24, color: "#D8E2DB" });
    rule(s, "cover-rule", 124, 494, 430, C.accent, 3);
    text(s, "cover-note", "不是生成一段话，而是把事实、方向、页面、图像与交付串成一条可检查、可修改、可恢复的产品链路。", 124, 520, 720, 58, { fontSize: 18, color: "#AAB8B0", lineSpacingMultiple: 1.08 });
    text(s, "cover-mark", "01", 1030, 570, 120, 70, { fontSize: 54, bold: true, color: C.accent, alignment: "right" });
  }

  // 02 — Problem framing
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 2, "Problem framing", "Why now");
    title(s, "problem-title", "建筑设计公司真正付出的是结构化返工", "难点不是写一段文案，而是让一份高密度任务书稳定变成整套汇报。 ");
    bullet(s, "cost-1", "读懂并筛选", "面积、边界、功能、方向、交付条件分散在任务书不同位置。", 72, 250, 420, C.accent);
    bullet(s, "cost-2", "跨页保持一致", "方案名称、设计逻辑、图像标题和总结页经常互相漂移。", 72, 364, 420, C.green);
    bullet(s, "cost-3", "交付前反复返工", "文本溢出、图片丢失、模型幻觉和导出不稳，都会回到人工修补。", 72, 478, 420, C.accent);
    rect(s, "opportunity-surface", 628, 238, 580, 314, C.ink);
    text(s, "opportunity-label", "PRODUCT OPPORTUNITY", 666, 270, 300, 24, { fontSize: 13, bold: true, color: C.accent, letterSpacing: 1.1 });
    text(s, "opportunity-title", "把“任务书 → 汇报”\n拆成可验证的中间产物", 666, 318, 480, 88, { fontSize: 35, bold: true, color: C.white, lineSpacingMultiple: 0.98 });
    rule(s, "opportunity-rule", 666, 430, 150, C.accent, 3);
    text(s, "opportunity-body", "事实可追溯，方向可确认，页面可校验，图片可恢复，交付可编辑。", 666, 458, 450, 52, { fontSize: 19, color: "#D5E0D8", lineSpacingMultiple: 1.08 });
    footer(s, 2);
  }

  // 03 — Data-to-deck architecture
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 3, "Information architecture", "System");
    title(s, "architecture-title", "从一份任务书到一套 PPT：每一层都可追溯", "给不懂建筑的人看的解释：Agent 不是直接跳到页面，而是逐层把不确定性压缩掉。");
    const nodes = [
      ["brief", "任务书", "原文、页码、文件角色", C.accentSoft],
      ["facts", "项目事实", "字段、引用、冲突、确认状态", C.greenSoft],
      ["directions", "设计方向", "任务书方向 / 用户确认提案", C.blueSoft],
      ["pagegraph", "页面架构", "页面角色、方案身份、证据关系", C.panel],
      ["assets", "视觉与交付", "图框任务、图片资产、PDF / PPTX", C.panel],
    ];
    nodes.forEach(([name, heading, body, fill], i) => {
      const x = 72 + i * 228;
      flowNode(s, name, x, 276, 196, 142, heading, body, fill);
      if (i < nodes.length - 1) arrow(s, `arch-arrow-${i}`, x + 201, 346, 24, i === 1 ? C.green : C.accent);
    });
    rule(s, "arch-source-rule", 72, 482, 1136, C.rule, 1);
    text(s, "arch-source-label", "边界规则", 72, 510, 140, 28, { fontSize: 20, bold: true, color: C.ink });
    text(s, "arch-source-body", "当前项目事实、历史参考和公司信息三块隔离；只有带来源页码与原文引用的数字和结论，才能进入最终文案。", 242, 505, 940, 42, { fontSize: 18, color: C.muted, lineSpacingMultiple: 1.08 });
    footer(s, 3);
  }

  // 04 — Two pipelines
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    header(s, 4, "Product strategy", "Two pipelines", true);
    darkTitle(s, "pipeline-title", "两条管线不是两个入口，而是两种决策模型", "任务规范性不同，决定信息深度、交互成本和生成策略必须不同。");
    rect(s, "large-lane", 72, 356, 532, 224, "#273832");
    text(s, "large-lane-label", "PIPELINE A", 102, 382, 160, 24, { fontSize: 13, bold: true, color: C.greenSoft, letterSpacing: 1.2 });
    text(s, "large-lane-title", "大型公共建筑", 102, 420, 340, 34, { fontSize: 28, bold: true, color: C.white });
    text(s, "large-lane-body", "任务书通常明确面积、场地边界、功能与专业交付。\n因此需要场地分析、提案确认和完整章节链路。", 102, 468, 430, 72, { fontSize: 17, color: "#C9D8CF", lineSpacingMultiple: 1.08 });
    rect(s, "small-lane", 676, 356, 532, 224, "#4B3028");
    text(s, "small-lane-label", "PIPELINE B", 706, 382, 160, 24, { fontSize: 13, bold: true, color: C.accentSoft, letterSpacing: 1.2 });
    text(s, "small-lane-title", "小型建筑 / 装置", 706, 420, 400, 34, { fontSize: 28, bold: true, color: C.white });
    text(s, "small-lane-body", "任务书可能直接给出方向，也可能只给创作事实。\n因此轻量化提案，保留创意多样性，再用可建造性约束收敛。", 706, 468, 430, 72, { fontSize: 17, color: "#E7D2CA", lineSpacingMultiple: 1.08 });
    text(s, "pipeline-logic", "同一底座 · 不同深度 · 同一交付闭环", 72, 620, 1136, 28, { fontSize: 20, bold: true, color: C.accent, alignment: "center", letterSpacing: 1.2 });
    footer(s, 4, true);
  }

  // 05 — Large building pipeline
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 5, "Pipeline A", "Large building");
    title(s, "large-title", "大型管线：把专业任务书翻译成设计决策", "核心价值是降低专业资料的理解成本，同时保留建筑师需要的判断边界。");
    const left = [
      ["输入", "面积 / 边界 / 功能 / 交通 / 场地条件", C.accentSoft],
      ["判断", "提案卡片 + Gate B 确认 + 缺失项提示", C.greenSoft],
      ["输出", "场地、总图、空间、立面、技术、总结", C.panel],
    ];
    left.forEach(([head, body, fill], i) => {
      const y = 250 + i * 106;
      rect(s, `large-row-${i}`, 72, y, 470, 78, fill);
      text(s, `large-row-head-${i}`, head, 94, y + 12, 100, 28, { fontSize: 20, bold: true, color: C.ink });
      text(s, `large-row-body-${i}`, body, 210, y + 10, 300, 46, { fontSize: 17, color: C.muted, lineSpacingMultiple: 1.04 });
    });
    text(s, "large-translation-label", "翻译关系", 654, 246, 180, 24, { fontSize: 13, bold: true, color: C.accent, letterSpacing: 1.1 });
    text(s, "large-translation", "专业数据\n↓\n可确认的设计判断\n↓\n有证据的页面叙事", 654, 288, 290, 186, { fontSize: 32, bold: true, color: C.ink, lineSpacingMultiple: 0.96, alignment: "center" });
    rule(s, "large-guard-rule", 980, 250, 1, C.rule, 260);
    text(s, "large-guard-label", "为什么可靠", 1010, 250, 170, 28, { fontSize: 20, bold: true, color: C.green });
    text(s, "large-guard-body", "事实、提案、历史参考各有来源角色；没有来源的数字不进入最终文案；场地分析必须回到当前项目。", 1010, 296, 174, 148, { fontSize: 17, color: C.muted, lineSpacingMultiple: 1.08 });
    rect(s, "large-result", 654, 528, 554, 54, C.green);
    text(s, "large-result-text", "把“读任务书”变成“确认设计判断”", 674, 540, 514, 28, { fontSize: 20, bold: true, color: C.white, alignment: "center" });
    footer(s, 5);
  }

  // 06 — Small building pipeline
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 6, "Pipeline B", "Small-scale building");
    title(s, "small-title", "小型管线：轻量化不是简化，而是保留创意多样性", "小型提案不一定需要大型项目的多轮 Gate；事实清楚后，一键生成并列方向，再用可建造性把结果拉回现实。");
    const steps = [
      ["01", "识别事实", "活动、场地、产品、限制条件", C.accent],
      ["02", "提取方向", "任务书已有方向优先；没有则生成最多三个可编辑方向", C.green],
      ["03", "一键成稿", "方向 → 方案身份 → 页面 → 视觉任务", C.blue],
      ["04", "现实收敛", "材料、拆装、运输、复用、安全与维护", C.accent],
    ];
    steps.forEach(([num, head, body, color], i) => {
      const x = 72 + i * 284;
      text(s, `small-step-num-${i}`, num, x, 260, 58, 30, { fontSize: 16, bold: true, color });
      rule(s, `small-step-rule-${i}`, x + 58, 274, 190, color, 3);
      text(s, `small-step-head-${i}`, head, x, 316, 235, 34, { fontSize: 25, bold: true, color: C.ink });
      text(s, `small-step-body-${i}`, body, x, 368, 240, 68, { fontSize: 17, color: C.muted, lineSpacingMultiple: 1.08 });
    });
    rect(s, "small-proof", 72, 510, 1136, 76, C.greenSoft);
    text(s, "small-proof-label", "回测证据", 96, 526, 120, 24, { fontSize: 14, bold: true, color: C.green, letterSpacing: 1.1 });
    text(s, "small-proof-body", "新任务书“织回城市”正确提取“纤维再生站 / 共织风廊”，生成 13 页，并隔离景德镇旧项目内容。", 236, 522, 930, 34, { fontSize: 20, bold: true, color: C.ink });
    footer(s, 6);
  }

  // 07 — Identity propagation
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    header(s, 7, "Narrative system", "Scheme identity", true);
    darkTitle(s, "identity-title", "方案身份是一条跨页主键", "这是产品比“生成几页文案”更难、也更有价值的地方：同一个方案名和核心逻辑必须贯穿整套汇报。");
    rect(s, "identity-source", 72, 362, 250, 142, C.accent);
    text(s, "identity-source-label", "方案定义", 98, 382, 190, 28, { fontSize: 22, bold: true, color: C.white });
    text(s, "identity-source-body", "纤维再生站\n共织风廊", 98, 426, 190, 58, { fontSize: 22, bold: true, color: C.white, lineSpacingMultiple: 1.02 });
    arrow(s, "identity-arrow", 340, 432, 80, C.accent);
    const targets = [
      ["concept", "概念页", C.greenSoft],
      ["render", "效果页", C.panel],
      ["tech", "构造页", C.panel],
      ["compare", "P03 对照", C.blueSoft],
      ["summary", "S04 总结", C.accentSoft],
    ];
    targets.forEach(([name, label, fill], i) => {
      const x = 442 + i * 148;
      rect(s, `identity-${name}`, x, 382, 128, 102, fill);
      text(s, `identity-${name}-text`, label, x + 12, 416, 104, 34, { fontSize: 19, bold: true, color: C.ink, alignment: "center" });
      if (i < targets.length - 1) arrow(s, `identity-${name}-arrow`, x + 130, 432, 17, C.green);
    });
    rule(s, "identity-bottom-rule", 72, 554, 1136, "#405249", 1);
    text(s, "identity-bottom", "结果：标题不再出现“装置3”，总结页也不再生成与正文脱节的图片标题。", 72, 580, 1136, 34, { fontSize: 20, bold: true, color: C.white, alignment: "center" });
    footer(s, 7, true);
  }

  // 08 — Visual pipeline
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 8, "Visual generation", "Prompt economy");
    title(s, "visual-title", "视觉生成只发送当前页面的必要上下文", "前期不必先建模或依赖 image-to-image；用方案身份、视觉锚点和当前页上下文保持同一设计。");
    flowNode(s, "visual-page", 72, 274, 220, 150, "当前页面", "页面主题\n当前方案\n必要事实", C.accentSoft);
    arrow(s, "visual-arrow-1", 306, 348, 70, C.accent);
    flowNode(s, "visual-slot", 398, 274, 220, 150, "图框任务", "用途 + 比例\n短提示词\n精简反向约束", C.greenSoft);
    arrow(s, "visual-arrow-2", 632, 348, 70, C.green);
    flowNode(s, "visual-model", 724, 274, 220, 150, "gpt-image-2", "主效果图\n白模线稿分析图\n封面主视觉", C.blueSoft);
    arrow(s, "visual-arrow-3", 958, 348, 70, C.blue);
    flowNode(s, "visual-asset", 1050, 274, 158, 150, "云端资产", "slot_id\n版本 URL\n刷新可恢复", C.panel);
    rect(s, "visual-callout", 72, 488, 1136, 84, C.ink);
    text(s, "visual-callout-text", "同一方案 = 方案身份 + 视觉锚点 + 当前页上下文；前期不必先做三维模型，也不依赖 image-to-image。", 98, 505, 1084, 48, { fontSize: 18, bold: true, color: C.white, alignment: "center", lineSpacingMultiple: 1.04 });
    footer(s, 8);
  }

  // 09 — Hallucination controls
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 9, "Reliability design", "Hallucination control");
    title(s, "guard-title", "控制幻觉：让模型不能越过产品边界", "模型负责表达；规则负责边界；用户负责确认。可靠性来自多层约束，而不是一句提示词。");
    const guards = [
      ["事实层", "原文 + 页码 + 引用", "没有来源的数字、预算、面积和结论不进入最终文案。", C.accentSoft],
      ["语义层", "事实 / 提案 / 历史 / 公司隔离", "历史参考只提供结构与风格，不污染当前项目判断。", C.greenSoft],
      ["页面层", "当前页 + 当前方案上下文", "生成图和文案不携带其他方案的无关内容。", C.blueSoft],
      ["交付层", "A3 测量 + 整体重写 + 云端恢复", "溢出时重写完整句子，图片与项目资产一起保存。", C.panel],
    ];
    guards.forEach(([head, label, body, fill], i) => {
      const y = 246 + i * 88;
      rect(s, `guard-${i}`, 72, y, 1136, 68, fill);
      text(s, `guard-head-${i}`, head, 96, y + 16, 130, 28, { fontSize: 20, bold: true, color: C.ink });
      text(s, `guard-label-${i}`, label, 246, y + 16, 330, 28, { fontSize: 19, bold: true, color: C.ink });
      text(s, `guard-body-${i}`, body, 600, y + 12, 570, 38, { fontSize: 16, color: C.muted, lineSpacingMultiple: 1.04 });
    });
    text(s, "guard-conclusion", "把不可控的生成，变成可审查的交付。", 72, 610, 1136, 34, { fontSize: 24, bold: true, color: C.green, alignment: "center" });
    footer(s, 9);
  }

  // 10 — Token and cost model
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 10, "Resource model", "Token economics");
    title(s, "cost-title", "一次项目要花多少模型资源？先把成本拆开", "以下是按当前代码调用链和保守上下文长度做的产品估算，不是供应商账单；真实账单以服务商返回 usage 为准。");
    const cols = [72, 338, 622, 840, 1030];
    const widths = [246, 264, 202, 176, 178];
    const heads = ["环节", "模型 / 调用", "次数", "输入 token", "输出 token"];
    heads.forEach((head, i) => {
      rect(s, `cost-head-${i}`, cols[i], 232, widths[i], 42, C.ink);
      text(s, `cost-head-text-${i}`, head, cols[i] + 12, 242, widths[i] - 24, 22, { fontSize: 16, bold: true, color: C.white, alignment: i >= 2 ? "center" : "left" });
    });
    const rows = [
      ["任务书解析", "gpt-5.5 · 注册/事实/完整度/Planner", "4", "8k–20k", "2k–8k", C.accentSoft],
      ["小型整套文案", "gpt-5.5 · 13 页 × 1", "13", "13k–26k", "3k–6.5k", C.greenSoft],
      ["大型整套文案", "gpt-5.5 · 34 页 × 1", "34", "34k–68k", "8.5k–17k", C.panel],
      ["审核 / 溢出重写", "gpt-5.5 · 1 次 + 超页重写", "1+", "4k–12k", "1k–4k", C.blueSoft],
      ["图片槽", "gpt-image-2 · 每个未完成槽 1 次", "N", "80–200 / 槽", "0*", C.panel],
    ];
    rows.forEach((row, r) => {
      const y = 274 + r * 52;
      row.slice(0, 5).forEach((value, i) => {
        rect(s, `cost-row-${r}-${i}`, cols[i], y, widths[i], 48, row[5]);
        text(s, `cost-row-text-${r}-${i}`, value, cols[i] + 12, y + 7, widths[i] - 24, 34, { fontSize: i === 1 ? 15 : 16, color: C.ink, bold: i === 0, alignment: i >= 2 ? "center" : "left", lineSpacingMultiple: 1.02 });
      });
    });
    text(s, "cost-note", "* 图像接口通常不返回文本 completion output token；产品记录 prompt 输入估算，图片成本按图像模型单价另计。总结页复用主效果图，不重复调用。", 72, 552, 1136, 38, { fontSize: 15, color: C.muted, lineSpacingMultiple: 1.04 });
    rect(s, "cost-formula", 72, 606, 1136, 42, C.green);
    text(s, "cost-formula-text", "产品成本公式 = 文本输入 + 文本输出 + 图片槽调用数 × 图像模型单价", 92, 614, 1096, 26, { fontSize: 18, bold: true, color: C.white, alignment: "center" });
    footer(s, 10);
  }

  // 11 — Competitive edge / close
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    rect(s, "close-accent", 72, 72, 14, 576, C.accent);
    text(s, "close-kicker", "PRODUCT COMPETITIVENESS", 120, 106, 600, 28, { fontSize: 16, bold: true, color: "#B9C7BF", letterSpacing: 1.3 });
    text(s, "close-title", "降本增效，不是少点几次按钮\n而是少做几轮无效返工", 120, 170, 890, 134, { fontSize: 48, bold: true, color: C.white, lineSpacingMultiple: 0.93 });
    metric(s, "edge-1", "1", "份任务书 → 一条结构化链路", 120, 352, 288, "#273832", C.accent);
    metric(s, "edge-2", "2", "种管线 → 匹配两种决策深度", 444, 352, 288, "#273832", C.greenSoft);
    metric(s, "edge-3", "N", "个资产 → 云端可恢复、可复用", 768, 352, 288, "#273832", C.white);
    text(s, "close-body", "对 B 端设计公司：把团队经验固化为可追溯流程，减少前期建模与返工。\n对 OPC 用户：一个人也能从任务书走到同一方案的可编辑交付。", 124, 504, 720, 70, { fontSize: 20, color: "#D5E0D8", lineSpacingMultiple: 1.08 });
    rule(s, "close-rule", 124, 604, 410, C.accent, 3);
    text(s, "close-foot", "建筑设计汇报文本 Agent · AI 产品经理作品集", 124, 620, 720, 28, { fontSize: 17, color: "#AAB8B0" });
    text(s, "close-mark", "11", 1030, 570, 120, 70, { fontSize: 54, bold: true, color: C.accent, alignment: "right" });
  }

  return p;
}

async function main() {
  await fs.mkdir(PREVIEW, { recursive: true });
  const presentation = makeSlides();
  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(`${PREVIEW}/${stem}.png`, await presentation.export({ slide, format: "png", scale: 1 }));
    await fs.writeFile(`${PREVIEW}/${stem}.layout.json`, await (await slide.export({ format: "layout" })).text());
  }
  await writeBlob(`${PREVIEW}/deck-montage.webp`, await presentation.export({ format: "webp", montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(OUT);
  console.log(`Portfolio rebuilt: ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
