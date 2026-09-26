import type { CBSettings } from '../types';
import type { Database } from '../Database';
import type { EventRepository } from '../repositories/EventRepository';
import type { GitService } from '../git/GitService';

/** Periodically polls git and records commit events. */
export class GitCollector {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly db: Database,
    private readonly events: EventRepository,
    private readonly git: GitService,
    private getContext: () => { projectId: string; sessionId: string; root: string } | null,
    private settings: CBSettings,
    private onCommit?: (projectId: string, hash: string, message: string) => void
  ) {}
  private baselineLoaded = false;

  start(): void {
    if (!this.settings.trackGit) return;
    // Poll every 60 seconds
    this.timer = setInterval(() => void this.poll(), 60_000);
    void this.poll();
  }

  updateSettings(settings: CBSettings): void {
    this.settings = settings;
    if (!settings.trackGit) this.stop();
    else if (!this.timer) this.start();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  private async poll(): Promise<void> {
    if (!this.settings.trackGit) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const { projectId, sessionId, root } = ctx;

    try {
      const commits = await this.git.getRecentCommits(root, 5);
      const known = this.db.get('events')
        .filter(e => e.sessionId === sessionId && e.type === 'git_commit')
        .map(e => e.data['hash'] as string);
      const knownSet = new Set(known);
      for (const commit of commits) {
        if (!knownSet.has(commit.hash)) {
          this.events.add(sessionId, 'git_commit', '', {
            hash: commit.hash,
            message: commit.message.slice(0, 200),
            author: commit.author,
            timestamp: commit.timestamp,
            filesChanged: commit.filesChanged,
          });
          if (this.baselineLoaded) this.onCommit?.(projectId, commit.hash, commit.message);
        }
      }
      this.baselineLoaded = true;
    } catch { /* git not available */ }
  }

  dispose(): void { this.stop(); }
}
