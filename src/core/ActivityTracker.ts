/** A local, metadata-only activity clock. No document names or text enter this model. */
export class ActivityTracker {
  static readonly IDLE_AFTER = 30_000;
  static readonly BORED_AFTER = 5 * 60_000;
  static readonly SLEEP_AFTER = 15 * 60_000;
  static readonly CONTINUOUS_GAP = 5_000;
  private lastActivityAt: number;
  private lastTypingAt = Number.NEGATIVE_INFINITY;
  private typingBeganAt = Number.NEGATIVE_INFINITY;
  private accountedAt: number;
  private focused = true;
  private samples: Array<{ at: number; characters: number }> = [];

  constructor(now: number) { this.lastActivityAt = now; this.accountedAt = now; }

  touch(now: number): void { this.lastActivityAt = Math.max(this.lastActivityAt, now); }

  type(now: number, characters: number): void {
    if (now - this.lastTypingAt > ActivityTracker.CONTINUOUS_GAP) { this.typingBeganAt = now; }
    this.lastTypingAt = now;
    this.focused = true;
    this.touch(now);
    this.samples.push({ at: now, characters: Math.min(200, Math.max(1, Number.isFinite(characters) ? characters : 1)) });
    this.trim(now);
  }

  setFocused(focused: boolean, now: number): void {
    this.focused = focused;
    if (focused) { this.touch(now); }
    else { this.typingBeganAt = Number.NEGATIVE_INFINITY; }
  }

  get isFocused(): boolean { return this.focused; }
  get typingUntil(): number { return this.lastTypingAt + ActivityTracker.IDLE_AFTER; }
  inactivity(now: number): number { return Math.max(0, now - this.lastActivityAt); }
  isTyping(now: number): boolean { return this.focused && now - this.lastTypingAt < ActivityTracker.IDLE_AFTER; }
  isDeepFocus(now: number): boolean {
    return this.focused && now - this.lastTypingAt <= ActivityTracker.CONTINUOUS_GAP &&
      Number.isFinite(this.typingBeganAt) && now - this.typingBeganAt >= 20_000;
  }
  speed(now: number): number {
    this.trim(now);
    return this.samples.reduce((total, sample) => total + sample.characters, 0) / 8;
  }

  /** At most five seconds after the last keystroke count as active coding. */
  consumeCodingSeconds(now: number): number {
    const end = Math.min(now, this.lastTypingAt + ActivityTracker.CONTINUOUS_GAP);
    const start = Math.max(this.accountedAt, this.lastTypingAt);
    const seconds = this.focused ? Math.max(0, end - start) / 1000 : 0;
    this.accountedAt = Math.max(this.accountedAt, now);
    return seconds;
  }

  private trim(now: number): void { this.samples = this.samples.filter(sample => now - sample.at < 8_000).slice(-256); }
}
