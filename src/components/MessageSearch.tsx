import { Fragment, useEffect, useState, type FormEvent } from "react";
import type { ConnectionConfig, KafkaMessage, SearchResult } from "../../shared/kafka";
import { api } from "../lib/api";
import { formatBytes, formatTimestamp, truncate } from "../lib/format";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner } from "./ui";

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function downloadJson(topic: string, messages: KafkaMessage[]) {
  const blob = new Blob([JSON.stringify(messages, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${topic}-messages.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MessageSearch({ config, topic }: { config: ConnectionConfig; topic: string }) {
  const [keyFilter, setKeyFilter] = useState("");
  const [valueFilter, setValueFilter] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [partition, setPartition] = useState<string>("");
  const [limit, setLimit] = useState("100");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [valueMode, setValueMode] = useState<"text" | "base64">("text");

  const [partitions, setPartitions] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listPartitions(config, topic)
      .then((offsets) => {
        if (!cancelled) setPartitions(offsets.map((o) => o.partition));
      })
      .catch(() => {
        // partition filter is optional; ignore failures
      });
    return () => {
      cancelled = true;
    };
  }, [config, topic]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.searchMessages(config, topic, {
        key: keyFilter,
        value: valueFilter,
        partition: partition === "" ? null : Number(partition),
        startTime: fromLocalInput(fromTime),
        endTime: fromLocalInput(toTime),
        limit: Number(limit) || 100,
        sort,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form onSubmit={handleSearch} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Key contains">
            <Input value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)} placeholder="Substring of key" />
          </Field>
          <Field label="Value contains">
            <Input value={valueFilter} onChange={(e) => setValueFilter(e.target.value)} placeholder="Substring of value" />
          </Field>
          <Field label="From (local time)">
            <Input type="datetime-local" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
          </Field>
          <Field label="To (local time)">
            <Input type="datetime-local" value={toTime} onChange={(e) => setToTime(e.target.value)} />
          </Field>
          <Field label="Partition">
            <Select value={partition} onChange={(e) => setPartition(e.target.value)}>
              <option value="">All partitions</option>
              {partitions.map((p) => (
                <option key={p} value={p}>
                  Partition {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Limit">
            <Select value={limit} onChange={(e) => setLimit(e.target.value)}>
              {[50, 100, 250, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n} messages
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sort by time">
            <Select value={sort} onChange={(e) => setSort(e.target.value as "desc" | "asc")}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={loading} className="w-full" data-testid="search-messages">
              {loading ? (
                <>
                  <Spinner /> Searching…
                </>
              ) : (
                "Search messages"
              )}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-zinc-500">
          With no filters, browsing newest-first reads only from the tail of each partition for fast results. Filtering
          by key/value/time scans from the beginning (capped at 250k messages).
        </p>
      </Card>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <p className="font-medium">Search failed</p>
          <p className="mt-0.5 break-all font-mono text-xs text-red-300/90">{error}</p>
        </div>
      ) : null}

      {result ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <Badge tone="green">
                {result.messages.length} match{result.messages.length === 1 ? "" : "es"}
              </Badge>
              <span>scanned {result.scanned.toLocaleString()} · {result.durationMs} ms</span>
              {result.truncated ? <Badge tone="amber">truncated</Badge> : null}
              <button
                type="button"
                onClick={() => setValueMode((m) => (m === "text" ? "base64" : "text"))}
                className="rounded-md border border-zinc-700 px-2 py-0.5 font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Value: {valueMode === "text" ? "Text" : "Base64"}
              </button>
              <button
                type="button"
                onClick={() => downloadJson(topic, result.messages)}
                className="rounded-md border border-zinc-700 px-2 py-0.5 font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Export JSON
              </button>
            </div>
          </div>

          {result.messages.length === 0 ? (
            <EmptyState title="No messages matched" detail="Try widening the time range or removing filters." />
          ) : (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-2.5 font-medium">Time (UTC)</th>
                    <th className="px-4 py-2.5 font-medium">Partition</th>
                    <th className="px-4 py-2.5 font-medium">Offset</th>
                    <th className="px-4 py-2.5 font-medium">Key</th>
                    <th className="px-4 py-2.5 font-medium">Value</th>
                    <th className="px-4 py-2.5 font-medium">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {result.messages.map((m) => {
                    const id = `${m.partition}-${m.offset}`;
                    const isOpen = expanded === id;
                    const displayValue =
                      valueMode === "base64"
                        ? m.valueBase64 ?? "(null)"
                        : m.value ?? "(null)";
                    return (
                      <Fragment key={id}>
                        <tr
                          onClick={() => setExpanded(isOpen ? null : id)}
                          className="cursor-pointer border-b border-zinc-800/60 align-top transition-colors hover:bg-zinc-800/40"
                        >
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-zinc-400">
                            {formatTimestamp(m.timestamp)}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{m.partition}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{m.offset}</td>
                          <td className="max-w-[220px] break-all px-4 py-2.5 font-mono text-xs text-sky-200/90">
                            {m.key ?? <span className="text-zinc-600">null</span>}
                          </td>
                          <td className="max-w-[360px] break-all px-4 py-2.5 font-mono text-xs text-zinc-200">
                            {truncate(displayValue)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">
                            {formatBytes(m.size)}
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr key={`${id}-detail`} className="border-b border-zinc-800/60 bg-zinc-900/70">
                            <td colSpan={6} className="px-4 py-3">
                              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                                Full value
                              </p>
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
                                {displayValue}
                              </pre>
                              {Object.keys(m.headers).length > 0 ? (
                                <>
                                  <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                                    Headers
                                  </p>
                                  <div className="space-y-1">
                                    {Object.entries(m.headers).map(([k, v]) => (
                                      <div key={k} className="flex gap-3 font-mono text-xs">
                                        <span className="shrink-0 font-semibold text-amber-200/80">{k}</span>
                                        <span className="break-all text-zinc-300">{v}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
