import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CBSettings, CBDashboardData, CBWelcomeData, CBOpenThread } from './types';
import { DEFAULT_CB_SETTINGS } from './types';
import { Database } from './Database';
import { ProjectRepository } from './repositories/ProjectRepository';
import { SessionRepository } from './repositories/SessionRepository';
import { EventRepository } from './repositories/EventRepository';
import { ErrorRepository } from './repositories/ErrorRepository';
import { TodoRepository } from './repositories/TodoRepository';
import { FileActivityRepository } from './repositories/FileActivityRepository';
import { ProjectManager } from './core/ProjectManager';
import { SessionManager } from './core/SessionManager';
import { EventBus, type CBEvents } from './core/EventBus';
import { failedTestThreads } from './core/TestCommands';
import { FileCollector } from './collectors/FileCollector';
import { GitCollector } from './collectors/GitCollector';
import { TerminalCollector } from './collectors/TerminalCollector';
import { DiagnosticCollector } from './collectors/DiagnosticCollector';
import { TodoCollector } from './collectors/TodoCollector';
import { GitService } from './git/GitService';
import { SessionAnalyzer } from './analysis/SessionAnalyzer';
import { ThreadDetector } from './analysis/ThreadDetector';
import { DashboardProvider } from './ui/DashboardProvider';
import { WelcomeBackProvider } from './ui/WelcomeBackProvider';
import { SidebarProvider } from './ui/SidebarProvider';
import type { AIProvider } from './ai/AIProvider';
import { DisabledAIProvider } from './ai/AIProvider';
import { BobShellProvider } from './ai/BobShellProvider';

function readCBSettings(): CBSettings {
  const config = vscode.workspace.getConfiguration('contextBack');
  const s = { ...DEFAULT_CB_SETTINGS };
  const bool = (key: keyof CBSettings, def: boolean): boolean => {
    const v = config.get<unknown>(key);
    return typeof v === 'boolean' ? v : def;
  };
  s.enabled = bool('enabled', true);
  s.trackTerminalCommands = bool('trackTerminalCommands', true);
  s.trackDiagnostics = bool('trackDiagnostics', true);
  s.trackGit = bool('trackGit', true);
  s.trackTodos = bool('trackTodos', true);
  s.aiEnabled = bool('ai.enabled' as keyof CBSettings, false);
  const timeout = config.get<unknown>('sessionTimeoutMinutes');
  if (typeof timeout === 'number') s.sessionTimeoutMinutes = timeout;
  const threshold = config.get<unknown>('welcomeBackAfterHours');
  if (typeof threshold === 'number') s.welcomeBackAfterHours = threshold;
  const provider = config.get<unknown>('ai.provider');
  if (provider === 'bob' || provider === 'disabled') s.aiProvider = provider;
  const exclude = config.get<unknown>('exclude');
  if (Array.isArray(exclude)) s.exclude = exclude as string[];
  return s;
}

export class ContextBackController implements vscode.Disposable {
  private settings: CBSettings;
  private readonly db: Database;
  private readonly projectRepo: ProjectRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly eventRepo: EventRepository;
  private readonly errorRepo: ErrorRepository;
  private readonly todoRepo: TodoRepository;
  private readonly fileRepo: FileActivityRepository;
  private readonly git: GitService;
  private readonly projectMgr: ProjectManager;
  private readonly sessionMgr: SessionManager;
  private readonly bus: EventBus<CBEvents>;
  private readonly analyzer: SessionAnalyzer;
  private readonly threads: ThreadDetector;
  private ai: AIProvider;

  private fileCollector: FileCollector | undefined;
  private gitCollector: GitCollector | undefined;
  private terminalCollector: TerminalCollector | undefined;
  private diagCollector: DiagnosticCollector | undefined;
  private todoCollector: TodoCollector | undefined;

  private readonly dashboard: DashboardProvider;
  private readonly welcome: WelcomeBackProvider;
  private readonly sidebar: SidebarProvider;

