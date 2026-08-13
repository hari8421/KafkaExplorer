export function formatTimestamp(ms: number): string {
  if (!ms || Number.isNaN(ms)) return "—";
  return new Date(ms).toISOString().replace("T", " ").replace("Z", " UTC");
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function truncate(s: string | null | undefined, max = 160): string {
  if (s == null) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
