import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const TARGETS = [
  { target: "bun-darwin-arm64", out: "bin/kafka-explorer-macos-arm64" },
  { target: "bun-darwin-x64", out: "bin/kafka-explorer-macos-x64" },
  { target: "bun-windows-x64", out: "bin/kafka-explorer-windows-x64.exe" },
  { target: "bun-linux-x64", out: "bin/kafka-explorer-linux-x64" },
];

mkdirSync("bin", { recursive: true });

for (const { target, out } of TARGETS) {
  console.log(`\nBuilding ${out} (${target})…`);
  const result = spawnSync(
    "bun",
    ["build", "--compile", "--target", target, "desktop/standalone.ts", "--outfile", out],
    { stdio: "inherit" }
  );
  if (result.status !== 0) {
    console.error(`Failed to build ${target}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nDesktop executables written to bin/");
