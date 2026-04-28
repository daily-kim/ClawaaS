"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/api";

type Agent = {
  id: string;
  name: string;
  status: string;
  bootstrap_text?: string | null;
};

type Message = {
  id: string;
  role: "user" | "agent" | "activity";
  text: string;
  items?: string[];
  state?: "streaming" | "done" | "error";
};

type LogLine = {
  time: string;
  text: string;
  level: "info" | "warn" | "error" | "system";
};

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(start));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function summarizeLogText(text: string): string | null {
  const compact = text.trim();
  if (!compact || compact === "READY") return null;

  if (compact.startsWith("Response:")) {
    const parsed = extractJsonObject(compact);
    const result = parsed?.result;
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const payloads = (result as Record<string, unknown>).payloads;
      if (Array.isArray(payloads)) {
        const texts = payloads
          .filter((payload): payload is Record<string, unknown> => !!payload && typeof payload === "object")
          .map((payload) => (typeof payload.text === "string" ? payload.text.trim() : ""))
          .filter(Boolean);
        if (texts.length > 0) {
          const chars = texts.join("\n").length;
          return `LLM response received (${chars} chars)`;
        }
      }
      const statusText = ["summary", "status", "message", "detail"]
        .map((key) => (typeof (result as Record<string, unknown>)[key] === "string" ? String((result as Record<string, unknown>)[key]).trim() : ""))
        .find(Boolean);
      if (statusText) return `LLM status: ${statusText}`;
    }
    return "LLM response received";
  }

  const parsed = extractJsonObject(compact);
  if (parsed) {
    const result = parsed.result;
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const payloads = (result as Record<string, unknown>).payloads;
      if (Array.isArray(payloads) && payloads.length > 0) return "LLM response chunk received";
    }
    const statusText = ["summary", "status", "message", "detail"]
      .map((key) => (typeof parsed[key] === "string" ? String(parsed[key]).trim() : ""))
      .find(Boolean);
    if (statusText) return `LLM status: ${statusText}`;
    return "LLM event received";
  }

  if (/tool|function call|running command|exec/i.test(compact)) return "Tool activity reported";
  if (/Sending bootstrap message via openclaw agent/i.test(compact)) return "Bootstrap turn started";
  if (/Bootstrapping .* via gateway on port/i.test(compact)) return compact.replace(/^Bootstrapping\s+/, "Bootstrapping ");
  if (/Waiting for gateway to be reachable/i.test(compact)) return "Waiting for gateway";
  if (/Gateway reachable/i.test(compact)) return "Gateway reachable";
  if (/Bootstrap response captured/i.test(compact)) return "Bootstrap response stored";

  return compact;
}

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
  text = summarizeLogText(text) || "";
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

type ChatStreamUpdate = {
  kind: "message" | "tool" | "status";
  text: string;
};

type ChatStreamDone = {
  text?: string;
  summary?: string;
  had_reply?: boolean;
  exit_code?: number;
};

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<Message>;
    if ((item.role !== "user" && item.role !== "agent" && item.role !== "activity") || typeof item.text !== "string") {
      return [];
    }
    return [{
      id: typeof item.id === "string" ? item.id : makeId(),
      role: item.role,
      text: item.text,
      items: Array.isArray(item.items) ? item.items.filter((value): value is string => typeof value === "string") : undefined,
      state: item.state === "streaming" || item.state === "done" || item.state === "error" ? item.state : undefined,
    }];
  });
}

