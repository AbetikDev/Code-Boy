import { Action, ActivityEvent, CHARACTER_STATES, CharacterState, DEFAULT_SETTINGS, ROOM_THEMES, RoomTheme, SavedState, Settings, Snapshot, Stats } from '../models/types';
import { ActivityTracker } from './ActivityTracker';
import { getLanguageProfile } from './LanguageProfiles';
import { clamp, INITIAL_STATS, MoodEngine } from './MoodEngine';
import { emptyDaily, localDate, ProgressionSystem, validDate } from './ProgressionSystem';
import { StateMachine } from './StateMachine';
import { DeveloperStateEngine } from '../intelligence/DeveloperStateEngine';
import type { CodingBehaviorSnapshot, CodingEditSample, DeveloperStateSnapshot, QualitySignals, QualitySnapshot } from '../intelligence/types';

interface EngineOptions { now?: () => number; random?: () => number; development?: boolean; hasWorkspace?: boolean }
type BubbleKind = Snapshot['bubbleKind'];
export const ROOM_LEVELS: Readonly<Record<RoomTheme, number>> = { DEFAULT: 1, NIGHT: 1, RETRO_PC: 3, FOREST: 7, CYBER: 10, SPACE: 20 };
const idleAnimations = [
  { animation: 'idle_blink', weight: 16 }, { animation: 'idle_look_left', weight: 12 },
  { animation: 'idle_look_right', weight: 12 }, { animation: 'idle_stretch', weight: 8 },
  { animation: 'idle_yawn', weight: 8 }, { animation: 'idle_check_phone', weight: 5 },
  { animation: 'idle_drink_coffee', weight: 5 }, { animation: 'idle_fix_headphones', weight: 7 },
  { animation: 'idle_keyboard_clean', weight: 5 }, { animation: 'idle_spin_chair', weight: 2 },
  { animation: 'idle_sleepy', weight: 7 }, { animation: 'idle_watch_window', weight: 8 },
  { animation: 'idle_play_game', weight: 2 }, { animation: 'idle_read', weight: 4 },
  { animation: 'idle_small_dance', weight: 3 }, { animation: 'idle_thinking', weight: 7 },
  { animation: 'idle_bug_hunt', weight: 0.5 }, { animation: 'idle_snack', weight: 3 },
];
const safeNumber = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function settingsFrom(input: Settings): Settings {
  const result = { ...DEFAULT_SETTINGS };
  for (const key of ['enabled', 'soundEnabled', 'musicDetection', 'animations', 'reactions', 'idleAnimations', 'showDiagnosticsReaction', 'vibeMode', 'reducedMotion', 'floatingOverlay'] as const) {
    if (typeof input[key] === 'boolean') { result[key] = input[key]; }
  }
  if (ROOM_THEMES.includes(input.roomTheme)) { result.roomTheme = input.roomTheme; }
  result.animationSpeed = safeNumber(input.animationSpeed, 1, 0.25, 2);
  return result;
}

/** Repair old/corrupted local state and discard unknown fields. XP is the level authority. */
function restore(value: unknown, now: number): SavedState | undefined {
  const data = record(value);
  if (data.version !== 1 && data.version !== 2) { return undefined; }
  const rawStats = record(data.stats);
  const stats = { ...INITIAL_STATS };
  for (const key of ['mood', 'energy', 'focus', 'boredom', 'happiness'] as const) { stats[key] = safeNumber(rawStats[key], INITIAL_STATS[key], 0, 100); }
  stats.craft = data.version === 2 ? safeNumber(rawStats.craft, 0, 0, 100) : 0;
  stats.xp = Math.floor(safeNumber(rawStats.xp, 0, 0, 10_000_000));
  const rawDaily = record(data.daily);
  const daily = emptyDaily(validDate(rawDaily.date) ? rawDaily.date : localDate(now));
  daily.codingSeconds = safeNumber(rawDaily.codingSeconds, 0, 0, 86_400);
  for (const key of ['filesSaved', 'errorsFixed', 'buildsCompleted'] as const) { daily[key] = Math.floor(safeNumber(rawDaily[key], 0, 0, 1_000_000)); }
  const result: SavedState = {
    version: 2, stats, daily, unlockedItems: [],
    room: ROOM_THEMES.includes(data.room as RoomTheme) ? data.room as RoomTheme : 'DEFAULT',
    streak: Math.floor(safeNumber(data.streak, 0, 0, 36_500)),
    lastCodingDate: validDate(data.lastCodingDate) && data.lastCodingDate <= localDate(now) ? data.lastCodingDate : '',
    savedAt: safeNumber(data.savedAt, now, 0, now),
    deepFocusSessions: Math.floor(safeNumber(data.deepFocusSessions, 0, 0, 100_000)),
  };
  const rawLedger = record(data.progression);
  if (validDate(rawLedger.date)) {
    const rawCooldowns = record(rawLedger.cooldowns);
    const cooldowns: Record<string, number> = {};
    for (const key of ['save', 'build', 'fix', 'thread']) { if (typeof rawCooldowns[key] === 'number') { cooldowns[key] = rawCooldowns[key] as number; } }
    result.progression = { date: rawLedger.date, xpEarned: safeNumber(rawLedger.xpEarned, 0, 0, ProgressionSystem.DAILY_XP_CAP),
      cooldowns, codingRemainder: safeNumber(rawLedger.codingRemainder, 0, 0, 29.999),
      craftEarned: data.version === 2 ? safeNumber(rawLedger.craftEarned, 0, 0, ProgressionSystem.DAILY_CRAFT_CAP) : 0 };
  }
  return result;
}

