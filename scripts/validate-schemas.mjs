import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const sourceRoot = resolve(
  projectRoot,
  "..",
  "output",
  "design_report_agent_v0_1",
);

const readJson = async (path) =>
  JSON.parse(await readFile(path, { encoding: "utf8" }));

const [factsSchema, planSchema, dk05Example, fixtureRun, briefOnlyRun] = await Promise.all([
  readJson(resolve(sourceRoot, "schemas", "project_facts.schema.json")),
  readJson(resolve(sourceRoot, "schemas", "page_plan.schema.json")),
  readJson(resolve(sourceRoot, "examples", "dk05_fact_snapshot.json")),
  readJson(
    resolve(projectRoot, "fixtures", "virtual-project", "full-run.json"),
  ),
  readJson(resolve(projectRoot, "fixtures", "brief-only", "full-run.json")),
]);

const ajv = new Ajv2020({ allErrors: true, strict: false });
if (!ajv.validateSchema(factsSchema)) {
  throw new Error(`Invalid project facts schema: ${ajv.errorsText()}`);
}
if (!ajv.validateSchema(planSchema)) {
  throw new Error(`Invalid page plan schema: ${ajv.errorsText()}`);
}

const validateFacts = ajv.compile(factsSchema);
const validatePlan = ajv.compile(planSchema);

for (const [name, value, validator] of [
  ["DK05 fact example", dk05Example, validateFacts],
  ["fixture facts", fixtureRun.projectFacts, validateFacts],
  ["fixture page plan", fixtureRun.pagePlan, validatePlan],
  ["brief-only facts", briefOnlyRun.projectFacts, validateFacts],
  ["brief-only page plan", briefOnlyRun.pagePlan, validatePlan],
]) {
  if (!validator(value)) {
    throw new Error(`${name} failed: ${ajv.errorsText(validator.errors)}`);
  }
}

console.log(
  "Schema PASS: canonical schemas, DK05 example, full fixture, and brief-only fixture.",
);
