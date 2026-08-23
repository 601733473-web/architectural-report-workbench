"use client";

import { LoaderCircle, LockKeyhole, LogIn } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/auth", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { authenticated?: boolean };
        if (data.authenticated) window.location.replace("/");
      })
      .catch(() => undefined);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth?action=login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "登录失败。");
      window.location.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败。");
      setBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand-mark">AI</div>
        <p className="eyebrow">DESIGN REPORT STUDIO</p>
        <h1 id="login-title">登录设计汇报工作台</h1>
        <p className="login-description">请输入已授权的 MemFire 账号后继续使用。</p>
        <form className="login-form" onSubmit={submit}>
          <label>
            <span>账号邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="name@example.com"
              required
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="请输入密码"
              required
            />
          </label>
          {error ? <p className="login-error" role="alert">{error}</p> : null}
          <button className="primary-button login-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />}
            {busy ? "正在登录" : "登录"}
          </button>
        </form>
        <p className="login-note">
          <LockKeyhole size={14} />
          账号和密码由 MemFire Auth 安全管理，系统不会保存明文密码。
        </p>
      </section>
    </main>
  );
}