/** Pure companion domain model: the extension owns timers, VS Code events and persistence. */
export class CodeBoyEngine {
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly development: boolean;
  private settings: Settings;
  private hasWorkspace: boolean;
  private machine = new StateMachine();
  private activity: ActivityTracker;
  private mood: MoodEngine;
  private progression: ProgressionSystem;
  private intelligence = new DeveloperStateEngine();
  private qualitySignals: QualitySignals = { hasProject: false, diagnosticsErrors: 0, diagnosticsWarnings: 0, tests: 'unknown' };
  private language = getLanguageProfile('plaintext');
  private room: RoomTheme;
  private providerMusic = false;
  private manualMusic = false;
  private musicStatus = 'Manual music ready';
  private manualSleep = false;
  private taskCount = 0;
  private debugging = false;
  private failedBuilds = 0;
  private bubble = '';
  private bubbleKind: BubbleKind = 'TOP';
  private bubbleUntil = 0;
  private lastBubbleAt = Number.NEGATIVE_INFINITY;
  private lastTick: number;
  private nextIdleAt: number;
  private idleAnimation = 'idle_blink';
  private cooldowns = new Map<string, number>();
  private listeners = new Set<(snapshot: Snapshot) => void>();
  private disposed = false;
  private lastEmission = '';
  private greetingAt: number | undefined;
  private announcedLevel: number;
  private lastBehaviorMode: CodingBehaviorSnapshot['mode'] = 'idle';
  private lastCodeEditAt = Number.NEGATIVE_INFINITY;
  private lastManualEditAt = Number.NEGATIVE_INFINITY;
  private lastTestAt = Number.NEGATIVE_INFINITY;
  private manualEditCountForCraft = 0;
  private lastCraftFixAt = Number.NEGATIVE_INFINITY;
  private lastAllClearAt = Number.NEGATIVE_INFINITY;
  private currentProjectId: string | undefined;
  private deepFocusSessions = 0;
  private redBlockers = 0;
  private topRedFile = '';

  constructor(saved: unknown, settings: Settings, options: EngineOptions = {}) {
    this.clock = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.development = options.development ?? false;
    this.hasWorkspace = options.hasWorkspace ?? true;
    this.qualitySignals.hasProject = this.hasWorkspace;
    this.settings = settingsFrom(settings);
    const now = this.clock();
    const restored = restore(saved, now);
    this.mood = new MoodEngine(restored?.stats ?? INITIAL_STATS);
    this.progression = new ProgressionSystem(this.mood.stats, now, restored);
    this.announcedLevel = this.mood.stats.level;
    this.deepFocusSessions = restored?.deepFocusSessions ?? 0;
    this.activity = new ActivityTracker(now);
    this.intelligence.updateQuality(this.qualitySignals, now);
    this.lastTick = now;
    this.nextIdleAt = now + 8_000;
    const preferredRoom = this.settings.roomTheme !== 'DEFAULT' ? this.settings.roomTheme : restored?.room ?? 'DEFAULT';
    this.room = this.mood.stats.level >= ROOM_LEVELS[preferredRoom] ? preferredRoom : 'DEFAULT';
    this.settings.roomTheme = this.room;
    if (!restored && this.hasWorkspace) { this.say('hi.', 'TOP', now, true); this.greetingAt = now + 1_300; }
    else if (!this.hasWorkspace) { this.say('open a project?', 'THOUGHT', now, true); }
    this.refresh(now);
  }

  snapshot(): Snapshot {
    const now = this.clock();
    const visible = this.machine.view(now);
    const stats = { ...this.mood.stats };
    for (const key of ['mood', 'energy', 'focus', 'boredom', 'happiness'] as const) { stats[key] = Math.round(stats[key] * 100) / 100; }
    stats.craft = Math.round(stats.craft);
    const codingBehavior = this.intelligence.getCodingBehavior(now);
    const quality = this.intelligence.getQualitySnapshot();
    return {
      ...visible, stats, daily: { ...this.progression.daily, codingSeconds: Math.floor(this.progression.daily.codingSeconds) },
      unlockedItems: this.progression.unlockedItems, room: this.room, streak: this.progression.streak,
      language: { ...this.language, reactions: [...this.language.reactions] }, bubble: now < this.bubbleUntil ? this.bubble : '', bubbleKind: this.bubbleKind,
      musicPlaying: this.musicPlaying, musicStatus: this.manualMusic ? 'Manual music on' : this.musicStatus,
      settings: { ...this.settings }, hasWorkspace: this.hasWorkspace, development: this.development,
      typingSpeed: Math.round(this.activity.speed(now) * 10) / 10, nextLevelXp: this.progression.nextLevelXp,
      flowActive: codingBehavior.mode === 'flow', deepFocusSessions: this.deepFocusSessions + this.activity.deepFocusSessions,
      codingBehavior, quality, developerState: this.intelligence.getDeveloperState(now),
    };
  }

