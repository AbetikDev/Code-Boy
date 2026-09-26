/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Database } from '../src/contextback/Database';
import { EventBus } from '../src/contextback/core/EventBus';
import { ProjectRepository } from '../src/contextback/repositories/ProjectRepository';
import { EventRepository } from '../src/contextback/repositories/EventRepository';
import { FileActivityRepository } from '../src/contextback/repositories/FileActivityRepository';
import { TodoRepository } from '../src/contextback/repositories/TodoRepository';
import { ErrorRepository } from '../src/contextback/repositories/ErrorRepository';
import { TopicAnalyzer } from '../src/contextback/analysis/TopicAnalyzer';
import { nonce, cspMeta, dashboardHtml, welcomeHtml } from '../src/contextback/ui/templates';
import type { CBEvent, CBDashboardData, CBWelcomeData } from '../src/contextback/types';

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-ext-test-'));
  const db = new Database(tempDir);
  return {
    db,
    tempDir,
    cleanup: () => {
      db.dispose();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

// ─── 1. EVENT BUS TESTS ────────────────────────────────────────────────────

test('EventBus delivers events, supports multi-listeners, handles unsubscription & error isolation', () => {
  const bus = new EventBus<{ ping: { value: number }; other: string }>();
  let received1 = 0;
  let received2 = 0;

  // Multi-listener
  const sub1 = bus.on('ping', p => { received1 += p.value; });
  const sub2 = bus.on('ping', p => {
    received2 += p.value;
    throw new Error('Listener error should not crash bus');
  });

  bus.emit('ping', { value: 10 });
  assert.equal(received1, 10);
  assert.equal(received2, 10);

  // Unsubscribe sub1
  sub1.dispose();
  bus.emit('ping', { value: 5 });
  assert.equal(received1, 10); // remains 10
  assert.equal(received2, 15);

  bus.dispose();
  bus.emit('ping', { value: 20 });
  assert.equal(received2, 15); // completely stopped
});

// ─── 2. PROJECT REPOSITORY TESTS ───────────────────────────────────────────

test('ProjectRepository makes deterministic IDs, upserts projects, and fetches all', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new ProjectRepository(db);

    const id1 = ProjectRepository.makeId('/path/to/project', 'https://github.com/org/repo');
    const id2 = ProjectRepository.makeId('/path/to/project', 'https://github.com/org/repo');
    assert.equal(id1, id2);
    assert.equal(typeof id1, 'string');
    assert.equal(id1.length, 16);

    const proj = repo.findOrCreate('/path/to/project', 'https://github.com/org/repo', 'Initial Name');
    assert.equal(proj.id, id1);
    assert.equal(proj.name, 'Initial Name');

    // Updating name
    const updated = repo.findOrCreate('/path/to/project', 'https://github.com/org/repo', 'Updated Name');
    assert.equal(updated.name, 'Updated Name');
    assert.equal(repo.findById(id1)?.name, 'Updated Name');
    assert.equal(repo.all().length, 1);
  } finally {
    cleanup();
  }
});

// ─── 3. EVENT REPOSITORY TESTS ─────────────────────────────────────────────

test('EventRepository logs events, retrieves for session, and calculates recent unique files', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new EventRepository(db);

    repo.add('sess-1', 'file_open', '/src/index.ts', {});
    repo.add('sess-1', 'file_activity', '/src/app.ts', { changes: 5 });
    repo.add('sess-1', 'file_activity', '/src/index.ts', { changes: 12 });
    repo.add('sess-2', 'file_open', '/src/other.ts', {});

    const sess1Events = repo.forSession('sess-1');
    assert.equal(sess1Events.length, 3);

    const last2 = repo.lastN('sess-1', 2);
    assert.equal(last2.length, 2);
    assert.equal(last2[1]!.filePath, '/src/index.ts');

    // Unique files in reverse chronological order
    const recentFiles = repo.recentFilesForSession('sess-1');
    assert.deepEqual(recentFiles, ['/src/index.ts', '/src/app.ts']);
  } finally {
    cleanup();
  }
});

// ─── 4. FILE ACTIVITY REPOSITORY TESTS ─────────────────────────────────────

test('FileActivityRepository tracks opens, edits, saves, time spent, and ranks files', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new FileActivityRepository(db);

    repo.touch('proj-1', '/src/main.ts', 'open');
    repo.touch('proj-1', '/src/main.ts', 'edit');
    repo.touch('proj-1', '/src/main.ts', 'save');
    repo.addTime('proj-1', '/src/main.ts', 120);

    repo.touch('proj-1', '/src/utils.ts', 'edit');
    repo.addTime('proj-1', '/src/utils.ts', 45);

    const top = repo.topFiles('proj-1');
    assert.equal(top.length, 2);
    assert.equal(top[0]!.path, '/src/main.ts');
    assert.equal(top[0]!.opens, 1);
    assert.equal(top[0]!.edits, 1);
    assert.equal(top[0]!.saves, 1);
    assert.equal(top[0]!.timeSpentSecs, 120);

    const recent = repo.recentFiles('proj-1');
    assert.equal(recent.length, 2);
    assert.ok(recent.some(r => r.path === '/src/main.ts'));
    assert.ok(recent.some(r => r.path === '/src/utils.ts'));
  } finally {
    cleanup();
  }
});

