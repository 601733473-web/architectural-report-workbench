import type {
  DesignReportPagePlan,
  DesignReportProjectFacts,
} from "@/app/generated/contracts";
import {
  validateFacts,
  validatePlan,
} from "@/app/generated/schema-validators.mjs";

type ValidationErrors =
  | Array<{ instancePath?: string; message?: string }>
  | null
  | undefined;
type StandaloneValidator = ((value: unknown) => boolean) & {
  errors?: ValidationErrors;
};

const factsValidator = validateFacts as StandaloneValidator;
const planValidator = validatePlan as StandaloneValidator;

function formatErrors(
  errors: ValidationErrors,
) {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

export function assertProjectFacts(
  value: unknown,
): asserts value is DesignReportProjectFacts {
  if (!factsValidator(value)) {
    throw new Error(`project_facts schema validation failed: ${formatErrors(factsValidator.errors)}`);
  }
}

export function assertPagePlan(
  value: unknown,
): asserts value is DesignReportPagePlan {
  if (!planValidator(value)) {
    throw new Error(`page_plan schema validation failed: ${formatErrors(planValidator.errors)}`);
  }
}
