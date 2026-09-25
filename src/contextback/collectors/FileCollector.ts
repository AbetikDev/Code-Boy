import * as vscode from 'vscode';
import type { CBSettings } from '../types';
import type { EventRepository } from '../repositories/EventRepository';
import type { FileActivityRepository } from '../repositories/FileActivityRepository';
import { isExcluded } from '../util';

/** Debounced file-activity collector — never records file contents. */
export class FileCollector implements vscode.Disposable {
  private readonly subs: vscode.Disposable[] = [];
  private pendingEdits = new Map<string, ReturnType<typeof setTimeout>>();
  private activeFileOpenedAt: number | null = null;
  private activeFilePath: string | null = null;

  constructor(
    private readonly events: EventRepository,
    private readonly fileActivity: FileActivityRepository,
    private getContext: () => { projectId: string; sessionId: string } | null,
    private settings: CBSettings
  ) {
    this.subs.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.onOpen(doc)),
      vscode.workspace.onDidSaveTextDocument(doc => this.onSave(doc)),
      vscode.workspace.onDidChangeTextDocument(e => this.onEdit(e)),
      vscode.window.onDidChangeActiveTextEditor(editor => this.onActiveChange(editor)),
    );
    if (vscode.window.activeTextEditor) {
      this.trackActiveFile(vscode.window.activeTextEditor.document.uri.fsPath);
    }
  }

  updateSettings(settings: CBSettings): void { this.settings = settings; }

  private onOpen(doc: vscode.TextDocument): void {
    const ctx = this.getContext();
    if (!ctx || doc.uri.scheme !== 'file') return;
    const file = doc.uri.fsPath;
    if (isExcluded(file, this.settings.exclude)) return;
    this.fileActivity.touch(ctx.projectId, file, 'open');
    this.events.add(ctx.sessionId, 'file_open', file, {});
  }

  private onSave(doc: vscode.TextDocument): void {
    const ctx = this.getContext();
    if (!ctx || doc.uri.scheme !== 'file') return;
    const file = doc.uri.fsPath;
    if (isExcluded(file, this.settings.exclude)) return;
    this.fileActivity.touch(ctx.projectId, file, 'save');
    this.events.add(ctx.sessionId, 'file_save', file, {});
  }

  private onEdit(event: vscode.TextDocumentChangeEvent): void {
    if (!event.contentChanges.length || event.document.uri.scheme !== 'file') return;
    const ctx = this.getContext();
    if (!ctx) return;
    const file = event.document.uri.fsPath;
    if (isExcluded(file, this.settings.exclude)) return;
    // Debounce per-file: record at most one edit event per 2s
    const existing = this.pendingEdits.get(file);
    if (existing) return;
    this.pendingEdits.set(file, setTimeout(() => {
      this.pendingEdits.delete(file);
      const c = this.getContext();
      if (!c) return;
      this.fileActivity.touch(c.projectId, file, 'edit');
      this.events.add(c.sessionId, 'file_activity', file, {});
    }, 2000));
  }

  private onActiveChange(editor: vscode.TextEditor | undefined): void {
    const now = Date.now();
    // Accumulate time on previous file
    if (this.activeFilePath && this.activeFileOpenedAt) {
      const secs = Math.min(1800, (now - this.activeFileOpenedAt) / 1000);
      const ctx = this.getContext();
      if (ctx && secs > 1) this.fileActivity.addTime(ctx.projectId, this.activeFilePath, secs);
    }
    if (editor?.document.uri.scheme === 'file') {
      this.trackActiveFile(editor.document.uri.fsPath);
    } else {
      this.activeFilePath = null;
      this.activeFileOpenedAt = null;
    }
  }

  private trackActiveFile(path: string): void {
    this.activeFilePath = path;
    this.activeFileOpenedAt = Date.now();
  }

  dispose(): void {
    for (const t of this.pendingEdits.values()) clearTimeout(t);
    this.pendingEdits.clear();
    this.subs.forEach(s => s.dispose());
  }
}
