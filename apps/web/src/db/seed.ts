/**
 * seed.ts — Populates the Modu platform database
 *
 * Usage:
 *   bun run apps/web/src/db/seed.ts
 *   # or via package.json:
 *   bun run db:seed
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { scryptSync, randomBytes, randomUUID } from 'node:crypto';

import {
  toolTypes,
  users,
  sessions,
  tokenUsage,
  dailyUserStats,
  projectEvaluations,
  securityAuditLog,
} from './schema';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(databaseUrl, { ssl: false, max: 5 });
const db = drizzle(client, {});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// NEW: Modu platform API key prefix
const API_KEY_PREFIX = 'modu_arena_';

function generateApiKey(): { key: string; hash: string; prefix: string } {
   const prefix = randomBytes(4).toString('hex'); // 8 chars
   const secret = randomBytes(16).toString('hex'); // 32 chars
   const key = `${API_KEY_PREFIX}${prefix}_${secret}`;
   const hash = scryptSync(key, 'modu-arena-api-key-salt', 64).toString('hex');
   return { key, hash, prefix: `${API_KEY_PREFIX}${prefix}` };
 }

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------

// NEW: Tool types for multi-tool support
const TOOL_TYPES = [
  {
    id: 'claude-code',
    name: 'claude-code',
    displayName: 'Claude Code',
    iconUrl: '/icons/claude.svg',
    color: '#CC785C',
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'opencode',
    name: 'opencode',
    displayName: 'OpenCode',
    iconUrl: '/icons/opencode.svg',
    color: '#6366F1',
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'gemini',
    name: 'gemini',
    displayName: 'Gemini Code',
    iconUrl: '/icons/gemini.svg',
    color: '#4285F4',
    isActive: true,
    sortOrder: 3,
  },
  {
    id: 'codex',
    name: 'codex',
    displayName: 'OpenAI Codex',
    iconUrl: '/icons/codex.svg',
    color: '#10A37F',
    isActive: true,
    sortOrder: 4,
  },
  {
    id: 'crush',
    name: 'crush',
    displayName: 'Crush AI',
    iconUrl: '/icons/crush.svg',
    color: '#EC4899',
    isActive: true,
    sortOrder: 5,
  },
];

const DUMMY_USERS: Array<{
  displayName: string;
  email: string;
  activityLevel: 'high' | 'medium' | 'low';
}> = [
  { displayName: 'Alice Kim', email: 'alice@modulabs.ai', activityLevel: 'high' },
  { displayName: 'Bob Park', email: 'bob@modulabs.ai', activityLevel: 'high' },
  { displayName: 'Charlie Lee', email: 'charlie@modulabs.ai', activityLevel: 'medium' },
  { displayName: 'Diana Choi', email: 'diana@modulabs.ai', activityLevel: 'high' },
  { displayName: 'Eve Jung', email: 'eve@modulabs.ai', activityLevel: 'medium' },
  { displayName: 'Frank Yoo', email: 'frank@modulabs.ai', activityLevel: 'low' },
  { displayName: 'Grace Han', email: 'grace@modulabs.ai', activityLevel: 'medium' },
  { displayName: 'Hank Seo', email: 'hank@modulabs.ai', activityLevel: 'high' },
  { displayName: 'Ivy Ryu', email: 'ivy@modulabs.ai', activityLevel: 'low' },
  { displayName: 'Jack Baek', email: 'jack@modulabs.ai', activityLevel: 'medium' },
];

const MODELS = ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-3.5'];

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

async function seed() {
  console.log('🌱 Seeding Modu platform database...\n');

  // ---- Cleanup in FK-safe order ----
  console.log('🗑️  Cleaning existing data...');
  await db.delete(securityAuditLog);
  await db.delete(dailyUserStats);
  await db.delete(projectEvaluations);
  await db.delete(tokenUsage);
  await db.delete(sessions);
  await db.delete(users);
  await db.delete(toolTypes);
  console.log('   Done.\n');

  // ---- Tool Types ----
  console.log('🔧 Creating tool types...');
  await db.insert(toolTypes).values(TOOL_TYPES);
  console.log(`   Created ${TOOL_TYPES.length} tool types.\n`);

  // ---- Users ----
  console.log('👤 Creating users...');
  const userApiKeys: Array<{ displayName: string; key: string }> = [];

  const dummyPasswordHash = scryptSync('password123', 'modu-arena-salt', 64).toString('hex');

  const userValues = DUMMY_USERS.map((u, i) => {
    const apiKey = generateApiKey();
    userApiKeys.push({ displayName: u.displayName, key: apiKey.key });
    return {
      username: u.email.split('@')[0],
      passwordHash: dummyPasswordHash,
      displayName: u.displayName,
      email: u.email,
      apiKeyHash: apiKey.hash,
      apiKeyPrefix: apiKey.prefix,
      userSalt: randomUUID(),
      privacyMode: false,
      successfulProjectsCount: 0,
    };
  });
  const createdUsers = await db.insert(users).values(userValues).returning();
  console.log(`   Created ${createdUsers.length} users.`);
  console.log('\n   📋 API Keys (shown once):');
  for (const uk of userApiKeys) {
    console.log(`      ${uk.displayName}: ${uk.key}`);
  }
  console.log();

  // ---- Sessions + Token Usage ----
  console.log('📊 Creating sessions & token usage...');
  let sessionCount = 0;
  let tokenCount = 0;

  for (const user of createdUsers) {
    const level = DUMMY_USERS.find((u) => u.email === user.email)?.activityLevel ?? 'medium';
    const numSessions = level === 'high' ? randomInt(20, 40) : level === 'medium' ? randomInt(8, 20) : randomInt(2, 8);

    for (let s = 0; s < numSessions; s++) {
      const daysBack = randomInt(0, 29);
      const startDate = daysAgo(daysBack);
      const durationSec = randomInt(120, 7200);
      const endDate = new Date(startDate.getTime() + durationSec * 1000);
      const toolType = randomChoice(TOOL_TYPES).id;

      const [session] = await db
        .insert(sessions)
        .values({
          userId: user.id,
          toolTypeId: toolType, // NEW: Multi-tool support
          sessionHash: randomBytes(32).toString('hex'),
          startedAt: startDate,
          endedAt: endDate,
          durationSeconds: durationSec,
          modelName: randomChoice(MODELS),
          turnCount: randomInt(5, 80),
          toolUsage: {
            Read: randomInt(5, 50),
            Write: randomInt(0, 20),
            Edit: randomInt(0, 30),
            Bash: randomInt(0, 15),
            Glob: randomInt(0, 10),
            Grep: randomInt(0, 10),
          },
          codeMetrics: {
            linesAdded: randomInt(10, 500),
            linesDeleted: randomInt(0, 200),
            filesModified: randomInt(1, 15),
            filesCreated: randomInt(0, 5),
          },
        })
        .returning();

      sessionCount++;

      const inputTokens = randomInt(5_000, 200_000);
      const outputTokens = randomInt(1_000, 60_000);

      await db.insert(tokenUsage).values({
        sessionId: session.id,
        userId: user.id,
        toolTypeId: toolType, // NEW: Multi-tool support
        inputTokens,
        outputTokens,
        cacheCreationTokens: randomInt(0, 10_000),
        cacheReadTokens: randomInt(0, 50_000),
        recordedAt: endDate,
      });

      tokenCount++;
    }
  }
  console.log(`   Created ${sessionCount} sessions, ${tokenCount} token usage records.\n`);

  // ---- Daily User Stats ----
  console.log('📈 Creating daily user stats...');
  let aggCount = 0;

  for (const user of createdUsers) {
    for (let d = 0; d < 30; d++) {
      const dateStr = daysAgo(d).toISOString().split('T')[0];
      const toolType = randomChoice(TOOL_TYPES).id;

      await db.insert(dailyUserStats).values({
        userId: user.id,
        statDate: dateStr,
        inputTokens: randomInt(10_000, 500_000),
        outputTokens: randomInt(2_000, 100_000),
        cacheTokens: randomInt(0, 50_000),
        totalTokens: randomInt(12_000, 600_000),
        sessionCount: randomInt(1, 10),
        byTool: {
          [toolType]: {
            tokens: randomInt(12_000, 600_000),
            sessions: randomInt(1, 10),
          },
        },
      });

      aggCount++;
    }
  }
  console.log(`   Created ${aggCount} daily stats records.\n`);

  // ---- Project Evaluations (demo data) ----
  console.log('📝 Creating project evaluations...');
  let evalCount = 0;

  for (const user of createdUsers) {
    const level = DUMMY_USERS.find((u) => u.email === user.email)?.activityLevel ?? 'medium';
    const numEvals = level === 'high' ? randomInt(3, 8) : level === 'medium' ? randomInt(1, 4) : randomInt(0, 2);

    for (let e = 0; e < numEvals; e++) {
      const totalScore = randomInt(3, 10);
      const passed = totalScore >= 5;

      await db.insert(projectEvaluations).values({
        userId: user.id,
        projectPathHash: randomBytes(32).toString('hex'),
        projectName: `project-${randomInt(1000, 9999)}`,
        totalScore,
        rubricFunctionality: Math.floor(totalScore / 2),
        rubricPracticality: Math.ceil(totalScore / 2),
        llmModel: 'claude-sonnet-4',
        llmProvider: 'anthropic',
        passed,
        feedback: passed
          ? 'Good project with practical functionality.'
          : 'Project needs improvement before passing.',
        evaluatedAt: daysAgo(randomInt(0, 29)),
      });

      if (passed) {
        evalCount++;
      }
    }
  }
  console.log(`   Created project evaluations.\n`);

  console.log('✅ Seed complete!');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
