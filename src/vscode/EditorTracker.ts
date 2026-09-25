import * as vscode from 'vscode';
import { ActivityEvent } from '../models/types';

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
        if (['output', 'vscode', 'vscode-chat-code-block'].includes(event.document.uri.scheme)) return;
        this.pendingCharacters = Math.min(500, this.pendingCharacters + event.contentChanges.reduce((n, c) => n + Math.max(1, Math.min(100, c.text.length + c.rangeLength)), 0));
        this.pendingLanguage = event.document.languageId;
        if (!this.timer) this.timer = setTimeout(() => this.flush(), 500);
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) this.emit({ type: 'editor', languageId: editor.document.languageId });
      }),
      vscode.workspace.onDidSaveTextDocument(document => {
        this.emit({ type: 'save', languageId: document.languageId });
      }),
      vscode.window.onDidChangeWindowState(state => {
        if (!state.focused) this.flush();
        this.emit({ type: 'focus', focused: state.focused });
      })
    );
    if (vscode.window.activeTextEditor) this.emit({ type: 'editor', languageId: vscode.window.activeTextEditor.document.languageId });
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