function appendUnique(items: string[], text: string) {
  if (!text.trim() || items.includes(text)) return items;
  return [...items, text];
}

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>("chat");

  // Chat state
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return normalizeMessages(JSON.parse(localStorage.getItem(`chat:${id}`) || "[]"));
    } catch {
      return [];
    }
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
  const [filesError, setFilesError] = useState("");
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
          `/api/agents/${id}/logs?since=30m`,
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
            if (!part.startsWith("data: ")) continue;
            const parsed = parseLine(part.slice(6));
            if (!parsed.text) continue;
            const previous = newLines[newLines.length - 1];
            if (previous && previous.text === parsed.text && previous.level === parsed.level) continue;
            newLines.push(parsed);
          }
          if (newLines.length > 0) {
            setLines((prev) => {
              const merged = [...prev];
              for (const line of newLines) {
                const previous = merged[merged.length - 1];
                if (previous && previous.text === line.text && previous.level === line.level) continue;
                merged.push(line);
              }
              return merged;
            });
          }
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
    setFilesError("");
    api<FileEntry[]>(`/agents/${id}/files?path=${encodeURIComponent(filePath)}`)
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEntries([]);
          setFilesError(err instanceof Error ? err.message : "Failed to load files");
        }
      })
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!agent || agent.status !== "ready") return;
    if (messages.length > 0) return;
    if (!agent.bootstrap_text?.trim()) return;

    const welcome = {
      id: makeId(),
      role: "agent" as const,
      text: agent.bootstrap_text,
    };
    setMessages([welcome]);
  }, [agent, messages.length]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const message = (form.get("message") as string).trim();
    if (!message) return;

    const userMessage: Message = { id: makeId(), role: "user", text: message };
    const activityId = makeId();
    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: activityId,
        role: "activity",
        text: "Agent is working...",
        items: [],
        state: "streaming",
      },
    ]);
    e.currentTarget.reset();
    setSending(true);

    try {
      const token = getToken();
      const res = await fetch(
        `/api/agents/${id}/chat/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message }),
        }
      );

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status} ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      let finalSummary = "";
      let activityItems: string[] = [];

      const updateActivity = (text: string, state: Message["state"] = "streaming") => {
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== activityId || msg.role !== "activity") return msg;
          return { ...msg, text, items: activityItems, state };
        }));
      };

      const handleSsePart = (part: string) => {
        const lines = part.split("\n");
        let event = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (!data) return;

        if (event === "update") {
          const parsed = JSON.parse(data) as ChatStreamUpdate;
          if (parsed.kind === "message") {
            finalText = parsed.text.trim();
          } else {
            activityItems = appendUnique(activityItems, parsed.text.trim());
            finalSummary = parsed.text.trim() || finalSummary;
            updateActivity(parsed.text.trim(), "streaming");
          }
          return;
        }

        if (event === "done") {
          const parsed = JSON.parse(data) as ChatStreamDone;
          finalText = parsed.text?.trim() || finalText;
          finalSummary = parsed.summary?.trim() || finalSummary;
          return;
        }

        if (event === "error") {
          const parsed = JSON.parse(data) as { detail?: string };
          const detail = parsed.detail?.trim() || "Chat failed";
          activityItems = appendUnique(activityItems, detail);
          updateActivity(detail, "error");
          throw new Error(detail);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          handleSsePart(part);
        }
      }

      if (buffer.trim()) handleSsePart(buffer);

      setMessages((prev) => {
        const shouldKeepActivity = activityItems.length > 0 || !finalText;
        const next = shouldKeepActivity
          ? prev.map((msg) => {
              if (msg.id !== activityId || msg.role !== "activity") return msg;
              return {
                ...msg,
                text: finalSummary || msg.text || "No reply from agent.",
                items: activityItems,
                state: "done",
              };
            })
          : prev.filter((msg) => msg.id !== activityId);

        next.push({
          id: makeId(),
          role: "agent",
          text: finalText || finalSummary || "No reply from agent.",
        });
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Chat failed");
      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== activityId || msg.role !== "activity") return msg;
        return {
          ...msg,
          text: msg.text || "Chat failed",
          state: "error",
        };
      }));
    } finally {
      setSending(false);
    }
  }

  if (!agent) return <p className="loading-state">Loading agent workspace...</p>;

  return (
    <section className="agent-shell">
      <div className="topbar">
        <div className="topbar-copy">
          <span className="eyebrow">Agent Workspace</span>
          <h1>{agent.name || "Agent"}</h1>
          <p className="muted">Inspect runtime state, then use chat, logs, or files as needed.</p>
          <div className="topbar-meta">
            <div className="meta-chip">
              <span className="meta-label">Status</span>
              <strong>{agent.status}</strong>
            </div>
            <div className="meta-chip">
              <span className="meta-label">Chat messages</span>
              <strong>{messages.length}</strong>
            </div>
            <div className="meta-chip">
              <span className="meta-label">Log lines</span>
              <strong>{lines.length}</strong>
            </div>
            <div className="meta-chip">
              <span className="meta-label">Current path</span>
              <strong>{filePath === "." ? "/" : filePath}</strong>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`status status-${agent.status}`}>{agent.status}</span>
          <a className="text-link" href="/dashboard">Back to dashboard</a>
        </div>
      </div>

      <div className="card">
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
      </div>

      {tab === "chat" && (
        <div className="card">
          <div className="panel-header">
            <div className="card-title">
              <h3>Conversation</h3>
              <p className="muted">Use chat when you want agent output, not as the only control surface.</p>
            </div>
          </div>

          {agent.status === "bootstrapping" && (
            <div className="notice">
              Agent is bootstrapping. Chat will unlock when the runtime reports ready.
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <div className="chat-messages">
            {messages.map((msg) => (
              msg.role === "activity" ? (
                <details key={msg.id} className={`msg msg-activity msg-activity-${msg.state || "done"}`}>
                  <summary>
                    <strong>Agent Updates</strong>
                    <span>{msg.state === "streaming" ? "Updating..." : msg.text}</span>
                  </summary>
                  <div className="msg-activity-body">
                    {(msg.items && msg.items.length > 0 ? msg.items : [msg.text]).map((item, itemIndex) => (
                      <p key={`${msg.id}-${itemIndex}`} style={{ whiteSpace: "pre-wrap" }}>{item}</p>
                    ))}
                  </div>
                </details>
              ) : (
                <div key={msg.id} className={`msg msg-${msg.role}`}>
                  <strong>{msg.role === "user" ? "You" : "Agent"}</strong>
                  <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>
                </div>
              )
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
            <div className="chat-actions">
              <button type="submit" disabled={agent.status !== "ready" || sending}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === "logs" && (
        <div className="card">
          <div className="panel-header">
            <div className="card-title">
              <h3>Runtime logs</h3>
              <p className="muted">Inspect stream output from the sandbox process.</p>
            </div>
            <span className="pill">
              {streaming ? "\u25cf Streaming" : "\u25cb Disconnected"} &middot; {lines.length} lines
            </span>
          </div>
          <div className="panel-header" style={{ marginBottom: "0.75rem" }}>
            <label className="muted" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pinBottom}
                onChange={(e) => setPinBottom(e.target.checked)}
                style={{ width: "auto", display: "inline", margin: "0 0.35rem 0 0" }}
              />
              Auto-scroll
            </label>
          </div>
          <div ref={termRef} className="terminal">
            {lines.length === 0 ? (
              <div style={{ color: "#8a816f" }}>Waiting for log data...</div>
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
        </div>
      )}

      {tab === "files" && (
        <div className="card">
          <div className="panel-header">
            <div className="card-title">
              <h3>Sandbox files</h3>
              <p className="muted">Browse directories and edit individual files in place.</p>
            </div>
          </div>

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
              ) : filesError ? (
                <div className="file-empty">{filesError}</div>
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
        </div>
      )}
    </section>
  );
}
