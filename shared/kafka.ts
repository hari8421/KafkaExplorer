/**
 * Types shared between the React frontend (src/) and the Node/KafkaJS backend (server/).
 */

export type SaslMechanism = "none" | "plain" | "scram-sha-256" | "scram-sha-512" | "oauthbearer";

export interface ConnectionConfig {
  brokers: string[];
  clientId?: string;
  ssl: {
    enabled: boolean;
    /** PEM-encoded CA certificate */
    ca?: string;
    /** PEM-encoded client certificate */
    cert?: string;
    /** PEM-encoded client key */
    key?: string;
    /** Verify the broker certificate chain (default true). Disable only for private clusters with untrusted certs. */
    rejectUnauthorized?: boolean;
  };
  sasl: {
    mechanism: SaslMechanism;
    username?: string;
    password?: string;
    /** OAuth bearer access token (used when mechanism is "oauthbearer") */
    token?: string;
  };
}

export interface ClusterInfo {
  clusterId: string | null;
  controller: number | null;
  brokers: { nodeId: number; host: string; port: number }[];
  topics: number;
}

export interface TopicInfo {
  name: string;
  partitions: number;
  replicationFactor: number;
  internal: boolean;
}

export interface PartitionOffsetInfo {
  partition: number;
  low: number;
  high: number;
}

export interface ConsumerGroupInfo {
  groupId: string;
  state: string;
  members: number;
  lag: number;
}

export interface KafkaMessage {
  key: string | null;
  value: string | null;
  /** Raw bytes of the value encoded as base64 (for binary payloads) */
  valueBase64: string | null;
  partition: number;
  offset: string;
  /** Epoch milliseconds */
  timestamp: number;
  headers: Record<string, string>;
  size: number;
}

export interface MessageSearchFilters {
  /** Substring to match against the message key (case-sensitive) */
  key?: string;
  /** Substring to match against the message value (case-sensitive) */
  value?: string;
  partition?: number | null;
  /** Epoch milliseconds */
  startTime?: number | null;
  /** Epoch milliseconds */
  endTime?: number | null;
  limit: number;
  sort: "asc" | "desc";
}

export interface SearchResult {
  messages: KafkaMessage[];
  scanned: number;
  truncated: boolean;
  durationMs: number;
}

export interface TlsConvertPayload {
  /** Keystore/truststore file contents as base64 */
  dataBase64: string;
  /** Store password */
  password: string;
}

export interface TlsConvertResult {
  aliases: string[];
  ca?: string;
  cert?: string;
  key?: string;
}

export interface TlsConvertResponse {
  keystore?: TlsConvertResult;
  truststore?: { ca?: string };
}

export type ResetPosition = "beginning" | "end" | "timestamp" | "offset";

export interface ResetOffsetsResult {
  groupId: string;
  topic: string;
  partitions: Array<{ partition: number; previousOffset: number; newOffset: number }>;
}

export interface ProduceMessageInput {
  topic: string;
  key?: string;
  value?: string;
  partition?: number | null;
  headers?: Record<string, string>;
}

export interface ProduceResult {
  topic: string;
  partition: number;
  offset: string;
}

export interface LoadTestSpec {
  topic: string;
  /** Number of messages to produce (1..100_000). */
  count: number;
  /** Key template rendered per message with {{placeholders}} (may be empty). */
  keyTemplate: string;
  /** Value/payload template rendered per message with {{placeholders}}. */
  valueTemplate: string;
  /** Optional fixed partition for every message. */
  partition?: number | null;
  /** Optional static headers applied to every message. */
  headers?: Record<string, string>;
  /** Messages per send() call (default 100, 1..1000). */
  batchSize?: number;
  /** Target throughput in messages/second; 0 = as fast as possible. */
  ratePerSecond?: number;
}

export interface LoadTestPartitionStat {
  firstOffset: string;
  lastOffset: string;
  count: number;
}

export interface LoadTestResult {
  topic: string;
  produced: number;
  durationMs: number;
  messagesPerSecond: number;
  partitions: Record<string, LoadTestPartitionStat>;
}
