import * as vscode from 'vscode';
import { ActivityEvent } from '../models/types';
import { isEligibleCodingFile } from '../intelligence/CodingBehaviorAnalyzer';

export class DiagnosticsTracker implements vscode.Disposable {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private previousErrors: number;
  private previousWarnings: number;
  private readonly listeners: vscode.Disposable[];
  constructor(private readonly emit: (event: ActivityEvent) => void) {
    const initial = this.count();
    this.previousErrors = initial.errors;
    this.previousWarnings = initial.warnings;
    this.emit({ type: 'diagnostics', errors: initial.errors, previousErrors: initial.errors, warnings: initial.warnings });
    const recount = (): void => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        const { errors, warnings } = this.count();
        if (errors !== this.previousErrors || warnings !== this.previousWarnings)
          this.emit({ type: 'diagnostics', errors, previousErrors: this.previousErrors, warnings });
        this.previousErrors = errors;
        this.previousWarnings = warnings;
      }, 1500);
    };
    this.listeners = [vscode.languages.onDidChangeDiagnostics(recount),
      vscode.workspace.onDidChangeWorkspaceFolders(recount),
      vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('contextBack.exclude')) recount(); })];
  }
  private count(): { errors: number; warnings: number } {
    let errors = 0;
    let warnings = 0;
    const excluded = vscode.workspace.getConfiguration('contextBack').get<string[]>('exclude') ?? [];
    for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
      if (uri.scheme !== 'file' || vscode.workspace.getWorkspaceFolder(uri)?.index !== 0 ||
        !isEligibleCodingFile(uri.fsPath, undefined, excluded)) continue;
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === vscode.DiagnosticSeverity.Error) errors++;
        else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) warnings++;
      }
    }
    return { errors, warnings };
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.forEach(listener => listener.dispose());
  }
}
