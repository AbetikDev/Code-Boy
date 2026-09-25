import * as vscode from 'vscode';
import { ActivityEvent } from '../models/types';

export class DiagnosticsTracker implements vscode.Disposable {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private previousErrors: number;
  private readonly listener: vscode.Disposable;
  constructor(private readonly emit: (event: ActivityEvent) => void) {
    this.previousErrors = this.count();
    this.listener = vscode.languages.onDidChangeDiagnostics(() => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        const errors = this.count();
        if (errors !== this.previousErrors) this.emit({ type: 'diagnostics', errors, previousErrors: this.previousErrors });
        this.previousErrors = errors;
      }, 1500);
    });
  }
  private count(): number {
    let count = 0;
    for (const [, diagnostics] of vscode.languages.getDiagnostics()) {
      for (const diagnostic of diagnostics) if (diagnostic.severity === vscode.DiagnosticSeverity.Error) count++;
    }
    return count;
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.listener.dispose();
  }
}
