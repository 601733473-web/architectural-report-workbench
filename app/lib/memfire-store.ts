import type { LocalProjectDraft, StoredProjectSummary } from "@/app/lib/local-project-store";

const PROJECTS_TABLE = "architectural_report_projects";
const REFERENCES_TABLE = "architectural_report_reference_libraries";
const PROJECT_ASSETS_BUCKET = "architectural-report-assets";

interface MemFireConfig {
  url: string;
  key: string;
}

interface ProjectRow {
  id: string;
  title: string;
  status: "active" | "archived";
  payload?: LocalProjectDraft;
  updated_at: string;
  archived_at?: string | null;
}

export interface PersistedImageUrlUpdate {
  pageId: string;
  slotId: string;
  sourceImageUrl: string;
  imageUrl: string;
}

export class MemFireProjectConflictError extends Error {
  readonly code = "PROJECT_VERSION_CONFLICT";

  constructor() {
    super("该设计已在另一个页面更新。当前旧页面已停止覆盖云端，请刷新后继续。");
    this.name = "MemFireProjectConflictError";
  }
}

export function getMemFireConfig(): MemFireConfig | null {
  const url = process.env.MEMFIRE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.MEMFIRE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

async function memfireRequest(
  path: string,
  init: RequestInit = {},
  config = getMemFireConfig(),
) {
  if (!config) throw new Error("MemFire 尚未配置。请设置服务地址和服务端密钥。");
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${config.url}${path}`, {
        ...init,
        headers: {
          apikey: config.key,
          authorization: `Bearer ${config.key}`,
          accept: "application/json",
          ...(init.headers ?? {}),
        },
        signal: init.signal ?? AbortSignal.timeout(30_000),
      });
      if (response.ok) return response;
      const detail = (await response.text()).trim().slice(0, 500);
      const error = new Error(
        `MemFire 请求失败（${response.status}）${detail ? `：${detail}` : ""}`,
      );
      if (response.status < 500 && response.status !== 429) {
        throw Object.assign(error, { retryable: false });
      }
      lastError = error;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "retryable" in error &&
        error.retryable === false
      ) {
        throw error;
      }
      lastError = error;
    }
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("MemFire 网络请求失败。");
}

let assetBucketReady: Promise<void> | null = null;

async function ensureProjectAssetsBucket(config: MemFireConfig) {
  if (assetBucketReady) return assetBucketReady;
  assetBucketReady = (async () => {
    const status = await fetch(
      `${config.url}/storage/v1/bucket/${PROJECT_ASSETS_BUCKET}`,
      {
        headers: {
          apikey: config.key,
          authorization: `Bearer ${config.key}`,
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (status.ok) return;
    const statusDetail = await status.text();
    const bucketMissing =
      status.status === 404 || /bucket not found/i.test(statusDetail);
    if (!bucketMissing) {
      throw new Error(
        `MemFire 图片空间检查失败（${status.status}）：${statusDetail.slice(0, 300)}`,
      );
    }
    const created = await fetch(`${config.url}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: PROJECT_ASSETS_BUCKET,
        name: PROJECT_ASSETS_BUCKET,
        public: true,
        file_size_limit: 12_000_000,
        allowed_mime_types: ["image/png", "image/jpeg", "image/webp"],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!created.ok && created.status !== 409) {
      throw new Error(
        `MemFire 图片空间创建失败（${created.status}）：${(await created.text()).slice(0, 300)}`,
      );
    }
  })().catch((error) => {
    assetBucketReady = null;
    throw error;
  });
  return assetBucketReady;
}

function safeAssetSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 100) || "asset";
}

async function generatedImageBytes(imageUrl: string) {
  const dataMatch = imageUrl.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i,
  );
  if (dataMatch) {
    return {
      contentType: dataMatch[1].toLowerCase(),
      bytes: Buffer.from(dataMatch[2].replace(/\s+/g, ""), "base64"),
    };
  }
  if (!/^https?:\/\//i.test(imageUrl)) return null;
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`AI 图片下载失败（${response.status}）。`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const declaredType = response.headers.get("content-type")?.split(";")[0];
  const contentType = /^image\/(?:png|jpeg|webp)$/i.test(declaredType ?? "")
    ? declaredType!.toLowerCase()
    : bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      ? "image/png"
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? "image/jpeg"
        : bytes.subarray(8, 12).toString("ascii") === "WEBP"
          ? "image/webp"
          : "";
  if (!contentType) throw new Error("AI 图片返回的文件类型无效。");
  return { contentType, bytes };
}

