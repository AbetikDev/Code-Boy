import * as vscode from 'vscode';
import type { CBSettings, CBTerminalCommand } from '../types';
import type { Database } from '../Database';
import type { EventRepository } from '../repositories/EventRepository';

/** Records terminal command metadata (command string, exit code, duration).
 *  NEVER reads terminal output. */
export class TerminalCollector implements vscode.Disposable {
  private readonly subs: vscode.Disposable[] = [];
  private readonly running = new Map<string, { command: string; cwd: string; startTime: number }>();

  constructor(
    private readonly db: Database,
    private readonly events: EventRepository,
    private getContext: () => { projectId: string; sessionId: string } | null,
    private settings: CBSettings
  ) {
    this.subs.push(
      vscode.window.onDidStartTerminalShellExecution(e => this.onStart(e)),
      vscode.window.onDidEndTerminalShellExecution(e => this.onEnd(e)),
    );
  }

  updateSettings(settings: CBSettings): void { this.settings = settings; }

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
    if (!this.settings.trackTerminalCommands) return;
    const key = this.terminalKey(e.terminal);
    const start = this.running.get(key);
    this.running.delete(key);
    if (!start) return;
    const ctx = this.getContext();
    const now = Date.now();
    const rec: CBTerminalCommand = {
      command: start.command,
      cwd: start.cwd,
      startTime: start.startTime,
      endTime: now,
      exitCode: e.exitCode ?? null,
      duration: Math.round((now - start.startTime) / 1000),
    };
    const cmds = this.db.get('terminalCommands');
    this.db.set('terminalCommands', [...cmds, rec]);
    if (ctx) this.events.add(ctx.sessionId, 'terminal_command', '', { command: rec.command, exitCode: rec.exitCode, duration: rec.duration });
  }

  private terminalKey(terminal: vscode.Terminal): string {
    return String((terminal as unknown as { name: string }).name);
  }

  private looksLikeSensitive(cmd: string): boolean {
    const lower = cmd.toLowerCase();
    return /password|secret|token|api.?key|private.?key|\.env|credentials/.test(lower);
  }

  dispose(): void { this.running.clear(); this.subs.forEach(s => s.dispose()); }
}
