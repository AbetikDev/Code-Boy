/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Database } from '../src/contextback/Database';
import { ErrorRepository } from '../src/contextback/repositories/ErrorRepository';
import { SessionRepository } from '../src/contextback/repositories/SessionRepository';
import { FileActivityRepository } from '../src/contextback/repositories/FileActivityRepository';
import { TodoRepository } from '../src/contextback/repositories/TodoRepository';
import { ProjectRepository } from '../src/contextback/repositories/ProjectRepository';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-repo-ext-'));
  const db = new Database(tempDir);
  return {
    db,
    cleanup: () => { db.dispose(); fs.rmSync(tempDir, { recursive: true, force: true }); },
  };
}

// ─── 1. ErrorRepository ───────────────────────────────────────────────────────

test('ErrorRepository.recentForSession returns sorted errors capped at limit', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new ErrorRepository(db);
    repo.upsert('p1', 'sess-1', '/a.ts', 1, 'Error A', 'error');
    repo.upsert('p1', 'sess-1', '/b.ts', 2, 'Error B', 'warning');
    repo.upsert('p1', 'sess-1', '/c.ts', 3, 'Error C', 'error');
    // Different session — must not appear
    repo.upsert('p1', 'sess-2', '/d.ts', 4, 'Error D', 'error');

    const recent = repo.recentForSession('sess-1', 2);
    assert.equal(recent.length, 2);
    // All belong to sess-1
    assert.ok(recent.every(e => e.sessionId === 'sess-1'));
    // Sorted newest first (lastSeen descending)
    assert.ok(recent[0]!.lastSeen >= recent[1]!.lastSeen);
  } finally { cleanup(); }
});

test('ErrorRepository upsert reopens a previously resolved error', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new ErrorRepository(db);
    const err = repo.upsert('p1', 'sess-1', '/x.ts', 10, 'msg', 'error');
    repo.resolveByFingerprint('p1', err.fingerprint);
    assert.equal(repo.openForProject('p1').length, 0);
    // Re-upsert same location → should re-open
    repo.upsert('p1', 'sess-2', '/x.ts', 10, 'msg', 'error');
    assert.equal(repo.openForProject('p1').length, 1);
  } finally { cleanup(); }
});

test('ErrorRepository.resolveByFingerprint is a no-op for unknown fingerprint', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new ErrorRepository(db);
    // Should not throw
    repo.resolveByFingerprint('p1', 'nonexistent-fp');
    assert.equal(repo.openForProject('p1').length, 0);
  } finally { cleanup(); }
});

test('ErrorRepository.fingerprint is deterministic', () => {
  const fp1 = ErrorRepository.fingerprint('/src/a.ts', 10, 'Type error');
  const fp2 = ErrorRepository.fingerprint('/src/a.ts', 10, 'Type error');
  assert.equal(fp1, fp2);
  const fp3 = ErrorRepository.fingerprint('/src/a.ts', 11, 'Type error');
  assert.notEqual(fp1, fp3);
});

// ─── 2. SessionRepository (uncovered methods) ────────────────────────────────

test('SessionRepository.getById returns the correct session', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    const branch = repo.findOrCreateBranch('p1', 'main');
    const session = repo.startSession('p1', branch.id);
    const found = repo.getById(session.id);
    assert.ok(found);
    assert.equal(found!.id, session.id);
    assert.equal(repo.getById('nonexistent'), undefined);
  } finally { cleanup(); }
});

test('SessionRepository.getActive returns open session and undefined after end', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    const branch = repo.findOrCreateBranch('p1', 'main');
    assert.equal(repo.getActive('p1'), undefined);
    const session = repo.startSession('p1', branch.id);
    assert.equal(repo.getActive('p1')!.id, session.id);
    repo.endSession(session.id);
    assert.equal(repo.getActive('p1'), undefined);
  } finally { cleanup(); }
});

test('SessionRepository.getForProject returns sessions sorted newest first', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    const branch = repo.findOrCreateBranch('p1', 'main');
    const s1 = repo.startSession('p1', branch.id); repo.endSession(s1.id);
    const s2 = repo.startSession('p1', branch.id); repo.endSession(s2.id);
    const sessions = repo.getForProject('p1');
    assert.equal(sessions.length, 2);
    assert.ok(sessions[0]!.startedAt >= sessions[1]!.startedAt);
    // For a different project the list is empty
    assert.equal(repo.getForProject('p-other').length, 0);
  } finally { cleanup(); }
});

