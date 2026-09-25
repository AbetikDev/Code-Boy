import { createHash } from 'node:crypto';
import type { Database } from '../Database';
import type { CBError } from '../types';
import { nanoid } from '../util';

export class ErrorRepository {
  constructor(private readonly db: Database) {}

  static fingerprint(file: string, line: number, message: string): string {
    return createHash('sha1').update(`${file}:${line}:${message}`).digest('hex').slice(0, 12);
  }

  upsert(projectId: string, sessionId: string, file: string, line: number, message: string, severity: CBError['severity']): CBError {
    const fingerprint = ErrorRepository.fingerprint(file, line, message);
    const errors = this.db.get('errors');
    let existing = errors.find(e => e.projectId === projectId && e.fingerprint === fingerprint);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.sessionId = sessionId;
      existing.resolved = false;
      this.db.set('errors', errors);
      return existing;
    }
    const error: CBError = {
      id: nanoid(),
      projectId,
      sessionId,
      fingerprint,
      file,
      line,
      message,
      severity,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      resolved: false,
    };
    this.db.set('errors', [...errors, error]);
    return error;
  }

  resolveByFingerprint(projectId: string, fingerprint: string): void {
    const errors = this.db.get('errors');
    const error = errors.find(e => e.projectId === projectId && e.fingerprint === fingerprint);
    if (error) { error.resolved = true; this.db.set('errors', errors); }
  }

  openForProject(projectId: string): CBError[] {
    return this.db.get('errors').filter(e => e.projectId === projectId && !e.resolved);
  }

  recentForSession(sessionId: string, limit = 5): CBError[] {
    return [...this.db.get('errors')]
      .filter(e => e.sessionId === sessionId)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }
}
