import { Kafka, type KafkaConfig } from "kafkajs";
import type {
  ClusterInfo,
  ConnectionConfig,
  ConsumerGroupInfo,
  KafkaMessage,
  LoadTestPartitionStat,
  LoadTestResult,
  LoadTestSpec,
  MessageSearchFilters,
  PartitionOffsetInfo,
  ProduceMessageInput,
  ProduceResult,
  SearchResult,
  TopicInfo,
} from "../shared/kafka";
import { renderTemplate } from "../shared/template";

const MAX_SCAN_MESSAGES = 250_000;
const SEARCH_TIMEOUT_MS = 60_000;
const MAX_GROUPS = 150;
const EPHEMERAL_GROUP_PREFIX = "kafka-explorer-";
const MAX_LOAD_MESSAGES = 100_000;
const MAX_BATCH_SIZE = 1_000;
const MAX_RATE_PER_SECOND = 10_000;

type TopicOffset = { partition: number; offset: string; low?: string; high?: string };

export function buildKafkaConfig(cfg: ConnectionConfig): KafkaConfig {
  const base: KafkaConfig = {
    clientId: cfg.clientId?.trim() || "kafka-explorer",
    brokers: cfg.brokers.map((b) => b.trim()).filter(Boolean),
    connectionTimeout: 10_000,
    requestTimeout: 30_000,
    retry: { retries: 2, initialRetryTime: 300, maxRetryTime: 3_000 },
  };

  if (cfg.ssl.enabled) {
    base.ssl = {
      ca: cfg.ssl.ca?.trim() ? [cfg.ssl.ca] : undefined,
      cert: cfg.ssl.cert?.trim() || undefined,
      key: cfg.ssl.key?.trim() || undefined,
      rejectUnauthorized: cfg.ssl.rejectUnauthorized ?? true,
    };
  }

  const sasl = cfg.sasl;
  if (sasl.mechanism === "plain") {
    base.sasl = { mechanism: "plain", username: sasl.username ?? "", password: sasl.password ?? "" };
  } else if (sasl.mechanism === "scram-sha-256") {
    base.sasl = { mechanism: "scram-sha-256", username: sasl.username ?? "", password: sasl.password ?? "" };
  } else if (sasl.mechanism === "scram-sha-512") {
    base.sasl = { mechanism: "scram-sha-512", username: sasl.username ?? "", password: sasl.password ?? "" };
  } else if (sasl.mechanism === "oauthbearer") {
    base.sasl = {
      mechanism: "oauthbearer",
      oauthBearerProvider: async () => ({ value: sasl.token ?? "" }),
    };
  }

  return base;
}

