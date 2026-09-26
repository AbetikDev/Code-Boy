import * as vscode from 'vscode';
import { ActivityEvent } from '../models/types';
import { isEligibleCodingFile } from '../intelligence/CodingBehaviorAnalyzer';

/** Emits numeric activity only; document contents never leave this callback. */
export class EditorTracker implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private pendingCharacters = 0;
  private pendingLanguage = 'plaintext';
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly emit: (event: ActivityEvent) => void) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (!event.contentChanges.length || event.document !== vscode.window.activeTextEditor?.document || !vscode.window.state.focused) return;
        if (event.document.uri.scheme !== 'file' || event.reason !== undefined) return;
        const folder = vscode.workspace.getWorkspaceFolder(event.document.uri);
        if (!folder || folder.index !== 0) return; // ContextBack tracks the first workspace root.
        const excluded = vscode.workspace.getConfiguration('contextBack').get<string[]>('exclude') ?? [];
        if (!isEligibleCodingFile(event.document.uri.fsPath, event.document.languageId, excluded)) return;
        let insertedChars = 0;
        let deletedChars = 0;
        let insertedLines = 0;
        for (const change of event.contentChanges) {
          insertedChars += change.text.length;
          deletedChars += change.rangeLength;
          insertedLines += (change.text.match(/\n/g) ?? []).length;
        }
        // Formatting and workspace refactors usually replace large existing ranges or
        // deliver many changes at once. They should not count as manual edits.
        if (event.contentChanges.length >= 5 ||
          (deletedChars >= 300 && insertedChars >= 300 && insertedChars / deletedChars >= 0.5)) return;
        this.emit({ type: 'codingEdit', sample: { timestamp: Date.now(), insertedChars, deletedChars, insertedLines,
          languageId: event.document.languageId }, documentLines: event.document.lineCount });
        this.pendingCharacters = Math.min(500, this.pendingCharacters + event.contentChanges.reduce((n, c) => n + Math.max(1, Math.min(100, c.text.length + c.rangeLength)), 0));
        this.pendingLanguage = event.document.languageId;
        if (!this.timer) this.timer = setTimeout(() => this.flush(), 500);
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) this.emit({ type: 'editor', languageId: editor.document.languageId, documentLines: editor.document.lineCount });
      }),
      vscode.workspace.onDidSaveTextDocument(document => {
        this.emit({ type: 'save', languageId: document.languageId });
      }),
      vscode.window.onDidChangeWindowState(state => {
        if (!state.focused) this.flush();
        this.emit({ type: 'focus', focused: state.focused });
      })
    );
    if (vscode.window.activeTextEditor) this.emit({ type: 'editor', languageId: vscode.window.activeTextEditor.document.languageId,
      documentLines: vscode.window.activeTextEditor.document.lineCount });
    this.emit({ type: 'focus', focused: vscode.window.state.focused });
  }
  private flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pendingCharacters) this.emit({ type: 'typing', characters: this.pendingCharacters, languageId: this.pendingLanguage });
    this.pendingCharacters = 0;
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.subscriptions.forEach(item => item.dispose());
  }
}
