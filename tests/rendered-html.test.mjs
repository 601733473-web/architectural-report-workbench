import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

globalThis.__ARCH_REPORT_TEST_AUTH__ = true;

async function fetchWorker(path = "/", init = {}, envOverrides = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
      ...init,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      ...envOverrides,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function modelResponse(name, value) {
  return modelTextResponse(name, JSON.stringify(value));
}

function modelTextResponse(name, text) {
  return new Response(
    JSON.stringify({
      id: `resp_test_${name}`,
      model: "gpt-5.6-sol",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 20 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function visualReferenceSelectionEnv(
  selectedVisualId,
  requestedSchemas = [],
  options = {},
) {
  return {
    OPENAI_API_KEY: "test-visual-reference-key",
    OPENAI_MODEL: "gpt-5.6-sol",
    OPENAI_API: {
      fetch: async (request) => {
        const body = await request.json();
        const name =
          body.text?.format?.name ??
          body.response_format?.json_schema?.name;
        requestedSchemas.push(name);
        assert.equal(name, "visual_reference_decision");
        const requestPayload = body.input?.[0]?.content?.[0]?.text
          ? JSON.parse(body.input[0].content[0].text)
          : null;
        assert.ok(requestPayload?.first_principles_visual_intent);
        assert.equal("selected_visual_direction" in requestPayload, false);
        assert.ok(
          requestPayload.candidate_visual_references.length >=
            requestPayload.image_slots.length,
        );
        assert.ok(requestPayload.candidate_visual_references.length <= 12);
        assert.ok(
          requestPayload.candidate_visual_references.every(
            (candidate) =>
              !("safe_use_guidance" in candidate) &&
              !("retrieval_text" in candidate) &&
              typeof candidate.crop_quality_score === "number" &&
              candidate.semantic_summary.length <= 240,
          ),
        );
        assert.equal("available_inputs" in requestPayload, false);
        assert.equal("missing_inputs" in requestPayload, false);
        assert.equal("user_constraints" in requestPayload, false);
        options.validatePayload?.(requestPayload);
        const resolvedVisualId =
          selectedVisualId ??
          requestPayload?.candidate_visual_references?.[0]?.visual_id;
        assert.ok(resolvedVisualId);
        const slotReferenceSelections = (
          requestPayload?.image_slots ?? []
        ).map((slot, index) => ({
          slot_id: slot.slot_id,
          selected_visual_id:
            options.nullAfterFirst && index > 0
              ? null
              : options.duplicateFirst
              ? resolvedVisualId
              : selectedVisualId ??
                requestPayload.candidate_visual_references[
                  index % requestPayload.candidate_visual_references.length
                ].visual_id,
          confidence:
            options.nullAfterFirst && index > 0 ? 0.22 : 0.91,
          internal_rationale:
            options.nullAfterFirst && index > 0
              ? "其余候选只能表现相似页型，不能证明该图框的子证据。"
              : "该素材与当前图片槽的内容目的和构图需求最匹配。",
        }));
        return modelResponse(name, {
          visual_intent: {
            ...requestPayload.first_principles_visual_intent,
            conclusion_to_prove:
              requestPayload.page.core_message,
            search_focus: [
              "页面核心结论",
              "证据关系",
              "Graphic 结构",
            ],
          },
          reference_selection: {
            status: "matched",
            selection_method: "model_semantic_rerank",
            selected_visual_id: resolvedVisualId,
            confidence: 0.91,
            internal_rationale:
              "页面结论、关系类型与证据组织均与该参考图一致。",
            evaluated_at: "2026-08-03T00:00:00.000Z",
          },
          slot_reference_selections: slotReferenceSelections,
        });
      },
    },
  };
}

function visualReferenceLowConfidenceEnv(selectedVisualId) {
  return {
    OPENAI_API_KEY: "test-visual-reference-key",
    OPENAI_MODEL: "gpt-5.6-sol",
    OPENAI_API: {
      fetch: async (request) => {
        const body = await request.json();
        const name =
          body.text?.format?.name ??
          body.response_format?.json_schema?.name;
        assert.equal(name, "visual_reference_decision");
        const requestPayload = JSON.parse(
          body.input[0].content[0].text,
        );
        return modelResponse(name, {
          visual_intent:
            requestPayload.first_principles_visual_intent,
          reference_selection: {
            status: "matched",
            selection_method: "model_semantic_rerank",
            selected_visual_id: selectedVisualId,
            confidence: 0.31,
            internal_rationale:
              "该图是当前批次中内容关系与构图结构相对最接近的一张。",
            evaluated_at: "2026-08-03T00:00:00.000Z",
          },
          slot_reference_selections: requestPayload.image_slots.map(
            (slot) => ({
              slot_id: slot.slot_id,
              selected_visual_id: selectedVisualId,
              confidence: 0.31,
              internal_rationale:
                "该素材是当前批次中最接近本图框任务的一张。",
            }),
          ),
        });
      },
    },
  };
}

function schemaContainsKey(value, target) {
  if (Array.isArray(value)) {
    return value.some((item) => schemaContainsKey(item, target));
  }
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, item]) => key === target || schemaContainsKey(item, target),
  );
}

function schemaContainsEmptyObject(value) {
  if (Array.isArray(value)) return value.some(schemaContainsEmptyObject);
  if (!value || typeof value !== "object") return false;
  if (Object.keys(value).length === 0) return true;
  return Object.values(value).some(schemaContainsEmptyObject);
}

test("PDF export prints the complete A3 deck without workbench chrome", async () => {
  const [workbenchSource, modelPipelineSource, pipelineRouteSource, css] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/model-pipeline.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/pipeline/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(
    workbenchSource,
    /action:\s*"prepare_export"[\s\S]*?format,/,
  );
  assert.match(
    workbenchSource,
    /await prepareExport(?:WithRecovery)?\("pdf"/,
  );
  assert.match(
    modelPipelineSource,
    /export async function prepareExportWithModel/,
  );
  assert.match(modelPipelineSource, /await Promise\.all\(workers\)/);
  assert.match(
    pipelineRouteSource,
    /preserveGeneratedVisualAssets\([\s\S]*?payload\.pagePlan,[\s\S]*?modeled\.pagePlan/,
  );
  assert.match(
    pipelineRouteSource,
    /generated_images:\s*structuredClone\([\s\S]*?sourceTask\.generated_images/,
  );
  assert.match(
    modelPipelineSource,
    /await auditPagesWithModel\([\s\S]*?generatedPlan/,
  );
  assert.match(workbenchSource, /window\.print\(\)/);
  assert.match(workbenchSource, /导出 PDF/);
  assert.match(workbenchSource, /144 PPI · 快速/);
  assert.match(workbenchSource, /300 PPI · 高清/);
  assert.match(workbenchSource, /实际提交给图像模型/);
  assert.match(workbenchSource, /后台提示词导演草稿（未直接提交）/);
  assert.match(
    workbenchSource,
    /prompt_provenance\s*===\s*[\s\S]*?"submitted_to_image_model"/,
  );
  assert.match(
    workbenchSource,
    /preparePdfRasterAssets\(pdfExportPpi\)/,
  );
  assert.match(
    workbenchSource,
    /const cssPixelScale = ppi \/ 96;/,
  );
  assert.match(
    workbenchSource,
    /className="pdf-export-deck"[\s\S]*?plan\.pages\.map/,
  );
  assert.match(
    workbenchSource,
    /className="pdf-export-page"[\s\S]*?<A3PagePreview/,
  );
  assert.match(css, /@page\s*\{[\s\S]*?size:\s*420mm 297mm/);
  assert.match(
    css,
    /@media print[\s\S]*?\.workbench-shell > :not\(\.pdf-export-deck\)[\s\S]*?display:\s*none/,
  );
  assert.match(
    css,
    /\.pdf-export-page\s*\{[\s\S]*?break-after:\s*page/,
  );
  assert.match(
    css,
    /\.pdf-export-page \.a3-sheet\s*\{[\s\S]*?--a3-font-step:\s*5px;/,
  );
  const previewStart = workbenchSource.indexOf("function A3PagePreview");
  const previewEnd = workbenchSource.indexOf(
    "\nfunction DocumentCard",
    previewStart,
  );
  const previewSource = workbenchSource.slice(previewStart, previewEnd);
  assert.match(previewSource, /reportHeadlineEn/);
  assert.doesNotMatch(previewSource, /reportCoreMessageEn/);
  assert.doesNotMatch(previewSource, /reportBodyEn/);
  assert.doesNotMatch(previewSource, /reportDiagramLabelsEn/);
  assert.match(
    workbenchSource,
    /设计汇报 DESIGN PRESENTATION/,
  );
  assert.match(workbenchSource, /③ 公司名称/);
  assert.match(workbenchSource, /placeholder=\{DEFAULT_COMPANY_NAME\}/);
  assert.match(workbenchSource, /<span className="small-mode-cover-kicker">[\s\S]*\{reportHeadlineEn\}/);
  assert.match(workbenchSource, /SMALL_COVER_REPORT_TITLE_EN/);
  assert.match(workbenchSource, /THREE-THEME INSTALLATION DESIGN PRESENTATION/);
  assert.doesNotMatch(workbenchSource, /["']DESIGN REPORT["']/);
  assert.doesNotMatch(workbenchSource, /小型建筑\/装置设计汇报/);
  assert.match(workbenchSource, /小型建筑参考已接入/);
  assert.doesNotMatch(workbenchSource, /大型公共建筑参考已隔离/);
  assert.match(workbenchSource, /smallMode && page\.page_type === "summary" \? "设计总结"/);
  assert.match(css, /\.a3-sheet small\s*\{/);
});

test("DOCX export builds a sourced text-only design narrative", async () => {
  const [
    workbenchSource,
    docxSource,
    promptSource,
    narrativeModelSource,
    modelClientSource,
    narrativeSchemaSource,
    packageJson,
  ] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/docx-export.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/lib/model-prompts.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/design-narrative-model.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/model-client.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../schemas/design_narrative.schema.json", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(workbenchSource, /导出 DOCX/);
  assert.match(workbenchSource, /await prepareExport\("docx"\)/);
  assert.match(workbenchSource, /const designNarrative = next\.designNarrative/);
  assert.match(
    workbenchSource,
    /documents:[\s\S]*?format === "docx"[\s\S]*?"authoritative", "proposal"/,
  );
  assert.match(
    workbenchSource,
    /await import\(\s*"@\/app\/lib\/docx-export"\s*\)/,
  );
  assert.match(
    workbenchSource,
    /proposals:\s*exportFacts\.gate_b_proposals\s*\?\?\s*\[\]/,
  );
  assert.match(
    workbenchSource,
    /facts:\s*exportFacts\.facts\.filter/,
  );
  assert.match(docxSource, /建筑设计说明/);
  assert.match(docxSource, /Packer\.toBlob\(document\)/);
  assert.match(docxSource, /data\.narrative\.chapters/);
  assert.match(docxSource, /DESIGN_NARRATIVE_CHAR_LIMIT\s*=\s*1_000/);
  assert.match(docxSource, /BACKSTAGE_TEXT_PATTERN/);
  assert.doesNotMatch(docxSource, /附录|A3 页面全录|主要数据与控制指标/);
  assert.doesNotMatch(docxSource, /fact\.source\.quote|data\.pages|data\.proposals/);
  assert.match(promptSource, /正文目标长度约 1000 字/);
  assert.match(
    narrativeModelSource,
    /900-1100（约 1000 字正文，不含附录）/,
  );
  assert.match(
    modelClientSource,
    /qwenUnsupportedStructuredSchemaKeys[\s\S]*?"uniqueItems"[\s\S]*?qwenCompatibleStructuredSchema/,
  );
  assert.equal(JSON.parse(narrativeSchemaSource).properties.chapters.minItems, 8);
  assert.doesNotMatch(docxSource, /\bImageRun\b/);
  assert.doesNotMatch(docxSource, /data\.pages|data\.proposals|ImageRun/);
  assert.equal(JSON.parse(packageJson).dependencies.docx, "^9.6.1");
});

test("current text architecture guide stays aligned with the live page plan and supports page navigation", async () => {
  const [workbenchSource, css] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workbenchSource, /当前文本架构导览/);
  assert.match(workbenchSource, /plan\.sections\.map/);
  assert.match(
    workbenchSource,
    /plan\.pages\.filter\([\s\S]*?page\.section_id === section\.section_id/,
  );
  assert.match(workbenchSource, /onSelectPage\(page\.page_id\)/);
  assert.match(
    workbenchSource,
    /setSelectedPageId\(pageId\)[\s\S]*?setDetailTab\("preview"\)/,
  );
  assert.match(workbenchSource, /aria-expanded=\{showTextArchitecture\}/);
  assert.match(css, /\.text-architecture-guide\s*\{[\s\S]*?height:\s*100vh/);
  assert.match(
    css,
    /\.text-architecture-page-chain\s*\{[\s\S]*?overflow-x:\s*auto/,
  );
});

test("users edit Chinese while the agent supplies read-only English for the canonical plan", async () => {
  const [workbenchSource, css] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workbenchSource, /编辑当前页全部文字/);
  assert.match(workbenchSource, /编辑全部文字/);
  assert.match(workbenchSource, /保存中英文字/);
  assert.match(workbenchSource, /页眉项目名称/);
  assert.match(workbenchSource, /章节中文名/);
  assert.match(workbenchSource, /中文标题/);
  assert.match(workbenchSource, /Agent 英文标题/);
  assert.match(workbenchSource, /action: "translate_page_text"/);
  assert.match(workbenchSource, /停止输入约 1 秒后批量翻译本页/);
  assert.doesNotMatch(
    workbenchSource,
    /updatePageTextDraft\(\s*"headlineEn"/,
  );
  assert.doesNotMatch(
    workbenchSource,
    /updatePageTextDraft\(\s*"bodyEn"/,
  );
  assert.match(workbenchSource, /核心结论/);
  assert.match(workbenchSource, /图片图注 \/ 策略标题/);
  assert.match(workbenchSource, /图面补充说明 \/ 策略说明/);
  assert.match(workbenchSource, /目录中的全部章节/);
  assert.match(
    workbenchSource,
    /headline_zh:\s*normalizePageHeadline\(draft\.headlineZh,\s*"当前页"\)[\s\S]*?core_message:\s*draft\.coreMessage[\s\S]*?body_zh:\s*draft\.bodyZh[\s\S]*?body_copy:\s*draft\.bodyZh/,
  );
  assert.match(
    workbenchSource,
    /diagram_labels:\s*draft\.diagramLabels\.map[\s\S]*?callouts:\s*nextCallouts[\s\S]*?speaker_notes:\s*draft\.speakerNotes/,
  );
  assert.match(
    workbenchSource,
    /reviseProjectFact\([\s\S]*?页眉项目名称/,
  );
  assert.match(workbenchSource, /sections:\s*current\.pagePlan\.sections\.map/);
  assert.match(workbenchSource, /presentationTexts\.some\(containsBackstagePresentationText\)/);
  assert.match(css, /\.page-text-editor\s*\{/);
  assert.match(css, /\.page-text-pair-row\s*\{/);
  assert.match(css, /\.agent-translation-field > div/);
  assert.match(css, /\.page-text-translation-status/);
  assert.match(
    css,
    /\.page-text-editor-actions\s*\{/,
  );
});

test("page text translation batches all Chinese fields into one low-reasoning model call", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = structuredClone(fixture.default);
  const trafficRequirementPage = data.pagePlan.pages.find(
    (page) => page.page_id === "P008",
  );
  assert.ok(trafficRequirementPage);
  trafficRequirementPage.missing_information = ["交通要求"];
  trafficRequirementPage.unresolved_items = ["交通要求"];
  trafficRequirementPage.generation_status = "placeholder";
  trafficRequirementPage.body_copy = "旧交通正文";
  trafficRequirementPage.body_zh = "旧交通正文";
  trafficRequirementPage.body_en = "STALE TRAFFIC COPY";
  const page = data.pagePlan.pages.find(
    (candidate) => candidate.page_type === "analysis",
  );
  assert.ok(page);
  let requestCount = 0;
  const response = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "translate_page_text",
        projectFacts: data.projectFacts,
        pagePlan: data.pagePlan,
        pageId: page.page_id,
        text: {
          project_name: "滨水文化中心",
          page_type: page.page_type,
          section_title_zh: "项目理解",
          headline_zh: "识别场地开放界面",
          core_message_zh: "城市道路与滨水空间共同决定主要开放方向。",
          body_zh: "场地应优先回应公共到达与连续慢行。",
          diagram_labels_zh: ["城市到达", "滨水慢行"],
          callouts_zh: ["保持公共界面连续"],
          toc_sections: [],
        },
        nodeOutputs: data.nodeOutputs,
      }),
    },
    {
      OPENAI_API_KEY: "test-translation-key",
      OPENAI_MODEL: "gpt-5.6-sol",
      OPENAI_API: {
        fetch: async (request) => {
          requestCount += 1;
          const body = await request.json();
          const name = body.text.format.name;
          assert.equal(name, "page_text_translation");
          const payload = JSON.parse(body.input[0].content[0].text);
          assert.deepEqual(payload.diagram_labels_zh, [
            "城市到达",
            "滨水慢行",
          ]);
          assert.equal(payload.headline_zh, "识别场地开放界面");
          return modelResponse(name, {
            section_title_en: "PROJECT UNDERSTANDING",
            headline_en: "IDENTIFYING THE SITE'S OPEN INTERFACES",
            core_message_en:
              "Urban roads and the waterfront jointly define the primary open directions.",
            body_en:
              "The site should prioritize public arrival and continuous pedestrian movement.",
            diagram_labels_en: [
              "URBAN ARRIVAL",
              "WATERFRONT WALK",
            ],
            callouts_en: ["MAINTAIN A CONTINUOUS PUBLIC EDGE"],
            toc_sections_en: [],
          });
        },
      },
    },
  );
  assert.equal(response.status, 200, await response.clone().text());
  const translated = await response.json();
  assert.equal(requestCount, 1);
  assert.equal(
    translated.translation.headline_en,
    "IDENTIFYING THE SITE'S OPEN INTERFACES",
  );
  assert.deepEqual(translated.translation.diagram_labels_en, [
    "URBAN ARRIVAL",
    "WATERFRONT WALK",
  ]);
  assert.equal(translated.nodeOutputs.at(-1).node, "page_text_translation");
  assert.equal(translated.nodeOutputs.at(-1).model_calls, 1);
});

test("users can add one model-drafted page into the live plan and remove pages with renumbering", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = fixture.default;
  const anchorPage = data.pagePlan.pages[4];
  const factId = data.projectFacts.facts[0].fact_id;
  const requestedSchemas = [];
  const modelEnv = {
    OPENAI_API_KEY: "test-add-page-key",
    OPENAI_MODEL: "gpt-5.6-sol",
    OPENAI_API: {
      fetch: async (request) => {
        const body = await request.json();
        const name =
          body.text?.format?.name ??
          body.response_format?.json_schema?.name;
        requestedSchemas.push(name);
        assert.equal(name, "added_report_page");
        const schema =
          body.text?.format?.schema ??
          body.response_format?.json_schema?.schema;
        assert.deepEqual(
          Object.keys(schema.properties).sort(),
          [
            "body_copy",
            "body_en",
            "body_zh",
            "core_message",
            "core_message_en",
            "diagram_labels",
            "diagram_labels_en",
            "fact_refs",
            "headline_en",
            "headline_zh",
            "missing_information",
            "page_type",
            "speaker_notes",
            "visual_requirements",
          ],
        );
        return modelResponse(name, {
          page_type: "strategy",
          headline_zh: "建立连续的滨水公共空间序列",
          headline_en: "BUILDING A CONTINUOUS WATERFRONT PUBLIC REALM",
          core_message:
            "从城市界面到滨水空间形成连续开放的公共体验。",
          core_message_en:
            "A continuous and open public experience connects the urban edge to the waterfront.",
          body_zh:
            "方案通过到达、停留与滨水活动的连续组织，建立清晰的公共空间叙事。",
          body_en:
            "The proposal creates a clear public-space narrative through a continuous sequence of arrival, pause and waterfront activity.",
          body_copy:
            "方案通过到达、停留与滨水活动的连续组织，建立清晰的公共空间叙事。",
          diagram_labels: ["城市到达", "公共停留", "滨水活动"],
          diagram_labels_en: [
            "URBAN ARRIVAL",
            "PUBLIC PAUSE",
            "WATERFRONT ACTIVITY",
          ],
          speaker_notes: "先说明空间序列，再解释公共价值。",
          visual_requirements: ["公共空间序列图", "关键节点关系"],
          fact_refs: [factId],
          missing_information: [],
        });
      },
    },
  };
  const response = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "add_page",
        projectFacts: data.projectFacts,
        pagePlan: data.pagePlan,
        prompt:
          "增加一页滨水公共空间策略，说明从城市到滨水的连续体验。",
        afterPageId: anchorPage.page_id,
        nodeOutputs: data.nodeOutputs,
      }),
    },
    modelEnv,
  );
  assert.equal(response.status, 200);
  const added = await response.json();
  assert.equal(added.pagePlan.pages.length, data.pagePlan.pages.length + 1);
  assert.equal(added.pagePlan.target_page_count, 35);
  const insertedPage = added.pagePlan.pages[5];
  assert.equal(insertedPage.page_id, "P_USER_001");
  assert.equal(insertedPage.display_page_number, 6);
  assert.equal(insertedPage.section_id, anchorPage.section_id);
  assert.equal(
    insertedPage.page_type,
    "position",
    "a model-requested strategy page inside project understanding must be coerced to pre-design evidence",
  );
  assert.equal(insertedPage.generation_status, "generated");
  assert.equal(insertedPage.body_copy, insertedPage.body_zh);
  assert.match(insertedPage.body_en, /public-space narrative/i);
  assert.deepEqual(insertedPage.fact_refs, [factId]);
  assert.ok(insertedPage.style_example_refs.length > 0);
  assert.ok(insertedPage.experience_recipe_refs.length > 0);
  assert.equal("visual_task" in insertedPage, false);
  assert.ok(
    added.pagePlan.pages.every(
      (page, index) => page.display_page_number === index + 1,
    ),
  );
  assert.equal(added.nodeOutputs.at(-1).node, "page_addition");
  assert.equal(added.nodeOutputs.at(-1).model_calls, 1);
  assert.deepEqual(requestedSchemas, ["added_report_page"]);

  const [workbenchSource, css] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(workbenchSource, /新增页面/);
  assert.match(workbenchSource, /生成并插入页面/);
  assert.match(workbenchSource, /删除当前页/);
  assert.match(workbenchSource, /window\.confirm/);
  assert.match(
    workbenchSource,
    /display_page_number:\s*index \+ 1/,
  );
  assert.match(
    workbenchSource,
    /target_page_count:\s*remainingPages\.length/,
  );
  assert.match(workbenchSource, /audit_report:\s*undefined/);
  assert.match(css, /\.page-add-composer\s*\{/);
  assert.match(css, /\.delete-page-button\s*\{/);
});

test("A3 image slots use AI images first and show honest pending placeholders without library crops", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );
  for (const selector of [
    ".a3-option-diagram.a3-ai-image-slot > span",
    ".a3-concept-backdrop.a3-ai-image-slot > span",
    ".a3-rendering-scene.a3-ai-image-slot > span",
    ".a3-massing-model.a3-ai-image-slot > span",
    ".a3-visual-stage.a3-ai-image-slot .a3-visual-orbit",
    ".a3-visual-stage.a3-ai-image-slot .a3-visual-axis",
  ]) {
    assert.ok(
      css.includes(selector),
      `missing replacement rule for ${selector}`,
    );
  }
  assert.match(
    css,
    /\.a3-massing-model\.a3-ai-image-slot > span,[\s\S]*?display:\s*none;/,
  );
  assert.match(
    workbenchSource,
    /const generatedModelVisuals:[\s\S]*?canGenerateVisualImageForSlot/,
  );
  assert.match(
    workbenchSource,
    /data-visual-slot-caption-title[\s\S]*?a3-slot-inline-action[\s\S]*?AI 生成当前图/,
  );
  assert.match(css, /\.a3-slot-inline-action\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(
    workbenchSource,
    /if \(generatedForSlot\) return generatedForSlot;[\s\S]*?page\.visual_task\?\.generated_image[\s\S]*?if \(isMetricBoundaryPage\(page\) \|\| !referenceDraftsAllowed\) return undefined;/,
  );
  assert.match(workbenchSource, /图文分层 · 图片待生成/);
  assert.match(workbenchSource, /a3-pending-image-slot/);
  assert.match(css, /content:\s*attr\(data-pending-label\)/);
  assert.match(workbenchSource, /data-pending-label/);
  assert.match(
    workbenchSource,
    /function differentiatedVisualPromptSummary[\s\S]*?图片待生成：\$\{promptSummary/,
  );
  assert.doesNotMatch(
    workbenchSource,
    /a3-generated-visual-layout a3-visual-composite-layout/,
  );
  assert.match(
    workbenchSource,
    /generatedVisualForSlot\(index\)[\s\S]*?a3-strategy-visual[\s\S]*?visualAssetStyle\(slotVisual\)/,
  );
  assert.match(
    workbenchSource,
    /const strategyDescriptions =[\s\S]*?reportDiagramLabels\.slice\(0, 4\)[\s\S]*?strategyStepDescription/,
  );
  assert.match(
    workbenchSource,
    /<small>\{strategyDescriptions\[index\]\}<\/small>/,
  );
  assert.match(
    workbenchSource,
    /page\.page_type === "strategy"[\s\S]*?Array\.from\([\s\S]*?length: 4/,
  );
  assert.match(
    workbenchSource,
    /a3-generated-multi-layout[\s\S]*?slotVisuals\.map/,
  );
  assert.match(
    workbenchSource,
    /const expectedImageSlotCount = Math\.max\([\s\S]*?getVisualImageSlotCountForPage\(page\)/,
  );
  assert.match(
    workbenchSource,
    /const usesMultipleVisualFrames = expectedImageSlotCount > 1/,
  );
  assert.doesNotMatch(
    workbenchSource,
    /expectedImageSlotCount > 1\s*&&\s*slotVisuals\.some\(Boolean\)/,
  );
  assert.match(
    workbenchSource,
    /usesMultipleVisualFrames[\s\S]*?"technical",[\s\S]*?"summary",[\s\S]*?\.includes\(page\.page_type\)/,
  );
  assert.match(
    workbenchSource,
    /onGenerateVisualSlot[\s\S]*?a3-slot-inline-action[\s\S]*?AI 生成当前图/,
  );
  assert.match(workbenchSource, /selectedVisualSlotId/);
  assert.match(
    workbenchSource,
    /onDoubleClick:[\s\S]*?双击查看大图并保存/,
  );
  assert.match(workbenchSource, /function VisualAssetLightbox/);
  assert.match(workbenchSource, /保存图片/);
  assert.match(css, /\.visual-lightbox-backdrop\s*\{/);
  assert.match(css, /\.visual-lightbox-canvas img\s*\{/);
  assert.match(css, /\.a3-selectable-image-slot\.is-selected/);
  assert.match(
    workbenchSource,
    /usesFullBleedConceptVisual[\s\S]*?a3-concept-page-background[\s\S]*?generatedVisualStyle/,
  );
  assert.match(
    workbenchSource,
    /isSystemRenderingPage\(page\)[\s\S]*?系统渲染 \/ SYSTEM RENDERING/,
  );
  assert.match(
    css,
    /\.a3-system-rendering-layout[\s\S]*?\.a3-system-rendering-layout \.a3-rendering-scene/,
  );
  assert.match(
    workbenchSource,
    /page\.page_type === "summary" \? \([\s\S]*?a3-summary-visuals[\s\S]*?generatedVisualForSlot\(index\)/,
  );
  assert.match(
    css,
    /\.a3-summary-visuals\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    workbenchSource,
    /page\.page_type !== "technical" \? \([\s\S]*?const mainDrawingVisual = generatedVisualForSlot\(0\)[\s\S]*?a3-main-drawing/,
  );
  assert.match(workbenchSource, /a3-technical-image-grid/);
  assert.match(workbenchSource, /a3-technical-views/);
  assert.match(
    css,
    /\.a3-technical-views\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.doesNotMatch(
    css,
    /\.a3-type-technical \.a3-main-drawing[\s\S]*?repeating-linear-gradient/,
  );
});

test("AI image completion updates only the selected visual slot and preserves the latest page copy", async () => {
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );
  const mergeStart = workbenchSource.indexOf(
    "const acceptVisualImageResult =",
  );
  const mergeEnd = workbenchSource.indexOf(
    "const addPageFromPrompt =",
    mergeStart,
  );
  const mergeSource = workbenchSource.slice(mergeStart, mergeEnd);

  assert.ok(mergeStart >= 0 && mergeEnd > mergeStart);
  assert.match(mergeSource, /mergeVisualImagePipelineResult\(/);
  assert.match(mergeSource, /latestResultRef\.current = mergedResult/);
  assert.match(mergeSource, /setResult\(mergedResult\)/);
  assert.match(workbenchSource, /await saveVisualProgressNow\(\);/);
  assert.doesNotMatch(mergeSource, /synchronizeProposalCoverage/);
  assert.doesNotMatch(mergeSource, /setResult\(next/);
  assert.match(
    workbenchSource,
    /acceptVisualImageResult\([\s\S]*?selectedPage\.page_id,[\s\S]*?slotId/,
  );
});

test.skip("legacy multi-image analysis pages filled every slot with model-ranked references", async () => {
  const [
    workbenchSource,
    visualTaskSource,
    visualTaskModelSource,
    presentationCopySource,
    promptSource,
    css,
  ] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/visual-task.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/visual-task-model.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/presentation-copy.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/model-prompts.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(
    presentationCopySource,
    /周边公共空间[\s\S]*?城市道路与到达[\s\S]*?主要开放界面/,
  );
  assert.match(visualTaskSource, /contextualDiagramLabels/);
  assert.match(visualTaskModelSource, /slot_match_requirements/);
  assert.doesNotMatch(visualTaskModelSource, /fallbackCandidate/);
  assert.match(
    workbenchSource,
    /className="a3-generated-multi-body"/,
  );
  assert.match(
    workbenchSource,
    /callouts\[index\]\?\.label[\s\S]*?<small>/,
  );
  assert.match(css, /\.a3-generated-multi-copy \.a3-generated-multi-body/);
  assert.match(
    promptSource,
    /即使绝对匹配度不高，也必须选择本批候选中相对最合适的一张/,
  );
  assert.match(
    visualTaskModelSource,
    /minItems:\s*slotIds\.length[\s\S]*?maxItems:\s*slotIds\.length/,
  );
  assert.match(promptSource, /120—220 个中文字符/);
});

test("page depth standards and image generation stages stay visible to users", async () => {
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );
  const promptSource = await readFile(
    new URL("../app/lib/model-prompts.ts", import.meta.url),
    "utf8",
  );
  const contentDepthSource = await readFile(
    new URL("../app/lib/content-depth.ts", import.meta.url),
    "utf8",
  );

  for (const label of [
    "排队中",
    "正在整理提示词",
    "正在上传参考图",
    "模型生成中",
    "自动重试中",
    "已完成",
    "失败",
  ]) {
    assert.match(workbenchSource, new RegExp(label));
  }
  for (const label of [
    "核心结论",
    "正文说明",
    "有效证据",
    "图片图注",
    "已落实提案",
    "无来源数字",
  ]) {
    assert.match(workbenchSource, new RegExp(label));
  }
  assert.match(promptSource, /正文必须形成 2—4 条/);
  assert.match(promptSource, /2—4 条可追溯的当前项目事实或已确认提案/);
  assert.match(promptSource, /所有数字必须能在 fact_refs/);
  assert.match(contentDepthSource, /getVisualImageSlotCount/);
  assert.match(contentDepthSource, /confirmedGateBProposalsForPage/);
});

test("long-running agent work stays visible with an explicit page scope", async () => {
  const [workbenchSource, css] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workbenchSource, /function agentWorkDisplay/);
  assert.match(workbenchSource, /正在处理第 \$\{activePageNumber\}/);
  assert.match(workbenchSource, /处理范围：第 1–\$\{totalPages\} 页/);
  assert.match(workbenchSource, /className="agent-work-banner"/);
  assert.match(workbenchSource, /role="status"/);
  assert.match(workbenchSource, /aria-live="polite"/);
  assert.match(workbenchSource, /Agent 正在生成当前页文案/);
  assert.match(workbenchSource, /Agent 正在建立当前页视觉任务单/);
  assert.match(workbenchSource, /Agent 正在审核整套汇报/);
  assert.match(css, /\.agent-work-banner\s*\{/);
  assert.match(css, /\.agent-work-progress i\s*\{[\s\S]*?animation:/);
  assert.match(css, /\.workbench-shell\.agent-is-working/);
});

test("text and image providers have separate keys and usage accounts", async () => {
  const [workbenchSource, css] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const label of [
    "文本模型接口",
    "图像生成接口",
    "这套文本接口的 API Key",
    "这套图像接口的 API Key",
    "此 Key 仅发送到",
    "文本模型",
    "图像生成链路",
    "提示词输入 Token",
    "提示词输出 Token",
    "图像模型 Token",
    "平台未返回",
  ]) {
    assert.match(workbenchSource, new RegExp(label));
  }
  assert.match(
    workbenchSource,
    /nodeOutput\.node === "visual_image_generation"/,
  );
  assert.match(css, /\.api-provider-stack\s*\{/);
  assert.match(css, /\.model-usage-groups\s*\{/);
});

test("visual drafts use graphic-only crops and never render backstage copy", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );
  const visualTaskSource = await readFile(
    new URL("../app/lib/visual-task.ts", import.meta.url),
    "utf8",
  );
  const visualTaskModelSource = await readFile(
    new URL("../app/lib/visual-task-model.ts", import.meta.url),
    "utf8",
  );
  const modelPipelineSource = await readFile(
    new URL("../app/lib/model-pipeline.ts", import.meta.url),
    "utf8",
  );
  const visualReferenceSource = await readFile(
    new URL("../app/lib/visual-reference.ts", import.meta.url),
    "utf8",
  );
  const visualLibrary = JSON.parse(
    await readFile(
      new URL("../app/data/visual-reference-library.json", import.meta.url),
      "utf8",
    ),
  );

  assert.doesNotMatch(workbenchSource, /backstageVisualItems/);
  assert.doesNotMatch(workbenchSource, /visualDirectionItems/);
  assert.doesNotMatch(workbenchSource, /a3-visual-logic-overlay/);
  assert.doesNotMatch(workbenchSource, /<strong>\{task\.primary_visual\}<\/strong>/);
  assert.doesNotMatch(workbenchSource, />Graphic 结构</);
  assert.match(workbenchSource, /const displayTitle = visualTaskDisplayTitles\[pageType\]/);
  assert.match(workbenchSource, /function isBackstageVisualPayload/);
  assert.match(visualTaskSource, /function containsSerializedVisualFields/);
  assert.match(visualTaskModelSource, /function containsSerializedVisualFields/);
  assert.doesNotMatch(css, /\.a3-visual-logic-overlay/);
  assert.doesNotMatch(workbenchSource, /className="a3-strategy-arrow"/);
  assert.match(
    css,
    /\.a3-strategy-cards article > \.a3-strategy-arrow \{[\s\S]*?display:\s*none !important;/,
  );
  assert.match(
    workbenchSource,
    /const completeProjectName = projectName\.trim\(\) \|\| "当前项目";/,
  );
  assert.match(workbenchSource, /projectNameLength > 32[\s\S]*?"is-very-long"/);
  assert.match(
    css,
    /\.a3-header \{[\s\S]*?grid-template-columns:\s*minmax\(0, 42fr\) minmax\(0, 58fr\);/,
  );
  assert.match(css, /\.a3-project-name\.is-long/);
  assert.match(css, /\.a3-project-name\.is-very-long/);
  assert.match(
    modelPipelineSource,
    /project_name_anonymized:\s*sourcedProjectName \|\|\s*value\.project_name_anonymized/,
  );
  assert.match(
    workbenchSource,
    /const visualItems = reportDiagramLabels;/,
  );
  assert.match(workbenchSource, /className="a3-position-copy"/);
  assert.match(workbenchSource, /className="a3-position-visual-placeholder"/);
  assert.doesNotMatch(workbenchSource, /a3-site-target|a3-map-node/);
  assert.doesNotMatch(css, /\.a3-site-target|\.a3-map-node/);
  assert.match(
    css,
    /\.a3-position-layout \{[\s\S]*?grid-template-columns:\s*minmax\(0, 42%\) minmax\(0, 1fr\);/,
  );
  assert.match(workbenchSource, /const visibleImage = generated;/);
  assert.doesNotMatch(workbenchSource, /素材库参考图 · 双击查看大图/);
  assert.match(
    workbenchSource,
    /backgroundSize:\s*centeredWhiteMargin\s*\?\s*"90% 90%"\s*:\s*"cover"/,
  );
  assert.match(
    workbenchSource,
    /backgroundColor: centeredWhiteMargin \|\| isLibraryReference \? "#fff" : undefined/,
  );
  assert.match(
    css,
    /\.visual-slot-picker \{[\s\S]*?display:\s*flex;[\s\S]*?overflow-x:\s*auto;/,
  );
  assert.match(
    css,
    /\.visual-slot-picker button \{[\s\S]*?flex:\s*0 0 76px;[\s\S]*?width:\s*76px;/,
  );
  assert.doesNotMatch(workbenchSource, /visual-slot-picker-hint/);
  assert.doesNotMatch(css, /\.visual-slot-backstage-reference/);
  assert.doesNotMatch(workbenchSource, /className="a3-drawing-plan"/);
  assert.doesNotMatch(css, /\.a3-drawing-plan/);
  assert.match(
    workbenchSource,
    /const mainDrawingVisual = generatedVisualForSlot\(0\)/,
  );
  assert.match(
    workbenchSource,
    /slotIndex: index \+ 1/,
  );
  assert.match(
    visualTaskSource,
    /\["masterplan", "plan", "section"\]\.includes\(pageType\)[\s\S]*?return 3;/,
  );
  assert.match(
    visualTaskSource,
    /图纸页已从旧版两张辅助图升级为一张真实主图加两张辅助图/,
  );
  assert.match(
    visualTaskModelSource,
    /if \(pageType === "plan"\) return new Set\(\["floor_plan"\]\)/,
  );
  assert.match(visualTaskModelSource, /allowed_visual_ids/);
  assert.match(
    visualTaskModelSource,
    /不得用照片、效果图或无关页代替图纸/,
  );
  assert.doesNotMatch(workbenchSource, /重新匹配全部参考图/);
  assert.match(
    css,
    /\.a3-visual-stage\.a3-ai-image-slot \.a3-visual-labels,[\s\S]*?display:\s*none;/,
  );
  assert.match(
    visualTaskSource,
    /image_url:\s*versionedVisualReferenceCropUrl\(reference\)/,
  );
  assert.ok(
    visualLibrary.entries.every(
      (entry) =>
        entry.graphic_crop_path.startsWith("/reference-library/crops/") &&
        entry.graphic_crop_width > 0 &&
        entry.graphic_crop_height > 0 &&
        ["embedded_image", "rendered_component"].includes(
          entry.graphic_crop_source,
        ) &&
        typeof entry.crop_quality?.score === "number" &&
        typeof entry.crop_quality?.accepted === "boolean" &&
        typeof entry.crop_quality?.blank_ratio === "number" &&
        typeof entry.crop_quality?.text_ratio === "number" &&
        typeof entry.crop_quality?.effective_area_ratio === "number" &&
        typeof entry.crop_quality?.sharpness === "number" &&
        entry.visual_type !== "text_only" &&
        entry.visual_type !== "data_table",
    ),
  );
  const guangzhouSource = visualLibrary.source_documents.find(
    (source) =>
      source.source_document_id === "SYS_REFERENCE_DK05_PRESENTATION",
  );
  assert.equal(guangzhouSource.selected_page_count, 37);
  const guangzhouVisualsForPage = (pageNumber) =>
    visualLibrary.entries.filter(
      (entry) =>
        entry.source_document_id === "SYS_REFERENCE_DK05_PRESENTATION" &&
        entry.source_page === pageNumber,
    );
  const guangzhouHotelRoomPlans = guangzhouVisualsForPage(68);
  assert.equal(guangzhouHotelRoomPlans.length, 3);
  assert.ok(
    guangzhouHotelRoomPlans.every(
      (entry) =>
        entry.visual_type === "floor_plan" &&
        entry.layout_family === "hotel_room_plan_three_types",
    ),
  );
  const guangzhouSectionAnalysis = guangzhouVisualsForPage(82);
  assert.equal(guangzhouSectionAnalysis.length, 2);
  assert.deepEqual(
    guangzhouSectionAnalysis.map((entry) => entry.visual_type).sort(),
    ["analysis_diagram", "section"],
  );
  assert.ok(
    guangzhouSectionAnalysis.every(
      (entry) =>
        entry.layout_family === "section_function_analysis_two_slots",
    ),
  );
  for (const pageNumber of [84, 90]) {
    const references = guangzhouVisualsForPage(pageNumber);
    assert.equal(references.length, 1);
    assert.equal(references[0].visual_type, "rendering");
    assert.equal(references[0].page_role, "visual_showcase");
  }
  assert.equal(guangzhouVisualsForPage(109).length, 0);
  const guangzhouOfficeInterior = guangzhouVisualsForPage(89);
  assert.equal(guangzhouOfficeInterior.length, 1);
  assert.equal(guangzhouOfficeInterior[0].visual_type, "photo");
  assert.equal(
    guangzhouOfficeInterior[0].layout_family,
    "office_interior_rendering_crop",
  );
  const taipeiPosition = visualLibrary.entries.find(
    (entry) => entry.visual_id === "VR_URBAN_A3_P007",
  );
  assert.equal(
    taipeiPosition.graphic_crop_path,
    "/reference-library/crops/taipei-a3/p007.webp",
  );
  assert.ok(taipeiPosition.graphic_crop_width < taipeiPosition.thumbnail_width);
  const taipeiSource = visualLibrary.source_documents.find(
    (source) =>
      source.source_document_id === "SYS_REFERENCE_URBAN_A3",
  );
  assert.equal(taipeiSource.selected_page_count, 26);
  const taipeiSystemRenderings = visualLibrary.entries.filter(
    (entry) =>
      entry.source_document_id === "SYS_REFERENCE_URBAN_A3" &&
      entry.source_page === 56,
  );
  assert.equal(taipeiSystemRenderings.length, 2);
  assert.ok(
    taipeiSystemRenderings.every(
      (entry) =>
        entry.page_type === "rendering" &&
        entry.visual_type === "rendering" &&
        entry.layout_family === "system_rendering_two_angles" &&
        entry.quality === "supporting",
    ),
  );
  assert.deepEqual(
    taipeiSystemRenderings.map((entry) => entry.graphic_crop_path).sort(),
    [
      "/reference-library/crops/taipei-a3/p056-cutaway.webp",
      "/reference-library/crops/taipei-a3/p056-exterior.webp",
    ],
  );
  const taipeiPlanReferences = visualLibrary.entries.filter(
    (entry) =>
      entry.source_document_id === "SYS_REFERENCE_URBAN_A3" &&
      entry.source_page === 63,
  );
  assert.equal(taipeiPlanReferences.length, 2);
  assert.deepEqual(
    taipeiPlanReferences.map((entry) => entry.visual_type).sort(),
    ["floor_plan", "rendering"],
  );
  assert.ok(
    taipeiPlanReferences.every(
      (entry) => entry.layout_family === "plan_rendering_two_slots",
    ),
  );
  const zhuhaiSource = visualLibrary.source_documents.find(
    (source) =>
      source.source_document_id === "SYS_REFERENCE_HOTEL_MIXED_USE",
  );
  assert.equal(visualLibrary.version, 9);
  assert.equal(visualLibrary.entries.length, 161);
  assert.ok(
    visualLibrary.entries.some((entry) => !entry.crop_quality.accepted),
    "the source audit must retain rejected crops for traceability",
  );
  assert.match(
    visualReferenceSource,
    /filter\(\(entry\) => entry\.crop_quality\.accepted\)/,
  );
  assert.equal(zhuhaiSource.display_name, "Zhuhai Qiaoyuan Hotel");
  assert.equal(zhuhaiSource.source_page_count, 97);
  assert.equal(zhuhaiSource.selected_page_count, 28);
  const zhuhaiRendering = visualLibrary.entries.find(
    (entry) => entry.visual_id === "VR_HOTEL_MIXED_USE_P053",
  );
  assert.equal(zhuhaiRendering.page_type, "rendering");
  assert.equal(
    zhuhaiRendering.graphic_crop_path,
    "/reference-library/crops/zhuhai-qiaoyuan-hotel/p053.webp",
  );
  const zhuhaiVisualsForPage = (pageNumber) =>
    visualLibrary.entries.filter(
      (entry) =>
        entry.source_document_id === "SYS_REFERENCE_HOTEL_MIXED_USE" &&
        entry.source_page === pageNumber,
    );
  const zhuhaiStrategyReferences = zhuhaiVisualsForPage(30);
  assert.equal(zhuhaiStrategyReferences.length, 4);
  assert.ok(
    zhuhaiStrategyReferences.every(
      (entry) =>
        entry.visual_type === "photo" &&
        entry.layout_family === "zhq_strategy_overview_four_photos",
    ),
  );
  const zhuhaiPlanReferences = zhuhaiVisualsForPage(60);
  assert.equal(zhuhaiPlanReferences.length, 3);
  assert.deepEqual(
    zhuhaiPlanReferences.map((entry) => entry.visual_type).sort(),
    ["floor_plan", "photo", "photo"],
  );
  assert.ok(
    zhuhaiPlanReferences.every(
      (entry) => entry.layout_family === "zhq_plan_main_two_photos",
    ),
  );
  const zhuhaiOfficeRendering = zhuhaiVisualsForPage(80);
  assert.equal(zhuhaiOfficeRendering.length, 1);
  assert.equal(zhuhaiOfficeRendering[0].visual_type, "rendering");
  assert.equal(
    zhuhaiOfficeRendering[0].layout_family,
    "facade_system_interior_render_full_bleed",
  );
  const zhuhaiHotelFacadeReferences = zhuhaiVisualsForPage(85);
  assert.equal(zhuhaiHotelFacadeReferences.length, 4);
  assert.deepEqual(
    zhuhaiHotelFacadeReferences.map((entry) => entry.visual_type).sort(),
    ["elevation", "floor_plan", "rendering", "section"],
  );
  assert.ok(
    zhuhaiHotelFacadeReferences.every(
      (entry) => entry.layout_family === "zhq_hotel_facade_four_evidence",
    ),
  );
  const zhuhaiRetailRendering = zhuhaiVisualsForPage(87);
  assert.equal(zhuhaiRetailRendering.length, 1);
  assert.equal(zhuhaiRetailRendering[0].visual_type, "rendering");
  assert.equal(
    zhuhaiRetailRendering[0].layout_family,
    "zhq_retail_facade_rendering_full_bleed",
  );
  const hqSource = visualLibrary.source_documents.find(
    (source) =>
      source.source_document_id === "SYS_REFERENCE_HQ_MULTI_OPTION",
  );
  assert.equal(hqSource.selected_page_count, 44);
  const hsinchuSource = visualLibrary.source_documents.find(
    (source) =>
      source.source_document_id === "SYS_REFERENCE_HSINCHU_TOD",
  );
  assert.equal(hsinchuSource.display_name, "Hsinchu TOD");
  assert.equal(hsinchuSource.source_page_count, 91);
  assert.equal(hsinchuSource.selected_page_count, 26);
  const hsinchuReferences = visualLibrary.entries.filter(
    (entry) =>
      entry.source_document_id === "SYS_REFERENCE_HSINCHU_TOD",
  );
  assert.equal(hsinchuReferences.length, 26);
  assert.ok(
    hsinchuReferences.every(
      (entry) =>
        entry.source_page !== 91 &&
        entry.graphic_crop_width > 0 &&
        entry.graphic_crop_height > 0,
    ),
  );
  assert.ok(new Set(hsinchuReferences.map((entry) => entry.page_type)).size >= 5);
  const sectionPerspectiveReference = visualLibrary.entries.find(
    (entry) => entry.visual_id === "VR_HQ_MULTI_OPTION_P050",
  );
  assert.equal(
    sectionPerspectiveReference.layout_family,
    "section_perspective_full_width",
  );
  assert.match(
    sectionPerspectiveReference.retrieval_text,
    /section_perspective|section perspective/,
  );
  assert.doesNotMatch(
    sectionPerspectiveReference.retrieval_text,
    /system_rendering/,
  );
  const clubReferences = visualLibrary.entries.filter(
    (entry) => entry.source_page === 105 &&
      entry.source_document_id === "SYS_REFERENCE_HQ_MULTI_OPTION",
  );
  assert.equal(clubReferences.length, 3);
  assert.deepEqual(
    clubReferences.map((entry) => entry.visual_type).sort(),
    ["floor_plan", "rendering", "rendering"],
  );
  assert.deepEqual(
    clubReferences.map((entry) => entry.graphic_crop_path).sort(),
    [
      "/reference-library/crops/4399-headquarters/p105-interior.webp",
      "/reference-library/crops/4399-headquarters/p105-plan.webp",
      "/reference-library/crops/4399-headquarters/p105-terrace.webp",
    ],
  );
  assert.ok(
    clubReferences.every(
      (entry) =>
        entry.layout_family === "club_plan_with_two_supporting_views" &&
        entry.graphic_crop_width > 0 &&
        entry.graphic_crop_height > 0,
    ),
  );
  const systemRenderingReference = visualLibrary.entries.find(
    (entry) => entry.visual_id === "VR_HQ_MULTI_OPTION_P111",
  );
  assert.equal(systemRenderingReference.page_type, "rendering");
  assert.equal(
    systemRenderingReference.layout_family,
    "facade_system_sectional_render_text_left_hero_right",
  );
  assert.match(
    systemRenderingReference.retrieval_text,
    /system_rendering|facade system sectional rendering/,
  );
  assert.doesNotMatch(
    systemRenderingReference.retrieval_text,
    /cutaway axonometric model|section_perspective/,
  );
});

test("non-divider A3 pages use a white canvas while divider pages keep their special background", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    workbenchSource,
    /const isHeroPage = page\.page_type === "section_divider";/,
  );
  assert.match(css, /\.a3-sheet \{[\s\S]*?background:\s*#fff;/);
  assert.match(css, /\.a3-toc-layout \{[\s\S]*?background:\s*#fff;/);
  assert.match(css, /\.a3-hero-sheet \{[\s\S]*?background:\s*#000;/);
  assert.match(
    css,
    /\.a3-type-section_divider \.a3-concept-layout \{[\s\S]*?background:\s*#000;/,
  );
  assert.match(
    css,
    /\.a3-type-section_divider \.a3-pending-image-slot::after \{[\s\S]*?inset:\s*7% auto auto 6% !important;[\s\S]*?text-align:\s*left !important;/,
  );
  assert.match(
    css,
    /\.a3-type-section_divider \.a3-concept-backdrop\.a3-ai-image-slot \{[\s\S]*?opacity:\s*0\.5;/,
  );
  assert.match(
    css,
    /\.a3-type-cover \.a3-concept-layout \{[\s\S]*?background:\s*#fff;/,
  );
  assert.match(
    css,
    /\.a3-type-cover \.a3-pending-image-slot::after \{[\s\S]*?inset:\s*7% auto auto 6% !important;[\s\S]*?text-align:\s*left !important;/,
  );
  assert.match(
    css,
    /\.a3-type-cover \.a3-concept-backdrop\.a3-ai-image-slot \{[\s\S]*?opacity:\s*0\.33;/,
  );
  assert.match(
    css,
    /\.a3-concept-page-background \{[\s\S]*?background-size:\s*cover;/,
  );
  assert.match(
    css,
    /\.a3-type-concept\.a3-concept-page-background \.a3-concept-layout \{[\s\S]*?background:\s*transparent;/,
  );
});

test("A3 report typography and page margins use the latest calibrated shared tokens", async () => {
  const [css, workbenchSource] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Workbench.tsx", import.meta.url), "utf8"),
  ]);
  const a3Start = css.indexOf(".a3-sheet {");
  const a3End = css.indexOf("\n.preview-notice {", a3Start);
  const a3Css = css.slice(a3Start, a3End);

  assert.ok(a3Start >= 0 && a3End > a3Start);
  assert.match(a3Css, /--a3-font-step:\s*3px;/);
  assert.match(a3Css, /--a3-page-margin-x:\s*3\.31%;/);
  assert.match(
    a3Css,
    /\.a3-main\s*\{[\s\S]*?padding:\s*3\.01% var\(--a3-page-margin-x\) 2\.21%;/,
  );
  assert.match(
    a3Css,
    /\.a3-reference-sheet \.a3-main\s*\{[\s\S]*?padding:\s*1\.21% 2\.01% 1\.19%;/,
  );
  assert.match(
    a3Css,
    /\.a3-strategy-cards article\s*\{[\s\S]*?grid-template-rows:\s*12% minmax\(0, 1fr\) 12%;/,
  );
  assert.match(
    a3Css,
    /\.a3-strategy-number strong\s*\{[\s\S]*?var\(--a3-font-step\) - 1\.333px/,
  );
  assert.match(
    a3Css,
    /\.a3-strategy-number span\s*\{[\s\S]*?font-size:\s*clamp\(calc\(6px \+ var\(--a3-font-step\)\),/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p005 \.a3-position-layout\s*\{[\s\S]*?padding-left:\s*1\.19%;/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p020 \.a3-generated-multi-grid article > div\s*\{[\s\S]*?width:\s*calc\(100% - 9\.524cqw\)[\s\S]*?justify-self:\s*center;/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p020 \.a3-generated-multi-grid article > strong,[\s\S]*?article > small\s*\{[\s\S]*?width:\s*calc\(100% - 9\.524cqw\);[\s\S]*?justify-self:\s*center;/,
  );
  assert.match(workbenchSource, /CONTINUOUS PODIUM LINKS METRO AND PARK/);
  assert.match(workbenchSource, /className="a3-generated-caption-en"/);
  assert.match(
    a3Css,
    /\.a3-page-p007[\s\S]*?width:\s*calc\(100% - 23\.81cqw\);/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p007[\s\S]*?> strong,[\s\S]*?> small\s*\{[\s\S]*?width:\s*calc\(100% - 23\.81cqw\);[\s\S]*?justify-self:\s*center;/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p008 \.a3-generated-multi-grid article > div\s*\{[\s\S]*?height:\s*calc\(100% - 4\.762cqw\);/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p016 \.a3-strategy-cards article,[\s\S]*?\.a3-page-p017 \.a3-strategy-cards article/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p021 \.a3-generated-multi-layout\s*\{[\s\S]*?height:\s*100%[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p005 \.a3-data-stage,[\s\S]*?\.a3-page-p024 \.a3-data-stage\s*\{[\s\S]*?background:\s*#f5f6f4 !important;/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p024 \.a3-massing-model\s*\{[\s\S]*?width:\s*calc\(43% - 2\.381cqw\);/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p029 \.a3-drawing-grid\.a3-section-feature-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) calc\(59% \+ 11\.905cqw\);/,
  );
  assert.match(
    a3Css,
    /\.a3-page-p034 \.a3-summary-visuals\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.18fr\) minmax\(0, 0\.82fr\);/,
  );
  assert.match(
    css,
    /@media print[\s\S]*?\.pdf-export-page \.a3-page-p021 \.a3-generated-multi-layout[\s\S]*?\.pdf-export-page \.a3-page-p024 \.a3-data-stage/,
  );
  assert.doesNotMatch(
    css,
    /\.pdf-export-page \.a3-page-p024 \.a3-massing-model\s*\{[^}]*background:\s*#f5f6f4 !important;/,
  );
  assert.ok(
    (a3Css.match(/var\(--a3-font-step\)/g) ?? []).length >= 80,
    "A3 absolute font sizes should share the one-step enlargement token",
  );
  assert.doesNotMatch(a3Css, /font-size:\s*clamp\(\s*[0-9.]+px/);
  assert.doesNotMatch(a3Css, /font-size:\s*[0-9.]+px\s*;/);
});

test("operating UI uses one permanent readable design system", async () => {
  const [css, workbenchSource] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const [token, value] of [
    ["--space-1", "4px"],
    ["--space-2", "8px"],
    ["--space-3", "12px"],
    ["--space-4", "16px"],
    ["--space-5", "20px"],
    ["--space-6", "24px"],
    ["--space-7", "28px"],
    ["--space-8", "32px"],
    ["--fs-xs", "11px"],
    ["--fs-md", "13px"],
    ["--fs-xl", "20px"],
    ["--radius-sm", "6px"],
    ["--radius-md", "8px"],
    ["--radius-lg", "12px"],
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*${value};`));
  }
  assert.match(css, /--stroke-subtle:\s*1px solid var\(--line\);/);
  assert.match(css, /--shadow-sm:/);
  assert.match(css, /--shadow-md:/);
  assert.match(css, /--shadow-lg:/);
  assert.match(
    css,
    /\.workbench-shell \.panel-heading h2,[\s\S]*?font-size:\s*var\(--fs-xl\);/,
  );
  assert.doesNotMatch(workbenchSource, /uiTextSize|toggleUiTextSize/);
  assert.doesNotMatch(workbenchSource, /大字模式|标准字号/);
});

test("A3 text auto-fits its frame and never uses an ellipsis as the overflow result", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workbenchSource, /const a3AutoFitTextSelector = \[/);
  assert.match(workbenchSource, /const a3TextConstraintSelector = \[/);
  assert.match(workbenchSource, /function textExceedsA3Frame\(/);
  assert.match(workbenchSource, /fittedFontSize - 0\.25/);
  assert.match(workbenchSource, /dataset\.a3Overflow = "true"/);
  assert.match(
    css,
    /\.a3-sheet \[data-a3-autofit="true"\][\s\S]*?text-overflow:\s*clip !important;[\s\S]*?-webkit-line-clamp:\s*unset !important;/,
  );
  assert.match(
    css,
    /\.a3-sheet \[data-a3-overflow="true"\],[\s\S]*?overflow:\s*visible !important;/,
  );
  assert.match(workbenchSource, /\.small-mode-page-copy h3/);
  assert.match(workbenchSource, /\.small-mode-page-core/);
  assert.match(workbenchSource, /if \(!smallMode\) \{/);
  assert.match(
    css,
    /\.a3-small-mode-sheet \.a3-main\s*\{[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.small-mode-layout-rendering \.small-mode-visual-grid\s*\{[\s\S]*?height:\s*100%;/,
  );
  assert.match(
    css,
    /\.small-mode-page-copy\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/,
  );
  assert.match(
    css,
    /\.a3-small-mode-sheet \[data-a3-overflow="true"\],[\s\S]*?overflow:\s*hidden !important;/,
  );
  assert.match(
    css,
    /\.a3-small-mode-sheet \.small-mode-layout-concept \.small-mode-info-grid,[\s\S]*?display:\s*none;/,
  );
  assert.match(
    css,
    /\.a3-small-mode-sheet \.small-mode-layout-technical \.small-mode-info-grid\s*\{[\s\S]*?display:\s*none;/,
  );
  assert.match(workbenchSource, /summaryReuseVisuals/);
  assert.match(workbenchSource, /page\.page_type === "summary"/);
  assert.match(workbenchSource, /candidate\.page_type === "rendering"/);
  assert.match(
    css,
    /\.small-mode-visual-grid article\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) clamp\(54px, 18%, 92px\);/,
  );
  assert.match(
    css,
    /\.small-mode-visual-grid article > div:not\(\.small-mode-visual-caption\)/,
  );
  assert.match(css, /\.small-mode-visual-caption\s*\{[\s\S]*?position:\s*static;/);
  assert.match(css, /\.small-mode-visual-caption strong\s*\{[\s\S]*?color:\s*#5a3827;/);
  assert.match(css, /\.small-mode-visual-caption\s*\{[\s\S]*?text-align:\s*center;/);
  assert.match(css, /\.small-mode-visual-caption\s*\{[\s\S]*?font-family:\s*Arial/);
  assert.match(css, /\.small-mode-visual-caption small\s*\{[\s\S]*?color:\s*#7b5a48;/);
  assert.match(css, /\.small-mode-visual-caption small\s*\{[\s\S]*?display:\s*block;/);
  assert.match(css, /\.small-mode-visual-caption\s*\{[\s\S]*?background:\s*linear-gradient/);
  assert.match(workbenchSource, /hasSmallModeRenderingAnalysis/);
  assert.match(workbenchSource, /small-mode-rendering-analysis-card/);
  assert.match(workbenchSource, /exportPptx/);
  assert.match(workbenchSource, /导出 PPTX/);
  assert.match(
    css,
    /\.small-mode-rendering-analysis-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(280px, 44%\) minmax\(0, 1fr\);/,
  );
  assert.match(
    css,
    /\.small-mode-rendering-analysis-card\s*\{[\s\S]*?margin-top:\s*2cm;[\s\S]*?margin-bottom:\s*0;/,
  );
  assert.match(
    css,
    /\.small-mode-rendering-main-card\s*\{[\s\S]*?height:\s*calc\(100% \+ 2cm\);/,
  );
  assert.match(
    css,
    /\.small-mode-rendering-copy\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*2;/,
  );
  assert.match(
    css,
    /\.a3-generated-multi-grid article \{[\s\S]*?grid-template-rows:[\s\S]*?var\(--a3-multi-caption-title-row\)[\s\S]*?var\(--a3-multi-caption-detail-row\);/,
  );
  assert.match(
    css,
    /\.a3-summary-visuals article \{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) 10%;/,
  );
  assert.match(
    css,
    /\.a3-supporting-views > article \{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) 24%;/,
  );
});

test("image prompts allow necessary graphic labels without turning the image into a report page", async () => {
  const [promptSource, imageModelSource] = await Promise.all([
    readFile(new URL("../app/lib/model-prompts.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/lib/visual-image-model.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(promptSource, /图片本身必须完全无文字/);
  assert.doesNotMatch(promptSource, /图中不得生成任何可见文字/);
  assert.match(promptSource, /必要的少量短标签、步骤序号、方向箭头和图例符号/);
  assert.match(promptSource, /不得生成独立标题栏、底部白色说明带/);
  assert.match(promptSource, /所有新增可见文字必须使用简体中文/);
  assert.match(promptSource, /不得出现任何后台变量名、枚举值或内部编号/);
  assert.match(promptSource, /不得把“所有文字、汉字、英文、数字”作为一刀切的负面词/);
  assert.match(imageModelSource, /function cleanNegativePrompt/);
  assert.match(imageModelSource, /function sanitizeImagePromptText/);
  assert.match(imageModelSource, /P\\d\{1,4\}\[\\s_-\]\*D\\d\{1,3\}/);
  assert.match(imageModelSource, /blanketTextBans/);
});

test("small-building rendering analysis uses a wide model-generated white-model diagram", async () => {
  const [visualTaskSource, imageModelSource, workbenchSource] =
    await Promise.all([
      readFile(new URL("../app/lib/visual-task.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/lib/visual-image-model.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/Workbench.tsx", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(visualTaskSource, /`\$\{objectName\}设计分析图`/);
  assert.match(visualTaskSource, /纯白白模线稿风格/);
  assert.match(visualTaskSource, /"landscape"/);
  assert.match(
    visualTaskSource,
    /isWhiteModelAnalysis[\s\S]*?不添加写实材质或灯光/,
  );
  assert.match(imageModelSource, /smallModeAnalysisDiagram/);
  assert.match(imageModelSource, /四周预留约8%至12%的纯白边/);
  assert.match(imageModelSource, /2至4个与当前方案直接相关的简体中文短标签/);
  assert.match(
    workbenchSource,
    /centeredWhiteMargin: true/,
  );
  assert.match(
    workbenchSource,
    /backgroundPosition:[\s\S]*?centeredWhiteMargin[\s\S]*?"center"/,
  );
  assert.match(workbenchSource, /backgroundSize: centeredWhiteMargin \? "90% 90%"/);
});

test("P8 traffic prompts fail closed unless current project facts reach the image model", async () => {
  const imageModelSource = await readFile(
    new URL("../app/lib/visual-image-model.ts", import.meta.url),
    "utf8",
  );

  assert.match(imageModelSource, /export function auditTrafficPromptTransfer/);
  assert.match(imageModelSource, /当前页已核验事实（必须作为本图语义依据/);
  assert.match(imageModelSource, /project_identity_and_site_context/);
  assert.match(imageModelSource, /current_project_facts/);
  assert.match(imageModelSource, /confirmed_gate_b_design_directions/);
  assert.match(imageModelSource, /P8 三塔交通图硬约束/);
  assert.match(imageModelSource, /项目视觉不变量契约/);
  assert.match(imageModelSource, /trafficPromptTransferAudit\.ok/);
  assert.match(
    imageModelSource,
    /P8 项目事实未完整传递到图像模型，已阻止提交/,
  );
  assert.doesNotMatch(imageModelSource, /imageModel: "gpt-5\.6-luna"/);
  assert.match(imageModelSource, /imageRuntimeOverride/);
});

test("multi-image pages use stable varied frame families and concept pages 19 to 21 have distinct visual structures", async () => {
  const [css, workbenchSource, visualTaskSource, schemaSource] =
    await Promise.all([
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/Workbench.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/lib/visual-task.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../schemas/page_plan.schema.json", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(schemaSource, /"frame_layout"/);
  assert.match(schemaSource, /"lead_top"/);
  assert.match(schemaSource, /"lead_left"/);
  assert.match(schemaSource, /"two_by_two"/);
  assert.match(schemaSource, /"two_by_three"/);
  assert.match(visualTaskSource, /function getVisualImageSlotCountForPage/);
  assert.match(visualTaskSource, /return 6;/);
  assert.match(visualTaskSource, /return 4;/);
  assert.match(visualTaskSource, /function getVisualFrameLayout/);
  assert.match(workbenchSource, /a3-frame-layout-\$\{frameLayout\}/);
  assert.match(css, /\.a3-generated-multi-grid\.a3-frame-layout-lead_top/);
  assert.match(css, /\.a3-generated-multi-grid\.a3-frame-layout-lead_left/);
  assert.match(css, /\.a3-generated-multi-grid\.a3-frame-layout-two_by_two/);
  assert.match(css, /\.a3-generated-multi-grid\.a3-frame-layout-two_by_three/);
  assert.match(workbenchSource, /conceptBackdropVisual \? "" : "a3-pending-image-slot"/);
  assert.match(workbenchSource, /a3-concept-sequence-layout/);
  assert.match(workbenchSource, /a3-concept-sequence-sheet/);
  assert.match(
    css,
    /\.a3-concept-sequence-layout \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?grid-template-rows:\s*18% minmax\(0, 1fr\);/,
  );
  assert.match(
    css,
    /\.a3-concept-sequence-layout \.a3-generated-multi-grid \{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/,
  );
  assert.match(
    css,
    /\.a3-reference-sheet\.a3-concept-sequence-sheet \.a3-main \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);/,
  );
  assert.match(
    css,
    /--a3-multi-caption-title-row:\s*clamp\([\s\S]*?--a3-multi-caption-detail-row:\s*clamp\(/,
  );
});

test("system rendering stays a local facade sectional rendering instead of a whole-building program diagram", async () => {
  const [
    visualTaskSource,
    imageModelSource,
    referenceModelSource,
    promptSource,
    storeSource,
  ] =
    await Promise.all([
      readFile(new URL("../app/lib/visual-task.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/lib/visual-image-model.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/lib/visual-task-model.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/lib/model-prompts.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/lib/local-project-store.ts", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(visualTaskSource, /局部立面系统剖切渲染/);
  assert.match(visualTaskSource, /连续三至五层典型楼层/);
  assert.match(visualTaskSource, /一至两个立面开间/);
  assert.match(visualTaskSource, /严禁整栋塔楼全景/);
  assert.match(imageModelSource, /facade system sectional rendering/);
  assert.match(imageModelSource, /酒店\/公寓\/办公\/商业彩色分区/);
  assert.match(imageModelSource, /SYSTEM RENDERING 最终构图锁定/);
  assert.match(imageModelSource, /system_rendering_image_audit/);
  assert.match(imageModelSource, /local_facade_system_cutaway/);
  assert.match(imageModelSource, /连续两次未通过局部立面剖切视觉审核/);
  assert.match(imageModelSource, /上一张结果已被视觉审核拒绝/);
  assert.match(
    imageModelSource,
    /effectiveContinuityInput = systemRendering[\s\S]*?undefined[\s\S]*?: continuityInput/,
  );
  assert.match(imageModelSource, /prompt_zh: imageCall\.submittedPrompt/);
  assert.match(imageModelSource, /primary_program: systemRendering/);
  assert.match(imageModelSource, /relevantProposals = isSystemRenderingPage/);
  assert.match(
    referenceModelSource,
    /isSystemRenderingCutawayReference/,
  );
  assert.match(
    promptSource,
    /system rendering 在本产品中专指“局部立面系统剖切渲染”/,
  );
  assert.match(promptSource, /不得选择整栋 section perspective/);
  assert.match(storeSource, /cutaway axonometric model/);
  assert.match(storeSource, /delete page\.visual_task/);
});

test("AI image regeneration never sends company-library images to the model", async () => {
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );

  const routeSource = await readFile(
    new URL("../app/api/pipeline/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workbenchSource, /const referenceImageUrl = referenceCrop/);
  assert.doesNotMatch(routeSource, /selectVisualReferenceWithModel/);
  assert.match(routeSource, /const generationReference = undefined/);
  assert.match(routeSource, /stripVisibleReferenceLibraryAssets\(modeled\.pagePlan\)/);
});

test("P20 concept copy and image slots share the same four spatial moves", async () => {
  const [proposalSource, visualTaskSource] = await Promise.all([
    readFile(new URL("../app/lib/gate-b-proposals.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/visual-task.ts", import.meta.url), "utf8"),
  ]);
  for (const label of [
    "连续基座连接地铁与绿地",
    "三塔错位形成高低梯度",
    "空中庭院与连桥延伸公共界面",
    "立体绿化回应热湿气候",
  ]) {
    assert.match(proposalSource, new RegExp(label));
    assert.match(visualTaskSource, new RegExp(label));
  }
  assert.match(proposalSource, /四项条件，分别转化为\$\{p20VisualSteps\.join/);
});

test("ready pages use amber while generated and reviewed pages remain green", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.status-generated,[\s\S]*?\.status-reviewed \{[\s\S]*?var\(--forest-soft\)/,
  );
  assert.match(
    css,
    /\.status-ready \{[\s\S]*?var\(--amber-soft\)[\s\S]*?var\(--amber\)/,
  );
});

test("cover, contents, and divider cards use a light gray background in the page-level directory", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    workbenchSource,
    /\["cover", "toc", "section_divider"\]\.includes\([\s\S]*?page\.page_type[\s\S]*?"structural-page"/,
  );
  assert.match(
    css,
    /\.page-row\.structural-page \{[\s\S]*?background:\s*#f0f2f1;/,
  );
  assert.match(
    css,
    /\.page-row\.structural-page\.selected \{[\s\S]*?background:\s*#e6eae7;/,
  );
});

test("user-requested AI images show their prompt and model without leaking provider internals", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workbenchSource, /真实图像模型结果/);
  assert.doesNotMatch(workbenchSource, /查看后台生图提示词/);
  assert.doesNotMatch(workbenchSource, /generated_image\.size/);
  assert.doesNotMatch(workbenchSource, /provider_response_id/);
  assert.match(workbenchSource, /本次 AI 生图记录/);
  assert.match(workbenchSource, /selectedGeneratedImage\.model/);
  assert.match(workbenchSource, /selectedGeneratedImage\.prompt_zh/);
  assert.match(workbenchSource, /selectedGeneratedImage\.submitted_prompt_zh/);
  assert.match(workbenchSource, /实际提交给图像模型 · 提示正文/);
  assert.match(workbenchSource, /后台提示词导演草稿（未直接提交）/);
  assert.doesNotMatch(workbenchSource, /visual-reference-gallery/);
  assert.doesNotMatch(workbenchSource, /onChooseReference/);
  assert.doesNotMatch(workbenchSource, /internal_rationale/);
  assert.doesNotMatch(workbenchSource, /reference_selection\.confidence/);
  assert.doesNotMatch(workbenchSource, /visual-option-list/);
  assert.doesNotMatch(workbenchSource, /选择视觉方向/);
  assert.match(
    workbenchSource,
    /isConfirmed \? "confirmed" : item\.severity/,
  );
  assert.match(
    css,
    /\.issue-card\.issue-confirmed \{[\s\S]*?background:\s*var\(--forest-soft\)/,
  );
});

test("server-renders the multi-project reporting workbench without reference catalog details", async () => {
  const response = await fetchWorker();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  assert.match(html, /<title>智能建筑汇报文本工作台<\/title>/);
  assert.match(html, /智能建筑汇报文本工作台/);
  assert.match(html, /DESIGN REPORT STUDIO/);
  assert.doesNotMatch(html, /大字模式|标准字号/);
  assert.match(html, /更多工具/);
  assert.match(html, /上传任务书并自动快速建立34页框架/);
  assert.match(html, /快速开始/);
  assert.doesNotMatch(html, /\bMVP\b/);
  assert.match(html, /页级目录/);
  assert.doesNotMatch(html, /事实就绪/);
  assert.doesNotMatch(html, /提案就绪/);
  assert.match(html, /生成整套终稿文案/);
  assert.match(html, /生成整套 AI 图纸/);
  assert.match(html, /导出 PPTX/);
  assert.match(html, /primary-actions-rail/);
  assert.ok(
    html.indexOf("primary-actions-rail") > html.indexOf("workflow-rail"),
    "整套操作按钮应位于流程区下方",
  );
  assert.doesNotMatch(visibleHtml, /框架就绪|内容就绪/);
  assert.doesNotMatch(html, />Gate A</);
  assert.doesNotMatch(html, />Gate B</);
  assert.match(html, /历史参考已经准备好/);
  assert.match(html, /参考库已接入/);
  assert.match(html, /设计档案/);
  assert.match(html, /新建设计/);
  assert.doesNotMatch(visibleHtml, /历史参考 0[1-9]/);
  assert.doesNotMatch(visibleHtml, /Guangzhou Yuexiu/);
  assert.doesNotMatch(visibleHtml, /Taipei A3/);
  assert.doesNotMatch(visibleHtml, /4399 Headquarters/);
  assert.doesNotMatch(visibleHtml, /Zhuhai Qiaoyuan Hotel/);
  assert.doesNotMatch(visibleHtml, /Hsinchu TOD/);
  assert.match(html, /上传本项目任务书/);
  assert.match(html, /API 设置/);
  assert.doesNotMatch(visibleHtml, />模型用量</);
  assert.doesNotMatch(html, /滨水文化中心概念方案竞赛/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("saved local projects refresh their locked historical reference library", async () => {
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    workbenchSource,
    /reference_experience:\s*initialResult\.projectFacts\.reference_experience/,
  );
  assert.match(
    workbenchSource,
    /synchronizeProposalCoverage\(\s*restoredProjectFacts,\s*saved\.result\.pagePlan/,
  );
});

test.skip("legacy visual-task creation used model semantic reranking immediately", async () => {
  const [routeSource, visualTaskSource, visualTaskModelSource] = await Promise.all([
    readFile(new URL("../app/api/pipeline/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/visual-task.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/visual-task-model.ts", import.meta.url), "utf8"),
  ]);
  assert.match(routeSource, /payload\.rematch === true/);
  assert.match(visualTaskSource, /rebuildFromCurrentPage = false/);
  assert.match(
    visualTaskSource,
    /previousSlots\.get\(slot\.slot_id\) === slot\.label/,
  );
  assert.match(visualTaskModelSource, /slotSpecificMatches = new Map/);
  assert.match(visualTaskModelSource, /slotSpecificEntries/);
  assert.match(visualTaskModelSource, /slotCandidateIds\.get\(slot\.slot_id\)/);
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const pipeline = fixture.default;
  assert.equal(pipeline.pagePlan.pages.length, 34);
  assert.equal(pipeline.modelCallCount, 0);
  assert.equal(pipeline.pagePlan.pages[0].page_type, "cover");
  assert.equal(pipeline.pagePlan.pages[1].page_type, "toc");
  assert.equal(pipeline.pagePlan.pages[1].headline_zh, "目录");
  assert.ok(pipeline.pagePlan.sections.length >= 6);

  const visualPage = pipeline.pagePlan.pages.find(
    (page) => page.page_type === "concept",
  );
  assert.ok(visualPage);
  const creationSchemas = [];
  const visualTaskResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: visualPage.page_id,
        nodeOutputs: pipeline.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(undefined, creationSchemas),
  );
  assert.equal(visualTaskResponse.status, 200);
  const visualTaskResult = await visualTaskResponse.json();
  const visualTaskPage = visualTaskResult.pagePlan.pages.find(
    (page) => page.page_id === visualPage.page_id,
  );
  assert.equal(
    visualTaskPage.visual_task.status,
    visualTaskPage.visual_task.missing_inputs.length
      ? "awaiting_materials"
      : "ready",
  );
  assert.equal("options" in visualTaskPage.visual_task, false);
  assert.equal("selected_option_id" in visualTaskPage.visual_task, false);
  assert.equal(
    visualTaskPage.visual_task.visual_intent.conclusion_to_prove,
    visualPage.core_message,
  );
  assert.ok(
    visualTaskPage.visual_task.visual_intent.graphic_elements.length >= 1,
  );
  assert.ok(
    visualTaskPage.visual_task.visual_intent.search_focus.length >= 1,
  );
  assert.equal(
    visualTaskPage.visual_task.reference_selection.status,
    "matched",
  );
  assert.ok(visualTaskPage.visual_task.reference_crop);
  assert.deepEqual(creationSchemas, ["visual_reference_decision"]);
  assert.ok(
    visualTaskPage.visual_task.visual_reference_refs.length > 3,
  );
  assert.ok(
    visualTaskPage.visual_task.visual_reference_refs.length <= 12,
  );
  const lockedImageSlots = structuredClone(
    visualTaskPage.visual_task.image_slots,
  );
  assert.equal(
    visualTaskPage.visual_task.reference_recipe_refs.length,
    visualPage.experience_recipe_refs.length,
  );

  const selectedReferenceId =
    visualTaskPage.visual_task.visual_reference_refs[2];
  const referenceSchemas = [];
  const refineVisualResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: visualTaskResult.projectFacts,
        pagePlan: visualTaskResult.pagePlan,
        pageId: visualPage.page_id,
        message: "希望突出首层公共空间，并采用三步推导。",
        nodeOutputs: visualTaskResult.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(
      selectedReferenceId,
      referenceSchemas,
    ),
  );
  assert.equal(refineVisualResponse.status, 200);
  const refinedVisualResult = await refineVisualResponse.json();
  const refinedVisualPage = refinedVisualResult.pagePlan.pages.find(
    (page) => page.page_id === visualPage.page_id,
  );
  assert.equal(
    refinedVisualPage.visual_task.reference_crop.visual_id,
    selectedReferenceId,
  );
  assert.equal(
    refinedVisualPage.visual_task.reference_selection.status,
    "matched",
  );
  assert.equal(
    refinedVisualPage.visual_task.reference_selection.selection_method,
    "model_semantic_rerank",
  );
  assert.deepEqual(referenceSchemas, ["visual_reference_decision"]);
  assert.deepEqual(
    refinedVisualPage.visual_task.image_slots,
    lockedImageSlots,
    "visual refinement may replace images but must not resize or recreate frames",
  );
  assert.equal(
    refinedVisualResult.nodeOutputs.at(-1).execution,
    "openai_model",
  );
  assert.equal(
    refinedVisualResult.nodeOutputs.at(-1).model_calls,
    1,
  );
  assert.match(
    refinedVisualPage.visual_task.reference_crop.image_url,
    /^\/reference-library\//,
  );
  assert.ok(refinedVisualPage.visual_task.conversation.length >= 3);
  assert.ok(
    refinedVisualPage.visual_task.constraints.some((item) =>
      item.includes("首层公共空间"),
    ),
  );

  const rematchedReferenceId =
    refinedVisualPage.visual_task.visual_reference_refs[4];
  const rematchSchemas = [];
  const rematchResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: refinedVisualResult.projectFacts,
        pagePlan: refinedVisualResult.pagePlan,
        pageId: visualPage.page_id,
        rematch: true,
        nodeOutputs: refinedVisualResult.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(
      rematchedReferenceId,
      rematchSchemas,
    ),
  );
  assert.equal(rematchResponse.status, 200);
  const rematchResult = await rematchResponse.json();
  const rematchedPage = rematchResult.pagePlan.pages.find(
    (page) => page.page_id === visualPage.page_id,
  );
  assert.equal(
    rematchedPage.visual_task.reference_crop.visual_id,
    rematchedReferenceId,
  );
  assert.deepEqual(
    rematchedPage.visual_task.image_slots,
    lockedImageSlots,
    "reference rematching must preserve frame geometry",
  );
  assert.deepEqual(rematchSchemas, ["visual_reference_decision"]);
  assert.equal(rematchResult.nodeOutputs.at(-1).model_calls, 1);

  const lowConfidenceReferenceId =
    refinedVisualPage.visual_task.visual_reference_refs[3];
  const lowConfidenceResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: refinedVisualResult.projectFacts,
        pagePlan: refinedVisualResult.pagePlan,
        pageId: visualPage.page_id,
        message: "重新检索内容关系更接近的参考。",
        nodeOutputs: refinedVisualResult.nodeOutputs,
      }),
    },
    visualReferenceLowConfidenceEnv(lowConfidenceReferenceId),
  );
  assert.equal(lowConfidenceResponse.status, 200);
  const lowConfidenceResult = await lowConfidenceResponse.json();
  const lowConfidencePage = lowConfidenceResult.pagePlan.pages.find(
    (page) => page.page_id === visualPage.page_id,
  );
  assert.equal(
    lowConfidencePage.visual_task.reference_selection.status,
    "matched",
  );
  assert.equal(
    lowConfidencePage.visual_task.reference_selection.selected_visual_id,
    lowConfidenceReferenceId,
  );
  assert.equal(
    lowConfidencePage.visual_task.reference_selection.confidence,
    0.31,
  );
  assert.equal(
    lowConfidencePage.visual_task.reference_crop.visual_id,
    lowConfidenceReferenceId,
  );
  assert.ok(
    lowConfidencePage.visual_task.slot_reference_crops.length >= 1,
  );

  assert.ok(refinedVisualPage.visual_task.draft_output);
  assert.ok(
    refinedVisualPage.visual_task.draft_output.zones.length >= 1,
  );
  assert.equal(
    refinedVisualPage.visual_task.draft_output.status,
    refinedVisualPage.visual_task.missing_inputs.length
      ? "conceptual"
      : "material_ready",
  );
  assert.match(refinedVisualPage.visual_task.draft_output.prompt_zh, /当前项目证据/);
});

test("visual-task creation keeps every frame empty and makes no reference-library model call", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const pipeline = structuredClone(fixture.default);
  const page = pipeline.pagePlan.pages.find(
    (candidate) => candidate.page_type === "strategy",
  );
  assert.ok(page);
  const requestedSchemas = [];
  const response = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: page.page_id,
        nodeOutputs: pipeline.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(undefined, requestedSchemas),
  );
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  const plannedPage = result.pagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  assert.ok(plannedPage.visual_task.image_slots.length >= 1);
  assert.equal(plannedPage.visual_task.reference_crop, undefined);
  assert.equal(plannedPage.visual_task.slot_reference_crops, undefined);
  assert.equal(plannedPage.visual_task.reference_selection, undefined);
  assert.deepEqual(plannedPage.visual_task.visual_reference_refs, []);
  assert.deepEqual(requestedSchemas, []);
  assert.equal(result.nodeOutputs.at(-1).model_calls, 0);
  assert.equal(result.nodeOutputs.at(-1).execution, "local_rule");
});

test.skip("legacy project-understanding task creation matched visible historical evidence", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const pipeline = structuredClone(fixture.default);
  const forbiddenPageTypes = new Set([
    "concept",
    "strategy",
    "masterplan",
    "plan",
    "section",
    "comparison",
    "rendering",
    "technical",
    "summary",
  ]);
  const understandingPages = pipeline.pagePlan.pages.filter(
    (page) => page.section_id === "S01",
  );
  assert.ok(understandingPages.length >= 3);
  assert.ok(
    understandingPages.every(
      (page) => !forbiddenPageTypes.has(page.page_type),
    ),
  );

  const page = understandingPages.find(
    (candidate) => candidate.page_type === "analysis",
  );
  assert.ok(page);
  const allowedVisualTypes = new Set([
    "site_map",
    "analysis_diagram",
    "concept_diagram",
    "data_table",
    "photo",
  ]);
  let requestPayload;
  const response = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: page.page_id,
        nodeOutputs: pipeline.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(undefined, [], {
      validatePayload(payload) {
        requestPayload = payload;
        assert.equal(payload.page.section_title, "项目理解");
        assert.ok(payload.candidate_visual_references.length >= 1);
        assert.ok(
          payload.candidate_visual_references.every((candidate) =>
            allowedVisualTypes.has(candidate.visual_type),
          ),
        );
        assert.ok(
          payload.slot_match_requirements.every(
            (requirement) =>
              requirement.allowed_visual_types.every((visualType) =>
                allowedVisualTypes.has(visualType),
              ) && /严禁总平面/.test(requirement.rejection_rule),
          ),
        );
      },
    }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.ok(requestPayload);
  const result = await response.json();
  const resultPage = result.pagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  const visualTypesById = new Map(
    requestPayload.candidate_visual_references.map((candidate) => [
      candidate.visual_id,
      candidate.visual_type,
    ]),
  );
  assert.ok(resultPage.visual_task.slot_reference_crops.length >= 1);
  assert.ok(
    resultPage.visual_task.slot_reference_crops.every((crop) =>
      allowedVisualTypes.has(visualTypesById.get(crop.visual_id)),
    ),
  );
});

test.skip("legacy empty visual selections migrate before schema validation", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const pipeline = fixture.default;
  const page = pipeline.pagePlan.pages.find(
    (candidate) => candidate.page_type === "concept",
  );
  assert.ok(page);

  const createResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: page.page_id,
        nodeOutputs: pipeline.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(),
  );
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  const legacyPlan = structuredClone(created.pagePlan);
  const legacyPage = legacyPlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  legacyPage.visual_task.reference_selection = {
    status: "no_suitable_reference",
    selection_method: "model_semantic_rerank",
    selected_visual_id: null,
    confidence: 0.2,
    internal_rationale: "旧版本空结果",
    evaluated_at: "2026-08-02T00:00:00.000Z",
  };
  delete legacyPage.visual_task.reference_crop;
  const rematchedReferenceId =
    legacyPage.visual_task.visual_reference_refs[4];

  const migrateResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: created.projectFacts,
        pagePlan: legacyPlan,
        pageId: page.page_id,
        nodeOutputs: created.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(rematchedReferenceId),
  );
  assert.equal(
    migrateResponse.status,
    200,
    await migrateResponse.clone().text(),
  );
  const migrated = await migrateResponse.json();
  const migratedPage = migrated.pagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  assert.equal(
    migratedPage.visual_task.reference_selection.status,
    "matched",
  );
  assert.equal(
    migratedPage.visual_task.reference_selection.selected_visual_id,
    rematchedReferenceId,
  );
  assert.equal(
    migratedPage.visual_task.reference_crop.visual_id,
    rematchedReferenceId,
  );
});

test.skip("legacy visual draft started from a visible reference crop", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const pipeline = fixture.default;
  const page = pipeline.pagePlan.pages.find(
    (candidate) => candidate.page_type === "concept",
  );
  assert.ok(page);

  const createTaskResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: page.page_id,
        nodeOutputs: pipeline.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(),
  );
  assert.equal(createTaskResponse.status, 200);
  const created = await createTaskResponse.json();
  const createdPage = created.pagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  assert.ok(createdPage.visual_task.draft_output);
  assert.equal(
    createdPage.visual_task.visual_intent.relationship_to_show,
    "atmosphere",
  );
  assert.equal(createdPage.visual_task.production_mode, "render_direction");
  assert.equal(createdPage.visual_task.image_slots.length, 1);
  assert.equal(
    createdPage.visual_task.image_slots[0].label,
    "核心概念背景效果图",
  );
  const chosen = created;
  const chosenPage = createdPage;
  const {
    visual_task: chosenVisualTask,
    ...chosenPageContentAndLayout
  } = chosenPage;

  const apiConfig = {
    baseUrl:
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.7-plus",
    apiKey: "test-token-plan-key",
    imageModel: "wan2.7-image",
  };
  const referenceImageDataUrl =
    "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==";
  const requestedUrls = [];
  let imageTransportAttempts = 0;
  let imageRequestPrompt = "";
  const imageResponseUrl = "https://example.test/wan2.7-image.png";
  const generatedResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_visual_image",
        projectFacts: chosen.projectFacts,
        pagePlan: chosen.pagePlan,
        pageId: page.page_id,
        slotId: chosenPage.visual_task.image_slots[0].slot_id,
        frameAspectRatio: 1.41,
        referenceImage: {
          visualId: chosenPage.visual_task.reference_crop.visual_id,
          imageUrl: chosenPage.visual_task.reference_crop.image_url,
          dataUrl: referenceImageDataUrl,
        },
        nodeOutputs: chosen.nodeOutputs,
        apiConfig,
      }),
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_API: {
        fetch: async (request) => {
          requestedUrls.push(request.url);
          const body = await request.json();
          if (request.url.endsWith("/chat/completions")) {
            assert.equal(body.model, apiConfig.model);
            assert.equal(
              body.response_format.json_schema.name,
              "visual_image_prompt",
            );
            const promptInput = JSON.parse(body.messages[1].content);
            assert.equal(
              promptInput.project_identity_and_site_context.project_name,
              "滨水文化中心概念方案竞赛",
            );
            assert.equal(
              promptInput.project_identity_and_site_context.site_location.value,
              "临江市旧港东岸，北邻城市公园，西接轨道站点。",
            );
            assert.equal(
              promptInput.project_identity_and_site_context.design_goal.value,
              "建立城市与滨水之间连续开放的公共文化界面。",
            );
            assert.equal(
              promptInput.selected_image_slot_output_spec.aspect_ratio,
              "7:5",
            );
            assert.equal(
              promptInput.selected_image_slot_output_spec.frame_geometry_locked,
              true,
            );
            assert.equal(
              promptInput.reference_mode,
              "不使用图片参考，完全依据当前项目内容直接生成",
            );
            return Response.json({
              id: "resp_visual_prompt",
              model: apiConfig.model,
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      prompt_zh:
                        "横版建筑概念示意图，以场地条件和公共空间关系形成清晰的三步空间推导，留出中文图注空白。",
                      negative_prompt_zh:
                        "Logo、水印、乱码、密集小字、历史项目内容、最终建成效果",
                      visual_type: "建筑概念推导图",
                      aspect_ratio: "7:5",
                      style_keywords: [
                        "建筑概念",
                        "三步推导",
                        "横版构图",
                        "清晰留白",
                      ],
                    }),
                  },
                },
              ],
              usage: { prompt_tokens: 120, completion_tokens: 40 },
            });
          }

          assert.equal(
            request.url,
            "https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
          );
          imageTransportAttempts += 1;
          if (imageTransportAttempts <= 2) {
            const networkError = new TypeError("fetch failed");
            networkError.cause = { code: "ECONNRESET" };
            throw networkError;
          }
          assert.equal(body.model, apiConfig.imageModel);
          assert.equal(body.parameters.size, "1344*960");
          assert.equal(body.parameters.n, 1);
          assert.equal(body.parameters.prompt_extend, undefined);
          assert.equal(body.parameters.watermark, false);
          assert.equal(body.parameters.thinking_mode, false);
          assert.equal(body.input.messages[0].content.length, 1);
          assert.equal(body.input.messages[0].content[0].type, "text");
          imageRequestPrompt = body.input.messages[0].content[1].text;
          assert.match(
            body.input.messages[0].content[1].text,
            /横版建筑概念示意图，以场地条件和公共空间关系形成清晰的三步空间推导，在图面对象内部安排简体中文短标签。/,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /项目名称：滨水文化中心概念方案竞赛/,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /场地位置与周边条件：临江市旧港东岸，北邻城市公园，西接轨道站点。/,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /任务书设计目标：建立城市与滨水之间连续开放的公共文化界面。/,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /宽:高=7:5，目标输出 1344×960/,
          );
          assert.match(
            body.input.messages[0].content[0].text,
            /当前项目背景/,
          );
          assert.doesNotMatch(
            body.input.messages[0].content[0].text,
            /历史素材库|公司汇报文件|参考图中的文字|reference_crop/,
          );
          assert.equal(body.parameters.negative_prompt, undefined);
          return Response.json({
            request_id: "img_visual_001",
            output: {
              choices: [
                {
                  message: {
                    content: [{ image: imageResponseUrl }],
                  },
                },
              ],
            },
            usage: { image_count: 1 },
          });
        },
      },
    },
  );

  assert.equal(
    generatedResponse.status,
    200,
    await generatedResponse.clone().text(),
  );
  assert.equal(imageTransportAttempts, 3);
  const generated = await generatedResponse.json();
  const generatedPage = generated.pagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  const {
    visual_task: generatedVisualTask,
    ...generatedPageContentAndLayout
  } = generatedPage;
  assert.deepEqual(
    generatedPageContentAndLayout,
    chosenPageContentAndLayout,
    "generating an image asset must not change page copy, evidence, labels, or layout fields",
  );
  for (const field of [
    "page_id",
    "objective",
    "production_mode",
    "primary_visual",
    "visual_intent",
    "available_inputs",
    "missing_inputs",
    "generation_steps",
    "constraints",
    "reference_recipe_refs",
    "visual_reference_refs",
    "reference_selection",
    "reference_crop",
  ]) {
    assert.deepEqual(
      generatedVisualTask[field],
      chosenVisualTask[field],
      `visual task field ${field} must remain stable`,
    );
  }
  assert.equal(
    generatedPage.visual_task.image_prompt.aspect_ratio,
    "7:5",
  );
  assert.equal(
    generatedPage.visual_task.generated_image.image_url,
    imageResponseUrl,
  );
  assert.equal(
    generatedPage.visual_task.generated_image.model,
    apiConfig.imageModel,
  );
  assert.match(
    generatedPage.visual_task.generated_image.prompt_zh,
    /当前只生成这一个图框的一张独立素材/,
  );
  assert.equal(
    generatedPage.visual_task.generated_image.submitted_prompt_zh,
    imageRequestPrompt,
  );
  assert.equal(
    generatedPage.visual_task.generated_image.prompt_zh,
    imageRequestPrompt,
  );
  assert.equal(
    generatedPage.visual_task.generated_image.submitted_negative_prompt_zh,
    generatedPage.visual_task.image_prompt.negative_prompt_zh,
  );
  assert.equal(
    generatedPage.visual_task.generated_image.prompt_provenance,
    "submitted_to_image_model",
  );
  assert.doesNotMatch(
    generatedPage.visual_task.generated_image.prompt_zh,
    /evidence_mapping|P\d{1,4}-D\d+|图片槽\s+S\d+/i,
  );
  assert.match(
    generatedPage.visual_task.generated_image.prompt_zh,
    /严禁生成独立图名、图片编号、标题栏、底部白色图注带/,
  );
  assert.match(
    generatedPage.visual_task.generated_image.prompt_zh,
    /必须使用简体中文短标签，直接放在对应地图区域、建筑、色块、箭头或引线旁边/,
  );
  assert.match(
    generatedPage.visual_task.generated_images[0].prompt_zh,
    /不得把其他步骤、其他方案或完整页面拼入这张图/,
  );
  assert.equal(
    generatedPage.visual_task.generated_images[0].prompt_provenance,
    "submitted_to_image_model",
  );
  assert.equal(
    generatedPage.visual_task.generated_image.reference_guidance,
    undefined,
  );
  assert.equal(generated.nodeOutputs.at(-1).model_calls, 2);
  assert.equal(generated.nodeOutputs.at(-1).image_count, 1);
  assert.deepEqual(requestedUrls, [
    `${apiConfig.baseUrl}/chat/completions`,
    "https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    "https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    "https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  ]);

  const directPagePlan = structuredClone(chosen.pagePlan);
  const directPage = directPagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  delete directPage.visual_task.reference_crop;
  delete directPage.visual_task.slot_reference_crops;
  delete directPage.visual_task.reference_selection;
  directPage.visual_task.visual_reference_refs = [];
  const directGeneratedResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_visual_image",
        projectFacts: chosen.projectFacts,
        pagePlan: directPagePlan,
        pageId: page.page_id,
        slotId: directPage.visual_task.image_slots[0].slot_id,
        frameAspectRatio: 1.41,
        nodeOutputs: chosen.nodeOutputs,
        apiConfig,
      }),
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_API: {
        fetch: async (request) => {
          const body = await request.json();
          if (request.url.endsWith("/chat/completions")) {
            const promptInput = JSON.parse(body.messages[1].content);
            assert.equal(
              promptInput.reference_mode,
              "不使用图片参考，完全依据当前项目内容直接生成",
            );
            return Response.json({
              id: "resp_direct_visual_prompt",
              model: apiConfig.model,
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      prompt_zh:
                        "依据当前项目场地、公共空间目标与图注直接生成建筑概念图。",
                      negative_prompt_zh: "历史项目、文字、Logo、水印",
                      visual_type: "建筑概念图",
                      aspect_ratio: "7:5",
                      style_keywords: ["建筑概念", "横版构图"],
                    }),
                  },
                },
              ],
              usage: { prompt_tokens: 90, completion_tokens: 25 },
            });
          }
          assert.equal(body.input.messages[0].content.length, 1);
          assert.equal(
            typeof body.input.messages[0].content[0].image,
            "undefined",
          );
          assert.match(
            body.input.messages[0].content[0].text,
            /当前项目背景/,
          );
          return Response.json({
            request_id: "img_direct_visual_001",
            output: {
              choices: [
                {
                  message: {
                    content: [{ image: "https://example.test/direct.png" }],
                  },
                },
              ],
            },
            usage: { image_count: 1 },
          });
        },
      },
    },
  );
  assert.equal(
    directGeneratedResponse.status,
    200,
    await directGeneratedResponse.clone().text(),
  );
  const directGenerated = await directGeneratedResponse.json();
  const directGeneratedPage = directGenerated.pagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  assert.equal(
    directGeneratedPage.visual_task.generated_images[0].image_url,
    "https://example.test/direct.png",
  );
  assert.equal(
    directGeneratedPage.visual_task.generated_images[0].reference_guidance,
    undefined,
  );
  assert.match(
    directGeneratedPage.visual_task.generated_images[0].disclaimer,
    /本次未使用后台素材库图片/,
  );

  const responsesApiConfig = {
    baseUrl: "https://ruishiglobal.com/v1",
    model: "gpt-5.5",
    apiKey: "test-text-key",
    imageBaseUrl: "https://ruishiglobal.com/v1",
    imageModel: "gpt-image-2",
    imageApiKey: "test-image-key",
  };
  let imageGenerationBody;
  let imageGenerationAttempts = 0;
  const responsesGenerated = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_visual_image",
        projectFacts: chosen.projectFacts,
        pagePlan: chosen.pagePlan,
        pageId: page.page_id,
        slotId: chosenPage.visual_task.image_slots[0].slot_id,
        referenceImage: {
          visualId: chosenPage.visual_task.reference_crop.visual_id,
          imageUrl: chosenPage.visual_task.reference_crop.image_url,
          dataUrl: referenceImageDataUrl,
        },
        nodeOutputs: chosen.nodeOutputs,
        apiConfig: responsesApiConfig,
      }),
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_API: {
        fetch: async (request) => {
          const body = await request.json();
          if (body.text?.format?.name === "visual_image_prompt") {
            return modelResponse("visual_image_prompt", {
              prompt_zh:
                "横版建筑概念示意图，以三步空间动作组织无文字主视觉。",
              negative_prompt_zh:
                "文字、数字、Logo、水印、历史项目内容",
              visual_type: "建筑概念推导图",
              aspect_ratio: "7:5",
              style_keywords: ["建筑概念", "横版构图", "清晰留白"],
            });
          }
          imageGenerationAttempts += 1;
          imageGenerationBody = body;
          if (imageGenerationAttempts === 1) {
            return Response.json(
              {
                error: {
                  message: "当前分组上游负载已饱和，请稍后再试",
                },
              },
              { status: 429, headers: { "retry-after": "0" } },
            );
          }
          if (imageGenerationAttempts === 2) {
            return Response.json({
              id: "resp_luna_text_only_001",
              status: "completed",
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: "图片暂未就绪" }],
                },
              ],
            });
          }
          return Response.json({
            id: "resp_luna_image_001",
            model: responsesApiConfig.imageModel,
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_image",
                    image_url: {
                      url: "https://example.test/luna-generated.png",
                    },
                  },
                ],
              },
            ],
          });
        },
      },
    },
  );
  assert.equal(responsesGenerated.status, 200);
  assert.equal(imageGenerationAttempts, 3);
  const responsesGeneratedResult = await responsesGenerated.json();
  const retriedImagePage = responsesGeneratedResult.pagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  assert.equal(
    retriedImagePage.visual_task.generated_images[0].attempt_count,
    3,
  );
  assert.equal(
    retriedImagePage.visual_task.generated_images[0].image_url,
    "https://example.test/luna-generated.png",
  );
  assert.equal(imageGenerationBody.model, "gpt-5.5");
  assert.equal(
    retriedImagePage.visual_task.generated_images[0].model,
    "gpt-5.5",
  );
  assert.equal(imageGenerationBody.input[0].role, "user");
  assert.match(
    imageGenerationBody.input[0].content[0].text,
    /当前项目背景/,
  );
  assert.equal(imageGenerationBody.input[0].content.length, 1);
  assert.equal(imageGenerationBody.input[0].content[0].type, "input_text");
  assert.equal(
    imageGenerationBody.tools[0].type,
    "image_generation",
  );
});

test.skip("legacy four-step strategy pages prefilled four library slots", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const pipeline = fixture.default;
  const strategyPage = pipeline.pagePlan.pages.find(
    (page) => page.page_type === "strategy",
  );
  assert.ok(strategyPage);

  const taskResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: strategyPage.page_id,
        nodeOutputs: pipeline.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(undefined, []),
  );
  assert.equal(taskResponse.status, 200);
  const planned = await taskResponse.json();
  const plannedPage = planned.pagePlan.pages.find(
    (page) => page.page_id === strategyPage.page_id,
  );
  assert.equal(plannedPage.visual_task.image_slots.length, 4);
  assert.equal(plannedPage.visual_task.slot_reference_crops.length, 4);
  assert.deepEqual(
    plannedPage.visual_task.slot_reference_crops.map(
      (crop) => crop.slot_id,
    ),
    ["S1", "S2", "S3", "S4"],
  );
  assert.equal(
    new Set(
      plannedPage.visual_task.slot_reference_crops.map(
        (crop) => crop.visual_id,
      ),
    ).size,
    4,
  );
  const selectedStrategySlot = plannedPage.visual_task.image_slots[2];
  selectedStrategySlot.label = "总平面策略图解";
  selectedStrategySlot.purpose =
    "以平面关系表达开放空间策略，不作为当前项目技术图纸。";
  selectedStrategySlot.prompt_focus = "公共空间意向图";

  const partialMatchResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: strategyPage.page_id,
        nodeOutputs: pipeline.nodeOutputs,
      }),
    },
    visualReferenceSelectionEnv(undefined, [], {
      duplicateFirst: true,
    }),
  );
  assert.equal(partialMatchResponse.status, 200);
  const partialMatch = await partialMatchResponse.json();
  const partialMatchPage = partialMatch.pagePlan.pages.find(
    (page) => page.page_id === strategyPage.page_id,
  );
  assert.equal(
    partialMatchPage.visual_task.slot_reference_crops.length,
    4,
  );
  assert.equal(
    new Set(
      partialMatchPage.visual_task.slot_reference_crops.map(
        (crop) => crop.visual_id,
      ),
    ).size,
    4,
  );

  const apiConfig = {
    baseUrl:
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.7-plus",
    apiKey: "test-token-plan-key",
    imageModel: "wan2.7-image",
  };
  let imageCallCount = 0;
  const generatedResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_visual_image",
        projectFacts: planned.projectFacts,
        pagePlan: planned.pagePlan,
        pageId: strategyPage.page_id,
        slotId: selectedStrategySlot.slot_id,
        frameAspectRatio: 0.56,
        visibleCaption: {
          title: "P005-D1: 打开城市界面",
          detail: "以连续开放空间串联公共活动与慢行路径。",
        },
        referenceImage: {
          visualId:
            plannedPage.visual_task.slot_reference_crops[2].visual_id,
          imageUrl:
            plannedPage.visual_task.slot_reference_crops[2].image_url,
          dataUrl:
            "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==",
        },
        nodeOutputs: planned.nodeOutputs,
        apiConfig,
      }),
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_API: {
        fetch: async (request) => {
          const body = await request.json();
          if (request.url.endsWith("/chat/completions")) {
            const promptInput = JSON.parse(body.messages[1].content);
            assert.equal(promptInput.selected_image_slot.slot_id, "S3");
            assert.equal(
              promptInput.selected_image_slot_output_spec.aspect_ratio,
              "0.56:1",
            );
            assert.equal(
              promptInput.selected_image_slot_output_spec.measured_from_rendered_frame,
              true,
            );
            assert.deepEqual(promptInput.selected_image_slot_visible_caption, {
              title: "打开城市界面",
              detail: "以连续开放空间串联公共活动与慢行路径。",
              consistency_requirement:
                "生成图像的主体、空间动作、流线关系和视觉重点必须直接证明该语义；不得把标题照抄进图片，不得表达其他图框、其他策略或其他方案。",
            });
            return Response.json({
              id: "resp_strategy_prompt",
              model: apiConfig.model,
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      prompt_zh:
                        "evidence_mapping；建筑策略步骤图，使用一致视角和统一图解语言表达一个独立空间动作，保留图注留白。",
                      negative_prompt_zh:
                        "文字、数字、标签、Logo、水印、完整页面、多个步骤拼图",
                      visual_type: "策略步骤图",
                      aspect_ratio: "0.56:1",
                      style_keywords: [
                        "策略图解",
                        "统一视角",
                        "独立步骤",
                        "无文字",
                      ],
                    }),
                  },
                },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 30 },
            });
          }

          imageCallCount += 1;
          assert.equal(body.parameters.size, "960*1344");
          assert.match(
            body.input.messages[0].content[1].text,
            /当前只生成这一个图框的一张独立素材/,
          );
          assert.doesNotMatch(
            body.input.messages[0].content[1].text,
            /图片槽\s+S3|evidence_mapping|P005-D1/i,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /证据叠加关系；建筑策略步骤图/,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /宽:高=0.56:1，目标输出 960×1344/,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /内容主题：打开城市界面/,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /具体含义：以连续开放空间串联公共活动与慢行路径/,
          );
          assert.match(
            body.input.messages[0].content[1].text,
            /严禁生成独立图名、图片编号、标题栏、底部白色图注带/,
          );
          assert.match(
            body.input.messages[0].content[0].image,
            /^data:image\/webp;base64,/,
          );
          return Response.json({
            request_id: `strategy_image_${imageCallCount}`,
            output: {
              choices: [
                {
                  message: {
                    content: [
                      {
                        image: `https://example.test/strategy-${imageCallCount}.png`,
                      },
                    ],
                  },
                },
              ],
            },
            usage: { image_count: 1 },
          });
        },
      },
    },
  );

  assert.equal(
    generatedResponse.status,
    200,
    await generatedResponse.clone().text(),
  );
  const generated = await generatedResponse.json();
  const generatedPage = generated.pagePlan.pages.find(
    (page) => page.page_id === strategyPage.page_id,
  );
  assert.equal(imageCallCount, 1);
  assert.equal(generatedPage.visual_task.generated_images.length, 1);
  assert.deepEqual(
    generatedPage.visual_task.generated_images.map((image) => image.slot_id),
    ["S3"],
  );
  assert.equal(generated.nodeOutputs.at(-1).model_calls, 2);
  assert.equal(generated.nodeOutputs.at(-1).image_count, 1);
});

test("the directory page keeps a visible planning flow but never calls the image model", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const pipeline = fixture.default;
  const page = pipeline.pagePlan.pages.find(
    (candidate) => candidate.page_type === "toc",
  );
  assert.ok(page);

  const createResponse = await fetchWorker("/api/pipeline", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "visual_task",
      projectFacts: pipeline.projectFacts,
      pagePlan: pipeline.pagePlan,
      pageId: page.page_id,
      nodeOutputs: pipeline.nodeOutputs,
    }),
  });
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  const createdPage = created.pagePlan.pages.find(
    (candidate) => candidate.page_id === page.page_id,
  );
  assert.equal(
    createdPage.visual_task.visual_intent.relationship_to_show,
    "index",
  );
  assert.ok(createdPage.visual_task.draft_output);

  let modelRequestCount = 0;
  const generateResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_visual_image",
        projectFacts: created.projectFacts,
        pagePlan: created.pagePlan,
        pageId: page.page_id,
        slotId: "S1",
        nodeOutputs: created.nodeOutputs,
        apiConfig: {
          baseUrl: "https://custom-model.example/v1",
          model: "qwen-test",
          apiKey: "test-key",
          imageModel: "wan2.7-image",
        },
      }),
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_API: {
        fetch: async () => {
          modelRequestCount += 1;
          throw new Error("image model must not be called for a data page");
        },
      },
    },
  );

  assert.equal(generateResponse.status, 400);
  const errorBody = await generateResponse.json();
  assert.match(errorBody.error, /当前页面或图片槽不存在|目录页/);
  assert.equal(modelRequestCount, 0);
});

test.skip("legacy drawing generation received a visible pre-matched reference", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const pipeline = fixture.default;
  const expectedDrawingProfile = {
    masterplan: /总平面|场地规划|正投影俯视/,
    plan: /楼层平面图|核心筒|正投影俯视/,
    section: /剖面|剖切方向|垂直空间/,
    technical: /技术|立面|系统剖切|构件层级/,
  };

  for (const pageType of ["masterplan", "plan", "section", "technical"]) {
    const sourcePage = pipeline.pagePlan.pages.find(
      (candidate) => candidate.page_type === pageType,
    );
    assert.ok(sourcePage, `fixture must include a ${pageType} page`);
    const taskResponse = await fetchWorker(
      "/api/pipeline",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "visual_task",
          projectFacts: pipeline.projectFacts,
          pagePlan: pipeline.pagePlan,
          pageId: sourcePage.page_id,
          nodeOutputs: pipeline.nodeOutputs,
        }),
      },
      visualReferenceSelectionEnv(undefined, []),
    );
    assert.equal(taskResponse.status, 200);
    const planned = await taskResponse.json();
    const plannedPage = planned.pagePlan.pages.find(
      (candidate) => candidate.page_id === sourcePage.page_id,
    );
    const selectedSlot = plannedPage.visual_task.image_slots[0];
    const selectedCrop =
      plannedPage.visual_task.slot_reference_crops.find(
        (crop) => crop.slot_id === selectedSlot.slot_id,
      ) ?? plannedPage.visual_task.reference_crop;
    assert.ok(selectedCrop, `${pageType} main slot needs a reference crop`);

    let imageCallCount = 0;
    let submittedImagePrompt = "";
    const generatedResponse = await fetchWorker(
      "/api/pipeline",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "generate_visual_image",
          projectFacts: planned.projectFacts,
          pagePlan: planned.pagePlan,
          pageId: plannedPage.page_id,
          slotId: selectedSlot.slot_id,
          frameAspectRatio: 1.4,
          referenceImage: {
            visualId: selectedCrop.visual_id,
            imageUrl: selectedCrop.image_url,
            dataUrl:
              "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==",
          },
          nodeOutputs: planned.nodeOutputs,
          apiConfig: {
            baseUrl:
              "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
            model: "qwen3.7-plus",
            apiKey: "test-key",
            imageModel: "wan2.7-image",
          },
        }),
      },
      {
        OPENAI_API_KEY: "test-key",
        OPENAI_API: {
          fetch: async (request) => {
            const body = await request.json();
            if (request.url.endsWith("/chat/completions")) {
              const promptInput = JSON.parse(body.messages[1].content);
              assert.equal(promptInput.image_usage_policy.usage, "source_drawing");
              assert.ok(promptInput.drawing_generation_profile.length >= 6);
              assert.match(
                promptInput.drawing_generation_profile.join(" "),
                expectedDrawingProfile[pageType],
              );
              return Response.json({
                id: `drawing_prompt_${pageType}`,
                model: "qwen3.7-plus",
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        prompt_zh:
                          "依据上传原图进行建筑图纸概念重绘，保持几何边界、投影方式和主要空间关系，清晰线稿，有限色彩，无文字。",
                        negative_prompt_zh:
                          "文字、数字、尺寸、标高、轴号、Logo、水印、虚构结构",
                        visual_type: "建筑图纸概念重绘",
                        aspect_ratio: "7:5",
                        style_keywords: [
                          "建筑制图",
                          "概念重绘",
                          "清晰线稿",
                          "有限色彩",
                        ],
                      }),
                    },
                  },
                ],
                usage: { prompt_tokens: 80, completion_tokens: 30 },
              });
            }
            imageCallCount += 1;
            submittedImagePrompt = body.input.messages[0].content[1].text;
            return Response.json({
              request_id: `drawing_image_${pageType}`,
              output: {
                choices: [
                  {
                    message: {
                      content: [
                        {
                          image: `https://example.test/${pageType}-drawing.png`,
                        },
                      ],
                    },
                  },
                ],
              },
              usage: { image_count: 1 },
            });
          },
        },
      },
    );
    assert.equal(
      generatedResponse.status,
      200,
      await generatedResponse.clone().text(),
    );
    assert.equal(imageCallCount, 1);
    assert.match(submittedImagePrompt, /图纸类专项要求（必须逐条执行）/);
    assert.match(submittedImagePrompt, /以上传的当前图框原图为几何、视角、主体位置和构图层级参考/);
    assert.match(submittedImagePrompt, /不得虚构准确尺寸、层数、结构跨度/);
    assert.match(submittedImagePrompt, /宽:高=7:5，目标输出 1344×960/);
    assert.match(submittedImagePrompt, expectedDrawingProfile[pageType]);
  }
});

test("fast analysis makes no model call and grounds every page in the reference library", async () => {
  const briefFixture = await import(
    "../fixtures/brief-only/task-brief.json",
    { with: { type: "json" } }
  );
  const referenceDocument = {
    document_id: "SYS_REFERENCE_DK05_PRESENTATION",
    file_name: "Guangzhou Yuexiu",
    role: "reference_style",
    version_or_date: "2026-06-10",
    authority_rank: 6,
    page_count: 109,
    text: "===== PAGE 2 =====\n推荐章节结构：项目理解、规划策略、设计概念、空间与功能落实、技术支撑、方案总结。",
  };
  const apiConfig = {
    baseUrl: "https://custom-model.example/v1",
    model: "gpt-5.5-fast-test",
    apiKey: "fast-test-key",
  };
  let requestCount = 0;
  const response = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "run",
        mode: "fast",
        projectId: "FAST_REFERENCE_TEST",
        documents: [referenceDocument, ...briefFixture.default],
        apiConfig,
      }),
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.6-sol",
      OPENAI_API: {
        fetch: async () => {
          requestCount += 1;
          throw new Error("Fast analysis must not call the model API.");
        },
      },
    },
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.analysisMode, "fast");
  assert.equal(result.executionMode, "local_rule");
  assert.equal(result.modelCallCount, 0);
  assert.equal(requestCount, 0);
  assert.equal(result.pagePlan.pages.length, 34);
  assert.equal(result.pagePlan.language_mode, "zh_en");
  assert.ok(
    result.pagePlan.sections.every((section) => section.title_en?.length),
  );
  assert.ok(
    result.pagePlan.pages.every(
      (page) =>
        page.headline_en?.length > 0 &&
        page.core_message_en?.length > 0,
    ),
  );
  assert.ok(
    result.pagePlan.pages.every((page) => !/^以\s*/.test(page.headline_zh)),
  );
  const systemRenderingPage = result.pagePlan.pages.find(
    (page) => page.headline_zh === "系统剖切渲染整合建筑关系",
  );
  assert.ok(systemRenderingPage);
  assert.equal(systemRenderingPage.page_type, "rendering");
  assert.ok(
    systemRenderingPage.visual_requirements.some((item) =>
      /system rendering|局部立面系统剖切渲染/i.test(item),
    ),
  );
  assert.ok(
    systemRenderingPage.visual_requirements.some((item) =>
      /连续三至五层|P111/i.test(item),
    ),
  );
  assert.ok(
    systemRenderingPage.visual_requirements.some((item) =>
      /不得采用.*P50|section perspective/i.test(item),
    ),
  );
  assert.ok(
    systemRenderingPage.experience_recipe_refs.includes("HQE_RX_068"),
  );
  assert.equal(
    result.pagePlan.pages.some(
      (page) => page.headline_zh === "以结构体系支撑空间实现",
    ),
    false,
  );
  const designSummaryPage = result.pagePlan.pages.find(
    (page) => page.headline_zh === "方案设计总结",
  );
  assert.ok(designSummaryPage);
  assert.equal(designSummaryPage.page_type, "summary");
  for (const requiredVisual of [
    "总体鸟瞰或建筑整体效果图",
    "公共空间或入口效果图",
    "重点空间或室内效果图",
  ]) {
    assert.ok(designSummaryPage.visual_requirements.includes(requiredVisual));
  }
  assert.ok(designSummaryPage.fact_refs.length > 0);
  assert.equal(
    result.pagePlan.pages.some(
      (page) => page.headline_zh === "以可追溯证据收束方案价值",
    ),
    false,
  );
  assert.ok(
    result.pagePlan.pages.every(
      (page) =>
        page.experience_recipe_refs.length > 0 &&
        page.style_example_refs.length > 0,
    ),
  );

  const recipeById = new Map(
    result.projectFacts.reference_experience.page_recipes.map((recipe) => [
      recipe.recipe_id,
      recipe,
    ]),
  );
  const usedRecipes = result.pagePlan.pages.flatMap((page) =>
    page.experience_recipe_refs.map((recipeId) => recipeById.get(recipeId)),
  );
  assert.deepEqual(
    [...new Set(usedRecipes.map((recipe) => recipe.source_document_id))].sort(),
    [
      "SYS_REFERENCE_DK05_PRESENTATION",
      "SYS_REFERENCE_HOTEL_MIXED_USE",
      "SYS_REFERENCE_HQ_MULTI_OPTION",
      "SYS_REFERENCE_HSINCHU_TOD",
      "SYS_REFERENCE_URBAN_A3",
    ],
  );
  assert.ok(
    new Set(usedRecipes.map((recipe) => recipe.layout_family)).size >= 10,
  );

  const partialResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "run",
        mode: "fast",
        projectId: "FAST_PARTIAL_GATE_TEST",
        documents: [
          referenceDocument,
          {
            document_id: "DOC_MINIMAL_BRIEF",
            file_name: "最小任务书.md",
            role: "authoritative",
            version_or_date: "2026-07-30",
            authority_rank: 2,
            page_count: 1,
            text: "===== PAGE 1 =====\n项目名称：最小任务书测试项目",
          },
        ],
        apiConfig,
      }),
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.6-sol",
      OPENAI_API: {
        fetch: async () => {
          throw new Error("Fast analysis must not call the model API.");
        },
      },
    },
  );
  assert.equal(partialResponse.status, 200);
  const partialResult = await partialResponse.json();
  assert.equal(
    partialResult.projectFacts.gate_report.planner_readiness,
    "partial",
  );
  assert.ok(
    partialResult.pagePlan.pages.some(
      (page) => page.generation_status !== "blocked",
    ),
  );
});

test("API uses the real-model path and keeps every response schema-bound", async () => {
  const sourceFixture = await import(
    "../fixtures/virtual-project/source-documents.json",
    { with: { type: "json" } }
  );
  const resultFixture = await import(
    "../fixtures/virtual-project/full-run.json",
    { with: { type: "json" } }
  );
  const expected = resultFixture.default;
  const currentDeepFacts = structuredClone(expected.projectFacts);
  currentDeepFacts.gate_b_proposals = [
    {
      missing_item_id: "M_B_001",
      missing_label: "立面方案",
      origin: "agent_missing",
      status: "confirmed",
      question: "立面如何回应场地与环境？",
      task_brief_fact_refs: [],
      options: [
        {
          option_id: "M_B_001_O1",
          title: "气候响应",
          summary: "依据朝向与采光需求建立差异化立面。",
          design_moves: ["区分朝向", "组织遮阳层级"],
          rationale: "从任务书确认条件出发。",
          task_brief_fact_refs: [],
          assumptions: ["具体构造和材料尚未确认"],
          validation_needed: ["朝向分析", "立面节点"],
        },
      ],
      selected_option_id: "M_B_001_O1",
      user_input: "",
      confirmed_direction: "采用气候响应立面，协调遮阳、采光与自然通风。",
    },
  ];
  const currentDeepPlan = structuredClone(expected.pagePlan);
  const requestedSchemas = [];
  const expectedWebApiConfig = {
    baseUrl: "https://custom-model.example/v1",
    model: "gpt-5.5-web-test",
    apiKey: "web-test-key",
  };
  const modelEnv = {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-5.6-sol",
    OPENAI_API: {
      fetch: async (request) => {
        if (request.method === "GET") {
          assert.equal(
            request.url,
            `${expectedWebApiConfig.baseUrl}/models`,
          );
          return Response.json({
            object: "list",
            data: [{ id: expectedWebApiConfig.model, object: "model" }],
          });
        }
        const body = await request.json();
        assert.equal(
          request.url,
          `${expectedWebApiConfig.baseUrl}/responses`,
        );
        assert.equal(body.model, expectedWebApiConfig.model);
        const name = body.text.format.name;
        requestedSchemas.push(name);
        assert.equal(body.text.format.type, "json_schema");
        assert.equal(body.text.format.strict, true);
        assert.equal(body.store, false);
        assert.equal(
          schemaContainsKey(body.text.format.schema, "const"),
          false,
        );
        assert.equal(schemaContainsEmptyObject(body.text.format.schema), false);

        if (name === "document_registration") {
          return modelResponse(name, {
            documents: expected.projectFacts.documents,
          });
        }
        if (name === "project_facts" || name === "project_completeness") {
          return modelResponse(name, expected.projectFacts);
        }
        if (name === "deep_narrative_refinement") {
          assert.equal(body.reasoning.effort, "low");
          assert.deepEqual(
            Object.keys(body.text.format.schema.properties).sort(),
            ["narrative_claim", "sections"],
          );
          const narrativePayload = JSON.parse(
            body.input[0].content[0].text,
          );
          assert.deepEqual(
            narrativePayload.current_project.confirmed_proposals.map(
              (proposal) => proposal.topic,
            ),
            ["立面方案"],
          );
          return modelResponse(name, {
            narrative_claim: expected.pagePlan.narrative_claim,
            sections: expected.pagePlan.sections,
          });
        }
        if (name.startsWith("deep_page_batch_")) {
          assert.equal(body.reasoning.effort, "low");
          assert.deepEqual(
            Object.keys(
              body.text.format.schema.properties.pages.items.properties,
            ).sort(),
            [
              "core_message",
              "core_message_en",
              "headline_en",
              "headline_zh",
              "page_id",
              "section_id",
            ],
          );
          const batchPayload = JSON.parse(body.input[0].content[0].text);
          const batchPages = batchPayload.pages.map((page) => ({
              page_id: page.page_id,
              section_id: page.section_id,
              headline_zh:
                page.page_id === "P003"
                  ? "深度框架标题"
                  : page.headline_zh,
              headline_en:
                page.page_id === "P003"
                  ? "REFINED FRAMEWORK TITLE"
                  : page.headline_en,
              core_message:
                page.page_id === "P003"
                  ? "深度框架核心结论"
                  : page.core_message,
              core_message_en:
                page.page_id === "P003"
                  ? "Refined core message for the page."
                  : page.core_message_en,
            }));
          if (name === "deep_page_batch_01") {
            return modelTextResponse(
              name,
              `\`\`\`json\n${JSON.stringify(batchPages)}\n\`\`\``,
            );
          }
          return modelResponse(name, { pages: batchPages });
        }
        if (name === "visual_reference_decision") {
          const selectionPayload = JSON.parse(
            body.input[0].content[0].text,
          );
          return modelResponse(name, {
            visual_intent: {
              ...selectionPayload.first_principles_visual_intent,
              conclusion_to_prove:
                selectionPayload.page.core_message,
              search_focus: [
                "当前页核心结论",
                "证据关系",
                "Graphic 功能结构",
              ],
            },
            reference_selection: {
              status: "matched",
              selection_method: "model_semantic_rerank",
              selected_visual_id:
                selectionPayload.candidate_visual_references[0].visual_id,
              confidence: 0.88,
              internal_rationale:
                "当前页结论、关系和证据需求与该参考图最一致。",
              evaluated_at: selectionPayload.evaluated_at,
            },
            slot_reference_selections: selectionPayload.image_slots.map(
              (slot, index) => ({
                slot_id: slot.slot_id,
                selected_visual_id:
                  selectionPayload.candidate_visual_references[
                    index %
                      selectionPayload.candidate_visual_references.length
                  ].visual_id,
                confidence: 0.88,
                internal_rationale:
                  "当前图框任务与该参考图的内容和构图结构最一致。",
              }),
            ),
          });
        }
        if (name === "visual_reference_export_batch") {
          const batchPayload = JSON.parse(
            body.input[0].content[0].text,
          );
          assert.ok(batchPayload.pages.length > 0);
          assert.ok(
            batchPayload.pages.every(
              (page) =>
                page.image_slots.length > 0 &&
                page.image_slots.every(
                  (slot) => slot.allowed_visual_ids.length > 0,
                ),
            ),
          );
          return modelResponse(name, {
            page_selections: batchPayload.pages.map((page) => ({
              page_id: page.page_id,
              slot_selections: page.image_slots
                .filter((slot) => !slot.already_filled)
                .map((slot) => ({
                  slot_id: slot.slot_id,
                  selected_visual_id: slot.allowed_visual_ids[0],
                  confidence: 0.86,
                })),
            })),
          });
        }
        if (name === "visual_task") {
          return modelResponse(name, {
            page_id: "P003",
            status: "ready",
            objective: "把当前页结论转译为可验证的视觉证据。",
            production_mode: "diagram",
            primary_visual: "分析图解",
            visual_intent: {
              conclusion_to_prove: "证明当前页的核心空间关系。",
              relationship_to_show: "evidence_mapping",
              evidence_needed: ["当前项目事实"],
              graphic_elements: ["证据底图", "关系图层", "结论标注"],
              search_focus: ["空间关系", "证据图解"],
              layout_logic: "证据与结论一一对应。",
            },
            available_inputs: [],
            missing_inputs: [],
            generation_steps: ["理解结论", "组织证据"],
            constraints: [],
            ai_generation_policy: "仅生成有当前项目证据支撑的图解。",
            reference_recipe_refs: [],
            visual_reference_refs: [],
            conversation: [
              {
                round: 1,
                role: "assistant",
                content: "已完成当前页视觉需求判断。",
              },
            ],
          });
        }
        if (name === "gate_b_design_proposal") {
          return modelResponse(name, {
            missing_item_id: "M_B_001",
            missing_label: "立面方案",
            status: "awaiting_choice",
            question: "立面更应优先回应气候性能还是城市界面？",
            task_brief_fact_refs: [],
            options: [
              {
                option_id: "M_B_001_O1",
                title: "气候响应",
                summary: "依据朝向与采光需求建立差异化立面。",
                design_moves: ["区分朝向", "组织遮阳层级"],
                rationale: "从任务书确认条件出发，不预设材料与尺寸。",
                task_brief_fact_refs: [],
                assumptions: ["具体构造和材料尚未确认"],
                validation_needed: ["朝向分析", "立面节点"],
              },
              {
                option_id: "M_B_001_O2",
                title: "城市界面",
                summary: "根据主要城市界面建立主次立面秩序。",
                design_moves: ["识别主界面", "强化入口层级"],
                rationale: "以任务书中的场地与使用目标为约束。",
                task_brief_fact_refs: [],
                assumptions: ["立面比例尚未确认"],
                validation_needed: ["城市界面展开", "入口透视"],
              },
            ],
            selected_option_id: null,
            user_input: "",
            confirmed_direction: "",
          });
        }
        if (name === "design_narrative") {
          return modelResponse(name, {
            document_title_zh: "虚拟滨水文化中心",
            document_subtitle_zh: "建筑概念方案设计说明",
            source_scope_note:
              "本说明综合任务书、方案资料、项目事实、设计提案与完整 A3 汇报终稿形成。",
            executive_concept: {
              statement_zh:
                "以城市公共界面、滨水开放空间和复合文化功能为共同起点，建立从任务解读、场地判断到空间落实与技术验证的完整设计逻辑，并通过总图、交通、公共空间、建筑技术与实施边界之间的连续论证，形成可以核查、深化和交付的方案说明体系。",
              keywords_zh: ["城市界面", "滨水开放", "文化复合"],
              fact_refs: [],
              proposal_refs: [],
              page_refs: [],
            },
            chapters: Array.from({ length: 8 }, (_, index) => ({
              chapter_id: `N${String(index + 1).padStart(2, "0")}`,
              order: index + 1,
              title_zh: `设计说明章节 ${index + 1}`,
              lead_zh:
                "本章依据当前项目资料明确设计判断、空间动作及其需要继续验证的实施边界。",
              subsections: [
                {
                  heading_zh: "设计判断与空间回应",
                  paragraphs_zh: [
                    "项目应在已确认条件基础上建立清晰的空间秩序，并以事实、设计方向和页级证据说明每一项设计动作。",
                  ],
                  bullet_points_zh: [],
                  fact_refs: [],
                  proposal_refs: [],
                  page_refs: [],
                },
              ],
              fact_refs: [],
              proposal_refs: [],
              page_refs: [],
            })),
            value_summary: [
              {
                label_zh: "城市价值",
                statement_zh:
                  "通过公共界面与城市空间的连续组织回应项目所在区域的发展目标。",
                fact_refs: [],
                proposal_refs: [],
                page_refs: [],
              },
              {
                label_zh: "空间价值",
                statement_zh:
                  "通过功能、交通和公共活动的协同建立可理解且可实施的空间系统。",
                fact_refs: [],
                proposal_refs: [],
                page_refs: [],
              },
              {
                label_zh: "实施价值",
                statement_zh:
                  "通过指标、来源证据与验证清单控制方案深化过程中的设计边界。",
                fact_refs: [],
                proposal_refs: [],
                page_refs: [],
              },
            ],
            coverage: {
              source_document_ids: [],
              fact_refs: [],
              proposal_refs: [],
              page_refs: [],
              known_gaps: [],
            },
          });
        }
        if (name === "report_page") {
          assert.deepEqual(
            Object.keys(body.text.format.schema.properties).sort(),
            [
              "body_copy",
              "body_en",
              "body_zh",
              "callouts",
              "core_message",
              "core_message_en",
              "diagram_labels",
              "diagram_labels_en",
              "headline_en",
              "proposal_coverage",
              "proposal_refs",
              "speaker_notes",
            ],
          );
          const pagePromptText = body.input
            .flatMap((message) => message.content ?? [])
            .map((item) => item.text)
            .filter((text) => typeof text === "string")
            .join("\n");
          const applicableProposalMatch = pagePromptText.match(
            /applicable_confirmed_proposals[^\n]*\n(\[[^\n]*\])/,
          );
          const applicableProposals = applicableProposalMatch
            ? JSON.parse(applicableProposalMatch[1])
            : [];
          const visibleProposalStatement = applicableProposals.length
            ? `本页采用${applicableProposals[0].topic}方向，将已确认的设计动作落实为空间与技术回应。`
            : "中文正文用于页面主要显示。";
          return modelResponse(name, {
            ...expected.pagePlan.pages.find((page) => page.page_id === "P003"),
            headline_zh: "逐页模型试图改写的标题",
            core_message: "逐页模型试图改写的核心结论",
            body_zh: `${visibleProposalStatement}视觉建议：右侧放置一张低分辨率主视觉。建议采用四栏版式并留出图注空白。`,
            body_en:
              "The current project evidence establishes the page conclusion.",
            body_copy: `${visibleProposalStatement}视觉建议：右侧放置一张低分辨率主视觉。建议采用四栏版式并留出图注空白。`,
            diagram_labels: [
              "label 1 zh: 珠江新城 CBD",
              "结构化经验素材槽：主视觉 site_map；文字密度 low",
              "label 2 zh: 当前项目位置",
              "图像建议：生成概念示意图",
            ],
            diagram_labels_en: [
              "URBAN CONTEXT",
              "REFERENCE LAYOUT",
              "CURRENT PROJECT LOCATION",
              "GRAPHIC SUGGESTION",
            ],
            speaker_notes:
              "先说明当前项目条件与设计价值。表达与版式参考样本 RSE_DK05_001。",
            callouts: [
              {
                label_zh: "当前项目边界",
                label_en: "CURRENT PROJECT BOUNDARY",
              },
              {
                label_zh: "版式建议：采用左右分栏",
                label_en: "LAYOUT SUGGESTION",
              },
            ],
            proposal_refs: applicableProposals.map(
              (proposal) => proposal.proposal_id,
            ),
            proposal_coverage: applicableProposals.map((proposal) => ({
              proposal_id: proposal.proposal_id,
              applied_design_moves:
                proposal.design_moves?.length
                  ? proposal.design_moves.slice(0, 1)
                  : [proposal.confirmed_direction],
              visible_statement: visibleProposalStatement,
            })),
          });
        }
        if (name === "audit_report") {
          return modelResponse(name, expected.pagePlan.audit_report);
        }
        return new Response("Unexpected schema", { status: 400 });
      },
    },
  };

  const connectionResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "test_connection",
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(connectionResponse.status, 200);
  assert.deepEqual(await connectionResponse.json(), {
    ok: true,
    baseUrl: expectedWebApiConfig.baseUrl,
    model: expectedWebApiConfig.model,
    imageBaseUrl: expectedWebApiConfig.baseUrl,
    imageModel: "gpt-image-2",
    modelAvailable: true,
    imageModelAvailable: false,
    availableImageModels: [],
    availableModelCount: 1,
  });

  const pipelineResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "run",
        mode: "deep",
        projectId: "VIRTUAL_RIVERFRONT_CULTURE",
        documents: sourceFixture.default,
        projectFacts: currentDeepFacts,
        pagePlan: currentDeepPlan,
        nodeOutputs: expected.nodeOutputs,
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(pipelineResponse.status, 200);
  const pipeline = await pipelineResponse.json();
  assert.equal(pipeline.executionMode, "openai_model");
  assert.equal(pipeline.analysisMode, "deep");
  assert.equal(pipeline.modelName, expectedWebApiConfig.model);
  assert.equal(pipeline.modelCallCount, 8);
  assert.deepEqual(
    pipeline.nodeOutputs.map((node) => node.token_usage),
    [
      ...expected.nodeOutputs.map(() => undefined),
      ...Array.from({ length: 8 }, () => ({
        input: 100,
        output: 20,
      })),
    ],
  );
  assert.equal(
    JSON.stringify(pipeline).includes(expectedWebApiConfig.apiKey),
    false,
  );
  assert.equal(requestedSchemas[0], "deep_narrative_refinement");
  assert.deepEqual(
    [...requestedSchemas.slice(1)].sort(),
    [
      "deep_page_batch_01",
      "deep_page_batch_02",
      "deep_page_batch_03",
      "deep_page_batch_04",
      "deep_page_batch_05",
      "deep_page_batch_06",
      "deep_page_batch_07",
    ],
  );
  assert.ok(
    pipeline.nodeOutputs.slice(0, expected.nodeOutputs.length).every(
      (node) => node.execution === "local_rule" && node.model_calls === 0,
    ),
  );
  assert.ok(
    pipeline.nodeOutputs.slice(expected.nodeOutputs.length).every(
      (node) =>
        node.execution === "openai_model" &&
        node.model === "gpt-5.6-sol" &&
        node.response_id,
    ),
  );
  assert.ok(
    pipeline.projectFacts.facts.every((fact) =>
      ["DOC_BRIEF_V01", "DOC_PROPOSAL_V01"].includes(
        fact.source.document_id,
      ),
    ),
  );
  const refinedFrameworkPage = pipeline.pagePlan.pages.find(
    (page) => page.page_id === "P003",
  );
  assert.equal(refinedFrameworkPage.headline_zh, "深度框架标题");
  assert.equal(refinedFrameworkPage.core_message, "深度框架核心结论");
  assert.equal(
    refinedFrameworkPage.page_type,
    expected.pagePlan.pages.find((page) => page.page_id === "P003").page_type,
  );
  assert.deepEqual(
    refinedFrameworkPage.fact_refs,
    expected.pagePlan.pages.find((page) => page.page_id === "P003").fact_refs,
  );
  assert.deepEqual(
    refinedFrameworkPage.style_example_refs,
    expected.pagePlan.pages.find((page) => page.page_id === "P003")
      .style_example_refs,
  );
  assert.deepEqual(
    refinedFrameworkPage.experience_recipe_refs,
    expected.pagePlan.pages.find((page) => page.page_id === "P003")
      .experience_recipe_refs,
  );
  assert.ok(
    pipeline.projectFacts.gate_b_proposals.some(
      (proposal) =>
        proposal.missing_item_id === "M_B_001" &&
        proposal.status === "confirmed",
    ),
  );

  const modeledGateBResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "gate_b_proposal",
        operation: "generate",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        missingItemId: "M_B_001",
        nodeOutputs: pipeline.nodeOutputs,
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(modeledGateBResponse.status, 200);
  const modeledGateBResult = await modeledGateBResponse.json();
  const modeledGateBProposal =
    modeledGateBResult.projectFacts.gate_b_proposals.find(
      (proposal) => proposal.missing_item_id === "M_B_001",
    );
  assert.equal(modeledGateBProposal.status, "awaiting_choice");
  assert.equal(modeledGateBProposal.options.length, 2);
  assert.equal(modeledGateBResult.modelCallCount, 9);
  assert.equal(requestedSchemas.at(-1), "gate_b_design_proposal");

  const selectedGateBOption = modeledGateBProposal.options[0];
  const confirmedGateBResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "gate_b_proposal",
        operation: "select",
        projectFacts: modeledGateBResult.projectFacts,
        pagePlan: modeledGateBResult.pagePlan,
        missingItemId: "M_B_001",
        selectedOptionId: selectedGateBOption.option_id,
        nodeOutputs: modeledGateBResult.nodeOutputs,
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(confirmedGateBResponse.status, 200);
  const confirmedGateBResult = await confirmedGateBResponse.json();
  const confirmedGateBProposal =
    confirmedGateBResult.projectFacts.gate_b_proposals.find(
      (proposal) => proposal.missing_item_id === "M_B_001",
    );
  assert.equal(confirmedGateBProposal.status, "confirmed");
  assert.equal(
    confirmedGateBProposal.confirmed_direction,
    selectedGateBOption.summary,
  );
  assert.equal(confirmedGateBResult.modelCallCount, 9);

  const visualTaskResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "visual_task",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: "P004",
        nodeOutputs: pipeline.nodeOutputs,
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(visualTaskResponse.status, 200);
  const visualTaskResult = await visualTaskResponse.json();
  const modeledVisualTask = visualTaskResult.pagePlan.pages.find(
    (page) => page.page_id === "P004",
  ).visual_task;
  assert.equal("options" in modeledVisualTask, false);
  assert.equal("selected_option_id" in modeledVisualTask, false);
  assert.ok(modeledVisualTask.visual_intent.conclusion_to_prove);
  assert.ok(modeledVisualTask.visual_intent.search_focus.length >= 1);
  assert.equal(visualTaskResult.modelCallCount, 8);
  assert.equal(
    visualTaskResult.nodeOutputs.at(-1).execution,
    "local_rule",
  );
  assert.equal(modeledVisualTask.reference_crop, undefined);
  assert.equal(modeledVisualTask.slot_reference_crops, undefined);
  assert.deepEqual(modeledVisualTask.visual_reference_refs, []);
  assert.equal(
    requestedSchemas.at(-1),
    "gate_b_design_proposal",
  );

  const generationResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_page",
        projectFacts: pipeline.projectFacts,
        pagePlan: pipeline.pagePlan,
        pageId: "P003",
        nodeOutputs: pipeline.nodeOutputs,
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(
    generationResponse.status,
    200,
    await generationResponse.clone().text(),
  );
  const generated = await generationResponse.json();
  assert.equal(generated.executionMode, "openai_model");
  assert.equal(generated.modelCallCount, 9);
  assert.equal(requestedSchemas.at(-1), "report_page");
  const generatedFrameworkPage = generated.pagePlan.pages.find(
    (page) => page.page_id === "P003",
  );
  assert.equal(generatedFrameworkPage.headline_zh, "深度框架标题");
  assert.equal(generatedFrameworkPage.core_message, "逐页模型试图改写的核心结论");
  assert.equal(
    generatedFrameworkPage.body_copy,
    "中文正文用于页面主要显示。",
  );
  assert.ok(
    generatedFrameworkPage.diagram_labels.every(
      (label) =>
        !/label\s*\d+\s*zh|结构化经验|素材槽|珠江新城|site_map|文字密度/i.test(
          label,
        ),
    ),
  );
  assert.ok(
    generatedFrameworkPage.diagram_labels.includes("当前项目位置"),
  );
  assert.ok(
    generatedFrameworkPage.callouts.every(
      (callout) =>
        !/版式|主视觉|低分辨率|结构化经验|素材槽|图像建议/i.test(
          callout.label_zh,
        ),
    ),
  );
  assert.doesNotMatch(
    generatedFrameworkPage.speaker_notes,
    /版式|参考样本|RSE_/i,
  );
  assert.match(generatedFrameworkPage.speaker_notes, /[\u3400-\u9fff]/);
  assert.equal(generatedFrameworkPage.content_depth_check.applicable, false);
  assert.equal(
    generatedFrameworkPage.content_depth_check.status,
    "pass",
  );

  const auditResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "audit",
        projectFacts: generated.projectFacts,
        pagePlan: generated.pagePlan,
        nodeOutputs: generated.nodeOutputs,
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(auditResponse.status, 200);
  const audited = await auditResponse.json();
  assert.equal(audited.executionMode, "openai_model");
  assert.equal(audited.modelCallCount, 10);
  assert.equal(requestedSchemas.at(-1), "audit_report");

  const exportablePageCount = generated.pagePlan.pages.filter(
    (page) =>
      !["cover", "toc", "section_divider"].includes(page.page_type),
  ).length;
  const exportResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "prepare_export",
        format: "docx",
        projectFacts: generated.projectFacts,
        pagePlan: generated.pagePlan,
        nodeOutputs: generated.nodeOutputs,
        documents: sourceFixture.default,
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(
    exportResponse.status,
    200,
    await exportResponse.clone().text(),
  );
  const preparedExport = await exportResponse.json();
  const exportNode = preparedExport.nodeOutputs.at(-1);
  assert.equal(exportNode.node, "export_preparation");
  assert.equal(exportNode.execution, "openai_model");
  assert.equal(exportNode.model_calls, exportablePageCount + 2);
  assert.deepEqual(exportNode.token_usage, {
    input: (exportablePageCount + 2) * 100,
    output: (exportablePageCount + 2) * 20,
  });
  assert.equal(
    preparedExport.modelCallCount,
    generated.modelCallCount + exportablePageCount + 2,
  );
  assert.equal(
    exportNode.output.generated_page_ids.length,
    exportablePageCount,
  );
  assert.equal(requestedSchemas.at(-1), "design_narrative");
  assert.equal(
    preparedExport.designNarrative.chapters.length,
    8,
  );

  const pdfExportResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "prepare_export",
        format: "pdf",
        projectFacts: generated.projectFacts,
        pagePlan: generated.pagePlan,
        nodeOutputs: generated.nodeOutputs,
        apiConfig: expectedWebApiConfig,
      }),
    },
    modelEnv,
  );
  assert.equal(
    pdfExportResponse.status,
    200,
    await pdfExportResponse.clone().text(),
  );
  const preparedPdfExport = await pdfExportResponse.json();
  const pdfExportNode = preparedPdfExport.nodeOutputs.at(-1);
  assert.deepEqual(pdfExportNode.output.visual_matched_page_ids, []);
  assert.notEqual(requestedSchemas.at(-1), "visual_reference_export_batch");
  assert.ok(
    preparedPdfExport.pagePlan.pages
      .filter((page) => page.visual_task?.image_slots.length)
      .every(
        (page) =>
          !page.visual_task.slot_reference_crops &&
          !page.visual_task.reference_crop,
      ),
  );
});

test("Qwen text-only structured calls use Chat Completions JSON Schema", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = fixture.default;
  const sourcePage = data.pagePlan.pages.find(
    (page) => page.page_id === "P003",
  );
  const apiConfig = {
    baseUrl:
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.7-plus",
    apiKey: "qwen-test-key",
  };
  const response = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_page",
        projectFacts: data.projectFacts,
        pagePlan: data.pagePlan,
        pageId: "P003",
        nodeOutputs: [],
        apiConfig,
      }),
    },
    {
      OPENAI_API: {
        fetch: async (request) => {
          assert.equal(
            request.url,
            `${apiConfig.baseUrl}/chat/completions`,
          );
          const body = await request.json();
          assert.equal(body.model, apiConfig.model);
          assert.equal(body.enable_thinking, false);
          assert.equal(body.response_format.type, "json_schema");
          assert.equal(body.response_format.json_schema.strict, true);
          assert.equal(body.response_format.json_schema.name, "report_page");
          assert.equal(body.text, undefined);
          return Response.json({
            id: "chatcmpl_qwen_test",
            model: apiConfig.model,
            choices: [
              {
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    ...sourcePage,
                    proposal_refs: [],
                    proposal_coverage: [],
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 321,
              completion_tokens: 123,
            },
          });
        },
      },
    },
  );
  assert.equal(response.status, 200);
  const generated = await response.json();
  assert.equal(generated.modelCallCount, 1);
  assert.deepEqual(generated.nodeOutputs.at(-1).token_usage, {
    input: 321,
    output: 123,
  });
});

test("connection test checks a separately configured image provider and model", async () => {
  const requestedUrls = [];
  const response = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "test_connection",
        apiConfig: {
          baseUrl: "https://text-provider.example/v1",
          model: "qwen-text-test",
          apiKey: "text-test-key",
          imageBaseUrl: "https://image-provider.example/v1",
          imageModel: "gpt-5.6-luna",
          imageApiKey: "image-test-key",
        },
      }),
    },
    {
      OPENAI_API_KEY: "fallback-test-key",
      OPENAI_API: {
        fetch: async (request) => {
          requestedUrls.push(request.url);
          return Response.json({
            data: request.url.includes("image-provider")
              ? [{ id: "gpt-5.6-luna" }]
              : [{ id: "qwen-text-test" }],
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.modelAvailable, true);
  assert.equal(body.imageModelAvailable, true);
  assert.deepEqual(body.availableImageModels, ["gpt-5.6-luna"]);
  assert.deepEqual(requestedUrls, [
    "https://text-provider.example/v1/models",
    "https://image-provider.example/v1/models",
  ]);
});

test("fact panel revisions preserve source evidence and append multi-round history", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = fixture.default;
  const originalFact = data.projectFacts.facts.find(
    (fact) => fact.fact_id === "F_004",
  );
  assert.ok(originalFact);

  const revise = async (
    projectFacts,
    pagePlan,
    value,
    message,
    nodeOutputs,
    factId = "F_004",
  ) => {
    const response = await fetchWorker("/api/pipeline", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "revise_fact",
        projectFacts,
        pagePlan,
        factId,
        proposedValue: value,
        userMessage: message,
        nodeOutputs,
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };

  const first = await revise(
    data.projectFacts,
    data.pagePlan,
    "19,200㎡",
    "业主第一轮确认用地面积调整。",
    data.nodeOutputs,
  );
  const firstFact = first.projectFacts.facts.find(
    (fact) => fact.fact_id === "F_004",
  );
  assert.equal(firstFact.value_raw, "19,200㎡");
  assert.equal(firstFact.original_value_raw, originalFact.value_raw);
  assert.equal(firstFact.value_origin, "user_confirmed");
  assert.equal(firstFact.status, "confirmed");
  assert.equal(firstFact.source.quote, originalFact.source.quote);
  assert.equal(firstFact.source.page, originalFact.source.page);
  assert.equal(firstFact.revision_history.length, 1);
  assert.equal(firstFact.revision_history[0].previous_value, originalFact.value_raw);
  assert.equal(firstFact.revision_history[0].confirmed_value, "19,200㎡");
  assert.equal(first.nodeOutputs.at(-1).node, "fact_revision");
  assert.equal(first.nodeOutputs.at(-1).model_calls, 0);

  const second = await revise(
    first.projectFacts,
    first.pagePlan,
    "19,500㎡",
    "业主第二轮会议再次确认。",
    first.nodeOutputs,
  );
  const secondFact = second.projectFacts.facts.find(
    (fact) => fact.fact_id === "F_004",
  );
  assert.equal(secondFact.value_raw, "19,500㎡");
  assert.equal(secondFact.original_value_raw, originalFact.value_raw);
  assert.equal(secondFact.source.quote, originalFact.source.quote);
  assert.equal(secondFact.revision_history.length, 2);
  assert.equal(secondFact.revision_history[1].round, 2);
  assert.equal(secondFact.revision_history[1].previous_value, "19,200㎡");
  assert.equal(secondFact.revision_history[1].confirmed_value, "19,500㎡");
  assert.match(
    secondFact.revision_history[1].assistant_message,
    /后续页面生成将使用这个值/,
  );

  const renamed = await revise(
    second.projectFacts,
    second.pagePlan,
    "用户确认后的项目名称",
    "业主确认使用新的项目名称。",
    second.nodeOutputs,
    "F_001",
  );
  assert.equal(
    renamed.projectFacts.project_name_anonymized,
    "用户确认后的项目名称",
  );
});

test("proposal panel supports confirmed user-created design cards without changing facts", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = fixture.default;
  const originalFactCount = data.projectFacts.facts.length;
  const originalMissingCount = data.projectFacts.missing_items.length;
  const createResponse = await fetchWorker("/api/pipeline", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "user_proposal",
      operation: "create",
      projectFacts: data.projectFacts,
      pagePlan: data.pagePlan,
      topic: "重点空间",
      title: "建立多层公共客厅",
      direction: "以中庭、平台与连桥串联主要公共功能。",
      nodeOutputs: data.nodeOutputs,
    }),
  });
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  const proposal = created.projectFacts.gate_b_proposals.at(-1);
  assert.equal(proposal.origin, "user_created");
  assert.equal(proposal.status, "confirmed");
  assert.equal(proposal.user_defined_title, "建立多层公共客厅");
  assert.equal(
    proposal.confirmed_direction,
    "以中庭、平台与连桥串联主要公共功能。",
  );
  assert.deepEqual(proposal.target_page_types, [
    "plan",
    "section",
    "rendering",
  ]);
  assert.equal(created.projectFacts.facts.length, originalFactCount);
  assert.equal(
    created.projectFacts.missing_items.length,
    originalMissingCount,
  );
  assert.equal(created.nodeOutputs.at(-1).node, "user_proposal");
  assert.equal(created.nodeOutputs.at(-1).model_calls, 0);
  const proposalPages = created.pagePlan.pages.filter((page) =>
    page.proposal_refs?.includes(proposal.missing_item_id),
  );
  assert.ok(proposalPages.length > 0);
  assert.ok(
    proposalPages.every(
      (page) => page.proposal_context_hash?.startsWith("proposal-"),
    ),
  );
  assert.ok(
    proposalPages.some((page) =>
      ["plan", "section", "rendering"].includes(page.page_type),
    ),
  );

  const proposalPage =
    proposalPages.find(
      (page) =>
        page.generation_status === "ready" &&
      !["cover", "toc", "section_divider"].includes(page.page_type),
    ) ?? proposalPages[0];
  let pageGenerationAttempts = 0;
  const generatedResponse = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_page",
        projectFacts: created.projectFacts,
        pagePlan: created.pagePlan,
        pageId: proposalPage.page_id,
        nodeOutputs: created.nodeOutputs,
      }),
    },
    {
      OPENAI_API_KEY: "proposal-copy-test-key",
      OPENAI_MODEL: "gpt-5.6-sol",
      OPENAI_API: {
        fetch: async (request) => {
          const body = await request.json();
          const name =
            body.text?.format?.name ??
            body.response_format?.json_schema?.name;
          assert.equal(name, "report_page");
          const prompt = body.input[0].content[0].text;
          assert.match(prompt, /applicable_confirmed_proposals/);
          assert.match(prompt, /建立多层公共客厅/);
          assert.match(prompt, /中庭、平台与连桥/);
          pageGenerationAttempts += 1;
          if (pageGenerationAttempts === 1) {
            assert.doesNotMatch(prompt, /page_generation_repair_loop/);
            return modelResponse(name, {
              headline_en: "CONTINUOUS PUBLIC SPACE ORGANIZATION",
              core_message: "以连续公共空间组织主要功能。",
              core_message_en:
                "Continuous public space organizes the primary functions.",
              body_zh: "以连续公共空间组织主要功能，形成清晰的空间体验。",
              body_en:
                "Continuous public space organizes the primary functions.",
              body_copy:
                "以连续公共空间组织主要功能，形成清晰的空间体验。",
              diagram_labels: ["公共空间", "功能联系"],
              diagram_labels_en: ["PUBLIC SPACE", "PROGRAM LINKS"],
              speaker_notes: "说明公共空间与主要功能之间的联系。",
              callouts: [],
              proposal_refs: [],
              proposal_coverage: [],
            });
          }
          assert.match(prompt, /page_generation_repair_loop/);
          assert.match(prompt, /proposal_refs 没有引用/);
          assert.match(prompt, /proposal_coverage 没有覆盖/);
          const visibleStatement =
            "方案以中庭、平台与连桥串联主要公共功能，形成连续的多层公共客厅。";
          const coverageStatement =
            "本页已按提案形成可验证的空间动作。";
          return modelResponse(name, {
            headline_en: "CONTINUOUS PUBLIC SPACE ORGANIZATION",
            core_message: "以连续公共空间组织主要功能。",
            core_message_en:
              "Continuous public space organizes the primary functions.",
            body_zh: visibleStatement,
            body_en:
              "The proposal links the main public functions through an atrium, terraces and bridges to form a continuous multi-level public living room.",
            body_copy: visibleStatement,
            diagram_labels: ["中庭组织垂直共享", "平台连接公共功能"],
            diagram_labels_en: [
              "ATRIUM FOR VERTICAL SHARING",
              "TERRACES LINK PUBLIC FUNCTIONS",
            ],
            speaker_notes:
              "先说明已确认的多层公共客厅方向，再说明中庭、平台与连桥的具体空间作用。",
            callouts: [
              {
                label_zh: "连桥串联主要公共界面",
                label_en: "BRIDGES LINK PUBLIC INTERFACES",
              },
            ],
            proposal_refs: [proposal.missing_item_id],
            proposal_coverage: [
              {
                proposal_id: proposal.missing_item_id,
                visible_statement: coverageStatement,
                applied_design_moves: [
                  "以中庭组织垂直共享",
                  "以平台与连桥串联主要公共功能",
                ],
              },
            ],
          });
        },
      },
    },
  );
  assert.equal(
    generatedResponse.status,
    200,
    await generatedResponse.clone().text(),
  );
  const generated = await generatedResponse.json();
  assert.equal(pageGenerationAttempts, 2);
  assert.equal(generated.nodeOutputs.at(-1).model_calls, 2);
  assert.deepEqual(generated.nodeOutputs.at(-1).token_usage, {
    input: 200,
    output: 40,
  });
  const generatedProposalPage = generated.pagePlan.pages.find(
    (page) => page.page_id === proposalPage.page_id,
  );
  assert.ok(
    ["generated", "placeholder"].includes(
      generatedProposalPage.generation_status,
    ),
  );
  assert.deepEqual(generatedProposalPage.proposal_refs, [
    proposal.missing_item_id,
  ]);
  assert.equal(
    generatedProposalPage.proposal_coverage[0].visible_statement,
    generatedProposalPage.body_copy,
  );

  const deleteResponse = await fetchWorker("/api/pipeline", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "user_proposal",
      operation: "delete",
      projectFacts: generated.projectFacts,
      pagePlan: generated.pagePlan,
      proposalId: proposal.missing_item_id,
      nodeOutputs: generated.nodeOutputs,
    }),
  });
  assert.equal(deleteResponse.status, 200);
  const removed = await deleteResponse.json();
  assert.equal(
    removed.projectFacts.gate_b_proposals.some(
      (candidate) =>
        candidate.missing_item_id === proposal.missing_item_id,
    ),
    false,
  );

  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workbenchSource, /isSmallBuildingMode\(taskMode\) \? "设计方向" : "提案"/);
  assert.match(workbenchSource, /用户自定义提案/);
  assert.match(workbenchSource, /Agent 识别的设计缺项/);
});

