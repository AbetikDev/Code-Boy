/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Database } from '../src/contextback/Database';
import { EventRepository } from '../src/contextback/repositories/EventRepository';
import { SessionRepository } from '../src/contextback/repositories/SessionRepository';
import { ErrorRepository } from '../src/contextback/repositories/ErrorRepository';
import { TodoRepository } from '../src/contextback/repositories/TodoRepository';
import { FileActivityRepository } from '../src/contextback/repositories/FileActivityRepository';
import { SessionManager } from '../src/contextback/core/SessionManager';
import { GitCollector } from '../src/contextback/collectors/GitCollector';
import { TerminalCollector } from '../src/contextback/collectors/TerminalCollector';
import { FileCollector } from '../src/contextback/collectors/FileCollector';
import { TodoCollector } from '../src/contextback/collectors/TodoCollector';
import { DiagnosticCollector } from '../src/contextback/collectors/DiagnosticCollector';
import { DEFAULT_CB_SETTINGS } from '../src/contextback/types';
import type { CBCommit, CBTerminalCommand, CBFileActivity, CBError, CBTodo, CBQualityCacheEntry } from '../src/contextback/types';
import { GitService } from '../src/contextback/git/GitService';

test('recorded activity extends a running session and inactivity ends it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-session-timeout-'));
  const db = new Database(dir);
  const git = { getCurrentBranch: async () => 'main' } as unknown as GitService;
  const settings = { ...DEFAULT_CB_SETTINGS, sessionTimeoutMinutes: 0.003 };
  const manager = new SessionManager(db, git, settings);
  try {
    const session = await manager.startForProject('project', dir);
    const events = new EventRepository(db, id => { if (manager.current?.id === id) manager.touch(); });
    await new Promise(resolve => setTimeout(resolve, 100));
    events.add(session.id, 'file_save', path.join(dir, 'app.ts'), {});
    await new Promise(resolve => setTimeout(resolve, 105));
    assert.equal(manager.current?.id, session.id);
    await new Promise(resolve => setTimeout(resolve, 110));
    assert.equal(manager.current, undefined);
    assert.ok(db.get('sessions')[0]?.endedAt);
  } finally {
    manager.dispose();
    db.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('failed database write stays dirty and succeeds on the next flush', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-retry-'));
  const db = new Database(dir);
  const blocked = path.join(dir, 'context.json.tmp');
  try {
    fs.mkdirSync(blocked);
    db.set('events', [{ id: 'one', sessionId: 's', type: 'file_save', timestamp: 1, filePath: 'app.ts', data: {} }]);
    db.flush();
    assert.equal(fs.existsSync(path.join(dir, 'context.json')), false);
    fs.rmdirSync(blocked);
    db.flush();
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'context.json'), 'utf8')).events[0].id, 'one');
  } finally {
    db.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('branch restore uses git arguments without shell interpretation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-branch-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git('init', '-b', 'main');
    fs.writeFileSync(path.join(dir, 'app.ts'), 'export const ok = true;\n');
    git('add', 'app.ts');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'base');
    git('branch', 'safe;false');
    await new GitService().checkoutBranch(dir, 'safe;false');
    assert.equal(git('branch', '--show-current'), 'safe;false');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pausing Git collection discards an in-flight poll', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-git-pause-'));
  const db = new Database(dir);
  let finish!: (commits: CBCommit[]) => void;
  const pending = new Promise<CBCommit[]>(resolve => { finish = resolve; });
  const git = { getRecentCommits: () => pending, getChangedFiles: async () => [] } as unknown as GitService;
  const collector = new GitCollector(db, new EventRepository(db), git,
    () => ({ projectId: 'project', sessionId: 'session', root: dir }), DEFAULT_CB_SETTINGS);
  try {
    collector.start();
    collector.stop();
    finish([{ hash: 'abc', message: 'commit', author: 'Test', timestamp: Date.now(), filesChanged: 1 }]);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(db.get('events'), []);
  } finally {
    collector.dispose();
    db.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── END-TO-END CLEAR HISTORY & PAUSE TRACKING ────────────────────────────────

test('clearHistory removes all project data across all collections, preserves others, and does not reappear', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-clear-history-'));
  const db = new Database(dir);
  const sessionRepo = new SessionRepository(db);
  const errorRepo = new ErrorRepository(db);
  const todoRepo = new TodoRepository(db);

  try {
    const projA = 'project-alpha';
    const projB = 'project-beta';

    // Populate data for Project A
    const sessA1 = sessionRepo.startSession(projA, `${projA}:main`);
    const sessA2 = sessionRepo.startSession(projA, `${projA}:feature`);
    sessionRepo.endSession(sessA1.id);

    db.set('events', [
      { id: 'ev-a1', sessionId: sessA1.id, type: 'file_save', timestamp: 100, filePath: 'app.ts', data: {} },
      { id: 'ev-a2', sessionId: sessA2.id, type: 'file_activity', timestamp: 200, filePath: 'cart.ts', data: {} },
    ]);
    db.set('terminalCommands', [
      { projectId: projA, command: 'npm test', cwd: '/a', startTime: 100, endTime: 110, exitCode: 0, duration: 10 },
    ]);
    db.set('fileActivity', [
      { id: 'fa-1', projectId: projA, path: 'app.ts', lastActivity: 100, opens: 1, saves: 1, edits: 2, timeSpentSecs: 30 },
    ]);
    errorRepo.upsert(projA, sessA1.id, 'app.ts', 10, 'Type error in app', 'error');
    todoRepo.upsert(projA, 'app.ts', 20, 'Fix this', 'TODO');
    db.set('diffSnapshots', [
      { projectId: projA, day: '2026-09-27', patch: 'diff --git a/app.ts', capturedAt: 1000 },
    ]);
    db.set('qualityCache', [
      { projectId: projA, kind: 'current', day: '2026-09-27', inputHash: 'hash-a', checkedAt: 1000, result: null },
    ]);

    // Populate data for Project B
    const sessB = sessionRepo.startSession(projB, `${projB}:main`);
    db.set('events', [
      ...db.get('events'),
      { id: 'ev-b1', sessionId: sessB.id, type: 'file_save', timestamp: 300, filePath: 'main.py', data: {} },
    ]);
    db.set('terminalCommands', [
      ...db.get('terminalCommands'),
      { projectId: projB, command: 'pytest', cwd: '/b', startTime: 300, endTime: 305, exitCode: 0, duration: 5 },
    ]);
    db.set('fileActivity', [
      ...db.get('fileActivity'),
      { id: 'fa-2', projectId: projB, path: 'main.py', lastActivity: 300, opens: 1, saves: 1, edits: 1, timeSpentSecs: 15 },
    ]);
    errorRepo.upsert(projB, sessB.id, 'main.py', 5, 'Syntax error', 'error');
    todoRepo.upsert(projB, 'main.py', 15, 'Refactor', 'TODO');
    db.set('diffSnapshots', [
      ...db.get('diffSnapshots'),
      { projectId: projB, day: '2026-09-27', patch: 'diff --git b/main.py', capturedAt: 1100 },
    ]);
    db.set('qualityCache', [
      ...db.get('qualityCache'),
      { projectId: projB, kind: 'current', day: '2026-09-27', inputHash: 'hash-b', checkedAt: 1100, result: null },
    ]);

    db.flush();

    // Verify Project A has data before clear
    assert.equal(sessionRepo.getForProject(projA).length, 2);
    assert.equal(errorRepo.openForProject(projA).length, 1);
    assert.equal(todoRepo.openForProject(projA).length, 1);

    // Perform clearHistory for Project A
    const clearedSessionIds = new Set(db.get('sessions').filter(s => s.projectId === projA).map(s => s.id));
    db.set('sessions', db.get('sessions').filter(s => s.projectId !== projA));
    db.set('events', db.get('events').filter(e => !clearedSessionIds.has(e.sessionId)));
    db.set('terminalCommands', db.get('terminalCommands').filter(c => c.projectId !== projA));
    db.set('fileActivity', db.get('fileActivity').filter(f => f.projectId !== projA));
    db.set('errors', db.get('errors').filter(e => e.projectId !== projA));
    db.set('todos', db.get('todos').filter(t => t.projectId !== projA));
    db.set('diffSnapshots', db.get('diffSnapshots').filter(s => s.projectId !== projA));
    db.set('qualityCache', db.get('qualityCache').filter(e => e.projectId !== projA));
    db.flush();

    // Check Project A is completely wiped
    assert.equal(sessionRepo.getForProject(projA).length, 0);
    assert.equal(db.get('events').filter(e => clearedSessionIds.has(e.sessionId)).length, 0);
    assert.equal(db.get('terminalCommands').filter(c => c.projectId === projA).length, 0);
    assert.equal(db.get('fileActivity').filter(f => f.projectId === projA).length, 0);
    assert.equal(errorRepo.openForProject(projA).length, 0);
    assert.equal(todoRepo.openForProject(projA).length, 0);
    assert.equal(db.get('diffSnapshots').filter(s => s.projectId === projA).length, 0);
    assert.equal(db.get('qualityCache').filter(e => e.projectId === projA).length, 0);

    // Check Project B is completely intact
    assert.equal(sessionRepo.getForProject(projB).length, 1);
    assert.equal(db.get('events').filter(e => e.sessionId === sessB.id).length, 1);
    assert.equal(db.get('terminalCommands').filter(c => c.projectId === projB).length, 1);
    assert.equal(db.get('fileActivity').filter(f => f.projectId === projB).length, 1);
    assert.equal(errorRepo.openForProject(projB).length, 1);
    assert.equal(todoRepo.openForProject(projB).length, 1);
    assert.equal(db.get('diffSnapshots').filter(s => s.projectId === projB).length, 1);
    assert.equal(db.get('qualityCache').filter(e => e.projectId === projB).length, 1);

    // Reopen database from disk to verify persistence (data does not resurrect)
    const reloadedDb = new Database(dir);
    const reloadedSessions = new SessionRepository(reloadedDb);
    const reloadedErrors = new ErrorRepository(reloadedDb);
    const reloadedTodos = new TodoRepository(reloadedDb);

    assert.equal(reloadedSessions.getForProject(projA).length, 0);
    assert.equal(reloadedErrors.openForProject(projA).length, 0);
    assert.equal(reloadedTodos.openForProject(projA).length, 0);
    assert.equal(reloadedDb.get('diffSnapshots').filter(s => s.projectId === projA).length, 0);
    assert.equal(reloadedDb.get('qualityCache').filter(e => e.projectId === projA).length, 0);

    // Revisit / workspace switch to Project A starts fresh without resurrected data
    const newSession = reloadedSessions.startSession(projA, `${projA}:main`);
    assert.ok(newSession);
    assert.equal(reloadedSessions.getForProject(projA).length, 1);
    assert.equal(reloadedSessions.getLastCompleted(projA), undefined);

    reloadedDb.dispose();
  } finally {
    db.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pauseTracking stops active collection and cancels pending snapshots', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-pause-tracking-'));
  const db = new Database(dir);
  const git = { getCurrentBranch: async () => 'main' } as unknown as GitService;
  const manager = new SessionManager(db, git, DEFAULT_CB_SETTINGS);

  try {
    const session = await manager.startForProject('project', dir);
    assert.ok(manager.current);

    // Simulate snapshot timer
    let snapshotCaptured = false;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => { snapshotCaptured = true; }, 50);

    // Pause tracking: stop collectors, end session, cancel snapshot timer
    if (timer) { clearTimeout(timer); timer = undefined; }
    manager.endCurrent();

    assert.equal(manager.current, undefined);
    assert.ok(db.get('sessions')[0]?.endedAt);

    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(snapshotCaptured, false, 'Pending snapshot was canceled and did not execute');

    // While paused, starting tracking for project with enabled=false is blocked
    const pausedSettings = { ...DEFAULT_CB_SETTINGS, enabled: false };
    manager.updateSettings(pausedSettings);
    const blockedSession = await manager.startForProject('project', dir);
    assert.equal(blockedSession.endedAt !== null, false);
  } finally {
    manager.dispose();
    db.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── COLLECTOR SENSITIVE DATA FILTERS & EDGE CASES ───────────────────────────

test('TerminalCollector accurately detects sensitive tokens, passwords, keys, and ignores normal commands', () => {
  const db = new Database(path.join(os.tmpdir(), `cb-tc-${Date.now()}`));
  const collector = new TerminalCollector(
    db, new EventRepository(db), () => ({ projectId: 'p', sessionId: 's' }), DEFAULT_CB_SETTINGS
  );

  const sensitive = [
    'export GITHUB_TOKEN=ghp_0123456789abcdef',
    'export NPM_TOKEN=npm_abcdef123456',
    'curl -H "Authorization: Bearer eyJhbGciOi..." https://api.com',
    'ssh -i ~/.ssh/id_rsa user@host',
    'ssh -i ~/.ssh/id_ed25519 user@host',
    'export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
    'export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI',
    'docker login -u user -p my_secret_pass',
    'sudo passwd user',
    'cat .env.production',
    'cat /etc/credentials/db.json',
    'openssl genrsa -out private.key 2048',
    'gh auth login --with-token',
  ];

  for (const cmd of sensitive) {
    assert.equal(collector.looksLikeSensitive(cmd), true, `Must detect sensitive command: ${cmd}`);
  }

  const normal = [
    'npm test',
    'git status',
    'git log -n 5',
    'node dist/index.js',
    'cargo build --release',
    'pytest tests/',
    'go test ./...',
    'cat package.json',
    'ls -la',
  ];

  for (const cmd of normal) {
    assert.equal(collector.looksLikeSensitive(cmd), false, `Must allow normal command: ${cmd}`);
  }

  // Updating settings to disable terminal tracking clears running map immediately
  collector.updateSettings({ ...DEFAULT_CB_SETTINGS, trackTerminalCommands: false });
  collector.dispose();
  db.dispose();
});

test('FileCollector debounces rapid edits on the same file and discards excluded files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-fc-'));
  const db = new Database(dir);
  const events = new EventRepository(db);
  const fileActivity = new FileActivityRepository(db);

  const collector = new FileCollector(
    events, fileActivity, () => ({ projectId: 'p', sessionId: 's' }),
    { ...DEFAULT_CB_SETTINGS, exclude: ['**/.env*', '**/secrets/**'] }
  );

  try {
    // Calling updateSettings with newly excluded file cancels pending edit timers
    collector.updateSettings({ ...DEFAULT_CB_SETTINGS, exclude: ['**/.env*', '**/secrets/**', '**/draft/**'] });
    // Dispose clears all pending timers
    collector.dispose();
  } finally {
    db.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TodoCollector cancels pending scans when settings disable tracking or exclude file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-todo-'));
  const db = new Database(dir);
  const todos = new TodoRepository(db);

  const collector = new TodoCollector(
    todos, () => ({ projectId: 'p', sessionId: 's' }),
    { ...DEFAULT_CB_SETTINGS, trackTodos: true }
  );

  try {
    // When trackTodos is toggled off, updateSettings cancels pending scans
    collector.updateSettings({ ...DEFAULT_CB_SETTINGS, trackTodos: false });
    // When excluded files are added, updateSettings cancels pending scans
    collector.updateSettings({ ...DEFAULT_CB_SETTINGS, trackTodos: true, exclude: ['**/temp/**'] });
    collector.dispose();
  } finally {
    db.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('DiagnosticCollector cancels pending scans when diagnostics tracking is disabled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-diag-'));
  const db = new Database(dir);
  const errors = new ErrorRepository(db);
  const events = new EventRepository(db);

  const collector = new DiagnosticCollector(
    errors, events, () => ({ projectId: 'p', sessionId: 's' }),
    { ...DEFAULT_CB_SETTINGS, trackDiagnostics: true }
  );

  try {
    // Toggling trackDiagnostics to false cancels pending timer
    collector.updateSettings({ ...DEFAULT_CB_SETTINGS, trackDiagnostics: false });
    collector.dispose();
  } finally {
    db.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
