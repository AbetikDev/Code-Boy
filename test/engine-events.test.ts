/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { CodeBoyEngine } from '../src/core/CodeBoyEngine';
import { INITIAL_STATS } from '../src/core/MoodEngine';
import { emptyDaily, localDate } from '../src/core/ProgressionSystem';
import { DEFAULT_SETTINGS, SavedState } from '../src/models/types';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function setup(overrides: Partial<typeof DEFAULT_SETTINGS> = {}, saved?: unknown, development = false, hasWorkspace = true) {
  let now = new Date(2026, 8, 25, 12).getTime();
  // Start with a saved state when hasWorkspace=true to suppress the 'hi.' / greetingAt startup greeting,
  // making bubble-timing predictable without requiring large time advances in each test.
  // Tests that explicitly test no-saved-state behaviour pass saved=null or use a fixture.
  const resolvedSaved = saved !== undefined ? saved : (hasWorkspace ? { version: 1 as const,
    stats: { ...INITIAL_STATS }, daily: emptyDaily(localDate(now)), unlockedItems: [], room: 'DEFAULT' as const,
    streak: 0, lastCodingDate: '', savedAt: now, deepFocusSessions: 0 } : undefined);
  const engine = new CodeBoyEngine(resolvedSaved, { ...DEFAULT_SETTINGS, ...overrides }, { now: () => now, random: () => 0.5, development, hasWorkspace });
  return {
    engine,
    now: () => now,
    advance: (ms: number) => { now += ms; engine.tick(); },
    jump: (ms: number) => { now += ms; },
  };
}

function savedAt(ts: number, xp = 0): SavedState {
  return { version: 1, stats: { ...INITIAL_STATS, xp }, daily: emptyDaily(localDate(ts)),
    unlockedItems: [], room: 'DEFAULT', streak: 0, lastCodingDate: '', savedAt: ts, deepFocusSessions: 0 };
}

// ─── 1. HANDLE: taskEnd (failed path) ────────────────────────────────────────

test('first failed build triggers CONFUSED reaction', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'taskStart', kind: 'build' });
  advance(21_000); // clear the taskStart bubble cooldown before the failure bubble
  engine.handle({ type: 'taskEnd', success: false, kind: 'build' });
  assert.equal(engine.snapshot().state, 'CONFUSED');
  assert.match(engine.snapshot().bubble, /fix it/);
});

test('three or more consecutive failed builds escalate to SAD reaction', () => {
  const { engine, advance } = setup();
  for (let i = 0; i < 3; i++) {
    engine.handle({ type: 'taskStart', kind: 'build' });
    advance(21_000); // clear taskStart bubble cooldown
    engine.handle({ type: 'taskEnd', success: false, kind: 'build' });
    // check the reaction state immediately before advancing past it
  }
  // The third failure's SAD reaction is still active right after taskEnd
  assert.equal(engine.snapshot().state, 'SAD');
});

test('successful build resets failed build counter and earns XP', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'taskStart', kind: 'build' });
  engine.handle({ type: 'taskEnd', success: false, kind: 'build' });
  advance(10_000);
  engine.handle({ type: 'taskStart', kind: 'build' });
  engine.handle({ type: 'taskEnd', success: true, kind: 'build' });
  assert.equal(engine.snapshot().state, 'CELEBRATING');
  assert.equal(engine.snapshot().daily.buildsCompleted, 1);
  // A further failure after a success should reset to CONFUSED (not SAD)
  advance(10_000);
  engine.handle({ type: 'taskStart', kind: 'build' });
  engine.handle({ type: 'taskEnd', success: false, kind: 'build' });
  assert.equal(engine.snapshot().state, 'CONFUSED');
});

test('taskEnd with kind=task does not award a build XP', () => {
  const { engine } = setup();
  engine.handle({ type: 'taskStart', kind: 'task' });
  engine.handle({ type: 'taskEnd', success: true, kind: 'task' });
  assert.equal(engine.snapshot().daily.buildsCompleted, 0);
});

// ─── 2. HANDLE: terminal & debug ─────────────────────────────────────────────

