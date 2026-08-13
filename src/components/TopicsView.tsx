import { useMemo, useState } from "react";
import type { TopicInfo } from "../../shared/kafka";
import { Badge, Button, Card, EmptyState, Input, Spinner } from "./ui";

export function TopicsView({
  topics,
  loading,
  error,
  onRefresh,
  onOpenTopic,
}: {
  topics: TopicInfo[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenTopic: (name: string) => void;
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!topics) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.name.toLowerCase().includes(q));
  }, [topics, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Topics</h2>
          <p className="text-sm text-zinc-400">
            {topics ? (
              <>
                {topics.length} topic{topics.length === 1 ? "" : "s"} on this cluster
              </>
            ) : (
              "Loading cluster topics…"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter topics…"
              className="w-56"
            />
          </div>
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            {loading ? <Spinner /> : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <p className="font-medium">Could not load topics</p>
          <p className="mt-0.5 break-all font-mono text-xs text-red-300/90">{error}</p>
        </div>
      ) : null}

      {!topics && !error ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={topics?.length ? "No topics match your filter" : "No topics found"}
          detail={topics?.length ? undefined : "This cluster has no topics yet."}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Topic</th>
                <th className="px-4 py-3 font-medium">Partitions</th>
                <th className="px-4 py-3 font-medium">Replication</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.name}
                  data-testid={`topic-${t.name}`}
                  onClick={() => onOpenTopic(t.name)}
                  className="cursor-pointer border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-800/40"
                >
                  <td className="px-4 py-3 font-mono text-[13px] text-amber-200/90">{t.name}</td>
                  <td className="px-4 py-3 text-zinc-300">{t.partitions}</td>
                  <td className="px-4 py-3 text-zinc-300">{t.replicationFactor}</td>
                  <td className="px-4 py-3">
                    {t.internal ? <Badge>internal</Badge> : <Badge tone="blue">user</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
