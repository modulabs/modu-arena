/**
 * Platform-specific daemon installation for periodic tool data sync.
 * macOS: launchd (LaunchAgent)
 * Windows: Scheduled Task
 */
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { DAEMON_SYNC_INTERVAL_SEC } from './constants.js';

const IS_WIN = process.platform === 'win32';
const DAEMON_NAME = 'com.modu-arena.sync';

function getDaemonLogDir(): string {
  const dir = join(homedir(), '.modu-arena', 'logs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getNodePath(): string {
  try {
    return execSync('which node', { encoding: 'utf-8' }).trim();
  } catch {
    return 'node';
  }
}

function getCliPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'index.js');
}

export function installDaemon(): { success: boolean; message: string } {
  if (IS_WIN) {
    // Clean up legacy scheduled task that causes visible console window flashing.
    if (isDaemonInstalled()) {
      const cleanup = uninstallWindowsDaemon();
      return { success: true, message: cleanup.success
        ? 'Removed legacy sync daemon (caused window flashing). Use "modu-arena daemon-sync" to sync manually.'
        : `Legacy daemon found but removal failed: ${cleanup.message}` };
    }
    return { success: false, message: 'Daemon auto-sync is not supported on Windows. Use "modu-arena daemon-sync" to sync manually.' };
  }
  return installMacosDaemon();
}

export function uninstallDaemon(): { success: boolean; message: string } {
  if (IS_WIN) {
    return uninstallWindowsDaemon();
  }
  return uninstallMacosDaemon();
}

export function isDaemonInstalled(): boolean {
  if (IS_WIN) {
    try {
      execSync(`schtasks /Query /TN "${DAEMON_NAME}"`, { encoding: 'utf-8' });
      return true;
    } catch {
      return false;
    }
  }
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${DAEMON_NAME}.plist`);
  return existsSync(plistPath);
}

function installMacosDaemon(): { success: boolean; message: string } {
  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
  const plistPath = join(launchAgentsDir, `${DAEMON_NAME}.plist`);
  const logDir = getDaemonLogDir();
  const nodePath = getNodePath();
  const cliPath = getCliPath();
  
  const intervalMinutes = Math.floor(DAEMON_SYNC_INTERVAL_SEC / 60);
  
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${DAEMON_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${cliPath}</string>
        <string>daemon-sync</string>
    </array>
    <key>StartInterval</key>
    <integer>${DAEMON_SYNC_INTERVAL_SEC}</integer>
    <key>StandardOutPath</key>
    <string>${logDir}/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>${logDir}/daemon-error.log</string>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;

  try {
    if (!existsSync(launchAgentsDir)) {
      mkdirSync(launchAgentsDir, { recursive: true });
    }
    writeFileSync(plistPath, plist);
    execSync(`launchctl load ${plistPath}`, { encoding: 'utf-8' });
    return { success: true, message: `Daemon installed. Syncs every ${intervalMinutes} minutes.` };
  } catch (e) {
    return { success: false, message: `Failed to install daemon: ${e}` };
  }
}

function uninstallMacosDaemon(): { success: boolean; message: string } {
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${DAEMON_NAME}.plist`);
  
  try {
    if (existsSync(plistPath)) {
      execSync(`launchctl unload ${plistPath}`, { encoding: 'utf-8' });
      unlinkSync(plistPath);
    }
    return { success: true, message: 'Daemon uninstalled.' };
  } catch (e) {
    return { success: false, message: `Failed to uninstall daemon: ${e}` };
  }
}

function uninstallWindowsDaemon(): { success: boolean; message: string } {
  try {
    execSync(`schtasks /Delete /TN "${DAEMON_NAME}" /F`, { encoding: 'utf-8' });
    return { success: true, message: 'Daemon uninstalled.' };
  } catch (e) {
    return { success: false, message: `Failed to uninstall daemon: ${e}` };
  }
}

export function getDaemonStatus(): { installed: boolean; platform: string; interval: number } {
  return {
    installed: isDaemonInstalled(),
    platform: IS_WIN ? 'windows' : 'macos',
    interval: DAEMON_SYNC_INTERVAL_SEC,
  };
}
