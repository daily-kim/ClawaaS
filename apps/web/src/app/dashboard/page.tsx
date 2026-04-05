"use client";

import { useEffect, useState } from "react";
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

  async function createAgent() {
    setCreating(true);
    setError("");
    try {
      const agent = await api<Agent>("/agents", {
        method: "POST",
        body: JSON.stringify({ name: "My Agent" }),
      });
      setAgents((prev) => [...prev, agent]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setCreating(false);
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

      {agents.length === 0 ? (
        <div className="card" style={{ textAlign: "center" }}>
          <p style={{ marginBottom: "0.75rem" }}>No agents yet.</p>
          <button onClick={createAgent} disabled={creating}>
            {creating ? "Creating..." : "New Agent"}
          </button>
        </div>
      ) : (
        agents.map((agent) => (
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
              <a href={`/agents/${agent.id}`}>
                <button>Chat</button>
              </a>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.25rem" }}>
              {agent.linux_user} &middot; port {agent.port ?? "—"}
            </p>
          </div>
        ))
      )}

      {agents.length > 0 && agents.every((a) => a.status !== "created") && (
        <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "0.5rem" }}>
          1 user = 1 agent (demo)
        </p>
      )}
    </section>
  );
}
