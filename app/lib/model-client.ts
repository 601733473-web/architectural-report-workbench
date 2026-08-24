type JsonSchema = Record<string, unknown>;

export interface ModelCallRecord {
  responseId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelRuntimeOverride {
  apiKey?: string;
  model?: string;
  imageApiKey?: string;
  imageModel?: string;
  baseUrl?: string;
  imageBaseUrl?: string;
}

interface ImageProviderFallback {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ModelConnectionResult {
  baseUrl: string;
  model: string;
  imageBaseUrl: string;
  imageModel: string;
  modelAvailable: boolean | null;
  imageModelAvailable: boolean | null;
  availableImageModels: string[];
  availableModelCount: number | null;
}

export interface ImageGenerationCallRecord {
  responseId: string;
  model: string;
  imageUrl: string;
  imageCount: number;
  attemptCount: number;
  size: string;
  /** Exact prompt text included in the provider request payload. */
  submittedPrompt: string;
  /** Negative prompt value included in or sent alongside the provider request. */
  submittedNegativePrompt?: string;
}

export interface ImageGenerationReference {
  dataUrl: string;
  role?: "style_reference" | "project_continuity";
}

export type ModelRequestErrorCode =
  | "AUTH"
  | "RATE_LIMIT"
  | "UPSTREAM_CAPACITY"
  | "UPSTREAM_SERVER"
  | "TIMEOUT"
  | "DNS"
  | "TLS"
  | "CONNECTION_RESET"
  | "NETWORK"
  | "PROVIDER_RESPONSE";

export class ModelRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly code: ModelRequestErrorCode = "PROVIDER_RESPONSE",
    readonly requestId = "",
    readonly attemptCount = 1,
    readonly retryAfterMs = 0,
  ) {
    super(message);
    this.name = "ModelRequestError";
  }
}

function errorCauseCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return "";
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code.toUpperCase() : "";
}

function providerRequestId(response: Response, rawText: string) {
  const headerId =
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    response.headers.get("x-amzn-requestid") ??
    "";
  if (headerId) return headerId;
  try {
    const parsed = JSON.parse(rawText) as {
      request_id?: unknown;
      id?: unknown;
      error?: { request_id?: unknown };
    };
    return String(
      parsed.request_id ?? parsed.error?.request_id ?? parsed.id ?? "",
    );
  } catch {
    return "";
  }
}

export function classifyModelTransportError(
  error: unknown,
  attemptCount = 1,
) {
  if (error instanceof ModelRequestError) {
    return new ModelRequestError(
      error.message,
      error.status,
      error.retryable,
      error.code,
      error.requestId,
      Math.max(error.attemptCount, attemptCount),
      error.retryAfterMs,
    );
  }
  const source = error instanceof Error ? error : new Error(String(error));
  const message = source.message || "模型接口网络请求失败";
  const causeCode = errorCauseCode(source);
  if (
    source.name === "TimeoutError" ||
    source.name === "AbortError" ||
    /timeout|timed out|aborted due to timeout/i.test(message) ||
    /(?:CONNECT|HEADERS|BODY)_TIMEOUT/.test(causeCode)
  ) {
    return new ModelRequestError(
      "模型接口连接或响应超时",
      504,
      true,
      "TIMEOUT",
      "",
      attemptCount,
    );
  }
  if (/ENOTFOUND|EAI_AGAIN|DNS/.test(causeCode)) {
    return new ModelRequestError(
      "无法解析模型接口域名，请检查接口地址或本机 DNS",
      503,
      true,
      "DNS",
      "",
      attemptCount,
    );
  }
  if (/CERT|TLS|SSL/.test(causeCode) || /certificate|TLS|SSL/i.test(message)) {
    return new ModelRequestError(
      "模型接口安全连接失败，请检查 HTTPS 地址与证书",
      502,
      false,
      "TLS",
      "",
      attemptCount,
    );
  }
  if (
    /ECONNRESET|UND_ERR_SOCKET|EPIPE|ECONNREFUSED/.test(causeCode) ||
    /socket|connection reset|other side closed/i.test(message)
  ) {
    return new ModelRequestError(
      "模型接口连接中断，上游可能暂时关闭了连接",
      503,
      true,
      "CONNECTION_RESET",
      "",
      attemptCount,
    );
  }
  if (
    source instanceof TypeError ||
    /fetch failed|network|ECONN/i.test(message)
  ) {
    return new ModelRequestError(
      "无法连接模型接口，请检查网络、接口地址或上游服务状态",
      503,
      true,
      "NETWORK",
      "",
      attemptCount,
    );
  }
  return new ModelRequestError(
    message,
    502,
    false,
    "PROVIDER_RESPONSE",
    "",
    attemptCount,
  );
}