test("confirmed proposals cover every page-level design gap and retain validation work separately", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = fixture.default;
  const originalFactCount = data.projectFacts.facts.length;
  const originalGapPageIds = data.pagePlan.pages
    .filter((page) => page.missing_information.length > 0)
    .map((page) => page.page_id);
  let current = data;

  for (const item of data.projectFacts.missing_items.filter((candidate) =>
    candidate.description.startsWith("Gate B 缺少："),
  )) {
    const response = await fetchWorker("/api/pipeline", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "gate_b_proposal",
        operation: "custom",
        projectFacts: current.projectFacts,
        pagePlan: current.pagePlan,
        missingItemId: item.item_id,
        userInput: `${item.description.replace("Gate B 缺少：", "")}采用任务书约束下的确认方向。`,
        nodeOutputs: current.nodeOutputs,
      }),
    });
    assert.equal(response.status, 200);
    current = await response.json();
  }

  const formerlyMissingPages = current.pagePlan.pages.filter((page) =>
    originalGapPageIds.includes(page.page_id),
  );
  assert.ok(originalGapPageIds.length > 0);
  assert.ok(
    formerlyMissingPages.every(
      (page) =>
        page.missing_information.length === 0 &&
        !["placeholder", "blocked"].includes(page.generation_status),
    ),
  );
  assert.ok(
    formerlyMissingPages.some((page) =>
      page.unresolved_items.some((item) =>
        item.startsWith("提案待验证："),
      ),
    ),
  );
  assert.ok(
    current.projectFacts.missing_items
      .filter((item) => item.description.startsWith("Gate B 缺少："))
      .every((item) =>
        current.projectFacts.gate_b_proposals.some(
          (proposal) =>
            proposal.missing_item_id === item.item_id &&
            proposal.status === "confirmed",
        ),
      ),
  );
  assert.equal(current.projectFacts.facts.length, originalFactCount);
  assert.equal(current.projectFacts.conflicts.length, 0);
  const resolvedTrafficRequirementPage = current.pagePlan.pages.find(
    (page) => page.page_id === "P008",
  );
  assert.deepEqual(resolvedTrafficRequirementPage.missing_information, []);
  assert.equal(resolvedTrafficRequirementPage.generation_status, "ready");
  assert.equal(resolvedTrafficRequirementPage.body_copy, "");
  assert.equal(resolvedTrafficRequirementPage.body_en, "");

  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workbenchSource, /synchronizeProposalCoverage/);
  assert.match(workbenchSource, /提案确认后的待验证事项/);
});

