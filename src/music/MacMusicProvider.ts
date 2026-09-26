import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MusicProvider } from './MusicProvider';

const run = promisify(execFile);
export function macPlayerScript(app: 'Music' | 'Spotify'): string[] {
  return [`if application "${app}" is running then`,
    `  tell application "${app}" to get player state as string`,
    'else', '  return "not running"', 'end if'];
}

/** Queries Apple Music and Spotify player state without launching either app. */
export class MacMusicProvider implements MusicProvider {
  readonly name = 'macOS media';

  async isPlaying(): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    const results = await Promise.allSettled((['Music', 'Spotify'] as const).map(async app => {
      const args = macPlayerScript(app).flatMap(line => ['-e', line]);
      const { stdout } = await run('osascript', args, { timeout: 5000, maxBuffer: 4096, encoding: 'utf8' });
      return stdout.trim().toLowerCase() === 'playing';
    }));
    if (results.some(result => result.status === 'fulfilled' && result.value)) return true;
    if (results.some(result => result.status === 'rejected'))
      throw new Error('Music Automation unavailable. Allow access or use MUSIC.');
    return false;
  }
}
