import type { Database } from '../Database';
import type { CBFileActivity } from '../types';
import { nanoid } from '../util';

export class FileActivityRepository {
  constructor(private readonly db: Database) {}

  touch(projectId: string, filePath: string, kind: 'open' | 'edit' | 'save'): void {
    const all = this.db.get('fileActivity');
    let rec = all.find(f => f.projectId === projectId && f.path === filePath);
    if (!rec) {
      rec = { id: nanoid(), projectId, path: filePath, opens: 0, edits: 0, saves: 0, timeSpentSecs: 0, lastActivity: Date.now() };
      all.push(rec);
    }
    if (kind === 'open') rec.opens++;
    else if (kind === 'edit') rec.edits++;
    else if (kind === 'save') rec.saves++;
    rec.lastActivity = Date.now();
    this.db.set('fileActivity', all);
  }

  addTime(projectId: string, filePath: string, secs: number): void {
    const all = this.db.get('fileActivity');
    const rec = all.find(f => f.projectId === projectId && f.path === filePath);
    if (rec) { rec.timeSpentSecs += secs; this.db.set('fileActivity', all); }
  }

  topFiles(projectId: string, limit = 5): CBFileActivity[] {
    return [...this.db.get('fileActivity')]
      .filter(f => f.projectId === projectId)
      .sort((a, b) => b.timeSpentSecs - a.timeSpentSecs)
      .slice(0, limit);
  }

  recentFiles(projectId: string, limit = 10): CBFileActivity[] {
    return [...this.db.get('fileActivity')]
      .filter(f => f.projectId === projectId)
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, limit);
  }
}
