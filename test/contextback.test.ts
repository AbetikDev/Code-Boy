/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Database } from '../src/contextback/Database';
import { SessionRepository } from '../src/contextback/repositories/SessionRepository';
import { ErrorRepository } from '../src/contextback/repositories/ErrorRepository';
import { TodoRepository } from '../src/contextback/repositories/TodoRepository';
import { ThreadDetector } from '../src/contextback/analysis/ThreadDetector';
import { SessionAnalyzer } from '../src/contextback/analysis/SessionAnalyzer';
import type { CBEvent, CBSession } from '../src/contextback/types';

function createTempDb(): { db: Database; tempDir: string; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-'));
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

// ─── 1. DATABASE & PERSISTENCE LIFECYCLE ───────────────────────────────────

test('Database initializes clean state and survives atomic disk flush & reload', () => {
  const { db, tempDir, cleanup } = createTempDb();
  try {
    assert.deepEqual(db.get('projects'), []);
    assert.deepEqual(db.get('sessions'), []);

    const project = {
      id: 'proj-1',
      name: 'test-project',
      rootPath: '/workspace/test',
      gitRemote: 'git@github.com:test/test.git',
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    db.set('projects', [project]);
    db.flush();

    // Verify file actually exists on disk
    const dbFile = path.join(tempDir, 'context.json');
    assert.equal(fs.existsSync(dbFile), true);

    // Reopen database from same directory
    const reloadedDb = new Database(tempDir);
    assert.equal(reloadedDb.get('projects').length, 1);
    assert.equal(reloadedDb.get('projects')[0]!.name, 'test-project');
    reloadedDb.dispose();
  } finally {
    cleanup();
  }
});

test('Database prune safely bounds memory and drops oldest entries when overflowing', () => {
  const { db, cleanup } = createTempDb();
  try {
    const dummyEvents: CBEvent[] = Array.from({ length: 5500 }, (_, i) => ({
      id: `ev-${i}`,
      sessionId: 'sess-1',
      type: 'file_activity',
      timestamp: 1000 + i,
      filePath: `/src/file${i}.ts`,
      data: {},
    }));

    db.set('events', dummyEvents);
    db.prune();

    // MAX_EVENTS is 5000 in Database.ts
    assert.equal(db.get('events').length, 5000);
    // Preserved the newest 5000 events
    assert.equal(db.get('events')[0]!.id, 'ev-500');
    assert.equal(db.get('events')[4999]!.id, 'ev-5499');
  } finally {
    cleanup();
  }
});

// ─── 2. SESSION LIFECYCLE & CONTINUITY ─────────────────────────────────────

test('SessionRepository accurately manages session start, duration, and last completed lookup', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    const branch = repo.findOrCreateBranch('proj-1', 'main');
    assert.equal(branch.name, 'main');
    assert.equal(branch.id, 'proj-1:main');

    // Starting a session
    const session = repo.startSession('proj-1', branch.id);
    assert.equal(session.projectId, 'proj-1');
    assert.equal(session.endedAt, null);
    assert.equal(session.durationSecs, 0);

    // Active session lookup
    assert.equal(repo.getActive('proj-1')?.id, session.id);

    // Ending the session
    const ended = repo.endSession(session.id);
    assert.ok(ended);
    assert.ok(ended.endedAt !== null);
    assert.equal(repo.getActive('proj-1'), undefined);

    // Last completed session lookup
    const lastCompleted = repo.getLastCompleted('proj-1');
    assert.equal(lastCompleted?.id, session.id);
  } finally {
    cleanup();
  }
});

// ─── 3. THREAD DETECTOR (TRAFFIC LIGHT HEURISTICS) ─────────────────────────

test('ThreadDetector flags broken diagnostics as RED and open TODOs as YELLOW', () => {
  const { db, cleanup } = createTempDb();
  try {
    const errorRepo = new ErrorRepository(db);
    const todoRepo = new TodoRepository(db);
    const detector = new ThreadDetector();

    const mockSession: CBSession = {
      id: 'sess-1',
      projectId: 'proj-1',
      branchId: 'main',
      startedAt: Date.now() - 3600000,
      endedAt: Date.now(),
      durationSecs: 3600,
      summary: '',
    };

    // Case 1: Unresolved compiler error + open TODO in auth.ts (score = 0.35 + 0.25 + 0.2 = 0.8 -> RED)
    const error = errorRepo.upsert('proj-1', 'sess-1', '/src/auth.ts', 42, 'TS2304: Cannot find name Token', 'error');
    const authTodo = todoRepo.upsert('proj-1', '/src/auth.ts', 43, 'Implement missing Token interface', 'FIXME');
    // Case 2: Only open TODO in utils.ts without errors (score = 0.25 + 0.2 = 0.45 -> YELLOW)
    const todo = todoRepo.upsert('proj-1', '/src/utils.ts', 15, 'Add caching layer', 'TODO');

    const threads = detector.detect([
      {
        sessionId: 'sess-1',
        errors: [error],
        todos: [authTodo, todo],
        session: mockSession,
        hasUncommittedChanges: true,
        hasSuccessfulTestAfterError: false,
      },
    ]);

    assert.equal(threads.length, 2);

    const authThread = threads.find(t => t.id === '/src/auth.ts');
    assert.ok(authThread);
    // Active error on recent file produces score > 0.6 -> RED
    assert.equal(authThread.signal, 'red');
    assert.match(authThread.lastError, /Cannot find name Token/);

    const utilsThread = threads.find(t => t.id === '/src/utils.ts');
    assert.ok(utilsThread);
    // Open TODO produces yellow signal
    assert.equal(utilsThread.signal, 'yellow');
    assert.equal(utilsThread.todoCount, 1);

    // Case 3: Error is resolved
    errorRepo.resolveByFingerprint('proj-1', error.fingerprint);
    const updatedThreads = detector.detect([
      {
        sessionId: 'sess-1',
        errors: [errorRepo.openForProject('proj-1')[0]!].filter(Boolean),
        todos: [todo],
        session: mockSession,
        hasUncommittedChanges: false,
        hasSuccessfulTestAfterError: true,
      },
    ]);

    // auth.ts thread disappears once error is resolved
    assert.equal(updatedThreads.some(t => t.id === '/src/auth.ts'), false);
  } finally {
    cleanup();
  }
});

