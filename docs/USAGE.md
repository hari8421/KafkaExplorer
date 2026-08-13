# Kafka Explorer — Usage Guide

How to run the app, connect it to a Kafka cluster, and explore your topics.

## Running the app

### Desktop executables (Windows / macOS)

> Full guide (generate, run, per-platform notes, troubleshooting):
> [`EXECUTABLES.md`](../EXECUTABLES.md)

Prebuilt single-file executables live in `bin/` (see `scripts/build-desktop.ts` for targets):

| File                     | Platform             |
| ------------------------ | -------------------- |
| `bin/kafka-explorer-windows-x64.exe` | Windows 10/11 (x64) |
| `bin/kafka-explorer-macos-arm64`     | macOS (Apple Silicon) |
| `bin/kafka-explorer-macos-x64`       | macOS (Intel) |
| `bin/kafka-explorer-linux-x64`       | Linux (x64) |

Run the file and it starts the app and opens your browser at `http://localhost:8787`.
No Node.js, Bun, or Docker is required — the executable embeds everything.

- **macOS:** if Gatekeeper blocks the first launch (the binaries are not code-signed),
  right-click the file → **Open** → **Open**.
- **Windows:** SmartScreen may warn for the same reason — click **More info** → **Run anyway**.
- The API binds to `0.0.0.0` and is **unauthenticated** — only run it on machines you trust.
- Overrides: `KAFKA_EXPLORER_API_PORT` changes the port, `KAFKA_EXPLORER_NO_OPEN=1`
  skips auto-opening the browser.

### From source (development)

```bash
bun install
bun run dev        # Vite on :5173 (proxies /api) + API on :8787
bun run build      # static frontend in dist/
bun run server:start  # production: API serves dist/ on :8787
```

### Docker

```bash
docker build -t kafka-explorer .
docker run -p 8787:8787 kafka-explorer
```

## Setting up a connection

Open the app and click **Connection settings** (or the connection card on first launch).

1. **Bootstrap brokers** — one `host:port` per line, e.g. `kafka-1.example.com:9093`.
   Use the **advertised** listener addresses from your cluster. If the broker list is long,
   comma-separated values also work.

2. **Connection type** — pick the security model your cluster uses:

   | Type            | When to use                                          |
   | --------------- | ---------------------------------------------------- |
   | `PLAINTEXT`     | No TLS, no auth (dev clusters)                       |
   | `SSL`           | TLS only, no SASL (auth via mTLS client certs if any) |
   | `SASL`          | SASL auth over plaintext (`SASL_PLAINTEXT` listeners) |
   | `SASL_SSL`      | TLS + SASL (most managed clusters)                   |

3. **TLS (SSL / SASL_SSL types)** — each PEM field has an **Upload** button, or paste the text:
   - **CA certificate** — upload your `ca.pem`. Required to trust self-signed/private-CA brokers.
   - **Client certificate / key** — only if the broker requires **mTLS**.
   - **Java keystores** — if your cluster gave you `.jks` / `.p12` files instead of PEM,
     turn on the **Use Java keystores (JKS / PKCS#12)** toggle and upload your `keystore` and
     `truststore`, enter their store passwords (and the key password if it differs), and
     click **Convert → PEM**. The truststore certs are added to the CA field and the
     keystore fills the client certificate and key automatically — converted on the API
     server, nothing Java needed.
   - **Verify broker certificate** — leave ON. Turn off only for private clusters with
     untrusted certificates (clearly insecure).

4. **SASL (SASL / SASL_SSL types)** — pick the mechanism and enter credentials:
   - `SASL/PLAIN` — simple username/password.
   - `SASL/SCRAM-SHA-256` / `SASL/SCRAM-SHA-512` — salted-challenge auth (Confluent, Aiven,
     Redpanda, most managed services).
   - `SASL/OAUTHBEARER` — paste the bearer access token.

5. **Test connection** — verifies broker connectivity, TLS, and auth, and reports the
   cluster ID, broker count, and topic count. Then **Save & explore topics**.

Your connection details are stored in the browser's `localStorage` (plain text) and only
sent to the local API — don't enter production secrets in a shared browser.

To stop using a cluster, click **Disconnect** in the header (confirm once) — it clears the
saved connection from the browser and returns you to the connection form.

## Exploring

### Topics

The Topics page lists every topic with its partition and replication-factor counts.
Type in the filter box to narrow the list; click a row to open the topic.

### Messages (per topic)

Use the filters and press **Search messages**:

- **Key contains / Value contains** — case-sensitive substring match.
- **From / To** — local-time range; messages outside it are skipped.
- **Partition** — restrict to a single partition (default: all).
- **Limit** — 50–1000 messages returned.
- **Sort by time** — newest first (default) or oldest first.

Behavior notes:

- With **no filters** and *newest first*, the app reads only the tail of each partition —
  fast, but it cannot find old messages.
- With **key/value/time filters**, it scans from the beginning of the partitions, capped at
  250k scanned messages with a 60-second timeout. For huge topics, narrow with a time range
  or partition first.
- Rows show timestamp (UTC), partition, offset, key, value, size. Click a row for the full
  value and headers.
- The **Value: Text / Base64** toggle switches payload decoding — use Base64 for binary
  payloads (raw bytes are preserved).
- **Export JSON** downloads the current results.

### Consumer groups (per topic)

The **Consumer groups** tab lists groups subscribed to the topic with their state
(`Stable`, `PreparingRebalance`, …), member count, and **lag** (high watermark minus
committed offset). The list is capped at 150 groups.

- **Realtime lag** — while the tab is open, lag, state, and member counts refresh every
  5 seconds (LIVE badge, with last-update timestamp), so you can watch consumers drain
  or fall behind live.
- **Reset offsets** — use **Reset offsets** on a group to move its committed position on
  this topic to **Earliest** (log start), **Latest** (skip existing messages),
  **Timestamp** (first message at/after a given time), or a **Custom offset** (clamped to
  the log range). The dialog shows the previous and new offset per partition. Active
  consumers pick up the new position on their next fetch.

### Demo mode (no cluster needed)

Set `KAFKA_EXPLORER_DEMO=1` and the API serves sample topics, messages, consumer
groups, and offset resets — useful for trying the UI or capturing screenshots without a
Kafka cluster.

### Help PDF & screenshots

- `docs/Kafka-Explorer-Help.pdf` — generated help guide with screenshots
  (`bun run generate:pdf`, screenshots via `bun run capture:screenshots`).

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Connection timeout` / `Failed to connect` | Broker not reachable from the machine running the app — check the advertised listener and firewall. |
| Certificate error (self-signed) | Upload the broker CA in the TLS section, or temporarily turn off "Verify broker certificate". |
| `SASL Authentication failed` | Wrong mechanism or credentials. SCRAM-SHA-512 vs 256 matters — check the broker's `listeners`/SASL config. |
| `No leader for topic-partition` | Topic exists but has no live leader — check broker health. |
| Search returns nothing on a big topic | With newest-first and no filters only the tail is read; add a time range or use oldest-first + filters. |
| Port 8787 already in use | Set `KAFKA_EXPLORER_API_PORT` (or restart the other process). |
