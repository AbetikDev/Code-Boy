import test from 'node:test';
import assert from 'node:assert/strict';
import { CodeBoyEngine } from '../src/core/CodeBoyEngine';
import { ActivityTracker } from '../src/core/ActivityTracker';
import { StateMachine } from '../src/core/StateMachine';
import { getLanguageProfile, LANGUAGE_PROFILES } from '../src/core/LanguageProfiles';
import { INITIAL_STATS, MoodEngine } from '../src/core/MoodEngine';
import { emptyDaily, localDate, ProgressionSystem, xpForLevel } from '../src/core/ProgressionSystem';
import { DEFAULT_SETTINGS, SavedState, Settings } from '../src/models/types';

function setup(settings: Partial<Settings> = {}, saved?: unknown, development = false) {
  let now = new Date(2026, 8, 25, 12).getTime();
  const engine = new CodeBoyEngine(saved, { ...DEFAULT_SETTINGS, ...settings }, { now: () => now, random: () => 0.5, development });
  return { engine, now: () => now, advance: (milliseconds: number) => { now += milliseconds; engine.tick(); },
    jump: (milliseconds: number) => { now += milliseconds; } };
}

function savedAt(now: number, xp = 0): SavedState {
  return { version: 1, stats: { ...INITIAL_STATS, xp }, daily: emptyDaily(localDate(now)),
    unlockedItems: [], room: 'DEFAULT', streak: 0, lastCodingDate: '', savedAt: now, deepFocusSessions: 0 };
}

test('coding transitions do not restart for every keystroke, and idle starts at 30 seconds', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'typing', characters: 1, languageId: 'typescript' });
  assert.equal(engine.snapshot().animation, 'coding_start');
  advance(700);
  assert.equal(engine.snapshot().animation, 'coding_loop');
  engine.handle({ type: 'typing', characters: 1, languageId: 'typescript' });
  assert.equal(engine.snapshot().animation, 'coding_loop');
  advance(29_999);
  assert.equal(engine.snapshot().state, 'CODING');
  advance(1);
  assert.equal(engine.snapshot().state, 'IDLE');
  assert.equal(engine.snapshot().animation, 'coding_stop');
  advance(600);
  assert.match(engine.snapshot().animation, /^idle_/);
});

test('five and fifteen minute boundaries select bored and sleeping states', () => {
  const { engine, advance } = setup();
  advance(299_999); assert.equal(engine.snapshot().state, 'IDLE');
  advance(1); assert.equal(engine.snapshot().state, 'BORED');
  advance(599_999); assert.equal(engine.snapshot().state, 'BORED');
  advance(1); assert.equal(engine.snapshot().state, 'SLEEPING');
  engine.handle({ type: 'typing', characters: 2, languageId: 'rust' });
  assert.equal(engine.snapshot().state, 'CODING');
});

test('continuous focus requires twenty seconds and resets on a typing gap', () => {
  const activity = new ActivityTracker(0);
  activity.type(0, 1);
  for (let now = 4_000; now <= 20_000; now += 4_000) { activity.consumeCodingSeconds(now); activity.type(now, 1); }
  assert.equal(activity.isDeepFocus(20_000), true);
  activity.type(26_000, 1);
  assert.equal(activity.isDeepFocus(26_000), false);
  activity.setFocused(false, 26_000);
  assert.equal(activity.isTyping(26_000), false);
});

test('typing speed selects fast animation without accumulating unbounded samples', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'typing', characters: 100, languageId: 'python' });
  advance(800); assert.equal(engine.snapshot().animation, 'coding_fast');
  advance(8_000); assert.equal(engine.snapshot().animation, 'coding_loop');
});

test('temporary reactions restore the current base including activity received during them', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'taskEnd', kind: 'build', success: true });
  assert.equal(engine.snapshot().state, 'CELEBRATING');
  engine.handle({ type: 'typing', characters: 1, languageId: 'cpp' });
  assert.equal(engine.snapshot().state, 'CELEBRATING');
  advance(4_000); assert.equal(engine.snapshot().state, 'CODING');
});