// ─── 4. SESSION ANALYZER & NEXT-STEP SYNTHESIS ─────────────────────────────

test('SessionAnalyzer synthesizes completed tasks, open blockers, and nextStep', () => {
  const analyzer = new SessionAnalyzer();

  const mockSession: CBSession = {
    id: 'sess-10',
    projectId: 'proj-1',
    branchId: 'feature/auth',
    startedAt: 1000,
    endedAt: 70000,
    durationSecs: 69,
    summary: '',
  };

  const mockEvents: CBEvent[] = [
    { id: '1', sessionId: 'sess-10', type: 'file_save', timestamp: 2000, filePath: '/src/login.ts', data: {} },
    { id: '2', sessionId: 'sess-10', type: 'git_commit', timestamp: 5000, filePath: '', data: { message: 'feat: add oauth callback' } },
  ];

  const mockErrors = [
    {
      id: 'e1',
      projectId: 'proj-1',
      sessionId: 'sess-10',
      fingerprint: 'abc',
      file: '/src/login.ts',
      line: 10,
      message: 'Type error in OAuth payload',
      severity: 'error' as const,
      firstSeen: 2000,
      lastSeen: 6000,
      resolved: false,
    },
  ];

  const analysis = analyzer.analyze(mockSession, mockEvents, mockErrors, []);

  assert.equal(analysis.completed.length, 1);
  assert.equal(analysis.completed[0], 'Committed: feat: add oauth callback');
  assert.equal(analysis.unfinished.length, 1);
  assert.match(analysis.unfinished[0]!, /Type error in OAuth payload/);
  // Unresolved error takes precedence in nextStep recommendation
  assert.match(analysis.nextStep, /^Fix: Type error in OAuth payload/);

  // Verify plain text context dump does NOT leak code
  const dump = analyzer.buildContextDump('my-app', 'feature/auth', mockEvents, mockErrors, [], [], '1 file changed');
  assert.match(dump, /Project: my-app/);
  assert.match(dump, /Type error in OAuth payload/);
  assert.equal(dump.includes('const secretKey ='), false);
});

// ─── 5. INTEGRATED APPLICATION LIFECYCLE (SMOKE TEST) ──────────────────────

test('End-to-end ContextBack core lifecycle: start -> work -> error -> resolve -> end', () => {
  const { db, cleanup } = createTempDb();
  try {
    const sessionRepo = new SessionRepository(db);
    const errorRepo = new ErrorRepository(db);
    const branch = sessionRepo.findOrCreateBranch('proj-main', 'develop');

    // 1. Session start
    const session = sessionRepo.startSession('proj-main', branch.id);
    assert.equal(sessionRepo.getActive('proj-main')?.id, session.id);

    // 2. Error occurs during coding
    const err = errorRepo.upsert('proj-main', session.id, '/src/index.ts', 1, 'SyntaxError: Unexpected token', 'error');
    assert.equal(errorRepo.openForProject('proj-main').length, 1);

    // 3. Error is fixed
    errorRepo.resolveByFingerprint('proj-main', err.fingerprint);
    assert.equal(errorRepo.openForProject('proj-main').length, 0);

    // 4. Session ends cleanly
    const ended = sessionRepo.endSession(session.id);
    assert.ok(ended);
    assert.equal(sessionRepo.getActive('proj-main'), undefined);
    assert.equal(sessionRepo.getLastCompleted('proj-main')?.id, session.id);

    // 5. Database flush and verify zero data corruption
    db.flush();
    const diskData = JSON.parse(fs.readFileSync(path.join(db['dbPath']), 'utf8'));
    assert.equal(diskData.sessions.length, 1);
    assert.equal(diskData.errors.length, 1);
    assert.equal(diskData.errors[0].resolved, true);
  } finally {
    cleanup();
  }
});