  getCodingBehavior(): CodingBehaviorSnapshot { return this.intelligence.getCodingBehavior(this.clock()); }
  getQualitySnapshot(): QualitySnapshot { return this.intelligence.getQualitySnapshot(); }
  getDeveloperState(): DeveloperStateSnapshot { return this.intelligence.getDeveloperState(this.clock()); }

  onChange(listener: (snapshot: Snapshot) => void): { dispose(): void } {
    if (!this.disposed) { this.listeners.add(listener); }
    return { dispose: () => { this.listeners.delete(listener); } };
  }

  handle(event: ActivityEvent): void {
    if (this.disposed || !this.settings.enabled) { return; }
    const now = this.clock();
    this.advance(now);
    if (event.type === 'focus') {
      this.activity.setFocused(event.focused, now);
    } else if (event.type === 'codingEdit') {
      this.handleCodingEdit(event.sample, event.documentLines, now);
    } else if (event.type === 'codingBehavior') {
      this.reactToCodingBehavior(event, now);
    } else if (event.type === 'typing') {
      this.manualSleep = false;
      this.activity.type(now, event.characters);
      this.progression.markCoding(now);
      this.setLanguage(event.languageId, now);
      if (this.activity.isDeepFocus(now)) { this.say('focus mode.', 'THOUGHT', now); }
    } else if (event.type === 'editor') {
      this.activity.touch(now);
      this.setLanguage(event.languageId, now);
      if (event.documentLines !== undefined) {
        this.qualitySignals.largeFileCount = event.documentLines >= 1_000 ? 1 : 0;
        this.updateQuality(now);
      }
    } else if (event.type === 'save') {
      this.activity.touch(now);
      this.setLanguage(event.languageId, now);
      this.progression.save(now);
      if (this.allow('save', now, 20_000)) { this.react('HAPPY', 'happy', 1_200, 40, now, 'nice.', 'HAPPY'); this.mood.change({ happiness: 0.6 }); }
    } else if (event.type === 'diagnostics') {
      const errors = Math.floor(clamp(event.errors, 0, 100_000));
      const previous = Math.floor(clamp(event.previousErrors, 0, 100_000));
      const difference = errors - previous;
      if (difference < 0) { this.progression.fix(-difference, now); }
      if (difference < 0 && now - this.lastManualEditAt <= 120_000 && this.allow('craftFix', now, 30_000)) {
        this.progression.awardCraft(2, now);
        this.lastCraftFixAt = now;
      }
      this.qualitySignals.diagnosticsErrors = errors;
      this.qualitySignals.diagnosticsWarnings = Math.floor(clamp(event.warnings ?? this.qualitySignals.diagnosticsWarnings, 0, 100_000));
      this.updateQuality(now);
      if (this.settings.showDiagnosticsReaction && difference !== 0 && this.allow('diagnostics', now, 8_000)) {
        if (difference > 0) {
          this.mood.change({ mood: -Math.min(5, difference), happiness: -1 });
          this.react(errors >= 9 ? 'ERROR' : errors >= 4 ? 'CONFUSED' : 'ERROR',
            errors >= 9 ? 'error_panic' : errors >= 4 ? 'error_confused' : 'error_notice', 2_500, 60, now,
            errors >= 9 ? 'what happened here?!' : errors >= 4 ? 'we\'ll fix it.' : 'uh oh', 'WARNING');
        } else {
          this.mood.change({ mood: 2, happiness: 1 });
          this.react(errors === 0 ? 'SUCCESS' : 'HAPPY', errors === 0 ? 'success' : 'happy', 2_500, 60, now,
            errors === 0 ? 'clean.' : 'nice, getting better.', 'HAPPY');
        }
      }
    } else if (event.type === 'projectHealth') {
      this.handleProjectHealth(event, now);
    } else if (event.type === 'taskStart') {
      this.taskCount += 1;
      this.activity.touch(now);
      this.say(event.kind === 'test' ? 'test time.' : 'building...', 'THOUGHT', now);
    } else if (event.type === 'taskEnd') {
      this.taskCount = Math.max(0, this.taskCount - 1);
      this.activity.touch(now);
      if (event.kind === 'build') { this.qualitySignals.buildFailed = !event.success; this.updateQuality(now); }
      if (event.success) {
        this.failedBuilds = 0;
        if (event.kind !== 'task') { this.progression.build(now); }
        if (this.allow(event.kind === 'test' ? 'testOutcome' : 'build', now, 8_000)) {
          this.mood.change({ mood: 4, happiness: 3 });
          this.react('CELEBRATING', this.roll() < 0.02 ? 'dance_05' : 'celebrate', 4_000, 60, now,
            event.kind === 'test' ? 'that\'s green.' : 'we cooked.', 'HAPPY');
        }
      } else {
        this.failedBuilds += 1;
        if (this.allow(event.kind === 'test' ? 'testOutcome' : 'build', now, 8_000)) {
          this.mood.change({ mood: -3, happiness: -1 });
          this.react(this.failedBuilds >= 3 ? 'SAD' : 'CONFUSED', this.failedBuilds >= 3 ? 'sad' : 'error_confused',
            3_500, 60, now, event.kind === 'test' ? 'test broke.' : 'we\'ll fix it.', 'THOUGHT');
        }
      }
    } else if (event.type === 'taskCancel') {
      this.taskCount = Math.max(0, this.taskCount - 1);
    } else if (event.type === 'debug') {
      this.debugging = event.active;
      this.activity.touch(now);
      this.say(event.active ? 'bug hunt.' : 'interesting...', 'THOUGHT', now);
    } else if (event.type === 'terminal') { this.activity.touch(now); }
    else if (event.type === 'threadStatus') {
      const count = Math.max(0, Math.floor(event.blockerCount));
      const previous = this.redBlockers;
      const previousFile = this.topRedFile;
      this.redBlockers = event.hasRedThread ? count : 0;
      this.topRedFile = this.redBlockers > 0 ? event.topThreadFile ?? '' : '';
      this.qualitySignals.redBlockers = this.redBlockers;
      this.updateQuality(now);
      if (event.projectSwitch) this.machine.clearTemporary();
      else if (previous > 0 && this.redBlockers === 0 && this.allow('blockerResolved', now, 8_000)) {
        this.lastAllClearAt = now;
        this.react('SUCCESS', 'success', 3_000, 70, now, 'all clear.', 'HAPPY', true);
      }
      if (this.redBlockers > 0 && (previous === 0 || this.redBlockers > previous || this.topRedFile !== previousFile)) {
        this.mood.change({ mood: -2, happiness: -1 });
        const warning = `⚠️ Blocker in ${event.topThreadFile ?? 'project'}! Ask IBM Bob to fix?`;
        if (this.baseStateAt(now) === 'CONFUSED') this.react('CONFUSED', 'error_confused', 2_500, 10, now,
          warning, 'WARNING', true);
        // Active coding and manual sleep outrank passive blocker concern.
      }
    } else if (event.type === 'sessionWelcome') {
      this.react('HAPPY', 'happy', 2_500, 60, now,
        `Welcome back! Last time: ${event.topic}. ${event.openBlockers > 0 ? `${event.openBlockers} blocker(s) waiting.` : 'Ready to build?'}`, 'TOP', true);
    } else if (event.type === 'threadResolved') {
      this.progression.award('thread', now);
      if (event.topic !== 'Tests' && now - this.lastManualEditAt <= 120_000 && now - this.lastCraftFixAt > 5_000)
        this.progression.awardCraft(2, now);
      if (event.topic !== 'Tests' && now !== this.lastAllClearAt && this.allow('blockerResolved', now, 8_000))
        this.react('CELEBRATING', 'celebrate', 4_000, 70, now, 'blocker crushed!', 'HAPPY', true);
    } else if (event.type === 'gitMilestone') {
      this.react('HAPPY', 'happy', 2_500, 50, now, 'commit made!', 'HAPPY');
    }
    this.refresh(now);
    this.emit();
  }

