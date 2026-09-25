import * as vscode from 'vscode';
import { Settings } from '../models/types';
import { MusicProvider } from './MusicProvider';
import { SpotifyMusicProvider } from './SpotifyMusicProvider';
import { WindowsMediaProvider } from './WindowsMediaProvider';

export const SPOTIFY_TOKEN_KEY = 'codeBoy.spotifyToken';
export class MusicController implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | undefined;
  private providers: MusicProvider[] = [];
  private generation = 0;
  private polling = false;
  constructor(private readonly context: vscode.ExtensionContext, private readonly report: (playing: boolean, status: string) => void) {}
  async configure(settings: Settings): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!settings.enabled || !settings.musicDetection) { this.report(false, 'Manual music'); return; }
    if (process.platform === 'win32') this.providers.push(new WindowsMediaProvider(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'windows-media.ps1').fsPath));
    const token = await this.context.secrets.get(SPOTIFY_TOKEN_KEY);
    if (generation !== this.generation) return;
    if (token) this.providers.push(new SpotifyMusicProvider(() => this.context.secrets.get(SPOTIFY_TOKEN_KEY)));
    if (!this.providers.length) { this.report(false, 'Use MUSIC or connect Spotify'); return; }
    this.timer = setInterval(() => { void this.poll(generation); }, 5000);
    void this.poll(generation);
  }
  private async poll(generation: number): Promise<void> {
    if (this.polling || generation !== this.generation) return;
    this.polling = true;
    try {
      const providers = [...this.providers];
      const results = await Promise.allSettled(providers.map(provider => provider.isPlaying()));
      if (generation !== this.generation) return;
      const playingIndex = results.findIndex(result => result.status === 'fulfilled' && result.value);
      if (playingIndex >= 0) this.report(true, providers[playingIndex].name);
      else if (results.every(result => result.status === 'rejected')) this.report(false, 'Detection unavailable · use MUSIC');
      else this.report(false, 'Listening for music');
    } finally { this.polling = false; }
  }
  private stop(): void {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.providers.forEach(provider => provider.dispose?.());
    this.providers = [];
  }
  dispose(): void { this.stop(); }
}