function readProcessEnv(name: string) {
  if (typeof process === "undefined" || !process.env) return undefined;
  return process.env[name];
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getModelRuntime(override?: ModelRuntimeOverride) {
  const runtime = globalThis.__ARCH_REPORT_MODEL_RUNTIME__;
  const apiKey =
    override?.apiKey || runtime?.apiKey || readProcessEnv("OPENAI_API_KEY");
  const model =
    override?.model?.trim() ||
    runtime?.model ||
    readProcessEnv("OPENAI_MODEL") ||
    "gpt-5.5";
  const baseUrl = normalizeBaseUrl(
    override?.baseUrl ||
      runtime?.baseUrl ||
      readProcessEnv("OPENAI_BASE_URL") ||
      "https://ruishiglobal.com/v1",
  );
  const configuredImageBaseUrl =
    override?.imageBaseUrl ||
    runtime?.imageBaseUrl ||
    readProcessEnv("IMAGE_BASE_URL");
  const imageBaseUrl = normalizeBaseUrl(
    configuredImageBaseUrl || baseUrl,
  );
  const imageModel =
    override?.imageModel?.trim() ||
    runtime?.imageModel ||
    readProcessEnv("IMAGE_MODEL") ||
    (isQwenCompatibleBaseUrl(imageBaseUrl) ? "wan2.7-image" : "gpt-5.5");
  const imageApiKey =
    override?.imageApiKey ||
    runtime?.imageApiKey ||
    readProcessEnv("IMAGE_API_KEY") ||
    (imageBaseUrl === baseUrl ? apiKey : undefined);
  return {
    configured: Boolean(apiKey),
    apiKey,
    model,
    imageApiKey,
    imageModel,
    baseUrl,
    imageBaseUrl,
    apiFetch: runtime?.apiFetch,
  };
}

function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  if (Object.keys(source).length === 0) {
    // The canonical contract intentionally permits any JSON scalar for raw and
    // normalized fact values. Structured Outputs requires an explicit type.
    return { type: ["string", "number", "boolean", "null"] };
  }
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

function parseStructuredText<T>(text: string, schema: JsonSchema): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = (fenced?.[1] ?? trimmed).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (firstError) {
    // Some compatible model endpoints return a valid JSON object/array with
    // escaped quotes (e.g. [{\"label\":\"...\"}]). Decode that transport
    // layer before attempting the more permissive fenced-text recovery below.
    const escapedJsonCandidate = candidate.replace(/\\"/g, '"');
    if (escapedJsonCandidate !== candidate) {
      try {
        parsed = JSON.parse(escapedJsonCandidate);
      } catch {
        // Continue with the existing extraction path when the backslashes are
        // meaningful content rather than a transport-level escape.
      }
    }
    if (parsed !== undefined) {
      // The array-to-single-property normalization below still applies.
    } else {
    const objectStart = candidate.indexOf("{");
    const arrayStart = candidate.indexOf("[");
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start < 0 || end <= start) throw firstError;
    candidate = candidate.slice(start, end + 1);
    parsed = JSON.parse(candidate);
    }
  }

  if (Array.isArray(parsed)) {
    const properties =
      schema.properties &&
      typeof schema.properties === "object" &&
      !Array.isArray(schema.properties)
        ? (schema.properties as Record<string, unknown>)
        : {};
    const propertyNames = Object.keys(properties);
    if (propertyNames.length === 1) {
      const propertyName = propertyNames[0];
      const propertySchema = properties[propertyName];
      if (
        propertySchema &&
        typeof propertySchema === "object" &&
        !Array.isArray(propertySchema) &&
        (propertySchema as { type?: unknown }).type === "array"
      ) {
        parsed = { [propertyName]: parsed };
      }
    }
  }

  return parsed as T;
}

function isQwenCompatibleBaseUrl(baseUrl: string) {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return (
      hostname === "dashscope.aliyuncs.com" ||
      hostname.endsWith(".maas.aliyuncs.com")
    );
  } catch {
    return false;
  }
}

function textOnlyContent(content: Array<Record<string, unknown>>) {
  if (!content.every((part) => part.type === "input_text")) return null;
  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n\n");
}

function qwenChatContent(content: Array<Record<string, unknown>>) {
  const text = textOnlyContent(content);
  if (text !== null) return text;
  const result: Array<Record<string, unknown>> = [];
  for (const part of content) {
    if (part.type === "input_text" && typeof part.text === "string") {
      result.push({ type: "text", text: part.text });
    }
    if (part.type === "input_image" && typeof part.image_url === "string") {
      result.push({
        type: "image_url",
        image_url: { url: part.image_url },
      });
    }
  }
  return result;
}

const qwenUnsupportedStructuredSchemaKeys = new Set([
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
]);

function qwenCompatibleStructuredSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(qwenCompatibleStructuredSchema);
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !qwenUnsupportedStructuredSchemaKeys.has(key))
      .map(([key, child]) => [key, qwenCompatibleStructuredSchema(child)]),
  );
}

function extractChatOutputText(response: Record<string, unknown>) {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") {
    throw new Error("模型没有返回结构化文本。");
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    throw new Error("模型没有返回结构化文本。");
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string") {
    throw new Error("模型没有返回结构化文本。");
  }
  return content;
}

async function requestOpenAI(
  request: Request,
  apiFetch?: (request: Request) => Promise<Response>,
) {
  return apiFetch ? apiFetch(request) : fetch(request);
}

function readProviderError(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const message = parsed.error?.message ?? parsed.message;
    return typeof message === "string" ? message.trim() : "";
  } catch {
    return rawText.trim().replace(/\s+/g, " ").slice(0, 500);
  }
}

