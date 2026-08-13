import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionConfig, ConsumerGroupInfo, ResetOffsetsResult, ResetPosition } from "../../shared/kafka";
import { api } from "../lib/api";
import { Badge, Button, Card, EmptyState, Input, Spinner } from "./ui";

const REFRESH_MS = 5_000;

function stateTone(state: string): "green" | "amber" | "red" | "default" {
  switch (state) {
    case "Stable":
      return "green";
    case "PreparingRebalance":
    case "CompletingRebalance":
      return "amber";
    case "Dead":
    case "Empty":
      return "red";
    default:
      return "default";
  }
}

function formatUpdated(ts: number | null): string {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  return s < 2 ? "just now" : `${s}s ago`;
}

function ResetOffsetsDialog({
  config,
  topic,
  group,
  onClose,
  onDone,
}: {
  config: ConnectionConfig;
  topic: string;
  group: ConsumerGroupInfo;
  onClose: () => void;
  onDone: () => void;
}) {
  const [position, setPosition] = useState<ResetPosition>("beginning");
  const [timestamp, setTimestamp] = useState("");
  const [offset, setOffset] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetOffsetsResult | null>(null);

  async function handleReset() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.resetOffsets(config, topic, group.groupId, {
        position,
        timestamp: position === "timestamp" && timestamp ? new Date(timestamp).getTime() : null,
        offset: position === "offset" ? Number(offset) : null,
      });
      setResult(res);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const options: Array<{ value: ResetPosition; label: string; hint: string }> = [
    { value: "beginning", label: "Earliest", hint: "Reset to the first available message (log start offset)." },
    { value: "end", label: "Latest", hint: "Skip all existing messages; consume only new ones." },
    { value: "timestamp", label: "Timestamp", hint: "Reset to the first message at or after the given time." },
    { value: "offset", label: "Custom offset", hint: "Reset every partition to the given offset (clamped to the log range)." },
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-zinc-950/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <div className="mb-1 flex items-start justify-between gap-4">
            <h3 className="text-base font-semibold text-zinc-100">Reset offsets</h3>
            <Button variant="ghost" onClick={onClose} className="px-2" aria-label="Close">
              ✕
            </Button>
          </div>
          <p className="mb-4 break-all font-mono text-xs text-zinc-400">
            {group.groupId} · {topic}
          </p>

          {result ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                <p className="font-medium">Offsets reset</p>
                <p className="mt-0.5 text-emerald-300/80">
                  {result.partitions.length} partition{result.partitions.length === 1 ? "" : "s"} updated
                </p>
              </div>
              <div className="max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="py-1 pr-4 font-medium">Partition</th>
                      <th className="py-1 pr-4 font-medium">Previous</th>
                      <th className="py-1 font-medium">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.partitions.slice(0, 20).map((p) => (
                      <tr key={p.partition} className="text-zinc-300">
                        <td className="py-1 pr-4">{p.partition}</td>
                        <td className="py-1 pr-4">{p.previousOffset >= 0 ? p.previousOffset : "—"}</td>
                        <td className="py-1 text-amber-200">{p.newOffset}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button type="button" onClick={onClose} className="w-full">
                Done
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {options.map((o) => (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      position === o.value
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reset-position"
                      value={o.value}
                      checked={position === o.value}
                      onChange={() => setPosition(o.value)}
                      className="mt-0.5 accent-amber-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-zinc-200">{o.label}</span>
                      <span className="block text-xs text-zinc-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              {position === "timestamp" ? (
                <Input
                  type="datetime-local"
                  value={timestamp}
                  onChange={(e) => setTimestamp(e.target.value)}
                  className="mt-3"
                />
              ) : null}
              {position === "offset" ? (
                <Input
                  type="number"
                  min={0}
                  value={offset}
                  onChange={(e) => setOffset(e.target.value)}
                  placeholder="Offset (e.g. 1000)"
                  className="mt-3"
                />
              ) : null}

              {error ? (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  <p className="break-all font-mono text-xs">{error}</p>
                </div>
              ) : null}

              <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-200/80">
                This rewrites the committed offsets for this group on this topic. Active consumers will pick up the
                new position on their next fetch — consumption may duplicate or skip messages.
              </p>

              <div className="mt-3 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" data-testid="confirm-reset" onClick={handleReset} disabled={busy || (position === "timestamp" && !timestamp) || (position === "offset" && offset === "")}>
                  {busy ? (
                    <>
                      <Spinner /> Resetting…
                    </>
                  ) : (
                    "Reset offsets"
                  )}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export function ConsumerGroups({ config, topic }: { config: ConnectionConfig; topic: string }) {
  const [groups, setGroups] = useState<ConsumerGroupInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<ConsumerGroupInfo | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await api.listConsumerGroups(config, topic);
      setGroups(next);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
    }
  }, [config, topic]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span data-testid="live-badge" className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </span>
          <span>updates every 5s · updated {formatUpdated(lastUpdated)}</span>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={inFlight.current}>
          {inFlight.current ? <Spinner /> : "Refresh"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <p className="font-medium">Could not load consumer groups</p>
          <p className="mt-0.5 break-all font-mono text-xs text-red-300/90">{error}</p>
        </div>
      ) : null}

      {!groups && !error ? (
        <div className="flex items-center justify-center py-14">
          <Spinner className="h-6 w-6" />
        </div>
      ) : groups && groups.length === 0 ? (
        <EmptyState
          title="No consumer groups found"
          detail="No consumer group currently subscribes to this topic (groups with a committed offset or active members are listed)."
        />
      ) : groups ? (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Group ID</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Members</th>
                <th className="px-4 py-3 font-medium">Lag</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.groupId} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40">
                  <td className="px-4 py-3 font-mono text-[13px] text-amber-200/90">{g.groupId}</td>
                  <td className="px-4 py-3">
                    <Badge tone={stateTone(g.state)}>{g.state}</Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{g.members}</td>
                  <td className={`px-4 py-3 font-mono text-[13px] ${g.lag > 0 ? "text-red-300" : "text-emerald-300"}`}>
                    {g.lag.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      className="text-xs"
                      data-testid={`reset-${g.groupId}`}
                      onClick={() => setResetTarget(g)}
                    >
                      Reset offsets
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {resetTarget ? (
        <ResetOffsetsDialog
          config={config}
          topic={topic}
          group={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => void load()}
        />
      ) : null}
    </div>
  );
}
