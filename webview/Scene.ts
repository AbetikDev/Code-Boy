import type { AnimationDefinition, AssetManifest, Snapshot } from '../src/models/types';

export class Scene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private snapshot?: Snapshot;
  private animation?: AnimationDefinition;
  private frame = 0;
  private readonly resizeObserver: ResizeObserver;
  private phase = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly stage: HTMLElement, private readonly manifest: AssetManifest) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) { throw new Error('This webview does not support a pixel canvas.'); }
    this.ctx = context; this.ctx.imageSmoothingEnabled = false;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(stage);
    this.resize();
  }

  async load(): Promise<void> {
    const sources = new Set([...Object.values(this.manifest.character), ...Object.values(this.manifest.room), ...Object.values(this.manifest.effects)].map(asset => asset.src));
    await Promise.all([...sources].map(src => new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { this.images.set(src, img); resolve(); };
      img.onerror = () => reject(new Error('A local sprite could not be loaded.'));
      img.src = src;
    })));
  }

  update(snapshot: Snapshot): void { this.snapshot = snapshot; this.render(); }
  draw(animation: AnimationDefinition, frame: number): void { this.animation = animation; this.frame = frame; this.phase += 1; this.render(); }
  dispose(): void { this.resizeObserver.disconnect(); this.images.clear(); }

  private resize(): void {
    const width = this.stage.clientWidth;
    const scale = Math.max(1, Math.min(4, width >= 240 && width < 384 ? 2 : Math.floor(width / 192)));
    this.canvas.width = 192;
    this.canvas.height = 160;
    this.canvas.style.width = `${192 * scale}px`;
    this.canvas.style.height = `${160 * scale}px`;
    this.stage.style.height = `${160 * scale}px`;
    this.stage.style.setProperty('--sprite-scale', String(scale));
    this.ctx.imageSmoothingEnabled = false;
    this.render();
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#131024'; ctx.fillRect(0, 0, 192, 160);
    const hour = new Date().getHours();
    let room = this.snapshot?.room.toLowerCase() ?? 'default';
    if (room === 'default' && (hour < 7 || hour >= 19)) { room = 'night'; }
    const definition = this.manifest.room[`theme_${room}`] ?? this.manifest.room.theme_default;
    const backdrop = definition && this.images.get(definition.src);
    if (backdrop) { ctx.drawImage(backdrop, 0, 0, 192, 160); }
    if (this.animation) {
      const image = this.images.get(this.animation.src);
      if (image) { ctx.drawImage(image, this.frame * this.animation.frameWidth, 0, this.animation.frameWidth, this.animation.frameHeight, 64, 64, 64, 64); }
    }
    const snapshot = this.snapshot;
    if (snapshot && snapshot.settings.animations && !snapshot.settings.reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const effect = snapshot.state === 'CELEBRATING' || snapshot.state === 'SUCCESS' ? 'confetti' : snapshot.state === 'VERY_HAPPY' ? 'hearts' : snapshot.musicPlaying || snapshot.state === 'VIBE_CODING' || snapshot.state === 'DANCING' ? 'notes' : 'sparkles';
      const def = this.manifest.effects[effect];
      const image = def && this.images.get(def.src);
      if (def && image && (effect !== 'sparkles' || this.phase % 4 === 0)) { ctx.drawImage(image, (this.phase % def.frames) * def.frameWidth, 0, def.frameWidth, def.frameHeight, 64, 43, def.frameWidth, def.frameHeight); }
    }
  }
}
