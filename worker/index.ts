/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_API?: {
    fetch(request: Request): Promise<Response>;
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env?: Env,
    ctx?: ExecutionContext,
  ): Promise<Response> {
    const runtimeEnv = env ?? ({} as Env);
    const runtimeContext =
      ctx ??
      ({
        waitUntil() {},
        passThroughOnException() {},
      } satisfies ExecutionContext);
    globalThis.__ARCH_REPORT_MODEL_RUNTIME__ = {
      apiKey: runtimeEnv.OPENAI_API_KEY,
      model: runtimeEnv.OPENAI_MODEL,
      baseUrl: runtimeEnv.OPENAI_BASE_URL,
      apiFetch: runtimeEnv.OPENAI_API
        ? (modelRequest: Request) => runtimeEnv.OPENAI_API!.fetch(modelRequest)
        : undefined,
    };
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      if (!runtimeEnv.ASSETS || !runtimeEnv.IMAGES) {
        return new Response("Image optimization is unavailable locally.", {
          status: 404,
        });
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) =>
          runtimeEnv.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await runtimeEnv.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, runtimeEnv, runtimeContext);
  },
};

export default worker;
