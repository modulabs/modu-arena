import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { safeAuth } from '@/lib/safe-auth';
import { db, users, projectEvaluations } from '@/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import { successResponse, Errors, corsOptionsResponse } from '@/lib/api-response';
import { createHash } from 'node:crypto';
import {
  validateApiKey,
  extractHmacAuth,
  verifyHmacSignature,
} from '@/lib/auth';

/**
 * Project Evaluation Request Schema
 */
const EvaluateProjectSchema = z.object({
  projectName: z.string().min(1).max(255),
  description: z.string().min(10).max(50000),
  fileStructure: z.record(z.string(), z.array(z.string())).optional(),
  projectPathHash: z.string().length(64).optional(),
  localScore: z.number().int().min(0).max(5).optional().default(0),
  localEvaluationSummary: z.string().min(1).max(500).optional(),
});

/**
 * LLM evaluation result schema (for parsing Anthropic API response)
 */
const LlmEvaluationResultSchema = z.object({
  backendScore: z.number().int().min(0).max(5),
  penaltyScore: z.number().int().min(-5).max(0),
  feedback: z.string().min(1),
});

/**
 * Project Evaluation Response
 */
interface EvaluationResponse {
  success: boolean;
  evaluation?: {
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
  };
  error?: string;
}

/**
 * Resolve userId from JWT session cookie or API Key + HMAC auth.
 * Returns the internal user ID, auth method, and bodyText (if API key auth consumed it).
 */
async function resolveUserId(
  request: NextRequest
): Promise<
  | { userId: string; authMethod: 'session'; bodyText: null }
  | { userId: string; authMethod: 'apikey'; bodyText: string }
  | { error: ReturnType<typeof Errors.unauthorized> }
> {
  // 1. Try JWT session cookie first
  const { userId } = await safeAuth();
  if (userId) {
    return { userId, authMethod: 'session', bodyText: null };
  }

  // 2. Try API Key + HMAC auth
  const { apiKey, timestamp, signature } = extractHmacAuth(request.headers);

  if (!apiKey) {
    return { error: Errors.unauthorized('Authentication required. Provide session cookie or API Key.') };
  }

  const user = await validateApiKey(apiKey);
  if (!user) {
    return { error: Errors.unauthorized('Invalid API key') };
  }

  if (!timestamp || !signature) {
    return { error: Errors.unauthorized('HMAC authentication required (X-Timestamp and X-Signature headers)') };
  }

  // Read raw body for HMAC signature verification
  const bodyText = await request.text();

  if (!verifyHmacSignature(apiKey, timestamp, bodyText, signature)) {
    return { error: Errors.unauthorized('Invalid HMAC signature') };
  }

  return { userId: user.id, authMethod: 'apikey', bodyText };
}

/**
 * POST /api/v1/evaluate
 *
 * Evaluates a project using LLM and stores results if passing.
 * Supports dual authentication: JWT session OR API Key + HMAC.
 *
 * Headers (for API Key auth):
 * - X-API-Key: User's API key
 * - X-Timestamp: Unix timestamp in seconds
 * - X-Signature: HMAC-SHA256 signature
 *
 * Body:
 * - projectName: Name of the project
 * - description: Project description (usually from README)
 * - fileStructure: Optional file structure overview
 *
 * Evaluation rubric:
 * 1. Does it work as described in README? (0-5 points)
 * 2. Is it practical for real use? (0-5 points)
 *
 * Only evaluations scoring 5+ points are stored.
 */
