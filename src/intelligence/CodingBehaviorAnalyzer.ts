import { CodingBehaviorSnapshot, CodingEditSample, CodingMode } from './types';

const WINDOW_MS = 5 * 60_000;
const IDLE_MS = 30_000;
const LARGE_CHARS = 300;
const LARGE_LINES = 10;

interface StoredSample {
  timestamp: number;
  insertedChars: number;
  deletedChars: number;
  insertedLines: number;
  large: boolean;
}

/** A bounded time-window heuristic over editing metadata. */
export class CodingBehaviorAnalyzer {
  private samples: StoredSample[] = [];
  private latestTime = 0;

  record(sample: CodingEditSample): CodingBehaviorSnapshot {
    if (!Number.isFinite(sample.timestamp)) return this.snapshot(this.latestTime);
    const insertedChars = count(sample.insertedChars);
    const deletedChars = count(sample.deletedChars);
    const insertedLines = count(sample.insertedLines);
    const timestamp = Math.max(0, sample.timestamp);
    this.latestTime = Math.max(this.latestTime, timestamp);

    if (insertedChars > 0 || deletedChars > 0) {
      // Late events outside the current window have no effect on the present state.
      if (timestamp >= this.latestTime - WINDOW_MS) {
        this.samples.push({
          timestamp, insertedChars, deletedChars, insertedLines,
          large: insertedChars >= LARGE_CHARS || insertedLines >= LARGE_LINES
        });
      }
    }
    this.prune(this.latestTime);
    return this.snapshot(this.latestTime);
  }

  snapshot(now = Date.now()): CodingBehaviorSnapshot {
    const observedAt = Number.isFinite(now) ? Math.max(0, now) : this.latestTime;
    this.latestTime = Math.max(this.latestTime, observedAt);
    this.prune(this.latestTime);
    const windowStart = observedAt - WINDOW_MS;
    const active = this.samples.filter(s => s.timestamp >= windowStart && s.timestamp <= observedAt);
    let insertedChars = 0;
    let deletedChars = 0;
    let typedChars = 0;
    let bulkChars = 0;
    let largestInsertion = 0;
    let largestInsertionLines = 0;
    let smallEditCount = 0;
    let largeInsertionCount = 0;
    let firstEditAt = Infinity;
    let lastEditAt = -Infinity;

    for (const sample of active) {
      insertedChars += sample.insertedChars;
      deletedChars += sample.deletedChars;
      largestInsertion = Math.max(largestInsertion, sample.insertedChars);
      largestInsertionLines = Math.max(largestInsertionLines, sample.insertedLines);
      firstEditAt = Math.min(firstEditAt, sample.timestamp);
      lastEditAt = Math.max(lastEditAt, sample.timestamp);
      if (sample.large) {
        largeInsertionCount++;
        bulkChars += sample.insertedChars;
      } else {
        smallEditCount++;
        typedChars += sample.insertedChars;
      }
    }

    const editCount = active.length;
    const assistedRatio = insertedChars === 0 ? 0 : round(bulkChars / insertedChars, 3);
    const mode = classify({ editCount, lastEditAt, observedAt, firstEditAt, smallEditCount, largeInsertionCount, assistedRatio });
    const confidence = confidenceFor(mode, smallEditCount, largeInsertionCount, assistedRatio);
    return {
      mode, windowStart, observedAt, lastEditAt: editCount ? lastEditAt : null,
      typedChars, insertedChars, deletedChars, largestInsertion, largestInsertionLines,
      editCount, smallEditCount, largeInsertionCount, assistedRatio, confidence
    };
  }

  clear(): void {
    this.samples = [];
    this.latestTime = 0;
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    this.samples = this.samples.filter(sample => sample.timestamp >= cutoff);
  }
}

function classify(evidence: {
  editCount: number; lastEditAt: number; observedAt: number; firstEditAt: number;
  smallEditCount: number; largeInsertionCount: number; assistedRatio: number;
}): CodingMode {
  if (evidence.editCount === 0 || evidence.observedAt - evidence.lastEditAt >= IDLE_MS) return 'idle';
  if (evidence.largeInsertionCount >= 3 && evidence.assistedRatio >= 0.65 && evidence.smallEditCount < 10) return 'vibe-heavy';
  if (evidence.largeInsertionCount > 0) return 'assisted';
  if (evidence.smallEditCount >= 20 && evidence.lastEditAt - evidence.firstEditAt >= 90_000) return 'flow';
  return 'handwritten';
}

function confidenceFor(mode: CodingMode, small: number, large: number, ratio: number): number {
  switch (mode) {
    case 'idle': return 1;
    case 'handwritten': return round(Math.min(0.85, 0.55 + small * 0.025), 2);
    case 'flow': return round(Math.min(0.97, 0.82 + (small - 20) * 0.005), 2);
    case 'assisted': return round(Math.min(0.85, 0.58 + large * 0.07), 2);
    case 'vibe-heavy': return round(Math.min(0.96, 0.78 + (large - 3) * 0.03 + (ratio - 0.65) * 0.2), 2);
  }
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

const EXCLUDED_SEGMENTS = new Set([
  '.git', '.next', '.nuxt', '.turbo', '.cache', '.idea', '.vscode-test',
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage',
  'generated', '__generated__', 'gen', 'release', 'debug'
]);
const EXCLUDED_FILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lock', 'bun.lockb', 'cargo.lock', 'gemfile.lock', 'poetry.lock',
  'pipfile.lock', 'uv.lock', 'composer.lock', 'go.sum'
]);

/** Apply before recording edits. The path is never stored by the analyzer. */
export function isEligibleCodingFile(path: string, languageId?: string, excludePatterns: readonly string[] = []): boolean {
  if (typeof path !== 'string' || !path.trim()) return false;
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const segments = normalized.split('/').filter(Boolean);
  const file = segments[segments.length - 1] ?? '';
  if (segments.some(segment => EXCLUDED_SEGMENTS.has(segment)) || EXCLUDED_FILES.has(file)) return false;
  if (file === '.env' || file.startsWith('.env.')) return false;
  if (/\.(?:min\.(?:js|css)|map|snap|tsbuildinfo|pyc|d\.ts|g\.dart|pb\.[^.]+|designer\.[^.]+)$/.test(file)) return false;
  if (/(?:^|[._-])(?:generated|gen)(?:[._-])/.test(file) || /\.lock$/.test(file)) return false;
  if (languageId && /^(?:plaintext|log|output|diff|binary)$/.test(languageId.toLowerCase())) return false;
  return !excludePatterns.some(pattern => matchesGlob(normalized, pattern));
}

function matchesGlob(path: string, pattern: string): boolean {
  if (!pattern) return false;
  const normalized = pattern.replace(/\\/g, '/').toLowerCase();
  let regex = '';
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '*' && normalized[i + 1] === '*') {
      if (normalized[i + 2] === '/') {
        regex += '(?:.*/)?';
        i += 2;
      } else {
        regex += '.*';
        i++;
      }
    } else if (char === '*') {
      regex += '[^/]*';
    } else if (char === '?') {
      regex += '[^/]';
    } else {
      regex += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
    }
  }
  return new RegExp(`(?:^|/)${regex}$`).test(path);
}
