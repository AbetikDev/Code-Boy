import type * as vscode from 'vscode';
import type { CodeBoyController } from '../CodeBoyController';
import type { ContextBackController } from '../contextback/ContextBackController';
import type { CBHealthSignals, CBOpenThread } from '../contextback/types';

interface BridgeHost {
  commands: { registerCommand(id: string, handler: () => unknown): vscode.Disposable };
  window: { showInformationMessage(message: string, ...items: unknown[]): Thenable<string | undefined> };
  env: { clipboard: { writeText(text: string): Thenable<void> } };
}

export class ContextBoyBridge implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;
  private generation = 0;
  private projectId: string | undefined;
  private redIds = new Set<string>();
  private previousTop = '';
  private previousTestAt: number | undefined;
  private healthInitialized = false;

  constructor(
    _context: vscode.ExtensionContext,
    private readonly codeBoy: Pick<CodeBoyController, 'engine'>,
    private readonly contextBack: Pick<ContextBackController, 'getBus' | 'getTopThreads' | 'getActiveProjectId' | 'openDashboard'> &
      Partial<Pick<ContextBackController, 'getHealthSignals'>>,
    private readonly host: BridgeHost = require('vscode') as BridgeHost,
  ) {
    const bus = contextBack.getBus();
    this.disposables.push(
      bus.on('healthChanged', event => { if (event.projectId === contextBack.getActiveProjectId()) void this.refreshHealth(); }),
      bus.on('projectChanged', () => { void this.refreshHealth(); }),
      bus.on('sessionEnd', () => { void this.refreshHealth(); }),
      bus.on('welcomeBack', event => {
        if (event.projectId === contextBack.getActiveProjectId()) this.codeBoy.engine.handle({
          type: 'sessionWelcome', topic: event.topic, hoursAgo: event.hoursAgo, openBlockers: event.openBlockers,
        });
      }),
      bus.on('commitRecorded', event => {
        if (event.projectId === contextBack.getActiveProjectId())
          this.codeBoy.engine.handle({ type: 'gitMilestone', message: event.message });
      }),
      host.commands.registerCommand('codeBoy.resolveBlockerWithBob', () => this.resolveBlockerWithBob()),
      host.commands.registerCommand('codeBoy.resumeSession', () => contextBack.openDashboard()),
    );
    void this.refreshHealth();
  }

  async refreshHealth(): Promise<void> {
    const generation = ++this.generation;
    const projectId = this.contextBack.getActiveProjectId();
    let health: CBHealthSignals;
    try {
      health = this.contextBack.getHealthSignals ? await this.contextBack.getHealthSignals() : {
        projectId, threads: await this.contextBack.getTopThreads(), openTodos: 0, fixmeHacks: 0,
        failingTests: 0, tests: 'unknown', latestTestRepeatedFailure: false,
      };
    } catch { return; }
    if (this.disposed || generation !== this.generation || projectId !== this.contextBack.getActiveProjectId()) return;
    const threads = health.threads;
    if (this.projectId !== projectId) {
      if (this.redIds.size) this.codeBoy.engine.handle({ type: 'threadStatus', hasRedThread: false, blockerCount: 0, projectSwitch: true });
      this.projectId = projectId;
      this.redIds.clear();
      this.previousTop = '';
      this.previousTestAt = undefined;
      this.healthInitialized = false;
    }
    const allIds = new Set(threads.flatMap(thread => thread.blockerIds ?? []));
    const redThreads = threads.filter(thread => thread.signal === 'red' &&
      !(thread.id.startsWith('test:') && Date.now() - thread.lastTouched > 24 * 60 * 60_000));
    const redIds = new Set(redThreads.flatMap(thread => thread.blockerIds ?? []));
    const top = redThreads[0]?.filePath ?? redThreads[0]?.title ?? '';
    if (redIds.size !== this.redIds.size || top !== this.previousTop || [...redIds].some(id => !this.redIds.has(id))) {
      this.codeBoy.engine.handle({ type: 'threadStatus', hasRedThread: redIds.size > 0,
        blockerCount: redIds.size, topThreadFile: top || undefined });
    }
    for (const id of this.redIds) {
      if (!allIds.has(id)) {
        const topic = id.startsWith('test:') ? 'Tests' : undefined;
        this.codeBoy.engine.handle({ type: 'threadResolved', topic });
      }
    }
    const testTransition = this.healthInitialized && health.lastTestAt !== undefined && health.lastTestAt !== this.previousTestAt
      ? health.tests === 'failing' ? 'failed' : health.tests === 'passing' ? 'passed' : undefined : undefined;
    this.codeBoy.engine.handle({ type: 'projectHealth', projectId, redBlockers: redIds.size,
      openTodos: health.openTodos, fixmeHacks: health.fixmeHacks, failingTests: health.failingTests,
      tests: health.tests, lastTestAt: health.lastTestAt,
      repeatedTestFailure: health.latestTestRepeatedFailure, testTransition });
    this.redIds = redIds;
    this.previousTop = top;
    this.previousTestAt = health.lastTestAt;
    this.healthInitialized = true;
  }

  private async resolveBlockerWithBob(): Promise<void> {
    const threads = await this.contextBack.getTopThreads();
    if (this.disposed) return;
    const blocker = threads.filter(thread => thread.signal === 'red' &&
      !(thread.id.startsWith('test:') && Date.now() - thread.lastTouched > 24 * 60 * 60_000))
      .sort((a, b) => b.lastTouched - a.lastTouched)[0];
    if (!blocker) { await this.host.window.showInformationMessage('Code Boy: No red blockers to hand off.'); return; }
    const state = this.codeBoy.engine.getDeveloperState();
    const quality = state.quality;
    const prompt = ['IBM Bob, help resolve this project blocker.',
      `File: ${blocker.filePath ?? 'Project tests'}`,
      `Error: ${blocker.lastError || blocker.title}`,
      `Project signals: ${quality.diagnosticsErrors} errors, ${quality.diagnosticsWarnings} warnings, ${quality.redBlockers} red blockers, ${quality.openTodos} open TODOs.`,
      `Tests: ${quality.tests}; failing test groups: ${quality.failingTests}. Build failed: ${quality.buildFailed ? 'yes' : 'no'}.`,
      `Coding pattern: ${state.behavior.mode} (${state.behavior.editCount} edits in the last five minutes). This does not imply who authored the code.`,
      'Please inspect the repository and relevant tests in Bob IDE, explain the root cause, apply a focused fix, and run verification.'].join('\n');
    const choice = await this.host.window.showInformationMessage(prompt, { modal: true }, 'Copy Prompt');
    if (choice === 'Copy Prompt' && !this.disposed) await this.host.env.clipboard.writeText(prompt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    for (const disposable of [...this.disposables].reverse()) disposable.dispose();
  }
}