async function persistGeneratedImage(
  imageUrl: string,
  projectId: string,
  pageId: string,
  slotId: string,
  config: MemFireConfig,
) {
  if (
    imageUrl.startsWith(
      `${config.url}/storage/v1/object/public/${PROJECT_ASSETS_BUCKET}/`,
    ) &&
    /\.(?:png|jpe?g|webp)(?:\?|$)/i.test(imageUrl)
  ) {
    return imageUrl;
  }
  const image = await generatedImageBytes(imageUrl);
  if (!image) return imageUrl;
  if (!image.bytes.length || image.bytes.length > 12_000_000) {
    throw new Error("AI 图片为空或超过 12MB，未写入云端。");
  }
  await ensureProjectAssetsBucket(config);
  const extension =
    image.contentType === "image/jpeg"
      ? "jpg"
      : image.contentType === "image/webp"
        ? "webp"
        : "png";
  const objectPath = [
    safeAssetSegment(projectId),
    "visuals",
    safeAssetSegment(pageId),
    `${safeAssetSegment(slotId)}.${extension}`,
  ].join("/");
  const response = await fetch(
    `${config.url}/storage/v1/object/${PROJECT_ASSETS_BUCKET}/${objectPath}`,
    {
      method: "POST",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": image.contentType,
        "x-upsert": "true",
        "cache-control": "no-cache",
      },
      body: image.bytes,
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `AI 图片写入 MemFire 失败（${response.status}）：${(await response.text()).slice(0, 300)}`,
    );
  }
  return `${config.url}/storage/v1/object/public/${PROJECT_ASSETS_BUCKET}/${objectPath}?v=${Date.now()}`;
}

function imageObjectPathFromPublicUrl(imageUrl: string) {
  const marker =
    `/storage/v1/object/public/${PROJECT_ASSETS_BUCKET}/`;
  const markerIndex = imageUrl.indexOf(marker);
  if (markerIndex < 0) return null;
  const encodedPath = imageUrl.slice(markerIndex + marker.length).split("?")[0];
  if (!encodedPath) return null;
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

function collectReferencedProjectAssetPaths(
  value: unknown,
  config: MemFireConfig,
  paths = new Set<string>(),
) {
  if (typeof value === "string") {
    const objectPath = imageObjectPathFromPublicUrl(value);
    if (objectPath) paths.add(objectPath);
    return paths;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferencedProjectAssetPaths(item, config, paths);
    }
    return paths;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectReferencedProjectAssetPaths(item, config, paths);
    }
  }
  return paths;
}

