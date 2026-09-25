/** Optional local oscillator effects: never reads a microphone, never uses a network. */
export class Sound {
  private context?: AudioContext;
  enabled = false;
  play(kind: 'click' | 'happy' | 'success' | 'error' | 'sleep' | 'level' = 'click'): void {
    if (!this.enabled) { return; }
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') { void this.context.resume(); }
      const notes = { click: [440], happy: [523, 659], success: [523, 659, 784], error: [220, 165], sleep: [330, 262], level: [523, 659, 784, 1047] }[kind];
      notes.forEach((frequency, index) => {
        const oscillator = this.context!.createOscillator();
        const gain = this.context!.createGain();
        const start = this.context!.currentTime + index * 0.07;
        oscillator.type = 'square'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.025, start); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.055);
        oscillator.connect(gain); gain.connect(this.context!.destination);
        oscillator.start(start); oscillator.stop(start + 0.06);
      });
    } catch { /* Audio can be unavailable in restricted webviews. */ }
  }
  dispose(): void { void this.context?.close(); }
}
