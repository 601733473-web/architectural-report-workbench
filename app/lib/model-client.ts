type JsonSchema = Record<string, unknown>;

export interface ModelCallRecord {
  responseId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function readProcessEnv(name: string) {
  if (typeof process === "undefined" || !process.env) return undefined;
  return process.env[name];
}

export function getModelRuntime() {
  const runtime = globalThis.__ARCH_REPORT_MODEL_RUNTIME__;
  const apiKey = runtime?.apiKey ?? readProcessEnv("OPENAI_API_KEY");
  const model =
    runtime?.model ??
    readProcessEnv("OPENAI_MODEL") ??
    "gpt-5.6-sol";
  return {
    configured: Boolean(apiKey),
    apiKey,
    model,
    apiFetch: runtime?.apiFetch,
  };
}

function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (["$schema", "title", "default"].includes(key)) continue;
    if (key === "const") {
      // Structured Outputs supports enums; this keeps the canonical const
      // semantics without maintaining a second schema.
      result.enum = [strictSchema(child)];
      continue;
    }
    result[key] = strictSchema(child);
  }

  const properties = result.properties;
  if (
    result.type === "object" &&
    properties &&
    typeof properties === "object" &&
    !Array.isArray(properties)
  ) {
    result.additionalProperties = false;
    result.required = Object.keys(properties);
  }
  return result;
}

function extractOutputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content: unknown[] }).content)
      : [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "refusal"
      ) {
        throw new Error(
          `模型拒绝了本次处理：${String((part as { refusal?: unknown }).refusal ?? "未提供原因")}`,
        );
      }
    }
  }
  throw new Error("模型没有返回结构化文本。");
}

async function requestOpenAI(
  request: Request,
  apiFetch?: (request: Request) => Promise<Response>,
) {
  return apiFetch ? apiFetch(request) : fetch(request);
}

export async function createStructuredResponse<T>({
  name,
  schema,
  instructions,
  content,
  reasoningEffort = "medium",
}: {
  name: string;
  schema: JsonSchema;
  instructions: string;
  content: Array<Record<string, unknown>>;
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<{ value: T; call: ModelCallRecord }> {
  const runtime = getModelRuntime();
  if (!runtime.apiKey) {
    throw new Error(
      "真实模型尚未配置：缺少 OPENAI_API_KEY。当前没有把资料发送给外部模型。",
    );
  }

  const body = {
    model: runtime.model,
    store: false,
    reasoning: { effort: reasoningEffort, context: "current_turn" },
    instructions,
    input: [{ role: "user", content }],
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema: strictSchema(schema),
      },
    },
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await requestOpenAI(
        new Request("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            authorization: `Bearer ${runtime.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(180_000),
        }),
        runtime.apiFetch,
      );
      const rawText = await response.text();
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`OpenAI 暂时不可用（${response.status}）。`);
        }
        throw new Error(
          `OpenAI 请求失败（${response.status}）：${rawText.slice(0, 500)}`,
        );
      }

      const raw = JSON.parse(rawText) as Record<string, unknown>;
      const parsed = JSON.parse(extractOutputText(raw)) as T;
      const usage =
        raw.usage && typeof raw.usage === "object"
          ? (raw.usage as Record<string, unknown>)
          : {};
      return {
        value: parsed,
        call: {
          responseId: String(raw.id ?? ""),
          model: String(raw.model ?? runtime.model),
          inputTokens: Number(usage.input_tokens ?? 0),
          outputTokens: Number(usage.output_tokens ?? 0),
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  throw lastError ?? new Error("OpenAI 请求失败。");
}
