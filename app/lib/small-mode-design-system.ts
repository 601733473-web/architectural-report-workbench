import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  createStructuredResponse,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import { localCultureFusionPrompt } from "@/app/lib/local-culture-fusion";
import { smallScaleBuildabilityPrompt } from "@/app/lib/small-scale-buildability";

type SmallModePage = DesignReportPagePlan["pages"][number];

export interface SmallModeDesignObject {
  object_id: string;
  source_label: string;
  proposal_name: string;
  design_claim: string;
  silhouette: string;
  spatial_form: string;
  interaction: string;
  material_and_light: string;
  structure_and_components: string;
  product_or_gift: string;
  communication_and_reuse: string;
}

export interface SmallModeDesignSystem {
  project_thesis: string;
  shared_language: string;
  palette_and_material_family: string;
  lighting_and_atmosphere: string;
  construction_family: string;
  audience_and_camera: string;
  cultural_translation: string;
  objects: SmallModeDesignObject[];
  ip_activation: string;
  operation_and_reuse: string;
  originality_statement: string;
}

const designSystemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "project_thesis",
    "shared_language",
    "palette_and_material_family",
    "lighting_and_atmosphere",
    "construction_family",
    "audience_and_camera",
    "cultural_translation",
    "objects",
    "ip_activation",
    "operation_and_reuse",
    "originality_statement",
  ],
  properties: {
    project_thesis: { type: "string", minLength: 8, maxLength: 160 },
    shared_language: { type: "string", minLength: 8, maxLength: 240 },
    palette_and_material_family: {
      type: "string",
      minLength: 8,
      maxLength: 240,
    },
    lighting_and_atmosphere: {
      type: "string",
      minLength: 8,
      maxLength: 220,
    },
    construction_family: { type: "string", minLength: 8, maxLength: 260 },
    audience_and_camera: { type: "string", minLength: 8, maxLength: 220 },
    cultural_translation: { type: "string", minLength: 8, maxLength: 240 },
    objects: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "object_id",
          "source_label",
          "proposal_name",
          "design_claim",
          "silhouette",
          "spatial_form",
          "interaction",
          "material_and_light",
          "structure_and_components",
          "product_or_gift",
          "communication_and_reuse",
        ],
        properties: {
          object_id: { type: "string", minLength: 1, maxLength: 40 },
          source_label: { type: "string", minLength: 1, maxLength: 80 },
          proposal_name: { type: "string", minLength: 2, maxLength: 24 },
          design_claim: { type: "string", minLength: 8, maxLength: 180 },
          silhouette: { type: "string", minLength: 8, maxLength: 180 },
          spatial_form: { type: "string", minLength: 8, maxLength: 180 },
          interaction: { type: "string", minLength: 8, maxLength: 180 },
          material_and_light: { type: "string", minLength: 8, maxLength: 180 },
          structure_and_components: {
            type: "string",
            minLength: 8,
            maxLength: 220,
          },
          product_or_gift: { type: "string", minLength: 4, maxLength: 140 },
          communication_and_reuse: {
            type: "string",
            minLength: 8,
            maxLength: 180,
          },
        },
      },
    },
    ip_activation: { type: "string", minLength: 4, maxLength: 220 },
    operation_and_reuse: { type: "string", minLength: 8, maxLength: 220 },
    originality_statement: { type: "string", minLength: 8, maxLength: 180 },
  },
} as const;

function activeFacts(projectFacts: DesignReportProjectFacts) {
  return projectFacts.facts.filter(
    (fact) => fact.status !== "superseded" && fact.status !== "conflict",
  );
}