function providerRetryAfterMs(response: Response, rawText: string) {
  const retryAfter = response.headers.get("retry-after")?.trim() ?? "";
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(120_000, Math.max(1_000, Math.round(seconds * 1_000)));
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(120_000, Math.max(1_000, retryAt - Date.now()));
    }
  }
  const resetAfter = Number(
    response.headers.get("x-ratelimit-reset-after") ??
      response.headers.get("x-ratelimit-reset") ??
      "",
  );
  if (Number.isFinite(resetAfter) && resetAfter > 0) {
    const milliseconds =
      resetAfter > 1_000_000_000
        ? resetAfter - Date.now()
        : resetAfter * 1_000;
    return Math.min(120_000, Math.max(1_000, Math.round(milliseconds)));
  }
  const providerMessage = readProviderError(rawText);
  const secondsMatch = providerMessage.match(
    /(?:retry|try again|等待|稍后)\D{0,20}(\d{1,3})\s*(?:seconds?|secs?|秒)/i,
  );
  if (secondsMatch) {
    return Math.min(120_000, Math.max(1_000, Number(secondsMatch[1]) * 1_000));
  }
  const minutesMatch = providerMessage.match(
    /(?:retry|try again|等待|稍后)\D{0,20}(\d{1,2})\s*(?:minutes?|mins?|分钟)/i,
  );
  if (minutesMatch) {
    return Math.min(120_000, Math.max(1_000, Number(minutesMatch[1]) * 60_000));
  }
  return 0;
}

function isTransientCapacityError(message: string) {
  return /(?:上游|upstream).*(?:负载已饱和|负载饱和|容量不足|无可用容量|overload|overloaded|capacity|busy)|(?:负载已饱和|负载饱和|当前分组.*饱和|no available upstream)/i.test(
    message,
  );
}

function modelRequestError(response: Response, rawText: string) {
  const status = response.status;
  const providerMessage = readProviderError(rawText);
  const detail = providerMessage ? `：${providerMessage}` : "";
  const requestId = providerRequestId(response, rawText);
  if (status === 401 || status === 403) {
    return new ModelRequestError(
      `模型接口鉴权失败（${status}）${detail}`,
      status,
      false,
      "AUTH",
      requestId,
    );
  }
  if (status === 429) {
    const capacity = isTransientCapacityError(providerMessage);
    const retryAfterMs = providerRetryAfterMs(response, rawText);
    return new ModelRequestError(
      `模型接口请求受限（429）${detail}`,
      status,
      true,
      capacity ? "UPSTREAM_CAPACITY" : "RATE_LIMIT",
      requestId,
      1,
      retryAfterMs,
    );
  }
  return new ModelRequestError(
    `模型接口请求失败（${status}）${detail}`,
    status,
    status >= 500,
    status >= 500 ? "UPSTREAM_SERVER" : "PROVIDER_RESPONSE",
    requestId,
  );
}

type ImageModelThrottle = {
  tail: Promise<void>;
  cooldownUntil: number;
};

const imageModelThrottles = (() => {
  const root = globalThis as typeof globalThis & {
    __ARCH_REPORT_IMAGE_MODEL_THROTTLES__?: Map<string, ImageModelThrottle>;
  };
  return (root.__ARCH_REPORT_IMAGE_MODEL_THROTTLES__ ??= new Map());
})();

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runInImageModelQueue<T>(
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const state = imageModelThrottles.get(key) ?? {
    tail: Promise.resolve(),
    cooldownUntil: 0,
  };
  imageModelThrottles.set(key, state);
  const previous = state.tail.catch(() => undefined);
  let release: () => void = () => undefined;
  state.tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const cooldownMs = state.cooldownUntil - Date.now();
    if (cooldownMs > 0) await sleep(cooldownMs);
    return await run();
  } finally {
    release();
  }
}

function imageRetryDelayMs(error: ModelRequestError, attempt: number) {
  if (error.retryAfterMs > 0) return error.retryAfterMs;
  if (error.code === "RATE_LIMIT") {
    return [8_000, 20_000, 45_000][attempt] ?? 45_000;
  }
  if (error.code === "UPSTREAM_CAPACITY") {
    return [5_000, 12_000, 30_000][attempt] ?? 30_000;
  }
  return [1_000, 2_500, 5_000][attempt] ?? 5_000;
}

async function fetchAvailableModelIds(
  baseUrl: string,
  apiKey: string,
  apiFetch?: (request: Request) => Promise<Response>,
) {
  let response: Response;
  try {
    response = await requestOpenAI(
      new Request(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      }),
      apiFetch,
    );
  } catch (error) {
    throw classifyModelTransportError(error);
  }
  const rawText = await response.text();
  if (!response.ok) throw modelRequestError(response, rawText);

  try {
    const raw = JSON.parse(rawText) as { data?: unknown };
    if (!Array.isArray(raw.data)) return null;
    return raw.data
      .map((item) =>
        item && typeof item === "object" && "id" in item
          ? String((item as { id: unknown }).id)
          : "",
      )
      .filter(Boolean);
  } catch {
    return null;
  }
}

function isMissingTextModelError(error: unknown) {
  return (
    error instanceof ModelRequestError &&
    error.status === 404 &&
    /model\s+not\s+exist|model.*not.*found|模型.*不存在/i.test(error.message)
  );
}

function chooseStructuredTextModel(modelIds: string[], currentModel: string) {
  const usable = modelIds.filter(
    (modelId) =>
      !/(?:embed|rerank|moderation|image|vision|audio|tts|whisper|vl)/i.test(
        modelId,
      ),
  );
  const candidates = usable.length ? usable : modelIds;
  const preferred = candidates.find((modelId) =>
    /(?:qwen.*(?:plus|max)|deepseek.*(?:chat|reason)|gpt|claude)/i.test(
      modelId,
    ),
  );
  const selected = preferred ?? candidates[0] ?? "";
  return selected && selected !== currentModel ? selected : "";
}

