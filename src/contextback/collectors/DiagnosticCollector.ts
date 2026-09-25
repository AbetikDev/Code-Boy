import * as vscode from 'vscode';
import type { CBSettings } from '../types';
import { ErrorRepository } from '../repositories/ErrorRepository';
import type { EventRepository } from '../repositories/EventRepository';
import { isExcluded } from '../util';

export class DiagnosticCollector implements vscode.Disposable {
  private readonly sub: vscode.Disposable;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private knownFingerprints = new Set<string>();

  constructor(
    private readonly errors: ErrorRepository,
    private readonly events: EventRepository,
    private getContext: () => { projectId: string; sessionId: string } | null,
    private settings: CBSettings
  ) {
    this.sub = vscode.languages.onDidChangeDiagnostics(() => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.scan(), 2000);
    });
  }

  updateSettings(settings: CBSettings): void { this.settings = settings; }

  private scan(): void {
    if (!this.settings.trackDiagnostics) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const { projectId, sessionId } = ctx;

    for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
      if (uri.scheme !== 'file') continue;
      const file = uri.fsPath;
      if (isExcluded(file, this.settings.exclude)) continue;
      for (const d of diagnostics) {
        if (d.severity !== vscode.DiagnosticSeverity.Error && d.severity !== vscode.DiagnosticSeverity.Warning) continue;
        const severity = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning';
        const fp = ErrorRepository.fingerprint(file, d.range.start.line, d.message);
        if (this.knownFingerprints.has(fp)) continue;
        this.knownFingerprints.add(fp);
        const rec = this.errors.upsert(projectId, sessionId, file, d.range.start.line, d.message.slice(0, 300), severity);
        this.events.add(sessionId, 'diagnostic', file, { fingerprint: fp, line: d.range.start.line, severity, message: rec.message });
      }
    }
    // Auto-resolve errors no longer present
    for (const e of this.errors.openForProject(projectId)) {
      const uri = vscode.Uri.file(e.file);
      const diagnostics = vscode.languages.getDiagnostics(uri);
      const still = diagnostics.some(d => ErrorRepository.fingerprint(e.file, d.range.start.line, d.message) === e.fingerprint);
      if (!still) {
        this.errors.resolveByFingerprint(projectId, e.fingerprint);
        this.knownFingerprints.delete(e.fingerprint);
      }
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.sub.dispose();
  }
}
