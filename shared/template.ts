/**
 * Tiny template renderer used by the load-test generator (shared so the
 * frontend can preview a generated message and the backend produces them
 * with the exact same substitution logic).
 *
 * Placeholders are replaced per message:
 *   {{i}}          message index (0-based)
 *   {{ts}}         epoch milliseconds when the message was generated
 *   {{ts_iso}}     ISO-8601 timestamp
 *   {{uuid}}       random UUID v4
 *   {{rand}}       random integer 0..999999
 *   {{rand:N}}     random integer 0..N-1
 *   {{randstr:N}}  random alphanumeric string of length N (default 8)
 *
 * Unknown tokens are left untouched so arbitrary payloads still render.
 */

const ALPHANUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randStr(len: number): string {
  let out = "";
  for (let k = 0; k < len; k++) out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  return out;
}

export function renderTemplate(template: string, i: number): string {
  return template.replace(/\{\{\s*(\w+)(?::(\d+))?\s*\}\}/g, (match, name: string, arg?: string) => {
    const n = arg ? Math.max(1, Number(arg)) : 0;
    switch (name) {
      case "i":
        return String(i);
      case "ts":
        return String(Date.now());
      case "ts_iso":
        return new Date().toISOString();
      case "uuid":
        return uuid();
      case "rand":
        return String(Math.floor(Math.random() * (n || 1_000_000)));
      case "randstr":
        return randStr(n || 8);
      default:
        return match;
    }
  });
}
