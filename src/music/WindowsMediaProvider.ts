import { execFile, ChildProcess } from 'node:child_process';
import { MusicProvider } from './MusicProvider';

/** Reads Windows playback status only. No audio device, microphone, or track history. */
export class WindowsMediaProvider implements MusicProvider {
  readonly name = 'Windows media';
  private child: ChildProcess | undefined;
  private disposed = false;
  constructor(private readonly scriptPath: string) {}
  async isPlaying(): Promise<boolean> {
    if (process.platform !== 'win32' || this.disposed) return false;
    return new Promise((resolve, reject) => {
      this.child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath],
        { windowsHide: true, timeout: 7000, maxBuffer: 4096, encoding: 'utf8' }, (error, stdout) => {
          this.child = undefined;
          if (this.disposed) return resolve(false);
          if (error) return reject(new Error('Windows playback status is unavailable.'));
          const status = stdout.trim();
          if (status !== 'true' && status !== 'false') return reject(new Error('Windows returned an unsupported playback status.'));
          resolve(status === 'true');
        });
    });
  }
  dispose(): void { this.disposed = true; this.child?.kill(); this.child = undefined; }
}