  action(action: Action): void {
    if (this.disposed || !this.settings.enabled) { return; }
    const now = this.clock();
    this.advance(now);
    this.activity.touch(now);
    if (action === 'sleep') {
      this.manualSleep = true;
      this.machine.clearTemporary();
      this.say('zzz...', 'THOUGHT', now, true);
    } else if (action === 'wake') {
      this.manualSleep = false;
      this.machine.clearTemporary();
      this.say('hi again.', 'TOP', now, true);
    } else if (action === 'music') {
      this.manualMusic = !this.manualMusic;
      this.manualSleep = false;
      this.intelligence.setMusic(this.musicPlaying, this.manualMusic ? 'Manual music on' : this.musicStatus);
      this.say(this.musicPlaying ? 'good tunes.' : 'quiet mode.', 'TOP', now, true);
    } else if (action === 'vibe') {
      this.settings.vibeMode = !this.settings.vibeMode;
      this.manualSleep = false;
      this.say(this.settings.vibeMode ? 'vibe mode.' : 'focus mode.', 'TOP', now, true);
    } else if (action === 'pet' && this.allow('pet', now, 10_000)) {
      this.manualSleep = false;
      this.mood.change({ happiness: 5, mood: 3, boredom: -5 });
      this.machine.react('HAPPY', 'pet_start', 3_600, 50, now, [
        { animation: 'pet_start', duration: 600 }, { animation: 'pet_loop', duration: 1_200 },
        { animation: 'pet_happy', duration: 1_200 }, { animation: 'pet_end', duration: 600 },
      ]);
      this.say('thanks, human.', 'HAPPY', now, true);
    } else if (action === 'dance' && this.allow('dance', now, 8_000)) {
      this.manualSleep = false;
      this.machine.react('DANCING', `dance_0${1 + Math.floor(this.roll() * 5)}`, 6_000, 50, now);
      this.mood.change({ happiness: 2, boredom: -3 });
      this.say('tiny dance break.', 'HAPPY', now, true);
    } else if (action === 'play' && this.allow('play', now, 15_000)) {
      this.manualSleep = false;
      this.machine.react('VERY_HAPPY', 'idle_play_game', 6_000, 50, now);
      this.mood.change({ happiness: 3, mood: 2, boredom: -6 });
      this.say('just one level.', 'HAPPY', now, true);
    } else if (action === 'look' && this.allow('look', now, 2_000)) {
      this.machine.react('IDLE', this.roll() < 0.5 ? 'idle_look_left' : 'idle_look_right', 1_200, 10, now);
    }
    this.refresh(now);
    this.emit();
  }