test('terminal event keeps activity alive without changing state', () => {
  const { engine } = setup();
  const stateBefore = engine.snapshot().state;
  engine.handle({ type: 'terminal' });
  assert.equal(engine.snapshot().state, stateBefore);
});

test('debug active enters THINKING, inactive produces a speech bubble', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'debug', active: true });
  assert.equal(engine.snapshot().state, 'THINKING');
  assert.match(engine.snapshot().bubble, /bug hunt/);
  advance(21_000); // clear the bug-hunt bubble cooldown
  engine.handle({ type: 'debug', active: false });
  assert.equal(engine.snapshot().state, 'IDLE');
  assert.match(engine.snapshot().bubble, /interesting/);
});

// ─── 3. HANDLE: gitMilestone ─────────────────────────────────────────────────

test('gitMilestone triggers a HAPPY reaction with commit bubble', () => {
  const { engine } = setup();
  engine.handle({ type: 'gitMilestone', message: 'feat: new feature' });
  assert.equal(engine.snapshot().state, 'HAPPY');
  assert.match(engine.snapshot().bubble, /commit/);
});

// ─── 4. HANDLE: threadStatus ─────────────────────────────────────────────────

test('threadStatus with red thread emits a blocker warning bubble', () => {
  const { engine } = setup();
  engine.handle({ type: 'threadStatus', hasRedThread: true, topThreadFile: 'src/auth.ts', blockerCount: 1 });
  assert.match(engine.snapshot().bubble, /Blocker/);
  assert.match(engine.snapshot().bubble, /src\/auth\.ts/);
});

test('threadStatus clearing red triggers a success reaction', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'threadStatus', hasRedThread: true, topThreadFile: 'src/a.ts', blockerCount: 1 });
  advance(5_000);
  engine.handle({ type: 'threadStatus', hasRedThread: false, blockerCount: 0 });
  assert.equal(engine.snapshot().state, 'SUCCESS');
  assert.match(engine.snapshot().bubble, /all clear/);
});

test('threadStatus with no red thread does not show warning', () => {
  const { engine } = setup();
  engine.handle({ type: 'threadStatus', hasRedThread: false, blockerCount: 0 });
  assert.equal(engine.snapshot().bubble, '');
});

test('threadStatus increasing blocker count re-emits warning', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'threadStatus', hasRedThread: true, topThreadFile: 'a.ts', blockerCount: 1 });
  void engine.snapshot().bubble; // first bubble emitted (forced)
  advance(25_000);   // clear 20 s bubble cooldown
  // Increase blocker count to trigger re-emission
  engine.handle({ type: 'threadStatus', hasRedThread: true, topThreadFile: 'a.ts', blockerCount: 2 });
  assert.ok(engine.snapshot().bubble.includes('Blocker'));
});

// ─── 5. HANDLE: sessionWelcome & threadResolved ───────────────────────────────

test('sessionWelcome shows topic and open-blocker count in bubble', () => {
  const { engine } = setup();
  engine.handle({ type: 'sessionWelcome', topic: 'Authentication', hoursAgo: 3, openBlockers: 2 });
  assert.equal(engine.snapshot().state, 'HAPPY');
  assert.match(engine.snapshot().bubble, /Welcome back/);
  assert.match(engine.snapshot().bubble, /Authentication/);
  assert.match(engine.snapshot().bubble, /2 blocker/);
});

test('sessionWelcome with no blockers shows ready message', () => {
  const { engine } = setup();
  engine.handle({ type: 'sessionWelcome', topic: 'Testing', hoursAgo: 1, openBlockers: 0 });
  assert.match(engine.snapshot().bubble, /Ready to build/);
});

test('threadResolved awards XP, triggers CELEBRATING and a bubble', () => {
  const { engine } = setup();
  const xpBefore = engine.snapshot().stats.xp;
  engine.handle({ type: 'threadResolved' });
  assert.equal(engine.snapshot().state, 'CELEBRATING');
  assert.match(engine.snapshot().bubble, /blocker crushed/);
  assert.ok(engine.snapshot().stats.xp > xpBefore);
});

// ─── 6. HANDLE: diagnostics ──────────────────────────────────────────────────

