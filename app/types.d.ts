declare module "*?url" {
  const url: string;
  export default url;
}

declare var __ARCH_REPORT_MODEL_RUNTIME__:
  | {
      apiKey?: string;
      model?: string;
      apiFetch?: (request: Request) => Promise<Response>;
    }
  | undefined;
