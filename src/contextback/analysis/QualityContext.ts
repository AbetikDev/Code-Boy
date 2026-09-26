import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CBSettings, CBQualityCacheEntry } from '../types';
import { isExcluded } from '../util';

const run = promisify(execFile);
const MAX_FILES = 10;
const MAX_CHARS = 50_000;
const CODE_EXT = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|cs|c|cc|cpp|h|hpp|php|rb|vue|svelte|html|css|scss|sql)$/i;
const PRIVATE_PATH = /(?:^|[/\\])(?:\.env[^/\\]*|secrets?|credentials?|node_modules|dist|build|\.git)(?:[/\\]|$)|\.(?:pem|key|p12|pfx)$/i;
const SENSITIVE_LINE = /(?:api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\s*[:=]|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i;

export interface QualityInput { text: string; hash: string; files: string[] }

export function shouldReview(previous: CBQualityCacheEntry | null, input: QualityInput, force: boolean): boolean {
  return !!input.text.trim() && (force || previous?.inputHash !== input.hash);
}

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function yesterdayRange(now = new Date()): { day: string; start: number; end: number } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return { day: localDay(yesterday), start: yesterday.getTime(), end: today.getTime() };
}

export class QualityContext {
  constructor(private readonly root: string, private readonly settings: CBSettings) {}

  private async git(args: string[]): Promise<string> {
    try {
      const { stdout } = await run('git', args, { cwd: this.root, timeout: 8_000, maxBuffer: 2_000_000 });
      return stdout;
    } catch { return ''; }
  }

  private allowed(file: string): boolean {
    const relative = file.replace(/\\/g, '/');
    const full = path.resolve(this.root, file);
    const inside = path.relative(this.root, full);
    return !!inside && !inside.startsWith('..') && !path.isAbsolute(inside)
      && CODE_EXT.test(relative) && !PRIVATE_PATH.test(relative)
      && !isExcluded(relative, this.settings.exclude) && !isExcluded(full, this.settings.exclude);
  }

  private safeRegularFile(file: string): string | null {
    try {
      const full = path.resolve(this.root, file);
      if (fs.lstatSync(full).isSymbolicLink() || !fs.statSync(full).isFile()) return null;
      const realRoot = fs.realpathSync(this.root);
      const inside = path.relative(realRoot, fs.realpathSync(full));
      return inside && !inside.startsWith('..') && !path.isAbsolute(inside) ? full : null;
    } catch { return null; }
  }

  private clean(text: string): string {
    return text.split(/\r?\n/).map(line => SENSITIVE_LINE.test(line) ? '[redacted sensitive line]' : line)
      .join('\n').slice(0, MAX_CHARS);
  }

  private input(parts: string[], files: string[]): QualityInput {
    const text = this.clean(parts.join('\n\n'));
    return { text, files, hash: createHash('sha256').update(text).digest('hex') };
  }

  async committedYesterday(start: number, end: number): Promise<QualityInput> {
    const hashes = (await this.git(['log', `--since=${new Date(start).toISOString()}`, `--until=${new Date(end - 1).toISOString()}`, '--format=%H']))
      .trim().split(/\r?\n/).filter(Boolean).slice(0, 10);
    const files: string[] = [];
    const parts: string[] = [];
    for (const hash of hashes) {
      const names = (await this.git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', hash]))
        .trim().split(/\r?\n/).filter(name => this.allowed(name));
      for (const file of names) {
        if (!files.includes(file) && files.length >= MAX_FILES) continue;
        if (!files.includes(file)) files.push(file);
        const patch = await this.git(['show', '--format=', '--no-ext-diff', '--no-textconv', '--unified=2', hash, '--', file]);
        if (patch) parts.push(patch);
        if (parts.join('').length >= MAX_CHARS) break;
      }
      if (parts.join('').length >= MAX_CHARS) break;
    }
    return this.input(parts, files);
  }

  async workingChanges(): Promise<QualityInput> {
    const status = await this.git(['status', '--porcelain=v1', '-z']);
    const names = status.split('\0').filter(Boolean).map(s => s.slice(3));
    const files = [...new Set(names)].filter(name => this.allowed(name)).slice(0, MAX_FILES);
    const parts: string[] = [];
    for (const file of files) {
      let patch = await this.git(['diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--unified=2', '--', file]);
      if (!patch) {
        try {
          const full = this.safeRegularFile(file);
          if (full && fs.statSync(full).size <= MAX_CHARS) patch = `Untracked file: ${file}\n${fs.readFileSync(full, 'utf8')}`;
        } catch { /* deleted or unreadable */ }
      }
      if (patch) parts.push(patch);
      if (parts.join('').length >= MAX_CHARS) break;
    }
    return this.input(parts, files);
  }

  async currentSample(recentFiles: string[]): Promise<QualityInput> {
    const changes = await this.workingChanges();
    const files = [...changes.files];
    const parts = changes.text ? [changes.text] : [];
    for (const candidate of recentFiles) {
      const relative = path.relative(this.root, candidate).replace(/\\/g, '/');
      if (!this.allowed(relative) || files.includes(relative) || files.length >= MAX_FILES) continue;
      try {
        const full = this.safeRegularFile(relative);
        if (!full || fs.statSync(full).size > 20_000) continue;
        parts.push(`Current file: ${relative}\n${fs.readFileSync(full, 'utf8')}`);
        files.push(relative);
      } catch { /* file no longer exists */ }
      if (parts.join('').length >= MAX_CHARS) break;
    }
    return this.input(parts, files);
  }
}
