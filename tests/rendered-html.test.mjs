import assert from "node:assert/strict";
import test from "node:test";

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
  return new Response(
    JSON.stringify({
      id: `resp_test_${name}`,
      model: "gpt-5.6-sol",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(value) }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 20 },
    }),
    { headers: { "content-type": "application/json" } },
  );
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

test("server-renders the single-project reporting workbench", async () => {
  const response = await fetchWorker();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>单项目建筑汇报工作台<\/title>/);
  assert.match(html, /单项目建筑汇报工作台/);
  assert.match(html, /页级目录/);
  assert.match(html, /Gate A/);
  assert.match(html, /Gate B/);
  assert.match(html, /历史参考已经准备好/);
  assert.match(html, /26_0610 PRESENTATION_LR\.pdf/);
  assert.match(html, /上传本项目任务书/);
  assert.doesNotMatch(html, /滨水文化中心概念方案竞赛/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("API runs registration through audit with the canonical contracts", async () => {
  const fixture = await import(
    "../fixtures/virtual-project/source-documents.json",
    { with: { type: "json" } }
  );
  const pipelineResponse = await fetchWorker("/api/pipeline", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "run",
      projectId: "VIRTUAL_RIVERFRONT_CULTURE",
      documents: fixture.default,
    }),
  });
  assert.equal(pipelineResponse.status, 200);
  const pipeline = await pipelineResponse.json();
  assert.equal(pipeline.pagePlan.pages.length, 10);
  assert.equal(pipeline.modelCallCount, 0);

  const generationResponse = await fetchWorker("/api/pipeline", {
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
    }),
  });
  assert.equal(generationResponse.status, 200);
  const generated = await generationResponse.json();
  assert.equal(
    generated.pagePlan.pages.find((page) => page.page_id === "P003")
      .generation_status,
    "generated",
  );

  const auditResponse = await fetchWorker("/api/pipeline", {
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
    }),
  });
  assert.equal(auditResponse.status, 200);
  const audited = await auditResponse.json();
  assert.equal(
    audited.pagePlan.pages.find((page) => page.page_id === "P003")
      .generation_status,
    "reviewed",
  );
  assert.equal(audited.nodeOutputs.length, 6);
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
  const requestedSchemas = [];
  const modelEnv = {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-5.6-sol",
    OPENAI_API: {
      fetch: async (request) => {
        const body = await request.json();
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
        if (name === "page_plan") {
          return modelResponse(name, expected.pagePlan);
        }
        if (name === "report_page") {
          return modelResponse(
            name,
            expected.pagePlan.pages.find((page) => page.page_id === "P003"),
          );
        }
        if (name === "audit_report") {
          return modelResponse(name, expected.pagePlan.audit_report);
        }
        return new Response("Unexpected schema", { status: 400 });
      },
    },
  };

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
        projectId: "VIRTUAL_RIVERFRONT_CULTURE",
        documents: sourceFixture.default,
      }),
    },
    modelEnv,
  );
  assert.equal(pipelineResponse.status, 200);
  const pipeline = await pipelineResponse.json();
  assert.equal(pipeline.executionMode, "openai_model");
  assert.equal(pipeline.modelCallCount, 4);
  assert.deepEqual(requestedSchemas, [
    "document_registration",
    "project_facts",
    "project_completeness",
    "page_plan",
  ]);
  assert.ok(
    pipeline.nodeOutputs.every(
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
      }),
    },
    modelEnv,
  );
  assert.equal(generationResponse.status, 200);
  const generated = await generationResponse.json();
  assert.equal(generated.executionMode, "openai_model");
  assert.equal(generated.modelCallCount, 5);
  assert.equal(requestedSchemas.at(-1), "report_page");

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
      }),
    },
    modelEnv,
  );
  assert.equal(auditResponse.status, 200);
  const audited = await auditResponse.json();
  assert.equal(audited.executionMode, "openai_model");
  assert.equal(audited.modelCallCount, 6);
  assert.equal(requestedSchemas.at(-1), "audit_report");
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

  assert.equal(data.pagePlan.pages.length, 10);
  assert.ok(data.projectFacts.style_observations.length >= 8);
  assert.ok(
    data.projectFacts.facts.every(
      (fact) => !referenceIds.has(fact.source.document_id),
    ),
  );
  assert.ok(
    data.pagePlan.pages.some((page) =>
      page.visual_requirements.some((item) =>
        item.startsWith("历史参考页型："),
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

  assert.equal(data.pagePlan.pages.length, 10);
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
