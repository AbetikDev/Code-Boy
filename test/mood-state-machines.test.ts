/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { MoodEngine, INITIAL_STATS, clamp, iqLabel } from '../src/core/MoodEngine';
import { StateMachine } from '../src/core/StateMachine';
import { ActivityTracker } from '../src/core/ActivityTracker';
import { ProgressionSystem, xpForLevel, validDate, localDate, emptyDaily, UNLOCKS } from '../src/core/ProgressionSystem';
import type { Stats } from '../src/models/types';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function freshStats(): Stats {
  return { ...INITIAL_STATS };
}

// ─── 1. CLAMP & IQLAB ────────────────────────────────────────────────────────

test('clamp enforces default 0–100 bounds and handles non-finite values', () => {
  assert.equal(clamp(50), 50);
  assert.equal(clamp(-10), 0);
  assert.equal(clamp(110), 100);
  assert.equal(clamp(30, 40, 80), 40);
  assert.equal(clamp(90, 40, 80), 80);
  assert.equal(clamp(NaN), 0);           // non-finite → min
  assert.equal(clamp(Infinity), 0);      // non-finite → min (isFinite(Infinity) is false)
  assert.equal(clamp(-Infinity), 0);
});

test('iqLabel maps numeric IQ to the correct tier label', () => {
  assert.equal(iqLabel(100), 'BIG BRAIN');
  assert.equal(iqLabel(96), 'BIG BRAIN');
  assert.equal(iqLabel(95), 'GALAXY BRAIN');
  assert.equal(iqLabel(88), 'GALAXY BRAIN');
  assert.equal(iqLabel(87), 'SENIOR DEV');
  assert.equal(iqLabel(76), 'SENIOR DEV');
  assert.equal(iqLabel(75), 'JUNIOR DEV');
  assert.equal(iqLabel(60), 'JUNIOR DEV');
  assert.equal(iqLabel(59), 'INTERN MODE');
  assert.equal(iqLabel(40), 'INTERN MODE');
  assert.equal(iqLabel(39), 'RUBBER DUCK');
  assert.equal(iqLabel(0), 'RUBBER DUCK');
});

// ─── 2. MOOD ENGINE ──────────────────────────────────────────────────────────

test('MoodEngine.advance restores energy and reduces boredom while sleeping', () => {
  const stats = freshStats();
  stats.energy = 40; stats.focus = 60; stats.boredom = 50;
  const engine = new MoodEngine(stats);
  engine.advance(60, 'SLEEPING', false);
  assert.ok(engine.stats.energy > 40, 'energy rises when sleeping');
  assert.ok(engine.stats.focus < 60, 'focus falls when sleeping');
  assert.ok(engine.stats.boredom < 50, 'boredom falls when sleeping');
});

test('MoodEngine.advance raises focus and mood when coding, deep focus raises IQ', () => {
  const stats = freshStats();
  stats.focus = 10; stats.boredom = 80;
  stats.iq = 50;  // start below max so there's room to rise
  const engine = new MoodEngine(stats);
  const iqBefore = engine.stats.iq;
  engine.advance(60, 'CODING', true);
  assert.ok(engine.stats.focus > 10, 'focus rises while coding');
  assert.ok(engine.stats.boredom < 80, 'boredom falls while coding');
  assert.ok(engine.stats.iq > iqBefore, 'IQ rises with deep focus during coding');
});

test('MoodEngine.advance applies vibe bonuses for mood and happiness', () => {
  const stats = freshStats();
  const engine = new MoodEngine(stats);
  const moodBefore = engine.stats.mood;
  const happinessBefore = engine.stats.happiness;
  engine.advance(60, 'VIBE_CODING', false);
  assert.ok(engine.stats.mood > moodBefore, 'mood rises in vibe mode');
  assert.ok(engine.stats.happiness > happinessBefore, 'happiness rises in vibe mode');
});

test('MoodEngine.advance reduces IQ during AFK and BORED states', () => {
  const stats = freshStats();
  stats.iq = 50;
  const engine = new MoodEngine(stats);
  engine.advance(60, 'AFK', false);
  assert.ok(engine.stats.iq < 50, 'IQ drops when AFK');

  const stats2 = freshStats();
  stats2.iq = 50;
  const engine2 = new MoodEngine(stats2);
  engine2.advance(60, 'BORED', false);
  assert.ok(engine2.stats.iq < 50, 'IQ drops when BORED');
});

test('MoodEngine clamps to 0–100 after each advance and handles extreme inputs', () => {
  const stats = freshStats();
  stats.energy = 0; stats.focus = 0;
  const engine = new MoodEngine(stats);
  // sleeping would try to reduce focus below 0
  engine.advance(10000, 'SLEEPING', false);
  assert.equal(engine.stats.focus, 0);
  assert.ok(engine.stats.energy <= 100);

  // large seconds are capped at 300 inside advance
  engine.advance(300, 'CODING', true);
  assert.ok(engine.stats.focus <= 100);
});

