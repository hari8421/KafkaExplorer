import type {
  ClusterInfo,
  ConnectionConfig,
  ConsumerGroupInfo,
  MessageSearchFilters,
  PartitionOffsetInfo,
  ResetOffsetsResult,
  SearchResult,
  TopicInfo,
} from "../../shared/kafka";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  testConnection: (config: ConnectionConfig) =>
    post<ClusterInfo>("/clusters/test", { config }),

  listTopics: (config: ConnectionConfig) =>
    post<TopicInfo[]>("/topics", { config }),

  listPartitions: (config: ConnectionConfig, topic: string) =>
    post<PartitionOffsetInfo[]>("/topics/partitions", { config, topic }),

  listConsumerGroups: (config: ConnectionConfig, topic: string) =>
    post<ConsumerGroupInfo[]>("/topics/consumers", { config, topic }),

  searchMessages: (config: ConnectionConfig, topic: string, filters: MessageSearchFilters) =>
    post<SearchResult>("/topics/search", { config, topic, filters }),

  resetOffsets: (
    config: ConnectionConfig,
    topic: string,
    groupId: string,
    body: { position: "beginning" | "end" | "timestamp" | "offset"; timestamp?: number | null; offset?: number | null }
  ) => post<ResetOffsetsResult>("/topics/offsets/reset", { config, topic, groupId, ...body }),
};
