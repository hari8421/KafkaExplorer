# Kafka Explorer — Desktop Executables

The whole app — Express API + KafkaJS + embedded frontend — can be compiled into
**single-file executables** for Windows and macOS (plus Linux). The executables need no
Node.js, Bun, or Docker on the machine that runs them.

## Generate the executables

You only need [Bun](https://bun.sh) (v1.1+). Everything else is in the repo.

```bash
# 1. Install dependencies
bun install

# 2. Build the frontend, embed it, and cross-compile all targets
bun run build:desktop
```

Cross-compilation works from **any** operating system — you can build the Windows `.exe`
on a Mac and the macOS binaries on Linux. Bun does it all in one command.

### Output

Binaries are written to `bin/`:

| File | Platform | How to run |
| --- | --- | --- |
| `bin/kafka-explorer-windows-x64.exe` | Windows 10/11 (x64) | double-click |
| `bin/kafka-explorer-macos-arm64` | macOS (Apple Silicon) | double-click |
| `bin/kafka-explorer-macos-x64` | macOS (Intel) | double-click |
| `bin/kafka-explorer-linux-x64` | Linux (x64) | `./bin/kafka-explorer-linux-x64` |

### What the command does

1. `bun run build` — builds the frontend to `dist/`.
2. `bun run desktop:generate` — embeds `dist/` into `desktop/generated-assets.ts`
   (this is what makes the executable self-contained).
3. `bun scripts/build-desktop.ts` — cross-compiles `desktop/standalone.ts` into the four
   targets above.

If you change the frontend or backend code, just re-run `bun run build:desktop` to
regenerate all executables. `bin/` is git-ignored.

## Run the executables

Double-click the file (or run it from a terminal — see below). It starts the app and
**opens your browser automatically** at `http://localhost:8787`. Close the terminal window
(or press Ctrl-C) to stop it.

### Windows

```powershell
.\bin\kafka-explorer-windows-x64.exe
```

- Windows SmartScreen may warn because the binary is **not code-signed**:
  click **More info** → **Run anyway**.
- Antivirus software may flag unsigned binaries — add an exclusion if it blocks launch.

### macOS

```bash
# Apple Silicon:
./bin/kafka-explorer-macos-arm64
# Intel:
./bin/kafka-explorer-macos-x64
```

- Gatekeeper may block the first launch because the binary is not notarized:
  **right-click the file → Open → Open**, then it will run normally afterwards.
- Check your chip with `uname -m` (`arm64` = Apple Silicon, `x86_64` = Intel).

### Linux

```bash
./bin/kafka-explorer-linux-x64
```

(Add execute permission first if needed: `chmod +x bin/kafka-explorer-linux-x64`.)

### Options

| Environment variable | Effect |
| --- | --- |
| `KAFKA_EXPLORER_API_PORT` | Port to listen on (default `8787`; picks a free port automatically if busy) |
| `KAFKA_EXPLORER_BIND_HOST` | Address to bind (default `0.0.0.0`) |
| `KAFKA_EXPLORER_NO_OPEN=1` | Do not auto-open the browser |

Example:

```bash
KAFKA_EXPLORER_API_PORT=9000 ./bin/kafka-explorer-linux-x64
```

## Security notes

- The API is **unauthenticated** and binds to `0.0.0.0` — only run it on machines you
  trust, and don't expose port 8787 to the public internet.
- Kafka connection credentials are stored by the browser in `localStorage` (plain text)
  and sent to the local API — avoid entering production secrets in a shared browser.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| SmartScreen / Gatekeeper / AV blocks launch | See platform notes above (unsigned binary). |
| Browser doesn't open | The app is still running — visit `http://localhost:8787` manually. |
| Port 8787 in use | Set `KAFKA_EXPLORER_API_PORT`, e.g. `KAFKA_EXPLORER_API_PORT=9000`. |
| `bin/` is missing or stale | Re-run `bun run build:desktop`. |
| Search `Failed to connect` to Kafka | See [`docs/USAGE.md`](docs/USAGE.md) — connection setup and troubleshooting. |
