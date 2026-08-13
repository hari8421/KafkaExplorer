# Kafka Explorer

A self-hosted web UI for exploring Apache Kafka clusters: browse topics, inspect consumer
groups, and search messages by key, value, time range, and partition.

## Documentation

- **Usage guide** — running the app (dev / Docker / desktop executables), setting up
  connections (SSL, SASL, mTLS), exploring topics and messages: [`docs/USAGE.md`](docs/USAGE.md)
- **Executables** — generate and run the Windows/macOS binaries: [`EXECUTABLES.md`](EXECUTABLES.md)
- **Help PDF** — `docs/Kafka-Explorer-Help.pdf` (regenerate with `bun run generate:pdf`;
  screenshots in `docs/screenshots/` via `bun run capture:screenshots`)

## Demo mode

Set `KAFKA_EXPLORER_DEMO=1` to serve sample topics/messages/consumer-groups so the UI can
be explored (or screenshotted) without a Kafka cluster.

## Features

- **Cluster connections** — plaintext, TLS/SSL (with optional CA / client certificates),
  and SASL authentication: `PLAIN`, `SCRAM-SHA-256`, `SCRAM-SHA-512`, and `OAUTHBEARER`;
  disconnect clears the saved connection and returns to the connection form.
- **Topics** — list all topics with partition and replication-factor counts, filter by name.
- **Consumer groups** — for any topic, see which consumer groups subscribe to it, their
  state, member count, and **realtime lag** (auto-refreshes every 5s while the tab is
  open), plus **reset offsets** to earliest / latest / timestamp / custom offset.
- **Message search** — substring search on key and/or value, time-range filtering, per-partition
  filtering, sort by time (newest/oldest first), up to 2,000 results. Unfiltered "newest first"
  browsing reads only from the tail of each partition for fast results; filtered searches scan
  from the beginning (capped at 250k messages). Values can be viewed as text or base64, and
  results export to JSON.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS v4
- **Backend:** Node.js + Express + [KafkaJS](https://kafka.js.org/) (in `server/`)
- **Shared types:** `shared/kafka.ts`

## Commands

| Task             | Command               |
| ---------------- | --------------------- |
| Install deps     | `bun install`         |
| Run dev servers  | `bun run dev`         |
| Run API only     | `bun run server:start`|
| Build frontend   | `bun run build`       |
| Typecheck        | `bun run typecheck`   |

`bun run dev` starts the Express API on port `8787` and the Vite dev server (which proxies
`/api` to it). The API also serves `dist/` when a production build exists, and exposes a
`GET /api/health` endpoint.

## Desktop executables (Windows / macOS)

`bun run build:desktop` cross-compiles the whole app — Express API + KafkaJS + embedded
frontend — into single-file executables in `bin/` (Windows, macOS Apple Silicon + Intel,
Linux). Run the file and it opens your browser at `http://localhost:8787` — no Node, Bun,
or Docker needed on the target machine.

**Full instructions** (generate, run, per-platform notes, troubleshooting):
[`EXECUTABLES.md`](EXECUTABLES.md)

## Production

The build (`bun run build`) produces a static frontend in `dist/` plus a Node/Express API.
Two ways to run the full app in production:

1. **Docker** — `docker build -t kafka-explorer . && docker run -p 8787:8787 kafka-explorer`
   (multi-stage image, runs the API and serves the built frontend; graceful shutdown on
   SIGTERM).
2. **Node directly** — `bun install` then `bun run server:start` after `bun run build`.

Freebuff-managed hosting deploys static output only, so the Express API must run on its own
runtime (Docker/VPS) in production.

## Configuration & environment variables

No environment variables are required to run the app. Kafka connection details (brokers,
TLS certificates, SASL credentials) are entered in the web UI and stored in the browser's
`localStorage`; they are only sent to the local API on the same machine.

Optional:

- `KAFKA_EXPLORER_API_PORT` — API port (default `8787`).
- `KAFKA_EXPLORER_BIND_HOST` — API bind address (default `0.0.0.0`).
- `PORT` — Vite dev server port (default `5173`), used by the preview environment.

Notes:

- Credentials are stored in browser `localStorage` in plain text — treat this as a trusted
  dev tool and avoid entering production secrets in a shared browser.
- Kerberos/GSSAPI authentication is not supported yet; KafkaJS supports it via a native
  `kerberos` module that can be added later.
- Self-signed / private-CA clusters: paste the CA certificate in the TLS section, or disable
  certificate verification (labeled insecure) if the broker cert is untrusted.
- The API is unauthenticated and binds to `0.0.0.0` — run it inside your own network/VPN.
