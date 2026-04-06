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
          <span className="eyebrow">DS-Claw 🦞</span>
          <h1>Sign in to your personal, private, managed OpenClaw runtime.</h1>
          <p>
            DS-Claw gives each operator a browser entrypoint into a managed OpenClaw-style agent workspace,
            with fast access to chat, logs, files, and runtime controls.
          </p>
        </div>

        <div className="hero-list">
          <div className="hero-list-item">
            <strong>Personal and private</strong>
            <span>Each agent runtime stays isolated to its own user and workspace.</span>
          </div>
          <div className="hero-list-item">
            <strong>Managed runtime access</strong>
            <span>Open logs, inspect files, and steer the agent from one console.</span>
          </div>
          <div className="hero-list-item">
            <strong>Safe sandbox foundation</strong>
            <span>Powered by NVIDIA&apos;s OpenShell for a safer sandboxed execution surface.</span>
          </div>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">Sign In</span>
          <h2>Return to DS-Claw 🦞.</h2>
          <p>Use your account to open your private agent console and manage active runtimes.</p>
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
          Need DS-Claw 🦞 access? <a className="text-link" href="/signup">Create an account</a>
        </p>
      </div>
    </section>
  );
}