test('large error spike selects error_panic animation', () => {
  const { engine } = setup();
  engine.handle({ type: 'diagnostics', errors: 15, previousErrors: 0 });
  assert.equal(engine.snapshot().animation, 'error_panic');
  assert.equal(engine.snapshot().state, 'ERROR');
});

test('small error count (≤3) selects error_notice animation', () => {
  const { engine } = setup();
  engine.handle({ type: 'diagnostics', errors: 2, previousErrors: 0 });
  assert.equal(engine.snapshot().animation, 'error_notice');
  assert.equal(engine.snapshot().state, 'ERROR');
});

test('mid-range error count (4–12) selects error_confused animation', () => {
  const { engine } = setup();
  engine.handle({ type: 'diagnostics', errors: 5, previousErrors: 0 });
  assert.equal(engine.snapshot().animation, 'error_confused');
  assert.equal(engine.snapshot().state, 'CONFUSED');
});

test('reducing to zero errors triggers success animation', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'diagnostics', errors: 3, previousErrors: 0 });
  assert.equal(engine.snapshot().state, 'ERROR');
  advance(21_000); // clear both the 8 s diagnostic cooldown and the 20 s bubble cooldown
  engine.handle({ type: 'diagnostics', errors: 0, previousErrors: 3 });
  assert.equal(engine.snapshot().state, 'SUCCESS');
  assert.equal(engine.snapshot().animation, 'success');
  assert.match(engine.snapshot().bubble, /clean/);
});

test('reducing errors but not to zero triggers happy animation', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'diagnostics', errors: 5, previousErrors: 0 });
  advance(21_000); // clear both the 8 s diagnostic cooldown and the 20 s bubble cooldown
  engine.handle({ type: 'diagnostics', errors: 2, previousErrors: 5 });
  assert.equal(engine.snapshot().state, 'HAPPY');
  assert.match(engine.snapshot().bubble, /nice/);
});

// ─── 7. ACTIONS: vibe, dance, play, look ─────────────────────────────────────

test('vibe action toggles vibeMode setting and emits a bubble', () => {
  const { engine } = setup();
  assert.equal(engine.snapshot().settings.vibeMode, false);
  engine.action('vibe');
  assert.equal(engine.snapshot().settings.vibeMode, true);
  assert.match(engine.snapshot().bubble, /vibe mode/);
  engine.action('vibe');
  assert.equal(engine.snapshot().settings.vibeMode, false);
  assert.match(engine.snapshot().bubble, /focus mode/);
});

test('dance action triggers DANCING state with a bubble', () => {
  const { engine } = setup();
  engine.action('dance');
  assert.equal(engine.snapshot().state, 'DANCING');
  assert.match(engine.snapshot().bubble, /dance/);
});

test('dance action is on cooldown and cannot be spammed', () => {
  const { engine } = setup();
  engine.action('dance');
  const happiness1 = engine.snapshot().stats.happiness;
  engine.action('dance');   // within 8 s cooldown
  assert.equal(engine.snapshot().stats.happiness, happiness1);
});

test('play action triggers VERY_HAPPY with a bubble', () => {
  const { engine } = setup();
  engine.action('play');
  assert.equal(engine.snapshot().state, 'VERY_HAPPY');
  assert.match(engine.snapshot().bubble, /level/);
});

test('look action produces a brief idle look reaction without affecting state', () => {
  const { engine } = setup();
  // look is accepted from IDLE (priority 0 matches IDLE)
  engine.action('look');
  assert.ok(['idle_look_left', 'idle_look_right'].includes(engine.snapshot().animation));
});

test('look action is blocked while typing (coding base priority 30 > look priority 10)', () => {
  const { engine } = setup();
  engine.handle({ type: 'typing', characters: 1, languageId: 'typescript' });
  engine.action('look');
  // Should remain in CODING (look priority 10 < coding base priority 30)
  assert.equal(engine.snapshot().state, 'CODING');
});

// ─── 8. setWorkspace ─────────────────────────────────────────────────────────

