import { computeHmacSignature } from './crypto.js';
import { API_BASE_URL } from './constants.js';

export interface SessionPayload {
  toolType: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  modelName?: string;
  codeMetrics?: Record<string, unknown> | null;
}

export interface BatchPayload {
  sessions: SessionPayload[];
}

export interface RankResponse {
  success: boolean;
  data: {
    username: string;
    usage: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheTokens: number;
      totalTokens: number;
      totalSessions: number;
      toolBreakdown: Array<{ tool: string; tokens: number }>;
      last7Days: Array<{ date: string; inputTokens: number; outputTokens: number; sessions: number }>;
      last30Days: Array<{ date: string; inputTokens: number; outputTokens: number; sessions: number }>;
    };
    overview: {
      successfulProjectsCount: number;
    };
    lastUpdated: string;
  };
}

export interface ApiError {
  error?: string | { code?: string; message?: string };
}

interface RequestOptions {
  apiKey: string;
  serverUrl?: string;
}

function baseUrl(opts: RequestOptions): string {
  return opts.serverUrl || API_BASE_URL;
}

function makeAuthHeaders(
  apiKey: string,
  body?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };

  if (body !== undefined) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = computeHmacSignature(apiKey, timestamp, body);
    headers['X-Timestamp'] = timestamp;
    headers['X-Signature'] = signature;
  }

  return headers;
}

export async function submitSession(
  session: SessionPayload,
  opts: RequestOptions,
): Promise<{ success: boolean; session?: unknown; error?: string }> {
  const body = JSON.stringify(session);
  const url = `${baseUrl(opts)}/api/v1/sessions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: makeAuthHeaders(opts.apiKey, body),
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    const err = (data as ApiError).error;
    const errMsg = typeof err === 'string' ? err : (err?.message || `HTTP ${res.status}`);
    return { success: false, error: errMsg };
  }
  return data as { success: boolean; session: unknown };
}

export async function submitBatch(
  sessions: SessionPayload[],
  opts: RequestOptions,
): Promise<{
  success: boolean;
  processed?: number;
  duplicatesSkipped?: number;
  error?: string;
}> {
  const body = JSON.stringify({ sessions });
  const url = `${baseUrl(opts)}/api/v1/sessions/batch`;

  const res = await fetch(url, {
    method: 'POST',
    headers: makeAuthHeaders(opts.apiKey, body),
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    const err = (data as ApiError).error;
    const errMsg = typeof err === 'string' ? err : (err?.message || `HTTP ${res.status}`);
    return { success: false, error: errMsg };
  }
  return data as { success: boolean; processed: number; duplicatesSkipped: number };
}

export async function getRank(
  opts: RequestOptions,
): Promise<RankResponse | { success: false; error: string }> {
  const url = `${baseUrl(opts)}/api/v1/rank`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': opts.apiKey,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const err = (data as ApiError).error;
    const errMsg = typeof err === 'string' ? err : (err?.message || `HTTP ${res.status}`);
    return { success: false, error: errMsg };
  }
  return data as RankResponse;
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export interface AuthResponse {
  success: boolean;
  apiKey?: string;
  user?: { id: string; username: string; displayName?: string };
  error?: string;
}

export async function registerUser(
  payload: { username: string; password: string; displayName?: string },
  serverUrl?: string,
): Promise<AuthResponse> {
  const body = JSON.stringify(payload);
  const url = `${serverUrl || API_BASE_URL}/api/auth/register`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  return (await res.json()) as AuthResponse;
}

export async function loginUser(
  payload: { username: string; password: string },
  serverUrl?: string,
): Promise<AuthResponse> {
  const body = JSON.stringify({ ...payload, source: 'cli' });
  const url = `${serverUrl || API_BASE_URL}/api/auth/login`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  return (await res.json()) as AuthResponse;
}

// ─── Evaluate ─────────────────────────────────────────────────────────────

export interface EvaluatePayload {
  projectName: string;
  description: string;
  fileStructure?: Record<string, string[]>;
  projectPathHash?: string;
  localScore?: number;
  localEvaluationSummary?: string;
}

export interface EvaluationResult {
  passed: boolean;
  projectName: string;
  projectPathHash: string;
  localScore: number;
  backendScore: number;
  penaltyScore: number;
  finalScore: number;
  cumulativeScoreAfter: number;
  feedback: string;
  evaluatedAt: string;
}

export interface EvaluateResponse {
  success: true;
  evaluation: EvaluationResult;
}

export async function submitEvaluation(
  payload: EvaluatePayload,
  opts: RequestOptions,
): Promise<EvaluateResponse | { success: false; error: string }> {
  const body = JSON.stringify(payload);
  const url = `${baseUrl(opts)}/api/v1/evaluate`;

  const res = await fetch(url, {
    method: 'POST',
    headers: makeAuthHeaders(opts.apiKey, body),
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    const err = (data as ApiError).error;
    const errMsg = typeof err === 'string' ? err : (err?.message || `HTTP ${res.status}`);
    return { success: false, error: errMsg };
  }
  return data as EvaluateResponse;
}
