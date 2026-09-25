import { CharacterState, Stats } from '../models/types';

export const INITIAL_STATS: Stats = { mood: 72, energy: 88, focus: 0, boredom: 0, happiness: 75, xp: 0, level: 1 };
export function clamp(value: number, min = 0, max = 100): number { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }

export class MoodEngine {
  readonly stats: Stats;
  constructor(stats: Stats) { this.stats = { ...stats }; this.normalize(); }

  advance(seconds: number, state: CharacterState, deepFocus: boolean): void {
    const elapsed = clamp(seconds, 0, 300);
    if (state === 'SLEEPING') {
      this.change({ energy: elapsed * 0.13, focus: -elapsed * 0.18, boredom: -elapsed * 0.04 });
    } else if (state === 'CODING' || state === 'VIBE_CODING') {
      this.change({ energy: -elapsed * 0.025, focus: elapsed * (deepFocus ? 0.75 : 0.16), boredom: -elapsed * 0.6,
        mood: elapsed * (state === 'VIBE_CODING' ? 0.035 : 0.007), happiness: elapsed * (state === 'VIBE_CODING' ? 0.015 : 0) });
    } else {
      this.change({ energy: elapsed * 0.015, focus: -elapsed * 0.12,
        boredom: elapsed * (state === 'LISTENING_MUSIC' ? 0.008 : 0.035), mood: state === 'BORED' ? -elapsed * 0.008 : 0 });
    }
  }

  change(delta: Partial<Pick<Stats, 'mood' | 'energy' | 'focus' | 'boredom' | 'happiness'>>): void {
    for (const key of ['mood', 'energy', 'focus', 'boredom', 'happiness'] as const) { this.stats[key] += delta[key] ?? 0; }
    this.normalize();
  }

  normalize(): void {
    for (const key of ['mood', 'energy', 'focus', 'boredom', 'happiness'] as const) { this.stats[key] = clamp(this.stats[key]); }
    this.stats.xp = Math.floor(clamp(this.stats.xp, 0, 10_000_000));
    this.stats.level = Math.floor(clamp(this.stats.level, 1, 448));
  }
}