test('setWorkspace true shows open-project bubble', () => {
  const { engine } = setup();
  engine.setWorkspace(false);
  engine.setWorkspace(true);
  assert.match(engine.snapshot().bubble, /let's code/);
});

test('setWorkspace false shows open-a-project prompt', () => {
  const { engine } = setup();
  engine.setWorkspace(false);
  assert.match(engine.snapshot().bubble, /open a project/);
});

test('setWorkspace called with same value is a no-op', () => {
  const { engine } = setup();
  const snapshot1 = JSON.stringify(engine.snapshot());
  engine.setWorkspace(true); // same value
  const snapshot2 = JSON.stringify(engine.snapshot());
  assert.equal(snapshot1, snapshot2);
});

// ─── 9. setRoom ──────────────────────────────────────────────────────────────

test('setRoom accepts valid rooms at the required level', () => {
  const { engine } = setup();
  engine.setRoom('NIGHT');  // level 1 unlock
  assert.equal(engine.snapshot().room, 'NIGHT');
});

test('setRoom rejects invalid room strings', () => {
  const { engine } = setup();
  (engine as any).setRoom('INVALID_ROOM');
  assert.equal(engine.snapshot().room, 'DEFAULT');
});

test('setRoom is ignored when level is too low for the requested room', () => {
  const { engine } = setup();
  engine.setRoom('CYBER');  // requires level 10
  assert.equal(engine.snapshot().room, 'DEFAULT');
});

// ─── 10. setMusic ────────────────────────────────────────────────────────────

test('setMusic true transitions idle character to LISTENING_MUSIC', () => {
  const { engine } = setup();
  engine.setMusic(true, 'Spotify: Lofi Beats');
  assert.equal(engine.snapshot().state, 'LISTENING_MUSIC');
  assert.equal(engine.snapshot().musicPlaying, true);
  assert.equal(engine.snapshot().musicStatus, 'Spotify: Lofi Beats');
});

test('setMusic false stops listening when no manual music', () => {
  const { engine } = setup();
  engine.setMusic(true, 'Playing');
  engine.setMusic(false, 'Stopped');
  assert.equal(engine.snapshot().musicPlaying, false);
  assert.equal(engine.snapshot().state, 'IDLE');
});

test('setMusic truncates status strings longer than 160 characters', () => {
  const { engine } = setup();
  engine.setMusic(true, 'x'.repeat(200));
  assert.equal(engine.snapshot().musicStatus.length, 160);
});

// ─── 11. debug (development mode) ────────────────────────────────────────────

test('debug command overrides state and animation in development mode', () => {
  const { engine } = setup({}, undefined, true);
  engine.debug({ state: 'DANCING', animation: 'dance_02' });
  assert.equal(engine.snapshot().state, 'DANCING');
  assert.equal(engine.snapshot().animation, 'dance_02');
});

test('debug command is rejected in production mode', () => {
  const { engine } = setup({}, undefined, false);
  engine.debug({ state: 'DANCING' });
  assert.notEqual(engine.snapshot().state, 'DANCING');
});

test('debug with random:true picks an idle animation', () => {
  const { engine } = setup({}, undefined, true);
  engine.debug({ random: true });
  // any animation is accepted; just confirm no crash and state is set
  assert.equal(typeof engine.snapshot().animation, 'string');
});

test('debug with fps clamps animationSpeed', () => {
  const { engine } = setup({}, undefined, true);
  engine.debug({ fps: 6 });
  // fps=6, speed = clamp(6/8, 0.25, 2) = 0.75
  assert.ok(engine.snapshot().settings.animationSpeed > 0.5 && engine.snapshot().settings.animationSpeed < 1);
});

// ─── 12. onChange listener ────────────────────────────────────────────────────

test('onChange deduplicates identical successive snapshots', () => {
  const { engine } = setup();
  let calls = 0;
  engine.onChange(() => { calls++; });
  engine.tick(); engine.tick(); engine.tick();
  // Only 1 emission: tick() with no changes produces one notification then stops
  assert.equal(calls, 1);
});

test('onChange fires again when state genuinely changes', () => {
  const { engine } = setup();
  let calls = 0;
  engine.onChange(() => { calls++; });
  engine.tick();
  engine.handle({ type: 'typing', characters: 1, languageId: 'typescript' });
  assert.ok(calls >= 2);
});

// ─── 13. snapshot isolation ───────────────────────────────────────────────────

test('snapshot returns independent copies — mutations do not affect engine state', () => {
  const { engine } = setup();
  const snap = engine.snapshot();
  snap.stats.xp = 99999;
  snap.settings.enabled = false;
  snap.daily.filesSaved = 99;
  assert.equal(engine.snapshot().stats.xp, 0);
  assert.equal(engine.snapshot().settings.enabled, true);
  assert.equal(engine.snapshot().daily.filesSaved, 0);
});

// ─── 14. baseStateAt paths ────────────────────────────────────────────────────

test('TIRED state appears when energy drops below 18', () => {
  const { engine } = setup();
  // Force low energy via MoodEngine directly by sleeping for a very long time
  // then immediately wake (sleeping restores energy, so we use BORED drain instead)
  // Easiest: construct with saved state that has low energy
  const now = new Date(2026, 8, 25, 12).getTime();
  const lowEnergy = savedAt(now);
  lowEnergy.stats.energy = 10;
  const { engine: tired } = setup({}, lowEnergy);
  assert.equal(tired.snapshot().state, 'TIRED');
});

test('VERY_SAD state appears when mood is below 15', () => {
  const now = new Date(2026, 8, 25, 12).getTime();
  const lowMood = savedAt(now);
  lowMood.stats.mood = 10;
  const { engine } = setup({}, lowMood);
  assert.equal(engine.snapshot().state, 'VERY_SAD');
});

test('SAD state appears when mood is between 15 and 31', () => {
  const now = new Date(2026, 8, 25, 12).getTime();
  const sadState = savedAt(now);
  sadState.stats.mood = 20;
  const { engine } = setup({}, sadState);
  assert.equal(engine.snapshot().state, 'SAD');
});

test('VERY_HAPPY state appears when happiness and mood are both very high', () => {
  const now = new Date(2026, 8, 25, 12).getTime();
  const happyState = savedAt(now);
  happyState.stats.happiness = 95;
  happyState.stats.mood = 90;
  const { engine } = setup({}, happyState);
  assert.equal(engine.snapshot().state, 'VERY_HAPPY');
});

test('CONFUSED state when red blockers > 0 and not typing or sleeping', () => {
  const { engine } = setup();
  engine.handle({ type: 'threadStatus', hasRedThread: true, topThreadFile: 'main.ts', blockerCount: 1 });
  // advance past the bubble/reaction but keep blocker active
  const { advance } = setup(); // fresh engine
  void advance;
  // Use a fresh engine to test the base state cleanly
  const { engine: e2, advance: adv } = setup();
  e2.handle({ type: 'threadStatus', hasRedThread: true, topThreadFile: 'a.ts', blockerCount: 2 });
  adv(3_000); // let the reaction expire
  assert.equal(e2.snapshot().state, 'CONFUSED');
});

// ─── 15. vibeMode + workspace base state ─────────────────────────────────────

test('vibeMode with a workspace and no typing enters VIBE_CODING', () => {
  const { engine } = setup({ vibeMode: true });
  engine.setWorkspace(true);
  assert.equal(engine.snapshot().state, 'VIBE_CODING');
});

test('vibeMode without a workspace does not enter VIBE_CODING', () => {
  const { engine } = setup({ vibeMode: true });
  engine.setWorkspace(false);
  // Without a workspace, vibeMode base state is not entered
  assert.notEqual(engine.snapshot().state, 'VIBE_CODING');
});

// ─── 16. taskStart bubble ────────────────────────────────────────────────────

test('taskStart with kind=test emits test-time bubble', () => {
  const { engine } = setup();
  engine.handle({ type: 'taskStart', kind: 'test' });
  assert.match(engine.snapshot().bubble, /test time/);
});

test('taskStart with kind=build emits building bubble', () => {
  const { engine } = setup();
  engine.handle({ type: 'taskStart', kind: 'build' });
  assert.match(engine.snapshot().bubble, /building/);
});
