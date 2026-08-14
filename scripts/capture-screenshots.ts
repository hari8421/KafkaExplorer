import { mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Captures screenshots of the Kafka Explorer UI into docs/screenshots/.
 *
 * Requires the app running with KAFKA_EXPLORER_DEMO=1 so the connected screens
 * render sample data. Point PREVIEW_URL at the running app (default localhost:5173).
 */

const BASE_URL = process.env.PREVIEW_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve("docs/screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const shots: Array<{ file: string; label: string }> = [];

async function shot(page: import("playwright").Page, file: string, label: string) {
  const target = path.join(OUT_DIR, file);
  await page.screenshot({ path: target });
  shots.push({ file, label });
  console.log(`Captured ${target}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: "reduce" });

  // --- 1. Fresh connection form ---
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByTestId("connection-type").waitFor({ state: "visible" });
  await shot(page, "01-connection.png", "Connection form");

  // --- 2. SASL_SSL selected, demo test connection ---
  await page.locator("textarea").first().fill("demo-broker:9092");
  await page.getByTestId("connection-type").selectOption("sasl-ssl");
  await page.getByRole("button", { name: "ca.pem" }).waitFor({ state: "visible" });
  await page.getByTestId("sasl-username").fill("demo-user");
  await page.getByTestId("sasl-password").fill("demo-pass");
  await page.getByTestId("test-connection").click();
  await page.getByText("Connection successful").waitFor({ state: "visible" });
  await shot(page, "02-sasl-ssl.png", "SASL_SSL connection");

  // --- 3. Topics list ---
  await page.getByTestId("save-connection").click();
  await page.getByTestId("topic-orders").waitFor({ state: "visible" });
  await shot(page, "03-topics.png", "Topics list");

  // --- 4. Message search results ---
  await page.getByTestId("topic-orders").click();
  await page.getByTestId("tab-messages").waitFor({ state: "visible" });
  await page.getByTestId("search-messages").click();
  await page.getByText("ord-10231", { exact: true }).waitFor({ state: "visible" });
  await shot(page, "04-messages.png", "Message search");

  // --- 5. Consumer groups with live lag ---
  await page.getByTestId("tab-consumers").click();
  await page.getByTestId("live-badge").waitFor({ state: "visible" });
  await page.getByTestId("reset-orders-processor").waitFor({ state: "visible" });
  await page.waitForTimeout(800);
  await shot(page, "05-consumer-groups.png", "Consumer groups (live lag)");

  // --- 6. Reset offsets dialog ---
  await page.getByTestId("reset-orders-processor").click();
  await page.getByTestId("confirm-reset").waitFor({ state: "visible" });
  await shot(page, "06-reset-offsets.png", "Reset offsets dialog");

  // --- 7. Testing tab: produce + load test + group reset helpers ---
  await page.getByTestId("confirm-reset").click();
  await page.getByRole("button", { name: "Done" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("tab-testing").click();
  await page.getByTestId("produce-key").fill("ord-90001");
  await page.getByTestId("produce-value").fill('{"orderId":"ord-90001","qty":1,"status":"paid"}');
  await page.getByTestId("produce-button").click();
  await page.getByTestId("produce-result").waitFor({ state: "visible" });
  await page.getByTestId("loadtest-preview-button").click();
  await page.getByTestId("loadtest-start").click();
  await page.getByTestId("loadtest-result").waitFor({ state: "visible" });
  await page.waitForTimeout(400);
  const testingShot = path.join(OUT_DIR, "07-testing.png");
  await page.screenshot({ path: testingShot, fullPage: true });
  shots.push({ file: "07-testing.png", label: "Testing tab (produce + load test)" });
  console.log(`Captured ${testingShot}`);

  await browser.close();

  console.log(`\n${shots.length} screenshots written to ${OUT_DIR}:`);
  for (const s of shots) {
    const size = statSync(path.join(OUT_DIR, s.file)).size;
    console.log(`  ${s.file} (${(size / 1024).toFixed(0)} KB) — ${s.label}`);
  }
}

if (!existsSync(path.resolve("src"))) {
  console.error("Run from the project root.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