test('SessionRepository.getForProject respects the limit parameter', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    const branch = repo.findOrCreateBranch('p1', 'main');
    for (let i = 0; i < 5; i++) {
      const s = repo.startSession('p1', branch.id);
      repo.endSession(s.id);
    }
    assert.equal(repo.getForProject('p1', 3).length, 3);
  } finally { cleanup(); }
});

test('SessionRepository.updateSummary persists the summary text', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    const branch = repo.findOrCreateBranch('p1', 'main');
    const session = repo.startSession('p1', branch.id);
    repo.updateSummary(session.id, 'AI summary here');
    assert.equal(repo.getById(session.id)!.summary, 'AI summary here');
  } finally { cleanup(); }
});

test('SessionRepository.updateSummary is a no-op for unknown session id', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    repo.updateSummary('nonexistent', 'summary'); // must not throw
  } finally { cleanup(); }
});

test('SessionRepository.endSession is a no-op for unknown session id', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    assert.equal(repo.endSession('nonexistent'), undefined);
  } finally { cleanup(); }
});

test('SessionRepository endSession endedAt is at least startedAt', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new SessionRepository(db);
    const branch = repo.findOrCreateBranch('p1', 'main');
    const session = repo.startSession('p1', branch.id);
    // Pass an endedAt earlier than startedAt — must be clamped to startedAt
    const ended = repo.endSession(session.id, session.startedAt - 5000);
    assert.ok(ended!.endedAt! >= session.startedAt);
    assert.equal(ended!.durationSecs, 0);
  } finally { cleanup(); }
});

// ─── 3. FileActivityRepository ────────────────────────────────────────────────

test('FileActivityRepository.addTime increases timeSpentSecs', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new FileActivityRepository(db);
    repo.touch('p1', '/src/a.ts', 'open');
    repo.addTime('p1', '/src/a.ts', 120);
    const files = repo.topFiles('p1');
    assert.equal(files[0]!.timeSpentSecs, 120);
  } finally { cleanup(); }
});

test('FileActivityRepository.addTime is a no-op if file has not been touched', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new FileActivityRepository(db);
    repo.addTime('p1', '/nonexistent.ts', 60); // must not throw or create a record
    assert.equal(repo.topFiles('p1').length, 0);
  } finally { cleanup(); }
});

test('FileActivityRepository.recentFiles sorts by lastActivity descending', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new FileActivityRepository(db);
    // touch old.ts first, then spin briefly to ensure a different Date.now() value
    repo.touch('p1', '/src/old.ts', 'open');
    const spin = Date.now(); while (Date.now() === spin) { /* busy-wait for clock tick */ }
    repo.touch('p1', '/src/new.ts', 'save');
    const recent = repo.recentFiles('p1');
    assert.equal(recent.length, 2);
    assert.ok(recent[0]!.lastActivity >= recent[1]!.lastActivity);
    assert.equal(recent[0]!.path, '/src/new.ts');
  } finally { cleanup(); }
});

test('FileActivityRepository.topFiles sorts by timeSpentSecs descending', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new FileActivityRepository(db);
    repo.touch('p1', '/src/a.ts', 'open'); repo.addTime('p1', '/src/a.ts', 10);
    repo.touch('p1', '/src/b.ts', 'open'); repo.addTime('p1', '/src/b.ts', 200);
    const top = repo.topFiles('p1');
    assert.equal(top[0]!.path, '/src/b.ts');
    assert.equal(top[0]!.timeSpentSecs, 200);
  } finally { cleanup(); }
});

test('FileActivityRepository.topFiles respects limit', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new FileActivityRepository(db);
    for (let i = 0; i < 8; i++) repo.touch('p1', `/src/f${i}.ts`, 'open');
    assert.equal(repo.topFiles('p1', 3).length, 3);
  } finally { cleanup(); }
});

test('FileActivityRepository tracks all three touch kinds independently', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new FileActivityRepository(db);
    repo.touch('p1', '/src/a.ts', 'open');
    repo.touch('p1', '/src/a.ts', 'edit');
    repo.touch('p1', '/src/a.ts', 'save');
    const rec = repo.topFiles('p1')[0]!;
    assert.equal(rec.opens, 1);
    assert.equal(rec.edits, 1);
    assert.equal(rec.saves, 1);
  } finally { cleanup(); }
});

