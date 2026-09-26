/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextBoyBridge } from '../src/bridge/ContextBoyBridge';
import { EventBus, type CBEvents } from '../src/contextback/core/EventBus';
import { failedTestThreads, testCommandKey } from '../src/contextback/core/TestCommands';
import { ThreadDetector } from '../src/contextback/analysis/ThreadDetector';
import type { CBError, CBEvent, CBOpenThread, CBSession } from '../src/contextback/types';
import { CodeBoyEngine } from '../src/core/CodeBoyEngine';
import { DEFAULT_SETTINGS } from '../src/models/types';

const red = (id: string, filePath = `/src/${id}.ts`): CBOpenThread => ({
  id: filePath, title: `${id}.ts`, filePath, blockerIds: [`diagnostic:project:${id}`],
  lastTouched: Date.now(), lastError: `Error ${id}`, unfinishedScore: 0.8, signal: 'red', todoCount: 0,
});

function fixture() {
  let now = new Date(2026, 8, 26, 12).getTime();
  const engine = new CodeBoyEngine(undefined, DEFAULT_SETTINGS, { now: () => now });
  const bus = new EventBus<CBEvents>();
  let threads: CBOpenThread[] = [];
  let copied = '';
  const commands = new Map<string, () => unknown>();
  const source = {
    getBus: () => bus,
    getTopThreads: async () => threads,
    getActiveProjectId: () => 'project',
    openDashboard: async () => undefined,
  };
  const host = {
    commands: { registerCommand: (id: string, handler: () => unknown) => {
      commands.set(id, handler); return { dispose: () => { commands.delete(id); } };
    } },
    window: { showInformationMessage: async () => 'Copy Prompt' },
    env: { clipboard: { writeText: async (value: string) => { copied = value; } } },
  };
  const bridge = new ContextBoyBridge({} as never, { engine }, source, host);
  return {
    bridge, bus, engine, commands,
    setThreads: async (next: CBOpenThread[]) => { threads = next; await bridge.refreshHealth(); },
    advance: (ms: number) => { now += ms; engine.tick(); },
    copied: () => copied,
    dispose: () => { bridge.dispose(); bus.dispose(); engine.dispose(); },
  };
}

test('bridge forwards red health and Code Boy stays concerned only while idle', async () => {
  const f = fixture();
  try {
    await f.setThreads([red('auth')]);
    assert.equal(f.engine.snapshot().state, 'CONFUSED');
    assert.equal(f.engine.snapshot().bubbleKind, 'WARNING');
    assert.match(f.engine.snapshot().bubble, /Blocker in \/src\/auth.ts! Ask IBM Bob to fix/);
    f.engine.handle({ type: 'typing', characters: 1, languageId: 'typescript' });
    assert.equal(f.engine.snapshot().state, 'CODING');
    f.advance(31_000);
    assert.equal(f.engine.snapshot().state, 'CONFUSED');
    f.engine.action('pet');
    assert.equal(f.engine.snapshot().state, 'HAPPY');
    f.advance(4_000);
    assert.equal(f.engine.snapshot().state, 'CONFUSED');
  } finally { f.dispose(); }
});

test('downgrading a blocker to yellow does not award resolution XP', async () => {
  const f = fixture();
  try {
    const blocker = red('auth');
    await f.setThreads([blocker]);
    const xp = f.engine.snapshot().stats.xp;
    await f.setThreads([{ ...blocker, signal: 'yellow' }]);
    assert.equal(f.engine.snapshot().stats.xp, xp);
  } finally { f.dispose(); }
});

test('resolution uses blocker identities even when red count stays equal and awards XP once', async () => {
  const f = fixture();
  try {
    await f.setThreads([red('auth'), red('user')]);
    const initialXp = f.engine.snapshot().stats.xp;
    await f.setThreads([red('user'), red('billing')]);
    assert.equal(f.engine.snapshot().stats.xp, initialXp + 5);
    assert.equal(f.engine.snapshot().state, 'CELEBRATING');
    assert.equal(f.engine.snapshot().bubble, 'blocker crushed!');
    await f.setThreads([red('billing'), red('user')]);
    assert.equal(f.engine.snapshot().stats.xp, initialXp + 5);
  } finally { f.dispose(); }
});

test('welcome and commit are independent of blocker resolution', async () => {
  const f = fixture();
  try {
    await f.setThreads([red('auth')]);
    const xp = f.engine.snapshot().stats.xp;
    f.bus.emit('welcomeBack', { projectId: 'project', topic: 'Authentication', hoursAgo: 9, openBlockers: 1 });
    assert.match(f.engine.snapshot().bubble, /Welcome back! Last time: Authentication\. 1 blocker\(s\) waiting\./);
    f.bus.emit('commitRecorded', { projectId: 'project', hash: 'abc', message: 'feat: login' });
    assert.equal(f.engine.snapshot().stats.xp, xp);
    f.advance(3_000);
    assert.equal(f.engine.snapshot().state, 'CONFUSED');
  } finally { f.dispose(); }
});

test('manual Bob handoff previews and copies error context, and disposal unregisters commands', async () => {
  const f = fixture();
  await f.setThreads([red('auth')]);
  await f.commands.get('codeBoy.resolveBlockerWithBob')?.();
  assert.match(f.copied(), /File: \/src\/auth.ts/);
  assert.match(f.copied(), /Error: Error auth/);
  f.dispose();
  assert.equal(f.commands.size, 0);
});

test('warning-only diagnostics stay below red and same-basename paths stay separate', () => {
  const now = Date.now();
  const session: CBSession = { id: 's', projectId: 'project', branchId: 'main', startedAt: now,
    endedAt: null, durationSecs: 0, summary: '' };
  const error = (file: string, severity: CBError['severity'], fingerprint: string, lastSeen = now): CBError => ({
    id: fingerprint, projectId: 'project', sessionId: 's', fingerprint, file, line: 1, message: fingerprint,
    severity, firstSeen: lastSeen, lastSeen, resolved: false,
  });
  const threads = new ThreadDetector().detect([{ sessionId: 's', session,
    errors: [error('/src/auth/index.ts', 'error', 'a'), error('/src/users/index.ts', 'warning', 'b'),
      error('/src/old.ts', 'error', 'c', now - 10 * 86_400_000)],
    todos: [], hasUncommittedChanges: false, hasSuccessfulTestAfterError: false }]);
  assert.equal(threads.find(t => t.id === '/src/auth/index.ts')?.signal, 'red');
  assert.equal(threads.find(t => t.id === '/src/users/index.ts')?.signal, 'yellow');
  assert.notEqual(threads.find(t => t.id === '/src/old.ts')?.signal, 'red');
  assert.equal(threads.filter(t => t.title === 'index.ts').length, 2);
});

test('failed test commands are red until a normalized successful rerun', () => {
  const event = (timestamp: number, command: string, exitCode: number): CBEvent => ({
    id: String(timestamp), sessionId: 's', type: 'terminal_command', timestamp, filePath: '',
    data: { command, exitCode },
  });
  assert.equal(testCommandKey('  NPM   TEST  '), testCommandKey('npm test'));
  assert.equal(testCommandKey('npm test --watch'), testCommandKey('npm test'));
  assert.equal(testCommandKey('echo test'), undefined);
  const failed = event(1, 'npm test', 1);
  assert.equal(failedTestThreads('project', [failed])[0]?.signal, 'red');
  assert.equal(failedTestThreads('project', [failed, event(2, ' NPM  TEST ', 0)]).length, 0);
});
