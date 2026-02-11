import { createHmac, createHash } from 'node:crypto';

/**
 * Compute HMAC-SHA256 signature for API authentication.
 *
 * message = "{timestamp}:{bodyJsonString}"
 * signature = HMAC-SHA256(apiKey, message).hex()
 */
export function computeHmacSignature(
  apiKey: string,
  timestamp: string,
  body: string,
): string {
  const message = `${timestamp}:${body}`;
  return createHmac('sha256', apiKey).update(message).digest('hex');
}

/**
 * Compute SHA-256 session hash for integrity verification.
 *
 * data = "{userId}:{userSalt}:{inputTokens}:{outputTokens}:{cacheCreationTokens}:{cacheReadTokens}:{modelName}:{endedAt}"
 * hash = SHA-256(data).hex()
 */
export function computeSessionHash(
  userId: string,
  userSalt: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  modelName: string,
  endedAt: string,
): string {
  const data = `${userId}:${userSalt}:${inputTokens}:${outputTokens}:${cacheCreationTokens}:${cacheReadTokens}:${modelName}:${endedAt}`;
  return createHash('sha256').update(data).digest('hex');
}