// ─── 4. TodoRepository (uncovered methods) ────────────────────────────────────

test('TodoRepository.resolveByLocation resolves a todo by file+line', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new TodoRepository(db);
    repo.upsert('p1', '/src/a.ts', 10, 'Add validation', 'TODO');
    repo.resolveByLocation('p1', '/src/a.ts', 10);
    assert.equal(repo.openForProject('p1').length, 0);
  } finally { cleanup(); }
});

test('TodoRepository.resolveByLocation is a no-op for missing location', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new TodoRepository(db);
    repo.resolveByLocation('p1', '/nonexistent.ts', 99); // must not throw
    assert.equal(repo.openForProject('p1').length, 0);
  } finally { cleanup(); }
});

test('TodoRepository.forFile returns only open todos for that specific file', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new TodoRepository(db);
    repo.upsert('p1', '/src/a.ts', 5, 'TODO A', 'TODO');
    repo.upsert('p1', '/src/a.ts', 6, 'TODO B', 'FIXME');
    repo.upsert('p1', '/src/b.ts', 1, 'TODO C', 'HACK');
    // Resolve one
    repo.resolveByLocation('p1', '/src/a.ts', 5);
    const aFile = repo.forFile('p1', '/src/a.ts');
    assert.equal(aFile.length, 1);
    assert.equal(aFile[0]!.text, 'TODO B');
    // Different file should not appear
    assert.equal(repo.forFile('p1', '/src/b.ts').length, 1);
  } finally { cleanup(); }
});

test('TodoRepository.resolveMissingForFile resolves todos not in the active set', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new TodoRepository(db);
    repo.upsert('p1', '/src/a.ts', 10, 'Keep me', 'TODO');
    repo.upsert('p1', '/src/a.ts', 20, 'Remove me', 'FIXME');
    // Active set only contains line 10
    const changed = repo.resolveMissingForFile('p1', '/src/a.ts', new Set(['10:TODO']));
    assert.equal(changed, true);
    const open = repo.openForProject('p1');
    assert.equal(open.length, 1);
    assert.equal(open[0]!.line, 10);
  } finally { cleanup(); }
});

test('TodoRepository.resolveMissingForFile returns false when nothing changed', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new TodoRepository(db);
    repo.upsert('p1', '/src/a.ts', 10, 'Keep me', 'TODO');
    const active = new Set(['10:TODO']);
    const changed = repo.resolveMissingForFile('p1', '/src/a.ts', active);
    assert.equal(changed, false);
  } finally { cleanup(); }
});

test('TodoRepository upsert updates text and reopens a resolved todo at same location', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new TodoRepository(db);
    repo.upsert('p1', '/src/a.ts', 5, 'Original text', 'TODO');
    repo.resolveByLocation('p1', '/src/a.ts', 5);
    // Re-upsert at same file/line/tag → should reopen with new text
    repo.upsert('p1', '/src/a.ts', 5, 'Updated text', 'TODO');
    const open = repo.openForProject('p1');
    assert.equal(open.length, 1);
    assert.equal(open[0]!.text, 'Updated text');
  } finally { cleanup(); }
});

// ─── 5. ProjectRepository ────────────────────────────────────────────────────

test('ProjectRepository.findById returns project or undefined', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new ProjectRepository(db);
    const project = repo.findOrCreate('/workspace', '', 'my-project');
    assert.ok(repo.findById(project.id));
    assert.equal(repo.findById('nonexistent'), undefined);
  } finally { cleanup(); }
});

test('ProjectRepository.all returns every stored project', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new ProjectRepository(db);
    assert.equal(repo.all().length, 0);
    repo.findOrCreate('/ws1', '', 'proj1');
    repo.findOrCreate('/ws2', '', 'proj2');
    assert.equal(repo.all().length, 2);
  } finally { cleanup(); }
});

test('ProjectRepository findOrCreate updates lastSeenAt and name on revisit', () => {
  const { db, cleanup } = createTempDb();
  try {
    const repo = new ProjectRepository(db);
    const first = repo.findOrCreate('/ws', 'remote', 'old-name');
    const firstSeen = first.lastSeenAt;
    const second = repo.findOrCreate('/ws', 'remote', 'new-name');
    assert.equal(first.id, second.id);
    assert.equal(second.name, 'new-name');
    assert.ok(second.lastSeenAt >= firstSeen);
    assert.equal(repo.all().length, 1);
  } finally { cleanup(); }
});
