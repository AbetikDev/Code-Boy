import type { Database } from '../Database';
import type { CBTodo } from '../types';
import { nanoid } from '../util';

export class TodoRepository {
  constructor(private readonly db: Database) {}

  upsert(projectId: string, file: string, line: number, text: string, tag: CBTodo['tag']): CBTodo {
    const todos = this.db.get('todos');
    const existing = todos.find(t => t.projectId === projectId && t.file === file && t.line === line && t.tag === tag);
    if (existing) {
      existing.text = text;
      existing.lastSeen = Date.now();
      existing.status = 'open';
      this.db.set('todos', todos);
      return existing;
    }
    const todo: CBTodo = {
      id: nanoid(),
      projectId,
      file,
      line,
      text,
      tag,
      status: 'open',
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };
    this.db.set('todos', [...todos, todo]);
    return todo;
  }

  resolveByLocation(projectId: string, file: string, line: number): void {
    const todos = this.db.get('todos');
    const todo = todos.find(t => t.projectId === projectId && t.file === file && t.line === line);
    if (todo) { todo.status = 'resolved'; this.db.set('todos', todos); }
  }

  openForProject(projectId: string, limit = 20): CBTodo[] {
    return [...this.db.get('todos')]
      .filter(t => t.projectId === projectId && t.status === 'open')
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }

  forFile(projectId: string, file: string): CBTodo[] {
    return this.db.get('todos').filter(t => t.projectId === projectId && t.file === file && t.status === 'open');
  }
}
