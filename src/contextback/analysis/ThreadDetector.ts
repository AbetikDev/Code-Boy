import type { CBError, CBSession, CBTodo, CBOpenThread } from '../types';
import { timeAgo } from '../util';

interface ThreadInput {
  sessionId: string;
  errors: CBError[];
  todos: CBTodo[];
  session: CBSession;
  hasUncommittedChanges: boolean;
  hasSuccessfulTestAfterError: boolean;
}

export class ThreadDetector {
  detect(inputs: ThreadInput[]): CBOpenThread[] {
    const threads: CBOpenThread[] = [];

    // Group errors and todos by a rough "topic" — file basename
    const topics = new Map<string, { errors: CBError[]; todos: CBTodo[]; lastTouched: number; sessions: CBSession[] }>();

    for (const input of inputs) {
      const allFiles = [...input.errors.map(e => e.file), ...input.todos.map(t => t.file)];
      for (const file of allFiles) {
        const key = basename(file);
        const existing = topics.get(key) ?? { errors: [], todos: [], lastTouched: 0, sessions: [] };
        for (const e of input.errors) if (e.file === file) existing.errors.push(e);
        for (const t of input.todos) if (t.file === file) existing.todos.push(t);
        existing.lastTouched = Math.max(existing.lastTouched, input.session.endedAt ?? input.session.startedAt);
        if (!existing.sessions.includes(input.session)) existing.sessions.push(input.session);
        topics.set(key, existing);
      }
    }

    for (const [key, data] of topics) {
      const openErrors = data.errors.filter(e => !e.resolved);
      const openTodos = data.todos.filter(t => t.status === 'open');
      if (!openErrors.length && !openTodos.length) continue;

      let score = 0;
      if (openErrors.length > 0) score += 0.35;
      if (openTodos.length > 0) score += 0.25;
      // Penalize if it's been a long time (might be stale)
      const ageDays = (Date.now() - data.lastTouched) / 86400000;
      if (ageDays < 1) score += 0.2;
      else if (ageDays < 3) score += 0.1;

      const signal: CBOpenThread['signal'] = score > 0.6 ? 'red' : score > 0.3 ? 'yellow' : 'green';
      const lastError = openErrors[0]?.message ?? '';

      threads.push({
        id: key,
        title: key,
        lastTouched: data.lastTouched,
        lastError: lastError.slice(0, 100),
        unfinishedScore: Math.min(1, score),
        signal,
        todoCount: openTodos.length,
      });
    }

    return threads.sort((a, b) => b.unfinishedScore - a.unfinishedScore);
  }
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}
