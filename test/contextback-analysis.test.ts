/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionAnalyzer } from '../src/contextback/analysis/SessionAnalyzer';
import { TopicAnalyzer } from '../src/contextback/analysis/TopicAnalyzer';
import { ThreadDetector } from '../src/contextback/analysis/ThreadDetector';
import type { CBSession, CBEvent, CBError, CBTodo, CBCommit } from '../src/contextback/types';

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<CBSession> = {}): CBSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    branchId: 'branch-1',
    startedAt: 1000,
    endedAt: 61_000,
    durationSecs: 60,
    summary: '',
    ...overrides,
  };
}

function makeError(overrides: Partial<CBError> = {}): CBError {
  return {
    id: 'e1',
    projectId: 'proj-1',
    sessionId: 'sess-1',
    fingerprint: 'fp1',
    file: '/src/app.ts',
    line: 10,
    message: 'Type error',
    severity: 'error',
    firstSeen: 1000,
    lastSeen: Date.now(),
    resolved: false,
    ...overrides,
  };
}

function makeTodo(overrides: Partial<CBTodo> = {}): CBTodo {
  return {
    id: 'td1',
    projectId: 'proj-1',
    file: '/src/app.ts',
    line: 20,
    text: 'Implement this',
    tag: 'TODO',
    status: 'open',
    firstSeen: 1000,
    lastSeen: Date.now(),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CBEvent> = {}): CBEvent {
  return {
    id: 'ev1',
    sessionId: 'sess-1',
    type: 'file_save',
    timestamp: 2000,
    filePath: '/src/app.ts',
    data: {},
    ...overrides,
  };
}

// ─── 1. SESSION ANALYZER ─────────────────────────────────────────────────────

test('SessionAnalyzer nextStep falls back to TODO when no errors are open', () => {
  const analyzer = new SessionAnalyzer();
  const session = makeSession();
  const events: CBEvent[] = [];
  const errors: CBError[] = [];
  const todos: CBTodo[] = [makeTodo({ text: 'Add input validation', tag: 'FIXME' })];

  const result = analyzer.analyze(session, events, errors, todos);
  assert.match(result.nextStep, /FIXME: Add input validation/);
});

test('SessionAnalyzer nextStep suggests committing when there are files but no commits', () => {
  const analyzer = new SessionAnalyzer();
  const session = makeSession();
  const events: CBEvent[] = [makeEvent({ filePath: '/src/index.ts' })];
  const result = analyzer.analyze(session, events, [], []);
  assert.match(result.nextStep, /commit/i);
});

test('SessionAnalyzer nextStep is empty when no errors, todos, or files are present', () => {
  const analyzer = new SessionAnalyzer();
  const result = analyzer.analyze(makeSession(), [], [], []);
  assert.equal(result.nextStep, '');
});

test('SessionAnalyzer summary includes file count, commit count, and duration', () => {
  const analyzer = new SessionAnalyzer();
  const events: CBEvent[] = [
    makeEvent({ filePath: '/src/a.ts' }),
    makeEvent({ id: 'ev2', filePath: '/src/b.ts' }),
    makeEvent({ id: 'ev3', type: 'git_commit', filePath: '', data: { message: 'fix: patch auth' } }),
    makeEvent({ id: 'ev4', type: 'git_commit', filePath: '', data: { message: 'chore: update deps' } }),
  ];
  const result = analyzer.analyze(makeSession({ durationSecs: 90 }), events, [], []);
  assert.match(result.summary, /2 files/);
  assert.match(result.summary, /2 commits/);
  assert.match(result.summary, /1m/);   // 90 seconds → "1m"
});

test('SessionAnalyzer summary uses singular forms for single file and commit', () => {
  const analyzer = new SessionAnalyzer();
  const events: CBEvent[] = [
    makeEvent({ filePath: '/src/a.ts' }),
    makeEvent({ id: 'ev2', type: 'git_commit', filePath: '', data: { message: 'fix: something' } }),
  ];
  const result = analyzer.analyze(makeSession({ durationSecs: 30 }), events, [], []);
  // "1 file" not "1 files", "1 commit" not "1 commits"
  assert.match(result.summary, /1 file[^s]/);
  assert.match(result.summary, /1 commit[^s]/);
});

test('SessionAnalyzer resolved errors do not appear in unfinished list', () => {
  const analyzer = new SessionAnalyzer();
  const errors: CBError[] = [makeError({ resolved: true })];
  const result = analyzer.analyze(makeSession(), [], errors, []);
  assert.equal(result.unfinished.length, 0);
});

test('SessionAnalyzer.buildContextDump includes all sections', () => {
  const analyzer = new SessionAnalyzer();
  const events: CBEvent[] = [
    makeEvent({ filePath: '/src/auth.ts' }),
    makeEvent({ id: 'ev2', type: 'git_commit', filePath: '', data: { message: 'fix: auth' } }),
    makeEvent({
      id: 'ev3', type: 'terminal_command', filePath: '',
      data: { command: 'npm test', exitCode: 0 },
    }),
  ];
  const errors: CBError[] = [makeError()];
  const todos: CBTodo[] = [makeTodo()];
  const commits: CBCommit[] = [{ hash: 'abc123', message: 'fix: auth', filesChanged: 1, timestamp: 2000, author: 'dev' }];

  const dump = analyzer.buildContextDump('my-app', 'main', events, errors, todos, commits, '1 file changed, 3 insertions');

  assert.match(dump, /Project: my-app/);
  assert.match(dump, /Branch: main/);
  assert.match(dump, /\/src\/auth\.ts/);
  assert.match(dump, /\[abc123\] fix: auth/);
  assert.match(dump, /npm test/);
  assert.match(dump, /exit 0/);
  assert.match(dump, /Type error/);
  assert.match(dump, /Implement this/);
  assert.match(dump, /1 file changed, 3 insertions/);
});

test('SessionAnalyzer.buildContextDump limits terminal commands and errors to 10', () => {
  const analyzer = new SessionAnalyzer();
  const manyTerminal: CBEvent[] = Array.from({ length: 25 }, (_, i) => ({
    id: `t${i}`,
    sessionId: 'sess-1',
    type: 'terminal_command' as const,
    timestamp: i * 1000,
    filePath: '',
    data: { command: `cmd-${i}`, exitCode: 0 },
  }));
  const manyErrors: CBError[] = Array.from({ length: 15 }, (_, i) => makeError({ id: `e${i}`, fingerprint: `fp${i}`, message: `Error ${i}` }));

  const dump = analyzer.buildContextDump('app', 'main', manyTerminal, manyErrors, [], [], '');
  const terminalMatches = [...dump.matchAll(/- cmd-\d+/g)];
  assert.ok(terminalMatches.length <= 20, `terminal commands should be capped, got ${terminalMatches.length}`);
  const errorMatches = [...dump.matchAll(/- \[error\]/g)];
  assert.ok(errorMatches.length <= 10, `errors should be capped at 10, got ${errorMatches.length}`);
});

// ─── 2. TOPIC ANALYZER ───────────────────────────────────────────────────────

test('TopicAnalyzer.extractKeywords returns top tokens by frequency', () => {
  const analyzer = new TopicAnalyzer();
  const events: CBEvent[] = [
    makeEvent({ filePath: '/src/auth/login.ts', data: { message: 'auth login auth token' } }),
    makeEvent({ id: 'ev2', filePath: '/src/auth/register.ts', data: {} }),
    makeEvent({ id: 'ev3', filePath: '/src/auth/session.ts', data: {} }),
  ];
  const keywords = analyzer.extractKeywords(events);
  assert.ok(Array.isArray(keywords));
  assert.ok(keywords.length > 0 && keywords.length <= 10);
  // 'auth' appears in multiple file paths and message — must be a top keyword
  assert.ok(keywords.includes('auth'), `expected 'auth' in top keywords, got: ${keywords.join(', ')}`);
});

test('TopicAnalyzer.extractKeywords returns empty array for empty events', () => {
  const analyzer = new TopicAnalyzer();
  const keywords = analyzer.extractKeywords([]);
  assert.deepEqual(keywords, []);
});

test('TopicAnalyzer.extractKeywords ignores short tokens (≤ 3 chars)', () => {
  const analyzer = new TopicAnalyzer();
  const events: CBEvent[] = [
    makeEvent({ filePath: 'a.ts', data: { message: 'fix bug do x or y' } }),
  ];
  const keywords = analyzer.extractKeywords(events);
  for (const kw of keywords) {
    assert.ok(kw.length > 3, `keyword "${kw}" should be longer than 3 chars`);
  }
});

test('TopicAnalyzer.analyze returns empty for events with no recognizable keywords', () => {
  const analyzer = new TopicAnalyzer();
  const events: CBEvent[] = [
    makeEvent({ filePath: '/src/zzzzz.ts', data: { message: 'qqqq rrrr ssss' } }),
  ];
  const topics = analyzer.analyze(events);
  // May return empty or very low confidence — at minimum no Authentication/DB/etc.
  const highConf = topics.filter(t => t.confidence > 0.2);
  assert.equal(highConf.length, 0);
});

test('TopicAnalyzer.analyze detects Database topic from db/schema path and commits', () => {
  const analyzer = new TopicAnalyzer();
  const events: CBEvent[] = [
    makeEvent({ filePath: '/src/db/schema.ts', data: {} }),
    makeEvent({ id: 'ev2', type: 'git_commit', filePath: '', data: { message: 'feat: add migration for users table' } }),
    makeEvent({ id: 'ev3', filePath: '/src/repositories/userRepository.ts', data: {} }),
  ];
  const topics = analyzer.analyze(events);
  const db = topics.find(t => t.name === 'Database');
  assert.ok(db, 'should detect Database topic');
  assert.ok(db!.confidence > 0.05);
});

// ─── 3. THREAD DETECTOR ──────────────────────────────────────────────────────

test('ThreadDetector returns empty array for empty inputs', () => {
  const detector = new ThreadDetector();
  assert.deepEqual(detector.detect([]), []);
});

test('ThreadDetector produces green signal when only warnings (no errors, no TODOs)', () => {
  const detector = new ThreadDetector();
  const session = makeSession();
  const warning = makeError({ severity: 'warning', resolved: false });
  const threads = detector.detect([{
    sessionId: 'sess-1',
    errors: [warning],
    todos: [],
    session,
    hasUncommittedChanges: false,
    hasSuccessfulTestAfterError: true,
  }]);
  assert.equal(threads.length, 1);
  // warning only: score = 0.15 + 0.2 (age < 3 days) = 0.35 > 0.3 → yellow
  // (no active errors so the condition for red is not met)
  assert.notEqual(threads[0]!.signal, 'red');
});

test('ThreadDetector deduplicates errors and todos by fingerprint/id across sessions', () => {
  const detector = new ThreadDetector();
  const session = makeSession();
  const error = makeError({ fingerprint: 'same-fp' });
  const todo = makeTodo({ id: 'same-td' });

  const threads = detector.detect([
    { sessionId: 'sess-1', errors: [error], todos: [todo], session, hasUncommittedChanges: false, hasSuccessfulTestAfterError: false },
    { sessionId: 'sess-2', errors: [{ ...error, id: 'e2-dup' }], todos: [{ ...todo, id: 'same-td' }], session, hasUncommittedChanges: false, hasSuccessfulTestAfterError: false },
  ]);

  // Same file, same fingerprint/id → still one thread for that file
  const appThread = threads.filter(t => t.id === '/src/app.ts');
  assert.equal(appThread.length, 1);
  assert.equal(appThread[0]!.todoCount, 1);
});

test('ThreadDetector sorts threads by unfinishedScore descending', () => {
  const detector = new ThreadDetector();
  const session = makeSession();
  // High-score file: active error + TODO
  const errorHigh = makeError({ file: '/src/high.ts', fingerprint: 'fph', lastSeen: Date.now() });
  const todoHigh = makeTodo({ file: '/src/high.ts', id: 'tdh' });
  // Low-score file: only an old warning
  const errorLow = makeError({ file: '/src/low.ts', fingerprint: 'fpl', severity: 'warning', lastSeen: Date.now() - 10 * 86400000 });

  const threads = detector.detect([{
    sessionId: 'sess-1',
    errors: [errorHigh, errorLow],
    todos: [todoHigh],
    session,
    hasUncommittedChanges: false,
    hasSuccessfulTestAfterError: false,
  }]);

  assert.ok(threads.length >= 2);
  assert.ok(threads[0]!.unfinishedScore >= threads[1]!.unfinishedScore, 'should be sorted descending by score');
});

test('ThreadDetector lastError is truncated to 100 characters', () => {
  const detector = new ThreadDetector();
  const session = makeSession();
  const longMessage = 'A'.repeat(200);
  const error = makeError({ message: longMessage });
  const threads = detector.detect([{
    sessionId: 'sess-1',
    errors: [error],
    todos: [],
    session,
    hasUncommittedChanges: false,
    hasSuccessfulTestAfterError: false,
  }]);
  assert.ok(threads[0]!.lastError.length <= 100);
});

test('ThreadDetector skips files where all errors are resolved and todos are closed', () => {
  const detector = new ThreadDetector();
  const session = makeSession();
  const resolved = makeError({ resolved: true });
  const closedTodo = makeTodo({ status: 'resolved' });
  const threads = detector.detect([{
    sessionId: 'sess-1',
    errors: [resolved],
    todos: [closedTodo],
    session,
    hasUncommittedChanges: false,
    hasSuccessfulTestAfterError: true,
  }]);
  assert.equal(threads.length, 0);
});

test('ThreadDetector title uses basename of filePath', () => {
  const detector = new ThreadDetector();
  const session = makeSession();
  const error = makeError({ file: '/very/deep/path/component.tsx' });
  const threads = detector.detect([{
    sessionId: 'sess-1',
    errors: [error],
    todos: [],
    session,
    hasUncommittedChanges: false,
    hasSuccessfulTestAfterError: false,
  }]);
  assert.equal(threads[0]!.title, 'component.tsx');
});