test("proposal validation never exposes serialized backend fields in content evidence", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = structuredClone(fixture.default);
  const missingItem = data.projectFacts.missing_items.find((item) =>
    item.description.startsWith("Gate B 缺少："),
  );
  assert.ok(missingItem);
  const label = missingItem.description.replace("Gate B 缺少：", "").trim();
  const optionId = `${missingItem.item_id}_O1`;
  const serializedBackendPayload = JSON.stringify({
    option_id: optionId,
    task_brief_fact_refs: ["F_001"],
    selected_option_id: optionId,
    confirmed_direction: "后台值",
  });
  data.projectFacts.gate_b_proposals = [
    {
      missing_item_id: missingItem.item_id,
      missing_label: label,
      origin: "agent_missing",
      status: "awaiting_choice",
      question: `请确认${label}`,
      task_brief_fact_refs: [],
      options: [
        {
          option_id: optionId,
          title: "可读提案",
          summary: "以任务书约束为基础形成设计方向。",
          design_moves: ["落实设计方向"],
          rationale: "回应当前项目条件。",
          task_brief_fact_refs: [],
          assumptions: [],
          validation_needed: [serializedBackendPayload],
        },
      ],
      selected_option_id: null,
      user_input: "",
      confirmed_direction: "",
    },
  ];

  const response = await fetchWorker("/api/pipeline", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "gate_b_proposal",
      operation: "select",
      projectFacts: data.projectFacts,
      pagePlan: data.pagePlan,
      missingItemId: missingItem.item_id,
      selectedOptionId: optionId,
      nodeOutputs: data.nodeOutputs,
    }),
  });
  assert.equal(response.status, 200);
  const current = await response.json();
  const validationItems = current.pagePlan.pages.flatMap((page) =>
    page.unresolved_items.filter((item) =>
      item.startsWith("提案验证事项："),
    ),
  );
  assert.ok(validationItems.length > 0);
  assert.ok(
    validationItems.some((item) =>
      item.includes("补充与已确认方向对应的图纸、计算或专业复核"),
    ),
  );
  assert.ok(
    validationItems.every(
      (item) =>
        !item.includes("option_id") &&
        !item.includes("task_brief_fact_refs") &&
        !item.includes("selected_option_id"),
    ),
  );

  const proposalSource = await readFile(
    new URL("../app/lib/gate-b-proposals.ts", import.meta.url),
    "utf8",
  );
  assert.match(proposalSource, /cleanProposalUserText\(rawValidation\)/);
});

