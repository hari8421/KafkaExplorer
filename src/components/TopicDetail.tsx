import { useState } from "react";
import type { ConnectionConfig } from "../../shared/kafka";
import { Button } from "./ui";
import { ConsumerGroups } from "./ConsumerGroups";
import { MessageSearch } from "./MessageSearch";
import { TestingPanel } from "./TestingPanel";

export function TopicDetail({
  config,
  topic,
  onBack,
}: {
  config: ConnectionConfig;
  topic: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"messages" | "consumers" | "testing">("messages");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="px-2">
            ←
          </Button>
          <div>
            <h2 className="font-mono text-lg font-semibold text-amber-200/90">{topic}</h2>
            <p className="text-xs text-zinc-500">Topic explorer</p>
          </div>
        </div>
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
          <button
            type="button"
            data-testid="tab-messages"
            onClick={() => setTab("messages")}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === "messages" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Messages
          </button>
          <button
            type="button"
            data-testid="tab-consumers"
            onClick={() => setTab("consumers")}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === "consumers" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Consumer groups
          </button>
          <button
            type="button"
            data-testid="tab-testing"
            onClick={() => setTab("testing")}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === "testing" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Testing
          </button>
        </div>
      </div>

      {tab === "messages" ? (
        <MessageSearch config={config} topic={topic} />
      ) : tab === "consumers" ? (
        <ConsumerGroups config={config} topic={topic} />
      ) : (
        <TestingPanel config={config} topic={topic} />
      )}
    </div>
  );
}
