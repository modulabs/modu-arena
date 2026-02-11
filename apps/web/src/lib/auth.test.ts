/**
 * Characterization Tests for Auth Module
 * These tests capture current behavior for preservation during refactoring
 *
 * DDD Phase: PRESERVE
 * SPEC: SPEC-MODU-001
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import {
  generateApiKey,
  hashApiKey,
  validateApiKey,
  verifyHmacSignature,
  computeSessionHash,
  extractApiKey,
  extractHmacAuth,
} from './auth';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';

describe('Auth Module - Characterization Tests', () => {
  describe('generateApiKey - Current Behavior', () => {
    it('generates API key with modu_arena prefix', () => {
       const result = generateApiKey('test-user-id');

       // NEW behavior: API key starts with modu_arena_
       expect(result.key).toMatch(/^modu_arena_[a-f0-9]{8}_[a-f0-9]{32}$/);
       expect(result.hash).toHaveLength(128); // 64 bytes = 128 hex chars
       expect(result.prefix).toMatch(/^modu_arena_[a-f0-9]{8}$/);
     });

    it('generates unique API keys for each call', () => {
      const result1 = generateApiKey('user-1');
      const result2 = generateApiKey('user-1');

      // Keys should be unique (random components)
      expect(result1.key).not.toBe(result2.key);
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('hashes API key using scrypt with modu-arena-api-key-salt', () => {
       const result = generateApiKey('test-user-id');

       // Same key should produce same hash
       const hash1 = hashApiKey(result.key);
       const hash2 = hashApiKey(result.key);

       expect(hash1).toBe(hash2);
       expect(hash1).toBe(result.hash);
     });
  });

  describe('extractApiKey - Current Behavior', () => {
    it('extracts API key from X-API-Key header', () => {
       const headers = new Headers();
       headers.set('X-API-Key', 'modu_arena_test123_secret456');

       const result = extractApiKey(headers);
       expect(result).toBe('modu_arena_test123_secret456');
     });

    it('returns null when X-API-Key header is missing', () => {
      const headers = new Headers();

      const result = extractApiKey(headers);
      expect(result).toBeNull();
    });
  });

  describe('extractHmacAuth - Current Behavior', () => {
    it('extracts all HMAC authentication headers', () => {
      const headers = new Headers();
      headers.set('X-API-Key', 'test-key');
      headers.set('X-Timestamp', '1234567890');
      headers.set('X-Signature', 'abc123');

      const result = extractHmacAuth(headers);

      expect(result.apiKey).toBe('test-key');
      expect(result.timestamp).toBe('1234567890');
      expect(result.signature).toBe('abc123');
    });

    it('returns null for missing headers', () => {
      const headers = new Headers();

      const result = extractHmacAuth(headers);

      expect(result.apiKey).toBeNull();
      expect(result.timestamp).toBeNull();
      expect(result.signature).toBeNull();
    });
  });

  describe('verifyHmacSignature - Current Behavior', () => {
    it('verifies valid HMAC signature with proper API key format', () => {
       // Must use full API key format for signature verification
       const apiKey = 'modu_arena_test123_secret456abcdef789012345678';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = '{"test": "data"}';

      // Compute expected signature
      const crypto = require('node:crypto');
      const message = `${timestamp}:${body}`;
      const expectedSignature = crypto.createHmac('sha256', apiKey)
        .update(message)
        .digest('hex');

      const result = verifyHmacSignature(apiKey, timestamp, body, expectedSignature);

      expect(result).toBe(true);
    });

    it('rejects invalid HMAC signature', () => {
      const apiKey = 'test-api-key';
      const timestamp = '1234567890';
      const body = '{"test": "data"}';

      const result = verifyHmacSignature(apiKey, timestamp, body, 'invalid-signature');

      expect(result).toBe(false);
    });

    it('accepts timestamps within 5 minutes (default maxAge)', () => {
       const apiKey = 'modu_arena_test123_secret456abcdef789012345678';
      const timestamp = Math.floor(Date.now() / 1000) - 200; // 200 seconds ago (within 5 min)
      const body = '{"test": "data"}';

      const crypto = require('node:crypto');
      const message = `${timestamp}:${body}`;
      const signature = crypto.createHmac('sha256', apiKey)
        .update(message)
        .digest('hex');

      const result = verifyHmacSignature(apiKey, timestamp.toString(), body, signature);

      expect(result).toBe(true);
    });

    it('rejects timestamps older than maxAge', () => {
       const apiKey = 'modu_arena_test123_secret456abcdef789012345678';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const body = '{"test": "data"}';

      const crypto = require('node:crypto');
      const message = `${oldTimestamp}:${body}`;
      const signature = crypto.createHmac('sha256', apiKey)
        .update(message)
        .digest('hex');

      const result = verifyHmacSignature(apiKey, oldTimestamp.toString(), body, signature, 300);

      expect(result).toBe(false);
    });

    it('rejects invalid timestamp format', () => {
      const apiKey = 'test-api-key';
      const timestamp = 'invalid';
      const body = '{"test": "data"}';

      const result = verifyHmacSignature(apiKey, timestamp, body, 'any-signature');

      expect(result).toBe(false);
    });
  });

  describe('computeSessionHash - Current Behavior', () => {
    it('computes consistent session hash for same inputs', () => {
      const userId = 'user-123';
      const userSalt = 'salt-456';
      const sessionData = {
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 100,
        cacheReadTokens: 50,
        modelName: 'claude-3-opus',
        endedAt: '2026-01-15T10:30:00Z',
      };

      const hash1 = computeSessionHash(userId, userSalt, sessionData);
      const hash2 = computeSessionHash(userId, userSalt, sessionData);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('produces different hashes for different inputs', () => {
      const userId = 'user-123';
      const userSalt = 'salt-456';

      const sessionData1 = {
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 100,
        cacheReadTokens: 50,
        modelName: 'claude-3-opus',
        endedAt: '2026-01-15T10:30:00Z',
      };

      const sessionData2 = {
        inputTokens: 2000, // Different
        outputTokens: 500,
        cacheCreationTokens: 100,
        cacheReadTokens: 50,
        modelName: 'claude-3-opus',
        endedAt: '2026-01-15T10:30:00Z',
      };

      const hash1 = computeSessionHash(userId, userSalt, sessionData1);
      const hash2 = computeSessionHash(userId, userSalt, sessionData2);

      expect(hash1).not.toBe(hash2);
    });

    it('handles optional cache token fields', () => {
      const userId = 'user-123';
      const userSalt = 'salt-456';

      const sessionData = {
        inputTokens: 1000,
        outputTokens: 500,
        // No cache tokens
        modelName: 'claude-3-opus',
        endedAt: '2026-01-15T10:30:00Z',
      };

      const hash = computeSessionHash(userId, userSalt, sessionData);

      expect(hash).toHaveLength(64);
    });
  });
});
