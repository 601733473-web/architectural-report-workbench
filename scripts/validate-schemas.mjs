import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const sourceRoot = projectRoot;

const readJson = async (path) =>
  JSON.parse(await readFile(path, { encoding: "utf8" }));

const [factsSchema, planSchema, narrativeSchema, visualLibrarySchema, visualLibrary, dk05Example, fixtureRun, briefOnlyRun] = await Promise.all([
  readJson(resolve(sourceRoot, "schemas", "project_facts.schema.json")),
  readJson(resolve(sourceRoot, "schemas", "page_plan.schema.json")),
  readJson(resolve(sourceRoot, "schemas", "design_narrative.schema.json")),
  readJson(resolve(sourceRoot, "schemas", "visual_reference_library.schema.json")),
  readJson(resolve(sourceRoot, "app", "data", "visual-reference-library.json")),
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
if (!ajv.validateSchema(narrativeSchema)) {
  throw new Error(`Invalid design narrative schema: ${ajv.errorsText()}`);
}
if (!ajv.validateSchema(visualLibrarySchema)) {
  throw new Error(`Invalid visual reference library schema: ${ajv.errorsText()}`);
}

const validateFacts = ajv.compile(factsSchema);
const validatePlan = ajv.compile(planSchema);
const validateVisualLibrary = ajv.compile(visualLibrarySchema);

for (const [name, value, validator] of [
  ["DK05 fact example", dk05Example, validateFacts],
  ["fixture facts", fixtureRun.projectFacts, validateFacts],
  ["fixture page plan", fixtureRun.pagePlan, validatePlan],
  ["brief-only facts", briefOnlyRun.projectFacts, validateFacts],
  ["brief-only page plan", briefOnlyRun.pagePlan, validatePlan],
  ["visual reference library", visualLibrary, validateVisualLibrary],
]) {
  if (!validator(value)) {
    throw new Error(`${name} failed: ${ajv.errorsText(validator.errors)}`);
  }
}

console.log(
  "Schema PASS: canonical schemas, design narrative, visual reference library, DK05 example, full fixture, and brief-only fixture.",
);
