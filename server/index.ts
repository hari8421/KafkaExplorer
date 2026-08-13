import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { errorHandler, router } from "./routes";

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/api", router);

// Serve the built frontend when `dist/` exists (standalone `bun run server:start` / Docker mode).
const dist = path.resolve(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h", index: "index.html" }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use(errorHandler);

const port = Number(process.env.KAFKA_EXPLORER_API_PORT) || 8787;
const host = process.env.KAFKA_EXPLORER_BIND_HOST || "0.0.0.0";
const server = app.listen(port, host, () => {
  console.log(`Kafka Explorer API listening on http://${host}:${port}`);
});

// Graceful shutdown for production (SIGTERM from orchestrators, SIGINT from Ctrl-C).
const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down…`);
  server.close(() => process.exit(0));
  // Force-exit if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
