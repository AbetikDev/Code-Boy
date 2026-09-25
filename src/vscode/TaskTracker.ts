import * as vscode from 'vscode';
import { ActivityEvent } from '../models/types';

function kind(task: vscode.Task): 'build' | 'test' | 'task' {
  return task.group?.id === vscode.TaskGroup.Build.id ? 'build' : task.group?.id === vscode.TaskGroup.Test.id ? 'test' : 'task';
}
export class TaskTracker implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[];
  private readonly finished = new WeakSet<vscode.TaskExecution>();
  constructor(emit: (event: ActivityEvent) => void) {
    this.subscriptions = [
      vscode.tasks.onDidStartTask(event => emit({ type: 'taskStart', kind: kind(event.execution.task) })),
      vscode.tasks.onDidEndTaskProcess(event => {
        // An unknown exit status is cancellation, never a successful build.
        if (event.exitCode !== undefined) {
          this.finished.add(event.execution);
          emit({ type: 'taskEnd', kind: kind(event.execution.task), success: event.exitCode === 0 });
        }
      }),
      vscode.tasks.onDidEndTask(event => {
        if (!this.finished.has(event.execution)) emit({ type: 'taskCancel' });
      }),
      vscode.debug.onDidStartDebugSession(() => emit({ type: 'debug', active: true })),
      vscode.debug.onDidTerminateDebugSession(() => emit({ type: 'debug', active: false })),
      vscode.window.onDidChangeActiveTerminal(terminal => { if (terminal) emit({ type: 'terminal' }); }),
      // Observe only the fact that an execution started. Never read commands or terminal output.
      vscode.window.onDidStartTerminalShellExecution(() => emit({ type: 'terminal' }))
    ];
  }
  dispose(): void { this.subscriptions.forEach(item => item.dispose()); }
}
