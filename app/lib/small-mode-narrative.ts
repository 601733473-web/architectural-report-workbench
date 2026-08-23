import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";

type SmallModePage = DesignReportPagePlan["pages"][number];

/**
 * Small-mode narrative rules distilled from the supplied sample's information
 * architecture. These are structural rules only; no sample wording, project
 * name, design conclusion, number, material, or image is stored here.
 */
export const SMALL_MODE_NARRATIVE_CONTRACT = `
小型建筑/装置汇报的跨页叙事契约（只学习结构，不复制任何案例内容）：
四层反推框架：
- 内容架构层：先确定页面顺序、每页唯一任务、信息密度与方案展开逻辑；每页都要回答“本页证明什么”，并为相邻页提供承接。
- 文案方式层：标题、正文和方案命名必须形成对应关系；产品/功能—装置/空间—互动—视觉结果要用同一组对象名称贯穿，不能标题讲一件事、正文讲另一件事。
- 方案一致性层：先锁定共同设计语言，再让不同对象或方向只在任务书明确的主题、动作和结果上发生差异；同一方案在前后页保持主张、空间机制和互动结果一致。
- 视觉结构层：封面建立身份，总览页建立对象关系，单装置/单空间页展开主张，方案对比页使用平行字段，收束页回收传播、运营与复用；每个图框只承担当前页对应的证据。
1. 开篇先回答“这是什么项目、要形成什么体验或传播结果”，封面只建立项目身份与一句总主张。
2. 第二层把任务书中的活动/业主目标、对象关系和产品或功能主题组织成一条可读路径；不要把事实散成孤立卡片。
3. 在进入单件方案前，先明确观众或使用者要完成的行为，以及设计语言如何转译为可见的材料、光线、尺度和动作。
4. 每个装置/空间单元都按同一组六段字段展开：产品诉求 → 装置转译 → 空间形态 → 互动动作 → 材料灯光 → 传播/复用。装置概念页的六个可见信息单元必须逐项对应这六段链条；主视觉页、互动页和细节页继续使用同一对象名称与造型母题，只改变证据焦点。不同单元只替换任务书对应内容，不改变叙事字段。
5. 当任务书明确给出同一对象的多个设计方向时，先用一页说明共同命题，再为每个方向分别保留“方向主张—空间机制—互动结果”的独立证据；不得把两个方向揉成一个模糊方案，也不得替任务书新增方向。
6. 组合页必须逐项覆盖所有对象，并能看出它们的分工、先后关系或互补关系；不能只讲第一项再用一句空泛总结代替其余对象。
7. 收束页回收共同设计语言、现场角色/IP（如任务书有要求）、传播方式、搭建/收起/复用和交付边界；没有任务书依据的预算、尺寸、材料性能和实施结论不得补写。
8. 页面之间保持“同一项目、同一设计语言、不同证据焦点”：主视觉讲空间，机制图讲变化过程，互动图讲人的动作，材料图讲触点，运营页讲使用与复用，不让所有图片都变成同一种泛化效果图。
9. 每一页只承担一个可复核的表达任务；如果标题是“目标、路径、矩阵、分工、流程、复用”等整体性命题，正文和图框必须形成对应的关系链、并列字段或阶段序列，而不是用装饰性图片替代逻辑。
10. 除封面外，每页必须形成4—6个可见信息单元。可见信息单元由正文结论模块、设计动作卡、图像及其图内标题共同组成；不能用“任务书证据、图解标签、讲述提示、本页核心结论、页面正文”等后台名称冒充信息。信息单元之间必须互补，禁止把同一句话改写后重复六次。
11. 排版采用稳定的归一化网格：页面主边距约3.5%—5%，标题、正文、图注形成清晰三级字号，主图或图组通常占有效内容区约43%或以上；多栏页面优先使用约20% / 40% / 60%的对齐线，页脚稳定在页面高度约92%—94%。这些规则只描述版式关系，不复制参考样本文案、造型或项目事实。
`;

function installationNumber(page: SmallModePage) {
  const match = page.headline_zh.match(/装置\s*([0-9一二三四五六七八九十]+)/u);
  return match?.[1] ?? "";
}

