import type { DesignReportPagePlan, DesignReportProjectFacts } from "@/app/generated/contracts";

export type TaskMode = NonNullable<DesignReportProjectFacts["task_mode"]>;

export const DEFAULT_TASK_MODE: TaskMode = "large_public_building";

export function resolvedTaskMode(
  projectFacts?: Pick<DesignReportProjectFacts, "task_mode">,
  pagePlan?: Pick<DesignReportPagePlan, "task_mode">,
): TaskMode {
  return pagePlan?.task_mode ?? projectFacts?.task_mode ?? DEFAULT_TASK_MODE;
}

export function isSmallBuildingMode(mode: TaskMode) {
  return mode === "small_building_or_interior";
}

export function isolateSmallBuildingProjectFacts(
  projectFacts: DesignReportProjectFacts,
): DesignReportProjectFacts {
  return {
    ...projectFacts,
    task_mode: "small_building_or_interior",
    documents: projectFacts.documents.filter(
      (document) => document.role !== "reference_style",
    ),
    style_observations: [],
    reference_style_examples: undefined,
    reference_experience: undefined,
  };
}
