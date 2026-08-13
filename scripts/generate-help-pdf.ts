import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

/**
 * Generates docs/Kafka-Explorer-Help.pdf — a styled help guide with the
 * screenshots captured by scripts/capture-screenshots.ts.
 */

const OUT = path.resolve("docs/Kafka-Explorer-Help.pdf");
const SHOTS = path.resolve("docs/screenshots");

const AMBER = "#f59e0b";
const DARK = "#18181b";
const GRAY = "#52525b";
const LIGHT = "#f4f4f5";
const LINE = "#e4e4e7";

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 56, bottom: 56, left: 52, right: 52 },
  info: { Title: "Kafka Explorer — Help & User Guide", Author: "Kafka Explorer" },
  bufferPages: true,
});

doc.pipe(createWriteStream(OUT));

const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

function ensureSpace(height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function h1(text: string) {
  ensureSpace(70);
  doc
    .fillColor(AMBER)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(text, doc.page.margins.left, doc.y, { width: W });
  doc.moveDown(0.5);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(1)
    .strokeColor(LINE)
    .stroke();
  doc.moveDown(0.8);
}

function h2(text: string) {
  ensureSpace(50);
  doc.moveDown(0.6);
  doc.fillColor(DARK).font("Helvetica-Bold").fontSize(14).text(text, { width: W });
  doc.moveDown(0.4);
}

function p(text: string) {
  doc.fillColor(DARK).font("Helvetica").fontSize(10.5).text(text, { width: W, lineGap: 3 });
  doc.moveDown(0.4);
}

function bullets(items: string[]) {
  doc.moveDown(0.2);
  for (const item of items) {
    ensureSpace(30);
    doc
      .fillColor(AMBER)
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .text("•  ", doc.page.margins.left + 4, doc.y);
    const x = doc.page.margins.left + 18;
    doc.fillColor(DARK).font("Helvetica").fontSize(10.5).text(item, x, doc.y, { width: W - 18, lineGap: 2 });
    doc.moveDown(0.25);
  }
  doc.moveDown(0.4);
}

function image(file: string, label: string) {
  const filePath = path.join(SHOTS, file);
  if (!existsSync(filePath)) {
    p(`(missing screenshot: ${file})`);
    return;
  }
  const imgW = Math.min(W, 430);
  // Screenshots are captured at 1440x900; preserve that aspect ratio.
  const imgH = imgW * (900 / 1440);
  ensureSpace(imgH + 40);
  doc.moveDown(0.4);
  doc.image(filePath, doc.page.margins.left + (W - imgW) / 2, doc.y, { width: imgW });
  doc.y += imgH + 6;
  doc.fillColor(GRAY).font("Helvetica-Oblique").fontSize(8.5).text(label, { width: W, align: "center" });
  doc.moveDown(0.8);
}

// ---------- Cover ----------
doc
  .rect(0, 0, doc.page.width, 240)
  .fill("#09090b");
doc
  .fillColor(AMBER)
  .font("Helvetica-Bold")
  .fontSize(11)
  .text("K A F K A   E X P L O R E R", doc.page.margins.left, 90);
doc
  .fillColor(LIGHT)
  .font("Helvetica-Bold")
  .fontSize(30)
  .text("Help & User Guide", doc.page.margins.left, 116, { width: W });
doc
  .fillColor("#a1a1aa")
  .font("Helvetica")
  .fontSize(11)
  .text(
    "Browse topics · search messages · inspect consumer groups and live lag · reset offsets",
    doc.page.margins.left,
    160,
    { width: W }
  );
doc
  .fillColor("#71717a")
  .font("Helvetica")
  .fontSize(9.5)
  .text(`Version 0.1.0 · ${new Date().toISOString().slice(0, 10)}`, doc.page.margins.left, 196);

doc.y = 260;
h2("Contents");
bullets([
  "Overview",
  "Running the app (dev, Docker, desktop executables)",
  "Connecting to a cluster (SSL / SASL / SASL_SSL, ca.pem upload)",
  "Exploring topics",
  "Searching messages",
  "Consumer groups — realtime lag and resetting offsets",
  "Security & troubleshooting",
]);

// ---------- Overview ----------
h1("Overview");
p(
  "Kafka Explorer is a self-hosted web UI for exploring Apache Kafka clusters. It connects to your cluster with " +
    "plaintext, TLS/SSL, or SASL authentication (PLAIN, SCRAM-SHA-256, SCRAM-SHA-512, OAUTHBEARER), lists topics, " +
    "searches messages by key, value, time and partition, and shows consumer group state with live lag — including " +
    "the ability to reset a group's committed offsets."
);
bullets([
  "Connections support TLS with a CA certificate (ca.pem upload), mTLS client certificates, JKS/PKCS#12 keystore + truststore uploads with passwords (converted to PEM), and SASL over TLS (SASL_SSL).",
  "Disconnect clears the saved connection from the browser and returns to the connection form.",
  "Message search: substring filters on key/value, time range, per-partition filter, sort by time, base64 view, JSON export.",
  "Consumer groups: state, members, live lag with a 5-second auto-refresh, and offset reset to earliest, latest, timestamp, or a custom offset.",
  "Runs from source, in Docker, or as single-file desktop executables for Windows, macOS and Linux.",
]);

// ---------- Running ----------
h1("Running the app");
h2("Development");
bullets([
  "bun install  — install dependencies",
  "bun run dev  — Vite on :5173 (proxies /api) + API on :8787",
  "bun run build  — production frontend build into dist/",
  "bun run server:start  — serve the built app from the API on :8787",
]);
h2("Desktop executables");
p(
  "bun run build:desktop  cross-compiles the whole app into single-file executables in bin/ " +
    "(Windows x64 .exe, macOS arm64 + x64, Linux x64). Run the file and your browser opens at http://localhost:8787 — " +
    "no Node, Bun, or Docker required. Full instructions: EXECUTABLES.md in the repository."
);

// ---------- Connecting ----------
h1("Connecting to a cluster");
p(
  "Open the app and pick the connection type that matches your cluster: PLAINTEXT (no security), SSL (TLS only), " +
    "SASL (auth without TLS), or SASL_SSL (TLS + SASL — the common choice for managed clusters such as Confluent, " +
    "Aiven, or Redpanda)."
);
image("02-sasl-ssl.png", "SASL_SSL connection form with ca.pem upload and SASL credentials");
bullets([
  "Bootstrap brokers: one host:port per line (use the advertised listeners).",
  "TLS: upload your ca.pem to trust a private/self-signed CA; client certificate + key only if the broker requires mTLS.",
  "SASL: choose PLAIN or SCRAM-SHA-256/512 and enter username/password, or OAUTHBEARER with a bearer token.",
  "Test connection verifies brokers, TLS and auth before saving.",
  "Connection details are stored in the browser's localStorage and only sent to the local API.",
]);
image("01-connection.png", "Connection form — choose your security model");

// ---------- Topics ----------
h1("Exploring topics");
p(
  "The Topics page lists every topic with its partition and replication-factor counts. Filter by name, then click a " +
    "topic to open it."
);
image("03-topics.png", "Topics list");
p("Each topic opens with two tabs: Messages (search) and Consumer groups.");

// ---------- Messages ----------
h1("Searching messages");
p(
  "The Messages tab filters the topic by key/value substring, time range, partition, and limit, and sorts results by " +
    "time (newest or oldest first). With no filters and newest-first, only the tail of each partition is read for fast " +
    "results; filtered searches scan from the beginning (capped at 250k messages). Click a row to expand the full value " +
    "and headers. Use the Text/Base64 toggle for binary payloads and Export JSON to download results."
);
image("04-messages.png", "Message search results with filters");

// ---------- Consumer groups ----------
h1("Consumer groups");
p(
  "The Consumer groups tab shows the groups subscribed to the topic: state (Stable, PreparingRebalance, Dead, …), " +
    "member count, and lag. Lag updates every 5 seconds while the tab is open — the LIVE badge shows when data was " +
    "last refreshed, so you can watch consumers drain (or fall behind) in real time."
);
image("05-consumer-groups.png", "Consumer groups with live lag");

h2("Resetting offsets");
p(
  "Use Reset offsets to move a group's committed position on this topic: Earliest (start from the beginning), Latest " +
    "(skip existing messages), Timestamp (first message at/after a given time), or a Custom offset (clamped to the " +
    "log range). The dialog shows the previous and new offset per partition after the reset. Active consumers pick up " +
    "the new position on their next fetch — consumption may duplicate or skip messages."
);
image("06-reset-offsets.png", "Reset offsets dialog");

// ---------- Security / troubleshooting ----------
h1("Security & troubleshooting");
bullets([
  "The API is unauthenticated and binds to 0.0.0.0 — only run it on machines you trust; don't expose port 8787 to the public internet.",
  "Kafka credentials are stored in the browser in plain text (localStorage) — avoid production secrets in a shared browser.",
  "Desktop executables are not code-signed: macOS Gatekeeper (right-click → Open) and Windows SmartScreen (More info → Run anyway) may warn.",
  "Connection timeout → broker unreachable from the machine running the app; check advertised listeners and firewall.",
  "Certificate error → upload the broker CA, or disable certificate verification for private clusters.",
  "SASL authentication failed → wrong mechanism or credentials; SCRAM-SHA-512 vs 256 matters.",
  "Port 8787 in use → set KAFKA_EXPLORER_API_PORT.",
]);

doc.end();
console.log(`Generated ${OUT}`);