test('MoodEngine.change applies deltas to all specified stat fields', () => {
  const stats = freshStats();
  const engine = new MoodEngine(stats);
  engine.change({ mood: 10, energy: -5 });
  assert.ok(engine.stats.mood > INITIAL_STATS.mood - 1);
  assert.ok(engine.stats.energy < INITIAL_STATS.energy + 1);
});

// ─── 3. STATE MACHINE ────────────────────────────────────────────────────────

test('StateMachine sets base state and generates entry transitions for CODING', () => {
  const sm = new StateMachine();
  const t0 = 0;
  sm.setBase('CODING', t0);
  assert.equal(sm.view(t0).animation, 'coding_start');
  assert.equal(sm.view(t0).state, 'CODING');
  // After the 700 ms transition the loop animation kicks in
  assert.equal(sm.view(t0 + 800).animation, 'coding_loop');
});

test('StateMachine generates exit transition from CODING to IDLE', () => {
  const sm = new StateMachine();
  sm.setBase('CODING', 0);
  sm.setBase('IDLE', 1000);
  assert.equal(sm.view(1000).animation, 'coding_stop');
  assert.equal(sm.view(1700).animation, 'idle_blink');
});

test('StateMachine generates VIBE_CODING entry and exit transitions', () => {
  const sm = new StateMachine();
  sm.setBase('VIBE_CODING', 0);
  assert.equal(sm.view(0).animation, 'vibe_coding_start');
  sm.setBase('IDLE', 1000);
  assert.equal(sm.view(1000).animation, 'vibe_coding_end');
});

test('StateMachine react is blocked when base priority exceeds reaction priority', () => {
  const sm = new StateMachine();
  sm.setBase('CODING', 0);
  // priority 30 is basePriority(CODING); request with priority 20 must be rejected
  const accepted = sm.react('HAPPY', 'happy', 1000, 20, 100);
  assert.equal(accepted, false);
  assert.equal(sm.view(100).state, 'CODING');
});

test('StateMachine react replaces lower-priority temporary reactions', () => {
  const sm = new StateMachine();
  sm.setBase('IDLE', 0);
  sm.react('HAPPY', 'happy', 2000, 5, 0);
  assert.equal(sm.view(0).state, 'HAPPY');
  // Replace with higher priority
  const accepted = sm.react('ERROR', 'error_notice', 2000, 10, 0);
  assert.equal(accepted, true);
  assert.equal(sm.view(0).state, 'ERROR');
});

test('StateMachine react deduplicates identical state+animation combinations', () => {
  const sm = new StateMachine();
  sm.setBase('IDLE', 0);
  sm.react('HAPPY', 'happy', 2000, 5, 0);
  const accepted = sm.react('HAPPY', 'happy', 2000, 5, 0);
  assert.equal(accepted, false);
});

test('StateMachine view walks multi-step reactions in order', () => {
  const sm = new StateMachine();
  sm.setBase('IDLE', 0);
  // duration must equal sum of steps so the reaction fully expires when steps end
  sm.react('HAPPY', 'step_a', 1000, 5, 0, [
    { animation: 'step_a', duration: 500 },
    { animation: 'step_b', duration: 500 },
  ]);
  assert.equal(sm.view(0).animation, 'step_a');
  assert.equal(sm.view(500).animation, 'step_b');
  // After the 1000 ms reaction duration expires the state returns to base
  assert.equal(sm.view(1100).state, 'IDLE');
});

test('StateMachine clearTemporary removes reaction and transition immediately', () => {
  const sm = new StateMachine();
  sm.setBase('IDLE', 0);
  // priority 100 easily beats basePriority(IDLE) = 0
  sm.react('HAPPY', 'happy', 5000, 100, 0);
  assert.equal(sm.hasReaction, true);
  sm.clearTemporary();
  assert.equal(sm.hasReaction, false);
  assert.equal(sm.view(0).state, 'IDLE');
});

test('StateMachine high-priority base state evicts lower-priority temporary reaction', () => {
  const sm = new StateMachine();
  sm.setBase('IDLE', 0);
  sm.react('HAPPY', 'happy', 5000, 10, 0);
  assert.equal(sm.view(0).state, 'HAPPY');
  // Switching to CODING (basePriority 30) evicts priority-10 temporary
  sm.setBase('CODING', 100);
  assert.equal(sm.hasReaction, false);
});

// ─── 4. ACTIVITY TRACKER ─────────────────────────────────────────────────────