test('critical reactions have priority over user interaction and redundant requests do not restart', () => {
  const machine = new StateMachine();
  assert.equal(machine.react('ERROR', 'error_notice', 3_000, 60, 0), true);
  assert.equal(machine.react('DANCING', 'dance_01', 6_000, 50, 100), false);
  assert.equal(machine.react('ERROR', 'error_notice', 3_000, 60, 2_000), false);
  assert.equal(machine.view(3_000).state, 'IDLE');
});

test('pet sequence completes and repeated clicks cannot farm happiness', () => {
  const { engine, advance } = setup();
  engine.action('pet');
  const happiness = engine.snapshot().stats.happiness;
  assert.equal(engine.snapshot().animation, 'pet_start');
  engine.action('pet'); assert.equal(engine.snapshot().stats.happiness, happiness);
  advance(600); assert.equal(engine.snapshot().animation, 'pet_loop');
  advance(1_200); assert.equal(engine.snapshot().animation, 'pet_happy');
  advance(1_200); assert.equal(engine.snapshot().animation, 'pet_end');
  advance(600); assert.equal(engine.snapshot().state, 'IDLE');
});

test('manual music survives provider polling, and music plus typing enters vibe coding', () => {
  const { engine, advance } = setup();
  engine.action('music');
  assert.equal(engine.snapshot().state, 'LISTENING_MUSIC');
  engine.setMusic(false, 'No active media session');
  assert.equal(engine.snapshot().musicPlaying, true);
  engine.handle({ type: 'typing', characters: 2, languageId: 'typescript' });
  assert.equal(engine.snapshot().state, 'VIBE_CODING');
  advance(800); assert.equal(engine.snapshot().animation, 'vibe_coding_loop');
  engine.action('music');
  assert.equal(engine.snapshot().musicPlaying, false);
  assert.equal(engine.snapshot().state, 'CODING');
});

test('manual sleep wins over music and diagnostics until wake or typing', () => {
  const { engine } = setup();
  engine.setMusic(true, 'Playing'); engine.action('sleep');
  assert.equal(engine.snapshot().state, 'SLEEPING');
  engine.handle({ type: 'diagnostics', errors: 20, previousErrors: 0 });
  assert.equal(engine.snapshot().state, 'SLEEPING');
  engine.action('wake'); assert.equal(engine.snapshot().state, 'LISTENING_MUSIC');
});

test('disabling reactions suppresses automatic reactions and speech while preserving progression', () => {
  const { engine } = setup({ reactions: false });
  engine.handle({ type: 'save', languageId: 'c' });
  engine.handle({ type: 'taskEnd', success: true, kind: 'build' });
  assert.equal(engine.snapshot().state, 'IDLE');
  assert.equal(engine.snapshot().bubble, '');
  assert.equal(engine.snapshot().daily.filesSaved, 1);
  assert.equal(engine.snapshot().daily.buildsCompleted, 1);
});

test('diagnostic reactions are throttled and can be independently disabled', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'diagnostics', errors: 5, previousErrors: 0 });
  assert.equal(engine.snapshot().state, 'CONFUSED');
  advance(3_000);
  engine.handle({ type: 'diagnostics', errors: 6, previousErrors: 5 });
  assert.equal(engine.snapshot().state, 'IDLE');
  engine.updateSettings({ ...DEFAULT_SETTINGS, showDiagnosticsReaction: false });
  advance(8_000);
  engine.handle({ type: 'diagnostics', errors: 20, previousErrors: 6 });
  assert.equal(engine.snapshot().state, 'IDLE');
  engine.handle({ type: 'diagnostics', errors: 0, previousErrors: 20 });
  assert.equal(engine.snapshot().daily.errorsFixed, 20);
});

