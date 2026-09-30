const encoder = new TextEncoder();
const decoder = new TextDecoder();

type SessionPayload = {
  version: 1;
  email: string;
  issuedAt: number;
  expiresAt: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function secretsMatch(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([digest(left), digest(right)]);
  return equalBytes(leftDigest, rightDigest);
}

export async function createAdminSession(
  email: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(now / 1000);
  const payload: SessionPayload = {
    version: 1,
    email: email.trim().toLowerCase(),
    issuedAt,
    expiresAt: issuedAt + 8 * 60 * 60,
  };
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(await hmac(encodedPayload, secret));
  return `${encodedPayload}.${signature}`;
}

export async function readAdminSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<{ email: string } | null> {
  if (!token) return null;
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;
  const providedSignature = base64UrlDecode(encodedSignature);
  const payloadBytes = base64UrlDecode(encodedPayload);
  if (!providedSignature || !payloadBytes) return null;
  const expectedSignature = await hmac(encodedPayload, secret);
  if (!equalBytes(providedSignature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(decoder.decode(payloadBytes)) as Partial<SessionPayload>;
    const currentTime = Math.floor(now / 1000);
    if (
      payload.version !== 1 ||
      typeof payload.email !== "string" ||
      !payload.email ||
      payload.email.length > 254 ||
      typeof payload.issuedAt !== "number" ||
      typeof payload.expiresAt !== "number" ||
      payload.issuedAt > currentTime + 60 ||
      payload.expiresAt <= currentTime
    ) {
      return null;
    }
    return { email: payload.email };
  } catch {
    return null;
  }
}
