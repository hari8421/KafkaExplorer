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

export type ResetPosition = "beginning" | "end" | "timestamp" | "offset";

export interface ResetOffsetsResult {
  groupId: string;
  topic: string;
  partitions: Array<{ partition: number; previousOffset: number; newOffset: number }>;
}