async function listProjectAssetPaths(
  projectId: string,
  config: MemFireConfig,
) {
  const paths: string[] = [];
  const limit = 1_000;
  const visitPrefix = async (prefix: string): Promise<void> => {
    for (let offset = 0; ; offset += limit) {
      const response = await memfireRequest(
        `/storage/v1/object/list/${PROJECT_ASSETS_BUCKET}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prefix,
            limit,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        },
        config,
      );
      const rows = (await response.json()) as Array<{
        name?: string;
        id?: string | null;
      }>;
      for (const row of rows) {
        if (!row.name) continue;
        const objectPath = `${prefix}${row.name}`;
        if (row.id) paths.push(objectPath);
        else await visitPrefix(`${objectPath}/`);
      }
      if (rows.length < limit) break;
    }
  };
  await visitPrefix(`${safeAssetSegment(projectId)}/`);
  return paths;
}

async function cleanupStaleProjectAssets(
  draft: LocalProjectDraft,
  projectId: string,
  config: MemFireConfig,
) {
  try {
    const referencedPaths = collectReferencedProjectAssetPaths(draft, config);
    const storedPaths = await listProjectAssetPaths(projectId, config);
    const stalePaths = storedPaths.filter(
      (path) => !referencedPaths.has(path),
    );
    for (const objectPath of stalePaths) {
      await memfireRequest(
        `/storage/v1/object/${PROJECT_ASSETS_BUCKET}/${objectPath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        {
          method: "DELETE",
          headers: { prefer: "return=minimal" },
        },
        config,
      );
    }
    return stalePaths.length;
  } catch {
    // Cleanup is best effort. A storage-listing failure must not turn a
    // successful project save into a failed save.
    return 0;
  }
}

async function deleteProjectAssets(projectId: string, config: MemFireConfig) {
  const storedPaths = await listProjectAssetPaths(projectId, config);
  for (const objectPath of storedPaths) {
    await memfireRequest(
      `/storage/v1/object/${PROJECT_ASSETS_BUCKET}/${objectPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
      },
      config,
    );
  }
}

async function externalizeGeneratedImages(
  draft: LocalProjectDraft,
  projectId: string,
  config: MemFireConfig,
) {
  const result = structuredClone(draft);
  const imageUrlUpdates = new Map<string, PersistedImageUrlUpdate>();
  const persistedImageCache = new Map<string, string>();
  const externalizeImage = async (
    imageUrl: string,
    pageId: string,
    slotId: string,
  ) => {
    const cacheKey = `${pageId}:${slotId}:${imageUrl}`;
    const cached = persistedImageCache.get(cacheKey);
    const persistedUrl =
      cached ??
      (await persistGeneratedImage(
        imageUrl,
        projectId,
        pageId,
        slotId,
        config,
      ));
    persistedImageCache.set(cacheKey, persistedUrl);
    imageUrlUpdates.set(`${pageId}:${slotId}`, {
      pageId,
      slotId,
      sourceImageUrl: imageUrl,
      imageUrl: persistedUrl,
    });
    return persistedUrl;
  };
  for (const page of result.result.pagePlan.pages) {
    const task = page.visual_task;
    if (!task) continue;
    if (task.generated_images?.length) {
      for (const image of task.generated_images) {
        image.image_url = await externalizeImage(
          image.image_url,
          page.page_id,
          image.slot_id,
        );
      }
    }
    if (task.generated_image?.image_url) {
      const firstSlotId = task.image_slots[0]?.slot_id ?? "primary";
      const matchingGeneratedImage = task.generated_images?.find(
        (image) => image.slot_id === firstSlotId,
      );
      task.generated_image.image_url = matchingGeneratedImage
        ? matchingGeneratedImage.image_url
        : await externalizeImage(
            task.generated_image.image_url,
            page.page_id,
            firstSlotId,
          );
    }
  }
  return {
    draft: result,
    imageUrls: [...imageUrlUpdates.values()],
  };
}

export async function getMemFireStatus() {
  const url = process.env.MEMFIRE_URL?.trim();
  const hasAnonymousKey = Boolean(process.env.MEMFIRE_ANON_KEY?.trim());
  const config = getMemFireConfig();
  if (!config) {
    return {
      configured: Boolean(url || hasAnonymousKey),
      connected: false,
      referenceLibraryConnected: false,
      error:
        url && hasAnonymousKey
          ? "MemFire 地址和匿名密钥已配置；项目私有存储仍需要服务端密钥。"
          : undefined,
    };
  }
  try {
    await memfireRequest(
      `/rest/v1/${PROJECTS_TABLE}?select=id&limit=1`,
      {},
      config,
    );
    let referenceLibraryConnected = false;
    try {
      const response = await memfireRequest(
        `/rest/v1/${REFERENCES_TABLE}?select=library_key&limit=1`,
        {},
        config,
      );
      const rows = (await response.json()) as unknown[];
      referenceLibraryConnected = rows.length > 0;
    } catch {
      referenceLibraryConnected = false;
    }
    return { configured: true, connected: true, referenceLibraryConnected };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      referenceLibraryConnected: false,
      error: error instanceof Error ? error.message : "MemFire 连接失败",
    };
  }
}

export async function listMemFireProjects() {
  const response = await memfireRequest(
    `/rest/v1/${PROJECTS_TABLE}?select=id,title,status,updated_at,archived_at&order=updated_at.desc`,
  );
  const rows = (await response.json()) as ProjectRow[];
  return rows.map(
    (row): StoredProjectSummary => ({
      projectId: row.id,
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at ?? undefined,
      storage: "memfire",
    }),
  );
}

export async function loadMemFireProject(projectId: string) {
  const response = await memfireRequest(
    `/rest/v1/${PROJECTS_TABLE}?id=eq.${encodeURIComponent(projectId)}&select=payload&limit=1`,
  );
  const rows = (await response.json()) as Array<{ payload?: LocalProjectDraft }>;
  return rows[0]?.payload;
}

export async function saveMemFireProject(
  draft: LocalProjectDraft,
  expectedUpdatedAt?: string,
) {
  const projectId = draft.projectId?.trim();
  if (!projectId) throw new Error("云端项目缺少项目编号。");
  const config = getMemFireConfig();
  if (!config) throw new Error("MemFire 尚未配置。请设置服务地址和服务端密钥。");
  const title =
    draft.title?.trim() ||
    draft.result.projectFacts.project_name_anonymized ||
    "未命名设计";
  const savedAt = new Date().toISOString();
  const externalized = await externalizeGeneratedImages(
    draft,
    projectId,
    config,
  );
  const savedDraft = { ...externalized.draft, title, updatedAt: savedAt };
  const row = {
    id: projectId,
    title,
    status: draft.status ?? "active",
    payload: savedDraft,
    updated_at: savedAt,
    archived_at: draft.archivedAt ?? null,
  };

  if (expectedUpdatedAt) {
    const response = await memfireRequest(
      `/rest/v1/${PROJECTS_TABLE}?id=eq.${encodeURIComponent(projectId)}&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(row),
      },
    );
    const updatedRows = (await response.json()) as ProjectRow[];
    if (!updatedRows.length) throw new MemFireProjectConflictError();
    await cleanupStaleProjectAssets(savedDraft, projectId, config);
    return { updatedAt: savedAt, imageUrls: externalized.imageUrls };
  }

  const existingResponse = await memfireRequest(
    `/rest/v1/${PROJECTS_TABLE}?id=eq.${encodeURIComponent(projectId)}&select=id&limit=1`,
  );
  const existingRows = (await existingResponse.json()) as Array<{ id: string }>;
  if (existingRows.length) throw new MemFireProjectConflictError();

  await memfireRequest(`/rest/v1/${PROJECTS_TABLE}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  await cleanupStaleProjectAssets(savedDraft, projectId, config);
  return { updatedAt: savedAt, imageUrls: externalized.imageUrls };
}

export async function setMemFireProjectArchived(
  projectId: string,
  archived: boolean,
) {
  const archivedAt = new Date().toISOString();
  await memfireRequest(
    `/rest/v1/${PROJECTS_TABLE}?id=eq.${encodeURIComponent(projectId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: archived ? "archived" : "active",
        updated_at: archivedAt,
        archived_at: archived ? archivedAt : null,
      }),
    },
  );
  return { updatedAt: archivedAt };
}

