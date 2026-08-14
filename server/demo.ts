import type {
  ClusterInfo,
  ConsumerGroupInfo,
  KafkaMessage,
  LoadTestPartitionStat,
  PartitionOffsetInfo,
  SearchResult,
  TopicInfo,
} from "../shared/kafka";

// Deterministic sample data served when KAFKA_EXPLORER_DEMO=1, so the UI can be
// explored (and screenshotted) without a real Kafka cluster.

const H = 3_600_000;
const BASE = Date.now() - 2 * 24 * H;

function msg(
  key: string,
  value: string,
  partition: number,
  offset: number,
  minutesAgo: number,
  headers: Record<string, string> = {}
): KafkaMessage {
  const body = Buffer.from(value);
  return {
    key,
    value,
    valueBase64: body.toString("base64"),
    partition,
    offset: String(offset),
    timestamp: BASE - minutesAgo * 60_000,
    headers,
    size: Buffer.byteLength(key) + body.length,
  };
}

const ORDER_MESSAGES: KafkaMessage[] = [
  msg("ord-10231", '{"orderId":"ord-10231","sku":"KB-2041","qty":2,"total":129.98,"status":"paid"}', 0, 4, 12, { "x-trace": "a1b2c3", "event-type": "order.paid" }),
  msg("ord-10232", '{"orderId":"ord-10232","sku":"KB-1108","qty":1,"total":59.0,"status":"paid"}', 1, 7, 14, { "event-type": "order.paid" }),
  msg("ord-10233", '{"orderId":"ord-10233","sku":"KB-2041","qty":5,"total":324.95,"status":"shipped"}', 2, 9, 21, { "event-type": "order.shipped" }),
  msg("ord-10234", '{"orderId":"ord-10234","sku":"KB-9912","qty":1,"total":899.0,"status":"paid"}', 3, 3, 26, { "event-type": "order.paid" }),
  msg("ord-10235", '{"orderId":"ord-10235","sku":"KB-1108","qty":3,"total":177.0,"status":"cancelled","reason":"stock"}', 4, 11, 33, { "event-type": "order.cancelled" }),
  msg("ord-10236", '{"orderId":"ord-10236","sku":"KB-2041","qty":1,"total":64.99,"status":"paid"}', 5, 2, 41, { "event-type": "order.paid" }),
  msg("ord-10237", '{"orderId":"ord-10237","sku":"KB-8871","qty":2,"total":239.98,"status":"shipped"}', 0, 5, 48, { "event-type": "order.shipped" }),
  msg("ord-10238", '{"orderId":"ord-10238","sku":"KB-1108","qty":1,"total":59.0,"status":"paid"}', 1, 8, 55, { "event-type": "order.paid" }),
  msg("ord-10239", '{"orderId":"ord-10239","sku":"KB-9912","qty":1,"total":899.0,"status":"refunded"}', 2, 10, 63, { "event-type": "order.refunded" }),
  msg("ord-10240", '{"orderId":"ord-10240","sku":"KB-2041","qty":4,"total":259.96,"status":"paid"}', 3, 4, 72, { "event-type": "order.paid" }),
  msg("ord-10241", '{"orderId":"ord-10241","sku":"KB-8871","qty":1,"total":119.99,"status":"paid"}', 4, 12, 80, { "event-type": "order.paid" }),
  msg("ord-10242", '{"orderId":"ord-10242","sku":"KB-2041","qty":2,"total":129.98,"status":"delivered"}', 5, 3, 90, { "event-type": "order.delivered" }),
];

let poll = 0;

export function demoCluster(): ClusterInfo {
  return {
    clusterId: "demo-cluster-01",
    controller: 0,
    brokers: [
      { nodeId: 0, host: "broker-1.demo.local", port: 9092 },
      { nodeId: 1, host: "broker-2.demo.local", port: 9092 },
      { nodeId: 2, host: "broker-3.demo.local", port: 9092 },
    ],
    topics: 5,
  };
}

export function demoTopics(): TopicInfo[] {
  return [
    { name: "orders", partitions: 6, replicationFactor: 3, internal: false },
    { name: "payments", partitions: 4, replicationFactor: 3, internal: false },
    { name: "user-events", partitions: 8, replicationFactor: 2, internal: false },
    { name: "inventory-updates", partitions: 3, replicationFactor: 2, internal: false },
    { name: "__consumer_offsets", partitions: 50, replicationFactor: 3, internal: true },
  ];
}

export function demoPartitions(): PartitionOffsetInfo[] {
  return Array.from({ length: 6 }, (_, i) => ({
    partition: i,
    low: 0,
    high: 40 + i * 13,
  }));
}

export function demoConsumerGroups(): ConsumerGroupInfo[] {
  // Slight movement per poll so the "live" refresh is visible.
  poll += 1;
  return [
    { groupId: "orders-processor", state: "Stable", members: 3, lag: 124 + poll },
    { groupId: "analytics-pipeline", state: "Stable", members: 4, lag: 5_218 + poll * 3 },
    { groupId: "payments-settlement", state: "Stable", members: 2, lag: 0 },
    { groupId: "email-notifier", state: "Empty", members: 0, lag: 892 },
    { groupId: "inventory-sync", state: "PreparingRebalance", members: 2, lag: 41 },
  ];
}

export function demoSearch(): SearchResult {
  return {
    messages: ORDER_MESSAGES,
    scanned: 1_482_113,
    truncated: false,
    durationMs: 612,
  };
}

export function demoReset(groupId: string, topic: string, newOffset: number) {
  return {
    groupId,
    topic,
    partitions: Array.from({ length: 6 }, (_, i) => ({
      partition: i,
      previousOffset: 20 + i,
      newOffset,
    })),
  };
}

export function demoProduce(topic: string, _key: string | null) {
  return { topic, partition: 2, offset: "101234" };
}

export function demoLoadTest(topic: string, count: number) {
  const partitions: Record<string, LoadTestPartitionStat> = {};
  const per = Math.ceil(count / 6);
  for (let p = 0; p < 6; p++) {
    const c = Math.min(per, Math.max(0, count - p * per));
    if (c <= 0) break;
    partitions[String(p)] = {
      firstOffset: String(100_000 + p * 10),
      lastOffset: String(100_000 + p * 10 + c - 1),
      count: c,
    };
  }
  return {
    topic,
    produced: count,
    durationMs: 420,
    messagesPerSecond: Math.round((count / 420) * 1000),
    partitions,
  };
}
