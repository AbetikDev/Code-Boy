import type { Database } from '../Database';
import type { CBEvent, CBEventType } from '../types';
import { nanoid } from '../util';

export class EventRepository {
  constructor(private readonly db: Database) {}

  add(sessionId: string, type: CBEventType, filePath: string, data: Record<string, unknown>): CBEvent {
    const event: CBEvent = {
      id: nanoid(),
      sessionId,
      type,
      timestamp: Date.now(),
      filePath,
      data,
    };
    this.db.set('events', [...this.db.get('events'), event]);
    return event;
  }

  forSession(sessionId: string): CBEvent[] {
    return this.db.get('events').filter(e => e.sessionId === sessionId);
  }

  lastN(sessionId: string, n: number): CBEvent[] {
    return this.db.get('events')
      .filter(e => e.sessionId === sessionId)
      .slice(-n);
  }

  recentFilesForSession(sessionId: string, limit = 10): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const event of [...this.db.get('events')]
      .filter(e => e.sessionId === sessionId && e.filePath)
      .reverse()) {
      if (!seen.has(event.filePath) && event.filePath !== '') {
        seen.add(event.filePath);
        result.push(event.filePath);
        if (result.length >= limit) break;
      }
    }
    return result;
  }
}
