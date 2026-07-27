declare module "*?url" {
  const url: string;
  export default url;
}

// Global runtime bridge assigned by the Cloudflare worker.
// eslint-disable-next-line no-var
declare var __ARCH_REPORT_MODEL_RUNTIME__:
  | {
      apiKey?: string;
      model?: string;
      apiFetch?: (request: Request) => Promise<Response>;
    }
  | undefined;
