import type { AnimationDefinition } from '../src/models/types';

/** A frame clock that sleeps between sprite frames and never requests hidden frames. */
export class SpriteAnimator {
  private current?: AnimationDefinition;
  private frame = 0;
  private running = false;
  private visible = true;
  private reduced = false;
  private speed = 1;
  private fpsOverride?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private raf?: number;
  private completion = new Set<(animation: AnimationDefinition) => void>();

  constructor(private readonly animations: Record<string, AnimationDefinition>, private readonly draw: (animation: AnimationDefinition, frame: number) => void) {}

  get name(): string { return this.current?.name ?? ''; }
  get isPlaying(): boolean { return this.running; }
  get definition(): AnimationDefinition | undefined { return this.current; }

  setAnimation(name: string, force = false): boolean {
    const next = this.animations[name];
    if (!next || (this.current === next && this.running)) { return false; }
    if (!force && this.running && this.current && !this.current.loop && (this.current.priority ?? 0) > (next.priority ?? 0)) { return false; }
    this.cancel();
    this.current = next;
    this.frame = 0;
    this.draw(next, 0);
    if (this.running) { this.schedule(); }
    return true;
  }

  play(name?: string, force = false): void {
    if (name) { this.setAnimation(name, force); }
    if (!this.current) { return; }
    this.running = true;
    this.draw(this.current, this.frame);
    this.schedule();
  }

  pause(): void { this.running = false; this.cancel(); }
  stop(): void { this.pause(); this.frame = 0; if (this.current) { this.draw(this.current, 0); } }
  setFPS(fps?: number): void { this.fpsOverride = fps === undefined ? undefined : Math.max(4, Math.min(12, fps)); this.cancel(); this.schedule(); }
  setSpeed(speed: number): void { this.speed = Math.max(0.5, Math.min(2, speed)); this.cancel(); this.schedule(); }
  setVisible(visible: boolean): void { this.visible = visible; this.cancel(); if (visible && this.current) { this.draw(this.current, this.frame); } this.schedule(); }
  setReducedMotion(reduced: boolean): void { if (this.reduced === reduced) { return; } this.reduced = reduced; this.cancel(); this.schedule(); }

  random(prefix = 'idle_'): string | undefined {
    const weights = { COMMON: 12, UNCOMMON: 5, RARE: 2, LEGENDARY: 0.25 };
    const candidates = Object.entries(this.animations).filter(([key]) => key.startsWith(prefix));
    let cursor = Math.random() * candidates.reduce((sum, [, def]) => sum + weights[def.rarity ?? 'COMMON'], 0);
    for (const [key, def] of candidates) { cursor -= weights[def.rarity ?? 'COMMON']; if (cursor <= 0) { this.play(key); return key; } }
    return undefined;
  }

  onComplete(listener: (animation: AnimationDefinition) => void): () => void { this.completion.add(listener); return () => this.completion.delete(listener); }
  dispose(): void { this.pause(); this.completion.clear(); }

  private schedule(): void {
    if (this.timer !== undefined || this.raf !== undefined || !this.running || !this.visible || this.reduced || !this.current) { return; }
    const fps = Math.max(4, Math.min(12, (this.fpsOverride ?? this.current.fps) * this.speed));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.running || !this.visible) { return; }
      this.raf = requestAnimationFrame(() => { this.raf = undefined; this.advance(); });
    }, 1000 / fps);
  }

  private advance(): void {
    const animation = this.current;
    if (!animation || !this.running || !this.visible || this.reduced) { return; }
    this.frame += 1;
    if (this.frame >= animation.frames) {
      if (animation.loop) { this.frame = 0; }
      else {
        this.frame = animation.frames - 1;
        this.running = false;
        for (const listener of this.completion) { listener(animation); }
        if (this.current === animation && animation.next) { this.play(animation.next, true); }
        if (!this.running) { this.draw(animation, this.frame); return; }
        if (this.current !== animation) { return; }
      }
    }
    if (this.current) { this.draw(this.current, this.frame); }
    this.schedule();
  }

  private cancel(): void {
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.raf !== undefined) { cancelAnimationFrame(this.raf); this.raf = undefined; }
  }
}