// ─── 5. TODO REPOSITORY TESTS ──────────────────────────────────────────────

test('TodoRepository tracks TODO/FIXME locations, updates lines, and resolves markers', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new TodoRepository(db);

    const todo1 = repo.upsert('proj-1', '/src/api.ts', 24, 'Add rate limiting', 'TODO');
    assert.equal(todo1.status, 'open');
    assert.equal(todo1.tag, 'TODO');

    // Updating text at existing location
    repo.upsert('proj-1', '/src/api.ts', 24, 'Add strict rate limiting', 'TODO');
    const openTodos = repo.openForProject('proj-1');
    assert.equal(openTodos.length, 1);
    assert.equal(openTodos[0]!.text, 'Add strict rate limiting');

    // Query for file
    assert.equal(repo.forFile('proj-1', '/src/api.ts').length, 1);
    assert.equal(repo.forFile('proj-1', '/src/other.ts').length, 0);

    // Resolve by location
    repo.resolveByLocation('proj-1', '/src/api.ts', 24);
    assert.equal(repo.openForProject('proj-1').length, 0);
  } finally {
    cleanup();
  }
});

// ─── 6. TOPIC ANALYZER TESTS ───────────────────────────────────────────────

test('TopicAnalyzer classifies developer activity by commit and event keywords', () => {
  const analyzer = new TopicAnalyzer();

  const events: CBEvent[] = [
    { id: '1', sessionId: 's1', type: 'git_commit', timestamp: 1000, filePath: '', data: { message: 'feat: add jwt auth login' } },
    { id: '2', sessionId: 's1', type: 'file_save', timestamp: 2000, filePath: '/src/auth/token.ts', data: {} },
    { id: '3', sessionId: 's1', type: 'file_save', timestamp: 3000, filePath: '/src/auth/session.ts', data: {} },
  ];

  const topics = analyzer.analyze(events);
  assert.ok(topics.length > 0);
  assert.equal(topics[0]!.name, 'Authentication');
  assert.ok(topics[0]!.confidence > 0.5);
});

// ─── 7. UI TEMPLATES & SECURITY TESTS ──────────────────────────────────────

test('UI Templates generate secure CSP, nonces, and escape dangerous HTML', () => {
  const n = nonce();
  assert.equal(typeof n, 'string');
  assert.ok(n.length > 10);

  const mockWebview = {
    cspSource: 'vscode-resource:',
    asWebviewUri: (u: unknown) => u,
  } as unknown as import('vscode').Webview;

  const csp = cspMeta(mockWebview, n);
  assert.match(csp, /Content-Security-Policy/);
  assert.ok(csp.includes(`nonce-${n}`));

  // Dashboard HTML generation & XSS sanitization
  const mockData: CBDashboardData = {
    project: { id: 'p1', name: 'Safe & <script>alert(1)</script>', rootPath: '/', gitRemote: '', createdAt: 0, lastSeenAt: 0 },
    branch: { id: 'b1', projectId: 'p1', name: 'feature/xss', lastSeenAt: 0 },
    todayMinutes: 45,
    weekMinutes: 240,
    totalSessions: 6,
    recentWork: [{ topic: 'Bugfix <bold>', minutes: 30 }],
    openThreads: [{ id: 't1', title: 'Critical Thread', lastTouched: Date.now() - 60000, lastError: 'Fatal error', unfinishedScore: 0.9, signal: 'red', todoCount: 2 }],
    recentFiles: [],
    recentErrors: [{ id: 'e1', projectId: 'p1', sessionId: 's1', fingerprint: 'f1', file: '/src/main.ts', line: 1, message: 'Type error', severity: 'error', firstSeen: 0, lastSeen: 0, resolved: false }],
    openTodos: [{ id: 'td1', projectId: 'p1', file: '/src/main.ts', line: 10, text: 'Fix me', tag: 'TODO', status: 'open', firstSeen: 0, lastSeen: 0 }],
  };

  const html = dashboardHtml(mockWebview, mockData);
  assert.match(html, /ContextBack/);
  assert.match(html, /Safe &amp; &lt;script&gt;alert\(1\)&lt;\/script&gt;/); // Escaped!
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.match(html, /🔴 Critical Thread/);

  // Welcome HTML generation
  const mockWelcomeData: CBWelcomeData = {
    project: mockData.project,
    branch: mockData.branch,
    lastSession: { id: 's0', projectId: 'p1', branchId: 'b1', startedAt: 0, endedAt: 3600000, durationSecs: 3600, summary: '' },
    hoursAgo: 2,
    analysis: { topic: 'Core Dev', summary: 'Summary', completed: ['Done A'], unfinished: ['Fix B'], nextStep: 'Commit changes', confidence: 0.8, topics: [] },
    recentFiles: [],
    openErrors: [],
    openTodos: [],
    recentCommands: [],
    git: { branch: 'main', changedFiles: ['file.ts'], stagedFiles: [], commits: [], diffStat: '1 file changed' },
  };

  const welcome = welcomeHtml(mockWebview, mockWelcomeData);
  assert.match(welcome, /Core Dev/);
  assert.match(welcome, /Commit changes/);
  assert.match(welcome, /Continue/);
  assert.match(welcome, /Dismiss/);
});
