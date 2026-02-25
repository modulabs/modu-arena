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

const sessionModelNames = new Map<string, string>();

function sign(apiKey: string, timestamp: string, body: string): string {
  return createHmac("sha256", apiKey)
    .update(`${timestamp}:${body}`)
    .digest("hex");
}

async function submitStep(
  sessionID: string,
  params: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    modelName: string;
    cost: number;
  },
  config: ModuConfig,
): Promise<void> {
  const server = config.serverUrl || DEFAULT_SERVER;
  const nowIso = new Date().toISOString();
  const body = JSON.stringify({
    toolType: TOOL_TYPE,
    endedAt: nowIso,
    startedAt: nowIso,
    durationSeconds: 1,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    cacheCreationTokens: params.cacheWriteTokens,
    cacheReadTokens: params.cacheReadTokens,
    modelName: params.modelName === "unknown" ? "" : (params.modelName || ""),
    turnCount: 1,
  });

  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = sign(config.apiKey, ts, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

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
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      await res.text();
    }
    // silent on success
  } catch {
    clearTimeout(timeout);
  }
}

export const ModuArenaPlugin: Plugin = async () => {
  const config = loadConfig();

  if (!config) {
    return {};
  }



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
        }

        if (part.type === "step-finish" && part.sessionID && part.tokens) {
          const sid = part.sessionID;
          const inputTokens = part.tokens.input;
          const outputTokens = part.tokens.output;
          const cacheReadTokens = part.tokens.cache.read;
          const cacheWriteTokens = part.tokens.cache.write;
          const cost = part.cost ?? 0;

          if (inputTokens > 0 || outputTokens > 0) {
            const modelName = part.modelID || sessionModelNames.get(sid) || "";
            void submitStep(
              sid,
              {
                inputTokens,
                outputTokens,
                cacheReadTokens,
                cacheWriteTokens,
                modelName,
                cost,
              },
              config,
            ).catch(() => {});
          }
        }
      }
    },
  };
};

export default ModuArenaPlugin;