  private readonly disposables: vscode.Disposable[] = [];
  private shownWelcomeThisWindow = false;
  private readonly sidebarRefreshTimer: ReturnType<typeof setInterval>;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.settings = readCBSettings();
    const storageRoot = path.join(os.homedir(), '.contextback');
    this.db = new Database(storageRoot);
    this.projectRepo = new ProjectRepository(this.db);
    this.sessionRepo = new SessionRepository(this.db);
    this.eventRepo = new EventRepository(this.db);
    this.errorRepo = new ErrorRepository(this.db);
    this.todoRepo = new TodoRepository(this.db);
    this.fileRepo = new FileActivityRepository(this.db);
    this.git = new GitService();
    this.bus = new EventBus<CBEvents>();
    this.analyzer = new SessionAnalyzer();
    this.threads = new ThreadDetector();
    this.projectMgr = new ProjectManager(this.db, this.git);
    this.ai = this.buildAI();
    this.sessionMgr = new SessionManager(this.db, this.git, this.settings, session => {
      this.bus.emit('sessionEnd', { sessionId: session.id });
      this.db.prune();
    });

    this.dashboard = new DashboardProvider(context, () => this.buildDashboardData(), cmd => this.handleDashboardCommand(cmd));
    this.welcome = new WelcomeBackProvider(cmd => this.handleWelcomeCommand(cmd));
    this.sidebar = new SidebarProvider(() => this.buildDashboardData());

    this.disposables.push(
      this.db,
      this.bus,
      this.dashboard,
      this.welcome,
      this.sidebar,
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('contextBack')) {
          this.settings = readCBSettings();
          this.sessionMgr.updateSettings(this.settings);
          this.fileCollector?.updateSettings(this.settings);
          this.terminalCollector?.updateSettings(this.settings);
          this.diagCollector?.updateSettings(this.settings);
          this.todoCollector?.updateSettings(this.settings);
          this.gitCollector?.updateSettings(this.settings);
          this.ai = this.buildAI();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(e => this.projectMgr.refreshWorkspace(e.added)),
    );

