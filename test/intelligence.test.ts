import test from 'node:test';
import assert from 'node:assert/strict';
import { CodingBehaviorAnalyzer, isEligibleCodingFile } from '../src/intelligence/CodingBehaviorAnalyzer';
import { CodeQualityAnalyzer } from '../src/intelligence/CodeQualityAnalyzer';
import { DeveloperStateEngine } from '../src/intelligence/DeveloperStateEngine';
import { CodingEditSample, QualitySignals } from '../src/intelligence/types';

function edit(timestamp: number, insertedChars = 1, insertedLines = 0, deletedChars = 0): CodingEditSample {
  return { timestamp, insertedChars, insertedLines, deletedChars, languageId: 'typescript' };
}

function quality(overrides: Partial<QualitySignals> = {}): QualitySignals {
  return { hasProject: true, diagnosticsErrors: 0, diagnosticsWarnings: 0, tests: 'unknown', ...overrides };
}

test('small edits become flow only after both edit and time thresholds, then idle at 30 seconds', () => {
  const analyzer = new CodingBehaviorAnalyzer();
  for (let i = 0; i < 20; i++) {
    const snapshot = analyzer.record(edit(i * 5_000, 3));
    if (i < 19) assert.equal(snapshot.mode, 'handwritten');
  }
  const flow = analyzer.snapshot(95_000);
  assert.equal(flow.mode, 'flow');
  assert.equal(flow.editCount, 20);
  assert.equal(flow.typedChars, 60);
  assert.equal(flow.confidence > 0.8, true);
  assert.equal(analyzer.snapshot(124_999).mode, 'flow');
  assert.equal(analyzer.snapshot(125_000).mode, 'idle');
  const expired = analyzer.snapshot(95_000 + 5 * 60_000 + 1);
  assert.equal(expired.editCount, 0);
  assert.equal(expired.lastEditAt, null);
});

test('one large insertion is assisted; repeated dominant insertions are vibe-heavy', () => {
  const analyzer = new CodingBehaviorAnalyzer();
  const once = analyzer.record(edit(0, 300));
  assert.equal(once.mode, 'assisted');
  assert.equal(once.largeInsertionCount, 1);
  analyzer.record(edit(1_000, 20, 10));
  const repeated = analyzer.record(edit(2_000, 400));
  assert.equal(repeated.mode, 'vibe-heavy');
  assert.equal(repeated.largeInsertionCount, 3);
  assert.equal(repeated.assistedRatio, 1);
  assert.equal(repeated.largestInsertionLines, 10);
  for (let i = 0; i < 10; i++) analyzer.record(edit(3_000 + i, 2));
  assert.equal(analyzer.snapshot(3_010).mode, 'assisted');
});

test('large insertions need to dominate inserted characters before vibe-heavy classification', () => {
  const analyzer = new CodingBehaviorAnalyzer();
  analyzer.record(edit(0, 300));
  analyzer.record(edit(100, 300));
  analyzer.record(edit(200, 300));
  for (let i = 0; i < 9; i++) analyzer.record(edit(300 + i, 90));
  const snapshot = analyzer.snapshot(1_000);
  assert.equal(snapshot.assistedRatio < 0.65, true);
  assert.equal(snapshot.mode, 'assisted');
  assert.equal(snapshot.smallEditCount, 9);
});

test('invalid metrics cannot inflate behavior and deleted-only edits count as small edits', () => {
  const analyzer = new CodingBehaviorAnalyzer();
  analyzer.record({ timestamp: 100, insertedChars: -10, deletedChars: Number.NaN, insertedLines: 20 });
  assert.equal(analyzer.snapshot(100).editCount, 0);
  analyzer.record(edit(200, 0, 0, 5));
  const snapshot = analyzer.snapshot(200);
  assert.equal(snapshot.mode, 'handwritten');
  assert.equal(snapshot.deletedChars, 5);
  assert.equal(snapshot.insertedChars, 0);
  assert.equal(snapshot.typedChars, 0);
});

