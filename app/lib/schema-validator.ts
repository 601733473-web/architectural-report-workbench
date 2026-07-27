import Ajv2020 from "ajv/dist/2020";
import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  pagePlanSchema,
  projectFactsSchema,
} from "@/app/generated/schema-data";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

const validateFacts = ajv.compile(projectFactsSchema);
const validatePlan = ajv.compile(pagePlanSchema);

function formatErrors(errors: typeof validateFacts.errors) {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

export function assertProjectFacts(
  value: unknown,
): asserts value is DesignReportProjectFacts {
  if (!validateFacts(value)) {
    throw new Error(`project_facts schema validation failed: ${formatErrors(validateFacts.errors)}`);
  }
}

export function assertPagePlan(
  value: unknown,
): asserts value is DesignReportPagePlan {
  if (!validatePlan(value)) {
    throw new Error(`page_plan schema validation failed: ${formatErrors(validatePlan.errors)}`);
  }
}

