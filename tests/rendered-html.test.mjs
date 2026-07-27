import assert from "node:assert/strict";
import test from "node:test";

async function fetchWorker(path = "/", init = {}) {
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
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the single-project reporting workbench", async () => {
  const response = await fetchWorker();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>单项目建筑汇报工作台<\/title>/);
  assert.match(html, /单项目建筑汇报工作台/);
  assert.match(html, /页级目录/);
  assert.match(html, /BODY COPY/);
  assert.match(html, /Gate A/);
  assert.match(html, /Gate B/);
  assert.match(html, /滨水文化中心概念方案竞赛/);
  assert.match(html, /以明确指标建立设计边界/);
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
