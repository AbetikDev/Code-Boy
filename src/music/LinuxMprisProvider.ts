import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MusicProvider } from './MusicProvider';

const run = promisify(execFile);
const PLAYER = /^org\.mpris\.MediaPlayer2\.[A-Za-z0-9_.-]+$/;

/** Reads MPRIS playback state only; never requests tracks or audio. */
export class LinuxMprisProvider implements MusicProvider {
  readonly name = 'Linux media';

  async isPlaying(): Promise<boolean> {
    if (process.platform !== 'linux') return false;
    let output: string;
    try {
      ({ stdout: output } = await run('busctl', ['--user', '--no-pager', '--no-legend', 'list'],
        { timeout: 3000, maxBuffer: 64 * 1024, encoding: 'utf8' }));
    } catch { throw new Error('MPRIS session bus unavailable. Use MUSIC.'); }
    const players = parseMprisNames(output);
    if (!players.length) return false;
    const results = await Promise.allSettled(players.map(async player => {
      const { stdout } = await run('busctl', ['--user', 'get-property', player, '/org/mpris/MediaPlayer2',
        'org.mpris.MediaPlayer2.Player', 'PlaybackStatus'],
      { timeout: 3000, maxBuffer: 4096, encoding: 'utf8' });
      return parsePlaybackStatus(stdout);
    }));
    if (results.some(result => result.status === 'fulfilled' && result.value)) return true;
    if (results.every(result => result.status === 'rejected')) throw new Error('MPRIS playback status unavailable. Use MUSIC.');
    return false;
  }
}

export function parseMprisNames(output: string): string[] {
  return output.split(/\r?\n/).map(line => line.trim().split(/\s+/)[0]).filter(name => PLAYER.test(name));
}

export function parsePlaybackStatus(output: string): boolean {
  return /^s\s+"Playing"\s*$/.test(output.trim());
}
