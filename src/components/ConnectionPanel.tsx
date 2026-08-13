import { useRef, useState, type FormEvent } from "react";
import type { ClusterInfo, ConnectionConfig, SaslMechanism } from "../../shared/kafka";
import { api } from "../lib/api";
import { Button, Card, Field, Input, Select, Spinner, Textarea, Toggle } from "./ui";

const CONNECTION_TYPES = [
  { value: "plaintext", label: "PLAINTEXT — no encryption, no auth" },
  { value: "ssl", label: "SSL — TLS only, no SASL" },
  { value: "sasl-plaintext", label: "SASL — auth without TLS" },
  { value: "sasl-ssl", label: "SASL_SSL — TLS + SASL auth" },
] as const;

type ConnectionType = (typeof CONNECTION_TYPES)[number]["value"];

const SASL_MECHANISMS: Array<{ value: SaslMechanism; label: string }> = [
  { value: "plain", label: "SASL/PLAIN" },
  { value: "scram-sha-256", label: "SASL/SCRAM-SHA-256" },
  { value: "scram-sha-512", label: "SASL/SCRAM-SHA-512" },
  { value: "oauthbearer", label: "SASL/OAUTHBEARER" },
];

type FormState = ReturnType<typeof configToForm>;

function configToForm(cfg: ConnectionConfig | null) {
  return {
    brokers: cfg?.brokers.join("\n") ?? "",
    clientId: cfg?.clientId ?? "",
    sslEnabled: cfg?.ssl.enabled ?? false,
    sslCa: cfg?.ssl.ca ?? "",
    sslCert: cfg?.ssl.cert ?? "",
    sslKey: cfg?.ssl.key ?? "",
    rejectUnauthorized: cfg?.ssl.rejectUnauthorized ?? true,
    mechanism: cfg?.sasl.mechanism ?? "none",
    username: cfg?.sasl.username ?? "",
    password: cfg?.sasl.password ?? "",
    token: cfg?.sasl.token ?? "",
  };
}

function getConnectionType(f: FormState): ConnectionType {
  const sasl = f.mechanism !== "none";
  if (f.sslEnabled && sasl) return "sasl-ssl";
  if (f.sslEnabled) return "ssl";
  if (sasl) return "sasl-plaintext";
  return "plaintext";
}

function applyConnectionType(f: FormState, type: ConnectionType): Pick<FormState, "sslEnabled" | "mechanism"> {
  switch (type) {
    case "plaintext":
      return { sslEnabled: false, mechanism: "none" };
    case "ssl":
      return { sslEnabled: true, mechanism: "none" };
    case "sasl-plaintext":
      return { sslEnabled: false, mechanism: f.mechanism === "none" ? "plain" : f.mechanism };
    case "sasl-ssl":
      return { sslEnabled: true, mechanism: f.mechanism === "none" ? "plain" : f.mechanism };
  }
}

function PemUploadButton({
  label,
  accept,
  onFile,
  onBinary,
}: {
  label: string;
  accept?: string;
  /** Text files (PEM) — read as UTF-8 text. */
  onFile?: (content: string) => void;
  /** When set, the file is read as base64 instead of text (for binary keystores). */
  onBinary?: (dataBase64: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={
          accept ??
          ".pem,.crt,.cer,.key,.p12,.cert,text/plain,application/x-pem-file,application/x-x509-ca-cert"
        }
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (onBinary) {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });
            onBinary(dataUrl.slice(dataUrl.indexOf(",") + 1));
          } else if (onFile) {
            onFile(await file.text());
          }
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 10V2m0 0L5 5m3-3 3 3M2.5 9.5v3a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
    </>
  );
}

