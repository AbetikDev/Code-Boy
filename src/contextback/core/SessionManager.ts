import type { CBSession, CBSettings } from '../types';
import type { Database } from '../Database';
import type { GitService } from '../git/GitService';
import { SessionRepository } from '../repositories/SessionRepository';

/** Manages automatic session lifecycle based on inactivity timeout. */
export class SessionManager {
  private readonly repo: SessionRepository;
  private currentSession: CBSession | undefined;
  private lastActivityAt = 0;
  private inactivityTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly db: Database,
    private readonly git: GitService,
    private settings: CBSettings,
    private onSessionEnd?: (session: CBSession) => void
  ) {
    this.repo = new SessionRepository(db);
  }

  updateSettings(settings: CBSettings): void {
    this.settings = settings;
  }

  /** Must be called after ProjectManager.initWorkspace() returns a project. */
  async startForProject(projectId: string, root: string): Promise<CBSession> {
    this.recoverPrevious(projectId);

    const branch = await this.git.getCurrentBranch(root).catch(() => 'main');
    const branchRec = this.repo.findOrCreateBranch(projectId, branch);
    this.currentSession = this.repo.startSession(projectId, branchRec.id);
    this.lastActivityAt = Date.now();
    return this.currentSession;
  }

  /** Recover a session left open by a crashed host at its last recorded activity. */
  recoverPrevious(projectId: string): CBSession | undefined {
    const dangling = this.repo.getActive(projectId);
    if (!dangling) return undefined;
    const lastEventAt = this.db.get('events')
      .filter(event => event.sessionId === dangling.id)
      .reduce((latest, event) => Math.max(latest, event.timestamp), dangling.startedAt);
    return this.repo.endSession(dangling.id, Math.min(Date.now(), lastEventAt));
  }

  touch(): void {
    this.lastActivityAt = Date.now();
    this.resetInactivityTimer();
  }

  get current(): CBSession | undefined { return this.currentSession; }

  endCurrent(): CBSession | undefined {
    if (!this.currentSession) return undefined;
    const ended = this.repo.endSession(this.currentSession.id);
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = undefined; }
    if (ended) this.onSessionEnd?.(ended);
    this.currentSession = undefined;
    return ended;
  }

  setSummary(summary: string): void {
    if (this.currentSession) this.repo.updateSummary(this.currentSession.id, summary);
  }

  dispose(): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    // Don't end session on dispose — allow continuing on next open
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    const ms = this.settings.sessionTimeoutMinutes * 60 * 1000;
    this.inactivityTimer = setTimeout(() => {
      if (this.currentSession && Date.now() - this.lastActivityAt >= ms) {
        this.endCurrent();
      }
    }, ms);
  }
}