async function discoverStructuredTextModel(
  runtime: ReturnType<typeof getModelRuntime>,
  currentModel: string,
) {
  try {
    const modelIds = await fetchAvailableModelIds(
      runtime.baseUrl,
      runtime.apiKey ?? "",
      runtime.apiFetch,
    );
    return modelIds
      ? chooseStructuredTextModel(modelIds, currentModel)
      : "";
  } catch {
    return "";
  }
}

export async function testModelConnection(
  runtimeOverride?: ModelRuntimeOverride,
): Promise<ModelConnectionResult> {
  const runtime = getModelRuntime(runtimeOverride);
  if (!runtime.apiKey) {
    throw new Error("真实模型尚未配置：缺少 API 密钥。");
  }
  const modelIds = await fetchAvailableModelIds(
    runtime.baseUrl,
    runtime.apiKey,
    runtime.apiFetch,
  );
  const imageModelIds =
    runtime.imageApiKey &&
    (runtime.imageBaseUrl !== runtime.baseUrl ||
      runtime.imageApiKey !== runtime.apiKey)
      ? await fetchAvailableModelIds(
          runtime.imageBaseUrl,
          runtime.imageApiKey,
          runtime.apiFetch,
        )
      : modelIds;
  const availableImageModels = imageModelIds
    ? [
        ...new Set([
          ...imageModelIds.filter((modelId) =>
            /(?:^|[-_.])image(?:$|[-_.])|wan.*image/i.test(modelId),
          ),
          ...(imageModelIds.includes(runtime.imageModel)
            ? [runtime.imageModel]
            : []),
        ]),
      ]
    : [];

  return {
    baseUrl: runtime.baseUrl,
    model: runtime.model,
    imageBaseUrl: runtime.imageBaseUrl,
    imageModel: runtime.imageModel,
    modelAvailable: modelIds ? modelIds.includes(runtime.model) : null,
    imageModelAvailable: imageModelIds
      ? imageModelIds.includes(runtime.imageModel)
      : null,
    availableImageModels,
    availableModelCount: modelIds?.length ?? null,
  };
}

