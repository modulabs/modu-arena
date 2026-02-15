import { describe, expect, it } from 'bun:test';
import { createHash, createHmac, randomBytes } from 'node:crypto';

function baseUrl(): string | null {
  const v = process.env.MODU_ARENA_E2E_BASE_URL;
  return v && v.trim().length > 0 ? v.trim().replace(/\/$/, '') : null;
}

function hmacHeaders(apiKey: string, body: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', apiKey).update(`${ts}:${body}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-Timestamp': ts,
    'X-Signature': sig,
  };
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('E2E (deployed): auth + evaluate', () => {
  const u = baseUrl();

  const run = u && process.env.MODU_ARENA_E2E_RUN === '1' ? it : it.skip;

  run('register, login (cli), evaluate idempotent', async () => {
    if (!u) throw new Error('MODU_ARENA_E2E_BASE_URL is required');

    const suffix = randomBytes(4).toString('hex');
    const username = `e2e_${suffix}`;
    const password = `e2e_password_${suffix}_123`;

    const regRes = await fetch(`${u}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName: `E2E ${suffix}` }),
    });
    expect(regRes.status).toBe(201);
    const reg = (await regRes.json()) as { apiKey?: string };
    expect(typeof reg.apiKey).toBe('string');

    const loginRes = await fetch(`${u}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, source: 'cli' }),
    });
    expect(loginRes.status).toBe(200);
    const login = (await loginRes.json()) as { apiKey?: string };
    expect(typeof login.apiKey).toBe('string');

    const apiKey = login.apiKey as string;
    const projectName = `e2e-project-${suffix}`;
    const projectPathHash = sha256Hex(`/e2e/${username}/${projectName}`);
    const body = JSON.stringify({
      projectName,
      description: `# ${projectName}\n\n## Local Validation\n\n\`\`\`bash title=\"test\"\necho ok\n\`\`\`\n`,
      localScore: 5,
      projectPathHash,
    });

    const eval1 = await fetch(`${u}/api/v1/evaluate`, {
      method: 'POST',
      headers: hmacHeaders(apiKey, body),
      body,
    });
    expect(eval1.status).toBe(200);
    const j1 = (await eval1.json()) as {
      success: boolean;
      evaluation?: {
        projectName: string;
        projectPathHash: string;
        localScore: number;
        backendScore: number;
        penaltyScore: number;
        finalScore: number;
        cumulativeScoreAfter: number;
        passed: boolean;
        evaluatedAt: string;
      };
    };
    expect(j1.success).toBe(true);
    expect(j1.evaluation?.projectName).toBe(projectName);
    expect(j1.evaluation?.projectPathHash).toBe(projectPathHash);

    const eval2 = await fetch(`${u}/api/v1/evaluate`, {
      method: 'POST',
      headers: hmacHeaders(apiKey, body),
      body,
    });
    expect(eval2.status).toBe(200);
    const j2 = (await eval2.json()) as typeof j1;
    expect(j2.success).toBe(true);
    expect(j2.evaluation?.projectPathHash).toBe(projectPathHash);
    expect(j2.evaluation?.cumulativeScoreAfter).toBe(j1.evaluation?.cumulativeScoreAfter);
  });
});
