import { cookies } from "next/headers";

export const AUTH_ACCESS_TOKEN_COOKIE = "arch-report-access-token";
export const AUTH_REFRESH_TOKEN_COOKIE = "arch-report-refresh-token";

export type AppUser = {
  id: string;
  email: string;
};

export type AppAuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AppUser;
  expiresIn: number;
};

export class AppAuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AppAuthError";
    this.status = status;
  }
}

type AuthConfig = {
  url: string;
  key: string;
};

function getAuthConfig(): AuthConfig {
  const url = process.env.MEMFIRE_URL?.trim().replace(/\/+$/, "");
  const key =
    process.env.MEMFIRE_ANON_KEY?.trim() ||
    process.env.MEMFIRE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new AppAuthError(
      "登录服务尚未配置 MemFire。请先配置 MEMFIRE_URL 和 MEMFIRE_ANON_KEY。",
      503,
    );
  }
  return { url, key };
}

async function authRequest(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
) {
  const config = getAuthConfig();
  return fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      accept: "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
}

async function responseMessage(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    error_description?: string;
    msg?: string;
    message?: string;
  };
  const rawMessage =
    payload.error_description ?? payload.msg ?? payload.message ?? "";
  if (/invalid login credentials|invalid email or password/i.test(rawMessage)) {
    return "账号或密码不正确。";
  }
  if (/email not confirmed/i.test(rawMessage)) {
    return "该账号还没有完成邮箱确认。";
  }
  return rawMessage || "登录服务暂时不可用。";
}

function userFromPayload(value: unknown): AppUser | null {
  if (!value || typeof value !== "object") return null;
  const user = value as { id?: unknown; email?: unknown };
  if (typeof user.id !== "string" || typeof user.email !== "string") {
    return null;
  }
  return { id: user.id, email: user.email };
}

export async function signInWithPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new AppAuthError("请输入账号和密码。", 400);
  }
  const response = await authRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: normalizedEmail, password }),
  });
  if (!response.ok) {
    throw new AppAuthError(await responseMessage(response), response.status === 400 ? 401 : 503);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: unknown;
  };
  if (!payload.access_token || !payload.refresh_token) {
    throw new AppAuthError("登录服务返回了无效会话。", 503);
  }
  const user = userFromPayload(payload.user);
  if (!user) throw new AppAuthError("登录服务返回了无效账号。", 503);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user,
    expiresIn: Math.max(300, payload.expires_in ?? 3600),
  };
}

async function refreshSessionWithToken(
  refreshToken: string,
): Promise<AppAuthSession> {
  const response = await authRequest("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    throw new AppAuthError(await responseMessage(response), 401);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: unknown;
  };
  const user = userFromPayload(payload.user);
  if (!payload.access_token || !payload.refresh_token || !user) {
    throw new AppAuthError("登录续期服务返回了无效会话。", 503);
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user,
    expiresIn: Math.max(300, payload.expires_in ?? 3600),
  };
}

async function persistRefreshedSession(session: AppAuthSession) {
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  cookieStore.set(AUTH_ACCESS_TOKEN_COOKIE, session.accessToken, {
    ...cookieOptions,
    maxAge: session.expiresIn,
  });
  cookieStore.set(AUTH_REFRESH_TOKEN_COOKIE, session.refreshToken, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getAppUser(
  options: { allowRefresh?: boolean } = {},
): Promise<AppUser | null> {
  const runtime = globalThis as typeof globalThis & {
    __ARCH_REPORT_TEST_AUTH__?: boolean;
  };
  if (runtime.__ARCH_REPORT_TEST_AUTH__) {
    return { id: "test-user", email: "test@example.com" };
  }
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken) {
    try {
      const response = await authRequest("/auth/v1/user", {}, accessToken);
      if (response.ok) return userFromPayload(await response.json());
    } catch {
      // A refresh token can still recover an expired or transiently rejected
      // access token in authenticated API routes.
    }
  }
  if (!options.allowRefresh) return null;
  const refreshToken = cookieStore.get(AUTH_REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;
  try {
    const session = await refreshSessionWithToken(refreshToken);
    await persistRefreshedSession(session);
    return session.user;
  } catch {
    return null;
  }
}

export async function requireAppUser() {
  const user = await getAppUser({ allowRefresh: true });
  if (!user) throw new AppAuthError("请先登录。", 401);
  return user;
}
