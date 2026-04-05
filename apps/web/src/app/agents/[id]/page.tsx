"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, clearToken } from "@/lib/api";

type Agent = {
  id: string;
  name: string;
  status: string;
};

type Message = {
  role: "user" | "agent";
  text: string;
};

export default function AgentChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Agent>(`/agents/${id}`).catch(() => {
      clearToken();
      router.push("/login");
      return null;
    }).then((a) => {
      if (a) setAgent(a);
    });
  }, [id, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll agent status while bootstrapping
  useEffect(() => {
    if (!agent || agent.status !== "bootstrapping") return;
    const interval = setInterval(async () => {
      try {
        const updated = await api<Agent>(`/agents/${id}`);
        setAgent(updated);
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [agent, id]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const message = (form.get("message") as string).trim();
    if (!message) return;

    setMessages((prev) => [...prev, { role: "user", text: message }]);
    e.currentTarget.reset();
    setSending(true);

    try {
      const data = await api<{ response: string }>(`/agents/${id}/chat`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });

      // Parse the openclaw agent JSON response
      let text: string;
      try {
        const inner = JSON.parse(data.response);
        const payloads = inner?.result?.payloads;
        text = payloads?.map((p: { text: string }) => p.text).join("\n") || data.response;
      } catch {
        text = data.response;
      }

      setMessages((prev) => [...prev, { role: "agent", text }]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setSending(false);
    }
  }

  if (!agent) return <p>Loading...</p>;

  return (
    <section>
      <div className="nav">
        <h1>{agent.name || "Agent"}</h1>
        <div className="link-row">
          <span className={`status status-${agent.status}`}>{agent.status}</span>
          <a href="/dashboard">Back</a>
        </div>
      </div>

      {agent.status === "bootstrapping" && (
        <div className="card" style={{ textAlign: "center", background: "#fef9c3" }}>
          Agent is bootstrapping... please wait.
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`msg msg-${msg.role}`}>
            <strong>{msg.role === "user" ? "You" : "Agent"}</strong>
            <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <textarea
          name="message"
          rows={2}
          placeholder={agent.status === "ready" ? "Type a message..." : "Waiting for agent..."}
          disabled={agent.status !== "ready" || sending}
        />
        <button type="submit" disabled={agent.status !== "ready" || sending}>
          {sending ? "..." : "Send"}
        </button>
      </form>
    </section>
  );
}