function nativeImageEndpoint(baseUrl: string) {
  const parsed = new URL(baseUrl);
  const compatibleSuffix = /\/compatible-mode\/v1\/?$/;
  if (compatibleSuffix.test(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace(
      compatibleSuffix,
      "/api/v1/services/aigc/multimodal-generation/generation",
    );
    return parsed.toString().replace(/\/$/, "");
  }
  if (/\/api\/v1\/?$/.test(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace(
      /\/api\/v1\/?$/,
      "/api/v1/services/aigc/multimodal-generation/generation",
    );
    return parsed.toString().replace(/\/$/, "");
  }
  throw new Error(
    "当前 API 地址无法推导千问图像生成端点。请使用百炼或 Token Plan 的 compatible-mode/v1 地址。",
  );
}

const imageValueKeys = [
  "b64_json",
  "image_base64",
  "base64",
  // Several OpenAI-compatible image gateways wrap the completed image in
  // `output_image` instead of the standard `result`/`image_url` fields.
  "output_image",
  "output_image_url",
  "image_data",
  "image_url",
  "image",
  "url",
  "result",
] as const;
const imageContainerKeys = [
  "output",
  "data",
  "images",
  "results",
  "choices",
  "message",
  "content",
] as const;

function normalizeImageCandidate(value: string, keyHint: string) {
  const candidate = value.trim();
  if (!candidate) return "";
  const embedded = candidate.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/i)?.[0];
  if (embedded) return embedded.replace(/\s+/g, "");
  const markdownUrl = candidate.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1];
  if (markdownUrl) return markdownUrl;
  const htmlUrl = candidate.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i)?.[1];
  if (htmlUrl) return htmlUrl;
  if (/^https?:\/\/\S+$/i.test(candidate)) return candidate;
  if (
    /^(?:b64_json|image_base64|base64|image|result)$/i.test(keyHint) &&
    /^[a-z0-9+/=\s]+$/i.test(candidate) &&
    candidate.replace(/\s+/g, "").length >= 16
  ) {
    return `data:image/png;base64,${candidate.replace(/\s+/g, "")}`;
  }
  if (/^[\[{]/.test(candidate)) {
    try {
      return extractImageFromUnknown(JSON.parse(candidate), keyHint);
    } catch {
      return "";
    }
  }
  return "";
}

function extractImageFromUnknown(
  value: unknown,
  keyHint = "",
  depth = 0,
): string {
  if (depth > 8 || value == null) return "";
  if (typeof value === "string") return normalizeImageCandidate(value, keyHint);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageFromUnknown(item, keyHint, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of imageValueKeys) {
    if (!(key in record)) continue;
    const found = extractImageFromUnknown(record[key], key, depth + 1);
    if (found) return found;
  }
  for (const key of imageContainerKeys) {
    if (!(key in record)) continue;
    const found = extractImageFromUnknown(record[key], key, depth + 1);
    if (found) return found;
  }
  for (const key of ["output_text", "text"] as const) {
    if (typeof record[key] !== "string") continue;
    const found = normalizeImageCandidate(record[key], key);
    if (found) return found;
  }
  return "";
}

function imageResponseError(response: Record<string, unknown>) {
  const providerFailure = readProviderError(JSON.stringify(response));
  const responseId = String(response.id ?? response.request_id ?? "");
  const status = String(response.status ?? "").toLowerCase();
  const incomplete =
    response.incomplete_details && typeof response.incomplete_details === "object"
      ? readProviderError(JSON.stringify(response.incomplete_details))
      : "";
  const detail = providerFailure || incomplete;
  if (status === "queued" || status === "in_progress") {
    return new ModelRequestError(
      "图像模型返回了未完成任务，兼容接口没有等待图片生成完成",
      502,
      true,
      "PROVIDER_RESPONSE",
      responseId,
    );
  }
  return new ModelRequestError(
    detail
      ? `图像模型没有返回图片：${detail}`
      : `图像模型返回成功响应，但内容中没有可识别的图片（返回字段：${Object.keys(
          response,
        )
          .slice(0, 12)
          .join("、") || "未提供"}）`,
    502,
    true,
    "PROVIDER_RESPONSE",
    responseId,
  );
}

function extractGeneratedImageUrl(response: Record<string, unknown>) {
  const imageUrl = extractImageFromUnknown(response.output ?? response);
  if (imageUrl) return imageUrl;
  throw imageResponseError(response);
}

function extractResponsesGeneratedImage(response: Record<string, unknown>) {
  const imageUrl = extractImageFromUnknown(response.output ?? response);
  if (imageUrl) return imageUrl;
  throw imageResponseError(response);
}

export async function createImageGeneration({
  prompt,
  negativePrompt,
  referenceImage,
  referenceImages,
  runtimeOverride,
  size = "1344*960",
  // Image generation is intentionally not capped by the application. The
  // provider or hosting platform may still terminate a request, but Codex
  // must not abort a slow, valid generation locally.
  timeoutMs = 0,
  fallbackImageModels,
  allowCrossProviderImageFallback = false,
  fallbackImageProviders,
  strictConfiguredImageModel = false,
  singleImageAssetGuard = false,
  previousAttemptCount = 0,
  maxAttempts = 2,
}: {
  prompt: string;
  negativePrompt?: string;
  referenceImage?: ImageGenerationReference;
  referenceImages?: ImageGenerationReference[];
  runtimeOverride?: ModelRuntimeOverride;
  size?: string;
  timeoutMs?: number;
  fallbackImageModels?: string[];
  /**
   * Small-mode only: allow the configured text endpoint to serve as a second
   * image provider when the separately configured image endpoint is unavailable.
   * Large-building callers intentionally leave this disabled.
   */
  allowCrossProviderImageFallback?: boolean;
  fallbackImageProviders?: ImageProviderFallback[];
  /** Keep every attempt on the configured image model and provider. */
  strictConfiguredImageModel?: boolean;
  /** Apply the single-image-asset guard independently of provider fallback. */
  singleImageAssetGuard?: boolean;
  previousAttemptCount?: number;
  maxAttempts?: 1 | 2 | 3;
}): Promise<ImageGenerationCallRecord> {
  const runtime = getModelRuntime(runtimeOverride);
  if (!runtime.imageApiKey) {
    throw new Error("图像生成尚未配置：缺少可用的图像 API 密钥。");
  }
  const useQwenNative = isQwenCompatibleBaseUrl(runtime.imageBaseUrl);
  const useWan27 = /^wan2\.7-image(?:-pro)?$/i.test(runtime.imageModel);
  const fallbackModels = strictConfiguredImageModel
    ? []
    : fallbackImageModels ??
    (/ruishiglobal\.com$/i.test(new URL(runtime.imageBaseUrl).hostname)
      ? (() => {
          // Keep fallback attempts inside the image-model family. A text
          // model such as gpt-5.5 can return HTTP 200 metadata without an
          // image, which is indistinguishable from a broken generation to
          // the caller and cannot be persisted to cloud storage.
          const priority = [
            "gpt-image-2",
            "gpt-image-2-c",
            "gpt-image-1.5",
            "gpt-image-1",
          ];
          const currentIndex = priority.findIndex(
            (candidate) =>
              candidate.toLowerCase() === runtime.imageModel.toLowerCase(),
          );
          return currentIndex >= 0 ? priority.slice(currentIndex + 1) : [];
        })()
      : []);
  const configuredFallbackBaseUrl = normalizeBaseUrl(
    readProcessEnv("IMAGE_FALLBACK_BASE_URL") || "",
  );
  const configuredFallbackApiKey = readProcessEnv("IMAGE_FALLBACK_API_KEY");
  const configuredFallbackModel = readProcessEnv("IMAGE_FALLBACK_MODEL")?.trim();
  const providerFallbacks = strictConfiguredImageModel
    ? []
    : fallbackImageProviders ??
    (allowCrossProviderImageFallback &&
    configuredFallbackBaseUrl &&
    configuredFallbackApiKey &&
    configuredFallbackModel
      ? [
          {
            baseUrl: configuredFallbackBaseUrl,
            apiKey: configuredFallbackApiKey,
            model: configuredFallbackModel,
          },
        ]
      : []);
  const endpoint = useQwenNative
    ? nativeImageEndpoint(runtime.imageBaseUrl)
    : /^gpt-image(?:-|$)/i.test(runtime.imageModel)
      ? `${runtime.imageBaseUrl}/images/generations`
    : `${runtime.imageBaseUrl}/responses`;
  const useOpenAIImageEndpoint =
    !useQwenNative && /^gpt-image(?:-|$)/i.test(runtime.imageModel);
  const responseSize = useQwenNative
    ? size
    : size === "1024*1024"
      ? "1024x1024"
      : size === "960*1344"
        ? "1024x1536"
        : "1536x1024";
  const resolvedReferenceImages = [
    ...(referenceImages ?? []),
    ...(referenceImage ? [referenceImage] : []),
  ].filter(
    (reference, index, all) =>
      all.findIndex((candidate) => candidate.dataUrl === reference.dataUrl) ===
      index,
  );
  const hasProjectContinuity = resolvedReferenceImages.some(
    (reference) => reference.role === "project_continuity",
  );
  const hasStyleReference = resolvedReferenceImages.some(
    (reference) => reference.role !== "project_continuity",
  );
  const guidedPrompt = resolvedReferenceImages.length
    ? `${prompt}

${hasProjectContinuity && hasStyleReference
  ? "已提供两类参考：风格参考只用于图种、构图层级与 graphic 表达；项目连续性参考是同一项目的已确认母版，必须保持建筑数量、相对位置、外轮廓、核心筒、基座、连桥和立面节奏一致。不得把两类参考拼贴到一起。"
  : hasProjectContinuity
    ? "参考图是同一项目的连续性母版，不是外部风格样本。必须继承其中已确认的建筑数量、相对位置、平面外轮廓、核心筒、柱网方向、基座层级、连桥与立面节奏；楼层或图种变化只能修改当前任务明确允许变化的内容。"
    : "参考图仅用于学习构图层级、留白关系、视觉节奏和 graphic 表达语言。"}必须依据当前项目提示词重新创作；不得复制参考图中的文字、数字、Logo 或项目名称。${hasProjectContinuity ? "项目连续性参考中的建筑几何属于当前项目，必须保留，不得误判为禁止复制的外部造型。" : "不得复制外部参考中的具体建筑造型、场地或设计结论。"}
图像必须铺满图框，禁止生成图名、图片编号、标题栏、底部白色说明带、页脚或页码。必要标注只用简体中文，并直接放在对应地图区域、建筑、色块、箭头或引线旁。`
    : `${prompt}

当前没有提供参考图。必须只依据当前项目背景、已确认设计方向、当前图注和图框规格原创生成；不得借用历史项目名称、造型、文字、数字、Logo 或无来源的设计结论。
图像必须铺满图框，禁止生成图名、图片编号、标题栏、底部白色说明带、页脚或页码。必要标注只用简体中文，并直接放在对应地图区域、建筑、色块、箭头或引线旁。`;
  const submittedPrompt = useQwenNative
    ? useWan27 && negativePrompt
      ? `${guidedPrompt}\n\n画面中必须避免：${negativePrompt}`
      : guidedPrompt
    : negativePrompt
      ? `${guidedPrompt}\n\n必须避免：${negativePrompt}`
      : guidedPrompt;
  const smallModeImageGuard =
    allowCrossProviderImageFallback || singleImageAssetGuard
    ? `

小型建筑/装置管线的最高优先级图像边界：这里只生成“一个图片素材”，不是 PPT 页面、海报、图板或汇报截图。画布中只能有当前图框所需的单一空间/装置/人物动作/材料证据；禁止任何标题、项目名、图名、图片编号、页眉、页脚、页码、边框、表格、说明文字、段落、标签、箭头、图例、白色文字区、A3 页面排版和多图拼贴。不要在画面中生成汉字或英文，即使上文出现了标签，也只把它们当作语义，不要把文字画出来。图像必须完整铺满当前单个图框，页面文字由外部排版系统叠加。`
    : "";
  const finalSubmittedPrompt = `${submittedPrompt}${smallModeImageGuard}`;
  const requestBody = JSON.stringify(
    useQwenNative
      ? {
          model: runtime.imageModel,
          input: {
            messages: [
              {
                role: "user",
                content: [
                  ...resolvedReferenceImages.map((reference) => ({
                    image: reference.dataUrl,
                  })),
                  {
                    text: finalSubmittedPrompt,
                  },
                ],
              },
            ],
          },
          parameters: {
            size,
            n: 1,
            ...(useWan27
              ? {
                  watermark: false,
                  thinking_mode: false,
                }
              : {
                  prompt_extend: false,
                  ...(negativePrompt
                    ? { negative_prompt: negativePrompt }
                    : {}),
                }),
          },
        }
    : useOpenAIImageEndpoint
      ? {
          model: runtime.imageModel,
          prompt: finalSubmittedPrompt,
          n: 1,
          size: responseSize,
          quality: allowCrossProviderImageFallback ? "high" : "low",
        }
      : {
          model: runtime.imageModel,
          store: false,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: finalSubmittedPrompt,
                },
                ...resolvedReferenceImages.map((reference) => ({
                  type: "input_image",
                  image_url: reference.dataUrl,
                  detail: "low",
                })),
              ],
            },
          ],
          tools: [
            {
              type: "image_generation",
              size: responseSize,
              quality: allowCrossProviderImageFallback ? "high" : "low",
            },
          ],
          tool_choice: { type: "image_generation" },
        },
  );
  let attemptCount = 0;
  let response: Response | null = null;
  let lastError: ModelRequestError | null = null;
  let resolvedRaw: Record<string, unknown> | null = null;
  let resolvedImageUrl = "";
  const throttleKey = `${runtime.imageBaseUrl}::${runtime.imageModel}`;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    attemptCount = attempt + 1;
    try {
      const queuedImageRequest = runInImageModelQueue(throttleKey, async () => {
        const queuedResponse = await requestOpenAI(
          new Request(endpoint, {
            method: "POST",
            headers: {
              authorization: `Bearer ${runtime.imageApiKey}`,
              "content-type": "application/json",
            },
            body: requestBody,
            ...(timeoutMs > 0
              ? { signal: AbortSignal.timeout(timeoutMs) }
              : {}),
          }),
          runtime.apiFetch,
        );
        const rawText = await queuedResponse.text();
        if (!queuedResponse.ok) {
          const requestError = modelRequestError(queuedResponse, rawText);
          if (
            requestError.code === "RATE_LIMIT" ||
            requestError.code === "UPSTREAM_CAPACITY"
          ) {
            const throttle = imageModelThrottles.get(throttleKey);
            if (throttle) {
              throttle.cooldownUntil = Math.max(
                throttle.cooldownUntil,
                Date.now() + imageRetryDelayMs(requestError, attempt),
              );
            }
          }
          throw requestError;
        }
        return new Response(rawText, {
          status: queuedResponse.status,
          headers: queuedResponse.headers,
        });
      });
      response = await (timeoutMs > 0
        ? Promise.race([
            queuedImageRequest,
            new Promise<Response>((_, reject) => {
              setTimeout(
                () => reject(new Error("图像生成请求超时")),
                timeoutMs,
              );
            }),
          ])
        : queuedImageRequest);
      const rawText = await response.text();
      resolvedRaw = JSON.parse(rawText) as Record<string, unknown>;
      resolvedImageUrl = useQwenNative || useOpenAIImageEndpoint
        ? extractGeneratedImageUrl(resolvedRaw)
        : extractResponsesGeneratedImage(resolvedRaw);
      if (!resolvedImageUrl) {
        lastError = new ModelRequestError(
          "图像模型返回成功响应，但没有调用图像生成工具或返回可用图片。",
          response.status,
          true,
          "PROVIDER_RESPONSE",
          String(resolvedRaw.id ?? ""),
          previousAttemptCount + attemptCount,
        );
      }
      break;
    } catch (error) {
      lastError = classifyModelTransportError(
        error,
        previousAttemptCount + attemptCount,
      );
      const retryable = lastError.retryable;
      if (attempt + 1 >= maxAttempts || !retryable) break;
      const delayMs = imageRetryDelayMs(lastError, attempt);
      await sleep(delayMs);
    }
  }
  if (!response || !response.ok || !resolvedRaw || !resolvedImageUrl) {
    if (lastError instanceof ModelRequestError) {
      const canUseProviderFallback = [
        "RATE_LIMIT",
        "UPSTREAM_CAPACITY",
        "AUTH",
        "PROVIDER_RESPONSE",
        "TIMEOUT",
        "DNS",
        "CONNECTION_RESET",
        "NETWORK",
      ].includes(lastError.code);
      const [nextProvider, ...remainingProviders] = providerFallbacks;
      if (canUseProviderFallback && nextProvider) {
        return createImageGeneration({
          prompt,
          negativePrompt,
          referenceImage,
          referenceImages,
          runtimeOverride: {
            ...runtimeOverride,
            imageBaseUrl: nextProvider.baseUrl,
            imageApiKey: nextProvider.apiKey,
            imageModel: nextProvider.model,
          },
          size,
          timeoutMs,
          fallbackImageModels: [],
          allowCrossProviderImageFallback,
          strictConfiguredImageModel,
          singleImageAssetGuard,
          fallbackImageProviders: remainingProviders,
          previousAttemptCount: previousAttemptCount + attemptCount,
        });
      }
      const [nextFallbackModel, ...remainingFallbackModels] = fallbackModels;
      if (canUseProviderFallback && nextFallbackModel) {
        return createImageGeneration({
          prompt,
          negativePrompt,
          referenceImage,
          referenceImages,
          runtimeOverride: {
            ...runtimeOverride,
            imageModel: nextFallbackModel,
          },
          size,
          timeoutMs,
          fallbackImageModels: remainingFallbackModels,
          allowCrossProviderImageFallback,
          strictConfiguredImageModel,
          singleImageAssetGuard,
          fallbackImageProviders: providerFallbacks,
          previousAttemptCount: previousAttemptCount + attemptCount,
        });
      }
      throw new ModelRequestError(
        `${lastError.message}${
          previousAttemptCount + attemptCount > 1
            ? `（首选及备用模型共请求 ${previousAttemptCount + attemptCount} 次，仍未恢复）`
            : ""
        }`,
        lastError.status,
        lastError.retryable,
        lastError.code,
        lastError.requestId,
        previousAttemptCount + attemptCount,
        lastError.retryAfterMs ||
          (lastError.code === "RATE_LIMIT" ? 45_000 : 0),
      );
    }
    throw lastError ?? new Error("图像模型请求失败。");
  }
  const raw = resolvedRaw;
  if (!useQwenNative) {
    return {
      responseId: String(raw.id ?? ""),
      model: runtime.imageModel,
      imageUrl: resolvedImageUrl,
      imageCount: 1,
      attemptCount: previousAttemptCount + attemptCount,
      size: responseSize,
      submittedPrompt: finalSubmittedPrompt,
      submittedNegativePrompt: negativePrompt,
    };
  }
  const usage =
    raw.usage && typeof raw.usage === "object"
      ? (raw.usage as Record<string, unknown>)
      : {};
  const output =
    raw.output && typeof raw.output === "object"
      ? (raw.output as Record<string, unknown>)
      : {};
  return {
    responseId: String(raw.request_id ?? raw.id ?? output.task_id ?? ""),
    model: runtime.imageModel,
    imageUrl: resolvedImageUrl,
    imageCount: Math.max(1, Number(usage.image_count ?? 1)),
    attemptCount: previousAttemptCount + attemptCount,
    size,
    submittedPrompt: finalSubmittedPrompt,
    submittedNegativePrompt: negativePrompt,
  };
}

