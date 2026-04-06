"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/api";

type Agent = {
  id: string;
  name: string;
  status: string;
};

type LogLine = {
  time: string;
  text: string;
  level: "info" | "warn" | "error" | "system";
};

/** Strip journald prefix and extract the meaningful part of each log line. */
function parseLine(raw: string): LogLine {
  // journald format: "2026-04-06T11:49:15+09:00 HOSTNAME process[PID]: <message>"
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

    // openclaw logs often embed their own timestamp — strip it
    const innerMatch = text.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+\S*\s+(.*)$/);
    if (innerMatch) {
      text = innerMatch[1];
    }
  } else {
    time = "";
    text = raw;
  }

  // Determine log level
  let level: LogLine["level"] = "info";
  if (source === "systemd") {
    level = "system";
  } else if (/error|failed|fatal/i.test(text)) {
    level = "error";
  } else if (/warn|anomaly/i.test(text)) {
    level = "warn";
  }

  return { time, text, level };
}

const LEVEL_COLORS: Record<LogLine["level"], string> = {
  info: "#e0e0e0",
  warn: "#fbbf24",
  error: "#f87171",
  system: "#60a5fa",
};

const TIME_COLOR = "#6b7280";

export default function AgentLogsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pinBottom, setPinBottom] = useState(true);
  const termRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api<Agent>(`/agents/${id}`)
      .catch(() => {
        clearToken();
        router.push("/login");
        return null;
      })
      .then((a) => {
        if (a) setAgent(a);
      });
  }, [id, router]);

  useEffect(() => {
    if (!agent) return;

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
        if (!res.ok || !res.body) {
          setStreaming(false);
          return;
        }
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
            if (part.startsWith("data: ")) {
              newLines.push(parseLine(part.slice(6)));
            }
          }
          if (newLines.length > 0) {
            setLines((prev) => [...prev, ...newLines]);
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
  }, [agent, id]);

  useEffect(() => {
    if (pinBottom && termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines, pinBottom]);

  if (!agent) return <p>Loading...</p>;

  return (
    <section>
      <div className="nav">
        <h1>{agent.name || "Agent"} — Logs</h1>
        <div className="link-row">
          <span className={`status status-${agent.status}`}>{agent.status}</span>
          <a href={`/agents/${id}`}>Chat</a>
          <a href="/dashboard">Dashboard</a>
        </div>
      </div>

      <div
        style={{
          marginBottom: "0.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          {streaming ? "\u25cf Streaming" : "\u25cb Disconnected"} &middot;{" "}
          {lines.length} lines
        </span>
        <label style={{ fontSize: "0.85rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={pinBottom}
            onChange={(e) => setPinBottom(e.target.checked)}
            style={{
              width: "auto",
              display: "inline",
              margin: "0 0.25rem 0 0",
            }}
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
    </section>
  );
}
