import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return url;
}

// Lazy proxy: defers connection until first use (allows builds without DATABASE_URL)
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!_db) {
      _client = postgres(getDatabaseUrl(), {
        ssl: false,
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
      _db = drizzle(_client, { schema });
    }
    return Reflect.get(_db, prop);
  },
});

export function getPooledDb() {
  const client = postgres(getDatabaseUrl(), {
    ssl: false,
    max: 20,
    idle_timeout: 10,
  });
  return drizzle(client, { schema });
}

// Re-export schema for convenience
export * from './schema';
