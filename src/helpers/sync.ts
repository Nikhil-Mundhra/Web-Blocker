import type { Schema, Schedule, Mode, Resolution } from "../storage/schema";

export interface SyncedSettings {
  blocked: string[];
  mode: Mode;
  timeLimits: Record<string, number>;
  challengePhrase: string;
  challengeRepeatCount: number;
  schedule: Schedule;
  resolution: Resolution;
  redirectUrl: string;
  disableDelay: number;
  blockByTitle: boolean;
  updatedAt: number;
}

export interface EncryptedSyncBlob {
  keyId: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a user-friendly Sync Key (e.g., st_8f7b...32 hex chars)
 */
export function generateSyncKey(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `st_${hex}`;
}

/**
 * Derives the public Key ID and AES-GCM CryptoKey from the secret sync key.
 * Public Key ID is the first 16 bytes of SHA-256(syncKey), formatted as hex.
 */
export async function deriveCredentials(syncKey: string): Promise<{ keyId: string; cryptoKey: CryptoKey }> {
  const cleanKey = syncKey.trim();
  const keyBytes = new TextEncoder().encode(cleanKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
  const hashBytes = new Uint8Array(hashBuffer);

  // Use first 16 bytes of hash as public key ID for lookup
  const keyId = Array.from(hashBytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Use full 32-byte hash as AES-GCM 256 key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  return { keyId, cryptoKey };
}

/**
 * Encrypts a payload client-side using AES-GCM.
 */
export async function encryptPayload(syncKey: string, payload: SyncedSettings): Promise<EncryptedSyncBlob> {
  const { keyId, cryptoKey } = await deriveCredentials(syncKey);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const jsonStr = JSON.stringify(payload);
  const encoded = new TextEncoder().encode(jsonStr);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded,
  );

  return {
    keyId,
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
    updatedAt: payload.updatedAt,
  };
}

/**
 * Decrypts a remote encrypted blob client-side.
 */
export async function decryptPayload(
  syncKey: string,
  blob: { iv: string; ciphertext: string },
): Promise<SyncedSettings> {
  const { cryptoKey } = await deriveCredentials(syncKey);
  const iv = base64ToBuffer(blob.iv);
  const ciphertext = base64ToBuffer(blob.ciphertext);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext,
  );

  const jsonStr = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(jsonStr) as SyncedSettings;
}

/**
 * Extracts syncable configuration from a storage schema.
 */
export function extractSyncPayload(storageData: Partial<Schema>): SyncedSettings {
  return {
    blocked: Array.isArray(storageData.blocked) ? [...storageData.blocked] : [],
    mode: storageData.mode || "BLOCKLIST",
    timeLimits: storageData.timeLimits ? { ...storageData.timeLimits } : {},
    challengePhrase: storageData.challengePhrase || "I am wasting my time and I need to get back to work",
    challengeRepeatCount: typeof storageData.challengeRepeatCount === "number" ? storageData.challengeRepeatCount : 3,
    schedule: storageData.schedule ? { ...storageData.schedule } : {
      enabled: false,
      days: [1, 2, 3, 4, 5],
      startTime: "09:00",
      endTime: "17:00",
    },
    resolution: storageData.resolution || "CLOSE_TAB",
    redirectUrl: storageData.redirectUrl || "https://www.google.com",
    disableDelay: typeof storageData.disableDelay === "number" ? storageData.disableDelay : 0,
    blockByTitle: Boolean(storageData.blockByTitle),
    updatedAt: Date.now(),
  };
}

/**
 * Pushes encrypted state to the remote sync server.
 */
export async function pushSync(
  syncKey: string,
  serverUrl: string,
  payload: SyncedSettings,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const encrypted = await encryptPayload(syncKey, payload);
    const cleanUrl = serverUrl.replace(/\/+$/, "");
    const endpoint = `${cleanUrl}/${encrypted.keyId}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        updatedAt: encrypted.updatedAt,
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `Server error ${res.status}: ${res.statusText}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pulls and decrypts state from the remote sync server.
 */
export async function pullSync(
  syncKey: string,
  serverUrl: string,
): Promise<{ ok: boolean; data?: SyncedSettings; notFound?: boolean; error?: string }> {
  try {
    const { keyId } = await deriveCredentials(syncKey);
    const cleanUrl = serverUrl.replace(/\/+$/, "");
    const endpoint = `${cleanUrl}/${keyId}`;

    const res = await fetch(endpoint);
    if (res.status === 404) {
      return { ok: true, notFound: true };
    }

    if (!res.ok) {
      return { ok: false, error: `Server error ${res.status}: ${res.statusText}` };
    }

    const json = (await res.json()) as { iv: string; ciphertext: string; updatedAt?: number };
    if (!json.iv || !json.ciphertext) {
      return { ok: false, error: "Invalid sync blob received from server" };
    }

    const decrypted = await decryptPayload(syncKey, json);
    return { ok: true, data: decrypted };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