  tick(): void {
    if (this.disposed) { return; }
    const now = this.clock();
    this.advance(now);
    const behavior = this.intelligence.getCodingBehavior(now);
    this.lastBehaviorMode = behavior.mode;
    if (this.greetingAt !== undefined && now >= this.greetingAt) {
      this.greetingAt = undefined;
      this.say('let\'s code.', 'TOP', now, true);
    }
    this.refresh(now);
    this.emit();
  }

  updateSettings(settings: Settings): void {
    if (this.disposed) { return; }
    const now = this.clock();
    this.advance(now);
    const wasEnabled = this.settings.enabled;
    this.settings = settingsFrom(settings);
    this.room = this.mood.stats.level >= ROOM_LEVELS[this.settings.roomTheme] ? this.settings.roomTheme : 'DEFAULT';
    this.settings.roomTheme = this.room;
    if (!this.settings.enabled || !this.settings.reactions) { this.machine.clearTemporary(); this.bubble = ''; }
    if (!wasEnabled && this.settings.enabled) { this.activity = new ActivityTracker(now); }
    this.refresh(now);
    this.emit();
  }

  setMusic(playing: boolean, status: string): void {
    if (this.disposed) { return; }
    const now = this.clock();
    this.advance(now);
    this.providerMusic = playing;
    this.musicStatus = status.slice(0, 160);
    this.intelligence.setMusic(this.musicPlaying, this.manualMusic ? 'Manual music on' : this.musicStatus);
    this.refresh(now);
    this.emit();
  }

  setWorkspace(hasWorkspace: boolean): void {
    if (this.disposed || this.hasWorkspace === hasWorkspace) { return; }
    this.hasWorkspace = hasWorkspace;
    const now = this.clock();
    this.qualitySignals.hasProject = hasWorkspace;
    if (!hasWorkspace) {
      this.qualitySignals = { hasProject: false, diagnosticsErrors: 0, diagnosticsWarnings: 0, tests: 'unknown' };
      this.currentProjectId = undefined;
    }
    this.updateQuality(now);
    this.say(hasWorkspace ? 'let\'s code.' : 'open a project?', 'THOUGHT', now, true);
    this.refresh(now);
    this.emit();
  }

  setRoom(room: RoomTheme): void {
    if (this.disposed || !ROOM_THEMES.includes(room) || this.mood.stats.level < ROOM_LEVELS[room]) { return; }
    this.room = room;
    this.settings.roomTheme = room;
    this.emit();
  }

  debug(payload: { state?: CharacterState; mood?: number; energy?: number; random?: boolean; animation?: string; fps?: number }): void {
    if (this.disposed || !this.development) { return; }
    const now = this.clock();
    if (payload.mood !== undefined) { this.mood.stats.mood = clamp(payload.mood); }
    if (payload.energy !== undefined) { this.mood.stats.energy = clamp(payload.energy); }
    if (payload.fps !== undefined) { this.settings.animationSpeed = clamp(payload.fps / 8, 0.25, 2); }
    this.machine.clearTemporary();
    this.refresh(now);
    const state = payload.state && CHARACTER_STATES.includes(payload.state) ? payload.state : this.machine.view(now).state;
    const animations: Record<CharacterState, string> = {
      IDLE: 'idle_blink', CODING: 'coding_loop', VIBE_CODING: 'vibe_coding_loop', THINKING: 'thinking', HAPPY: 'happy',
      VERY_HAPPY: 'very_happy', SAD: 'sad', VERY_SAD: 'very_sad', TIRED: 'idle_sleepy', SLEEPING: 'sleep', LISTENING_MUSIC: 'music_loop',
      DANCING: 'dance_01', ERROR: 'error_notice', SUCCESS: 'success', CONFUSED: 'error_confused', BORED: 'idle_yawn', AFK: 'idle_watch_window', CELEBRATING: 'celebrate',
    };
    if (payload.state || payload.animation || payload.random) {
      const animation = payload.random ? this.chooseIdle() : payload.animation && /^[a-z0-9_]{1,64}$/.test(payload.animation) ? payload.animation : animations[state];
      this.machine.react(state, animation, 15_000, 100, now);
    }
    this.emit();
  }

