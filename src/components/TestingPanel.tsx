import { useEffect, useState } from "react";
import type {
  ConnectionConfig,
  ConsumerGroupInfo,
  LoadTestResult,
  ProduceResult,
  ResetOffsetsResult,
} from "../../shared/kafka";
import { renderTemplate } from "../../shared/template";
import { api } from "../lib/api";
import { Badge, Button, Card, Field, Input, Select, Spinner, Textarea } from "./ui";

const PLACEHOLDERS: Array<{ token: string; desc: string }> = [
  { token: "{{i}}", desc: "message index (0-based)" },
  { token: "{{ts}}", desc: "epoch ms at generation time" },
  { token: "{{ts_iso}}", desc: "ISO-8601 timestamp" },
  { token: "{{uuid}}", desc: "random UUID v4" },
  { token: "{{rand}}", desc: "random 0–999999" },
  { token: "{{rand:100}}", desc: "random 0–99" },
  { token: "{{randstr:8}}", desc: "random alphanumeric, length 8" },
];

const DEFAULT_PAYLOAD = `{
  "orderId": "ord-{{i}}",
  "sku": "KB-2041",
  "qty": {{rand:10}},
  "total": {{rand:1000}}.99,
  "status": "paid",
  "userId": "user-{{i}}",
  "eventTime": "{{ts_iso}}"
}`;

