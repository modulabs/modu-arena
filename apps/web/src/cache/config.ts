/**
 * Cache TTL Configuration (seconds)
 *
 * Short TTLs for near-real-time visibility.
 * Session ingest also invalidates relevant keys on write.
 */
export const CACHE_TTL = {
  LEADERBOARD: {
    daily: 2 * 60,
    weekly: 2 * 60,
    monthly: 5 * 60,
    all_time: 5 * 60,
  },
  USER_RANK: 2 * 60,
  USER_STATS: 60,
  GLOBAL_STATS: 60,
} as const;

/**
 * Type definition for cache TTL keys
 */
export type CacheTTLKey = keyof typeof CACHE_TTL | keyof typeof CACHE_TTL.LEADERBOARD;

/**
 * Get TTL value for a specific cache key
 *
 * @param key - Cache TTL key
 * @returns TTL value in seconds
 */
export function getTTL(key: CacheTTLKey): number {
  if (key in CACHE_TTL.LEADERBOARD) {
    return CACHE_TTL.LEADERBOARD[key as keyof typeof CACHE_TTL.LEADERBOARD];
  }
  // Direct top-level keys (USER_RANK, USER_STATS, GLOBAL_STATS)
  return CACHE_TTL[key as keyof Omit<typeof CACHE_TTL, 'LEADERBOARD'>];
}