export async function createStructuredResponse<T>({
  name,
  schema,
  instructions,
  content,
  reasoningEffort = "medium",
  runtimeOverride,
  timeoutMs = 180_000,
  maxAttempts = 2,
}: {
  name: string;
  schema: JsonSchema;
  instructions: string;
  content: Array<Record<string, unknown>>;
  reasoningEffort?: "low" | "medium" | "high";
  runtimeOverride?: ModelRuntimeOverride;
  timeoutMs?: number | null;
  maxAttempts?: 1 | 2;
}): Promise<{ value: T; call: ModelCallRecord }> {
  const runtime = getModelRuntime(runtimeOverride);
  if (!runtime.apiKey) {
    throw new Error(
      "真实模型尚未配置：缺少 OPENAI_API_KEY。当前没有把资料发送给外部模型。",
    );
  }

  const strictOutputSchema = strictSchema(schema);
  const useQwenChat = isQwenCompatibleBaseUrl(runtime.baseUrl);
  let requestModel = runtime.model;
  let modelDiscoveryAttempted = false;
  // Qwen's OpenAI-compatible JSON Schema endpoint rejects several valid
  // array-validation keywords (notably `uniqueItems`). Keep the canonical
  // schema unchanged for local validation, but remove only the unsupported
  // transport keywords before sending the schema to Qwen.
  const requestOutputSchema = useQwenChat
    ? qwenCompatibleStructuredSchema(strictOutputSchema)
    : strictOutputSchema;
  const qwenContent = useQwenChat ? qwenChatContent(content) : null;
  const endpoint = useQwenChat
    ? `${runtime.baseUrl}/chat/completions`
    : `${runtime.baseUrl}/responses`;

  let lastError: ModelRequestError | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const body = useQwenChat
        ? {
            model: requestModel,
            messages: [
              {
                role: "system",
                content: `${instructions}\n\n输出必须严格符合以下 JSON Schema：\n${JSON.stringify(
                  requestOutputSchema,
                )}\n\n只返回符合该结构的 JSON，不要使用 Markdown 代码围栏。`,
              },
              { role: "user", content: qwenContent },
            ],
            enable_thinking: false,
            response_format: {
              type: "json_schema",
              json_schema: {
                name,
                strict: true,
                schema: requestOutputSchema,
              },
            },
          }
        : {
            model: requestModel,
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
                schema: requestOutputSchema,
              },
            },
          };
      const response = await requestOpenAI(
        new Request(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${runtime.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          ...(timeoutMs !== null && timeoutMs > 0
            ? { signal: AbortSignal.timeout(timeoutMs) }
            : {}),
        }),
        runtime.apiFetch,
      );
      const rawText = await response.text();
      if (!response.ok) {
        throw modelRequestError(response, rawText);
      }

      const raw = JSON.parse(rawText) as Record<string, unknown>;
      const outputText = useQwenChat
        ? extractChatOutputText(raw)
        : extractOutputText(raw);
      const parsed = parseStructuredText<T>(outputText, schema);
      const usage =
        raw.usage && typeof raw.usage === "object"
          ? (raw.usage as Record<string, unknown>)
          : {};
      return {
        value: parsed,
        call: {
          responseId: String(raw.id ?? ""),
          model: String(raw.model ?? requestModel),
          inputTokens: Number(
            usage.input_tokens ?? usage.prompt_tokens ?? 0,
          ),
          outputTokens: Number(
            usage.output_tokens ?? usage.completion_tokens ?? 0,
          ),
        },
      };
    } catch (error) {
      lastError = classifyModelTransportError(error, attempt + 1);
      if (
        isMissingTextModelError(lastError) &&
        !modelDiscoveryAttempted
      ) {
        modelDiscoveryAttempted = true;
        const discoveredModel = await discoverStructuredTextModel(
          runtime,
          requestModel,
        );
        if (discoveredModel) {
          requestModel = discoveredModel;
          // The provider rejected the configured model before doing any work.
          // Spend the next request on the first compatible model exposed by
          // the same saved Tencent Cloud API instead of asking the user to
          // re-enter credentials or manually recover the page.
          attempt -= 1;
          continue;
        }
      }
      const retryable = lastError.retryable;
      if (attempt + 1 < maxAttempts && retryable) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        break;
      }
    }
  }
  throw lastError ?? new Error("模型接口请求失败。");
}
