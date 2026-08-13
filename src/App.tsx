import { useCallback, useEffect, useState } from "react";
import type { ConnectionConfig, TopicInfo } from "../shared/kafka";
import { api } from "./lib/api";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { TopicDetail } from "./components/TopicDetail";
import { TopicsView } from "./components/TopicsView";
import { Badge, Button } from "./components/ui";

const STORAGE_KEY = "kafka-explorer-config";

function loadConfig(): ConnectionConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConnectionConfig) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [config, setConfig] = useState<ConnectionConfig | null>(() => loadConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<{ kind: "topics" } | { kind: "topic"; name: string }>({ kind: "topics" });
  const [topics, setTopics] = useState<TopicInfo[] | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const loadTopics = useCallback(async (cfg: ConnectionConfig) => {
    setTopicsLoading(true);
    setTopicsError(null);
    try {
      setTopics(await api.listTopics(cfg));
    } catch (err) {
      setTopicsError(err instanceof Error ? err.message : String(err));
      setTopics(null);
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (config) void loadTopics(config);
  }, [config, loadTopics]);

  // Auto-cancel an armed disconnect confirmation after a few seconds.
  useEffect(() => {
    if (!confirmingDisconnect) return;
    const id = setTimeout(() => setConfirmingDisconnect(false), 3500);
    return () => clearTimeout(id);
  }, [confirmingDisconnect]);

  function handleDisconnect() {
    setConfig(null);
    setTopics(null);
    setTopicsError(null);
    setView({ kind: "topics" });
    setShowSettings(false);
    setConfirmingDisconnect(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable; nothing to clear
    }
  }

  function handleSaved(next: ConnectionConfig) {
    setConfig(next);
    setShowSettings(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable; keep config in memory for this session
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 font-mono text-lg font-bold text-zinc-950">
              K
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Kafka Explorer</h1>
              <p className="text-[11px] text-zinc-500">Browse topics · consumer groups · search messages</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {config ? (
              <Badge tone={topicsError ? "red" : "green"}>
                <span className={`h-1.5 w-1.5 rounded-full ${topicsError ? "bg-red-400" : "bg-emerald-400"}`} />
                {topicsError ? "connection error" : "connected"}
              </Badge>
            ) : (
              <Badge tone="default">not connected</Badge>
            )}
            {config ? (
              <Button
                variant={confirmingDisconnect ? "danger" : "secondary"}
                data-testid="disconnect"
                onClick={() => {
                  if (confirmingDisconnect) {
                    handleDisconnect();
                  } else {
                    setConfirmingDisconnect(true);
                  }
                }}
              >
                {confirmingDisconnect ? "Confirm disconnect?" : "Disconnect"}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setShowSettings(true)} disabled={!config}>
              Connection settings
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {!config ? (
          <ConnectionPanel
            initial={null}
            onSaved={handleSaved}
          />
        ) : view.kind === "topic" ? (
          <TopicDetail config={config} topic={view.name} onBack={() => setView({ kind: "topics" })} />
        ) : (
          <TopicsView
            topics={topics}
            loading={topicsLoading}
            error={topicsError}
            onRefresh={() => void loadTopics(config)}
            onOpenTopic={(name) => setView({ kind: "topic", name })}
          />
        )}
      </main>

      <footer className="border-t border-zinc-800/60 py-4">
        <p className="mx-auto max-w-6xl px-4 text-center text-xs text-zinc-600">
          Kafka Explorer · connection details are stored in your browser and used only to talk to the local API.
        </p>
      </footer>

      {showSettings && config ? (
        <div
          className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-zinc-950/70 p-4 backdrop-blur-sm"
          onClick={() => setShowSettings(false)}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <ConnectionPanel
              initial={config}
              onSaved={handleSaved}
              onClose={() => setShowSettings(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