test('disabled companion does not track, change stats, or emit interaction reactions', () => {
  const { engine, advance } = setup({ enabled: false });
  const before = engine.snapshot().stats;
  engine.handle({ type: 'typing', characters: 4, languageId: 'rust' });
  engine.handle({ type: 'save', languageId: 'rust' });
  engine.action('pet'); advance(60_000);
  assert.deepEqual(engine.snapshot().stats, before);
  assert.equal(engine.snapshot().daily.filesSaved, 0);
  assert.equal(engine.snapshot().state, 'IDLE');
  engine.updateSettings({ ...DEFAULT_SETTINGS });
  engine.handle({ type: 'typing', characters: 1, languageId: 'rust' });
  assert.equal(engine.snapshot().state, 'CODING');
});

test('reduced motion and idle toggle select stable still poses', () => {
  const { engine, advance } = setup({ reducedMotion: true });
  engine.handle({ type: 'typing', characters: 1, languageId: 'go' });
  assert.equal(engine.snapshot().animation, 'coding_loop');
  advance(31_000); assert.equal(engine.snapshot().animation, 'idle_blink');
  engine.updateSettings({ ...DEFAULT_SETTINGS, idleAnimations: false });
  advance(20_000); assert.equal(engine.snapshot().animation, 'idle_blink');
});

test('saved state is repaired, sensitive unknown fields dropped, and level derived from XP', () => {
  const fixture = { ...savedAt(new Date(2026, 8, 25, 12).getTime(), 200),
    stats: { mood: -200, energy: 600, focus: NaN, boredom: Infinity, happiness: 80, xp: 200, level: 9999 },
    room: 'SPACE', streak: -8, lastCodingDate: 'tomorrow', unlockedItems: ['fake'], fileName: 'private.ts',
    daily: { date: 'not-a-date', filesSaved: -5, codingSeconds: Infinity, errorsFixed: 0, buildsCompleted: NaN } };
  const { engine } = setup({}, fixture);
  const snapshot = engine.snapshot();
  assert.equal(snapshot.stats.mood, 0); assert.equal(snapshot.stats.energy, 100);
  assert.equal(snapshot.stats.focus, 0); assert.equal(snapshot.stats.level, 3);
  assert.deepEqual(snapshot.unlockedItems, ['coffee_mug', 'poster']);
  assert.equal(snapshot.room, 'DEFAULT'); assert.equal(snapshot.streak, 0);
  assert.equal(snapshot.daily.filesSaved, 0);
  assert.equal(JSON.stringify(engine.serialize()).includes('private.ts'), false);
});

test('save XP cooldown persists across extension reloads', () => {
  const { engine, now } = setup();
  engine.handle({ type: 'save', languageId: 'typescript' });
  const xp = engine.snapshot().stats.xp;
  const restored = new CodeBoyEngine(engine.serialize(), DEFAULT_SETTINGS, { now });
  restored.handle({ type: 'save', languageId: 'typescript' });
  assert.equal(restored.snapshot().stats.xp, xp);
  assert.equal(restored.snapshot().daily.filesSaved, 2);
});

test('daily XP cap persists and resets on the next local day', () => {
  let now = new Date(2026, 8, 25, 12).getTime();
  const fixture = savedAt(now, 1_195);
  fixture.progression = { date: localDate(now), xpEarned: 1_195, cooldowns: {}, codingRemainder: 0 };
  const stats = { ...fixture.stats };
  const progression = new ProgressionSystem(stats, now, fixture);
  assert.equal(progression.award('build', now), 5);
  assert.equal(progression.award('save', now), 0);
  assert.equal(stats.xp, 1_200);
  now = new Date(2026, 8, 26, 12).getTime();
  assert.equal(progression.award('build', now), 15);
  assert.equal(stats.xp, 1_215);
});

test('local daily streak only advances with typing, and resets after a missed day', () => {
  const { engine, jump } = setup();
  engine.handle({ type: 'typing', characters: 1, languageId: 'c' });
  assert.equal(engine.snapshot().streak, 1);
  engine.handle({ type: 'typing', characters: 1, languageId: 'c' });
  assert.equal(engine.snapshot().streak, 1);
  jump(24 * 60 * 60_000);
  engine.handle({ type: 'typing', characters: 1, languageId: 'c' });
  assert.equal(engine.snapshot().streak, 2);
  jump(2 * 24 * 60 * 60_000);
  engine.handle({ type: 'typing', characters: 1, languageId: 'c' });
  assert.equal(engine.snapshot().streak, 1);
  assert.equal(engine.snapshot().daily.filesSaved, 0);
});

