"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/api";

type Agent = {
  id: string;
  name: string;
  status: string;
};

type Message = {
  role: "user" | "agent";
  text: string;
};

type LogLine = {
  time: string;
  text: string;
  level: "info" | "warn" | "error" | "system";
};

function parseLine(raw: string): LogLine {
  const journalMatch = raw.match(
    /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\S*\s+\S+\s+(\S+?)(?:\[\d+\])?:\s*(.*)$/
  );
  let time: string;
  let text: string;
  let source = "";
  if (journalMatch) {
    time = journalMatch[1];
    source = journalMatch[2];
    text = journalMatch[3];
    const innerMatch = text.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+\S*\s+(.*)$/);
    if (innerMatch) text = innerMatch[1];
  } else {
    time = "";
    text = raw;
  }
  let level: LogLine["level"] = "info";
  if (source === "systemd") level = "system";
  else if (/error|failed|fatal/i.test(text)) level = "error";
  else if (/warn|anomaly/i.test(text)) level = "warn";
  return { time, text, level };
}

const LEVEL_COLORS: Record<LogLine["level"], string> = {
  info: "#e0e0e0",
  warn: "#fbbf24",
  error: "#f87171",
  system: "#60a5fa",
};
const TIME_COLOR = "#6b7280";

type FileEntry = {
  name: string;
  type: "file" | "dir";
  size: number | null;
};