export async function POST(request: NextRequest) {
  try {
    // Dual auth: JWT session OR API Key + HMAC
    const authResult = await resolveUserId(request);

    if ('error' in authResult) {
      return authResult.error;
    }

    const { userId, authMethod, bodyText } = authResult;

    // Parse request body
    let body: unknown;
    if (authMethod === 'apikey' && bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        return Errors.validationError('Invalid JSON body');
      }
    } else {
      body = await request.json();
    }

    const parseResult = EvaluateProjectSchema.safeParse(body);

    if (!parseResult.success) {
      return Errors.validationError('Invalid project data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const {
      projectName,
      description,
      fileStructure,
      localScore,
      localEvaluationSummary,
    } = parseResult.data;

    const projectPathHash =
      parseResult.data.projectPathHash ||
      createHash('sha256').update(`${userId}:${projectName}`).digest('hex');

    // Check rate limiting (max 10 evaluations per day per user)
    // FIX: Filter by today's date so users can re-evaluate on subsequent days
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEvaluations = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(projectEvaluations)
      .where(
        and(
          eq(projectEvaluations.userId, userId),
          gte(projectEvaluations.evaluatedAt, todayStart)
        )
      );

    if (todayEvaluations.length > 0) {
      const count = Number(todayEvaluations[0]?.count ?? 0);
      if (count >= 10) {
        return Errors.validationError(
          'Daily evaluation limit reached. Maximum 10 evaluations per day.'
        );
      }
    }

    // LLM Evaluation using Anthropic Claude API
    const llm = await evaluateProjectWithLLM({
      projectName,
      description,
      fileStructure,
      localEvaluationSummary,
    });

    const backendScore = llm.backendScore;
    const penaltyScore = llm.penaltyScore;
    const finalScore = localScore + backendScore + penaltyScore;
    const passed = finalScore >= 5;

    const last = await db
      .select({ cumulative: projectEvaluations.cumulativeScoreAfter })
      .from(projectEvaluations)
      .where(eq(projectEvaluations.userId, userId))
      .orderBy(sql`${projectEvaluations.evaluatedAt} DESC`)
      .limit(1);
    const cumulativeBefore = Number(last[0]?.cumulative ?? 0);
    const cumulativeScoreAfter = passed ? cumulativeBefore + finalScore : cumulativeBefore;

    const inserted = await db
      .insert(projectEvaluations)
      .values({
        userId,
        projectPathHash,
        projectName,
        localScore,
        backendScore,
        penaltyScore,
        finalScore,
        cumulativeScoreAfter,
        llmModel: 'glm-5',
        llmProvider: 'opencode',
        passed,
        feedback: llm.feedback,
      })
      .returning({ evaluatedAt: projectEvaluations.evaluatedAt });

    if (passed) {
      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];

      if (user) {
        await db
          .update(users)
          .set({
            successfulProjectsCount: (user.successfulProjectsCount ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }
    }

    const evaluatedAt = inserted[0]?.evaluatedAt
      ? new Date(inserted[0].evaluatedAt).toISOString()
      : new Date().toISOString();

    const response: EvaluationResponse = {
      success: true,
      evaluation: {
        passed,
        projectName,
        projectPathHash,
        localScore,
        backendScore,
        penaltyScore,
        finalScore,
        cumulativeScoreAfter,
        feedback: llm.feedback,
        evaluatedAt,
      },
    };

    return successResponse(response);
  } catch (error) {
    console.error('[API] Evaluate error:', error);
    return Errors.internalError();
  }
}

/**
 * OPTIONS /api/v1/evaluate
 * Handle CORS preflight
 */
export function OPTIONS() {
  return corsOptionsResponse();
}

// ============================================================================
// LLM Evaluation Implementation — OpenCode CLI
// ============================================================================

/**
 * Build the evaluation prompt for the LLM
 */
function buildEvaluationPrompt(params: {
  projectName: string;
  description: string;
  fileStructure?: Record<string, string[]>;
  localEvaluationSummary?: string;
}): string {
  const { projectName, description, fileStructure, localEvaluationSummary } = params;

  let fileStructureText = 'Not provided.';
  if (fileStructure && Object.keys(fileStructure).length > 0) {
    fileStructureText = Object.entries(fileStructure)
      .map(([dir, files]) => `${dir}/\n${files.map((f) => `  ${f}`).join('\n')}`)
      .join('\n');
  }

   const localSummaryText = (localEvaluationSummary && localEvaluationSummary.trim().length > 0)
     ? localEvaluationSummary.trim()
     : 'Not provided.';

   return `You are a strict but fair project evaluator. Evaluate the following project.

PROJECT NAME: ${projectName}

PROJECT DESCRIPTION / README:
${description}

LOCAL EVALUATION SUMMARY:
${localSummaryText}

FILE STRUCTURE:
${fileStructureText}

 EVALUATION OUTPUT:

 1. backendScore (0-5) — novelty/quality re-evaluation of backend and overall engineering
    - 0: very low quality, no meaningful backend work
    - 5: excellent, novel, high-quality backend engineering

 2. penaltyScore (-5..0) — penalties for low quality
    - 0: no penalty
    - -5: severe issues (misleading README, obvious low-effort, unsafe patterns)

 IMPORTANT: Respond with ONLY a JSON object, no markdown, no code fences, no extra text. Use this exact format:
 {"backendScore": <0-5>, "penaltyScore": <-5..0>, "feedback": "<2-3 sentences>"}`;
}

/**
 * LLM Project Evaluation using Anthropic Claude API
 *
 * Calls the Anthropic Messages API with project details,
 * parses the structured JSON response, and returns scores + feedback.
 */
async function evaluateProjectWithLLM(params: {
  projectName: string;
  description: string;
  fileStructure?: Record<string, string[]>;
  localEvaluationSummary?: string;
}): Promise<{
  backendScore: number;
  penaltyScore: number;
  feedback: string;
}> {
  if (process.env.MODU_ARENA_E2E_STUB_LLM === '1') {
    return { backendScore: 3, penaltyScore: 0, feedback: 'stubbed evaluation' };
  }

  const prompt = buildEvaluationPrompt(params);

  const { execSync } = await import('child_process');
  
  const opencodePath = process.env.OPENCODE_PATH || '/home/developer/.nvm/versions/node/v24.13.1/bin/opencode';
  
  const result = execSync(
    `${opencodePath} run -m zai-coding-plan/glm-5 --format json ${JSON.stringify(prompt)}`,
    {
      encoding: 'utf-8',
      timeout: 90000,
      maxBuffer: 1024 * 1024,
      cwd: '/tmp',
    }
  );

  let rawText = result.trim();
  
  let extractedText = '';
  for (const line of rawText.split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'text' && event.part?.text) {
        extractedText = event.part.text;
      }
    } catch {}
  }
  
  if (!extractedText) {
    console.error('[Evaluate] No text content in OpenCode response:', rawText);
    throw new Error('LLM returned empty response');
  }
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractedText);
  } catch {
    console.error('[Evaluate] Failed to parse GLM JSON response:', extractedText);
    throw new Error('LLM returned invalid JSON response');
  }

  const validationResult = LlmEvaluationResultSchema.safeParse(parsed);
  if (!validationResult.success) {
    console.error('[Evaluate] GLM response validation failed:', validationResult.error.flatten());
    throw new Error('LLM response did not match expected schema');
  }

  return {
    backendScore: validationResult.data.backendScore,
    penaltyScore: validationResult.data.penaltyScore,
    feedback: validationResult.data.feedback,
  };
}
