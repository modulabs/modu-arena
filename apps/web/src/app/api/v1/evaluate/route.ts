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
  description: z.string().min(10).max(5000),
  fileStructure: z.record(z.string(), z.array(z.string())).optional(),
});

/**
 * LLM evaluation result schema (for parsing Anthropic API response)
 */
const LlmEvaluationResultSchema = z.object({
  rubricFunctionality: z.number().int().min(0).max(5),
  rubricPracticality: z.number().int().min(0).max(5),
  feedback: z.string().min(1),
});

/**
 * Project Evaluation Response
 */
interface EvaluationResponse {
  success: boolean;
  evaluation?: {
    passed: boolean;
    totalScore: number;
    rubricFunctionality: number;
    rubricPracticality: number;
    feedback: string;
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

    const { projectName, description, fileStructure } = parseResult.data;

    // Generate project path hash for privacy
    const projectPathHash = createHash('sha256')
      .update(`${userId}:${projectName}:${Date.now()}`)
      .digest('hex');

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
    const evaluation = await evaluateProjectWithLLM({
      projectName,
      description,
      fileStructure,
    });

    // Only store if passing (score >= 5)
    if (evaluation.passed) {
      await db.insert(projectEvaluations).values({
        userId,
        projectPathHash,
        projectName,
        totalScore: evaluation.totalScore,
        rubricFunctionality: evaluation.rubricFunctionality,
        rubricPracticality: evaluation.rubricPracticality,
        llmModel: ANTHROPIC_MODEL,
        llmProvider: 'anthropic',
        passed: true,
        feedback: evaluation.feedback,
      });

      // Increment user's successful project count
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

    const response: EvaluationResponse = {
      success: true,
      evaluation,
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
// LLM Evaluation Implementation — Anthropic Claude API
// ============================================================================

/**
 * Anthropic Messages API response types
 */
interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Build the evaluation prompt for the LLM
 */
function buildEvaluationPrompt(params: {
  projectName: string;
  description: string;
  fileStructure?: Record<string, string[]>;
}): string {
  const { projectName, description, fileStructure } = params;

  let fileStructureText = 'Not provided.';
  if (fileStructure && Object.keys(fileStructure).length > 0) {
    fileStructureText = Object.entries(fileStructure)
      .map(([dir, files]) => `${dir}/\n${files.map((f) => `  ${f}`).join('\n')}`)
      .join('\n');
  }

  return `You are a strict but fair project evaluator. Evaluate the following project based on two rubrics.

PROJECT NAME: ${projectName}

PROJECT DESCRIPTION / README:
${description}

FILE STRUCTURE:
${fileStructureText}

EVALUATION RUBRICS (score each 0-5):

1. **Functionality (rubricFunctionality)** — Does it work as described?
   - 0: No evidence it works at all
   - 1: Barely functional, major features missing
   - 2: Some features work but significant issues
   - 3: Core features work but with notable gaps
   - 4: Most features work as described
   - 5: All described features appear fully functional

2. **Practicality (rubricPracticality)** — Is it practical for real use?
   - 0: No practical value
   - 1: Toy project with no real-world application
   - 2: Limited practical use, needs major work
   - 3: Could be useful with some improvements
   - 4: Practically useful for its intended purpose
   - 5: Highly practical, addresses a real need well

IMPORTANT: Respond with ONLY a JSON object, no markdown, no code fences, no extra text. Use this exact format:
{"rubricFunctionality": <0-5>, "rubricPracticality": <0-5>, "feedback": "<2-3 sentences explaining the scores>"}`;
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
}): Promise<{
  passed: boolean;
  totalScore: number;
  rubricFunctionality: number;
  rubricPracticality: number;
  feedback: string;
}> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicApiKey) {
    console.error('[Evaluate] ANTHROPIC_API_KEY environment variable is not set');
    throw new Error('LLM evaluation service is not configured');
  }

  const prompt = buildEvaluationPrompt(params);

  // Call Anthropic Messages API
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as AnthropicErrorResponse;
    console.error('[Evaluate] Anthropic API error:', {
      status: response.status,
      error: errorBody.error,
    });
    throw new Error(`Anthropic API error: ${errorBody.error?.message ?? response.statusText}`);
  }

  const apiResponse = (await response.json()) as AnthropicResponse;

  // Extract text from response content blocks
  const textBlock = apiResponse.content.find(
    (block): block is AnthropicContentBlock => block.type === 'text'
  );

  if (!textBlock) {
    console.error('[Evaluate] No text content in Anthropic response');
    throw new Error('LLM returned empty response');
  }

  // Parse JSON from LLM response — strip potential markdown fences
  let rawText = textBlock.text.trim();
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error('[Evaluate] Failed to parse LLM JSON response:', rawText);
    throw new Error('LLM returned invalid JSON response');
  }

  // Validate with zod schema
  const validationResult = LlmEvaluationResultSchema.safeParse(parsed);
  if (!validationResult.success) {
    console.error('[Evaluate] LLM response validation failed:', validationResult.error.flatten());
    throw new Error('LLM response did not match expected schema');
  }

  const { rubricFunctionality, rubricPracticality, feedback } = validationResult.data;
  const totalScore = rubricFunctionality + rubricPracticality;
  const passed = totalScore >= 5;

  return {
    passed,
    totalScore,
    rubricFunctionality,
    rubricPracticality,
    feedback,
  };
}
