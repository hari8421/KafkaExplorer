import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { errorHandler, router } from "../server/routes";
import { assets } from "./generated-assets";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const FALLBACK_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Kafka Explorer</title></head>
<body style="font-family:system-ui;background:#09090b;color:#f4f4f5;display:grid;place-items:center;height:100vh;margin:0">
<p>Kafka Explorer API is running, but the frontend assets are not embedded.
Run <code>bun run desktop:generate</code> before compiling the executable.</p></body></html>`;

function openBrowser(url: string) {
  if (process.env.KAFKA_EXPLORER_NO_OPEN) return;
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {
    // Browser opening is best-effort; the URL is printed below either way.
  }
}

function listen(app: express.Express, port: number, host: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, port }));
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // Port busy — pick a free one so the app always starts.
        const next = app.listen(0, host, () =>
          resolve({ server: next, port: (next.address() as AddressInfo).port })
        );
        next.once("error", reject);
      } else {
        reject(err);
      }
    });
  });
}

async function main() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", router);

  const embedded = Object.keys(assets).length > 0;
  const dist = path.resolve(process.cwd(), "dist");

  // Serve the embedded frontend (desktop executable) or dist/ (source mode).
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const pathname = decodeURIComponent(req.path.replace(/^\/+/, "")) || "index.html";

    if (embedded) {
      const content = assets[pathname];
      if (content !== undefined) {
        const ext = pathname.includes(".") ? path.extname(pathname) : ".html";
        res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
        res.send(content);
        return;
      }
      // SPA fallback
      const index = assets["index.html"];
      if (index !== undefined) {
        res.setHeader("Content-Type", MIME[".html"]);
        res.send(index);
        return;
      }
    }

    if (fs.existsSync(dist)) {
      const file = path.join(dist, pathname);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const ext = path.extname(file);
        res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
        res.sendFile(file);
        return;
      }
      res.sendFile(path.join(dist, "index.html"));
      return;
    }

    res.setHeader("Content-Type", MIME[".html"]);
    res.send(FALLBACK_HTML);
  });

  app.use(errorHandler);

  const port = Number(process.env.KAFKA_EXPLORER_API_PORT) || 8787;
  const host = process.env.KAFKA_EXPLORER_BIND_HOST || "0.0.0.0";
  const { server, port: boundPort } = await listen(app, port, host);

  const url = `http://localhost:${boundPort}`;
  console.log(`Kafka Explorer running at ${url}`);
  openBrowser(url);

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
