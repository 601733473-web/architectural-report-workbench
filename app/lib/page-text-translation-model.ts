import {
  createStructuredResponse,
  type ModelRuntimeOverride,
} from "@/app/lib/model-client";
import { sanitizePresentationText } from "@/app/lib/presentation-copy";

export interface PageTextTranslationInput {
  project_name: string;
  page_type: string;
  section_title_zh: string;
  headline_zh: string;
  core_message_zh: string;
  body_zh: string;
  image_titles_zh: string[];
  diagram_labels_zh: string[];
  callouts_zh: string[];
  toc_sections: Array<{
    section_id: string;
    title_zh: string;
  }>;
}

export interface PageTextTranslation {
  section_title_en: string;
  headline_en: string;
  core_message_en: string;
  body_en: string;
  image_titles_en: string[];
  diagram_labels_en: string[];
  callouts_en: string[];
  toc_sections_en: Array<{
    section_id: string;
    title_en: string;
  }>;
}

const translationSchema = {
  type: "object",
  properties: {
    section_title_en: { type: "string" },
    headline_en: { type: "string" },
    core_message_en: { type: "string" },
    body_en: { type: "string" },
    image_titles_en: {
      type: "array",
      items: { type: "string" },
    },
    diagram_labels_en: {
      type: "array",
      items: { type: "string" },
    },
    callouts_en: {
      type: "array",
      items: { type: "string" },
    },
    toc_sections_en: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section_id: { type: "string" },
          title_en: { type: "string" },
        },
        required: ["section_id", "title_en"],
      },
    },
  },
  required: [
    "section_title_en",
    "headline_en",
    "core_message_en",
    "body_en",
    "image_titles_en",
    "diagram_labels_en",
    "callouts_en",
    "toc_sections_en",
  ],
};

const PAGE_TEXT_TRANSLATION_PROMPT = `你是建筑设计汇报的专业中英翻译 Agent。用户只编辑中文，你负责生成右侧英文。

规则：
1. 英文必须逐字段忠实对应中文，不新增事实、数字、设计动作或评价。
2. 保留项目专名、数字、单位、楼层和缩写；不得把项目地点替换成历史参考项目。
3. 标题使用简洁、专业、适合建筑汇报的英文；正文使用自然、清晰的建筑专业英语。
4. image_titles_en、diagram_labels_en、callouts_en 必须与对应中文数组数量完全一致、顺序一致；空中文返回空英文。
5. toc_sections_en 必须保留全部 section_id，并逐条翻译 title_zh。
6. 只做翻译，不解释、不改写中文、不输出后台字段说明。`;

function alignedTranslations(
  source: string[],
  translated: string[] | undefined,
) {
  return (Array.isArray(source) ? source : []).map((value, index) =>
    value.trim()
      ? sanitizePresentationText(translated?.[index] ?? "")
      : "",
  );
}

export async function translatePageTextWithModel(
  input: PageTextTranslationInput,
  runtimeOverride?: ModelRuntimeOverride,
) {
  const response = await createStructuredResponse<PageTextTranslation>({
    name: "page_text_translation",
    schema: translationSchema,
    instructions: PAGE_TEXT_TRANSLATION_PROMPT,
    content: [
      {
        type: "input_text",
        text: JSON.stringify(input),
      },
    ],
    reasoningEffort: "low",
    runtimeOverride,
    timeoutMs: 45_000,
    maxAttempts: 1,
  });
  const tocById = new Map(
    (Array.isArray(response.value.toc_sections_en)
      ? response.value.toc_sections_en
      : []
    ).map((section) => [
      section.section_id,
      section.title_en,
    ]),
  );
  return {
    translation: {
      section_title_en: sanitizePresentationText(
        response.value.section_title_en,
      ),
      headline_en: sanitizePresentationText(response.value.headline_en),
      core_message_en: sanitizePresentationText(
        response.value.core_message_en,
      ),
      body_en: sanitizePresentationText(response.value.body_en),
      image_titles_en: alignedTranslations(
        input.image_titles_zh ?? [],
        response.value.image_titles_en ?? [],
      ),
      diagram_labels_en: alignedTranslations(
        input.diagram_labels_zh ?? [],
        response.value.diagram_labels_en ?? [],
      ),
      callouts_en: alignedTranslations(
        input.callouts_zh ?? [],
        response.value.callouts_en ?? [],
      ),
      toc_sections_en: (Array.isArray(input.toc_sections) ? input.toc_sections : []).map((section) => ({
        section_id: section.section_id,
        title_en: section.title_zh.trim()
          ? sanitizePresentationText(tocById.get(section.section_id) ?? "")
          : "",
      })),
    } satisfies PageTextTranslation,
    call: response.call,
  };
}
