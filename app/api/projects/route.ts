import { NextResponse } from "next/server";
import { AppAuthError, requireAppUser } from "@/app/lib/app-auth";
import type { LocalProjectDraft } from "@/app/lib/local-project-store";
import {
  deleteMemFireProject,
  getMemFireStatus,
  listMemFireProjects,
  loadMemFireProject,
  renameMemFireProject,
  saveMemFireProject,
  MemFireProjectConflictError,
  type PersistedImageUrlUpdate,
} from "@/app/lib/memfire-store";
import { normalizeExistingSmallModePlan } from "@/app/lib/model-pipeline";

function normalizeSmallModeDraft(draft: LocalProjectDraft): LocalProjectDraft {
  return {
    ...draft,
    result: {
      ...draft.result,
      pagePlan: normalizeExistingSmallModePlan(
        draft.result.projectFacts,
        draft.result.pagePlan,
      ),
    },
  };
}

export async function GET(request: Request) {
  try {
    await requireAppUser();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "status";
    if (action === "status") return NextResponse.json(await getMemFireStatus());
    if (action === "list") {
      return NextResponse.json({ projects: await listMemFireProjects() });
    }
    if (action === "load") {
      const projectId = url.searchParams.get("projectId")?.trim();
      if (!projectId) {
        return NextResponse.json({ error: "缺少项目编号。" }, { status: 400 });
      }
      const storedDraft = await loadMemFireProject(projectId);
      const draft = storedDraft ? normalizeSmallModeDraft(storedDraft) : undefined;
      return draft
        ? NextResponse.json({ draft })
        : NextResponse.json({ error: "没有找到该云端项目。" }, { status: 404 });
    }
    return NextResponse.json({ error: "不支持的项目操作。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "MemFire 项目读取失败。" },
      { status: error instanceof AppAuthError ? error.status : 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAppUser();
    const payload = (await request.json()) as {
      action?: "save" | "rename" | "delete";
      projectId?: string;
      title?: string;
      draft?: LocalProjectDraft;
      expectedUpdatedAt?: string;
    };
    let updatedAt: string | undefined;
    let imageUrls: PersistedImageUrlUpdate[] | undefined;
    if (payload.action === "rename" || payload.action === "delete") {
      const projectId = payload.projectId?.trim() || payload.draft?.projectId;
      if (!projectId) {
        return NextResponse.json({ error: "缺少项目编号。" }, { status: 400 });
      }
      const result =
        payload.action === "rename"
          ? await renameMemFireProject(projectId, payload.title ?? "")
          : await deleteMemFireProject(projectId);
      updatedAt = result.updatedAt;
    } else {
      if (!payload.draft) {
        return NextResponse.json(
          { error: "缺少项目存档内容。" },
          { status: 400 },
        );
      }
      const result = await saveMemFireProject(
        normalizeSmallModeDraft(payload.draft),
        payload.expectedUpdatedAt,
      );
      updatedAt = result.updatedAt;
      imageUrls = result.imageUrls;
    }
    return NextResponse.json({ ok: true, updatedAt, imageUrls });
  } catch (error) {
    if (error instanceof MemFireProjectConflictError) {
      return NextResponse.json(
        { error: error.message, errorCode: error.code },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "MemFire 项目保存失败。" },
      { status: error instanceof AppAuthError ? error.status : 503 },
    );
  }
}
