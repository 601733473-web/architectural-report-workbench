"use client";

import type {
  LocalProjectDraft,
  StoredProjectSummary,
} from "@/app/lib/local-project-store";
import { migrateStoredProjectDraft } from "@/app/lib/local-project-store";

export interface CloudStoreStatus {
  configured: boolean;
  connected: boolean;
  referenceLibraryConnected: boolean;
  error?: string;
}

export interface PersistedImageUrlUpdate {
  pageId: string;
  slotId: string;
  sourceImageUrl: string;
  imageUrl: string;
}

async function projectApi<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    errorCode?: string;
  };
  if (!response.ok) {
    if (data.errorCode === "PROJECT_VERSION_CONFLICT") {
      throw new CloudProjectConflictError(
        data.error ?? "该设计已在另一个页面更新。",
      );
    }
    throw new Error(data.error ?? "云端项目操作失败。");
  }
  return data;
}

export class CloudProjectConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudProjectConflictError";
  }
}

export function getCloudStoreStatus() {
  return projectApi<CloudStoreStatus>("/api/projects?action=status");
}

export async function listCloudProjects() {
  const result = await projectApi<{ projects: StoredProjectSummary[] }>(
    "/api/projects?action=list",
  );
  return result.projects;
}

export async function loadCloudProject(projectId: string) {
  const result = await projectApi<{ draft: LocalProjectDraft }>(
    `/api/projects?action=load&projectId=${encodeURIComponent(projectId)}`,
  );
  return migrateStoredProjectDraft(result.draft);
}

export function saveCloudProject(
  draft: LocalProjectDraft,
  expectedUpdatedAt?: string,
) {
  return projectApi<{
    ok: true;
    updatedAt: string;
    imageUrls?: PersistedImageUrlUpdate[];
  }>("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save", draft, expectedUpdatedAt }),
  });
}

export function renameCloudProject(projectId: string, title: string) {
  return projectApi<{ ok: true; updatedAt: string }>("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "rename",
      projectId,
      title,
    }),
  });
}

export function deleteCloudProject(projectId: string) {
  return projectApi<{ ok: true; updatedAt: string }>("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "delete",
      projectId,
    }),
  });
}
