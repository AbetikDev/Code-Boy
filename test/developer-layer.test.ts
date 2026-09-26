import test from 'node:test';
import assert from 'node:assert/strict';
import { CodeBoyEngine } from '../src/core/CodeBoyEngine';
import { INITIAL_STATS } from '../src/core/MoodEngine';
import { DEFAULT_SETTINGS } from '../src/models/types';
import { parseMprisNames, parsePlaybackStatus } from '../src/music/LinuxMprisProvider';
import { macPlayerScript } from '../src/music/MacMusicProvider';

function fixture(saved?: unknown) {
  let now = new Date(2026, 8, 26, 12).getTime();
  const engine = new CodeBoyEngine(saved, DEFAULT_SETTINGS, { now: () => now, hasWorkspace: true });
  return { engine, now: () => now, step: (ms: number) => { now += ms; engine.tick(); },
    edit: (chars: number, lines = 0) => engine.handle({ type: 'codingEdit',
      sample: { timestamp: now, insertedChars: chars, deletedChars: 0, insertedLines: lines, languageId: 'typescript' }, documentLines: 100 }) };
}

test('legacy IQ migrates to zero Craft while XP and levels remain', () => {
  const { engine } = fixture({ version: 1, stats: { ...INITIAL_STATS, iq: 95, craft: 80, xp: 450 },
    daily: { date: '2026-09-26', codingSeconds: 0, filesSaved: 0, errorsFixed: 0, buildsCompleted: 0 },
    unlockedItems: [], room: 'DEFAULT', streak: 0, lastCodingDate: '', savedAt: Date.now(), deepFocusSessions: 0 });
  assert.equal(engine.snapshot().stats.craft, 0);
  assert.equal(engine.snapshot().stats.xp, 450);
  assert.equal(engine.serialize().version, 2);
  engine.dispose();
});

test('large paste is neutral for Craft; steady small edits and flow earn Craft', () => {
  const f = fixture();
  f.edit(500, 12);
  assert.equal(f.engine.getCodingBehavior().mode, 'assisted');
  assert.equal(f.engine.snapshot().stats.craft, 0);
  f.step(31_000);
  assert.equal(f.engine.getCodingBehavior().mode, 'idle');
  for (let i = 0; i < 20; i++) { f.edit(3); if (i < 19) f.step(5_000); }
  assert.equal(f.engine.getCodingBehavior().mode, 'assisted'); // paste is still in the 5-minute window
  assert.ok(f.engine.snapshot().stats.craft >= 1);
  f.engine.dispose();
  const flow = fixture();
  for (let i = 0; i < 20; i++) { flow.edit(3); if (i < 19) flow.step(5_000); }
  assert.equal(flow.engine.getCodingBehavior().mode, 'flow');
  assert.ok(flow.engine.snapshot().stats.craft >= 3);
  flow.engine.dispose();
});

test('quality uses diagnostics and test transitions without treating unknown tests as failure', () => {
  const f = fixture();
  assert.equal(f.engine.getQualitySnapshot().tests, 'unknown');
  f.engine.handle({ type: 'diagnostics', errors: 2, previousErrors: 0, warnings: 1 });
  f.engine.handle({ type: 'projectHealth', projectId: 'p', redBlockers: 2, openTodos: 1,
    fixmeHacks: 0, failingTests: 0, tests: 'unknown' });
  const quality = f.engine.getQualitySnapshot();
  assert.equal(quality.status, 'blocked');
  assert.equal(quality.testing, null);
  assert.equal(quality.unmatchedBlockers, 0);
  f.engine.handle({ type: 'projectHealth', projectId: 'p', redBlockers: 0, openTodos: 0,
    fixmeHacks: 0, failingTests: 0, tests: 'passing', lastTestAt: f.now() - 1000 });
  f.edit(3);
  assert.equal(f.engine.getQualitySnapshot().tests, 'stale');
  f.engine.dispose();
});

test('Linux MPRIS parsing accepts only player names and exact Playing status', () => {
  const output = 'org.mpris.MediaPlayer2.spotify  123 user\norg.freedesktop.DBus 1 user\norg.mpris.MediaPlayer2.vlc 124 user\n';
  assert.deepEqual(parseMprisNames(output), ['org.mpris.MediaPlayer2.spotify', 'org.mpris.MediaPlayer2.vlc']);
  assert.equal(parsePlaybackStatus('s "Playing"\n'), true);
  assert.equal(parsePlaybackStatus('s "Paused"\n'), false);
  assert.equal(parsePlaybackStatus('s "NotPlaying"\n'), false);
});

test('macOS scripts query only running Apple Music and Spotify player state', () => {
  for (const app of ['Music', 'Spotify'] as const) {
    const script = macPlayerScript(app).join('\n');
    assert.match(script, new RegExp(`application "${app}" is running`));
    assert.match(script, /player state/);
    assert.doesNotMatch(script, /track|audio|history/i);
  }
});