  serialize(): SavedState {
    this.progression.rollover(this.clock());
    return { version: 2, stats: { ...this.mood.stats }, daily: { ...this.progression.daily }, unlockedItems: this.progression.unlockedItems,
      room: this.room, streak: this.progression.streak, lastCodingDate: this.progression.lastCodingDate,
      savedAt: this.clock(), deepFocusSessions: this.deepFocusSessions + this.activity.deepFocusSessions,
      progression: this.progression.serialize() };
  }

  reset(): void {
    if (this.disposed) { return; }
    const now = this.clock();
    this.machine = new StateMachine();
    this.mood = new MoodEngine(INITIAL_STATS);
    this.activity = new ActivityTracker(now);
    this.progression = new ProgressionSystem(this.mood.stats, now);
    this.announcedLevel = 1;
    this.room = 'DEFAULT';
    this.settings.roomTheme = 'DEFAULT';
    this.cooldowns.clear();
    this.manualSleep = false;
    this.manualMusic = false;
    this.settings.vibeMode = false;
    this.intelligence = new DeveloperStateEngine();
    this.qualitySignals = { hasProject: this.hasWorkspace, diagnosticsErrors: 0, diagnosticsWarnings: 0, tests: 'unknown' };
    this.intelligence.updateQuality(this.qualitySignals, now);
    this.lastBehaviorMode = 'idle';
    this.lastCodeEditAt = Number.NEGATIVE_INFINITY;
    this.lastManualEditAt = Number.NEGATIVE_INFINITY;
    this.lastTestAt = Number.NEGATIVE_INFINITY;
    this.manualEditCountForCraft = 0;
    this.lastCraftFixAt = Number.NEGATIVE_INFINITY;
    this.currentProjectId = undefined;
    this.deepFocusSessions = 0;
    this.taskCount = 0;
    this.debugging = false;
    this.language = getLanguageProfile('plaintext');
    this.idleAnimation = 'idle_blink';
    this.failedBuilds = 0;
    this.redBlockers = 0;
    this.topRedFile = '';
    this.lastTick = now;
    this.nextIdleAt = now + 8_000;
    this.say('fresh start.', 'TOP', now, true);
    this.refresh(now);
    this.emit();
  }

  dispose(): void { this.disposed = true; this.listeners.clear(); this.cooldowns.clear(); }

  private get musicPlaying(): boolean { return this.manualMusic || this.providerMusic; }

  private updateQuality(now: number): void {
    const errors = this.qualitySignals.diagnosticsErrors;
    const failingTests = this.qualitySignals.failingTests ?? 0;
    this.qualitySignals.unmatchedBlockers = Math.max(0, (this.qualitySignals.redBlockers ?? 0) - errors - failingTests);
    this.intelligence.updateQuality(this.qualitySignals, now);
  }

  private handleCodingEdit(sample: CodingEditSample, documentLines: number, now: number): void {
    const before = this.intelligence.getCodingBehavior(now);
    const current = this.intelligence.recordEdit({ ...sample, timestamp: now });
    this.lastCodeEditAt = now;
    this.qualitySignals.largeFileCount = documentLines >= 1_000 ? 1 : 0;
    if (this.qualitySignals.tests === 'passing' && now > this.lastTestAt) this.qualitySignals.tests = 'stale';
    this.updateQuality(now);
    const smallManualEdit = sample.insertedChars < 80 && sample.deletedChars < 80 &&
      sample.insertedLines < 10 && sample.insertedChars + sample.deletedChars > 0;
    if (smallManualEdit) {
      this.lastManualEditAt = now;
      this.manualEditCountForCraft++;
      if (this.manualEditCountForCraft % 20 === 0) this.progression.awardCraft(1, now);
    }
    if (current.mode !== this.lastBehaviorMode) {
      this.lastBehaviorMode = current.mode;
      if (current.mode !== 'idle') this.reactToCodingBehavior({ type: 'codingBehavior', mode: current.mode,
        confidence: current.confidence, largestInsertion: current.largestInsertion,
        largeInsertionCount: current.largeInsertionCount }, now);
    }
    if (current.mode === 'handwritten' && current.smallEditCount >= 5 &&
      this.allow('handwritten', now, 300_000)) this.say('nice rhythm.', 'THOUGHT', now);
    if (current.mode === 'assisted' && current.smallEditCount >= 10 &&
      before.smallEditCount < 10 && this.allow('assistedIteration', now, 300_000))
      this.react('THINKING', 'thinking', 1_800, 35, now, 'making it yours.', 'THOUGHT');
  }

