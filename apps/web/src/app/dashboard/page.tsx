"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken } from "@/lib/api";

type Agent = {
  id: string;
  name: string;
  status: string;
  linux_user: string;
  port: number | null;
};

type User = {
  id: string;
  email: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const readyCount = agents.filter((agent) => agent.status === "ready").length;
  const bootingCount = agents.filter((agent) => agent.status === "bootstrapping").length;
  const issueCount = agents.filter((agent) => agent.status === "error").length;

  useEffect(() => {
    Promise.all([
      api<User>("/me"),
      api<Agent[]>("/agents"),
    ])
      .then(([u, a]) => {
        setUser(u);
        setAgents(a);
      })
      .catch(() => {
        clearToken();
        router.push("/login");
      });
  }, [router]);

  async function createAgent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = (form.get("name") as string).trim() || "My Agent";
    setCreating(true);
    setError("");
    try {
      const agent = await api<Agent>("/agents", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setAgents((prev) => [...prev, agent]);
      setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }

  async function deleteAgent(agentId: string) {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    setDeletingId(agentId);
    setError("");
    try {
      await api(`/agents/${agentId}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setDeletingId(null);
    }
  }

  function logout() {
    api("/auth/logout", { method: "POST" }).catch(() => {});
    clearToken();
    router.push("/login");
  }

  if (!user) return <p className="loading-state">Loading dashboard...</p>;

  return (
    <section className="dashboard-shell">
      <div className="topbar">
        <div className="topbar-copy">
          <span className="eyebrow">Agent Dashboard</span>
          <h1>Sandbox overview</h1>
          <p className="muted">
            Lightweight control surface for the ClawaaS demo.
          </p>
        </div>
        <div className="topbar-actions">
          <span className="pill">{user.email}</span>
          <button className="button-secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="stats-strip">
        <div className="stat-tile">
          <span>Total agents</span>
          <strong>{agents.length}</strong>
        </div>
        <div className="stat-tile">
          <span>Ready</span>
          <strong>{readyCount}</strong>
        </div>
        <div className="stat-tile">
          <span>Bootstrapping</span>
          <strong>{bootingCount}</strong>
        </div>
        <div className="stat-tile">
          <span>Issues</span>
          <strong>{issueCount}</strong>
        </div>
      </div>

      <div className="section-grid">
        <div className="section-stack">
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <h3>Active agents</h3>
                <p className="muted">
                  {agents.length === 0
                    ? "No agents are running yet."
                    : `${agents.length} sandbox${agents.length === 1 ? "" : "es"} currently tracked.`}
                </p>
              </div>
              <span className="pill">Status, port, and runtime access</span>
            </div>

            {agents.length === 0 ? (
              <div className="empty-state">
                Create your first agent to start a clean sandbox for experiments, debugging, or autonomous runs.
              </div>
            ) : (
              <div className="agent-grid">
                {agents.map((agent) => (
                  <div className="agent-row" key={agent.id}>
                    <div className="agent-main">
                      <div className="agent-name-row">
                        <h3>{agent.name || "Agent"}</h3>
                        <span className={`status status-${agent.status}`}>{agent.status}</span>
                      </div>
                      <div className="agent-meta-grid">
                        <span className="meta-label">Linux user</span>
                        <span>{agent.linux_user}</span>
                        <span className="meta-label">Port</span>
                        <span>{agent.port ?? "pending"}</span>
                      </div>
                    </div>
                    <div className="agent-actions">
                      <a href={`/agents/${agent.id}`}>
                        <button>Open</button>
                      </a>
                      <button
                        className="button-danger"
                        onClick={() => deleteAgent(agent.id)}
                        disabled={deletingId === agent.id}
                      >
                        {deletingId === agent.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="card create-panel">
          <div className="card-title" style={{ marginBottom: "1rem" }}>
            <h3>New sandbox</h3>
            <p className="muted">Create a disposable runtime for demos, tests, or debugging.</p>
          </div>

          {showForm ? (
            <form onSubmit={createAgent} className="auth-form">
              <div className="field">
                <label htmlFor="name">Agent name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Research Runner"
                  autoFocus
                />
              </div>
              <button className="button-wide" type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create agent"}
              </button>
              <button
                className="button-secondary button-wide"
                type="button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="section-stack">
              <div className="notice">
                This demo keeps agent lifecycle simple: create, inspect, delete.
              </div>
              <button className="button-wide" onClick={() => setShowForm(true)}>
                Create new agent
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
