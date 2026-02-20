import { createHash, createHmac, randomBytes, timingSafeEqual as cryptoTimingSafeEqual, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { db, users, apiKeys, type User } from "@/db";
import { and, asc, count, eq } from "drizzle-orm";

const JWT_SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-jwt-secret-change-in-production");
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionPayload extends JWTPayload {
  userId: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computedHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(computedHash, hash);
}

export async function createSessionToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(JWT_SECRET_KEY);
  return { token, expiresAt };
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY, { algorithms: ["HS256"] });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * API Key format: modu_arena_{prefix}_{secret}
 * prefix: 8 characters for display (stored in DB)
 * secret: 32 characters (only hash stored in DB)
 */
const API_KEY_PREFIX = "modu_arena_";
const _PREFIX_LENGTH = 8;
const _SECRET_LENGTH = 32;
export const MAX_KEYS_PER_USER = 5;

const AES_ALGORITHM = "aes-256-gcm";
const AES_IV_LENGTH = 12;
const AES_AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.API_KEY_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("API_KEY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt an API key using AES-256-GCM with AAD (userId) binding.
 * Format: "v1:iv_hex:authTag_hex:ciphertext_hex"
 * The "v1" prefix enables future key rotation.
 */
export function encryptApiKey(plaintext: string, userId: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(AES_IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AES_AUTH_TAG_LENGTH });
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt an API key encrypted with encryptApiKey.
 * Supports versioned format ("v1:iv:tag:data") and legacy format ("iv:tag:data").
 */
export function decryptApiKey(ciphertext: string, userId: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");

  let ivHex: string;
  let authTagHex: string;
  let encryptedHex: string;

  if (parts[0] === "v1" && parts.length === 4) {
    // Versioned format: v1:iv:authTag:encrypted
    [, ivHex, authTagHex, encryptedHex] = parts;
  } else if (parts.length === 3) {
    // Legacy format (no version): iv:authTag:encrypted
    [ivHex, authTagHex, encryptedHex] = parts;
  } else {
    throw new Error("Invalid encrypted API key format");
  }

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted API key format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AES_AUTH_TAG_LENGTH });
  if (parts[0] === "v1") {
    decipher.setAAD(Buffer.from(userId, "utf8"));
  }
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Generate a new API key for a user
 * Returns the full key (shown once) and the hash/prefix/encrypted for storage
 */
export function generateApiKey(_userId: string): {
  key: string;
  hash: string;
  prefix: string;
  encrypted: string;
} {
  const prefix = randomBytes(4).toString("hex"); // 8 chars
  const secret = randomBytes(16).toString("hex"); // 32 chars
  const fullKey = `${API_KEY_PREFIX}${prefix}_${secret}`;

   // Hash the full key for storage using scrypt (stronger than SHA-256)
   const hash = scryptSync(fullKey, "modu-arena-api-key-salt", 64).toString("hex");

  // Encrypt the full key so it can be retrieved later
  const encrypted = encryptApiKey(fullKey, _userId);

  return {
    key: fullKey,
    hash,
    prefix: `${API_KEY_PREFIX}${prefix}`,
    encrypted,
  };
}

/**
 * Hash an API key for comparison
 */
export function hashApiKey(apiKey: string): string {
   return scryptSync(apiKey, "modu-arena-api-key-salt", 64).toString("hex");
}

/**
 * Validate an API key and return the associated user
 */
export async function validateApiKey(apiKey: string): Promise<User | null> {
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const hash = hashApiKey(apiKey);

  const result = await db
    .select({ user: users, apiKeyRecord: apiKeys })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!result[0]) {
    return null;
  }

  db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.keyHash, hash))
    .catch(() => {});

  return {
    ...result[0].user,
    apiKeyPrefix: result[0].apiKeyRecord.keyPrefix,
  };
}