test("missing design goals and evaluation conditions appear as confirmable proposal cards", async () => {
  const response = await fetchWorker("/api/pipeline", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "run",
      mode: "fast",
      projectId: "MISSING_EVALUATION_PROPOSALS",
      documents: [
        {
          document_id: "SYS_REFERENCE_DK05_PRESENTATION",
          file_name: "Guangzhou Yuexiu",
          role: "reference_style",
          version_or_date: "2026-06-10",
          authority_rank: 6,
          page_count: 109,
          text: "===== PAGE 2 =====\n推荐章节结构：项目理解、规划策略、设计概念、空间与功能落实、技术支撑、方案总结。",
        },
        {
          document_id: "DOC_MISSING_EVALUATION",
          file_name: "缺少目标与评审条件的任务书.md",
          role: "authoritative",
          version_or_date: "2026-08-04",
          authority_rank: 1,
          page_count: 2,
          text: [
            "===== PAGE 1 =====",
            "项目名称：城市公共文化中心",
            "设计阶段：方案设计",
            "项目区位：中心城区更新片区。",
            "===== PAGE 2 =====",
            "主要功能：展览、公共教育与城市客厅。",
          ].join("\n"),
        },
      ],
    }),
  });
  assert.equal(response.status, 200);
  let current = await response.json();
  const optionalProductionGap =
    /结构方案|结构体系|结构设计|结构模型|柱网|关键跨度|效果图|渲染图|视觉清单|视觉素材|主视觉|视点清单|空间意向图/;
  assert.equal(
    current.projectFacts.missing_items.some((item) =>
      optionalProductionGap.test(item.description),
    ),
    false,
  );
  assert.equal(
    current.projectFacts.gate_report.gate_b_missing.some((label) =>
      optionalProductionGap.test(label),
    ),
    false,
  );
  assert.equal(
    current.pagePlan.pages.some((page) =>
      page.missing_information.some((item) =>
        optionalProductionGap.test(item),
      ),
    ),
    false,
  );
  const decisionItems = current.projectFacts.missing_items.filter((item) =>
    ["Gate B 缺少：设计目标", "Gate B 缺少：评审条件"].includes(
      item.description,
    ),
  );
  assert.equal(decisionItems.length, 2);
  assert.ok(
    decisionItems.some(
      (item) => item.description === "Gate B 缺少：设计目标",
    ),
  );
  assert.ok(
    decisionItems.some(
      (item) => item.description === "Gate B 缺少：评审条件",
    ),
  );
  assert.ok(
    decisionItems.every(
      (item) =>
        item.severity === "blocking" &&
        item.blocks.includes("page_generation"),
    ),
  );

  const originalFactCount = current.projectFacts.facts.length;
  for (const item of decisionItems) {
    const proposalResponse = await fetchWorker("/api/pipeline", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "gate_b_proposal",
        operation: "custom",
        projectFacts: current.projectFacts,
        pagePlan: current.pagePlan,
        missingItemId: item.item_id,
        userInput: `${item.description.replace("Gate B 缺少：", "")}采用用户确认的项目判断。`,
        nodeOutputs: current.nodeOutputs,
      }),
    });
    assert.equal(proposalResponse.status, 200);
    current = await proposalResponse.json();
  }

  assert.ok(
    decisionItems.every((item) =>
      current.projectFacts.gate_b_proposals.some(
        (proposal) =>
          proposal.missing_item_id === item.item_id &&
          proposal.status === "confirmed" &&
          proposal.confirmed_direction.length > 0,
      ),
    ),
  );
  assert.equal(current.projectFacts.facts.length, originalFactCount);
  assert.ok(
    current.projectFacts.facts.every(
      (fact) =>
        !["evaluation.design_goal", "evaluation.priorities"].includes(
          fact.field_path,
        ),
    ),
  );
});