test('coding file filter excludes generated outputs, lockfiles, custom globs and non-code documents', () => {
  assert.equal(isEligibleCodingFile('/repo/src/main.ts', 'typescript'), true);
  assert.equal(isEligibleCodingFile('C:\\repo\\node_modules\\pkg\\index.js', 'javascript'), false);
  assert.equal(isEligibleCodingFile('/repo/src/api.generated.ts', 'typescript'), false);
  assert.equal(isEligibleCodingFile('/repo/src/main.min.js', 'javascript'), false);
  assert.equal(isEligibleCodingFile('/repo/pnpm-lock.yaml', 'yaml'), false);
  assert.equal(isEligibleCodingFile('/repo/.env.local', 'dotenv'), false);
  assert.equal(isEligibleCodingFile('/repo/src/view.test.ts.snap', 'plaintext'), false);
  assert.equal(isEligibleCodingFile('/repo/secret.ts', 'typescript', ['**/secret.*']), false);
  assert.equal(isEligibleCodingFile('/repo/data.txt', 'plaintext'), false);
});

test('quality excludes diagnostics that also appear as red blockers and handles stale tests as unknown evidence', () => {
  const analyzer = new CodeQualityAnalyzer();
  const sameError = analyzer.evaluate(quality({ diagnosticsErrors: 1, redBlockers: 1, tests: 'stale' }), 100);
  assert.equal(sameError.unmatchedBlockers, 0);
  assert.equal(sameError.correctness, 85);
  assert.equal(sameError.testing, null);
  assert.equal(sameError.status, 'blocked');
  const independentBlocker = analyzer.evaluate(quality({ diagnosticsErrors: 1, redBlockers: 2, tests: 'stale' }), 200);
  assert.equal(independentBlocker.unmatchedBlockers, 1);
  assert.equal(independentBlocker.correctness, 75);
  assert.equal(independentBlocker.trend, 'down');
  const redThreadGone = analyzer.evaluate(quality({ diagnosticsErrors: 1, redBlockers: 1, tests: 'stale' }), 250);
  assert.equal(redThreadGone.trend, 'up');
  const overlappingThreadGone = analyzer.evaluate(quality({ diagnosticsErrors: 1, tests: 'stale' }), 275);
  assert.equal(overlappingThreadGone.score, redThreadGone.score);
  assert.equal(overlappingThreadGone.trend, 'up');
  const fixed = analyzer.evaluate(quality({ tests: 'passing' }), 300);
  assert.equal(fixed.status, 'healthy');
  assert.equal(fixed.testing, 100);
  assert.equal(fixed.trend, 'up');
});

test('quality reports unknown without project and does not treat unknown tests as a failure', () => {
  const analyzer = new CodeQualityAnalyzer();
  const empty = analyzer.evaluate(quality({ hasProject: false, diagnosticsErrors: 9, tests: 'failing' }), 10);
  assert.equal(empty.status, 'unknown');
  assert.equal(empty.score, null);
  assert.equal(empty.tests, 'unknown');
  const pending = analyzer.evaluate(quality(), 20);
  assert.equal(pending.status, 'healthy');
  assert.equal(pending.testing, null);
  assert.equal(pending.score, 100);
  assert.equal(pending.trend, 'unknown');
  const failed = analyzer.evaluate(quality({ tests: 'failing', failingTests: 2 }), 30);
  assert.equal(failed.status, 'blocked');
  assert.equal(failed.testing, 20);
  assert.equal(failed.failingTests, 2);
  assert.equal(failed.trend, 'down');
});

test('developer state returns independent copies and holds no paths or source text', () => {
  const engine = new DeveloperStateEngine();
  engine.recordEdit({ ...edit(1_000, 4), languageId: 'typescript' });
  engine.updateQuality(quality({ redBlockers: 1, tests: 'passing' }), 1_000);
  engine.setMusic(true, 'Playing');
  const first = engine.getDeveloperState(1_000);
  assert.equal(first.behavior.mode, 'handwritten');
  assert.equal(first.redBlockers, 1);
  assert.equal(first.tests, 'passing');
  assert.equal(first.musicPlaying, true);
  first.behavior.mode = 'idle';
  first.quality.score = 0;
  const second = engine.getDeveloperState(1_000);
  assert.equal(second.behavior.mode, 'handwritten');
  assert.equal(second.quality.score !== 0, true);
  assert.equal(JSON.stringify(second).includes('typescript'), false);
  engine.clear();
  assert.equal(engine.getQualitySnapshot().status, 'unknown');
  assert.equal(engine.getDeveloperState(2_000).musicPlaying, false);
});
