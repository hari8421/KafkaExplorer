import { spawn, execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Captures the docs/screenshots against the compiled Linux binary running in
 * demo mode (the preview server can't enable KAFKA_EXPLORER_DEMO). Spawns the
 * binary, waits for /api/health, runs scripts/capture-screenshots.ts, then
 * shuts the binary down — a single self-terminating command.
 */

const BIN = "./bin/kafka-explorer-linux-x64";
const PORT = "8899";
const URL = `http://localhost:${PORT}`;

if (!existsSync(BIN)) {
  console.error(`Missing ${BIN} — run "bun run build:desktop" first.`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const child = spawn(BIN, [], {
    env: {
      ...process.env,
      KAFKA_EXPLORER_DEMO: "1",
      KAFKA_EXPLORER_NO_OPEN: "1",
      KAFKA_EXPLORER_API_PORT: PORT,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  let ready = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = execSync(`curl -sS -m 3 ${URL}/api/health`, { encoding: "utf8" });
      if (res.includes("ok")) {
        ready = true;
        break;
      }
    } catch {
      // not up yet
    }
    await sleep(300);
  }

  if (!ready) {
    child.kill("SIGKILL");
    console.error("Demo binary did not become ready.");
    process.exit(1);
  }

  console.log(`Demo binary ready at ${URL}`);
  try {
    const result = spawnSync("bun", ["scripts/capture-screenshots.ts"], {
      stdio: "inherit",
      env: { ...process.env, PREVIEW_URL: URL },
    });
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  } finally {
    child.kill("SIGTERM");
    console.log("Demo binary stopped.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