  private reactToCodingBehavior(event: Extract<ActivityEvent, { type: 'codingBehavior' }>, now: number): void {
    if (event.mode === 'flow') {
      if (this.allow('flow', now, 600_000)) {
        this.progression.awardCraft(2, now);
        this.say('locked in.', 'THOUGHT', now);
      }
    } else if (event.mode === 'assisted') {
      if (event.largeInsertionCount === 1 && this.allow('firstLargeInsertion', now, 300_000))
        this.react('THINKING', 'thinking', 2_000, 35, now, 'that\'s a big chunk.', 'THOUGHT');
    } else if (event.mode === 'vibe-heavy' && this.allow('vibeHeavy', now, 600_000)) {
      this.react('CONFUSED', 'error_confused', 2_500, 35, now, 'do we understand this?', 'THOUGHT');
    }
  }

  private handleProjectHealth(event: Extract<ActivityEvent, { type: 'projectHealth' }>, now: number): void {
    if (this.currentProjectId !== event.projectId) {
      const switchingProject = this.currentProjectId !== undefined;
      this.currentProjectId = event.projectId;
      this.intelligence.clear();
      this.intelligence.setMusic(this.musicPlaying, this.manualMusic ? 'Manual music on' : this.musicStatus);
      this.lastBehaviorMode = 'idle';
      this.lastCodeEditAt = Number.NEGATIVE_INFINITY;
      this.lastManualEditAt = Number.NEGATIVE_INFINITY;
      this.lastTestAt = Number.NEGATIVE_INFINITY;
      this.manualEditCountForCraft = 0;
      this.qualitySignals = { hasProject: Boolean(event.projectId),
        diagnosticsErrors: switchingProject ? 0 : this.qualitySignals.diagnosticsErrors,
        diagnosticsWarnings: switchingProject ? 0 : this.qualitySignals.diagnosticsWarnings, tests: 'unknown' };
    }
    const previousTestAt = this.lastTestAt;
    this.lastTestAt = event.lastTestAt ?? this.lastTestAt;
    this.qualitySignals.hasProject = this.hasWorkspace && Boolean(event.projectId);
    this.qualitySignals.redBlockers = event.redBlockers;
    this.qualitySignals.openTodos = event.openTodos;
    this.qualitySignals.fixmeHacks = event.fixmeHacks;
    this.qualitySignals.failingTests = event.failingTests;
    this.qualitySignals.tests = event.tests === 'passing' && this.lastCodeEditAt > this.lastTestAt ? 'stale' : event.tests;
    this.updateQuality(now);
    if (event.testTransition === 'failed' && this.allow('testOutcome', now, 8_000)) {
      this.react(event.repeatedTestFailure ? 'SAD' : 'CONFUSED', event.repeatedTestFailure ? 'sad' : 'error_confused',
        3_000, 60, now, event.repeatedTestFailure ? 'root cause first?' : 'test broke.', 'THOUGHT');
    } else if (event.testTransition === 'passed' && this.allow('testOutcome', now, 8_000)) {
      if (this.lastManualEditAt > previousTestAt && now - this.lastManualEditAt <= 600_000)
        this.progression.awardCraft(3, now);
      this.react('CELEBRATING', 'celebrate', 4_000, 60, now, 'that\'s green.', 'HAPPY');
    }
  }

  private advance(now: number): void {
    if (this.settings.enabled) {
      // Split a midnight boundary so keystrokes yesterday never count toward today.
      if (localDate(this.lastTick) !== localDate(now)) {
        const midnight = new Date(this.lastTick); midnight.setHours(24, 0, 0, 0);
        this.progression.addCoding(this.activity.consumeCodingSeconds(midnight.getTime()), this.lastTick);
      }
      this.progression.addCoding(this.activity.consumeCodingSeconds(now), now);
      // Integrate only meaningful state boundaries; suspended hosts need no per-second catchup loop.
      const activeAt = now - this.activity.inactivity(now);
      const boundaries = [this.lastTick, now, this.activity.typingUntil, activeAt + ActivityTracker.IDLE_AFTER,
        activeAt + ActivityTracker.BORED_AFTER, activeAt + ActivityTracker.SLEEP_AFTER]
        .filter(time => time >= this.lastTick && time <= now && Number.isFinite(time)).sort((a, b) => a - b);
      for (let index = 1; index < boundaries.length; index++) {
        const start = boundaries[index - 1]!;
        const end = boundaries[index]!;
        if (end > start) { this.mood.advance((end - start) / 1000, this.baseStateAt(start), this.activity.isDeepFocus(start)); }
      }
    } else { this.activity.consumeCodingSeconds(now); }
    this.progression.rollover(now);
    this.lastTick = now;
    this.machine.advance(now);
  }