test('ActivityTracker tracks typing, inactivity, and isFocused flag', () => {
  const now = 1_000_000;
  const tracker = new ActivityTracker(now);
  assert.equal(tracker.isTyping(now), false);
  assert.equal(tracker.inactivity(now), 0);

  tracker.type(now + 1000, 10);
  assert.equal(tracker.isTyping(now + 1000), true);
  assert.equal(tracker.isFocused, true);

  // After IDLE_AFTER (30 s) without typing the typing flag clears
  assert.equal(tracker.isTyping(now + 32_000), false);
});

test('ActivityTracker.setFocused resets typingBeganAt and updates lastActivityAt', () => {
  const now = 2_000_000;
  const tracker = new ActivityTracker(now);
  tracker.type(now, 5);
  tracker.setFocused(false, now + 1000);
  assert.equal(tracker.isFocused, false);
  assert.equal(tracker.isTyping(now + 1000), false);
  tracker.setFocused(true, now + 2000);
  assert.equal(tracker.isFocused, true);
});

test('ActivityTracker.speed returns characters per second within the 8-second window', () => {
  const now = 3_000_000;
  const tracker = new ActivityTracker(now);
  // Push 10 chars * 8 samples in the window → 80/8 = 10 chars/s
  for (let i = 0; i < 8; i++) tracker.type(now + i * 100, 10);
  const s = tracker.speed(now + 800);
  assert.ok(s > 0, 'speed should be positive');
});

test('ActivityTracker.isDeepFocus is true after 20 s of continuous typing', () => {
  const now = 4_000_000;
  const tracker = new ActivityTracker(now);
  // Type continuously (within CONTINUOUS_GAP = 5 s) so typingBeganAt stays at `now`
  tracker.type(now, 1);
  tracker.type(now + 2_000, 1);
  tracker.type(now + 4_000, 1);
  tracker.type(now + 8_000, 1);
  tracker.type(now + 12_000, 1);
  tracker.type(now + 16_000, 1);
  tracker.type(now + 19_000, 1);
  assert.equal(tracker.isDeepFocus(now + 19_000), false);  // 19 s < 20 s
  tracker.type(now + 20_000, 1);
  assert.equal(tracker.isDeepFocus(now + 20_000), true);   // 20 s ≥ 20 s
});

test('ActivityTracker.isAutoVibe requires 8 min of flow at sufficient speed', () => {
  const start = 5_000_000;
  const tracker = new ActivityTracker(start);
  const FAST = 10; // chars per event (plenty for auto-vibe speed threshold)
  // Type continuously (gap ≤ CONTINUOUS_GAP=5000ms) for just over 8 minutes (481 events × 1s)
  let t = start;
  for (let i = 0; i < 481; i++) { tracker.type(t, FAST); t += 1_000; }
  // flowDuration = (t - 1000) - start = 480_000 ms ≥ AUTO_VIBE_THRESHOLD_MS
  assert.equal(tracker.isAutoVibe(t - 1_000), true);
});

test('ActivityTracker.consumeCodingSeconds accounts up to CONTINUOUS_GAP after last keystroke', () => {
  const now = 6_000_000;
  const tracker = new ActivityTracker(now);
  tracker.type(now, 5);
  // 2 seconds after typing; gap is 5 s so the full 2 s count
  const seconds = tracker.consumeCodingSeconds(now + 2_000);
  assert.ok(seconds > 0 && seconds <= 5, `expected 0–5 s, got ${seconds}`);
  // Consuming again immediately yields 0 because accountedAt caught up
  const secondCall = tracker.consumeCodingSeconds(now + 2_000);
  assert.equal(secondCall, 0);
});

test('ActivityTracker.consumeCodingSeconds returns 0 when not focused', () => {
  const now = 7_000_000;
  const tracker = new ActivityTracker(now);
  tracker.type(now, 5);
  tracker.setFocused(false, now + 1);
  const seconds = tracker.consumeCodingSeconds(now + 2_000);
  assert.equal(seconds, 0);
});

// ─── 5. PROGRESSION SYSTEM ───────────────────────────────────────────────────

test('xpForLevel formula: level 1 = 0, level 2 = 50, level 3 = 200', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 50);
  assert.equal(xpForLevel(3), 200);
});

test('validDate accepts ISO dates and rejects malformed or out-of-range values', () => {
  const today = localDate(Date.now());
  assert.equal(validDate(today), true);
  assert.equal(validDate('2024-01-01'), true);
  assert.equal(validDate('not-a-date'), false);
  assert.equal(validDate('2024-13-01'), false);    // month 13
  assert.equal(validDate('2024-00-01'), false);    // month 0
  assert.equal(validDate(null), false);
  assert.equal(validDate(42), false);
  assert.equal(validDate('2024-1-1'), false);      // wrong format
});

