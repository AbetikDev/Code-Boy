import { QualitySignals, QualitySnapshot, QualityTrend, TestStatus } from './types';

/** A deterministic project-health summary; it does not inspect source text. */
export class CodeQualityAnalyzer {
  private last: QualitySnapshot = unknownSnapshot(0);

  evaluate(signals: QualitySignals, now = Date.now()): QualitySnapshot {
    const measuredAt = Number.isFinite(now) ? Math.max(0, now) : Date.now();
    if (!signals.hasProject) {
      this.last = unknownSnapshot(measuredAt);
      return this.getSnapshot();
    }

    const diagnosticsErrors = count(signals.diagnosticsErrors);
    const diagnosticsWarnings = count(signals.diagnosticsWarnings);
    const failingTests = count(signals.failingTests ?? 0);
    const redBlockers = count(signals.redBlockers ?? 0);
    const openTodos = count(signals.openTodos ?? 0);
    const fixmeHacks = count(signals.fixmeHacks ?? 0);
    const largeFileCount = count(signals.largeFileCount ?? 0);
    const unmatchedBlockers = signals.unmatchedBlockers === undefined
      ? Math.max(0, redBlockers - diagnosticsErrors)
      : Math.min(redBlockers, count(signals.unmatchedBlockers));
    const buildFailed = signals.buildFailed === true;
    const tests = testStatus(signals.tests);

    // ContextBack red blockers often describe the same diagnostics. Only the
    // independent remainder contributes an extra correctness penalty.
    const correctness = clamp(100
      - Math.min(60, diagnosticsErrors * 15)
      - Math.min(20, diagnosticsWarnings * 2)
      - Math.min(30, unmatchedBlockers * 10)
      - (buildFailed ? 20 : 0));
    const maintainability = clamp(100
      - Math.min(30, openTodos * 2)
      - Math.min(40, fixmeHacks * 5)
      - Math.min(30, largeFileCount * 5));
    // Unknown and stale test results are missing evidence, not failed tests.
    const testing = tests === 'passing' ? 100
      : tests === 'failing' ? clamp(50 - Math.max(1, failingTests) * 15)
      : null;
    const score = testing === null
      ? Math.round(correctness * 0.75 + maintainability * 0.25)
      : Math.round(correctness * 0.6 + maintainability * 0.2 + testing * 0.2);
    const status = diagnosticsErrors > 0 || buildFailed || unmatchedBlockers > 0 || tests === 'failing'
      ? 'blocked' : score < 85 || diagnosticsWarnings > 0 ? 'attention' : 'healthy';
    const next: QualitySnapshot = {
      status, score, correctness, maintainability, testing,
      trend: trend(this.last, score, redBlockers, diagnosticsErrors + unmatchedBlockers + (buildFailed ? 1 : 0) + (tests === 'failing' ? 1 : 0)),
      diagnosticsErrors, diagnosticsWarnings, failingTests: tests === 'failing' ? Math.max(1, failingTests) : 0,
      redBlockers, unmatchedBlockers, openTodos, fixmeHacks, largeFileCount,
      buildFailed, tests, measuredAt
    };
    this.last = next;
    return { ...next };
  }

  getSnapshot(): QualitySnapshot {
    return { ...this.last };
  }

  clear(): void {
    this.last = unknownSnapshot(0);
  }
}

function trend(previous: QualitySnapshot, score: number, redBlockers: number, blockers: number): QualityTrend {
  if (previous.score === null) return 'unknown';
  const difference = score - previous.score;
  if (difference >= 3) return 'up';
  if (difference <= -3) return 'down';
  const previousBlockers = previous.diagnosticsErrors + previous.unmatchedBlockers
    + (previous.buildFailed ? 1 : 0) + (previous.tests === 'failing' ? 1 : 0);
  if (blockers < previousBlockers) return 'up';
  if (blockers > previousBlockers) return 'down';
  if (redBlockers < previous.redBlockers) return 'up';
  if (redBlockers > previous.redBlockers) return 'down';
  return 'steady';
}

function unknownSnapshot(measuredAt: number): QualitySnapshot {
  return {
    status: 'unknown', score: null, correctness: null, maintainability: null,
    testing: null, trend: 'unknown', diagnosticsErrors: 0, diagnosticsWarnings: 0,
    failingTests: 0, redBlockers: 0, unmatchedBlockers: 0, openTodos: 0,
    fixmeHacks: 0, largeFileCount: 0, buildFailed: false, tests: 'unknown', measuredAt
  };
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function testStatus(value: TestStatus): TestStatus {
  return value === 'passing' || value === 'stale' || value === 'failing' ? value : 'unknown';
}
