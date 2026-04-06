"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    try {
      const data = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setToken(data.token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-shell auth-grid">
      <div className="hero-panel hero-panel-compact">
        <div className="hero-copy">
          <span className="eyebrow">ClawaaS Demo</span>
          <h1>Operate isolated agents from a simple browser console.</h1>
          <p>
            This is a technical demo, not a polished product shell.
            The goal is fast access to chat, logs, and sandbox files.
          </p>
        </div>

        <div className="hero-list">
          <div className="hero-list-item">
            <strong>Per-agent isolation</strong>
            <span>Separate runtime surface for each task.</span>
          </div>
          <div className="hero-list-item">
            <strong>Runtime inspection</strong>
            <span>Logs and file access stay one click away.</span>
          </div>
          <div className="hero-list-item">
            <strong>Disposable workflow</strong>
            <span>Create, inspect, and remove agents quickly.</span>
          </div>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">Sign In</span>
          <h2>Return to the workspace.</h2>
          <p>Use your account to open the dashboard and manage active agents.</p>
        </div>

        {error && <p className="error">{error}</p>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="operator@company.com" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" placeholder="Enter your password" required />
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="muted">
          Need an account? <a className="text-link" href="/signup">Create one</a>
        </p>
      </div>
    </section>
  );
}
