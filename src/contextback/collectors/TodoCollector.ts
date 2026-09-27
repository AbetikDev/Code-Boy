import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { CBSettings, CBTodo } from '../types';
import type { TodoRepository } from '../repositories/TodoRepository';
import { isExcluded } from '../util';

const TODO_RE = /\/\/\s*(TODO|FIXME|HACK|XXX)[:\s]+(.+)/gi;
const SUPPORTED_SCHEMES = new Set(['file']);

export class TodoCollector implements vscode.Disposable {
  private readonly subs: vscode.Disposable[] = [];
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly todos: TodoRepository,
    private getContext: () => { projectId: string; sessionId: string } | null,
    private settings: CBSettings,
    private onChange?: (projectId: string) => void,
  ) {
    this.subs.push(
      vscode.workspace.onDidSaveTextDocument(doc => this.scheduleScan(doc)),
    );
  }

  updateSettings(settings: CBSettings): void {
    this.settings = settings;
    for (const [file, timer] of this.pending.entries()) {
      if (!settings.trackTodos || isExcluded(file, settings.exclude)) {
        clearTimeout(timer);
        this.pending.delete(file);
      }
    }
  }

  private scheduleScan(doc: vscode.TextDocument): void {
    if (!this.settings.trackTodos) return;
    if (!SUPPORTED_SCHEMES.has(doc.uri.scheme)) return;
    const file = doc.uri.fsPath;
    if (isExcluded(file, this.settings.exclude)) return;
    const existing = this.pending.get(file);
    if (existing) clearTimeout(existing);
    this.pending.set(file, setTimeout(() => { this.pending.delete(file); this.scanFile(doc); }, 1500));
  }

  private scanFile(doc: vscode.TextDocument): void {
    const ctx = this.getContext();
    if (!ctx || !this.settings.trackTodos || isExcluded(doc.uri.fsPath, this.settings.exclude)) return;
    this.scanText(ctx.projectId, doc.uri.fsPath, doc.getText());
  }

  private scanText(projectId: string, file: string, text: string): void {
    const lines = text.split('\n');
    const active = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      TODO_RE.lastIndex = 0;
      const match = TODO_RE.exec(line);
      if (match) {
        const tag = (match[1]?.toUpperCase() ?? 'TODO') as CBTodo['tag'];
        const text = match[2]?.trim().slice(0, 200) ?? '';
        active.add(`${i}:${tag}`);
        this.todos.upsert(projectId, file, i, text, tag);
      }
    }
    this.todos.resolveMissingForFile(projectId, file, active);
    this.onChange?.(projectId);
  }

  /** Scan a file from disk (used on startup for recently changed files). */
  async scanPath(projectId: string, filePath: string): Promise<void> {
    if (!this.settings.trackTodos || isExcluded(filePath, this.settings.exclude)) return;
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      this.scanText(projectId, filePath, text);
    } catch {
      // A deleted file cannot contain an open TODO. Preserve entries for unreadable files.
      if (!fs.existsSync(filePath) && this.todos.resolveMissingForFile(projectId, filePath, new Set())) {
        this.onChange?.(projectId);
      }
    }
  }

  dispose(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    this.subs.forEach(s => s.dispose());
  }
}
