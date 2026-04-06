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
          <span className="eyebrow">ClawaaS Demo</span>
          <h1>Create an operator account for the browser-based sandbox console.</h1>
          <p>
            This UI is intentionally simple. It is meant to expose core runtime controls
            without pretending to be a fully finished product.
          </p>
        </div>

        <div className="hero-list">
          <div className="hero-list-item">
            <strong>Agent isolation</strong>
            <span>Separate Linux user and runtime per sandbox.</span>
          </div>
          <div className="hero-list-item">
            <strong>Direct inspection</strong>
            <span>Open logs, files, and chat from the same console.</span>
          </div>
          <div className="hero-list-item">
            <strong>Fast reset</strong>
            <span>Delete and recreate a broken environment quickly.</span>
          </div>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">Create Account</span>
          <h2>Open a new workspace seat.</h2>
          <p>Set up credentials, then continue straight into the agent dashboard.</p>
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
          Already have an account? <a className="text-link" href="/login">Sign in</a>
        </p>
      </div>
    </section>
  );
}
