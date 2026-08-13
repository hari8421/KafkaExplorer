import { toPem, type JksResult } from "jks-js";

export interface TlsConvertResult {
  /** Aliases found in the keystore */
  aliases: string[];
  /** Combined trusted certificates (PEM) */
  ca?: string;
  /** Certificate chain of the first private-key entry (PEM) */
  cert?: string;
  /** Decrypted private key (PEM) */
  key?: string;
}

/**
 * Converts a Java keystore or truststore (JKS or PKCS#12) into PEM material that
 * KafkaJS/Node can use. `storePassword` unlocks the store; `keyPassword` decrypts
 * the private key when it differs from the store password.
 */
export function convertKeystore(
  keystore: Buffer,
  storePassword: string,
  keyPassword?: string
): TlsConvertResult {
  let entries: JksResult;
  try {
    entries = toPem(keystore, storePassword, keyPassword);
  } catch (err) {
    throw new Error(
      `Could not read keystore: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const aliases = Object.keys(entries);
  if (aliases.length === 0) {
    throw new Error("Keystore contains no entries — check the file and store password.");
  }

  const caCerts: string[] = [];
  let cert: string | undefined;
  let key: string | undefined;

  for (const alias of aliases) {
    const entry = entries[alias];
    if (!entry) continue;
    if (entry.ca) caCerts.push(entry.ca);
    if (entry.cert && entry.key) {
      if (cert === undefined && key === undefined) {
        cert = entry.cert;
        key = entry.key;
      } else {
        // Additional key entries: treat their chains as trusted certs.
        caCerts.push(entry.cert);
      }
    }
  }

  return {
    aliases,
    ca: caCerts.length > 0 ? caCerts.join("\n") : undefined,
    cert,
    key,
  };
}