test("model-required actions fail explicitly when no model is configured", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = fixture.default;
  const requests = [
    {
      action: "run",
      mode: "deep",
      projectId: "MODEL_REQUIRED_DEEP",
      documents: [],
    },
    {
      action: "gate_b_proposal",
      operation: "generate",
      projectFacts: data.projectFacts,
      pagePlan: data.pagePlan,
      missingItemId: "M_B_001",
      nodeOutputs: [],
    },
    {
      action: "generate_page",
      projectFacts: data.projectFacts,
      pagePlan: data.pagePlan,
      pageId: "P003",
      nodeOutputs: [],
    },
    {
      action: "prepare_export",
      format: "pdf",
      projectFacts: data.projectFacts,
      pagePlan: data.pagePlan,
      nodeOutputs: [],
    },
    {
      action: "audit",
      projectFacts: data.projectFacts,
      pagePlan: data.pagePlan,
      nodeOutputs: [],
    },
  ];

  for (const body of requests) {
    const response = await fetchWorker("/api/pipeline", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.match(result.error, /需要真实模型.*没有生成本地替代结果/);
    assert.equal("projectFacts" in result, false);
    assert.equal("pagePlan" in result, false);
  }
});

test("API preserves the provider's 429 reason and never returns a local substitute", async () => {
  const sourceFixture = await import(
    "../fixtures/virtual-project/source-documents.json",
    { with: { type: "json" } }
  );
  let requestCount = 0;
  const response = await fetchWorker(
    "/api/pipeline",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "run",
        mode: "deep",
        projectId: "INVALID_TOKEN_TEST",
        documents: sourceFixture.default,
        apiConfig: {
          baseUrl: "https://custom-model.example/v1",
          model: "gpt-5.5-web-test",
          apiKey: "invalid-test-key",
        },
      }),
    },
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.6-sol",
      OPENAI_API: {
        fetch: async () => {
          requestCount += 1;
          return Response.json(
            {
              error: {
                message: "多次使用无效令牌，请等待 120 秒后再试",
                type: "new_api_error",
              },
            },
            { status: 429 },
          );
        },
      },
    },
  );
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.equal(requestCount, 1);
  assert.match(
    result.error,
    /深度优化未完成.*请求受限（429）.*无效令牌.*120 秒.*没有生成或保存本地替代结果/,
  );
  assert.equal("projectFacts" in result, false);
  assert.equal("pagePlan" in result, false);
});