export async function storeNewApiKeyForUser(
  userId: string,
  keyData: { hash: string; prefix: string; encrypted: string; label?: string | null }
): Promise<void> {
  const [{ activeCount }] = await db
    .select({ activeCount: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)));

  if (activeCount >= MAX_KEYS_PER_USER) {
    const oldest = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)))
      .orderBy(asc(apiKeys.createdAt))
      .limit(1);

    if (oldest[0]) {
      await db
        .update(apiKeys)
        .set({ isActive: false })
        .where(eq(apiKeys.id, oldest[0].id));
    }
  }

  await db.insert(apiKeys).values({
    userId,
    keyHash: keyData.hash,
    keyPrefix: keyData.prefix,
    keyEncrypted: keyData.encrypted,
    label: keyData.label ?? null,
    isActive: true,
  });

  await db
    .update(users)
    .set({ apiKeyPrefix: keyData.prefix, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Verify HMAC signature for CLI requests
 *
 * Signature is computed as:
 * HMAC-SHA256(apiKey, timestamp + ":" + body)
 *
 * @param apiKey - The API key (used as HMAC secret)
 * @param timestamp - Unix timestamp in seconds
 * @param body - Request body as string
 * @param signature - The signature to verify
 * @param maxAgeSeconds - Maximum age of the request (default 5 minutes)
 */
export function verifyHmacSignature(
  apiKey: string,
  timestamp: string,
  body: string,
  signature: string,
  maxAgeSeconds = 300
): boolean {
  // Validate timestamp is not too old
  const requestTime = Number.parseInt(timestamp, 10);
  if (Number.isNaN(requestTime)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTime) > maxAgeSeconds) {
    return false;
  }

  // Compute expected signature
  const message = `${timestamp}:${body}`;
  const expectedSignature = createHmac("sha256", apiKey)
    .update(message)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(signature, expectedSignature);
}

/**
 * V009: Constant-time string comparison to prevent timing attacks
 *
 * Uses Node.js crypto.timingSafeEqual with proper padding to prevent
 * length oracle attacks. Both strings are padded to equal length before
 * comparison to ensure constant-time execution regardless of input lengths.
 *
 * @param provided - The user-provided signature
 * @param expected - The expected signature computed server-side
 * @returns true if signatures match, false otherwise
 */
function timingSafeEqual(provided: string, expected: string): boolean {
  // Pad both strings to the same length to prevent length oracle attacks
  // HMAC-SHA256 signatures are always 64 hex characters, but we handle
  // any length for defense in depth
  const maxLength = Math.max(provided.length, expected.length, 64);

  const providedPadded = provided.padEnd(maxLength, '\0');
  const expectedPadded = expected.padEnd(maxLength, '\0');

  const providedBuf = Buffer.from(providedPadded, 'utf8');
  const expectedBuf = Buffer.from(expectedPadded, 'utf8');

  // Use Node.js crypto.timingSafeEqual for constant-time comparison
  // Also verify original lengths match to prevent false positives from padding
  return providedBuf.length === expectedBuf.length &&
    cryptoTimingSafeEqual(providedBuf, expectedBuf) &&
    provided.length === expected.length;
}

/**
 * Compute server-side session hash
 * Used to verify session integrity and prevent tampering
 */
export function computeSessionHash(
  userId: string,
  userSalt: string,
  sessionData: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    modelName?: string;
    endedAt: string;
  }
): string {
  const data = [
    userId,
    userSalt,
    sessionData.inputTokens.toString(),
    sessionData.outputTokens.toString(),
    (sessionData.cacheCreationTokens ?? 0).toString(),
    (sessionData.cacheReadTokens ?? 0).toString(),
    sessionData.modelName ?? "",
    sessionData.endedAt,
  ].join(":");

  return createHash("sha256").update(data).digest("hex");
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(headers: Headers): string | null {
  const apiKey = headers.get("X-API-Key");
  return apiKey ?? null;
}

/**
 * Extract HMAC authentication data from headers
 */
export function extractHmacAuth(headers: Headers): {
  apiKey: string | null;
  timestamp: string | null;
  signature: string | null;
} {
  return {
    apiKey: headers.get("X-API-Key"),
    timestamp: headers.get("X-Timestamp"),
    signature: headers.get("X-Signature"),
  };
}