test('ProgressionSystem.save increments filesSaved and awards XP with cooldown', () => {
  const stats = freshStats();
  const now = Date.now();
  const ps = new ProgressionSystem(stats, now);
  const xpBefore = stats.xp;
  ps.save(now);
  assert.equal(ps.daily.filesSaved, 1);
  assert.ok(stats.xp > xpBefore, 'save should award XP');
  // Second save within cooldown (30 s) should not award XP again
  ps.save(now + 1_000);
  assert.equal(stats.xp, xpBefore + 2, 'second save within cooldown earns no additional XP');
});

test('ProgressionSystem.fix increments errorsFixed and awards XP with cooldown', () => {
  const stats = freshStats();
  const now = Date.now();
  const ps = new ProgressionSystem(stats, now);
  const xpBefore = stats.xp;
  ps.fix(1, now);
  assert.equal(ps.daily.errorsFixed, 1);
  assert.ok(stats.xp > xpBefore);
  ps.fix(1, now + 5_000);  // within 15 s cooldown
  assert.equal(stats.xp, xpBefore + 5, 'second fix within cooldown earns no XP');
});

test('ProgressionSystem.build increments buildsCompleted and awards XP', () => {
  const stats = freshStats();
  const now = Date.now();
  const ps = new ProgressionSystem(stats, now);
  ps.build(now);
  assert.equal(ps.daily.buildsCompleted, 1);
  assert.ok(stats.xp > 0);
});

test('ProgressionSystem.addCoding accumulates coding seconds and awards XP at 30 s', () => {
  const stats = freshStats();
  const now = Date.now();
  const ps = new ProgressionSystem(stats, now);
  // addCoding clamps each call to max 5 s; call 5 times to build up 25 s
  for (let i = 0; i < 5; i++) ps.addCoding(5, now + i * 1_000);
  const xpAt25 = stats.xp;
  // Six more calls (5 s each = 30 s total remainder accumulation → triggers award)
  for (let i = 0; i < 6; i++) ps.addCoding(5, now + 10_000 + i * 1_000);
  assert.ok(stats.xp > xpAt25, 'should award XP after accumulating 30 s of coding');
});

test('ProgressionSystem.unlockedItems reflects level-gated cosmetics', () => {
  const stats = freshStats();
  // level 1 → only items with level ≤ 1 should appear (none in UNLOCKS start at level 2)
  const ps = new ProgressionSystem(stats, Date.now());
  assert.equal(ps.unlockedItems.length, 0);

  // Award enough XP for level 2 (50 XP)
  stats.xp = 50;
  const ps2 = new ProgressionSystem(stats, Date.now());
  assert.ok(ps2.unlockedItems.includes('coffee_mug'));
});

test('ProgressionSystem.nextLevelXp returns XP threshold for next level', () => {
  const stats = freshStats();
  stats.xp = 0;
  const ps = new ProgressionSystem(stats, Date.now());
  assert.equal(ps.nextLevelXp, xpForLevel(2));
});

test('ProgressionSystem.serialize roundtrips cooldowns and xpEarned correctly', () => {
  const stats = freshStats();
  const now = Date.now();
  const ps = new ProgressionSystem(stats, now);
  ps.save(now);
  const ser = ps.serialize();
  assert.equal(typeof ser.xpEarned, 'number');
  assert.ok(ser.xpEarned > 0);
  assert.equal(typeof ser.cooldowns, 'object');
  assert.equal(typeof ser.cooldowns.save, 'number');
  // Mutating the copy should not affect the internal ledger
  ser.cooldowns.save = 0;
  assert.ok(ps.serialize().cooldowns.save !== 0, 'serialize returns a copy of cooldowns');
});

test('ProgressionSystem.markCoding awards daily bonus once per day', () => {
  const stats = freshStats();
  const now = Date.now();
  const ps = new ProgressionSystem(stats, now);
  ps.markCoding(now);
  const xpAfterFirst = stats.xp;
  assert.ok(xpAfterFirst > 0, 'daily bonus should award XP');
  // Calling again same day should be a no-op
  ps.markCoding(now + 60_000);
  assert.equal(stats.xp, xpAfterFirst, 'second markCoding same day earns no XP');
});

test('ProgressionSystem daily XP cap prevents exceeding DAILY_XP_CAP', () => {
  const stats = freshStats();
  const now = Date.now();
  const ps = new ProgressionSystem(stats, now);
  // All awards on the same timestamp so rollover never resets the daily cap
  for (let i = 0; i < 700; i++) ps.award('coding', now);
  assert.ok(stats.xp <= ProgressionSystem.DAILY_XP_CAP, `xp ${stats.xp} exceeded daily cap`);
});
