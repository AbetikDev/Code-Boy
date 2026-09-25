import type { Database } from '../Database';
import type { CBBranch, CBSession } from '../types';
import { nanoid } from '../util';

export class SessionRepository {
  constructor(private readonly db: Database) {}

  findOrCreateBranch(projectId: string, branchName: string): CBBranch {
    const branches = this.db.get('branches');
    const id = `${projectId}:${branchName}`;
    let branch = branches.find(b => b.id === id);
    if (!branch) {
      branch = { id, projectId, name: branchName, lastSeenAt: Date.now() };
      this.db.set('branches', [...branches, branch]);
    } else {
      branch.lastSeenAt = Date.now();
      this.db.set('branches', branches);
    }
    return branch;
  }

  startSession(projectId: string, branchId: string): CBSession {
    const session: CBSession = {
      id: nanoid(),
      projectId,
      branchId,
      startedAt: Date.now(),
      endedAt: null,
      durationSecs: 0,
      summary: '',
    };
    this.db.set('sessions', [...this.db.get('sessions'), session]);
    return session;
  }

  endSession(sessionId: string): CBSession | undefined {
    const sessions = this.db.get('sessions');
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return undefined;
    session.endedAt = Date.now();
    session.durationSecs = Math.round((session.endedAt - session.startedAt) / 1000);
    this.db.set('sessions', sessions);
    return session;
  }

  updateSummary(sessionId: string, summary: string): void {
    const sessions = this.db.get('sessions');
    const session = sessions.find(s => s.id === sessionId);
    if (session) { session.summary = summary; this.db.set('sessions', sessions); }
  }

  getLastCompleted(projectId: string): CBSession | undefined {
    return [...this.db.get('sessions')]
      .filter(s => s.projectId === projectId && s.endedAt !== null)
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
  }

  getForProject(projectId: string, limit = 50): CBSession[] {
    return [...this.db.get('sessions')]
      .filter(s => s.projectId === projectId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  getById(id: string): CBSession | undefined {
    return this.db.get('sessions').find(s => s.id === id);
  }

  getActive(projectId: string): CBSession | undefined {
    return this.db.get('sessions').find(s => s.projectId === projectId && s.endedAt === null);
  }
}
