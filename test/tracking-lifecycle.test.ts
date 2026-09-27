/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Database } from '../src/contextback/Database';
import { EventRepository } from '../src/contextback/repositories/EventRepository';
import { SessionManager } from '../src/contextback/core/SessionManager';
import { GitCollector } from '../src/contextback/collectors/GitCollector';
import { DEFAULT_CB_SETTINGS } from '../src/contextback/types';
import type { CBCommit } from '../src/contextback/types';
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
