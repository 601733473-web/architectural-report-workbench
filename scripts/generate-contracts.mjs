import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import { compile } from "json-schema-to-typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const contractRoot = resolve(projectRoot, "schemas");
const generatedRoot = resolve(projectRoot, "app", "generated");

const factsPath = resolve(contractRoot, "project_facts.schema.json");
const planPath = resolve(contractRoot, "page_plan.schema.json");
const narrativePath = resolve(
  contractRoot,
  "design_narrative.schema.json",
);
const visualLibraryPath = resolve(
  contractRoot,
  "visual_reference_library.schema.json",
);
const [factsText, planText, narrativeText, visualLibraryText] =
  await Promise.all([
  readFile(factsPath, "utf8"),
  readFile(planPath, "utf8"),
  readFile(narrativePath, "utf8"),
  readFile(visualLibraryPath, "utf8"),
]);
const factsSchema = JSON.parse(factsText);
const planSchema = JSON.parse(planText);
const narrativeSchema = JSON.parse(narrativeText);
const visualLibrarySchema = JSON.parse(visualLibraryText);

await mkdir(generatedRoot, { recursive: true });

const banner =
  "/* Generated from the canonical JSON Schemas. Do not edit by hand. */\n\n";
const [factsTypes, planTypes, narrativeTypes, visualLibraryTypes] =
  await Promise.all([
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
  compile(narrativeSchema, "DesignReportNarrative", {
    bannerComment: "",
    additionalProperties: false,
    style: { singleQuote: false, semi: true },
  }),
  compile(visualLibrarySchema, "DesignReportVisualReferenceLibrary", {
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
ajv.addSchema(narrativeSchema, "designNarrative");
ajv.addSchema(visualLibrarySchema, "visualLibrary");
const validatorsCode = standaloneCode(ajv, {
  validateFacts: "projectFacts",
  validatePlan: "pagePlan",
  validateDesignNarrative: "designNarrative",
  validateVisualLibrary: "visualLibrary",
});
const esmValidatorsCode = validatorsCode.replace(
  /require\("ajv\/dist\/runtime\/ucs2length"\)\.default/g,
  "ucs2Length",
);

await Promise.all([
  writeFile(
    resolve(generatedRoot, "contracts.ts"),
    `${banner}${factsTypes}\n${planTypes}\n${narrativeTypes}\n${visualLibraryTypes}`,
    "utf8",
  ),
  writeFile(
    resolve(generatedRoot, "schema-data.ts"),
    `${banner}export const projectFactsSchema = ${JSON.stringify(factsSchema, null, 2)} as const;\n\nexport const pagePlanSchema = ${JSON.stringify(planSchema, null, 2)} as const;\n\nexport const designNarrativeSchema = ${JSON.stringify(narrativeSchema, null, 2)} as const;\n\nexport const visualReferenceLibrarySchema = ${JSON.stringify(visualLibrarySchema, null, 2)} as const;\n`,
    "utf8",
  ),
  writeFile(
    resolve(generatedRoot, "schema-validators.mjs"),
    `${banner}import ucs2LengthModule from "ajv/dist/runtime/ucs2length.js";\nconst ucs2Length = ucs2LengthModule.default;\n${esmValidatorsCode}\n`,
    "utf8",
  ),
]);

console.log("Generated TypeScript contracts from canonical schemas.");