export async function archiveMemFireProject(projectId: string) {
  return setMemFireProjectArchived(projectId, true);
}

export async function restoreMemFireProject(projectId: string) {
  return setMemFireProjectArchived(projectId, false);
}

export async function renameMemFireProject(projectId: string, title: string) {
  const normalizedProjectId = projectId.trim();
  const normalizedTitle = title.trim();
  if (!normalizedProjectId) throw new Error("缺少项目编号。");
  if (!normalizedTitle) throw new Error("设计名称不能为空。");
  const config = getMemFireConfig();
  if (!config) throw new Error("MemFire 尚未配置。请设置服务端密钥。");
  const encodedProjectId = encodeURIComponent(normalizedProjectId);
  const existingResponse = await memfireRequest(
    `/rest/v1/${PROJECTS_TABLE}?id=eq.${encodedProjectId}&select=payload&limit=1`,
    {},
    config,
  );
  const existingRows = (await existingResponse.json()) as Array<{
    payload?: LocalProjectDraft;
  }>;
  const existing = existingRows[0]?.payload;
  if (!existing) throw new Error("没有找到该设计存档。");
  const updatedAt = new Date().toISOString();
  await memfireRequest(
    `/rest/v1/${PROJECTS_TABLE}?id=eq.${encodedProjectId}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        title: normalizedTitle,
        payload: { ...existing, title: normalizedTitle, updatedAt },
        updated_at: updatedAt,
      }),
    },
    config,
  );
  return { updatedAt };
}

export async function deleteMemFireProject(projectId: string) {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) throw new Error("缺少项目编号。");
  const config = getMemFireConfig();
  if (!config) throw new Error("MemFire 尚未配置。请设置服务端密钥。");
  const encodedProjectId = encodeURIComponent(normalizedProjectId);
  const existingResponse = await memfireRequest(
    `/rest/v1/${PROJECTS_TABLE}?id=eq.${encodedProjectId}&select=id&limit=1`,
    {},
    config,
  );
  const existingRows = (await existingResponse.json()) as Array<{
    id: string;
  }>;
  if (!existingRows.length) throw new Error("没有找到该云端设计存档。");
  await deleteProjectAssets(normalizedProjectId, config);
  await memfireRequest(
    `/rest/v1/${PROJECTS_TABLE}?id=eq.${encodedProjectId}`,
    {
      method: "DELETE",
      headers: { prefer: "return=minimal" },
    },
    config,
  );
  return { updatedAt: new Date().toISOString() };
}