    this.registerCommands();
    this.sidebarRefreshTimer = setInterval(() => this.sidebar.refresh(), 60_000);
    void this.init();
  }

  private async init(): Promise<void> {
    if (!this.settings.enabled) return;
    const project = await this.projectMgr.initWorkspace();
    if (!project) return;

    const root = this.projectMgr.root!;
    this.sessionMgr.recoverPrevious(project.id);
    const lastSession = this.sessionRepo.getLastCompleted(project.id);

    await this.sessionMgr.startForProject(project.id, root);
    const session = this.sessionMgr.current!;

    const ctx = () => {
      const current = this.sessionMgr.current;
      const proj = this.projectMgr.current;
      if (!current || !proj) return null;
      return { projectId: proj.id, sessionId: current.id, root };
    };
    const ctxNoRoot = () => {
      const r = ctx();
      if (!r) return null;
      return { projectId: r.projectId, sessionId: r.sessionId };
    };

    this.fileCollector = new FileCollector(this.eventRepo, this.fileRepo, ctxNoRoot, this.settings);
    this.terminalCollector = new TerminalCollector(this.db, this.eventRepo, ctxNoRoot, this.settings, projectId => this.bus.emit('healthChanged', { projectId }));
    this.diagCollector = new DiagnosticCollector(this.errorRepo, this.eventRepo, ctxNoRoot, this.settings, projectId => this.bus.emit('healthChanged', { projectId }));
    this.todoCollector = new TodoCollector(this.todoRepo, ctxNoRoot, this.settings,
      projectId => this.bus.emit('healthChanged', { projectId }));
    this.gitCollector = new GitCollector(this.db, this.eventRepo, this.git, ctx, this.settings,
      (projectId, hash, message) => this.bus.emit('commitRecorded', { projectId, hash, message }),
      projectId => this.bus.emit('healthChanged', { projectId }));

    this.disposables.push(this.fileCollector, this.terminalCollector, this.diagCollector, this.todoCollector);
    if (this.settings.trackTodos) {
      const files = new Set(this.db.get('todos')
        .filter(todo => todo.projectId === project.id && todo.status === 'open')
        .map(todo => todo.file));
      for (const file of files) {
        const relative = path.relative(root, file);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
          await this.todoCollector.scanPath(project.id, file);
        }
      }
    }
    this.gitCollector.start();

    this.sidebar.refresh();

    // Welcome back if gap is large enough
    if (lastSession?.endedAt && !this.shownWelcomeThisWindow) {
      const hoursAgo = (Date.now() - lastSession.endedAt) / 3600000;
      if (hoursAgo >= this.settings.welcomeBackAfterHours) {
        this.shownWelcomeThisWindow = true;
        setTimeout(() => void this.showWelcomeBack(lastSession), 2000);
      }
    }
  }

  private getContext(): { projectId: string; sessionId: string; root: string } | null {
    const project = this.projectMgr.current;
    const session = this.sessionMgr.current;
    const root = this.projectMgr.root;
    if (!project || !session || !root) return null;
    return { projectId: project.id, sessionId: session.id, root };
  }

  private async showWelcomeBack(lastSession: import('./types').CBSession): Promise<void> {
    const project = this.projectMgr.current;
    const root = this.projectMgr.root;
    if (!project || !root) return;

    const hoursAgo = (Date.now() - (lastSession.endedAt ?? lastSession.startedAt)) / 3600000;
    const branch = this.sessionRepo.findOrCreateBranch(project.id, await this.git.getCurrentBranch(root).catch(() => 'main'));
    const events = this.eventRepo.forSession(lastSession.id);
    const errors = this.errorRepo.openForProject(project.id);
    const todos = this.todoRepo.openForProject(project.id);
    const recentFiles = this.fileRepo.recentFiles(project.id);
    const git = await this.git.getFullInfo(root).catch(() => null);

    const analysis = this.analyzer.analyze(lastSession, events, errors, todos);

    const data: CBWelcomeData = {
      project, branch, lastSession, hoursAgo,
      analysis: analysis.confidence >= 0.4 ? analysis : null,
      recentFiles, openErrors: errors, openTodos: todos,
      recentCommands: this.db.get('terminalCommands').slice(-5),
      git,
    };
    this.welcome.show(data);
    this.bus.emit('welcomeBack', { projectId: project.id, topic: analysis.topic, hoursAgo,
      openBlockers: (await this.getTopThreads()).filter(thread => thread.signal === 'red').reduce((count, thread) => count + (thread.blockerIds?.length ?? 1), 0) });
  }

  getBus(): EventBus<CBEvents> { return this.bus; }
  getActiveProjectId(): string | undefined { return this.projectMgr.current?.id; }

  async getTopThreads(): Promise<CBOpenThread[]> {
    const project = this.projectMgr.current;
    if (!project) return [];
    const changed = this.settings.trackGit && this.projectMgr.root
      ? await this.git.getChangedFiles(this.projectMgr.root) : [];
    const sessions = this.sessionRepo.getForProject(project.id);
    const session = this.sessionMgr.current ?? sessions[0];
    const threads = session ? this.threads.detect([{
      sessionId: session.id, session, errors: this.errorRepo.openForProject(project.id),
      todos: this.todoRepo.openForProject(project.id), hasUncommittedChanges: changed.length > 0,
      hasSuccessfulTestAfterError: false,
    }]) : [];

    const sessionIds = new Set(sessions.map(s => s.id));
    const events = this.db.get('events').filter(e => sessionIds.has(e.sessionId) && e.type === 'terminal_command')
      .sort((a, b) => b.timestamp - a.timestamp);
    threads.push(...failedTestThreads(project.id, events));
    if (changed.length) {
      threads.push({
        id: `git:${project.id}`, title: `Uncommitted changes (${changed.length} files)`,
        blockerIds: [], lastTouched: Date.now(),
        lastError: changed.slice(0, 3).join(', '), unfinishedScore: 0.4,
        signal: 'yellow', todoCount: 0,
      });
    }
    return threads.sort((a, b) => b.unfinishedScore - a.unfinishedScore);
  }

  async buildDashboardData(): Promise<CBDashboardData | null> {
    const project = this.projectMgr.current;
    if (!project) return null;
    const root = this.projectMgr.root ?? '';
    const branch = this.sessionRepo.findOrCreateBranch(project.id, await this.git.getCurrentBranch(root).catch(() => 'main'));
    const sessions = this.sessionRepo.getForProject(project.id);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = Date.now() - 7 * 86400000;
    const todaySessions = sessions.filter(s => s.startedAt >= today.getTime());
    const weekSessions = sessions.filter(s => s.startedAt >= weekAgo);

    const todayMinutes = Math.round(todaySessions.reduce((a, s) => a + s.durationSecs, 0) / 60);
    const weekMinutes = Math.round(weekSessions.reduce((a, s) => a + s.durationSecs, 0) / 60);

    // Build open threads from the same health snapshot used by the bridge.
    const recent = sessions.slice(0, 10);
    const openThreads = await this.getTopThreads();

    // Aggregate work by topic
    const recentWork: Array<{ topic: string; minutes: number }> = [];
    for (const s of recent.slice(0, 5)) {
      const events = this.eventRepo.forSession(s.id);
      const analysis = this.analyzer.analyze(s, events, [], []);
      const existing = recentWork.find(w => w.topic === analysis.topic);
      if (existing) existing.minutes += Math.round(s.durationSecs / 60);
      else recentWork.push({ topic: analysis.topic, minutes: Math.round(s.durationSecs / 60) });
    }

    return {
      project, branch, todayMinutes, weekMinutes,
      totalSessions: sessions.length,
      recentWork,
      openThreads,
      recentFiles: this.fileRepo.topFiles(project.id),
      recentErrors: this.errorRepo.openForProject(project.id).slice(0, 5),
      openTodos: this.todoRepo.openForProject(project.id),
    };
  }

  private async handleDashboardCommand(cmd: string): Promise<void> {
    if (cmd === 'continue') await this.continueSession();
    else if (cmd === 'summarize') await this.summarizeSession();
  }

  private handleWelcomeCommand(cmd: 'continue' | 'dismiss'): void {
    if (cmd === 'continue') void this.continueSession();
  }

  async continueSession(): Promise<void> {
    const project = this.projectMgr.current;
    const root = this.projectMgr.root;
    if (!project || !root) { vscode.window.showInformationMessage('ContextBack: no active project.'); return; }

    const lastSession = this.sessionRepo.getLastCompleted(project.id);
    if (!lastSession) { vscode.window.showInformationMessage('ContextBack: no previous session found.'); return; }

    const events = this.eventRepo.forSession(lastSession.id);
    const recentFiles = this.eventRepo.recentFilesForSession(lastSession.id);
    const errors = this.errorRepo.openForProject(project.id);

    // Open recent files
    for (const file of recentFiles.slice(0, 3)) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
      } catch { /* file may no longer exist */ }
    }

    // Show branch switch prompt if needed
    const currentBranch = await this.git.getCurrentBranch(root).catch(() => '');
    const sessionBranch = this.db.get('branches').find(b => b.id === lastSession.branchId);
    if (sessionBranch && sessionBranch.name !== currentBranch) {
      const choice = await vscode.window.showInformationMessage(
        `Last session was on branch "${sessionBranch.name}" (currently on "${currentBranch}").`,
        'Switch branch', 'Continue on current', 'Cancel'
      );
      if (choice === 'Switch branch') {
        const terminal = vscode.window.createTerminal({ name: 'ContextBack', cwd: root });
        terminal.sendText(`git checkout ${sessionBranch.name}`);
        terminal.show();
      }
    }

    // Show last error if any
    if (errors.length) {
      vscode.window.showWarningMessage(`⚠ Unresolved: ${errors[0]!.message.slice(0, 100)}`);
    }

    this.sidebar.refresh();
  }

  async summarizeSession(): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;
    const session = this.sessionMgr.current ?? this.sessionRepo.getLastCompleted(ctx.projectId);
    if (!session) return;

    const events = this.eventRepo.forSession(session.id);
    const errors = this.errorRepo.openForProject(ctx.projectId);
    const todos = this.todoRepo.openForProject(ctx.projectId);

    let analysis = this.analyzer.analyze(session, events, errors, todos);

    if (this.settings.aiEnabled && this.ai.isAvailable()) {
      const git = await this.git.getFullInfo(ctx.root).catch(() => ({ branch: '', commits: [], changedFiles: [], stagedFiles: [], diffStat: '' }));
      const dump = this.analyzer.buildContextDump(
        this.projectMgr.current?.name ?? 'project',
        git.branch, events, errors, todos, git.commits, git.diffStat
      );
      const aiResult = await this.ai.summarize(dump);
      if (aiResult) analysis = { ...aiResult, topics: analysis.topics };
      else vscode.window.showWarningMessage('ContextBack: IBM Bob Shell did not return a summary. Set BOB_API_KEY in the workspace .env or VS Code environment, and check Bob Shell authentication. Showing the local summary.');
    }

    vscode.window.showInformationMessage(
      `[${analysis.topic}] ${analysis.summary}`,
      'Open Dashboard'
    ).then(choice => { if (choice === 'Open Dashboard') void this.dashboard.show(); });
  }

  async openDashboard(): Promise<void> {
    await this.dashboard.show();
  }

  async showOpenThreads(): Promise<void> {
    const data = await this.buildDashboardData();
    if (!data || !data.openThreads.length) {
      vscode.window.showInformationMessage('ContextBack: No open threads found.');
      return;
    }
    const items = data.openThreads.map(t => ({
      label: `${t.signal === 'red' ? '🔴' : t.signal === 'yellow' ? '🟡' : '🟢'} ${t.title}`,
      description: t.lastError || '',
    }));
    await vscode.window.showQuickPick(items, { title: 'ContextBack · Open Threads' });
  }

  async pauseTracking(): Promise<void> {
    await vscode.workspace.getConfiguration('contextBack').update('enabled', false, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('ContextBack: Tracking paused.');
  }

  async clearHistory(): Promise<void> {
    const answer = await vscode.window.showWarningMessage('Clear all ContextBack history for this project?', { modal: true }, 'Clear');
    if (answer !== 'Clear') return;
    const project = this.projectMgr.current;
    if (!project) return;
    // Remove data for this project only
    this.db.set('sessions', this.db.get('sessions').filter(s => s.projectId !== project.id));
    this.db.set('events', this.db.get('events').filter(() => true)); // events by session — kept for now
    this.db.set('fileActivity', this.db.get('fileActivity').filter(f => f.projectId !== project.id));
    this.db.set('errors', this.db.get('errors').filter(e => e.projectId !== project.id));
    this.db.set('todos', this.db.get('todos').filter(t => t.projectId !== project.id));
    this.db.flush();
    this.sidebar.refresh();
    vscode.window.showInformationMessage('ContextBack: History cleared.');
  }

  private buildAI(): AIProvider {
    if (!this.settings.aiEnabled || this.settings.aiProvider === 'disabled') return new DisabledAIProvider();
    return new BobShellProvider(this.projectMgr.root ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd());
  }

  private registerCommands(): void {
    const cmd = (id: string, fn: () => unknown) =>
      this.disposables.push(vscode.commands.registerCommand(`contextBack.${id}`, fn));
    cmd('openDashboard', () => this.openDashboard());
    cmd('continueSession', () => this.continueSession());
    cmd('summarizeSession', () => this.summarizeSession());
    cmd('showOpenThreads', () => this.showOpenThreads());
    cmd('pauseTracking', () => this.pauseTracking());
    cmd('clearHistory', () => this.clearHistory());
  }

  dispose(): void {
    clearInterval(this.sidebarRefreshTimer);
    this.gitCollector?.dispose();
    this.sessionMgr.endCurrent();
    this.sessionMgr.dispose();
    for (const d of [...this.disposables].reverse()) d.dispose();
    this.db.flush();
  }
}
