/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Database } from '../src/contextback/Database';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cb-db-integrity-'));
}

// ─── 1. LOAD RESILIENCE ───────────────────────────────────────────────────────

test('Database starts with empty store when the file does not exist', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    assert.equal(db.get('events').length, 0);
    assert.equal(db.get('sessions').length, 0);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database resets to empty store when persisted file has wrong version', () => {
  const dir = tempDir();
  try {
    const dbPath = path.join(dir, 'context.json');
    // Write a file with version 99 — should be discarded
    fs.writeFileSync(dbPath, JSON.stringify({ version: 99, projects: [{ id: 'old' }] }), 'utf8');
    const db = new Database(dir);
    assert.equal(db.get('projects').length, 0);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database resets to empty store when persisted file is corrupted JSON', () => {
  const dir = tempDir();
  try {
    const dbPath = path.join(dir, 'context.json');
    fs.writeFileSync(dbPath, '{ this is not valid json !!!', 'utf8');
    const db = new Database(dir);
    assert.equal(db.get('projects').length, 0);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database resets to empty store when persisted file is empty', () => {
  const dir = tempDir();
  try {
    const dbPath = path.join(dir, 'context.json');
    fs.writeFileSync(dbPath, '', 'utf8');
    const db = new Database(dir);
    assert.equal(db.get('events').length, 0);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database recovers arrays correctly when some keys are missing from the file', () => {
  const dir = tempDir();
  try {
    const dbPath = path.join(dir, 'context.json');
    // Only `projects` is present; all others should default to empty arrays
    fs.writeFileSync(dbPath, JSON.stringify({
      version: 1,
      projects: [{ id: 'p1', name: 'test', rootPath: '/', gitRemote: '', createdAt: 0, lastSeenAt: 0 }],
      // branches, sessions, events, etc. are intentionally absent
    }), 'utf8');
    const db = new Database(dir);
    assert.equal(db.get('projects').length, 1);
    assert.equal(db.get('sessions').length, 0);
    assert.equal(db.get('events').length, 0);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ─── 2. FLUSH & DIRTY FLAG ────────────────────────────────────────────────────

test('Database.flush is a no-op when nothing is dirty', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    const dbPath = path.join(dir, 'context.json');
    // File should not exist yet (no writes)
    assert.equal(fs.existsSync(dbPath), false);
    db.flush(); // should not create the file
    assert.equal(fs.existsSync(dbPath), false);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database.flush writes file after a set() call marks it dirty', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    db.set('projects', [{ id: 'p1', name: 'proj', rootPath: '/root', gitRemote: '', createdAt: 0, lastSeenAt: 0 }]);
    db.flush();
    const dbPath = path.join(dir, 'context.json');
    assert.ok(fs.existsSync(dbPath));
    const stored = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert.equal(stored.projects.length, 1);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database.flush is idempotent — second flush does not re-write', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    db.set('projects', [{ id: 'p1', name: 'proj', rootPath: '/', gitRemote: '', createdAt: 0, lastSeenAt: 0 }]);
    db.flush();
    const dbPath = path.join(dir, 'context.json');
    const mtime1 = fs.statSync(dbPath).mtimeMs;
    db.flush(); // nothing dirty — should not touch the file
    const mtime2 = fs.statSync(dbPath).mtimeMs;
    assert.equal(mtime1, mtime2);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database.dispose flushes dirty state before clearing timers', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    db.set('events', [{ id: 'e1', sessionId: 's1', type: 'file_save', timestamp: 1, filePath: '/a.ts', data: {} }]);
    // dispose must flush even though the debounce timer hasn't fired
    db.dispose();
    const dbPath = path.join(dir, 'context.json');
    assert.ok(fs.existsSync(dbPath));
    const stored = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert.equal(stored.events.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ─── 3. PRUNE ────────────────────────────────────────────────────────────────

test('Database.prune trims events to MAX_EVENTS keeping the most recent', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    const events = Array.from({ length: 5010 }, (_, i) => ({
      id: `e${i}`, sessionId: 's1', type: 'file_save' as const, timestamp: i, filePath: '/a.ts', data: {},
    }));
    db.set('events', events);
    db.prune();
    const remaining = db.get('events');
    assert.equal(remaining.length, 5000);
    // Most recent events are kept
    assert.equal(remaining[0]!.id, 'e10');
    assert.equal(remaining[remaining.length - 1]!.id, 'e5009');
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database.prune trims terminalCommands to 500 keeping the most recent', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    const cmds = Array.from({ length: 510 }, (_, i) => ({
      command: `cmd${i}`, cwd: '/', startTime: i, endTime: i + 1, exitCode: 0, duration: 1,
    }));
    db.set('terminalCommands', cmds);
    db.prune();
    assert.equal(db.get('terminalCommands').length, 500);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database.prune trims sessions to 200 keeping the most recent', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    const sessions = Array.from({ length: 210 }, (_, i) => ({
      id: `s${i}`, projectId: 'p1', branchId: 'b1', startedAt: i * 1000, endedAt: i * 1000 + 1, durationSecs: 1, summary: '',
    }));
    db.set('sessions', sessions);
    db.prune();
    assert.equal(db.get('sessions').length, 200);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Database.prune is a no-op when all arrays are within limits', () => {
  const dir = tempDir();
  try {
    const db = new Database(dir);
    db.set('events', [{ id: 'e1', sessionId: 's1', type: 'file_save', timestamp: 1, filePath: '/a.ts', data: {} }]);
    db.prune();
    assert.equal(db.get('events').length, 1);
    db.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ─── 4. ROUND-TRIP PERSISTENCE ────────────────────────────────────────────────

test('Database data round-trips through flush and reload correctly', () => {
  const dir = tempDir();
  try {
    const db1 = new Database(dir);
    db1.set('projects', [{ id: 'p42', name: 'test-proj', rootPath: '/home/dev', gitRemote: 'origin', createdAt: 100, lastSeenAt: 200 }]);
    db1.flush();
    db1.dispose();

    const db2 = new Database(dir);
    const projects = db2.get('projects');
    assert.equal(projects.length, 1);
    assert.equal(projects[0]!.id, 'p42');
    assert.equal(projects[0]!.name, 'test-proj');
    db2.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
