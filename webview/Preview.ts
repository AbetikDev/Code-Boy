import { DEFAULT_SETTINGS } from '../src/models/types';
import type { AssetManifest, ClientMessage, HostMessage, Snapshot } from '../src/models/types';
import type { CodingBehaviorSnapshot, QualitySnapshot } from '../src/intelligence/types';

/** Explicit browser-only fixture. This code is never selected inside VS Code. */
export async function startPreview(receive: (message: HostMessage) => void): Promise<(message: ClientMessage) => void> {
  const response = await fetch('/assets/manifest.json');
  if (!response.ok) { throw new Error('Serve the repository root to load preview assets.'); }
  const manifest = await response.json() as AssetManifest;
  for (const section of [manifest.character, manifest.room, manifest.icons, manifest.effects]) { for (const asset of Object.values(section)) { asset.src = `/${asset.src}`; } }
  const behavior: CodingBehaviorSnapshot = { mode: 'idle', windowStart: 0, observedAt: 0, lastEditAt: null, typedChars: 0, insertedChars: 0, deletedChars: 0, largestInsertion: 0, largestInsertionLines: 0, editCount: 0, smallEditCount: 0, largeInsertionCount: 0, assistedRatio: 0, confidence: 0 };
  const quality: QualitySnapshot = { status: 'healthy', score: 95, correctness: 100, maintainability: 80, testing: null, trend: 'steady', diagnosticsErrors: 0, diagnosticsWarnings: 0, failingTests: 0, redBlockers: 0, unmatchedBlockers: 0, openTodos: 10, fixmeHacks: 0, largeFileCount: 0, buildFailed: false, tests: 'unknown', measuredAt: 0 };
  let snapshot: Snapshot = {
    state: 'IDLE', animation: 'idle', stats: { mood: 88, happiness: 92, energy: 76, focus: 84, boredom: 12, xp: 2080, level: 7, craft: 24 },
    daily: { date: new Date().toISOString().slice(0, 10), codingSeconds: 5640, filesSaved: 24, errorsFixed: 8, buildsCompleted: 3 },
    unlockedItems: ['coffee_mug', 'poster', 'headphones', 'new_desk'], room: 'DEFAULT', streak: 5,
    language: { id: 'typescript', displayName: 'TypeScript', icon: 'typescript', color: '#3b82f6', reactions: ['TypeScript time.'] },
    bubble: "let's make something.", bubbleKind: 'TOP', musicPlaying: false, musicStatus: 'Manual music is ready.',
    settings: { ...DEFAULT_SETTINGS }, hasWorkspace: true, development: true, typingSpeed: 0, nextLevelXp: 2450,
    flowActive: false, deepFocusSessions: 3,
    codingBehavior: behavior, quality,
    developerState: { behavior, quality, musicPlaying: false, musicStatus: 'Manual music is ready.', tests: quality.tests, redBlockers: 0, observedAt: 0 },
  };
  let returnTimer: ReturnType<typeof setTimeout> | undefined;
  const emit = (): void => receive({ type: 'snapshot', snapshot: structuredClone(snapshot) });
  const revert = (): void => { snapshot.state = snapshot.settings.vibeMode ? 'VIBE_CODING' : snapshot.musicPlaying ? 'LISTENING_MUSIC' : 'IDLE'; snapshot.animation = snapshot.settings.vibeMode ? 'vibe_coding_loop' : snapshot.musicPlaying ? 'music_loop' : 'idle'; snapshot.bubble = snapshot.settings.vibeMode ? 'vibe mode.' : 'nice.'; emit(); };
  receive({ type: 'init', manifest, snapshot: structuredClone(snapshot) });
  return (message: ClientMessage): void => {
    if (message.type === 'ready') { return; }
    if (message.type === 'command') {
      if (message.command === 'context') { snapshot.bubble = 'ContextBack opens inside VS Code.'; emit(); }
      else if (message.command === 'toggleOverlay') { snapshot.settings.floatingOverlay = !snapshot.settings.floatingOverlay; emit(); }
      else if (message.command !== 'settings') { receive({ type: 'panel', panel: message.command }); }
      else { snapshot.settings.soundEnabled = !snapshot.settings.soundEnabled; snapshot.bubble = snapshot.settings.soundEnabled ? 'sound on. preview only.' : 'quiet mode. preview only.'; emit(); }
      return;
    }
    if (message.type === 'room') { snapshot.room = message.room; snapshot.settings.roomTheme = message.room; emit(); return; }
    if (message.type === 'debug') {
      if (message.mood !== undefined) { snapshot.stats.mood = message.mood; }
      if (message.energy !== undefined) { snapshot.stats.energy = message.energy; }
      if (message.state) {
        snapshot.state = message.state;
        const names: Partial<Record<Snapshot['state'], string>> = { IDLE: 'idle', CODING: 'coding_loop', VIBE_CODING: 'vibe_coding_loop', HAPPY: 'happy', VERY_HAPPY: 'very_happy', SAD: 'sad', DANCING: 'dance_02', SLEEPING: 'sleep', ERROR: 'error_notice', SUCCESS: 'success' };
        snapshot.animation = names[message.state] ?? message.state.toLowerCase();
      }
      if (message.animation) { snapshot.animation = message.animation; }
      if (message.random) { snapshot.animation = 'random_bug'; }
      snapshot.bubble = 'sprite lab.'; emit(); return;
    }
    if (returnTimer) { clearTimeout(returnTimer); }
    const reactions: Record<string, [Snapshot['state'], string, string]> = { pet: ['VERY_HAPPY', 'pet_start', 'tiny serotonin boost.'], look: ['THINKING', 'idle_look_right', 'oh. hi.'], dance: ['DANCING', 'dance_02', 'compiled with rhythm.'], sleep: ['SLEEPING', 'sleep', 'zzz...'], play: ['HAPPY', 'idle_play_game', 'one quick game.'], wake: ['HAPPY', 'happy', 'back online.'] };
    if (message.action === 'music') { snapshot.musicPlaying = !snapshot.musicPlaying; revert(); return; }
    if (message.action === 'vibe') { snapshot.settings.vibeMode = !snapshot.settings.vibeMode; revert(); return; }
    const reaction = reactions[message.action];
    if (reaction) { [snapshot.state, snapshot.animation, snapshot.bubble] = reaction; emit(); }
    if (message.action !== 'sleep') { returnTimer = setTimeout(revert, 4500); }
  };
}
