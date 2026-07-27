import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import { compile } from "json-schema-to-typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const contractRoot = resolve(
  projectRoot,
  "..",
  "output",
  "design_report_agent_v0_1",
  "schemas",
);
const generatedRoot = resolve(projectRoot, "app", "generated");

const factsPath = resolve(contractRoot, "project_facts.schema.json");
const planPath = resolve(contractRoot, "page_plan.schema.json");
const [factsText, planText] = await Promise.all([
  readFile(factsPath, "utf8"),
  readFile(planPath, "utf8"),
]);
const factsSchema = JSON.parse(factsText);
const planSchema = JSON.parse(planText);

await mkdir(generatedRoot, { recursive: true });

const banner =
  "/* Generated from the canonical JSON Schemas. Do not edit by hand. */\n\n";
const [factsTypes, planTypes] = await Promise.all([
  compile(factsSchema, "DesignReportProjectFacts", {
    bannerComment: "",
    additionalProperties: false,
    style: { singleQuote: false, semi: true },
  }),
  compile(planSchema, "DesignReportPagePlan", {
    bannerComment: "",
    additionalProperties: false,
    style: { singleQuote: false, semi: true },
  }),
]);
const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  code: { esm: true, source: true },
});
ajv.addSchema(factsSchema, "projectFacts");
ajv.addSchema(planSchema, "pagePlan");
const validatorsCode = standaloneCode(ajv, {
  validateFacts: "projectFacts",
  validatePlan: "pagePlan",
});
const esmValidatorsCode = validatorsCode.replace(
  /require\("ajv\/dist\/runtime\/ucs2length"\)\.default/g,
  "ucs2Length",
);

await Promise.all([
  writeFile(
    resolve(generatedRoot, "contracts.ts"),
    `${banner}${factsTypes}\n${planTypes}`,
    "utf8",
  ),
  writeFile(
    resolve(generatedRoot, "schema-data.ts"),
    `${banner}export const projectFactsSchema = ${JSON.stringify(factsSchema, null, 2)} as const;\n\nexport const pagePlanSchema = ${JSON.stringify(planSchema, null, 2)} as const;\n`,
    "utf8",
  ),
  writeFile(
    resolve(generatedRoot, "schema-validators.mjs"),
    `${banner}import ucs2LengthModule from "ajv/dist/runtime/ucs2length.js";\nconst ucs2Length = ucs2LengthModule.default;\n${esmValidatorsCode}\n`,
    "utf8",
  ),
]);

console.log("Generated TypeScript contracts from canonical schemas.");
