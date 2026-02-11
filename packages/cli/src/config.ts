import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { CONFIG_FILE_NAME } from './constants.js';

export interface Config {
  apiKey: string;
  serverUrl?: string;
  tools?: string[];
}

function getConfigPath(): string {
  return join(homedir(), CONFIG_FILE_NAME);
}

export function loadConfig(): Config | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function requireConfig(): Config {
   const config = loadConfig();
   if (!config?.apiKey) {
     console.error(
       'Error: Not configured. Run `npx @suncreation/modu-arena install` first.',
     );
     process.exit(1);
   }
   return config;
}
