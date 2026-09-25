import { MusicProvider } from './MusicProvider';

/** Optional short-lived OAuth token supplied by the user and kept in SecretStorage. */
export class SpotifyMusicProvider implements MusicProvider {
  readonly name = 'Spotify';
  private controller: AbortController | undefined;
  private retryAfter = 0;
  private disposed = false;
  constructor(private readonly getToken: () => PromiseLike<string | undefined>) {}
  async isPlaying(): Promise<boolean> {
    if (this.disposed) return false;
    if (Date.now() < this.retryAfter) throw new Error('Spotify is temporarily rate limited.');
    const token = await this.getToken();
    if (!token || this.disposed) return false;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, redirect: 'error' });
      if (response.status === 204) return false;
      if (response.status === 401) throw new Error('Spotify token expired. Reconnect or use MUSIC.');
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after') ?? 60);
        this.retryAfter = Date.now() + Math.min(3600, Math.max(15, Number.isFinite(seconds) ? seconds : 60)) * 1000;
        throw new Error('Spotify is temporarily rate limited.');
      }
      if (!response.ok) throw new Error('Spotify playback status is unavailable.');
      const data: unknown = await response.json();
      return typeof data === 'object' && data !== null && 'is_playing' in data && data.is_playing === true;
    } finally { clearTimeout(timeout); this.controller = undefined; }
  }
  dispose(): void { this.disposed = true; this.controller?.abort(); }
}