type Tab = "chat" | "logs" | "files";

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>("chat");

  // Chat state
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(`chat:${id}`) || "[]");
    } catch { return []; }
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Logs state
  const [lines, setLines] = useState<LogLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pinBottom, setPinBottom] = useState(true);
  const termRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Files state
  const [filePath, setFilePath] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileEdited, setFileEdited] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  // Fetch agent
  useEffect(() => {
    api<Agent>(`/agents/${id}`).catch(() => {
      clearToken();
      router.push("/login");
      return null;
    }).then((a) => {
      if (a) setAgent(a);
    });
  }, [id, router]);

  // Persist chat to localStorage
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (messages.length > 0) {
      localStorage.setItem(`chat:${id}`, JSON.stringify(messages));
    }
  }, [messages, id]);

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

  // Stream logs when logs tab is active
  useEffect(() => {
    if (tab !== "logs" || !agent) return;

    const controller = new AbortController();
    abortRef.current = controller;

    async function streamLogs() {
      setStreaming(true);
      try {
        const token = getToken();
        const res = await fetch(
          `http://${window.location.hostname}:8000/agents/${id}/logs?since=30m`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          }
        );
        if (!res.ok || !res.body) { setStreaming(false); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          const newLines: LogLine[] = [];
          for (const part of parts) {
            if (part.startsWith("data: ")) newLines.push(parseLine(part.slice(6)));
          }
          if (newLines.length > 0) setLines((prev) => [...prev, ...newLines]);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setStreaming(false);
      }
    }

    streamLogs();
    return () => controller.abort();
  }, [tab, agent, id]);

  // Load files when files tab is active or path changes
  useEffect(() => {
    if (tab !== "files" || !agent) return;
    let cancelled = false;
    setLoadingFiles(true);
    api<FileEntry[]>(`/agents/${id}/files?path=${encodeURIComponent(filePath)}`)
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setLoadingFiles(false); });
    return () => { cancelled = true; };
  }, [tab, agent, id, filePath]);

  function openEntry(entry: FileEntry) {
    const newPath = filePath === "." ? entry.name : `${filePath}/${entry.name}`;
    if (entry.type === "dir") {
      setSelectedFile(null);
      setFilePath(newPath);
    } else {
      setSelectedFile(newPath);
      setFileEdited(false);
      api<{ content: string }>(`/agents/${id}/files/read?path=${encodeURIComponent(newPath)}`)
        .then((d) => setFileContent(d.content))
        .catch(() => setFileContent("(failed to read file)"));
    }
  }

  function navigateUp() {
    setSelectedFile(null);
    if (filePath === ".") return;
    const parts = filePath.split("/");
    parts.pop();
    setFilePath(parts.length === 0 ? "." : parts.join("/"));
  }

  async function saveFile() {
    if (!selectedFile) return;
    setSavingFile(true);
    try {
      await api(`/agents/${id}/files/write`, {
        method: "PUT",
        body: JSON.stringify({ path: selectedFile, content: fileContent }),
      });
      setFileEdited(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingFile(false);
    }
  }

  // Auto-scroll logs
  useEffect(() => {
    if (pinBottom && termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines, pinBottom]);

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

      let text: string;
      try {
        const inner = JSON.parse(data.response);
        const payloads = inner?.result?.payloads;
        if (Array.isArray(payloads) && payloads.length > 0) {
          text = payloads.map((p: { text: string }) => p.text).join("\n");
        } else {
          const summary = inner?.summary || inner?.status || "No response";
          text = `[${summary}]`;
        }
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
          <a href="/dashboard">Dashboard</a>
        </div>
      </div>

      <div className="tab-bar">
        <button
          className={`tab ${tab === "chat" ? "tab-active" : ""}`}
          onClick={() => setTab("chat")}
        >
          Chat
        </button>
        <button
          className={`tab ${tab === "logs" ? "tab-active" : ""}`}
          onClick={() => setTab("logs")}
        >
          Logs
        </button>
        <button
          className={`tab ${tab === "files" ? "tab-active" : ""}`}
          onClick={() => setTab("files")}
        >
          Files
        </button>
      </div>

      {tab === "chat" && (
        <>
          {agent.status === "bootstrapping" && (
            <div className="card" style={{ textAlign: "center", background: "#fef9c3" }}>
              Agent is bootstrapping...
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
        </>
      )}

      {tab === "logs" && (
        <>
          <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              {streaming ? "\u25cf Streaming" : "\u25cb Disconnected"} &middot; {lines.length} lines
            </span>
            <label style={{ fontSize: "0.85rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pinBottom}
                onChange={(e) => setPinBottom(e.target.checked)}
                style={{ width: "auto", display: "inline", margin: "0 0.25rem 0 0" }}
              />
              Auto-scroll
            </label>
          </div>
          <div ref={termRef} className="terminal">
            {lines.length === 0 ? (
              <div style={{ color: "#6b7280" }}>Waiting for log data...</div>
            ) : (
              lines.map((line, i) => (
                <div key={i} className="log-line" style={{ color: LEVEL_COLORS[line.level] }}>
                  {line.time && (
                    <span style={{ color: TIME_COLOR, marginRight: "0.75rem", userSelect: "none" }}>
                      {line.time}
                    </span>
                  )}
                  <span>{line.text}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === "files" && (
        <>
          <div className="file-toolbar">
            <button className="file-nav-btn" onClick={navigateUp} disabled={filePath === "."}>
              ..
            </button>
            <span className="file-path">/{filePath === "." ? "" : filePath}</span>
            {selectedFile && (
              <button
                className="file-nav-btn"
                onClick={() => setSelectedFile(null)}
              >
                Back to list
              </button>
            )}
          </div>

          {!selectedFile ? (
            <div className="file-list">
              {loadingFiles ? (
                <div className="file-empty">Loading...</div>
              ) : entries.length === 0 ? (
                <div className="file-empty">Empty directory</div>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.name}
                    className="file-entry"
                    onClick={() => openEntry(entry)}
                  >
                    <span className="file-icon">{entry.type === "dir" ? "\ud83d\udcc1" : "\ud83d\udcc4"}</span>
                    <span className="file-name">{entry.name}</span>
                    {entry.type === "file" && entry.size != null && (
                      <span className="file-size">
                        {entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="file-editor">
              <div className="file-editor-header">
                <span className="file-editor-name">{selectedFile}</span>
                <button
                  onClick={saveFile}
                  disabled={!fileEdited || savingFile}
                >
                  {savingFile ? "Saving..." : "Save"}
                </button>
              </div>
              <textarea
                className="file-editor-textarea"
                value={fileContent}
                onChange={(e) => { setFileContent(e.target.value); setFileEdited(true); }}
                spellCheck={false}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
