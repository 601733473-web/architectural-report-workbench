import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import {
  runPipeline,
  type InputDocument,
} from "../app/lib/pipeline";
import { smallModeDesignDirectionCards } from "../app/lib/small-mode-design-directions";
import { assertPagePlan, assertProjectFacts } from "../app/lib/schema-validator";

const briefPath = process.argv[2] ?? "C:/Users/60173/Downloads/织回城市_旧衣再生生活节_500字缩减版任务书.docx";

function decodeXml(value: string) {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");
}

async function readDocxText(path: string) {
  const archive = await JSZip.loadAsync(await readFile(path));
  const xml = await archive.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("DOCX 正文为空。");
  return (xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gu) ?? [])
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
        .map((match) => decodeXml(match[1] ?? ""))
        .join(""),
    )
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const text = briefPath.toLowerCase().endsWith(".docx")
  ? await readDocxText(briefPath)
  : await readFile(briefPath, "utf8");
const document: InputDocument = {
  document_id: "DOC_REGRESSION_WEAVE_CITY",
  file_name: briefPath.split(/[\\/]/u).at(-1) ?? "task-brief.docx",
  role: "authoritative",
  version_or_date: "2026-08-27",
  page_count: 1,
  text,
};

const result = runPipeline(
  [document],
  "SMALL_DOCX_TASK_BRIEF_REGRESSION",
  "small_building_or_interior",
);
assertProjectFacts(result.projectFacts);
assertPagePlan(result.pagePlan);

const values = result.projectFacts.facts.map((fact) => String(fact.value_raw));
const factsText = values.join(" ");
const directions = smallModeDesignDirectionCards(result.projectFacts);
if (result.projectFacts.project_name_anonymized !== "回线循环材料实验室") {
  throw new Error(`项目名称提取错误：${result.projectFacts.project_name_anonymized}`);
}
for (const expected of ["织回城市——旧衣再生生活节", "旧衣不旧，城市再织", "纤维再生站", "共织风廊", "回线声毡", "再生织带"]) {
  if (!factsText.includes(expected)) throw new Error(`任务书事实缺失：${expected}`);
}
for (const legacy of ["景德镇", "斗器大会", "浮梁", "山泉水的“真”"]) {
  if (factsText.includes(legacy)) throw new Error(`发现旧项目残留：${legacy}`);
}
if (directions.length !== 2 || directions.map((item) => item.title).join("|") !== "纤维再生站|共织风廊") {
  throw new Error(`设计方向提取错误：${directions.map((item) => item.title).join("、")}`);
}
const nodeHeadlines = result.pagePlan.pages
  .filter((page) => /^(?:节点|装置)[一二三四五六七八九十\d]+｜/u.test(page.headline_zh))
  .map((page) => page.headline_zh);
if (!nodeHeadlines.some((headline) => headline.includes("纤维再生站")) || !nodeHeadlines.some((headline) => headline.includes("共织风廊"))) {
  throw new Error(`页面标题没有沿用两个任务书方向：${nodeHeadlines.join("；")}`);
}
const summary = result.pagePlan.pages.find((page) => page.page_type === "summary");
if (!summary || !summary.visual_requirements.some((item) => item.includes("方案1｜纤维再生站")) || !summary.visual_requirements.some((item) => item.includes("方案2｜共织风廊"))) {
  throw new Error("总结页没有形成两个并列方案名称。");
}
const overlongPages = result.pagePlan.pages.filter((page) => {
  const body = `${page.core_message}${page.body_copy ?? ""}`.replace(/\s+/gu, "");
  return body.length > 150;
});
if (overlongPages.length) {
  throw new Error(`初始小型建筑页面存在超过 150 字的可见正文：${overlongPages.map((page) => `${page.page_id}(${page.core_message.length})`).join("、")}`);
}

console.log(`Small DOCX brief PASS: ${result.projectFacts.facts.length} facts, ${directions.length} directions, ${result.pagePlan.pages.length} pages; current brief isolated and transferred.`);