test('a single key followed by AFK cannot earn continued coding XP', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'typing', characters: 1, languageId: 'python' });
  const xp = engine.snapshot().stats.xp;
  advance(3_600_000);
  assert.equal(engine.snapshot().daily.codingSeconds, 5);
  assert.equal(engine.snapshot().stats.xp, xp);
});

test('coding sessions accumulate actual active time and award XP at thirty seconds', () => {
  const { engine, advance } = setup();
  for (let i = 0; i < 6; i++) {
    engine.handle({ type: 'typing', characters: 1, languageId: 'python' }); advance(5_000);
  }
  assert.equal(engine.snapshot().daily.codingSeconds, 30);
  assert.equal(engine.snapshot().stats.xp, 17);
});

test('focus loss stops coding time and transitions to AFK', () => {
  const { engine, advance } = setup();
  engine.handle({ type: 'typing', characters: 1, languageId: 'python' });
  advance(1_000);
  engine.handle({ type: 'focus', focused: false });
  advance(30_000);
  assert.equal(engine.snapshot().daily.codingSeconds, 1);
  assert.equal(engine.snapshot().state, 'AFK');
});

test('all requested languages have profiles and unknown languages use a generic fallback', () => {
  assert.equal(Object.keys(LANGUAGE_PROFILES).length, 27);
  for (const id of ['cpp', 'csharp', 'kotlin', 'javascriptreact', 'typescriptreact', 'shellscript', 'powershell', 'scss', 'yaml']) {
    assert.equal(getLanguageProfile(id).id, id);
  }
  assert.equal(getLanguageProfile('private-language-name').id, 'plaintext');
  const profile = getLanguageProfile('typescript'); profile.reactions.push('mutated');
  assert.equal(getLanguageProfile('typescript').reactions.includes('mutated'), false);
});

test('room unlocks cannot be bypassed by persisted state or settings', () => {
  const { engine } = setup({ roomTheme: 'SPACE' });
  assert.equal(engine.snapshot().room, 'DEFAULT');
  engine.setRoom('CYBER'); assert.equal(engine.snapshot().room, 'DEFAULT');
  engine.setRoom('NIGHT'); assert.equal(engine.snapshot().room, 'NIGHT');
  const now = new Date(2026, 8, 25, 12).getTime();
  const advanced = setup({}, savedAt(now, xpForLevel(20))).engine;
  advanced.setRoom('SPACE'); assert.equal(advanced.snapshot().room, 'SPACE');
  assert.equal(advanced.snapshot().settings.roomTheme, 'SPACE');
  advanced.reset(); assert.equal(advanced.snapshot().room, 'DEFAULT');
});

test('stats remain bounded across very long sessions and corrupted debug values', () => {
  const mood = new MoodEngine({ ...INITIAL_STATS });
  mood.advance(1e12, 'CODING', true);
  mood.change({ mood: -1e10, energy: 1e10, boredom: -1e10 });
  assert.equal(mood.stats.mood, 0); assert.equal(mood.stats.energy, 100); assert.equal(mood.stats.boredom, 0);
  const { engine } = setup({}, undefined, true);
  engine.debug({ mood: NaN, energy: Infinity, fps: 999 });
  assert.equal(Number.isFinite(engine.snapshot().stats.mood), true);
  assert.equal(engine.snapshot().stats.energy, 0);
  assert.equal(engine.snapshot().settings.animationSpeed, 2);
});

test('development controls are rejected in production and snapshots are isolated', () => {
  const { engine } = setup();
  engine.debug({ state: 'ERROR', mood: 0 });
  assert.equal(engine.snapshot().state, 'IDLE');
  const snapshot = engine.snapshot(); snapshot.stats.xp = 999; snapshot.settings.enabled = false; snapshot.daily.filesSaved = 99;
  assert.equal(engine.snapshot().stats.xp, 0); assert.equal(engine.snapshot().settings.enabled, true);
  assert.equal(engine.snapshot().daily.filesSaved, 0);
});

