import type { CBError, CBSession, CBTodo, CBOpenThread } from '../types';

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

    // Full paths avoid collisions between files with the same basename.
    const topics = new Map<string, { errors: Map<string, CBError>; todos: Map<string, CBTodo>; lastTouched: number }>();

    for (const input of inputs) {
      const allFiles = [...input.errors.map(e => e.file), ...input.todos.map(t => t.file)];
      for (const file of allFiles) {
        const existing = topics.get(file) ?? { errors: new Map(), todos: new Map(), lastTouched: 0 };
        for (const e of input.errors) if (e.file === file) { existing.errors.set(e.fingerprint, e); existing.lastTouched = Math.max(existing.lastTouched, e.lastSeen); }
        for (const t of input.todos) if (t.file === file) { existing.todos.set(t.id, t); existing.lastTouched = Math.max(existing.lastTouched, t.lastSeen); }
        topics.set(file, existing);
      }
    }

    for (const [filePath, data] of topics) {
      const openErrors = [...data.errors.values()].filter(e => !e.resolved);
      const openTodos = [...data.todos.values()].filter(t => t.status === 'open');
      if (!openErrors.length && !openTodos.length) continue;

      let score = 0;
      const activeErrors = openErrors.filter(e => e.severity === 'error');
      if (activeErrors.length > 0) score += 0.35;
      else if (openErrors.length > 0) score += 0.15;
      if (openTodos.length > 0) score += 0.25;
      const recentError = activeErrors.some(e => Date.now() - e.lastSeen < 3 * 86400000);
      const ageDays = (Date.now() - data.lastTouched) / 86400000;
      if (recentError) score += 0.3;
      else if (ageDays < 3) score += 0.2;

      const signal: CBOpenThread['signal'] = activeErrors.length && (recentError || openTodos.length) ? 'red' : score > 0.3 ? 'yellow' : 'green';
      const lastError = (activeErrors[0] ?? openErrors[0])?.message ?? '';

      threads.push({
        id: filePath,
        title: basename(filePath),
        filePath,
        blockerIds: activeErrors.map(e => `diagnostic:${e.projectId}:${e.fingerprint}`),
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