test("brief-only flow keeps the built-in reference isolated", async () => {
  const fixture = await import(
    "../fixtures/brief-only/full-run.json",
    { with: { type: "json" } }
  );
  const data = fixture.default;
  const referenceIds = new Set(
    data.projectFacts.documents
      .filter((document) => document.role === "reference_style")
      .map((document) => document.document_id),
  );

  assert.equal(data.pagePlan.pages.length, 34);
  assert.ok(data.projectFacts.style_observations.length >= 8);
  assert.ok(data.projectFacts.reference_style_examples.length >= 9);
  assert.equal(data.projectFacts.reference_experience.source_documents.length, 5);
  assert.equal(data.projectFacts.reference_experience.narrative_pages.length, 494);
  assert.equal(data.projectFacts.reference_experience.transition_patterns.length, 159);
  assert.equal(data.projectFacts.reference_experience.page_recipes.length, 244);
  const safeReferenceExperience = JSON.parse(
    await readFile(
      new URL("../app/data/reference-experience.safe.json", import.meta.url),
      "utf8",
    ),
  );
  const guangzhouPages = safeReferenceExperience.narrative_pages.filter(
    (page) =>
      page.source_document_id === "SYS_REFERENCE_DK05_PRESENTATION",
  );
  const guangzhouRecipes = safeReferenceExperience.page_recipes.filter(
    (recipe) =>
      recipe.source_document_id === "SYS_REFERENCE_DK05_PRESENTATION",
  );
  const guangzhouRecipeForPage = (pageNumber) =>
    guangzhouRecipes.find((recipe) =>
      recipe.source_pages.includes(pageNumber)
    );
  assert.equal(guangzhouPages.length, 108);
  assert.equal(
    guangzhouPages.find((page) => page.page_number === 68)?.page_family,
    "三类酒店客房平面",
  );
  assert.equal(guangzhouRecipeForPage(68)?.asset_slots.length, 3);
  assert.equal(
    guangzhouRecipeForPage(68)?.layout_family,
    "hotel_room_plan_three_types",
  );
  assert.equal(
    guangzhouPages.find((page) => page.page_number === 82)?.page_family,
    "办公剖面与功能分析",
  );
  assert.equal(guangzhouRecipeForPage(82)?.asset_slots.length, 2);
  assert.equal(
    guangzhouRecipeForPage(82)?.layout_family,
    "section_function_analysis_two_slots",
  );
  assert.ok(
    [84, 90].every(
      (pageNumber) =>
        guangzhouPages.find((page) => page.page_number === pageNumber)
          ?.page_role === "visual_showcase",
    ),
  );
  assert.equal(
    guangzhouPages.some((page) => page.page_number === 109),
    false,
  );
  assert.ok(
    guangzhouRecipes.every(
      (recipe) => !recipe.source_pages.includes(109),
    ),
  );
  const hqPages = safeReferenceExperience.narrative_pages.filter(
    (page) =>
      page.source_document_id === "SYS_REFERENCE_HQ_MULTI_OPTION",
  );
  const taipeiPages = safeReferenceExperience.narrative_pages.filter(
    (page) =>
      page.source_document_id === "SYS_REFERENCE_URBAN_A3",
  );
  const taipeiSystemRendering = taipeiPages.find(
    (page) => page.page_number === 56,
  );
  assert.equal(taipeiSystemRendering?.page_family, "SYSTEM RENDERING");
  assert.equal(taipeiSystemRendering?.page_type_label, "立面系统渲染");
  assert.equal(taipeiSystemRendering?.parallel_step_key, "system_rendering");
  assert.equal(taipeiSystemRendering?.reuse_level, "low");
  const taipeiRecipes = safeReferenceExperience.page_recipes.filter(
    (recipe) =>
      recipe.source_document_id === "SYS_REFERENCE_URBAN_A3",
  );
  const taipeiRecipeForPage = (pageNumber) =>
    taipeiRecipes.find((recipe) => recipe.source_pages.includes(pageNumber));
  assert.equal(
    taipeiRecipeForPage(56)?.layout_family,
    "system_rendering_two_angles",
  );
  assert.equal(taipeiRecipeForPage(56)?.asset_slots.length, 2);
  assert.equal(
    taipeiRecipeForPage(63)?.layout_family,
    "plan_rendering_two_slots",
  );
  assert.equal(taipeiRecipeForPage(63)?.asset_slots.length, 2);
  assert.equal(
    hqPages.find((page) => page.page_number === 1)?.page_role,
    "section_divider",
  );
  assert.equal(
    hqPages.find((page) => page.page_number === 50)?.parallel_step_key,
    "section_perspective",
  );
  assert.equal(
    hqPages.find((page) => page.page_number === 50)?.page_type_label,
    "剖透视",
  );
  assert.equal(
    hqPages.find((page) => page.page_number === 111)?.page_family,
    "SYSTEM RENDERING",
  );
  assert.equal(
    hqPages.find((page) => page.page_number === 111)?.parallel_step_key,
    "system_rendering",
  );
  assert.ok(
    [122, 123, 124, 125, 126].every((pageNumber) => {
      const page = hqPages.find((item) => item.page_number === pageNumber);
      return page?.page_type_label === "方案比选" &&
        page.scheme_branch === "comparison";
    }),
  );
  const hqRecipes = safeReferenceExperience.page_recipes.filter(
    (recipe) =>
      recipe.source_document_id === "SYS_REFERENCE_HQ_MULTI_OPTION",
  );
  const recipeForPage = (pageNumber) =>
    hqRecipes.find((recipe) => recipe.source_pages.includes(pageNumber));
  assert.equal(recipeForPage(1)?.canonical_page_type, "cover");
  assert.equal(
    recipeForPage(50)?.layout_family,
    "section_perspective_full_width",
  );
  assert.equal(
    recipeForPage(111)?.layout_family,
    "facade_system_sectional_render_text_left_hero_right",
  );
  assert.equal(recipeForPage(111)?.page_type_label, "立面系统渲染");
  assert.ok(recipeForPage(111)?.topics.includes("system_rendering"));
  assert.equal(recipeForPage(111)?.topics.includes("program"), false);
  assert.deepEqual(
    recipeForPage(111)?.asset_slots.map((slot) => slot.label),
    ["局部立面系统剖切渲染", "说明文字块"],
  );
  assert.ok(
    [122, 123, 124, 125, 126].every(
      (pageNumber) =>
        recipeForPage(pageNumber)?.canonical_page_type === "comparison" &&
        recipeForPage(pageNumber)?.scheme_branch === "comparison",
    ),
  );
  const zhuhaiPages =
    data.projectFacts.reference_experience.narrative_pages.filter(
      (page) =>
        page.source_document_id === "SYS_REFERENCE_HOTEL_MIXED_USE",
    );
  assert.equal(zhuhaiPages.length, 96);
  assert.equal(
    zhuhaiPages.find((page) => page.page_number === 8)?.page_role,
    "section_divider",
  );
  assert.equal(
    zhuhaiPages.find((page) => page.page_number === 16)?.page_role,
    "fact_evidence",
  );
  assert.equal(
    zhuhaiPages.find((page) => page.page_number === 88)?.page_role,
    "technical_proof",
  );
  assert.equal(
    zhuhaiPages.find((page) => page.page_number === 30)?.page_role,
    "strategy_statement",
  );
  assert.equal(
    zhuhaiPages.find((page) => page.page_number === 60)?.page_role,
    "technical_proof",
  );
  assert.equal(
    zhuhaiPages.find((page) => page.page_number === 80)?.page_role,
    "visual_showcase",
  );
  assert.equal(
    zhuhaiPages.find((page) => page.page_number === 85)?.page_role,
    "technical_proof",
  );
  assert.equal(
    zhuhaiPages.find((page) => page.page_number === 87)?.page_role,
    "visual_showcase",
  );
  const zhuhaiRecipes =
    data.projectFacts.reference_experience.page_recipes.filter(
      (recipe) =>
        recipe.source_document_id ===
        "SYS_REFERENCE_HOTEL_MIXED_USE",
    );
  const zhuhaiRecipeForPage = (pageNumber) =>
    zhuhaiRecipes.find((recipe) => recipe.source_pages.includes(pageNumber));
  assert.equal(
    zhuhaiRecipeForPage(30)?.layout_family,
    "zhq_strategy_overview_four_photos",
  );
  assert.equal(zhuhaiRecipeForPage(30)?.asset_slots.length, 4);
  assert.equal(
    zhuhaiRecipeForPage(60)?.layout_family,
    "zhq_plan_main_two_photos",
  );
  assert.equal(zhuhaiRecipeForPage(60)?.asset_slots.length, 3);
  assert.equal(
    zhuhaiRecipeForPage(80)?.canonical_page_type,
    "rendering",
  );
  assert.equal(
    zhuhaiRecipeForPage(85)?.layout_family,
    "zhq_hotel_facade_four_evidence",
  );
  assert.equal(zhuhaiRecipeForPage(85)?.asset_slots.length, 4);
  assert.equal(
    zhuhaiRecipeForPage(87)?.canonical_page_type,
    "rendering",
  );
  assert.equal(
    zhuhaiPages.some((page) => page.page_number === 97),
    false,
  );
  assert.ok(
    data.projectFacts.reference_experience.page_recipes
      .filter(
        (recipe) =>
          recipe.source_document_id ===
          "SYS_REFERENCE_HOTEL_MIXED_USE",
      )
      .every((recipe) => recipe.reuse_level === "low"),
  );
  const hsinchuPages =
    data.projectFacts.reference_experience.narrative_pages.filter(
      (page) =>
        page.source_document_id === "SYS_REFERENCE_HSINCHU_TOD",
    );
  const hsinchuRecipes =
    data.projectFacts.reference_experience.page_recipes.filter(
      (recipe) =>
        recipe.source_document_id === "SYS_REFERENCE_HSINCHU_TOD",
    );
  const hsinchuTransitions =
    data.projectFacts.reference_experience.transition_patterns.filter(
      (transition) =>
        transition.source_document_id === "SYS_REFERENCE_HSINCHU_TOD",
    );
  assert.equal(hsinchuPages.length, 90);
  assert.equal(hsinchuRecipes.length, 53);
  assert.equal(hsinchuTransitions.length, 25);
  assert.equal(hsinchuPages.some((page) => page.page_number === 91), false);
  assert.equal(
    hsinchuRecipes.some((recipe) => recipe.source_pages.includes(91)),
    false,
  );
  assert.equal(
    hsinchuTransitions.some((transition) =>
      transition.example_pages.some((example) => example === "90→91")
    ),
    false,
  );
  assert.ok(
    data.projectFacts.facts.every(
      (fact) => !referenceIds.has(fact.source.document_id),
    ),
  );
  assert.ok(
    data.pagePlan.pages.some((page) =>
      page.style_example_refs.some((item) => item.startsWith("RSE_DK05_")),
    ),
  );
  assert.ok(
    data.pagePlan.pages
      .filter((page) => page.page_type === "strategy")
      .every((page) =>
        page.style_example_refs.includes("RSE_DK05_STRATEGY_011"),
      ),
  );
  assert.ok(
    data.pagePlan.pages.every(
      (page) => page.experience_recipe_refs.length >= 1,
    ),
  );
  assert.ok(
    data.pagePlan.pages.some((page) =>
      page.visual_requirements.some((item) =>
        /^结构化经验 [A-Z0-9]+_RX_/.test(item),
      ),
    ),
  );
  assert.ok(
    data.pagePlan.pages.every((page) =>
      page.visual_requirements.some((item) =>
        item.startsWith("结构化经验匹配依据："),
      ),
    ),
  );
});

