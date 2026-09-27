import * as vscode from 'vscode';
import type { CBSettings, CBTerminalCommand } from '../types';
import type { Database } from '../Database';
import type { EventRepository } from '../repositories/EventRepository';
import { testCommandKey } from '../core/TestCommands';

/** Records terminal command metadata (command string, exit code, duration).
 *  NEVER reads terminal output. */
export class TerminalCollector implements vscode.Disposable {
  private readonly subs: vscode.Disposable[] = [];
  private readonly running = new Map<string, { command: string; cwd: string; startTime: number }>();

  constructor(
    private readonly db: Database,
    private readonly events: EventRepository,
    private getContext: () => { projectId: string; sessionId: string } | null,
    private settings: CBSettings,
    private onHealthChanged?: (projectId: string) => void
  ) {
    this.subs.push(
      vscode.window.onDidStartTerminalShellExecution(e => this.onStart(e)),
      vscode.window.onDidEndTerminalShellExecution(e => this.onEnd(e)),
    );
  }

  updateSettings(settings: CBSettings): void {
    this.settings = settings;
    if (!settings.trackTerminalCommands) {
      this.running.clear();
    }
  }

  private onStart(e: vscode.TerminalShellExecutionStartEvent): void {
    if (!this.settings.trackTerminalCommands) return;
    const key = this.terminalKey(e.terminal);
    const cmd = e.execution.commandLine?.value ?? '';
    // Security: skip anything that looks like it may contain secrets
    if (this.looksLikeSensitive(cmd)) return;
    const cwd = e.execution.cwd?.fsPath ?? '';
    this.running.set(key, { command: cmd.slice(0, 512), cwd, startTime: Date.now() });
  }

  private onEnd(e: vscode.TerminalShellExecutionEndEvent): void {
    const key = this.terminalKey(e.terminal);
    const start = this.running.get(key);
    this.running.delete(key);
    if (!this.settings.trackTerminalCommands || !start) return;
    if (this.looksLikeSensitive(start.command)) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = Date.now();
    const rec: CBTerminalCommand = {
      projectId: ctx.projectId,
      command: start.command,
      cwd: start.cwd,
      startTime: start.startTime,
      endTime: now,
      exitCode: e.exitCode ?? null,
      duration: Math.round((now - start.startTime) / 1000),
    };
    const cmds = this.db.get('terminalCommands');
    this.db.set('terminalCommands', [...cmds, rec]);
    if (ctx) {
      this.events.add(ctx.sessionId, 'terminal_command', '', { command: rec.command, exitCode: rec.exitCode, duration: rec.duration });
      if (rec.exitCode !== null && testCommandKey(rec.command)) this.onHealthChanged?.(ctx.projectId);
    }
  }

  private terminalKey(terminal: vscode.Terminal): string {
    return String((terminal as unknown as { name: string }).name);
  }

  looksLikeSensitive(cmd: string): boolean {
    const lower = cmd.toLowerCase();
    return /password|passwd|passphrase|secret|token|bearer\s+[a-z0-9_\-\.]|api[_-]?key|access[_-]?token|private[_-]?key|-----begin (?:rsa |ec )?private key-----|\.env|credentials|id_rsa|id_ed25519|id_ecdsa|id_dsa|\.pem\b|\.key\b|aws_access_key_id|aws_secret_access_key|auth\b|authorization\b/i.test(lower);
  }

  dispose(): void { this.running.clear(); this.subs.forEach(s => s.dispose()); }
}
