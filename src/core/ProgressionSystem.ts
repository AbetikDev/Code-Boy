import { DailyStats, SavedState, Stats } from '../models/types';
import { clamp } from './MoodEngine';

type Reward = 'save' | 'build' | 'fix' | 'coding' | 'daily';
const rewards: Record<Reward, { xp: number; cooldown: number }> = {
  save: { xp: 2, cooldown: 30_000 }, build: { xp: 15, cooldown: 60_000 },
  fix: { xp: 5, cooldown: 15_000 }, coding: { xp: 2, cooldown: 0 }, daily: { xp: 15, cooldown: 0 },
};
export const UNLOCKS = [
  { level: 2, item: 'coffee_mug' }, { level: 3, item: 'poster' }, { level: 5, item: 'headphones' },
  { level: 7, item: 'new_desk' }, { level: 10, item: 'rgb_pc' }, { level: 15, item: 'hoodie' }, { level: 20, item: 'rare_room' },
] as const;

/** Local calendar days, including DST, are used for streaks. */
export function localDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { return false; }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!, 12);
  return localDate(date.getTime()) === value;
}
export function emptyDaily(date: string): DailyStats { return { date, codingSeconds: 0, filesSaved: 0, errorsFixed: 0, buildsCompleted: 0 }; }
export function xpForLevel(level: number): number { return 50 * Math.pow(Math.max(0, level - 1), 2); }

export class ProgressionSystem {
  static readonly DAILY_XP_CAP = 1_200;
  daily: DailyStats;
  streak: number;
  lastCodingDate: string;
  private ledger: NonNullable<SavedState['progression']>;

  constructor(private readonly stats: Stats, now: number, saved?: SavedState) {
    const today = localDate(now);
    this.daily = saved?.daily.date === today ? { ...saved.daily } : emptyDaily(today);
    this.streak = saved?.streak ?? 0;
    this.lastCodingDate = saved?.lastCodingDate ?? '';
    this.ledger = { date: today, xpEarned: 0, cooldowns: {}, codingRemainder: 0 };
    const stored = saved?.progression;
    if (stored?.date === today) {
      this.ledger.xpEarned = clamp(stored.xpEarned, 0, ProgressionSystem.DAILY_XP_CAP);
      this.ledger.codingRemainder = clamp(stored.codingRemainder, 0, 29.999);
    }
    if (stored?.cooldowns && typeof stored.cooldowns === 'object') {
      for (const key of ['save', 'build', 'fix'] as const) {
        const value = stored.cooldowns[key];
        if (typeof value === 'number' && Number.isFinite(value) && value <= now && value > now - 60_000) { this.ledger.cooldowns[key] = value; }
      }
    }
    this.syncLevel();
    this.rollover(now);
  }

  rollover(now: number): void {
    const date = localDate(now);
    if (this.daily.date !== date) { this.daily = emptyDaily(date); }
    if (this.ledger.date !== date) { this.ledger = { date, xpEarned: 0, cooldowns: this.ledger.cooldowns, codingRemainder: 0 }; }
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (this.lastCodingDate && this.lastCodingDate !== date && this.lastCodingDate !== localDate(yesterday.getTime())) { this.streak = 0; }
  }

  markCoding(now: number): void {
    this.rollover(now);
    const date = localDate(now);
    if (date === this.lastCodingDate) { return; }
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    this.streak = this.lastCodingDate === localDate(yesterday.getTime()) ? this.streak + 1 : 1;
    this.lastCodingDate = date;
    this.award('daily', now);
  }

  addCoding(seconds: number, now: number): void {
    this.rollover(now);
    const safeSeconds = clamp(seconds, 0, 5);
    this.daily.codingSeconds = clamp(this.daily.codingSeconds + safeSeconds, 0, 86_400);
    this.ledger.codingRemainder += safeSeconds;
    while (this.ledger.codingRemainder >= 30) { this.ledger.codingRemainder -= 30; this.award('coding', now); }
  }

  save(now: number): void { this.rollover(now); this.daily.filesSaved = Math.min(1_000_000, this.daily.filesSaved + 1); this.award('save', now); }
  fix(count: number, now: number): void { this.rollover(now); this.daily.errorsFixed = Math.min(1_000_000, this.daily.errorsFixed + Math.floor(clamp(count, 0, 10_000))); this.award('fix', now); }
  build(now: number): void { this.rollover(now); this.daily.buildsCompleted = Math.min(1_000_000, this.daily.buildsCompleted + 1); this.award('build', now); }

  award(kind: Reward, now: number): number {
    this.rollover(now);
    const reward = rewards[kind];
    if (now - (this.ledger.cooldowns[kind] ?? Number.NEGATIVE_INFINITY) < reward.cooldown) { return 0; }
    this.ledger.cooldowns[kind] = now;
    const amount = Math.min(reward.xp, ProgressionSystem.DAILY_XP_CAP - this.ledger.xpEarned);
    this.stats.xp = Math.min(10_000_000, this.stats.xp + amount);
    this.ledger.xpEarned += amount;
    this.syncLevel();
    return amount;
  }

  get unlockedItems(): string[] { return UNLOCKS.filter(unlock => unlock.level <= this.stats.level).map(unlock => unlock.item); }
  get nextLevelXp(): number { return xpForLevel(this.stats.level + 1); }
  serialize(): NonNullable<SavedState['progression']> { return { ...this.ledger, cooldowns: { ...this.ledger.cooldowns } }; }
  private syncLevel(): void { this.stats.level = Math.floor(Math.sqrt(this.stats.xp / 50)) + 1; }
}