test("fixture output keeps company information out of facts and copy", async () => {
  const fixture = await import(
    "../fixtures/virtual-project/full-run.json",
    { with: { type: "json" } }
  );
  const data = fixture.default;
  const companyDocumentIds = new Set(
    data.projectFacts.documents
      .filter((document) => document.role === "company_info")
      .map((document) => document.document_id),
  );

  assert.equal(data.pagePlan.pages.length, 34);
  assert.equal(data.modelCallCount, 0);
  assert.ok(
    data.projectFacts.facts.every(
      (fact) => !companyDocumentIds.has(fact.source.document_id),
    ),
  );
  assert.ok(
    data.pagePlan.pages.every(
      (page) => !/有限公司|联系电话|主创建筑师/.test(page.body_copy),
    ),
  );
});

test("project history supports persisted undo and full-version restore", async () => {
  const [workbenchSource, storeSource, css] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/local-project-store.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(storeSource, /history\?: ProjectHistoryEntry\[\]/);
  assert.match(storeSource, /export interface ProjectHistoryEntry/);
  assert.match(workbenchSource, /historySafeDocuments\(entry\.documents\)/);
  assert.match(workbenchSource, /historySafeResult/);
  assert.match(workbenchSource, /result: historySafeResult\(entry\.result\)/);
  assert.match(
    workbenchSource,
    /result: structuredClone\(historySafeResult\(overrides\?\.result \?\? result\)\)/,
  );
  assert.match(workbenchSource, /history_compacted: true/);
  assert.match(workbenchSource, /file_data: undefined/);
  assert.match(workbenchSource, /visual_pages: undefined/);
  assert.match(workbenchSource, /persistedProjectDocuments/);
  assert.match(
    workbenchSource,
    /if \(documentsChanged\) await clearLocalProjectDraft\(\)/,
  );
  assert.match(
    workbenchSource,
    /setHistory\(\(current\) => \[\.\.\.current, entry\]\.slice\(-20\)\)/,
  );
  assert.match(workbenchSource, /const undoLastChange = \(\) =>/);
  assert.match(workbenchSource, /const restoreHistoryEntry = \(/);
  assert.match(workbenchSource, /recordHistory\(historyLabel\)/);
  assert.match(workbenchSource, /recordHistory\("编辑当前页全部文字"\)/);
  assert.match(workbenchSource, />\s*撤销上一步\s*</);
  assert.match(workbenchSource, />\s*历史版本\s*</);
  assert.match(workbenchSource, /恢复此版本/);
  assert.match(css, /\.project-history-panel/);
});

test("core concept page replaces the template label with the actual concept name", async () => {
  const [workbenchSource, presentationCopySource, modelPipelineSource] = await Promise.all([
    readFile(
      new URL("../app/components/Workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/presentation-copy.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/model-pipeline.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(presentationCopySource, /export function extractConceptName/);
  assert.match(presentationCopySource, /export function extractEnglishConceptName/);
  assert.match(
    workbenchSource,
    /extractConceptName\(\s*\[reportHeadline, reportCoreMessage, reportBody\]/,
  );
  assert.match(workbenchSource, /`核心概念：\$\{conceptName\}`/);
  assert.match(workbenchSource, /`CORE CONCEPT\$\{conceptNameEn/);
  assert.doesNotMatch(workbenchSource, /conceptName \? <h4>/);
  assert.doesNotMatch(workbenchSource, /<h4>设计概念 \/ DESIGN CONCEPT<\/h4>/);
  assert.match(modelPipelineSource, /`核心概念：\$\{generatedConceptName\}`/);
  assert.match(modelPipelineSource, /reconciledVisibleFieldForCoverage/);
});

test("visual image requests classify network failures, slim payloads and preserve recoverable jobs", async () => {
  const [modelClientSource, routeSource, workbenchSource, storeSource, imageModelSource, css] =
    await Promise.all([
      readFile(new URL("../app/lib/model-client.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/pipeline/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/Workbench.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/lib/local-project-store.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/lib/visual-image-model.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);

  assert.match(modelClientSource, /export function classifyModelTransportError/);
  assert.match(modelClientSource, /"DNS"/);
  assert.match(modelClientSource, /"TLS"/);
  assert.match(modelClientSource, /"CONNECTION_RESET"/);
  assert.match(modelClientSource, /"NETWORK"/);
  assert.match(
    modelClientSource,
    /classifyModelTransportError\([\s\S]*error,[\s\S]*attemptCount/,
  );
  assert.match(modelClientSource, /providerRetryAfterMs/);
  assert.match(modelClientSource, /__ARCH_REPORT_IMAGE_MODEL_THROTTLES__/);
  assert.match(modelClientSource, /runInImageModelQueue/);
  assert.match(modelClientSource, /imageRetryDelayMs/);
  assert.match(
    modelClientSource,
    /"gpt-image-2"[\s\S]*"gpt-image-2-c"[\s\S]*"gpt-image-1\.5"[\s\S]*"gpt-image-1"/,
  );
  assert.match(modelClientSource, /"gpt-image-2"/);
  assert.match(modelClientSource, /extractImageFromUnknown/);
  assert.match(modelClientSource, /reference\.role === "project_continuity"/);
  assert.match(modelClientSource, /同一项目的连续性母版/);
  assert.match(modelClientSource, /resolvedReferenceImages/);
  assert.match(modelClientSource, /"b64_json"/);
  assert.match(modelClientSource, /"output_image"/);
  assert.match(modelClientSource, /"output_image_url"/);
  assert.match(modelClientSource, /"output_image"|image_url/);
  assert.match(routeSource, /class PipelineOperationError extends Error/);
  assert.match(routeSource, /runRecoverableVisualJob/);
  assert.match(routeSource, /__ARCH_REPORT_VISUAL_JOB_CACHE__/);
  assert.match(routeSource, /errorCode:\s*operationError\?\.code/);
  assert.match(routeSource, /retryable:\s*operationError\?\.retryable/);
  assert.match(routeSource, /retryAfterMs:/);
  assert.match(workbenchSource, /function compactVisualImageProjectFacts/);
  assert.match(workbenchSource, /function compactVisualImagePagePlan/);
  assert.match(workbenchSource, /target_page_count:\s*1/);
  assert.match(workbenchSource, /pages:\s*\[page\]/);
  assert.match(workbenchSource, /delete page\.visual_task\.generated_images/);
  assert.match(workbenchSource, /transportRetries:\s*2/);
  assert.match(workbenchSource, /const rawResponse = await response\.text\(\)/);
  assert.match(workbenchSource, /INVALID_RESPONSE/);
  assert.match(workbenchSource, /云端服务暂时不可用/);
  assert.match(workbenchSource, /x-cloudbase-request-id/);
  assert.match(workbenchSource, /text\/event-stream/);
  assert.match(workbenchSource, /terminalEvent/);
  assert.match(routeSource, /visualImageEventStream/);
  assert.match(routeSource, /: heartbeat/);
  assert.match(routeSource, /15_000/);
  assert.match(workbenchSource, /continuityReference/);
  assert.match(workbenchSource, /continuityAnchorPage/);
  assert.match(workbenchSource, /visualImageDataUrlCache/);
  assert.match(workbenchSource, /compactContinuityImage/);
  assert.match(workbenchSource, /canvas\.toBlob\(resolve, "image\/webp", 0\.76\)/);
  assert.match(modelClientSource, /detail:\s*"low"/);
  assert.match(modelClientSource, /maxAttempts = 2,/);
  assert.match(imageModelSource, /项目视觉不变量契约/);
  assert.match(imageModelSource, /不得改成另一项目/);
  assert.match(workbenchSource, /恢复这次生图任务/);
  assert.match(
    workbenchSource,
    /setVisualImageJob\(\(current\) =>[\s\S]*?current\?\.pageId === selectedPage\.page_id \? null : current/,
  );
  assert.match(storeSource, /visualImageJob\?: PersistedVisualImageJob/);
  assert.match(storeSource, /retryAvailableAt\?: string/);
  assert.match(css, /\.visual-image-job-recovery/);
});

test("small mode waits for explicit final-copy and full-image actions", async () => {
  const [workbenchSource, routeSource, imageModelSource, localReadinessSource, modelClientSource] = await Promise.all([
    readFile(new URL("../app/components/Workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pipeline/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/visual-image-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/small-mode-local-readiness.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/model-client.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workbenchSource, /const generateAllPageCopy = async \(\) =>/);
  assert.match(workbenchSource, /生成整套终稿文案/);
  assert.match(workbenchSource, /const generateAllVisualImages = async \(\) =>/);
  assert.match(workbenchSource, /生成整套 AI 图纸/);
  assert.doesNotMatch(
    workbenchSource,
    /window\.setTimeout\(\(\) => \{\s*void generateAllVisualImages\(\);/,
  );
  assert.match(routeSource, /small_mode_content_match: smallModeContentMatch/);
  assert.match(routeSource, /smallModeContentMatchVerified/);
  assert.match(
    routeSource,
    /请先点击“生成整套终稿文案”完成整套内容匹配审查，再生成 AI 图/,
  );
  assert.match(
    workbenchSource,
    /nodeOutput\.output as \{\s*small_mode_content_match\?: boolean;/,
  );
  assert.match(
    workbenchSource,
    /maxJobAttempts = isSmallBuildingMode\(taskMode\) \? 3 : 2/,
  );
  assert.match(
    workbenchSource,
    /isSmallBuildingMode\(taskMode\) \? 1 : 2/,
  );
  assert.match(routeSource, /smallModeContentMatchVerified/);
  assert.match(routeSource, /incomingHasRequestedSlot/);
  assert.match(routeSource, /canonicalSlots\.length === 1/);
  assert.match(routeSource, /slot_id: payload\.slotId/);
  assert.match(
    imageModelSource,
    /imageModel: "gpt-image-2"/,
  );
  assert.match(
    imageModelSource,
    /fallbackImageModels: smallMode\s*\?\s*\["gpt-image-2-c", "gpt-image-1\.5", "gpt-image-1"\]/,
  );
  assert.match(imageModelSource, /固定方案 DNA（最高优先级，跨页不得改变）/);
  assert.match(imageModelSource, /objectDna\.join/);
  assert.match(imageModelSource, /const submittedImagePrompt = smallMode/);
  assert.match(imageModelSource, /\.slice\(0, 5_200\)/);
  assert.match(
    imageModelSource,
    /const ultraCompactSmallModeSlot = smallMode;/,
  );
  assert.match(imageModelSource, /const smallModeMustShowAllObjects =/);
  assert.match(imageModelSource, /缺少任一对象即失败/);
  assert.match(imageModelSource, /不得合并、替换、隐藏或省略/);
  assert.match(
    imageModelSource,
    /\.slice\(0, smallModeMustShowAllObjects \? 6_000 : 2_400\)/,
  );
  assert.match(imageModelSource, /maxAttempts: smallMode \? 3 : 2/);
  assert.match(
    modelClientSource,
    /图像模型返回成功响应，但没有调用图像生成工具或返回可用图片/,
  );
  assert.match(
    workbenchSource,
    /page\.page_id,\s*undefined,\s*true,/,
  );
  assert.match(imageModelSource, /const promptResponse = smallTaskMode/);
  assert.match(imageModelSource, /local-small-mode-visual-prompt/);
  assert.match(workbenchSource, /const DEFAULT_PIPELINE_IMAGE_MODEL = "gpt-image-2"/);
  assert.equal(
    workbenchSource.match(/imageApiSettingsForTaskMode\(apiSettings, taskMode\)/g)
      ?.length,
    2,
  );
  assert.match(
    imageModelSource,
    /!smallTaskMode &&\s*imageSlots\.length > 1/,
  );
  assert.match(routeSource, /const promptModelCallCount =/);
  assert.match(workbenchSource, /verifiedSmallModeImageNodeOutputs/);
  assert.match(workbenchSource, /verification: "deterministic_current_plan"/);
  assert.match(localReadinessSource, /minimumPageCount/);
  assert.match(localReadinessSource, /六段设计链缺少/);
  assert.match(localReadinessSource, /缺少完整的造型与建造性母题/);
  assert.match(localReadinessSource, /任务书未确认的配置/);
});

test("small building and installation is the only user-visible small-pipeline name", async () => {
  const [workbenchSource, routeSource, factsSchema, pagePlanSchema] =
    await Promise.all([
      readFile(new URL("../app/components/Workbench.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/pipeline/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../schemas/project_facts.schema.json", import.meta.url), "utf8"),
      readFile(new URL("../schemas/page_plan.schema.json", import.meta.url), "utf8"),
    ]);

  assert.match(workbenchSource, /<strong>小型建筑\/装置<\/strong>/);
  assert.match(workbenchSource, /小型建筑\/装置 · 任务书拆页模式/);
  assert.doesNotMatch(workbenchSource, /小型建筑或室内/);
  assert.match(routeSource, /小型建筑\/装置文本匹配审查/);
  assert.match(factsSchema, /小型建筑\/装置/);
  assert.match(pagePlanSchema, /小型建筑\/装置管线/);
});

test("buildability skill is isolated to the small building and installation pipeline", async () => {
  const [modelPipeline, visualModel, contentGate, buildability] =
    await Promise.all([
      readFile(new URL("../app/lib/model-pipeline.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/visual-image-model.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/small-mode-content-gate.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/small-scale-buildability.ts", import.meta.url), "utf8"),
    ]);

  assert.match(
    modelPipeline,
    /small_scale_buildability_skill: isSmallBuildingMode\(taskMode\)/,
  );
  assert.match(
    visualModel,
    /isSmallBuildingMode\([\s\S]*?smallScaleBuildabilityPrompt\(projectFacts, page\)/,
  );
  assert.match(contentGate, /secondBuildability\.score < 60/);
  assert.match(contentGate, /低于60，已停止 AI 生图/);
  assert.match(contentGate, /const chainCorpus = visibleCallouts\.join/);
  assert.match(contentGate, /function ensureVisibleSixChain/);
  assert.match(contentGate, /prefix: "产品诉求"/);
  assert.match(contentGate, /prefix: "装置转译"/);
  assert.match(contentGate, /prefix: "空间形态"/);
  assert.match(contentGate, /prefix: "互动动作"/);
  assert.match(contentGate, /prefix: "材料灯光"/);
  assert.match(contentGate, /prefix: "传播\/复用"/);
  assert.match(contentGate, /const repairedPagePlan = ensureVisibleSixChain/);
  assert.match(contentGate, /raw review notes must never become visible/);
  assert.match(buildability, /不执行或伪造结构计算/);
  assert.match(buildability, /形式→结构系统→构件→材料→连接→加工→运输→现场装配→锚固→维护/);
  assert.match(modelPipeline, /normalized\.visual_brief = \(normalized\.visual_brief \?\? \[\]\)\.map/);
  assert.match(modelPipeline, /normalized\.visual_requirements = \(normalized\.visual_requirements \?\? \[\]\)\.map/);
  assert.match(modelPipeline, /机械式压力触发节点\/gu, "穿行与触摸体验"/);
  assert.match(modelPipeline, /互动=\[\^｜\]\*\/u, `互动=\$\{groundedInteraction\}`/);
  assert.match(modelPipeline, /机械呼吸花瓣\/gu, "泡茶、闻香与品鉴节点"/);
  assert.match(modelPipeline, /素烧瓷片互动墙\/gu, "可替换共创模块"/);
  assert.match(modelPipeline, /可擦写釉水笔\/gu, "水性创作笔"/);
  assert.match(modelPipeline, /骨架永久复用\/gu, "骨架维护后供次年再次部署"/);
  assert.match(modelPipeline, /const refreshedVisualTask = createVisualTask\(projectFacts, normalized\)/);
  assert.match(modelPipeline, /previousSlotLabels\.get\(slot\.slot_id\) === slot\.label/);
  assert.match(modelPipeline, /legacyGeneratedImageFromSlots/);
});

test("small mode extracts or proposes three editable design directions", async () => {
  const [directionSource, pipelineSource, workbenchSource] = await Promise.all([
    readFile(
      new URL("../app/lib/small-mode-design-directions.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/pipeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Workbench.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(directionSource, /M_SMALL_DESIGN_DIRECTION/);
  assert.match(directionSource, /smallModeDesignDirectionFacts/);
  assert.match(directionSource, /event\.positioning/);
  assert.match(directionSource, /(?:装置\|节点)/);
  assert.match(directionSource, /母题转译与场所体验/);
  assert.match(directionSource, /模块化构件与可复用系统/);
  assert.match(directionSource, /材料界面与光影参与/);
  assert.match(directionSource, /smallScaleBuildabilityPrompt/);
  assert.match(directionSource, /task_brief_fact_refs: refs/);
  assert.match(pipelineSource, /ensureSmallModeDesignDirectionState/);
  assert.match(workbenchSource, /当前设计方向/);
  assert.match(workbenchSource, /任务书已提取/);
  assert.match(workbenchSource, /Agent 已先生成三个候选方向/);
  assert.match(workbenchSource, /编辑并确认当前方向/);
});

test("design projects save into one switchable catalog with rename and delete", async () => {
  const [workbenchSource, localStoreSource, cloudStoreSource, apiSource, sql, css] =
    await Promise.all([
      readFile(new URL("../app/components/Workbench.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/local-project-store.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/memfire-store.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/projects/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../memfire/schema.sql", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);

  assert.match(localStoreSource, /PROJECT_INDEX_KEY = "project-index-v2"/);
  assert.match(localStoreSource, /export async function listLocalProjectDrafts/);
  assert.match(localStoreSource, /export async function renameLocalProjectDraft/);
  assert.match(localStoreSource, /export async function deleteLocalProjectDraft/);
  assert.match(cloudStoreSource, /MEMFIRE_SERVICE_ROLE_KEY/);
  assert.match(cloudStoreSource, /architectural_report_projects/);
  assert.match(cloudStoreSource, /architectural-report-assets/);
  assert.match(cloudStoreSource, /"x-upsert": "true"/);
  assert.match(cloudStoreSource, /externalizeGeneratedImages/);
  assert.match(cloudStoreSource, /\$\{safeAssetSegment\(slotId\)\}\.\$\{extension\}/);
  assert.match(workbenchSource, /new TextDecoder\(\)\.decode\(bytes\.slice\(8, 12\)\)/);
  assert.match(cloudStoreSource, /method: "PATCH"/);
  assert.match(cloudStoreSource, /status: archived \? "archived" : "active"/);
  assert.match(cloudStoreSource, /PROJECT_VERSION_CONFLICT/);
  assert.match(cloudStoreSource, /updated_at=eq\./);
  assert.match(apiSource, /expectedUpdatedAt/);
  assert.match(apiSource, /imageUrls = result\.imageUrls/);
  assert.match(apiSource, /return NextResponse\.json\(\{ ok: true, updatedAt, imageUrls \}\)/);
  assert.match(workbenchSource, /generated_images is canonical/);
  assert.match(workbenchSource, /lastCloudPersistedVisualImageRef/);
  assert.match(workbenchSource, /currentCloudStatus = await getCloudStoreStatus/);
  assert.match(workbenchSource, /AI 图片云端保存失败/);
  assert.match(cloudStoreSource, /export async function renameMemFireProject/);
  assert.match(cloudStoreSource, /export async function deleteMemFireProject/);
  assert.match(apiSource, /action\?: "save" \| "rename" \| "delete"/);
  assert.match(apiSource, /renameMemFireProject/);
  assert.match(apiSource, /deleteMemFireProject/);
  assert.match(workbenchSource, /const deleteStoredProject = async/);
  assert.match(workbenchSource, /const renameStoredProject = async/);
  assert.match(workbenchSource, /删除后将同时移除云端存档，且无法恢复/);
  assert.match(workbenchSource, /deleteCloudProject/);
  assert.match(workbenchSource, /deleteLocalProjectDraft/);
  assert.match(css, /\.project-archive-delete-button/);
  assert.match(sql, /create table if not exists public\.architectural_report_projects/);
  assert.doesNotMatch(workbenchSource, /const archiveAndCreateProject = async/);
  assert.match(workbenchSource, /const createNewProject = async/);
  assert.match(workbenchSource, /useState\(\(\) => crypto\.randomUUID\(\)\)/);
  assert.doesNotMatch(workbenchSource, /projectId \|\| crypto\.randomUUID\(\)/);
  assert.match(workbenchSource, />\s*设计档案\s*</);
  assert.match(workbenchSource, />\s*新建设计\s*</);
  assert.match(workbenchSource, /保存设计/);
  assert.match(workbenchSource, /AUTOSAVE_INTERVAL_MS = 15 \* 60 \* 1000/);
  assert.match(workbenchSource, /每15分钟/);
  assert.match(workbenchSource, /仅手动保存/);
  assert.match(workbenchSource, /保存设计后会自动出现在这里/);
  assert.match(workbenchSource, /重命名设计/);
  assert.match(workbenchSource, /删除设计/);
  assert.match(workbenchSource, /已保存在云端/);
  assert.match(workbenchSource, /CloudProjectConflictError/);
  assert.doesNotMatch(workbenchSource, /结构已建立/);
  assert.match(workbenchSource, /文案待生成/);
  assert.match(workbenchSource, /文案已生成/);
  assert.match(workbenchSource, /文案已审核/);
  assert.doesNotMatch(workbenchSource, /结构页已完成/);
  assert.doesNotMatch(workbenchSource, /内容已完成/);
  assert.match(css, /\.project-archive-panel/);
});

test("the workbench is protected by MemFire Auth login", async () => {
  const [authSource, pageSource, authRouteSource, projectRouteSource, pipelineRouteSource, loginSource] =
    await Promise.all([
      readFile(new URL("../app/lib/app-auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/projects/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/pipeline/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(authSource, /\/auth\/v1\/token\?grant_type=password/);
  assert.match(authSource, /\/auth\/v1\/token\?grant_type=refresh_token/);
  assert.match(authSource, /allowRefresh/);
  assert.match(authSource, /persistRefreshedSession/);
  assert.match(authSource, /\/auth\/v1\/user/);
  assert.match(authRouteSource, /AUTH_ACCESS_TOKEN_COOKIE/);
  assert.match(authRouteSource, /AUTH_REFRESH_TOKEN_COOKIE/);
  assert.match(authRouteSource, /httpOnly: true/);
  assert.match(pageSource, /await getAppUser\(\)/);
  assert.match(pageSource, /return <LoginPage \/>/);
  assert.match(projectRouteSource, /await requireAppUser\(\)/);
  assert.match(pipelineRouteSource, /await requireAppUser\(\)/);
  assert.match(loginSource, /登录设计汇报工作台/);
  assert.match(loginSource, /不会保存明文密码/);
});

test("historical reference library exposes connection state but not catalog details", async () => {
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workbenchSource, /参考库已接入/);
  assert.match(workbenchSource, /具体项目、页码和配方不在用户端展示/);
  assert.doesNotMatch(workbenchSource, /function ReferenceLibraryCard/);
  assert.doesNotMatch(workbenchSource, /原始结构化输出/);
  assert.doesNotMatch(workbenchSource, />\s*调试数据\s*</);
});

test("metric boundary pages use sourced current-project metrics without library imagery", async () => {
  const [pipelineSource, visualTaskSource, visualReferenceSource, imageSource, promptSource] =
    await Promise.all([
      readFile(new URL("../app/lib/pipeline.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/visual-task.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/visual-reference.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/visual-image-model.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/model-prompts.ts", import.meta.url), "utf8"),
    ]);

  assert.match(pipelineSource, /灰白场地模型上的彩色抽象功能体块 diagram/);
  assert.match(visualTaskSource, /指标约束与功能体量图解/);
  assert.match(visualTaskSource, /task\.image_slots\.length !== 1/);
  assert.match(visualTaskSource, /if \(isMetricBoundaryPage\(page\)\) return 1;/);
  assert.match(visualTaskSource, /validVisualTaskStatuses/);
  assert.match(visualTaskSource, /面积、容积率、建筑限高、总建筑面积/);
  assert.match(visualReferenceSource, /VR_URBAN_A3_P017/);
  assert.match(visualReferenceSource, /指标边界图解范式优先/);
  assert.match(visualReferenceSource, /规划指标\.\*建设边界/);
  assert.match(imageSource, /当前页必须绘入的已核验指标/);
  assert.match(imageSource, /不得只生成无数据标注的建筑体量图/);
  assert.match(promptSource, /灰白场地\/城市模型作为底图/);
  assert.match(promptSource, /不得引入任何后台素材库图片中的数字、功能或项目形态/);
  const workbenchSource = await readFile(
    new URL("../app/components/Workbench.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workbenchSource, /a3-massing-metric-labels/);
  assert.match(workbenchSource, /"planning\.site_area": "用地面积"/);
  assert.match(workbenchSource, /isMetricBoundaryPage\(page\) \|\| !referenceDraftsAllowed/);
});
