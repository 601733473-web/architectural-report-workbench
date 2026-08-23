import type { DesignReportProjectFacts } from "@/app/generated/contracts";

type ProjectFact = DesignReportProjectFacts["facts"][number];

export const FACT_REVISION_ASSISTANT_MESSAGE =
  "已采用本轮确认值。原始任务书证据保持不变；后续页面生成将使用这个值，已生成页面需要重新生成后才会更新。";

function parseConfirmedValue(input: string, previousValue: unknown) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("当前采用值不能为空。");
  }

  if (typeof previousValue === "number") {
    const normalizedNumber = trimmed.replaceAll(",", "");
    if (/^-?\d+(?:\.\d+)?$/.test(normalizedNumber)) {
      return Number(normalizedNumber);
    }
  }

  if (typeof previousValue === "boolean") {
    if (/^(true|是|有)$/i.test(trimmed)) return true;
    if (/^(false|否|无)$/i.test(trimmed)) return false;
  }

  return trimmed;
}

function confirmedFactKey(fact: ProjectFact) {
  return [
    fact.field_path,
    fact.source.document_id,
    fact.source.page,
  ].join("::");
}

export function reviseProjectFact(
  projectFacts: DesignReportProjectFacts,
  factId: string,
  proposedValue: string,
  userMessage: string,
  createdAt = new Date().toISOString(),
) {
  const next = structuredClone(projectFacts);
  const fact = next.facts.find((candidate) => candidate.fact_id === factId);
  if (!fact) {
    throw new Error("找不到要修改的事实，请刷新后重试。");
  }

  const message = userMessage.trim();
  if (!message) {
    throw new Error("请简要说明这次修改的依据或原因。");
  }

  const previousValue = fact.value_raw;
  const confirmedValue = parseConfirmedValue(proposedValue, previousValue);
  const revisionHistory = fact.revision_history ?? [];
  const round = revisionHistory.length + 1;

  fact.original_value_raw ??= previousValue;
  fact.value_raw = confirmedValue;
  fact.value_normalized = confirmedValue;
  fact.value_origin = "user_confirmed";
  fact.status = "confirmed";
  fact.revision_history = [
    ...revisionHistory,
    {
      revision_id: `${fact.fact_id}_R${round}`,
      round,
      previous_value: previousValue,
      confirmed_value: confirmedValue,
      user_message: message,
      assistant_message: FACT_REVISION_ASSISTANT_MESSAGE,
      created_at: createdAt,
    },
  ];
  if (
    fact.field_path === "project.name" &&
    typeof confirmedValue === "string"
  ) {
    next.project_name_anonymized = confirmedValue;
  }

  return next;
}

export function preserveConfirmedFactRevisions(
  previousFacts: DesignReportProjectFacts,
  nextFacts: DesignReportProjectFacts,
) {
  const confirmedFacts = previousFacts.facts.filter(
    (fact) =>
      fact.value_origin === "user_confirmed" &&
      (fact.revision_history?.length ?? 0) > 0,
  );
  if (!confirmedFacts.length) return nextFacts;

  const next = structuredClone(nextFacts);
  const byId = new Map(next.facts.map((fact) => [fact.fact_id, fact]));
  const bySourceKey = new Map(
    next.facts.map((fact) => [confirmedFactKey(fact), fact]),
  );

  for (const confirmed of confirmedFacts) {
    const target =
      byId.get(confirmed.fact_id) ??
      bySourceKey.get(confirmedFactKey(confirmed));
    if (!target) continue;

    target.original_value_raw =
      confirmed.original_value_raw ?? confirmed.value_raw;
    target.value_raw = confirmed.value_raw;
    target.value_normalized = confirmed.value_normalized;
    target.value_origin = "user_confirmed";
    target.status = "confirmed";
    target.revision_history = structuredClone(
      confirmed.revision_history ?? [],
    );
    if (
      target.field_path === "project.name" &&
      typeof target.value_raw === "string"
    ) {
      next.project_name_anonymized = target.value_raw;
    }
  }

  return next;
}