export function ConnectionPanel({
  initial,
  onSaved,
  onClose,
}: {
  initial: ConnectionConfig | null;
  onSaved: (config: ConnectionConfig) => void;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => configToForm(initial));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; info?: ClusterInfo; error?: string } | null>(null);
  const [ksData, setKsData] = useState("");
  const [ksPassword, setKsPassword] = useState("");
  const [ksKeyPassword, setKsKeyPassword] = useState("");
  const [tsData, setTsData] = useState("");
  const [tsPassword, setTsPassword] = useState("");
  const [ksEnabled, setKsEnabled] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function buildConfig(): ConnectionConfig {
    return {
      brokers: form.brokers.split(/[\n,]+/).map((b) => b.trim()).filter(Boolean),
      clientId: form.clientId.trim() || undefined,
      ssl: {
        enabled: form.sslEnabled,
        ca: form.sslCa,
        cert: form.sslCert,
        key: form.sslKey,
        rejectUnauthorized: form.rejectUnauthorized,
      },
      sasl: {
        mechanism: form.mechanism,
        username: form.username,
        password: form.password,
        token: form.token,
      },
    };
  }

  async function handleConvertKeystore() {
    if (!ksData) return;
    setConverting(true);
    setConvertMsg(null);
    setConvertError(null);
    try {
      const res = await api.convertTls({
        keystore: { dataBase64: ksData, password: ksPassword },
        keyPassword: ksKeyPassword || undefined,
      });
      const ks = res.keystore;
      if (ks?.key && ks?.cert) {
        set("sslCert", ks.cert);
        set("sslKey", ks.key);
      }
      if (ks?.ca && !form.sslCa.trim()) set("sslCa", ks.ca);
      setConvertMsg(`Imported ${ks?.aliases?.join(", ") ?? "keystore"} — client certificate and key filled in above.`);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : String(err));
    } finally {
      setConverting(false);
    }
  }

  async function handleConvertTruststore() {
    if (!tsData) return;
    setConverting(true);
    setConvertMsg(null);
    setConvertError(null);
    try {
      const res = await api.convertTls({ truststore: { dataBase64: tsData, password: tsPassword } });
      const ca = res.truststore?.ca;
      if (ca) {
        set("sslCa", form.sslCa.trim() ? `${form.sslCa.trim()}\n${ca}` : ca);
      }
      setConvertMsg("Truststore imported — CA certificate(s) added above.");
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : String(err));
    } finally {
      setConverting(false);
    }
  }

  async function handleTest(e: FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const info = await api.testConnection(buildConfig());
      setTestResult({ ok: true, info });
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    onSaved(buildConfig());
  }

  const connType = getConnectionType(form);
  const showTls = connType === "ssl" || connType === "sasl-ssl";
  const showSasl = connType === "sasl-plaintext" || connType === "sasl-ssl";

  return (
    <Card className="mx-auto w-full max-w-2xl p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Connect to a Kafka cluster</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Supports plaintext, TLS/SSL, and SASL (PLAIN, SCRAM-SHA-256/512, OAUTHBEARER). Credentials stay in your
            browser and are only sent to the local API.
          </p>
        </div>
        {onClose ? (
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        ) : null}
      </div>

      <form onSubmit={handleTest} className="space-y-4">
        <Field label="Bootstrap brokers" hint="One host:port per line (or comma-separated).">
          <Textarea
            rows={3}
            value={form.brokers}
            onChange={(e) => set("brokers", e.target.value)}
            placeholder={"localhost:9092\nkafka-1.example.com:9093"}
            spellCheck={false}
            required
          />
        </Field>

        <Field label="Connection type" hint="Pick the security model your cluster uses (e.g. SASL_SSL for SASL over TLS).">
          <Select
            data-testid="connection-type"
            value={connType}
            onChange={(e) => {
              const next = applyConnectionType(form, e.target.value as ConnectionType);
              setForm((f) => ({ ...f, ...next }));
            }}
          >
            {CONNECTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Client ID" hint="Optional identifier used when connecting to the cluster.">
          <Input
            value={form.clientId}
            onChange={(e) => set("clientId", e.target.value)}
            placeholder="kafka-explorer"
          />
        </Field>

        {showTls ? (
          <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/80 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">TLS / SSL</p>
              <span className="text-xs text-zinc-500">Encryption for the broker connection</span>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  CA certificate (PEM)
                </span>
                <PemUploadButton label="ca.pem" onFile={(content) => set("sslCa", content)} />
              </div>
              <Textarea
                rows={3}
                value={form.sslCa}
                onChange={(e) => set("sslCa", e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----"
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Upload or paste your ca.pem. Needed to trust self-signed / private-CA brokers.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Client certificate (PEM)
                  </span>
                  <PemUploadButton label="cert.pem" onFile={(content) => set("sslCert", content)} />
                </div>
                <Textarea
                  rows={3}
                  value={form.sslCert}
                  onChange={(e) => set("sslCert", e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-zinc-500">Only if the broker requires client certificates (mTLS).</p>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Client key (PEM)</span>
                  <PemUploadButton label="key.pem" onFile={(content) => set("sslKey", content)} />
                </div>
                <Textarea
                  rows={3}
                  value={form.sslKey}
                  onChange={(e) => set("sslKey", e.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-zinc-500">Private key for the client certificate above.</p>
              </div>
            </div>

            <Toggle
              checked={ksEnabled}
              onChange={setKsEnabled}
              label="Use Java keystores (JKS / PKCS#12)"
              hint="Upload keystore/truststore files with passwords — converted to PEM automatically"
            />

            {ksEnabled ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                      Keystore (client cert + key)
                    </span>
                    <PemUploadButton
                      label="keystore.jks / .p12"
                      accept=".jks,.p12,.pfx,.pkcs12,application/octet-stream"
                      onBinary={setKsData}
                    />
                  </div>
                  <Input
                    type="password"
                    value={ksPassword}
                    onChange={(e) => setKsPassword(e.target.value)}
                    placeholder="Keystore password"
                    autoComplete="off"
                  />
                  <Input
                    type="password"
                    value={ksKeyPassword}
                    onChange={(e) => setKsKeyPassword(e.target.value)}
                    placeholder="Key password (optional)"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full text-xs"
                    onClick={handleConvertKeystore}
                    disabled={converting || !ksData}
                    data-testid="convert-keystore"
                  >
                    {converting ? <Spinner /> : "Convert keystore → PEM"}
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                      Truststore (CA certs)
                    </span>
                    <PemUploadButton
                      label="truststore.jks / .p12"
                      accept=".jks,.p12,.pfx,.pkcs12,application/octet-stream"
                      onBinary={setTsData}
                    />
                  </div>
                  <Input
                    type="password"
                    value={tsPassword}
                    onChange={(e) => setTsPassword(e.target.value)}
                    placeholder="Truststore password"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full text-xs"
                    onClick={handleConvertTruststore}
                    disabled={converting || !tsData}
                    data-testid="convert-truststore"
                  >
                    {converting ? <Spinner /> : "Convert truststore → PEM"}
                  </Button>
                </div>
              </div>
              {convertMsg ? (
                <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {convertMsg}
                </p>
              ) : null}
              {convertError ? (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 break-all font-mono text-xs text-red-300/90">
                  {convertError}
                </p>
              ) : null}
              <p className="mt-3 text-xs text-zinc-500">
                Truststore certs are added to the CA field above; the keystore fills the client certificate and key.
              </p>
            </div>
            ) : null}

            <Toggle
              checked={form.rejectUnauthorized}
              onChange={(v) => set("rejectUnauthorized", v)}
              label="Verify broker certificate"
              hint="Turn off to skip certificate validation — only for private clusters with untrusted certs"
            />
          </div>
        ) : null}

        {showSasl ? (
          <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/80 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">SASL authentication</p>
              <span className="text-xs text-zinc-500">Credentials the broker requires</span>
            </div>
            <Field label="Mechanism">
              <Select value={form.mechanism} onChange={(e) => set("mechanism", e.target.value as SaslMechanism)}>
                {SASL_MECHANISMS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            {form.mechanism === "oauthbearer" ? (
              <Field label="OAuth access token" hint="Sent directly to the broker as the bearer token.">
                <Textarea
                  rows={2}
                  value={form.token}
                  onChange={(e) => set("token", e.target.value)}
                  placeholder="eyJhbGciOi..."
                  spellCheck={false}
                  required
                />
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Username">
                  <Input
                    data-testid="sasl-username"
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field label="Password">
                  <Input
                    data-testid="sasl-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    autoComplete="off"
                    required
                  />
                </Field>
              </div>
            )}
          </div>
        ) : null}

        {testResult ? (
          testResult.ok && testResult.info ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <p className="font-medium">Connection successful</p>
              <p className="mt-0.5 text-emerald-300/80">
                Cluster {testResult.info.clusterId ?? "unknown"} · {testResult.info.brokers.length} broker
                {testResult.info.brokers.length === 1 ? "" : "s"} · {testResult.info.topics} topic
                {testResult.info.topics === 1 ? "" : "s"}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              <p className="font-medium">Connection failed</p>
              <p className="mt-0.5 break-all font-mono text-xs text-red-300/90">{testResult.error}</p>
            </div>
          )
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" variant="secondary" disabled={testing} data-testid="test-connection">
            {testing ? (
              <>
                <Spinner /> Testing…
              </>
            ) : (
              "Test connection"
            )}
          </Button>
          <Button type="button" onClick={handleSave} data-testid="save-connection">
            Save & explore topics
          </Button>
        </div>
      </form>
    </Card>
  );
}
