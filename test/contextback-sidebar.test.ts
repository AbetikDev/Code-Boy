/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildDayRecap } from '../src/contextback/analysis/DayRecap';
import { QualityContext, yesterdayRange, shouldReview } from '../src/contextback/analysis/QualityContext';
import { parseQualityResponse } from '../src/contextback/ai/BobShellProvider';
import { Database } from '../src/contextback/Database';
import { GitService } from '../src/contextback/git/GitService';
import { DEFAULT_CB_SETTINGS, type CBEvent, type CBSession } from '../src/contextback/types';

test('yesterday recap aggregates sessions and excludes events after midnight', () => {
  const now = new Date(2026, 8, 26, 9);
  const { start, end } = yesterdayRange(now);
  const sessions: CBSession[] = [
    { id: 'a', projectId: 'p', branchId: 'b', startedAt: start + 3600000, endedAt: start + 4200000, durationSecs: 600, summary: '' },
    { id: 'b', projectId: 'p', branchId: 'b', startedAt: end - 300000, endedAt: end + 300000, durationSecs: 600, summary: '' },
  ];
  const events: CBEvent[] = [
    { id: '1', sessionId: 'a', type: 'file_save', timestamp: start + 3700000, filePath: '/src/a.ts', data: {} },
    { id: '2', sessionId: 'b', type: 'terminal_command', timestamp: end - 1000, filePath: '', data: { command: 'npm test', exitCode: 1 } },
    { id: '3', sessionId: 'b', type: 'file_save', timestamp: end + 1000, filePath: '/src/today.ts', data: {} },
  ];
  const recap = buildDayRecap(sessions, events, [], [], [], now);
  assert.equal(recap.date, '2026-09-25');
  assert.equal(recap.minutes, 15);
  assert.deepEqual(recap.files, ['/src/a.ts']);
  assert.equal(recap.tests.failed, 1);
  assert.match(recap.nextStep, /Rerun/);
  assert.equal(buildDayRecap([], [], [], [], [], now).active, false);
});

test('quality input stays bounded and omits excluded or sensitive content', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-quality-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  try {
    git('init');
    fs.writeFileSync(path.join(root, 'app.ts'), 'export const value = 1;\n');
    git('add', 'app.ts');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'base');
    fs.writeFileSync(path.join(root, 'app.ts'), 'export const value = 2;\nconst API_KEY = "hidden";\n');
    fs.writeFileSync(path.join(root, '.env'), 'PASSWORD=hidden');
    fs.writeFileSync(path.join(root, 'secret.key'), 'private');
    fs.writeFileSync(path.join(root, 'extra.ts'), 'export const extra = true;\n');
    const ctx = new QualityContext(root, DEFAULT_CB_SETTINGS);
    const changes = await ctx.workingChanges();
    assert.ok(changes.files.includes('app.ts'));
    assert.ok(changes.files.includes('extra.ts'));
    assert.ok(!changes.text.includes('hidden'));
    assert.ok(!changes.text.includes('secret.key'));
    assert.ok(changes.text.length <= 50_000);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Bob quality response rejects invalid scores and caps findings', () => {
  assert.equal(parseQualityResponse('{"score":101,"rationale":"fine","findings":[]}'), null);
  assert.equal(parseQualityResponse('not JSON'), null);
  const parsed = parseQualityResponse(JSON.stringify({ score: 73, rationale: '  Some issues  ', findings: ['a', 'b', 'c', 'd'] }));
  assert.equal(parsed?.score, 73);
  assert.equal(parsed?.rationale, 'Some issues');
  assert.equal(parsed?.findings.length, 3);
});

test('quality cache skips an unchanged automatic review and permits manual refresh', () => {
  const input = { text: 'code sample', hash: 'abc', files: ['a.ts'] };
  const previous = { projectId: 'p', kind: 'current' as const, day: '2026-09-26', inputHash: 'abc', checkedAt: 1, result: null };
  assert.equal(shouldReview(previous, input, false), false);
  assert.equal(shouldReview(previous, input, true), true);
  assert.equal(shouldReview(previous, { ...input, hash: 'new' }, false), true);
  assert.equal(shouldReview(null, { ...input, text: '' }, true), false);
});

test('version 1 history remains available after adding quality storage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-migrate-'));
  try {
    fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify({ version: 1, projects: [{ id: 'old-project', name: 'Old' }], sessions: [{ id: 'old-session', projectId: 'old-project' }] }));
    const db = new Database(dir);
    assert.equal(db.get('projects')[0]?.id, 'old-project');
    assert.equal(db.get('sessions')[0]?.id, 'old-session');
    assert.deepEqual(db.get('qualityCache'), []);
    assert.deepEqual(db.get('diffSnapshots'), []);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('yesterday recap uses real Git files when ContextBack has no sessions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-git-recap-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  try {
    git('init');
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'feature.ts'), 'export const feature = true;\n');
    git('add', '.');
    const commitDate = new Date(2026, 8, 25, 12).toISOString();
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Add feature'], {
      cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: commitDate, GIT_COMMITTER_DATE: commitDate },
    });
    const now = new Date(2026, 8, 26, 9);
    const { start, end } = yesterdayRange(now);
    const service = new GitService();
    const commits = await service.getCommitsInRange(root, start, end);
    const files = await service.getFilesForCommits(root, commits);
    const recap = buildDayRecap([], [], commits, [], [], now, files.map(f => path.join(root, f)));
    assert.equal(recap.active, true);
    assert.equal(recap.minutes, 0);
    assert.equal(recap.changedFilesCount, 1);
    assert.deepEqual(recap.sources, ['Git']);
    assert.equal(recap.commits[0], 'Add feature');
    assert.equal(recap.files[0], path.join(root, 'src', 'feature.ts'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
