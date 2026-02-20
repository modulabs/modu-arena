import type { Plugin } from "@opencode-ai/plugin";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_FILE = join(homedir(), ".modu-arena.json");
const DEFAULT_SERVER = "http://backend.vibemakers.kr:23010";
const TOOL_TYPE = "opencode";

interface ModuConfig {
  apiKey: string;
  serverUrl?: string;
}

function loadConfig(): ModuConfig | null {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ModuConfig>;
    if (!parsed.apiKey) return null;
    return { apiKey: parsed.apiKey, serverUrl: parsed.serverUrl };
  } catch {
    return null;
  }
}

interface SessionTokens {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  modelName: string;
  firstSeenAt: number;
  lastSeenAt: number;
  stepCount: number;
}

const sessionAccumulator = new Map<string, SessionTokens>();
const sessionModelNames = new Map<string, string>();
const submittedSessions = new Set<string>();

function sign(apiKey: string, timestamp: string, body: string): string {
  return createHmac("sha256", apiKey)
    .update(`${timestamp}:${body}`)
    .digest("hex");
}

async function submitSession(
  _sessionID: string,
  tokens: SessionTokens,
  config: ModuConfig,
): Promise<void> {
  const server = config.serverUrl || DEFAULT_SERVER;
  const body = JSON.stringify({
    toolType: TOOL_TYPE,
    endedAt: new Date().toISOString(),
    startedAt: new Date(tokens.firstSeenAt).toISOString(),
    durationSeconds: Math.max(
      1,
      Math.floor((tokens.lastSeenAt - tokens.firstSeenAt) / 1000),
    ),
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cacheCreationTokens: tokens.cacheWriteTokens,
    cacheReadTokens: tokens.cacheReadTokens,
    modelName: tokens.modelName === "unknown" ? "" : (tokens.modelName || ""),
    turnCount: tokens.stepCount,
  });

  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = sign(config.apiKey, ts, body);

  try {
    const res = await fetch(`${server}/api/v1/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
        "X-Timestamp": ts,
        "X-Signature": sig,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      process.stderr.write(
        `[modu-arena] submit failed ${res.status}: ${text}\n`,
      );
    } else {
      process.stderr.write(
        `[modu-arena] session submitted (in=${tokens.inputTokens} out=${tokens.outputTokens})\n`,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[modu-arena] submit error: ${msg}\n`);
  }
}

export const ModuArenaPlugin: Plugin = async () => {
  const config = loadConfig();

  if (!config) {
    process.stderr.write(
      `[modu-arena] no config at ${CONFIG_FILE}. Run: npx @suncreation/modu-arena register\n`,
    );
    return {};
  }

  process.stderr.write("[modu-arena] plugin loaded, tracking tokens\n");

  return {
    event: async ({ event }) => {
      if (event.type === "message.updated") {
        const props = event.properties as Record<string, unknown>;
        const info = props.info as {
          role?: string;
          sessionID?: string;
          modelID?: string;
          providerID?: string;
        } | undefined;

        if (info?.sessionID && info.modelID) {
          sessionModelNames.set(info.sessionID, info.modelID);
          const existing = sessionAccumulator.get(info.sessionID);
          if (existing && (!existing.modelName || existing.modelName === "unknown")) {
            existing.modelName = info.modelID;
          }
        }
      }

      if (event.type === "message.part.updated") {
        const props = event.properties as Record<string, unknown>;
        const part = props.part as {
          type: string;
          sessionID?: string;
          modelID?: string;
          tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
          cost?: number;
        };

        if (part.sessionID && part.modelID) {
          sessionModelNames.set(part.sessionID, part.modelID);
          const existing = sessionAccumulator.get(part.sessionID);
          if (existing && (!existing.modelName || existing.modelName === "unknown")) {
            existing.modelName = part.modelID;
          }
        }

        if (part.type === "step-finish" && part.sessionID && part.tokens) {
          const sid = part.sessionID;
          const now = Date.now();
          const cachedModel = sessionModelNames.get(sid) || "";
          const existing = sessionAccumulator.get(sid);

          if (existing) {
            existing.inputTokens += part.tokens.input;
            existing.outputTokens += part.tokens.output;
            existing.cacheReadTokens += part.tokens.cache.read;
            existing.cacheWriteTokens += part.tokens.cache.write;
            existing.cost += part.cost ?? 0;
            existing.lastSeenAt = now;
            existing.stepCount += 1;
            if (cachedModel && (!existing.modelName || existing.modelName === "unknown")) {
              existing.modelName = cachedModel;
            }
          } else {
            sessionAccumulator.set(sid, {
              inputTokens: part.tokens.input,
              outputTokens: part.tokens.output,
              cacheReadTokens: part.tokens.cache.read,
              cacheWriteTokens: part.tokens.cache.write,
              cost: part.cost ?? 0,
              modelName: cachedModel,
              firstSeenAt: now,
              lastSeenAt: now,
              stepCount: 1,
            });
          }
        }
      }

      if (event.type === "session.idle") {
        const sid = (event.properties as { sessionID: string }).sessionID;
        const tokens = sessionAccumulator.get(sid);

        if (tokens && !submittedSessions.has(sid) && tokens.inputTokens > 0) {
          submittedSessions.add(sid);

          await new Promise((resolve) => setTimeout(resolve, 500));

          if (!tokens.modelName || tokens.modelName === "unknown") {
            const cached = sessionModelNames.get(sid);
            if (cached) tokens.modelName = cached;
          }

          if (!tokens.modelName || tokens.modelName === "unknown") {
            process.stderr.write(
              `[modu-arena] model unavailable for ${sid}\n`,
            );
            tokens.modelName = "";
          }

          sessionAccumulator.delete(sid);
          sessionModelNames.delete(sid);
          await submitSession(sid, tokens, config);
        }
      }
    },
  };
};

export default ModuArenaPlugin;