function pageRole(page: SmallModePage) {
  const headline = page.headline_zh;
  if (page.page_type === "cover") return "开篇身份与总主张";
  if (page.page_type === "summary") return "全篇回收与交付结论";
  if (page.page_type === "comparison") return "对象之间的平行对照与分工";
  if (/IP|角色|现场联动|传播/u.test(headline)) {
    return "视觉角色、现场行为与传播关系";
  }
  if (/复用|收起|搭建|实施|成本|交付|运营/u.test(headline)) {
    return "实施、运营、复用或交付证据";
  }
  if (page.page_type === "concept") {
    return installationNumber(page)
      ? `装置${installationNumber(page)}的空间主张与设计动作`
      : "空间主张与设计动作";
  }
  if (page.page_type === "rendering") {
    return installationNumber(page)
      ? `装置${installationNumber(page)}的主视觉与现场体验证据`
      : "主视觉与现场体验证据";
  }
  return "设计语言、互动机制或落地边界";
}

function bodyStructure(page: SmallModePage) {
  if (page.page_type === "cover") return "项目身份 + 总主张";
  if (page.page_type === "comparison") return "对象A / 对象B / 对象C 的平行字段 + 共同关系";
  if (page.page_type === "concept") {
    return installationNumber(page)
      ? "产品诉求 + 装置转译 + 空间形态 + 互动动作 + 材料灯光 + 传播/复用（六个可见信息单元）"
      : "核心主张 + 空间动作 + 体验结果 + 4—6个互补信息单元";
  }
  if (page.page_type === "rendering") return "画面所见 + 观众动作 + 产品/文化/传播落点";
  if (page.page_type === "summary") return "共同主线 + 各对象分工 + 实施边界";
  return "本页结论 + 2—4个支撑动作 + 与前后页的承接";
}

export function smallModeNarrativeGuidance(
  page: SmallModePage,
  pages: SmallModePage[] = [],
) {
  const index = pages.findIndex((candidate) => candidate.page_id === page.page_id);
  const previous = index > 0 ? pages[index - 1]?.headline_zh : "无";
  const next = index >= 0 && index < pages.length - 1 ? pages[index + 1]?.headline_zh : "无";
  return [
    SMALL_MODE_NARRATIVE_CONTRACT.trim(),
    `当前页角色：${pageRole(page)}`,
    `当前页正文结构：${bodyStructure(page)}`,
    `前一页：${previous}`,
    `后一页：${next}`,
    "只把这些规则用于后台生成与审核，禁止把“叙事契约、当前页角色、前一页、后一页”等系统说明写入页面正文。",
  ].join("\n");
}

export function smallModeVisualContinuityGuidance(
  projectFacts: DesignReportProjectFacts,
  page: SmallModePage,
) {
  const location = projectFacts.facts
    .filter((fact) => /^site\.|^project\./u.test(fact.field_path))
    .map((fact) => String(fact.value_raw))
    .join(" ");
  return [
    "小型建筑/装置跨页视觉连续性契约：",
    `当前项目语境：${location || "只使用任务书已提供的项目语境"}`,
    "先在文字提示中建立并锁定一套项目视觉 DNA：地域文化转译、主色与辅色、三种以内的核心材质、结构语言、人物年龄层、季节时段、摄影机高度、镜头质感和照明逻辑。后续页面只能改变装置对象、观看距离和行为焦点，不得另起一套风格。",
    "跨页一致性依靠同一套文字视觉 DNA 和同一组对象命名维持；小型建筑/装置管线不使用其他页面生成图作为 image-to-image 输入，避免封面意象污染装置造型和图文关系。",
    "同一件装置在概念页、主视觉页、互动页和细节页中必须保持可识别的主体轮廓、核心材质、主色和互动构件；不同装置必须按任务书各自的产品、核心、互动和赠品保持清晰差异。",
    "主视觉只证明本页空间主张；互动图只证明观众动作或人与装置的关系；材料/运营图只证明材料触感、产品触点、赠品、传播或复用。不同图框必须承担不同证据焦点。",
    `当前页标题与正文是唯一内容锚点：${page.headline_zh}｜${page.core_message}`,
    "不得把案例样本中的项目名、文案、数字、造型、图片或历史事实带入当前图像。",
  ].join("\n");
}