function installationIds(projectFacts: DesignReportProjectFacts) {
  return [
    ...new Set(
      activeFacts(projectFacts)
        .map((fact) => fact.field_path.match(/^installation\.([^.]+)\./u)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
}

function normalizeInstallationId(value: string) {
  const compact = value.trim();
  const chineseNumerals: Record<string, string> = {
    一: "1",
    二: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6",
    七: "7",
    八: "8",
    九: "9",
    十: "10",
  };
  return chineseNumerals[compact] ?? compact;
}

function installationIdsFromPagePlan(pagePlan: DesignReportPagePlan) {
  return [
    ...new Set(
      pagePlan.pages
        .map((page) =>
          page.headline_zh.match(/装置\s*([0-9一二三四五六七八九十]+)/u)?.[1],
        )
        .filter((value): value is string => Boolean(value))
        .map(normalizeInstallationId),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
}

function objectBrief(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  objectId: string,
) {
  const directFacts = activeFacts(projectFacts).filter((fact) =>
    fact.field_path.startsWith(`installation.${objectId}.`),
  );
  const matchingPages = pagePlan.pages.filter((page) => {
    const match = page.headline_zh.match(
      /装置\s*([0-9一二三四五六七八九十]+)/u,
    )?.[1];
    return match ? normalizeInstallationId(match) === objectId : false;
  });
  const matchingFactIds = new Set(
    matchingPages.flatMap((page) => page.fact_refs ?? []),
  );
  const pageLinkedFacts = activeFacts(projectFacts).filter((fact) =>
    matchingFactIds.has(fact.fact_id),
  );
  const chineseId = Object.entries({
    一: "1",
    二: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6",
    七: "7",
    八: "8",
    九: "9",
    十: "10",
  }).find(([, numeric]) => numeric === objectId)?.[0];
  const textualFacts = activeFacts(projectFacts).filter((fact) => {
    const value = String(fact.value_raw ?? "");
    return (
      value.includes(`装置${objectId}`) ||
      Boolean(chineseId && value.includes(`装置${chineseId}`))
    );
  });
  const candidateFacts = [...directFacts, ...pageLinkedFacts, ...textualFacts];
  const facts = candidateFacts.length
    ? [
        ...new Map(candidateFacts.map((fact) => [fact.fact_id, fact])).values(),
      ]
    : activeFacts(projectFacts);
  const sourceLabel =
    matchingPages.find((page) => page.page_type === "concept")?.headline_zh ??
    matchingPages[0]?.headline_zh;
  return {
    object_id: objectId,
    source_label:
      sourceLabel ??
      (String(
        facts.find((fact) => fact.field_path.endsWith(".sequence"))?.value_raw ??
          `装置${objectId}`,
      ).trim() || `装置${objectId}`),
    facts: facts.map((fact) => ({
      field_path: fact.field_path,
      value: fact.value_raw,
      source_page: fact.source.page,
    })),
  };
}

function sanitizeProposalText(value: string, sourceCorpus: string) {
  let result = value
    .replace(/#[^#。；\n]{2,40}#/gu, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:K|mm|cm|m|kg|t|kN|MPa|W|V|元|万元)\b/giu, "适宜")
    .replace(/大幅降低(?:重复)?搭建成本/gu, "减少重复制作")
    .replace(/低成本/gu, "节约重复制作")
    .replace(/低成本复用/gu, "便于年度复用")
    .replace(/确保(?:结构)?稳固/gu, "支持稳定使用")
    .replace(/无损(?:快速)?/gu, "可逆")
    .replace(/系统自动派发/gu, "由现场工作人员赠送")
    .replace(/自动取水区/gu, "产品赠送点")
    .replace(/(?:可编程|柔性|柔光)?\s*(?:RGBW\s*)?LED\s*灯带/giu, "可维护的内透灯光")
    .replace(/可编程\s*RGBW\s*灯带/giu, "可维护的内透灯光")
    .replace(/(?:冷白光|暖黄光|磁吸式)?\s*LED(?:点光源)?/giu, "可维护的内透灯光")
    .replace(/损耗率极低/gu, "便于维护替换")
    .replace(/零废弃(?:交付|运营)?/gu, "分类收纳与年度复用")
    .replace(/确保次年(?:活动)?(?:的)?直接复用/gu, "便于次年再次部署")
    .replace(/确保(?:结构)?稳定(?:性)?(?:且(?:美观|便于搬运))?/gu, "结构稳定性与节点方式待专业深化")
    .replace(/确保结构稳定性且便于搬运/gu, "结构稳定性与搬运方式待专业深化")
    .replace(/结构稳定性与节点方式待专业深化性/gu, "结构稳定性与节点方式待专业深化")
    .replace(/结构稳固/gu, "结构稳定性待专业深化")
    .replace(/保证抗风稳定性/gu, "抗风与锚固方式待专业深化")
    .replace(/确保抗风稳定性/gu, "具体抗风与锚固方式待专业深化")
    .replace(/环形钢圈基础/gu, "可拆分环形底座")
    .replace(/膨胀螺栓或配重块/gu, "可逆配重或可拆锚固")
    .replace(/双曲或单曲曲面/gu, "分片单曲或可展曲面")
    .replace(/下沉式或围合式/gu, "围合式")
    .replace(/下沉式或平地(?:的)?/gu, "平地式")
    .replace(/实时投影或拍照分享/gu, "现场记录或拍照分享")
    .replace(/实时投影/gu, "现场记录")
    .replace(/基础为简易法兰盘固定，适应不同场地地面条件/gu, "基础与锚固方式需结合不同场地条件和专业复核")
    .replace(/基础为隐蔽式法兰盘连接/gu, "基础与锚固方式需结合场地条件和专业复核")
    .replace(/立柱内藏管线/gu, "立柱整合可维护的内部构件")
    .replace(/现场仅需扳手即可完成组装/gu, "现场采用可逆紧固件完成组装")
    .replace(/活动结束后，?PC板可回收再造/gu, "活动结束后，PC板分类清洁并收纳")
    .replace(/软膜易损耗但成本低/gu, "软膜需在复用前检查与维护")
    .replace(/安全无毒的水性釉料笔/gu, "水性创作笔")
    .replace(/特制水性釉料笔/gu, "水性创作笔")
    .replace(/降低耗材成本/gu, "减少重复制作")
    .replace(/容纳\s*\d+\s*[-—至]\s*\d+\s*人/gu, "容纳多人")
    .replace(/标签关联#[^，。；\s]+/gu, "形成统一传播记忆")
    .replace(/#[^，。；\s]+/gu, "")
    .replace(/默认色温为冷白光/gu, "采用清冷白光")
    .replace(/配重基座（无损地面）/gu, "可逆配重基座")
    .replace(/无损地面/gu, "减少对既有地面的干预")
    .replace(/环形混凝土配重块/gu, "可逆配重或可拆锚固，具体方式待专业深化")
    .replace(/香氛扩散口（仅概念，非设备）/gu, "现场泡茶与闻香操作点")
    .replace(/可回收再造为文创书签/gu, "分类清洁并收纳，供次年再次部署")
    .replace(/系统记录互动轨迹，?生成专属“寻源证书”/gu, "形成清晰的现场参与记忆")
    .replace(/互动数据/gu, "互动照片")
    .replace(/抗风稳定性?/gu, "抗风与锚固方式待专业深化")
    .replace(/材质坚硬耐用/gu, "材料耐久性待深化")
    .replace(/适合高频互动/gu, "面向高频互动的材料性能待深化")
    .replace(/所有材料都能完美回收/gu, "构件可分类收纳，并在复用前检查维护")
    .replace(/现场没有焊接作业/gu, "现场连接方式以专业深化为准")
    .replace(/搭建速度快且噪音低/gu, "便于现场装配")
    .replace(/避免对[^。；]+造成永久性破坏/gu, "减少对既有地面的干预")
    .replace(/极低的边际成本/gu, "减少重复制作")
    .replace(/极低[^，。；]*成本/gu, "适度维护后")
    .replace(/所有材料均可回收复用/gu, "构件分类收纳，并在复用前检查维护")
    .replace(/完美契合/gu, "回应")
    .replace(/不可逆破坏/gu, "过度干预")
    .replace(/机械式香氛扩散装置（若任务书允许）/gu, "可见的手摇滤光片互动")
    .replace(/香氛扩散装置(?:（若任务书允许）)?/gu, "手摇滤光片互动")
    .replace(/无毒水性颜料笔/gu, "水性创作笔")
    .replace(/无毒/gu, "")
    .replace(/或喷枪/gu, "")
    .replace(/观众的数字作品可现场记录至侧面屏幕或生成海报/gu, "观众共创作品通过现场拍照记录并分享")
    .replace(/数字作品/gu, "共创作品")
    .replace(/香气互动：?装置底部隐藏扩香模块[^；。]*/gu, "泡茶与品鉴互动：观众在中心区域完成泡茶、闻香与品鉴")
    .replace(/扩香模块(?:（[^）]*）)?/gu, "现场泡茶与闻香操作点")
    .replace(/香气互动/gu, "泡茶与品鉴互动")
    .replace(/嗅觉暗示/gu, "闻香与品鉴动作")
    .replace(/扫码下载自己的创作电子版/gu, "拍摄并分享自己的共创作品")
    .replace(/扫码/gu, "现场拍照")
    .replace(/下载自己的创作电子版/gu, "分享自己的共创作品")
    .replace(/作品即时干燥并保留/gu, "作品在现场逐步累积")
    .replace(/可完全回收/gu, "可分类清洁并收纳")
    .replace(/甜度测试/gu, "品鉴体验")
    .replace(/香气扩散机制/gu, "闻香与品鉴动作")
    .replace(/模拟茶香氛围/gu, "表现茶汤温暖氛围")
    .replace(/释放微量水雾[^，。；]*/gu, "通过现场泡茶、闻香与品鉴感受口感与茶香")
    .replace(/水雾/gu, "柔和光影")
    .replace(/数字瓷塔/gu, "共创瓷器装置")
    .replace(/发光磁吸模块/gu, "彩色磁吸模块")
    .replace(/彩色亚克力灯箱/gu, "彩色半透明亚克力模块")
    .replace(/光之塔/gu, "共创瓷器装置")
    .replace(/观众在终端/gu, "观众在现场共创台")
    .replace(/塔身高度或色彩密度逐渐增加/gu, "塔身共创图案与色彩逐步丰富")
    .replace(/防脱落/gu, "防脱落方式待专业深化")
    .replace(/可回收用于/gu, "分类清洁并收纳，可用于")
    .replace(/装置内部可能释放淡淡的茶香（若允许）或通过视觉暗示甜味/gu, "观众通过现场泡茶、闻香与品鉴感受口感与茶香")
    .replace(/优秀的共创图案可印制在次年的赠品上/gu, "优秀共创图案可作为次年活动的内容档案")
    .replace(/小型混凝土配重或地锚/gu, "可逆配重或可拆锚固，具体方式待专业深化")
    .replace(/活动结束后，?可拆卸的瓷片可作为纪念品或明年活动的素材库/gu, "活动结束后，可拆卸共创模块分类收纳，供次年继续使用")
    .replace(/可拆卸的瓷片可作为纪念品或明年活动的素材库/gu, "可拆卸共创模块分类收纳，供次年继续使用")
    .replace(/\s+/gu, " ")
    .trim();
  if (!sourceCorpus.includes("传感")) {
    result = result
      .replace(/设置感应式光影互动，当观众靠近或触摸特定立柱时，内部光线由暗转亮，模拟泉水被唤醒的瞬间，增强“真”的感知/gu, "设置可触摸的机械互动界面，观众转动或按压可见构件，带动内部光影由暗转亮")
      .replace(/感应式(?:光影互动|呼吸光效)/gu, "可触摸机械互动")
      .replace(/当观众靠近或触摸[^。；]+/gu, "观众转动或按压可见构件，带动内部光影变化")
      .replace(/脚踏压力感应(?:节点|区域)?(?:触发)?/gu, "步入式互动构件带动")
      .replace(/压力感应(?:节点|区域)?/gu, "互动构件")
      .replace(/触摸感应(?:区|区域)?/gu, "可触摸互动界面")
      .replace(/感应区域/gu, "互动界面")
      .replace(/感应节点/gu, "互动构件")
      .replace(/（机械式或电容式）/gu, "")
      .replace(/触发局部光影波动或声音反馈/gu, "带动局部光影变化")
      .replace(/当观众手部靠近[^，。；]+时，?内部灯光(?:亮度)?(?:微调|变化)/gu, "观众触摸可见互动界面，带动内部光影变化")
      .replace(/内置感应灯光产生[^。；]+/gu, "可触摸构件带动内部光影产生轻微明暗变化")
      .replace(/感应灯光/gu, "互动光影")
      .replace(/触摸感应/gu, "触摸互动")
      .replace(/呼吸灯/gu, "渐变光")
      .replace(/感应(?:片层|触发点)/gu, "互动触点")
      .replace(/感应/gu, "互动")
      .replace(/传感器/gu, "互动构件");
  }
  if (!sourceCorpus.includes("投影")) {
    const projectionFallback = /瓷|釉|斗器|磁吸|素坯/u.test(result)
      ? "观众作品在装置表面逐步累积，形成集体共创图案。"
      : /泡茶|茶香|茶汤|甘甜|水质/u.test(result)
        ? "观众通过泡茶、闻香与品鉴感受口感与茶香。"
        : "观众通过进入、触摸与拍摄参与现场体验。";
    result = result
      .replace(/[^。；]*投影[^。；]*[。；]?/gu, projectionFallback)
      .replace(/现场图像记录(?:映射|设备|内容)?[^。；]*[。；]?/gu, "夜间灯光勾勒主体轮廓。")
      .replace(/电子触控屏/gu, "可替换的磁吸共创模块")
      .replace(/数字瓷器/gu, "共创瓷器意象")
      .replace(/硬件复用、软件迭代/gu, "主体复用与内容更新")
      .replace(/上传自己的“釉色创作”截图/gu, "分享自己的釉色共创作品");
  }
  if (!sourceCorpus.includes("水槽")) {
    result = result.replace(/浅水槽/gu, "镜面反射底板");
  }
  if (!sourceCorpus.includes("香氛") && !sourceCorpus.includes("茶香装置")) {
    result = result
      .replace(/通过香氛与光影的通感设计/gu, "通过品鉴动作与光影的通感设计")
      .replace(/气味与声音互动/gu, "泡茶与品鉴互动")
      .replace(/观众入座后，?可闻到淡淡的茶香扩散（自然挥发或被动式香氛装置）/gu, "观众入座后通过现场泡茶、闻香与品鉴感受茶汤变化")
      .replace(/自然挥发或被动式香氛装置/gu, "现场泡茶与闻香过程")
      .replace(/被动式香氛装置/gu, "现场泡茶与闻香过程")
      .replace(/香氛装置/gu, "现场泡茶与闻香过程")
      .replace(/设置“甜度测试”互动墙，通过旋钮选择不同茶叶，墙面显示对应的甘甜指数可视化图形/gu, "观众通过泡茶与品鉴对比感受口感与茶香")
      .replace(/甘甜指数(?:可视化图形)?/gu, "品鉴感受")
      .replace(/装置内置定向音响播放流水与煮水声，并在特定时间段释放淡淡的茶香雾气（非强制配置，视现场条件）/gu, "观众通过泡茶、闻香与品鉴动作感受茶汤变化")
      .replace(/定向音响播放流水与煮水声/gu, "可见的泡茶动作引导")
      .replace(/释放淡淡的茶香雾气(?:（非强制配置，视现场条件）)?/gu, "以暖色光影模拟茶香扩散")
      .replace(/散发淡淡的茶香(?:（若允许）)?/gu, "通过光影层次表现茶香")
      .replace(/香氛机/gu, "光影构件");
  }
  if (!sourceCorpus.includes("攀爬") && !sourceCorpus.includes("登高")) {
    result = result
      .replace(/观众可沿阶梯上行/gu, "观众在装置前方参与互动，不进入主体结构")
      .replace(/每一层台面均为互动区域，中心设有主展示区，周围环绕参与式创作区/gu, "装置前方设置主展示区与参与式共创区")
      .replace(/阶梯上行/gu, "前方参与");
  }
  for (const unsupported of [
    "二维码",
    "自动售货机",
    "浓缩液",
    "独立包装的茶包",
  ]) {
    if (!sourceCorpus.includes(unsupported)) {
      result = result.replace(new RegExp(unsupported, "gu"), "");
    }
  }
  return result.replace(/，{2,}/gu, "，").replace(/；{2,}/gu, "；").trim();
}

function sourceProductOrGift(
  projectFacts: DesignReportProjectFacts,
  objectId: string,
) {
  const values = activeFacts(projectFacts)
    .filter(
      (fact) =>
        fact.field_path.startsWith(`installation.${objectId}.`) &&
        /\.(?:product|gift)$/u.test(fact.field_path),
    )
    .map((fact) => String(fact.value_raw).trim())
    .filter(Boolean);
  return [...new Set(values)].join("；");
}

function groundedObjectInteraction(
  sourceLabel: string,
  sourceCorpus: string,
  generatedInteraction: string,
) {
  const primary = sourceLabel.trim();
  const context = `${primary}\n${sourceCorpus}`;
  if (/泡茶水|泡茶甜|茶香|回甘/u.test(primary)) {
    return "观众在装置内完成泡茶、闻香与品鉴，通过真实饮用动作感受水质对茶香与口感的影响，并由现场工作人员衔接产品体验。";
  }
  if (/斗器|瓷|釉|器/u.test(primary)) {
    return "观众使用水性创作笔或可替换磁贴，在可维护的互动模块上完成瓷器主题共创；作品在现场逐步累积并可拍照分享。";
  }
  if (/山泉|泉水|水的“真”|水的真/u.test(primary)) {
    return "观众在装置中穿行并触摸可见材料界面，通过视角变化、层叠透光与自然反射感受山泉的澄澈，并完成拍照分享。";
  }
  if (/泡茶水|泡茶甜|茶香|回甘/u.test(context)) {
    return "观众通过泡茶、闻香与品鉴感受口感与茶香，并由现场工作人员衔接产品体验。";
  }
  return sanitizeProposalText(generatedInteraction, sourceCorpus);
}

function pageRole(page: SmallModePage) {
  return {
    page_id: page.page_id,
    page_type: page.page_type,
    headline: page.headline_zh,
    core_message: page.core_message,
  };
}

export async function generateSmallModeDesignSystemWithModel(
  projectFacts: DesignReportProjectFacts,
  pagePlan: DesignReportPagePlan,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const ids = [
    ...new Set([
      ...installationIds(projectFacts),
      ...installationIdsFromPagePlan(pagePlan),
    ]),
  ].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
  const objects = ids.length
    ? ids.map((id) => objectBrief(projectFacts, pagePlan, id))
    : [
        {
          object_id: "project",
          source_label: projectFacts.project_name_anonymized || "当前小型项目",
          facts: activeFacts(projectFacts).map((fact) => ({
            field_path: fact.field_path,
            value: fact.value_raw,
            source_page: fact.source.page,
          })),
        },
      ];
  const response = await createStructuredResponse<SmallModeDesignSystem>({
    name: "small_mode_design_system",
    schema: designSystemSchema,
    instructions: [
      "你是小型建筑/装置方案的总设计师。先从任务书建立一套原创、可建造、可贯穿全篇的设计系统，再由其他页面模型继续深化。",
      "任务书事实是唯一事实来源；但你被授权依据任务书明确目标生成定性的设计提案，包括原创方案命名、造型母题、空间形态、材料与灯光、互动动作、构件系统和复用方式。这些属于方案设计，不得伪装成任务书已有结论。",
      "每个对象必须有唯一且可识别的主体轮廓、空间机制和互动构件；同一对象跨概念、效果、互动和技术页面保持一致，不同对象不得互换主题。",
      "共同设计语言要统一色彩、材料家族、人物、时段、摄影高度和光线，但不能让所有对象长成同一个形状。",
      "原创性边界：只学习输入页面角色与信息密度，不复制任何参考案例的方案名称、句子、造型、图片、数字、材料组合或互动机制；proposal_name 必须是当前任务书语境下重新生成的原创名称。",
      "每个对象的 proposal_name 必须是可直接显示在图框下方的独立方案名，不得返回‘装置1’‘装置2’‘装置3’‘对象1’或‘方案3’等编号占位词；三个名称必须彼此不同。",
      "可建造性边界：每个对象都要能解释为形式—结构—构件—材料—连接—加工—运输—装配—锚固—维护；优先可重复构件、平面或单曲部件、工厂预制和现场干式装配。",
      "不得生成精确尺寸、结构计算、荷载、基础尺寸、价格、法规合规结论或任务书没有给出的性能数据。",
      "不得把传感器、喷淋、投影、水泵、香氛机、自动售货机、二维码、社交话题标签或精确色温写成已确定配置，除非任务书明确出现；优先用人的进入、绕行、停留、触摸、品鉴、共创与材料自然响应建立互动。",
      "product_or_gift 只能逐字使用当前对象任务书事实中的产品或赠品，绝对不能替换为浓缩液、茶包或其他自创赠品。",
      "若任务书把某种互动写成开放性示例，不得把它强加给所有对象；只在与对应对象和页面任务一致时采用。",
      "输出必须使用简体中文。只返回 JSON。",
    ].join("\n"),
    content: [
      {
        type: "input_text",
        text: JSON.stringify({
          project_name: projectFacts.project_name_anonymized,
          task_brief_facts: activeFacts(projectFacts).map((fact) => ({
            field_path: fact.field_path,
            value: fact.value_raw,
            source_page: fact.source.page,
          })),
          design_objects: objects,
          deck_page_roles: pagePlan.pages.map(pageRole),
          local_culture_fusion: localCultureFusionPrompt(projectFacts),
          buildability_guard: smallScaleBuildabilityPrompt(projectFacts),
        }),
      },
    ],
    reasoningEffort: "high",
    runtimeOverride,
    timeoutMs: 90_000,
    maxAttempts: 1,
  });
  const returned = response.value;
  const expectedIds = objects.map((object) => object.object_id);
  const usedIndexes = new Set<number>();
  const normalizedObjectId = (value: string) =>
    value.replace(/^(?:装置|对象|installation|object)\s*/iu, "").trim();
  const orderedObjects = expectedIds.map((id, expectedIndex) => {
    let matchIndex = returned.objects.findIndex(
      (object, index) =>
        !usedIndexes.has(index) &&
        normalizedObjectId(object.object_id) === normalizedObjectId(id),
    );
    if (matchIndex < 0 && returned.objects[expectedIndex]) {
      matchIndex = expectedIndex;
    }
    const match = returned.objects[matchIndex];
    if (!match) {
      throw new Error(`全篇设计系统缺少对象 ${id} 的一致性定义。`);
    }
    usedIndexes.add(matchIndex);
    const sourceCorpus = JSON.stringify(objects[expectedIndex]?.facts ?? []);
    const sourceLabel = objects[expectedIndex]?.source_label ?? `装置${id}`;
    const sourcedProduct = sourceProductOrGift(projectFacts, id);
    const proposalName = sanitizeProposalText(
      match.proposal_name,
      sourceCorpus,
    );
    return {
      ...match,
      object_id: id,
      proposal_name: isGenericProposalName(proposalName, id)
        ? fallbackProposalName(sourceLabel, sourceCorpus, id)
        : proposalName,
      design_claim: sanitizeProposalText(match.design_claim, sourceCorpus),
      silhouette: sanitizeProposalText(match.silhouette, sourceCorpus),
      spatial_form: sanitizeProposalText(match.spatial_form, sourceCorpus),
      interaction: groundedObjectInteraction(
        sourceLabel,
        sourceCorpus,
        match.interaction,
      ),
      material_and_light: sanitizeProposalText(
        match.material_and_light,
        sourceCorpus,
      ),
      structure_and_components: sanitizeProposalText(
        match.structure_and_components,
        sourceCorpus,
      ),
      product_or_gift:
        sourcedProduct ||
        sanitizeProposalText(match.product_or_gift, sourceCorpus),
      communication_and_reuse: sanitizeProposalText(
        match.communication_and_reuse,
        sourceCorpus,
      ),
    };
  });
  return {
    designSystem: {
      ...returned,
      project_thesis: sanitizeProposalText(
        returned.project_thesis,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      shared_language: sanitizeProposalText(
        returned.shared_language,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      palette_and_material_family: sanitizeProposalText(
        returned.palette_and_material_family,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      lighting_and_atmosphere: sanitizeProposalText(
        returned.lighting_and_atmosphere,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      construction_family: sanitizeProposalText(
        returned.construction_family,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      audience_and_camera: sanitizeProposalText(
        returned.audience_and_camera,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      cultural_translation: sanitizeProposalText(
        returned.cultural_translation,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      objects: orderedObjects,
      ip_activation: sanitizeProposalText(
        returned.ip_activation,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      operation_and_reuse: sanitizeProposalText(
        returned.operation_and_reuse,
        JSON.stringify(activeFacts(projectFacts)),
      ),
      originality_statement: sanitizeProposalText(
        returned.originality_statement,
        JSON.stringify(activeFacts(projectFacts)),
      ),
    },
    call: response.call,
  };
}

function relevantObjects(page: SmallModePage, designSystem: SmallModeDesignSystem) {
  const installationId = page.headline_zh.match(
    /装置\s*([0-9一二三四五六七八九十]+)/u,
  )?.[1];
  if (installationId) {
    return designSystem.objects.filter(
      (object) => object.object_id === installationId,
    );
  }
  if (
    page.page_type === "cover" ||
    page.page_type === "strategy" ||
    page.page_type === "comparison" ||
    page.page_type === "summary" ||
    /三件|三类|矩阵|总览|分工|联动|路径|收束|总结|复用|收起/u.test(
      page.headline_zh,
    )
  ) {
    return designSystem.objects;
  }
  return [];
}

export function designSystemLinesForPage(
  page: SmallModePage,
  designSystem: SmallModeDesignSystem,
) {
  const lines = [
    `全篇设计系统｜项目主张｜${designSystem.project_thesis}`,
    `全篇设计系统｜共同语言｜${designSystem.shared_language}`,
    `全篇设计系统｜色彩材料｜${designSystem.palette_and_material_family}`,
    `全篇设计系统｜灯光氛围｜${designSystem.lighting_and_atmosphere}`,
    `全篇设计系统｜构造家族｜${designSystem.construction_family}`,
    `全篇设计系统｜人物镜头｜${designSystem.audience_and_camera}`,
    `全篇设计系统｜文化转译｜${designSystem.cultural_translation}`,
    ...relevantObjects(page, designSystem).map(
      (object) =>
        `对象${object.object_id}｜方案名=${object.proposal_name}｜主张=${object.design_claim}｜轮廓=${object.silhouette}｜空间=${object.spatial_form}｜互动=${object.interaction}｜材料灯光=${object.material_and_light}｜构造组件=${object.structure_and_components}｜产品赠品=${object.product_or_gift}｜传播复用=${object.communication_and_reuse}`,
    ),
    ...( /IP|少女|真人/u.test(page.headline_zh)
      ? [`全篇设计系统｜IP现场化｜${designSystem.ip_activation}`]
      : []),
    ...( /复用|收起|搭建|技术|交付|总结|收束/u.test(page.headline_zh) ||
    page.page_type === "technical"
      ? [`全篇设计系统｜运营复用｜${designSystem.operation_and_reuse}`]
      : []),
  ];
  return [...new Set(lines.filter(Boolean))];
}

export function applySmallModeDesignSystem(
  pagePlan: DesignReportPagePlan,
  designSystem: SmallModeDesignSystem,
) {
  const result = structuredClone(pagePlan);
  result.pages = result.pages.map((page) => {
    const designLines = designSystemLinesForPage(page, designSystem);
    return {
      ...page,
      visual_brief: designLines,
      visual_requirements: [
        ...new Set([
          ...page.visual_requirements,
          ...designLines.slice(0, 7),
        ]),
      ],
    };
  });
  return result;
}

function isGenericProposalName(value: string | undefined, objectId: string) {
  const normalized = String(value ?? "")
    .replace(/[“”「」『』]/gu, "")
    .replace(/\s+/gu, "")
    .trim();
  return (
    !normalized ||
    new RegExp(`^(?:装置|对象|方案)?${objectId}(?:号)?$`, "u").test(
      normalized,
    ) ||
    /^(?:装置|对象|方案)\s*[一二三四五六七八九十\d]+$/u.test(normalized)
  );
}

function fallbackProposalName(
  sourceLabel: string,
  sourceCorpus: string,
  objectId: string,
) {
  const label = sourceLabel
    .split("｜")
    .slice(1)
    .join("｜")
    .replace(/^装置\s*[一二三四五六七八九十\d]+\s*[|｜:]?/u, "")
    .replace(/(?:概念|效果|技术|策略|方案汇报)$/u, "")
    .trim();
  if (label.length >= 2 && !isGenericProposalName(label, objectId)) {
    return label.slice(0, 24);
  }
  const corpus = sourceCorpus.replace(/[{}\[\]"']/gu, " ");
  if (/瓷|斗器|器物|品茗/u.test(corpus)) return "釉彩共生";
  if (/泡茶|茶香|回甘|低矿化|泡茶水|甜/u.test(corpus)) return "茶香回甘";
  if (/山泉|泉水|源头|澄澈|天然|真/u.test(corpus)) return "澄澈之镜";
  const firstUsefulPhrase = corpus
    .split(/[，,。；;：:|｜]+/u)
    .map((part) =>
      part
        .replace(/(?:核心|主题|本装置|装置\s*[一二三四五六七八九十\d]+)/gu, "")
        .trim(),
    )
    .find((part) => part.length >= 2);
  return (firstUsefulPhrase || `主题方案${objectId}`).slice(0, 24);
}
