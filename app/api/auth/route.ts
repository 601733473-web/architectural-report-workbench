import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  AppAuthError,
  getAppUser,
  signInWithPassword,
} from "@/app/lib/app-auth";

const productionCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function GET() {
  try {
    const user = await getAppUser();
    return NextResponse.json({ authenticated: Boolean(user), user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "登录状态读取失败。" },
      { status: error instanceof AppAuthError ? error.status : 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "login";
    if (action === "logout") {
      const response = NextResponse.json({ ok: true });
      response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, "", {
        ...productionCookie,
        maxAge: 0,
      });
      response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, "", {
        ...productionCookie,
        maxAge: 0,
      });
      return response;
    }
    if (action !== "login") {
      return NextResponse.json({ error: "不支持的登录操作。" }, { status: 400 });
    }
    const payload = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const session = await signInWithPassword(
      payload.email ?? "",
      payload.password ?? "",
    );
    const response = NextResponse.json({ ok: true, user: session.user });
    response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, session.accessToken, {
      ...productionCookie,
      maxAge: session.expiresIn,
    });
    response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, session.refreshToken, {
      ...productionCookie,
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "登录失败。" },
      { status: error instanceof AppAuthError ? error.status : 503 },
    );
  }
}
