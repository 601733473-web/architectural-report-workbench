import type { DesignReportProjectFacts } from "@/app/generated/contracts";

export const DEFAULT_REFERENCE_ID = "SYS_REFERENCE_DK05_PRESENTATION";

export type ReferenceStyleExample = NonNullable<
  DesignReportProjectFacts["reference_style_examples"]
>[number];

const sharedForbiddenTerms = [
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

export const defaultReferenceStyleExamples: ReferenceStyleExample[] = [
  {
    example_id: "RSE_DK05_ANALYSIS_004",
    page_type: "analysis",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 4,
      quote:
        "基地位置 / SITE LOCATION；奥林匹克体育中心；天河公园；珠江新城；珠江公园；场地；广州塔；广州会展。",
    },
    sanitized_template:
      "先用【城市节点】与【场地位置】建立宏观关系，再收束到【本页唯一判断】；正文只解释图面无法直接读出的关系。",
    rhetorical_pattern: ["城市背景", "周边节点", "场地定位", "核心判断"],
    headline_pattern: "分析对象 + 关系判断",
    layout_recipe: [
      "A3 横版白底，以区位图或航拍图承担主要信息",
      "左上角固定中文章节名与英文副标题",
      "用短标签直接标注城市节点，正文保持克制",
    ],
    style_tags: ["由远及近", "图解主导", "短标签", "中英双语"],
    forbidden_terms: sharedForbiddenTerms,
  },
  {
    example_id: "RSE_DK05_COMPARISON_009",
    page_type: "comparison",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 9,
      quote:
        "方案不足 NEGATIVE：酒店阻挡了公园与基地的对话；项目低区城市展示面不足，景观视野较差；酒店南侧视野被住宅严重遮挡。",
    },
    sanitized_template:
      "【方案编号】先展示方案图，再以【优势或局限】说明关键取舍；比较必须基于当前项目证据，不给没有图纸支持的方案下结论。",
    rhetorical_pattern: ["并列选项", "关键差异", "优势或局限", "取舍依据"],
    headline_pattern: "方案编号 + 判断标签",
    layout_recipe: [
      "三个等宽分栏并列展示方案",
      "每栏上部为同尺度方案图，下部为优点、局限或取舍说明",
      "用统一颜色、边界和编号保证可比较性",
    ],
    style_tags: ["并列比较", "判断明确", "图文对应", "结论收束"],
    forbidden_terms: sharedForbiddenTerms,
  },
  {
    example_id: "RSE_DK05_STRATEGY_011",
    page_type: "strategy",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 11,
      quote:
        "策略一、策略二、策略三、策略四；联动SKP；优化酒店布局；模糊场地与公园的边界；构建立体复合的步行流线体系。",
    },
    sanitized_template:
      "【策略编号】以【动作型短标题】开头，再用一条短句说明【作用对象】与【空间结果或项目价值】。",
    rhetorical_pattern: ["策略编号", "关键动作", "作用对象", "空间结果"],
    headline_pattern: "动词 + 设计对象，中文 8—16 字",
    layout_recipe: [
      "四个等宽竖向图像卡片连续排列",
      "顶部用强调色显示策略编号，中部叠加动作型标题",
      "卡片之间使用箭头表达由外部连接到内部组织的推进关系",
      "中文为主信息，英文缩小一级",
    ],
    style_tags: ["连续策略链", "动作导向", "四栏卡片", "递进关系"],
    forbidden_terms: sharedForbiddenTerms,
  },
  {
    example_id: "RSE_DK05_CONCEPT_026",
    page_type: "concept",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 26,
      quote:
        "承袭历史马场看台之意蕴，本设计以现代视角筑就绝佳的观景台，捕捉都市的动感与华彩。",
    },
    sanitized_template:
      "【概念名称】源于【当前项目已确认条件】，通过【空间转译动作】建立【关系】，最终形成【项目价值】。",
    rhetorical_pattern: ["概念命名", "来源依据", "空间转译", "价值意象"],
    headline_pattern: "四至六字概念名 + 英文概念副题",
    layout_recipe: [
      "深色全幅背景，概念名在页面视觉中心",
      "概念说明控制为一段中文与一段次级英文",
      "正文宽度收窄，不与背景主视觉争夺层级",
    ],
    style_tags: ["概念居中", "全幅背景", "双语短释", "意象化"],
    forbidden_terms: sharedForbiddenTerms,
  },
  {
    example_id: "RSE_DK05_DATA_039",
    page_type: "data",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 39,
      quote:
        "演绎·规划功能指标 / DESIGN CONCEPT·PROGRAM INDEX；打造一处融合历史记忆、公共生活与未来城市想象的全新目的地。",
    },
    sanitized_template:
      "以【功能组织判断】统领页面，当前项目指标只作为图面证据，正文最后用一句话收束【使用或城市价值】。",
    rhetorical_pattern: ["功能判断", "图解分区", "指标证据", "价值收束"],
    headline_pattern: "章节路径 + 功能指标",
    layout_recipe: [
      "轴测或体量分解图占据主要版面",
      "指标卡作为辅助信息，采用统一色彩对应功能分区",
      "页面底部只保留一句结论性价值表达",
    ],
    style_tags: ["图像主导", "指标辅助", "功能分色", "一句收束"],
    forbidden_terms: sharedForbiddenTerms,
  },
  {
    example_id: "RSE_DK05_RENDERING_042",
    page_type: "rendering",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 42,
      quote:
        "裙楼设计旨在打造一个高度联通、提倡现代生活方式的商业公园。通过多层次设计手段，打破建筑与景观的边界。",
    },
    sanitized_template:
      "【重点空间】通过【已确认空间动作】连接【对象】，形成【体验特征】，并支撑【公共、运营或场所价值】。",
    rhetorical_pattern: ["空间定位", "关键动作", "体验结果", "价值收束"],
    headline_pattern: "空间名称 + 英文副题",
    layout_recipe: [
      "效果图全幅铺满页面主体",
      "左上角使用大号空间名称与次级英文",
      "底部设置深色文字带，以一段中文和次级英文收束空间价值",
    ],
    style_tags: ["大图主导", "场景化", "底部文字带", "价值收束"],
    forbidden_terms: sharedForbiddenTerms,
  },
  {
    example_id: "RSE_DK05_PLAN_045",
    page_type: "plan",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 45,
      quote:
        "演绎·商业篇·一层平面 / DESIGN CONCEPT·RETAIL L1 PLAN；来自地铁B1出入口；来自场地东北角人流；来自酒店落客区；来自中央公园人流。",
    },
    sanitized_template:
      "先说明【本层角色】，再用短标签标注【当前项目已确认功能与流线】，正文只补充【组织结果】。",
    rhetorical_pattern: ["楼层角色", "功能落位", "流线标注", "组织结果"],
    headline_pattern: "章节路径 + 楼层或图纸名称",
    layout_recipe: [
      "平面图占据页面主要区域，场景图仅作辅助",
      "用统一分区色表示功能，用箭头和短标签表示流线",
      "保留指北针、图例和必要图纸信息，不设置长篇正文",
    ],
    style_tags: ["图纸主导", "短标签", "统一图例", "流线清晰"],
    forbidden_terms: sharedForbiddenTerms,
  },
  {
    example_id: "RSE_DK05_TECHNICAL_075",
    page_type: "technical",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 75,
      quote:
        "幕墙设计 酒店幕墙-类型A；深灰色铝板；高性能中空玻璃及影子盒；高性能透明中空玻璃；银灰色铝遮阳板；香槟色铝板；开启扇。",
    },
    sanitized_template:
      "以【已确认技术系统】为对象，标注【构件或材料】与【作用】；未完成专项论证的内容明确列为待深化项。",
    rhetorical_pattern: ["技术对象", "构件拆解", "性能作用", "待深化事项"],
    headline_pattern: "技术专题 + 系统或类型名称",
    layout_recipe: [
      "技术大图或构造分解占据主体",
      "短标签直接指向构件，不用连续长文复述图面",
      "材料、参数和性能只显示当前项目已确认信息",
    ],
    style_tags: ["构造图主导", "直接标注", "信息密集", "证据优先"],
    forbidden_terms: sharedForbiddenTerms,
  },
  {
    example_id: "RSE_DK05_DIVIDER_096",
    page_type: "section_divider",
    source: {
      document_id: DEFAULT_REFERENCE_ID,
      page: 96,
      quote: "03 方案总结 / DESIGN SUMMARY",
    },
    sanitized_template:
      "只显示【章节编号】、【中文章节名】与【英文副标题】，不在过渡页新增设计结论。",
    rhetorical_pattern: ["章节编号", "章节名称", "英文副题"],
    headline_pattern: "两位章节编号 + 四至六字章节名",
    layout_recipe: [
      "全幅背景或大面积留白建立章节停顿",
      "只保留大号章节编号与中英文章节标题",
      "不使用正文、指标卡或未经证明的总结句",
    ],
    style_tags: ["章节停顿", "极少文字", "全幅背景", "克制"],
    forbidden_terms: sharedForbiddenTerms,
  },
];