function parseHeaders(raw: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sectionTitle(title: string, hint: string) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

// ---------- 1. Produce a single message ----------

function ProduceCard({ config, topic }: { config: ConnectionConfig; topic: string }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [partition, setPartition] = useState("");
  const [headers, setHeaders] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProduceResult | null>(null);

  async function handleProduce() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.produceMessage(config, topic, {
        key: key || undefined,
        value: value || undefined,
        partition: partition === "" ? undefined : Number(partition),
        headers: parseHeaders(headers),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4">{sectionTitle("Produce a message", "Write one message to this topic for testing.")}</div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Key" hint="Optional. Leave empty for a null key.">
          <Input
            data-testid="produce-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="order-90001"
            className="font-mono"
          />
        </Field>
        <Field label="Partition" hint="Optional — default: round-robin.">
          <Input
            data-testid="produce-partition"
            type="number"
            min={0}
            value={partition}
            onChange={(e) => setPartition(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Headers" hint="One `key: value` per line. Optional.">
          <Input
            data-testid="produce-headers"
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            placeholder="event-type: test.message"
            className="font-mono"
          />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Value" hint="Leave empty to write a tombstone (null value).">
          <Textarea
            data-testid="produce-value"
            rows={4}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='{"orderId":"order-90001","qty":1,"status":"paid"}'
            className="font-mono"
          />
        </Field>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <p className="break-all font-mono text-xs">{error}</p>
        </div>
      ) : null}
      {result ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <p className="font-medium">Produced successfully</p>
          <p className="mt-0.5 break-all font-mono text-xs text-emerald-300/90" data-testid="produce-result">
            topic {result.topic} → partition {result.partition}, offset {result.offset}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-end">
        <Button
          data-testid="produce-button"
          onClick={handleProduce}
          disabled={busy || (!key && !value)}
        >
          {busy ? (
            <>
              <Spinner /> Producing…
            </>
          ) : (
            "Produce message"
          )}
        </Button>
      </div>
    </Card>
  );
}

// ---------- 2. Load test: generate & post data from a template ----------

function LoadTestCard({ config, topic }: { config: ConnectionConfig; topic: string }) {
  const [count, setCount] = useState("100");
  const [rate, setRate] = useState("");
  const [partition, setPartition] = useState("");
  const [keyTemplate, setKeyTemplate] = useState("ord-{{i}}");
  const [valueTemplate, setValueTemplate] = useState(DEFAULT_PAYLOAD);
  const [headers, setHeaders] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoadTestResult | null>(null);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setElapsed((s) => s + 0.5), 500);
    return () => clearInterval(id);
  }, [busy]);

  async function handlePreview() {
    try {
      const key = keyTemplate ? renderTemplate(keyTemplate, 0) : "(no key)";
      const value = renderTemplate(valueTemplate, 0);
      setPreview(`key:    ${key}\nvalue:  ${value}`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleStart() {
    setBusy(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    try {
      const res = await api.runLoadTest(config, {
        topic,
        count: Number(count) || 100,
        keyTemplate,
        valueTemplate,
        partition: partition === "" ? undefined : Number(partition),
        headers: parseHeaders(headers),
        ratePerSecond: rate === "" ? undefined : Number(rate),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const total = Number(count) || 100;

  return (
    <Card className="p-5">
      <div className="mb-4">
        {sectionTitle(
          "Generate & post test data (load test)",
          "Give a sample payload with {{placeholders}}; changing parameters are substituted per message."
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <Badge key={p.token} tone="amber">
              <span title={p.desc}>
                <code>{p.token}</code>
              </span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Message count" hint="1 – 100,000.">
          <Input
            data-testid="loadtest-count"
            type="number"
            min={1}
            max={100000}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </Field>
        <Field label="Rate (msg/sec)" hint="Empty = as fast as possible.">
          <Input
            data-testid="loadtest-rate"
            type="number"
            min={1}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 1000"
          />
        </Field>
        <Field label="Partition" hint="Optional — default: round-robin.">
          <Input
            data-testid="loadtest-partition"
            type="number"
            min={0}
            value={partition}
            onChange={(e) => setPartition(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Field label="Key template" hint="Rendered per message (may be empty).">
          <Input
            data-testid="loadtest-key-template"
            value={keyTemplate}
            onChange={(e) => setKeyTemplate(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field label="Headers" hint="Static headers on every message. `key: value` per line.">
          <Input
            data-testid="loadtest-headers"
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            placeholder="event-type: test.bulk"
            className="font-mono"
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Sample payload template" hint="Start from your real payload and swap in placeholders.">
          <Textarea
            data-testid="loadtest-value-template"
            rows={7}
            value={valueTemplate}
            onChange={(e) => setValueTemplate(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" data-testid="loadtest-preview-button" onClick={handlePreview}>
          Preview first message
        </Button>
        <Button
          data-testid="loadtest-start"
          onClick={handleStart}
          disabled={busy || !valueTemplate.trim()}
        >
          {busy ? (
            <>
              <Spinner /> Sending {total.toLocaleString()} messages… ({elapsed.toFixed(1)}s)
            </>
          ) : (
            `Generate & post ${total.toLocaleString()} messages`
          )}
        </Button>
      </div>

      {preview ? (
        <pre
          data-testid="loadtest-preview-output"
          className="mt-4 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300"
        >
          {preview}
        </pre>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <p className="break-all font-mono text-xs">{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3" data-testid="loadtest-result">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            <p className="font-medium">
              Produced {result.produced.toLocaleString()} messages in {(result.durationMs / 1000).toFixed(2)}s
              ({result.messagesPerSecond.toLocaleString()} msg/s)
            </p>
            <p className="mt-0.5 font-mono text-xs text-emerald-300/80">topic: {result.topic}</p>
          </div>
          <div className="max-h-52 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="text-zinc-500">
                  <th className="py-1 pr-4 font-medium">Partition</th>
                  <th className="py-1 pr-4 font-medium">First offset</th>
                  <th className="py-1 pr-4 font-medium">Last offset</th>
                  <th className="py-1 font-medium">Messages</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.partitions)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([p, stat]) => (
                    <tr key={p} className="text-zinc-300">
                      <td className="py-1 pr-4">{p}</td>
                      <td className="py-1 pr-4">{stat.firstOffset}</td>
                      <td className="py-1 pr-4 text-amber-200">{stat.lastOffset}</td>
                      <td className="py-1">{stat.count.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- 3. Consumer group offset actions (test helpers) ----------

function GroupResetCard({ config, topic }: { config: ConnectionConfig; topic: string }) {
  const [groups, setGroups] = useState<ConsumerGroupInfo[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [offset, setOffset] = useState("");
  const [busy, setBusy] = useState<"beginning" | "end" | "offset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetOffsetsResult | null>(null);

  async function loadGroups() {
    setError(null);
    try {
      const list = await api.listConsumerGroups(config, topic);
      setGroups(list);
      if (list.length > 0) setGroupId((g) => g || list[0].groupId);
    } catch (err) {
      setGroups([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, topic]);

  async function handleReset(position: "beginning" | "end" | "offset") {
    if (!groupId) return;
    setBusy(position);
    setError(null);
    setResult(null);
    try {
      const res = await api.resetOffsets(config, topic, groupId, {
        position,
        offset: position === "offset" ? Number(offset) : null,
      });
      setResult(res);
      void loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4">
        {sectionTitle(
          "Consumer group test actions",
          "Move a group's committed offset — handy for replaying messages or clearing lag."
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Consumer group" hint="Groups subscribed to this topic.">
          {groups === null ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Spinner className="h-4 w-4" /> Loading groups…
            </div>
          ) : groups.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-500">
              No consumer groups found for this topic — use the Consumer groups tab to see them.
            </p>
          ) : (
            <Select data-testid="group-select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  {g.groupId} (lag {g.lag.toLocaleString()})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Custom offset" hint="Set every partition to this offset (clamped to the log range).">
          <Input
            data-testid="group-reset-offset"
            type="number"
            min={0}
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
            placeholder="e.g. 1000"
            disabled={!groupId}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          data-testid="group-reset-earliest"
          onClick={() => void handleReset("beginning")}
          disabled={!groupId || busy !== null}
        >
          {busy === "beginning" ? <Spinner /> : null} Reset to earliest
        </Button>
        <Button
          variant="secondary"
          data-testid="group-reset-latest"
          onClick={() => void handleReset("end")}
          disabled={!groupId || busy !== null}
        >
          {busy === "end" ? <Spinner /> : null} Clear lag (reset to latest)
        </Button>
        <Button
          data-testid="group-reset-custom"
          onClick={() => void handleReset("offset")}
          disabled={!groupId || offset === "" || busy !== null}
        >
          {busy === "offset" ? <Spinner /> : null} Set custom offset
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <p className="break-all font-mono text-xs">{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-2" data-testid="group-reset-result">
          <p className="text-sm text-emerald-200">
            <span className="font-medium">{result.groupId}</span> · {result.partitions.length} partitions updated
          </p>
          <div className="max-h-40 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
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
        </div>
      ) : null}

      <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-200/80">
        Reset rewrites the committed offsets for this group on this topic. Active consumers pick up the new position
        on their next fetch — consumption may duplicate or skip messages. This writes to your cluster.
      </p>
    </Card>
  );
}

// ---------- Panel ----------

export function TestingPanel({ config, topic }: { config: ConnectionConfig; topic: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Badge tone="red">WRITES</Badge>
        <span>
          The Testing tab <span className="font-medium text-zinc-200">produces messages</span> and rewrites offsets on
          topic <code className="font-mono text-amber-200/90">{topic}</code> — use with care.
        </span>
      </div>
      <ProduceCard config={config} topic={topic} />
      <LoadTestCard config={config} topic={topic} />
      <GroupResetCard config={config} topic={topic} />
    </div>
  );
}