  private refresh(now: number): void {
    const state = this.baseStateAt(now);
    if (!this.settings.enabled) { this.machine.setBase('IDLE', now, 'idle_blink', false); return; }
    if ((state === 'IDLE' || state === 'BORED') && this.settings.idleAnimations && now >= this.nextIdleAt && !this.machine.hasReaction) {
      this.idleAnimation = this.chooseIdle();
      this.nextIdleAt = now + 8_000 + this.roll() * 10_000;
      if (this.idleAnimation === 'idle_bug_hunt') { this.say('a real bug!', 'TOP', now); }
      else if (this.idleAnimation === 'idle_drink_coffee') { this.say('coffee?', 'THOUGHT', now); }
    }
    const animations = this.settings.animations && !this.settings.reducedMotion;
    if (state === 'IDLE' || state === 'BORED') { this.machine.setBase(state, now, animations && this.settings.idleAnimations ? this.idleAnimation : 'idle_blink', animations); }
    else if (state === 'CODING' || state === 'VIBE_CODING') {
      const prefix = state === 'CODING' ? 'coding' : 'vibe_coding';
      this.machine.setBase(state, now, `${prefix}_${this.activity.speed(now) >= 5 ? 'fast' : 'loop'}`, animations);
    } else { this.machine.setBase(state, now, undefined, animations); }
    if (this.mood.stats.level > this.announcedLevel) {
      this.announcedLevel = this.mood.stats.level;
      if (this.settings.reactions && !this.manualSleep && this.allow('level', now, 30_000)) {
        this.machine.react('CELEBRATING', 'celebrate', 4_500, 70, now);
        this.greetingAt = undefined;
        this.say(`level ${this.announcedLevel}!`, 'HAPPY', now, true);
      }
    }
  }

  private baseStateAt(now: number): CharacterState {
    const inactivity = this.activity.inactivity(now);
    let state: CharacterState = 'IDLE';
    if (!this.settings.enabled) { return 'IDLE'; }
    if (this.manualSleep) { state = 'SLEEPING'; }
    else if (this.activity.isTyping(now)) {
      state = this.musicPlaying || this.settings.vibeMode ? 'VIBE_CODING' : 'CODING';
    }
    else if (this.settings.vibeMode && this.hasWorkspace) { state = 'VIBE_CODING'; }
    else if (this.taskCount > 0 || this.debugging) { state = 'THINKING'; }
    else if (inactivity >= ActivityTracker.SLEEP_AFTER) { state = 'SLEEPING'; }
    else if (this.redBlockers > 0) { state = 'CONFUSED'; }
    else if (inactivity >= ActivityTracker.BORED_AFTER) { state = 'BORED'; }
    else if (!this.activity.isFocused && inactivity >= ActivityTracker.IDLE_AFTER) { state = 'AFK'; }
    else if (this.musicPlaying) { state = 'LISTENING_MUSIC'; }
    else if (this.mood.stats.energy < 18) { state = 'TIRED'; }
    else if (this.mood.stats.mood < 15) { state = 'VERY_SAD'; }
    else if (this.mood.stats.mood < 32) { state = 'SAD'; }
    else if (this.mood.stats.happiness > 90 && this.mood.stats.mood > 85) { state = 'VERY_HAPPY'; }
    return state;
  }

  private react(state: CharacterState, animation: string, duration: number, priority: number, now: number, bubble: string, kind: BubbleKind, forceBubble = false): void {
    if (!this.settings.reactions || this.manualSleep) { return; }
    if (this.machine.react(state, animation, duration, priority, now)) { this.say(bubble, kind, now, forceBubble); }
  }

  private setLanguage(languageId: string, now: number): void {
    const language = getLanguageProfile(languageId);
    if (this.language.id === language.id) { return; }
    this.language = language;
    this.say(language.reactions[0] ?? 'let\'s code.', 'TOP', now);
  }

  private say(text: string, kind: BubbleKind, now: number, force = false): void {
    if (!this.settings.enabled || !this.settings.reactions || (!force && now - this.lastBubbleAt < 20_000)) { return; }
    this.bubble = text;
    this.bubbleKind = kind;
    this.lastBubbleAt = now;
    this.bubbleUntil = now + 4_000;
  }

  private allow(key: string, now: number, delay: number): boolean {
    const last = this.cooldowns.get(key) ?? Number.NEGATIVE_INFINITY;
    if (now - last < delay) { return false; }
    this.cooldowns.set(key, now);
    return true;
  }

  private roll(): number { return clamp(this.random(), 0, 0.999999); }
  private chooseIdle(): string {
    let value = this.roll() * idleAnimations.reduce((sum, animation) => sum + animation.weight, 0);
    for (const animation of idleAnimations) { value -= animation.weight; if (value < 0) { return animation.animation; } }
    return 'idle_blink';
  }

  private emit(): void {
    if (this.disposed) { return; }
    const snapshot = this.snapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === this.lastEmission) { return; }
    this.lastEmission = serialized;
    for (const listener of this.listeners) {
      try { listener(this.snapshot()); } catch { /* A disposed view must not interrupt editor event handling. */ }
    }
  }
}
