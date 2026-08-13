import { Router, type NextFunction, type Request, type Response } from "express";
import type { ConnectionConfig, MessageSearchFilters } from "../shared/kafka";
import {
  getClusterInfo,
  listConsumerGroups,
  listPartitions,
  listTopics,
  resetOffsets,
  searchMessages,
} from "./kafka";
import {
  demoCluster,
  demoConsumerGroups,
  demoPartitions,
  demoReset,
  demoSearch,
  demoTopics,
} from "./demo";

const DEMO = process.env.KAFKA_EXPLORER_DEMO === "1";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function validateConfig(raw: unknown): ConnectionConfig {
  const body = (raw ?? {}) as Partial<ConnectionConfig>;
  const brokers = Array.isArray(body.brokers)
    ? body.brokers.map((b) => String(b).trim()).filter(Boolean)
    : [];
  if (brokers.length === 0) {
    throw new HttpError(400, "At least one broker (host:port) is required.");
  }
  const mechanism = ["none", "plain", "scram-sha-256", "scram-sha-512", "oauthbearer"].includes(
    String(body.sasl?.mechanism)
  )
    ? (body.sasl!.mechanism as ConnectionConfig["sasl"]["mechanism"])
    : "none";

  return {
    brokers,
    clientId: typeof body.clientId === "string" ? body.clientId : undefined,
    ssl: {
      enabled: Boolean(body.ssl?.enabled),
      ca: typeof body.ssl?.ca === "string" && body.ssl.ca.trim() ? body.ssl.ca : undefined,
      cert: typeof body.ssl?.cert === "string" && body.ssl.cert.trim() ? body.ssl.cert : undefined,
      key: typeof body.ssl?.key === "string" && body.ssl.key.trim() ? body.ssl.key : undefined,
      rejectUnauthorized: body.ssl?.rejectUnauthorized ?? true,
    },
    sasl: {
      mechanism,
      username: typeof body.sasl?.username === "string" ? body.sasl.username : undefined,
      password: typeof body.sasl?.password === "string" ? body.sasl.password : undefined,
      token: typeof body.sasl?.token === "string" ? body.sasl.token : undefined,
    },
  };
}

function validateFilters(raw: unknown): MessageSearchFilters {
  const f = (raw ?? {}) as Partial<MessageSearchFilters>;
  const limit = Math.min(Math.max(Number(f.limit) || 100, 1), 2000);
  return {
    key: typeof f.key === "string" && f.key.trim() ? f.key.trim() : undefined,
    value: typeof f.value === "string" && f.value.trim() ? f.value.trim() : undefined,
    partition: f.partition == null ? null : Number(f.partition),
    startTime: f.startTime == null ? null : Number(f.startTime),
    endTime: f.endTime == null ? null : Number(f.endTime),
    limit,
    sort: f.sort === "asc" ? "asc" : "desc",
  };
}

function requireTopic(raw: unknown): string {
  const topic = String((raw as { topic?: unknown })?.topic ?? "").trim();
  if (!topic) throw new HttpError(400, "topic is required.");
  return topic;
}

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

router.post(
  "/clusters/test",
  wrap(async (req, res) => {
    if (DEMO) return void res.json(demoCluster());
    res.json(await getClusterInfo(validateConfig(req.body.config)));
  })
);

router.post(
  "/topics",
  wrap(async (req, res) => {
    if (DEMO) return void res.json(demoTopics());
    res.json(await listTopics(validateConfig(req.body.config)));
  })
);

router.post(
  "/topics/partitions",
  wrap(async (req, res) => {
    if (DEMO) return void res.json(demoPartitions());
    const config = validateConfig(req.body.config);
    const topic = requireTopic(req.body);
    res.json(await listPartitions(config, topic));
  })
);

router.post(
  "/topics/consumers",
  wrap(async (req, res) => {
    if (DEMO) return void res.json(demoConsumerGroups());
    const config = validateConfig(req.body.config);
    const topic = requireTopic(req.body);
    res.json(await listConsumerGroups(config, topic));
  })
);

router.post(
  "/topics/search",
  wrap(async (req, res) => {
    if (DEMO) {
      return void res.json(demoSearch());
    }
    const config = validateConfig(req.body.config);
    const topic = requireTopic(req.body);
    res.json(await searchMessages(config, topic, validateFilters(req.body.filters)));
  })
);

router.post(
  "/topics/offsets/reset",
  wrap(async (req, res) => {
    if (DEMO) {
      const groupId = String(req.body.groupId ?? "group").trim();
      const topic = requireTopic(req.body);
      const newOffset = req.body.position === "beginning" ? 0 : 99_999_999;
      return void res.json(demoReset(groupId, topic, newOffset));
    }
    const config = validateConfig(req.body.config);
    const topic = requireTopic(req.body);
    const groupId = String(req.body.groupId ?? "").trim();
    if (!groupId) throw new HttpError(400, "groupId is required.");
    const position = ["beginning", "end", "timestamp", "offset"].includes(String(req.body.position))
      ? (req.body.position as "beginning" | "end" | "timestamp" | "offset")
      : "beginning";
    res.json(
      await resetOffsets(config, {
        topic,
        groupId,
        position,
        timestamp: req.body.timestamp == null ? null : Number(req.body.timestamp),
        offset: req.body.offset == null ? null : Number(req.body.offset),
      })
    );
  })
);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  if (status >= 500) console.error("[kafka-explorer]", err);
  res.status(status).json({ error: message });
}
