import { MusicProvider } from './MusicProvider';
export class ManualMusicProvider implements MusicProvider {
  readonly name = 'Manual music';
  private playing = false;
  setPlaying(playing: boolean): void { this.playing = playing; }
  toggle(): boolean { this.playing = !this.playing; return this.playing; }
  async isPlaying(): Promise<boolean> { return this.playing; }
}
