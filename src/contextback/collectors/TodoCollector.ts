import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { CBSettings, CBTodo } from '../types';
import type { TodoRepository } from '../repositories/TodoRepository';

const TODO_RE = /\/\/\s*(TODO|FIXME|HACK|XXX)[:\s]+(.+)/gi;
const SUPPORTED_SCHEMES = new Set(['file']);

export class TodoCollector implements vscode.Disposable {
  private readonly subs: vscode.Disposable[] = [];
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly todos: TodoRepository,
    private getContext: () => { projectId: string; sessionId: string } | null,
    private settings: CBSettings
  ) {
    this.subs.push(
      vscode.workspace.onDidSaveTextDocument(doc => this.scheduleScan(doc)),
    );
  }

  updateSettings(settings: CBSettings): void { this.settings = settings; }

  private scheduleScan(doc: vscode.TextDocument): void {
    if (!this.settings.trackTodos) return;
    if (!SUPPORTED_SCHEMES.has(doc.uri.scheme)) return;
    const file = doc.uri.fsPath;
    const existing = this.pending.get(file);
    if (existing) clearTimeout(existing);
    this.pending.set(file, setTimeout(() => { this.pending.delete(file); this.scanFile(doc); }, 1500));
  }

  private scanFile(doc: vscode.TextDocument): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const { projectId } = ctx;
    const text = doc.getText();
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      TODO_RE.lastIndex = 0;
      const match = TODO_RE.exec(line);
      if (match) {
        const tag = (match[1]?.toUpperCase() ?? 'TODO') as CBTodo['tag'];
        const text = match[2]?.trim().slice(0, 200) ?? '';
        this.todos.upsert(projectId, doc.uri.fsPath, i, text, tag);
      }
    }
  }

  /** Scan a file from disk (used on startup for recently changed files). */
  async scanPath(projectId: string, filePath: string): Promise<void> {
    if (!this.settings.trackTodos) return;
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        TODO_RE.lastIndex = 0;
        const match = TODO_RE.exec(line);
        if (match) {
          const tag = (match[1]?.toUpperCase() ?? 'TODO') as CBTodo['tag'];
          const todoText = match[2]?.trim().slice(0, 200) ?? '';
          this.todos.upsert(projectId, filePath, i, todoText, tag);
        }
      }
    } catch { /* file may be binary or inaccessible */ }
  }

  dispose(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    this.subs.forEach(s => s.dispose());
  }
}