export async function getClusterInfo(cfg: ConnectionConfig): Promise<ClusterInfo> {
  const admin = new Kafka(buildKafkaConfig(cfg)).admin();
  try {
    await admin.connect();
    const cluster = await admin.describeCluster();
    const topics = await admin.listTopics();
    return {
      clusterId: cluster.clusterId,
      controller: cluster.controller,
      brokers: cluster.brokers.map((b) => ({ nodeId: b.nodeId, host: b.host, port: b.port })),
      topics: topics.length,
    };
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

export async function listTopics(cfg: ConnectionConfig): Promise<TopicInfo[]> {
  const admin = new Kafka(buildKafkaConfig(cfg)).admin();
  try {
    await admin.connect();
    const names = await admin.listTopics();
    const metadata = await admin.fetchTopicMetadata({ topics: names });
    return metadata.topics
      .map((t) => ({
        name: t.name,
        partitions: t.partitions.length,
        replicationFactor: t.partitions[0]?.replicas.length ?? 0,
        internal: t.name.startsWith("__"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

export async function listPartitions(cfg: ConnectionConfig, topic: string): Promise<PartitionOffsetInfo[]> {
  const admin = new Kafka(buildKafkaConfig(cfg)).admin();
  try {
    await admin.connect();
    const offsets = (await admin.fetchTopicOffsets(topic)) as TopicOffset[];
    return offsets
      .map((o) => ({
        partition: o.partition,
        low: Number(o.low ?? 0),
        high: Number(o.high ?? o.offset ?? 0),
      }))
      .sort((a, b) => a.partition - b.partition);
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

export async function listConsumerGroups(cfg: ConnectionConfig, topic: string): Promise<ConsumerGroupInfo[]> {
  const admin = new Kafka(buildKafkaConfig(cfg)).admin();
  try {
    await admin.connect();
    const { groups } = await admin.listGroups();
    const topicOffsets = (await admin.fetchTopicOffsets(topic)) as TopicOffset[];
    const high = new Map(topicOffsets.map((o) => [o.partition, Number(o.high ?? o.offset ?? 0)]));

    const results: ConsumerGroupInfo[] = [];
    const candidates = groups
      .filter((g) => !g.groupId.startsWith(EPHEMERAL_GROUP_PREFIX))
      .slice(0, MAX_GROUPS);

    for (const group of candidates) {
      try {
        const described = await admin.describeGroups([group.groupId]);
        const info = described.groups[0];
        const members = info?.members.length ?? 0;

        const offsets = await admin.fetchOffsets({ groupId: group.groupId, topics: [topic] });
        const partitions = offsets[0]?.partitions ?? [];

        if (partitions.length === 0 && members === 0) continue;

        let lag = 0;
        for (const p of partitions) {
          const committed = p.offset === undefined || p.offset === "-1" ? 0 : Number(p.offset);
          if (Number.isNaN(committed) || committed < 0) continue;
          const hw = high.get(p.partition) ?? 0;
          lag += Math.max(0, hw - committed);
        }

        results.push({
          groupId: group.groupId,
          state: info?.state ?? "Unknown",
          members,
          lag,
        });
      } catch {
        // Skip groups that fail to describe (transient or unsupported groups)
      }
    }

    return results.sort((a, b) => a.groupId.localeCompare(b.groupId));
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

export interface ResetOffsetsInput {
  topic: string;
  groupId: string;
  position: "beginning" | "end" | "timestamp" | "offset";
  timestamp?: number | null;
  offset?: number | null;
}

export async function resetOffsets(cfg: ConnectionConfig, input: ResetOffsetsInput) {
  const admin = new Kafka(buildKafkaConfig(cfg)).admin();
  try {
    await admin.connect();
    const topicOffsets = (await admin.fetchTopicOffsets(input.topic)) as TopicOffset[];

    let targetOffsets: Array<{ partition: number; offset: string }>;
    if (input.position === "beginning") {
      targetOffsets = topicOffsets.map((o) => ({
        partition: o.partition,
        offset: String(Number(o.low ?? o.offset ?? 0)),
      }));
    } else if (input.position === "end") {
      targetOffsets = topicOffsets.map((o) => ({
        partition: o.partition,
        offset: String(Number(o.high ?? o.offset ?? 0)),
      }));
    } else if (input.position === "timestamp") {
      const ts = input.timestamp ?? Date.now();
      const byTimestamp = await admin.fetchTopicOffsetsByTimestamp(input.topic, ts);
      const byPartition = new Map(byTimestamp.map((o) => [o.partition, Number(o.offset)]));
      targetOffsets = topicOffsets.map((o) => {
        const found = byPartition.get(o.partition) ?? -1;
        // -1 = no message at/after the timestamp → position at the end
        return {
          partition: o.partition,
          offset: found >= 0 ? String(found) : String(Number(o.high ?? o.offset ?? 0)),
        };
      });
    } else {
      const low = (o: TopicOffset) => Number(o.low ?? 0);
      const high = (o: TopicOffset) => Number(o.high ?? o.offset ?? 0);
      const requested = Math.max(0, input.offset ?? 0);
      targetOffsets = topicOffsets.map((o) => ({
        partition: o.partition,
        offset: String(Math.min(Math.max(requested, low(o)), high(o))),
      }));
    }

    const committed = await admin.fetchOffsets({ groupId: input.groupId, topics: [input.topic] });
    const previous = new Map(
      (committed[0]?.partitions ?? []).map((p) => [p.partition, Math.max(0, Number(p.offset) || 0)])
    );

    await admin.setOffsets({ groupId: input.groupId, topic: input.topic, partitions: targetOffsets });

    return {
      groupId: input.groupId,
      topic: input.topic,
      partitions: targetOffsets.map((o) => ({
        partition: o.partition,
        previousOffset: previous.get(o.partition) ?? -1,
        newOffset: Number(o.offset),
      })),
    };
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

function buildHeaders(headers?: Record<string, string>): Record<string, Buffer> | undefined {
  if (!headers) return undefined;
  const entries = Object.entries(headers).filter(([, v]) => v != null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([k, v]) => [k, Buffer.from(String(v))]));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Produce a single message. Read-only exploration is the norm, but testing needs this. */
export async function produceMessage(
  cfg: ConnectionConfig,
  input: ProduceMessageInput
): Promise<ProduceResult> {
  const producer = new Kafka(buildKafkaConfig(cfg)).producer({ allowAutoTopicCreation: false });
  try {
    await producer.connect();
    const [result] = await producer.send({
      topic: input.topic,
      messages: [
        {
          key: input.key ? input.key : null,
          value: input.value ?? null,
          partition: input.partition ?? undefined,
          headers: buildHeaders(input.headers),
        },
      ],
    });
    if (!result) throw new Error("Broker returned no produce result.");
    return { topic: input.topic, partition: result.partition, offset: String(result.baseOffset ?? 0) };
  } finally {
    await producer.disconnect().catch(() => undefined);
  }
}

/** Generate and produce `count` messages from the given templates (see shared/template.ts). */
export async function runLoadTest(cfg: ConnectionConfig, spec: LoadTestSpec): Promise<LoadTestResult> {
  const count = Math.min(Math.max(Math.floor(spec.count) || 1, 1), MAX_LOAD_MESSAGES);
  const batchSize = Math.min(Math.max(Math.floor(spec.batchSize ?? 100) || 100, 1), MAX_BATCH_SIZE);
  const rate = Math.min(Math.max(Math.floor(spec.ratePerSecond ?? 0) || 0, 0), MAX_RATE_PER_SECOND);

  const producer = new Kafka(buildKafkaConfig(cfg)).producer({ allowAutoTopicCreation: false });
  const startedAt = Date.now();
  const stats = new Map<number, { first: string | null; last: string; count: number }>();

  try {
    await producer.connect();
    let produced = 0;
    while (produced < count) {
      const n = Math.min(batchSize, count - produced);
      const messages = Array.from({ length: n }, (_, k) => {
        const idx = produced + k;
        const value = renderTemplate(spec.valueTemplate, idx);
        const key = spec.keyTemplate ? renderTemplate(spec.keyTemplate, idx) : null;
        return {
          key,
          value,
          partition: spec.partition ?? undefined,
          headers: buildHeaders(spec.headers),
        };
      });

      const results = await producer.send({ topic: spec.topic, messages });
      for (const r of results) {
        const stat = stats.get(r.partition) ?? { first: null, last: "0", count: 0 };
        if (stat.first === null) stat.first = String(r.baseOffset ?? 0);
        stat.last = String(r.baseOffset ?? 0);
        stat.count += 1;
        stats.set(r.partition, stat);
      }
      produced += n;

      if (rate > 0) {
        const pauseMs = Math.round((n / rate) * 1000);
        if (pauseMs > 0) await sleep(pauseMs);
      }
    }

    const durationMs = Date.now() - startedAt;
    const partitions: Record<string, LoadTestPartitionStat> = {};
    for (const [p, s] of stats) {
      partitions[String(p)] = { firstOffset: s.first ?? "0", lastOffset: s.last, count: s.count };
    }
    return {
      topic: spec.topic,
      produced,
      durationMs,
      messagesPerSecond: durationMs > 0 ? Math.round((produced / durationMs) * 1000) : produced,
      partitions,
    };
  } finally {
    await producer.disconnect().catch(() => undefined);
  }
}

export async function searchMessages(
  cfg: ConnectionConfig,
  topic: string,
  filters: MessageSearchFilters
): Promise<SearchResult> {
  const startedAt = Date.now();
  const kafka = new Kafka(buildKafkaConfig(cfg));
  const admin = kafka.admin();
  await admin.connect();

  const rawOffsets = (await admin.fetchTopicOffsets(topic)) as TopicOffset[];
  const high = new Map(rawOffsets.map((o) => [o.partition, Number(o.high ?? o.offset ?? 0)]));
  const low = new Map(rawOffsets.map((o) => [o.partition, Number(o.low ?? 0)]));

  const partitions = rawOffsets
    .map((o) => o.partition)
    .filter((p) => filters.partition == null || p === filters.partition)
    .sort((a, b) => a - b);

  if (partitions.length === 0) {
    await admin.disconnect().catch(() => undefined);
    return { messages: [], scanned: 0, truncated: false, durationMs: Date.now() - startedAt };
  }

  // Pure "latest messages" browse: start near the end of each partition instead of the beginning.
  const browseFromEnd =
    !filters.key && !filters.value && filters.startTime == null && filters.endTime == null && filters.sort === "desc";

  // Skip the consumer entirely when every selected partition is empty.
  const allEmpty = partitions.every((p) => (high.get(p) ?? 0) <= (low.get(p) ?? 0));
  if (allEmpty) {
    await admin.disconnect().catch(() => undefined);
    return { messages: [], scanned: 0, truncated: false, durationMs: Date.now() - startedAt };
  }

  const groupId = `${EPHEMERAL_GROUP_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    retry: { retries: 1 },
  });

  try {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    if (browseFromEnd) {
      // Start near the tail of each partition by seeking once the group is assigned.
      const perPartition = Math.max(1, Math.ceil((filters.limit * 2) / partitions.length));
      consumer.on("consumer.group_join", () => {
        for (const p of partitions) {
          const h = high.get(p) ?? 0;
          const l = low.get(p) ?? 0;
          consumer.seek({ topic, partition: p, offset: String(Math.max(l, h - perPartition)) });
        }
      });
    }

    const matches: KafkaMessage[] = [];
    let scanned = 0;
    let done = false;
    const exhausted = new Set<number>();
    for (const p of partitions) {
      if ((high.get(p) ?? 0) <= (low.get(p) ?? 0)) exhausted.add(p);
    }

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const safety = setTimeout(() => {
        done = true;
        resolvePromise();
      }, SEARCH_TIMEOUT_MS);

      const finish = () => {
        clearTimeout(safety);
        done = true;
        resolvePromise();
      };

      consumer
        .run({
          autoCommit: !browseFromEnd,
          eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning }) => {
            if (!isRunning() || done) return;
            for (const message of batch.messages) {
              if (!isRunning() || done) break;
              scanned += 1;

              const ts = Number(message.timestamp);
              if (filters.startTime != null && ts < filters.startTime) continue;
              if (filters.endTime != null && ts > filters.endTime) continue;

              const key = message.key ? message.key.toString("utf8") : null;
              const value = message.value ? message.value.toString("utf8") : null;
              if (filters.key && !(key ?? "").includes(filters.key)) continue;
              if (filters.value && !(value ?? "").includes(filters.value)) continue;

              matches.push({
                key,
                value,
                valueBase64: message.value ? message.value.toString("base64") : null,
                partition: batch.partition,
                offset: message.offset,
                timestamp: ts,
                headers: message.headers
                  ? Object.fromEntries(
                      Object.entries(message.headers).map(([k, v]) => [k, v?.toString("utf8") ?? ""])
                    )
                  : {},
                size: (message.key?.length ?? 0) + (message.value?.length ?? 0),
              });

              if (browseFromEnd && matches.length >= filters.limit) {
                done = true;
                break;
              }
            }

            if (!browseFromEnd && typeof resolveOffset === "function") {
              await resolveOffset(batch.lastOffset());
            }
            await heartbeat();

            if (done || scanned >= MAX_SCAN_MESSAGES) {
              finish();
              return;
            }

            if (!browseFromEnd) {
              if (Number(batch.lastOffset()) + 1 >= (high.get(batch.partition) ?? Number.MAX_SAFE_INTEGER)) {
                exhausted.add(batch.partition);
              }
              if (exhausted.size >= partitions.length) {
                finish();
                return;
              }
            }
          },
        })
        .catch(rejectPromise);
    });

    await consumer.stop().catch(() => undefined);

    const sorted = matches.sort((a, b) =>
      filters.sort === "desc" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    );
    return {
      messages: sorted.slice(0, filters.limit),
      scanned,
      truncated: sorted.length > filters.limit || scanned >= MAX_SCAN_MESSAGES,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await consumer.disconnect().catch(() => undefined);
    await admin.disconnect().catch(() => undefined);
  }
}
