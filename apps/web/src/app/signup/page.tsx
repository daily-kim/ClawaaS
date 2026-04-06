"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    try {
      const data = await api<{ token: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setToken(data.token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-shell auth-grid">
      <div className="hero-panel hero-panel-compact">
        <div className="hero-copy">
          <span className="eyebrow">DS-Claw 🦞</span>
          <h1>Create access to a personal, private, managed OpenClaw workspace.</h1>
          <p>
            DS-Claw is a focused internal console for creating and operating managed agent runtimes
            without exposing the host as a shared execution surface.
          </p>
        </div>

        <div className="hero-list">
          <div className="hero-list-item">
            <strong>Private by default</strong>
            <span>Each account gets isolated Linux user, runtime state, and workspace boundaries.</span>
          </div>
          <div className="hero-list-item">
            <strong>Managed control</strong>
            <span>Operate chat, files, logs, and lifecycle actions from one web console.</span>
          </div>
          <div className="hero-list-item">
            <strong>Safe sandbox layer</strong>
            <span>Powered by NVIDIA&apos;s OpenShell to keep runtime execution sandboxed.</span>
          </div>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">Create Account</span>
          <h2>Open your DS-Claw 🦞 workspace.</h2>
          <p>Set up credentials, then continue straight into your managed agent dashboard.</p>
        </div>

        {error && <p className="error">{error}</p>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="operator@company.com" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" placeholder="Create a strong password" required />
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="muted">
          Already have DS-Claw 🦞 access? <a className="text-link" href="/login">Sign in</a>
        </p>
      </div>
    </section>
  );
}
