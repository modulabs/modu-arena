import { computeHmacSignature } from './crypto.js';
import { API_BASE_URL } from './constants.js';

// ─── Network Helpers ──────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

function networkErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'Request timed out. Check your network connection.';
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
      return 'Could not connect to server. Check your network connection.';
    }
    return err.message;
  }
  return String(err);
}

// ─── Types ────────────────────────────────────────────────────────────────

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
      last7Days: Array<{ date: string; inputTokens: number; outputTokens: number; cacheTokens: number; sessions: number }>;
      last30Days: Array<{ date: string; inputTokens: number; outputTokens: number; cacheTokens: number; sessions: number }>;
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

// ─── Session API ──────────────────────────────────────────────────────────

export async function submitSession(
  session: SessionPayload,
  opts: RequestOptions,
): Promise<{ success: boolean; session?: unknown; error?: string }> {
  try {
    const body = JSON.stringify(session);
    const url = `${baseUrl(opts)}/api/v1/sessions`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: makeAuthHeaders(opts.apiKey, body),
      body,
    });

    const data = await parseJson(res);
    if (!res.ok) {
      const err = (data as ApiError).error;
      const errMsg = typeof err === 'string' ? err : (err?.message || `HTTP ${res.status}`);
      return { success: false, error: errMsg };
    }
    return data as { success: boolean; session: unknown };
  } catch (err) {
    return { success: false, error: networkErrorMessage(err) };
  }
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
  try {
    const body = JSON.stringify({ sessions });
    const url = `${baseUrl(opts)}/api/v1/sessions/batch`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: makeAuthHeaders(opts.apiKey, body),
      body,
    });

    const data = await parseJson(res);
    if (!res.ok) {
      const err = (data as ApiError).error;
      const errMsg = typeof err === 'string' ? err : (err?.message || `HTTP ${res.status}`);
      return { success: false, error: errMsg };
    }
    return data as { success: boolean; processed: number; duplicatesSkipped: number };
  } catch (err) {
    return { success: false, error: networkErrorMessage(err) };
  }
}

export async function getRank(
  opts: RequestOptions,
): Promise<RankResponse | { success: false; error: string }> {
  try {
    const url = `${baseUrl(opts)}/api/v1/rank`;

    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'X-API-Key': opts.apiKey,
      },
    });

    const data = await parseJson(res);
    if (!res.ok) {
      const err = (data as ApiError).error;
      const errMsg = typeof err === 'string' ? err : (err?.message || `HTTP ${res.status}`);
      return { success: false, error: errMsg };
    }
    return data as RankResponse;
  } catch (err) {
    return { success: false, error: networkErrorMessage(err) };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export interface AuthResponse {
  success: boolean;
  apiKey?: string;
  user?: { id: string; username: string; displayName?: string; apiKeyPrefix?: string };
  error?: string;
  message?: string;
}

export async function registerUser(
  payload: { username: string; password: string; displayName?: string },
  serverUrl?: string,
): Promise<AuthResponse> {
  try {
    const body = JSON.stringify(payload);
    const url = `${serverUrl || API_BASE_URL}/api/auth/register`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    return (await parseJson(res)) as AuthResponse;
  } catch (err) {
    return { success: false, error: networkErrorMessage(err) };
  }
}

export async function loginUser(
  payload: { username: string; password: string },
  serverUrl?: string,
): Promise<AuthResponse> {
  try {
    const body = JSON.stringify({ ...payload, source: 'cli' });
    const url = `${serverUrl || API_BASE_URL}/api/auth/login`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    return (await parseJson(res)) as AuthResponse;
  } catch (err) {
    return { success: false, error: networkErrorMessage(err) };
  }
}

// ─── Email Verification ───────────────────────────────────────────────────

export async function sendVerificationCode(
  email: string,
  serverUrl?: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const body = JSON.stringify({ email });
    const url = `${serverUrl || API_BASE_URL}/api/auth/send-code`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = (await parseJson(res)) as { success?: boolean; error?: string };
    if (!res.ok) {
      return { error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` };
    }
    return data;
  } catch (err) {
    return { error: networkErrorMessage(err) };
  }
}

export async function verifyCode(
  email: string,
  code: string,
  serverUrl?: string,
): Promise<{ verified?: boolean; error?: string }> {
  try {
    const body = JSON.stringify({ email, code, action: 'verify' });
    const url = `${serverUrl || API_BASE_URL}/api/auth/verify-code`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = (await parseJson(res)) as { verified?: boolean; error?: string };
    if (!res.ok) {
      return { error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` };
    }
    return data;
  } catch (err) {
    return { error: networkErrorMessage(err) };
  }
}

export async function verifyCodeAndSignup(
  payload: { email: string; code: string; username: string; password: string },
  serverUrl?: string,
): Promise<AuthResponse> {
  try {
    const body = JSON.stringify({ ...payload, action: 'signup' });
    const url = `${serverUrl || API_BASE_URL}/api/auth/verify-code`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = (await parseJson(res)) as { user?: AuthResponse['user']; apiKey?: string; error?: string };
    if (!res.ok) {
      return { success: false, error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` };
    }
    return { success: true, user: data.user, apiKey: data.apiKey };
  } catch (err) {
    return { success: false, error: networkErrorMessage(err) };
  }
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
  try {
    const body = JSON.stringify(payload);
    const url = `${baseUrl(opts)}/api/v1/evaluate`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: makeAuthHeaders(opts.apiKey, body),
      body,
    });

    const data = await parseJson(res);
    if (!res.ok) {
      const err = (data as ApiError).error;
      const errMsg = typeof err === 'string' ? err : (err?.message || `HTTP ${res.status}`);
      return { success: false, error: errMsg };
    }
    return data as EvaluateResponse;
  } catch (err) {
    return { success: false, error: networkErrorMessage(err) };
  }
}
