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

  if (!user) return <p>Loading...</p>;

  return (
    <section>
      <div className="nav">
        <h1>Dashboard</h1>
        <div className="link-row">
          <span>{user.email}</span>
          <button onClick={logout} style={{ background: "#6b7280" }}>
            Logout
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {agents.map((agent) => (
        <div className="card" key={agent.id}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong>{agent.name || "Agent"}</strong>
              <span className={`status status-${agent.status}`} style={{ marginLeft: "0.5rem" }}>
                {agent.status}
              </span>
            </div>
            <div className="link-row">
              <a href={`/agents/${agent.id}`}>
                <button>Open</button>
              </a>
              <button
                onClick={() => deleteAgent(agent.id)}
                disabled={deletingId === agent.id}
                style={{ background: "#dc2626" }}
              >
                {deletingId === agent.id ? "..." : "Delete"}
              </button>
            </div>
          </div>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.25rem" }}>
            {agent.linux_user} &middot; port {agent.port ?? "—"}
          </p>
        </div>
      ))}

      {showForm ? (
        <form onSubmit={createAgent} className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            name="name"
            type="text"
            placeholder="Agent name"
            autoFocus
            style={{ flex: 1, padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #d1d5db" }}
          />
          <button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create"}
          </button>
          <button type="button" onClick={() => setShowForm(false)} style={{ background: "#6b7280" }}>
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)} style={{ marginTop: "0.5rem" }}>
          + New Agent
        </button>
      )}
    </section>
  );
}
