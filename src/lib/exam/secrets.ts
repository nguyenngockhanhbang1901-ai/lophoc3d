// Password hashing and session tokens with Web Crypto only, so the same code runs on the
// Cloudflare Worker (no node:crypto scrypt) and in tests. Workers cap PBKDF2 at 100 000
// iterations; 60 000 keeps bulk account creation inside the CPU budget.

const ITERATIONS = 60_000;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** "pbkdf2$<iterations>$<salt>$<hash>" */
export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  const iterations = Number(iter);
  if (
    scheme !== "pbkdf2" ||
    !salt ||
    !hash ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > 100_000
  )
    return false;
  const actual = await derive(password, fromBase64(salt), iterations);
  return sameBytes(actual, fromBase64(hash));
}

/** Session token handed to the browser once; only its SHA-256 is stored. */
export function newSessionToken(): string {
  return toHex(randomBytes(32));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toHex(new Uint8Array(digest));
}

export const SESSION_DAYS = 30;

// Reversible copy of a password so the teacher can read it back. AES-GCM with a key derived
// (HKDF) from a server secret, so the database alone never reveals passwords.
async function aesKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("lophoc3d-exam-password"),
      info: encoder.encode("v1"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** "v1:<iv>:<ciphertext>" */
export async function encryptSecret(plain: string, secret: string): Promise<string> {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    await aesKey(secret),
    encoder.encode(plain),
  );
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(data))}`;
}

/** The plain text, or null when it cannot be read (missing, damaged, or the key changed). */
export async function decryptSecret(
  stored: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (!stored) return null;
  const [version, iv, data] = stored.split(":");
  if (version !== "v1" || !iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) as BufferSource },
      await aesKey(secret),
      fromBase64(data) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
