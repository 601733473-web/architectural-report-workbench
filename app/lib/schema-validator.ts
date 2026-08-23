import type {
  DesignReportNarrative,
  DesignReportPagePlan,
  DesignReportProjectFacts,
  DesignReportVisualReferenceLibrary,
} from "@/app/generated/contracts";
import {
  validateDesignNarrative,
  validateFacts,
  validatePlan,
  validateVisualLibrary,
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
const designNarrativeValidator =
  validateDesignNarrative as StandaloneValidator;
const visualLibraryValidator = validateVisualLibrary as StandaloneValidator;

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

export function assertDesignNarrative(
  value: unknown,
): asserts value is DesignReportNarrative {
  if (!designNarrativeValidator(value)) {
    throw new Error(
      `design_narrative schema validation failed: ${formatErrors(designNarrativeValidator.errors)}`,
    );
  }
}

export function assertVisualReferenceLibrary(
  value: unknown,
): asserts value is DesignReportVisualReferenceLibrary {
  if (!visualLibraryValidator(value)) {
    throw new Error(
      `visual_reference_library schema validation failed: ${formatErrors(visualLibraryValidator.errors)}`,
    );
  }
}