test('disposal and listener handles stop notifications without leaking timers', () => {
  const { engine, advance } = setup();
  let notifications = 0;
  const listener = engine.onChange(() => notifications++);
  engine.action('pet'); assert.equal(notifications, 1);
  listener.dispose(); advance(500); assert.equal(notifications, 1);
  engine.onChange(() => notifications++); engine.dispose();
  engine.action('dance'); engine.handle({ type: 'save', languageId: 'c' }); advance(1_000);
  assert.equal(notifications, 1); assert.equal(engine.snapshot().daily.filesSaved, 0);
});

test('cancelled tasks release thinking state without earning XP or recording builds', () => {
  const { engine } = setup();
  engine.handle({ type: 'taskStart', kind: 'build' });
  assert.equal(engine.snapshot().state, 'THINKING');
  engine.handle({ type: 'taskCancel' });
  assert.equal(engine.snapshot().state, 'IDLE');
  assert.equal(engine.snapshot().stats.xp, 0);
  assert.equal(engine.snapshot().daily.buildsCompleted, 0);
});

test('single clicks never interrupt coding and typing interrupts a low priority look', () => {
  const { engine, advance } = setup();
  engine.action('look');
  engine.handle({ type: 'typing', characters: 1, languageId: 'rust' });
  assert.equal(engine.snapshot().state, 'CODING');
  advance(2_000); engine.action('look');
  assert.equal(engine.snapshot().state, 'CODING');
});

test('a level increase celebrates once and announces the cosmetic unlock level', () => {
  const now = new Date(2026, 8, 25, 12).getTime();
  const { engine, advance } = setup({}, savedAt(now, 49));
  engine.handle({ type: 'save', languageId: 'typescript' });
  assert.equal(engine.snapshot().stats.level, 2);
  assert.equal(engine.snapshot().state, 'CELEBRATING');
  assert.equal(engine.snapshot().bubble, 'level 2!');
  assert.equal(engine.snapshot().unlockedItems.includes('coffee_mug'), true);
  advance(4_500); assert.equal(engine.snapshot().state, 'IDLE');
  engine.tick(); assert.equal(engine.snapshot().state, 'IDLE');
});

test('a suspended host catches up through sleep and recovers energy without farming XP', () => {
  const now = new Date(2026, 8, 25, 12).getTime();
  const fixture = savedAt(now); fixture.stats.energy = 20;
  const { engine, advance } = setup({}, fixture);
  engine.handle({ type: 'typing', characters: 1, languageId: 'go' });
  advance(3_600_000);
  assert.equal(engine.snapshot().state, 'SLEEPING');
  assert.equal(engine.snapshot().daily.codingSeconds, 5);
  assert.ok(engine.snapshot().stats.energy > 50);
});

test('typing time across midnight is attributed only to its actual local date', () => {
  let now = new Date(2026, 8, 25, 23, 59, 58).getTime();
  const engine = new CodeBoyEngine(undefined, DEFAULT_SETTINGS, { now: () => now });
  engine.handle({ type: 'typing', characters: 1, languageId: 'go' });
  now += 5_000; engine.tick();
  assert.equal(engine.snapshot().daily.date, '2026-09-26');
  assert.equal(engine.snapshot().daily.codingSeconds, 3);
  now += 24 * 60 * 60_000; engine.tick();
  assert.equal(engine.snapshot().daily.codingSeconds, 0);
});

test('reset clears runtime modes and the room alongside all saved character progression', () => {
  const { engine } = setup();
  engine.action('music'); engine.action('vibe'); engine.setRoom('NIGHT');
  engine.handle({ type: 'taskStart', kind: 'build' });
  engine.handle({ type: 'debug', active: true });
  engine.reset();
  assert.equal(engine.snapshot().state, 'IDLE');
  assert.equal(engine.snapshot().musicPlaying, false);
  assert.equal(engine.snapshot().settings.vibeMode, false);
  assert.equal(engine.snapshot().room, 'DEFAULT');
  assert.equal(engine.snapshot().stats.xp, 0);
});
