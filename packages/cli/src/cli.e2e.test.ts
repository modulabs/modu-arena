import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

describe('CLI E2E', () => {
  it('prints help', () => {
    const srcDir = fileURLToPath(new URL('.', import.meta.url));
    const pkgRoot = join(srcDir, '..');
    execSync('bun run build', { cwd: pkgRoot, stdio: 'ignore' });
    const out = execFileSync('node', ['dist/index.js', '--help'], {
      cwd: pkgRoot,
      encoding: 'utf-8',
    });
    expect(out).toContain('Modu-Arena');
    expect(out).toContain('Commands:');
  });

  it('submit fails when README.md is missing', () => {
    const srcDir = fileURLToPath(new URL('.', import.meta.url));
    const pkgRoot = join(srcDir, '..');
    execSync('bun run build', { cwd: pkgRoot, stdio: 'ignore' });
    const dir = mkdtempSync(join(tmpdir(), 'modu-arena-cli-'));
    writeFileSync(join(dir, '.gitignore'), '');

    let err: unknown;
    try {
      execFileSync('node', [join(pkgRoot, 'dist', 'index.js'), 'submit'], {
        cwd: dir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
  });
});
