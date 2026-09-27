import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CBSettings, CBDashboardData, CBWelcomeData, CBOpenThread, CBSidebarData, CBQualityCacheEntry, CBHealthSignals } from './types';
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
import { failedTestThreads, testCommandKey } from './core/TestCommands';
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
import { BobShellProvider, BOB_API_KEY_SECRET } from './ai/BobShellProvider';
import { QualityContext, yesterdayRange, localDay, shouldReview, type QualityInput } from './analysis/QualityContext';
import { buildDayRecap } from './analysis/DayRecap';
import { openSidebarScreen } from '../SidebarNavigation';

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
  private snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  private qualityRunning = false;
  private initializing = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.settings = readCBSettings();
    const storageRoot = path.join(os.homedir(), '.contextback');
    this.db = new Database(storageRoot);
    this.projectRepo = new ProjectRepository(this.db);
    this.sessionRepo = new SessionRepository(this.db);
    this.eventRepo = new EventRepository(this.db, sessionId => {
      if (this.sessionMgr?.current?.id === sessionId) this.sessionMgr.touch();
    });
    this.errorRepo = new ErrorRepository(this.db);
    this.todoRepo = new TodoRepository(this.db);
    this.fileRepo = new FileActivityRepository(this.db);
    this.git = new GitService();
    this.bus = new EventBus<CBEvents>();
    this.analyzer = new SessionAnalyzer();
    this.threads = new ThreadDetector();
    this.projectMgr = new ProjectManager(this.db, this.git);
    this.sessionMgr = new SessionManager(this.db, this.git, this.settings, session => {
      this.bus.emit('sessionEnd', { sessionId: session.id });
      this.db.prune();
    });

    this.dashboard = new DashboardProvider(context, () => this.buildDashboardData(), cmd => this.handleDashboardCommand(cmd));
    this.welcome = new WelcomeBackProvider(cmd => this.handleWelcomeCommand(cmd));
    this.sidebar = new SidebarProvider(context.extensionUri, () => this.buildSidebarData(), () => this.refreshQuality(true), () => void this.openDashboard(), () => void this.refreshQuality(false), () => void vscode.commands.executeCommand('codeBoy.open'));

    this.disposables.push(
      this.db,
      this.bus,
      this.dashboard,
      this.welcome,
      this.sidebar,
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('contextBack')) {
          const wasEnabled = this.settings.enabled;
          this.settings = readCBSettings();
          this.sessionMgr.updateSettings(this.settings);
          if (wasEnabled && !this.settings.enabled) {
            if (this.snapshotTimer) { clearTimeout(this.snapshotTimer); this.snapshotTimer = undefined; }
            this.stopCollectors();
            this.sessionMgr.endCurrent();
          } else if (!wasEnabled && this.settings.enabled) {
            void this.init();
          }
          this.fileCollector?.updateSettings(this.settings);
          this.terminalCollector?.updateSettings(this.settings);
          this.diagCollector?.updateSettings(this.settings);
          this.todoCollector?.updateSettings(this.settings);
          this.gitCollector?.updateSettings(this.settings);
          this.sidebar.refresh();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => { void this.switchWorkspace(); }),
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleSnapshot()),
      vscode.workspace.onDidChangeTextDocument(e => {
        if (e.contentChanges.length && this.settings.enabled && !this.sessionMgr.current && this.projectMgr.current) {
          void this.init();
        }
      }),
      vscode.window.onDidStartTerminalShellExecution(() => {
        if (this.settings.enabled && !this.sessionMgr.current && this.projectMgr.current) void this.init();
      }),
    );

    this.registerCommands();
    this.sidebarRefreshTimer = setInterval(() => this.sidebar.refresh(), 60_000);
    void this.init();
  }

  private async init(): Promise<void> {
    if (!this.settings.enabled || this.initializing) return;
    this.initializing = true;
    try {
    const project = await this.projectMgr.initWorkspace();
    if (!project || !this.settings.enabled || this.sessionMgr.current) return;

    this.stopCollectors();
    const root = this.projectMgr.root!;
    this.sessionMgr.recoverPrevious(project.id);
    const lastSession = this.sessionRepo.getLastCompleted(project.id);

    await this.sessionMgr.startForProject(project.id, root);
    if (!this.settings.enabled) { this.sessionMgr.endCurrent(); return; }
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

    if (this.settings.trackTodos) {
      const files = new Set(this.db.get('todos')
        .filter(todo => todo.projectId === project.id && todo.status === 'open')
        .map(todo => todo.file));
      for (const file of files) {
        if (!this.settings.enabled || !this.todoCollector) return;
        const relative = path.relative(root, file);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
          await this.todoCollector.scanPath(project.id, file);
        }
      }
    }
    if (!this.settings.enabled) return;
    this.gitCollector?.start();

    this.sidebar.refresh();
    if (this.sidebar.isVisible()) void this.refreshQuality(false);

    // Welcome back if gap is large enough
    if (lastSession?.endedAt && !this.shownWelcomeThisWindow) {
      const hoursAgo = (Date.now() - lastSession.endedAt) / 3600000;
      if (hoursAgo >= this.settings.welcomeBackAfterHours) {
        this.shownWelcomeThisWindow = true;
        setTimeout(() => void this.showWelcomeBack(lastSession), 2000);
      }
    }
    } finally { this.initializing = false; }
  }

  private getContext(): { projectId: string; sessionId: string; root: string } | null {
    const project = this.projectMgr.current;
    const session = this.sessionMgr.current;
    const root = this.projectMgr.root;
    if (!project || !session || !root) return null;
    return { projectId: project.id, sessionId: session.id, root };
  }

  private async switchWorkspace(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders[0]?.uri.fsPath === this.projectMgr.root) return;
    if (this.snapshotTimer) { clearTimeout(this.snapshotTimer); this.snapshotTimer = undefined; }
    this.stopCollectors();
    this.sessionMgr.endCurrent();
    this.projectMgr.refreshWorkspace(folders);
    this.bus.emit('projectChanged', { projectId: undefined });
    this.sidebar.refresh();
    if (folders.length) {
      await this.init();
      this.bus.emit('projectChanged', { projectId: this.projectMgr.current?.id });
    }
  }

  private stopCollectors(): void {
    this.gitCollector?.dispose();
    this.fileCollector?.dispose();
    this.terminalCollector?.dispose();
    this.diagCollector?.dispose();
    this.todoCollector?.dispose();
    this.gitCollector = undefined;
    this.fileCollector = undefined;
    this.terminalCollector = undefined;
    this.diagCollector = undefined;
    this.todoCollector = undefined;
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
      recentCommands: this.db.get('terminalCommands').filter(command => command.projectId === project.id).slice(-5),
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

  async getHealthSignals(): Promise<CBHealthSignals> {
    const project = this.projectMgr.current;
    if (!project) return { threads: [], openTodos: 0, fixmeHacks: 0, failingTests: 0,
      tests: 'unknown', latestTestRepeatedFailure: false };
    const threads = await this.getTopThreads();
    const todos = this.settings.trackTodos ? this.db.get('todos').filter(todo =>
      todo.projectId === project.id && todo.status === 'open') : [];
    const sessionIds = new Set(this.sessionRepo.getForProject(project.id).map(session => session.id));
    const events = this.settings.trackTerminalCommands ? this.db.get('events')
      .filter(event => sessionIds.has(event.sessionId) && event.type === 'terminal_command')
      .sort((a, b) => b.timestamp - a.timestamp) : [];
    const latest = new Map<string, { failed: boolean; at: number; failureStreak: number; closed: boolean }>();
    for (const event of events) {
      const command = event.data['command'];
      const exitCode = event.data['exitCode'];
      if (typeof command !== 'string' || typeof exitCode !== 'number') continue;
      const key = testCommandKey(command);
      if (!key) continue;
      const current = latest.get(key);
      if (!current) {
        latest.set(key, { failed: exitCode !== 0, at: event.timestamp,
          failureStreak: exitCode !== 0 ? 1 : 0, closed: exitCode === 0 });
      } else if (!current.closed) {
        if (exitCode === 0) current.closed = true;
        else current.failureStreak++;
      }
    }
    const testRuns = [...latest.values()];
    const mostRecentTest = testRuns.sort((a, b) => b.at - a.at)[0];
    const freshTests = testRuns.filter(test => Date.now() - test.at <= 24 * 60 * 60_000);
    const stale = testRuns.length > 0 && freshTests.length === 0;
    const failingTests = freshTests.filter(test => test.failed).length;
    return { projectId: project.id, threads, openTodos: todos.length,
      fixmeHacks: todos.filter(todo => todo.tag === 'FIXME' || todo.tag === 'HACK').length,
      failingTests, tests: testRuns.length === 0 ? 'unknown' : stale ? 'stale' : failingTests > 0 ? 'failing' : 'passing',
      lastTestAt: mostRecentTest?.at,
      latestTestRepeatedFailure: Boolean(!stale && mostRecentTest?.failed && mostRecentTest.failureStreak >= 2) };
  }

  private scheduleSnapshot(): void {
    if (!this.settings.enabled || !this.settings.aiEnabled || this.settings.aiProvider !== 'bob') return;
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.snapshotTimer = setTimeout(() => { this.snapshotTimer = undefined; void this.captureSnapshot(); }, 3000);
  }

  private async captureSnapshot(): Promise<void> {
    if (!this.settings.enabled || !this.settings.aiEnabled || this.settings.aiProvider !== 'bob') return;
    const project = this.projectMgr.current;
    const root = this.projectMgr.root;
    if (!project || !root) return;
    const day = localDay(new Date());
    const input = await new QualityContext(root, this.settings).workingChanges();
    const rest = this.db.get('diffSnapshots').filter(s => s.projectId !== project.id || s.day !== day);
    if (this.settings.enabled && this.settings.aiEnabled && this.settings.aiProvider === 'bob')
      this.db.set('diffSnapshots', [...rest, { projectId: project.id, day, patch: input.text, capturedAt: Date.now() }]);
  }

  private cacheEntry(projectId: string, kind: 'yesterday' | 'current', day: string): CBQualityCacheEntry | null {
    return this.db.get('qualityCache').find(e => e.projectId === projectId && e.kind === kind && e.day === day) ?? null;
  }

  async buildSidebarData(): Promise<CBSidebarData | null> {
    const project = this.projectMgr.current;
    const root = this.projectMgr.root;
    if (!project || !root) return null;
    const branch = this.sessionRepo.findOrCreateBranch(project.id, await this.git.getCurrentBranch(root));
    const sessions = this.sessionRepo.getForProject(project.id, 200);
    const ids = new Set(sessions.map(s => s.id));
    const range = yesterdayRange();
    const commits = this.settings.trackGit ? await this.git.getCommitsInRange(root, range.start, range.end) : [];
    const gitFiles = this.settings.trackGit ? await this.git.getFilesForCommits(root, commits) : [];
    const recap = buildDayRecap(sessions, this.db.get('events').filter(e => ids.has(e.sessionId)), commits,
      this.errorRepo.openForProject(project.id), this.todoRepo.openForProject(project.id), new Date(),
      gitFiles.map(file => path.resolve(root, file)));
    const today = localDay(new Date());
    const inputs = this.settings.enabled && this.settings.aiEnabled && this.settings.aiProvider === 'bob'
      ? await this.qualityInputs() : null;
    const bob = await this.bobProvider(root);
    return {
      project, branch, recap,
      yesterdayQuality: this.cacheEntry(project.id, 'yesterday', recap.date),
      currentQuality: this.cacheEntry(project.id, 'current', today),
      qualityEnabled: this.settings.enabled && this.settings.aiEnabled && this.settings.aiProvider === 'bob' && bob.isAvailable(),
      qualityRunning: this.qualityRunning,
      yesterdayReviewable: !!inputs?.yesterday.text.trim(),
      currentReviewable: !!inputs?.current.text.trim(),
      openThreads: await this.getTopThreads(),
    };
  }

  private async qualityInputs(): Promise<{ yesterday: QualityInput; current: QualityInput; day: string; today: string } | null> {
    const project = this.projectMgr.current;
    const root = this.projectMgr.root;
    if (!project || !root) return null;
    const ctx = new QualityContext(root, this.settings);
    const range = yesterdayRange();
    const committed = await ctx.committedYesterday(range.start, range.end);
    const snapshot = this.db.get('diffSnapshots').find(s => s.projectId === project.id && s.day === range.day)?.patch ?? '';
    const yesterdayText = [committed.text, snapshot].filter(Boolean).join('\n\n').slice(0, 50_000);
    const { createHash } = await import('node:crypto');
    const yesterday: QualityInput = { text: yesterdayText, files: committed.files,
      hash: createHash('sha256').update(yesterdayText).digest('hex') };
    const openEditorFiles = [
      ...(vscode.window.activeTextEditor ? [vscode.window.activeTextEditor.document.uri.fsPath] : []),
      ...vscode.window.visibleTextEditors.map(e => e.document.uri.fsPath),
    ];
    const candidateFiles = [
      ...openEditorFiles,
      ...this.fileRepo.recentFiles(project.id).map(f => f.path),
    ];
    const current = await ctx.currentSample(candidateFiles);
    return { yesterday, current, day: range.day, today: localDay(new Date()) };
  }

  async refreshQuality(force: boolean): Promise<void> {
    if (!this.settings.enabled) return;
    if (!force && (!this.settings.aiEnabled || this.settings.aiProvider !== 'bob')) return;
    if (this.qualityRunning) {
      if (force) void vscode.window.showInformationMessage('ContextBack: A Bob scan is already running.');
      return;
    }
    const project = this.projectMgr.current;
    const root = this.projectMgr.root;
    if (!project || !root) return;
    let bob = await this.bobProvider(root);
    if (!bob.isAvailable()) {
      if (!force || !await this.configureBob(false)) { this.sidebar.refresh(); return; }
      bob = await this.bobProvider(root);
      if (!bob.isAvailable()) return;
    }
    if (force && (!this.settings.aiEnabled || this.settings.aiProvider !== 'bob')) {
      if (!await this.enableBobForWorkspace()) return;
    }
    this.qualityRunning = true;
    this.sidebar.refresh();
    try {
      const inputs = await this.qualityInputs();
      if (!inputs) return;
      let attempted = 0;
      let succeeded = 0;
      for (const [kind, input, day] of [
        ['yesterday', inputs.yesterday, inputs.day],
        ['current', inputs.current, inputs.today],
      ] as const) {
        const previous = this.cacheEntry(project.id, kind, day);
        if (!shouldReview(previous, input, force)) continue;
        if (!this.settings.enabled || !this.settings.aiEnabled || this.settings.aiProvider !== 'bob') break;
        attempted += 1;
        const assessed = await bob.assessQuality(input.text, kind);
        if (assessed) succeeded += 1;
        const checkedAt = Date.now();
        const entry: CBQualityCacheEntry = {
          projectId: project.id, kind, day, inputHash: input.hash, checkedAt,
          result: assessed ? { ...assessed, checkedAt, inputHash: input.hash } : null,
          error: assessed ? undefined : (bob.lastError || 'Scan finished without a valid score.'),
        };
        const rest = this.db.get('qualityCache').filter(e => !(e.projectId === project.id && e.kind === kind && e.day === day));
        if (this.settings.enabled && this.settings.aiEnabled && this.settings.aiProvider === 'bob')
          this.db.set('qualityCache', [...rest, entry]);
        this.sidebar.refresh();
      }
      if (force) {
        if (!attempted) void vscode.window.showInformationMessage('ContextBack: No reviewable code found. Open a code file or make changes to scan.');
        else if (!succeeded) void vscode.window.showWarningMessage(`ContextBack: Scan finished without a score. ${bob.lastError ?? 'Bob returned an invalid review response.'}`);
        else void vscode.window.showInformationMessage(`ContextBack: Bob scored ${succeeded} code sample${succeeded === 1 ? '' : 's'}.`);
      }
    } finally {
      this.qualityRunning = false;
      this.sidebar.refresh();
      if (project.id !== this.projectMgr.current?.id && this.sidebar.isVisible()) void this.refreshQuality(false);
    }
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
        try { await this.git.checkoutBranch(root, sessionBranch.name); }
        catch { vscode.window.showWarningMessage('ContextBack: Could not switch branch. Check for uncommitted changes.'); }
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

    const ai = await this.bobProvider(ctx.root);
    if (this.settings.aiEnabled && this.settings.aiProvider === 'bob' && ai.isAvailable()) {
      const git = await this.git.getFullInfo(ctx.root).catch(() => ({ branch: '', commits: [], changedFiles: [], stagedFiles: [], diffStat: '' }));
      const dump = this.analyzer.buildContextDump(
        this.projectMgr.current?.name ?? 'project',
        git.branch, events, errors, todos, git.commits, git.diffStat
      );
      const aiResult = await ai.summarize(dump);
      if (aiResult) analysis = { ...aiResult, topics: analysis.topics };
      else vscode.window.showWarningMessage('ContextBack: IBM Bob Shell did not return a summary. Check Bob Shell authentication. Showing the local summary.');
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
    if (this.snapshotTimer) { clearTimeout(this.snapshotTimer); this.snapshotTimer = undefined; }
    this.stopCollectors();
    this.sessionMgr.endCurrent();
    // Remove data for this project only
    const clearedSessionIds = new Set(this.db.get('sessions').filter(s => s.projectId === project.id).map(s => s.id));
    this.db.set('sessions', this.db.get('sessions').filter(s => s.projectId !== project.id));
    this.db.set('events', this.db.get('events').filter(e => !clearedSessionIds.has(e.sessionId)));
    this.db.set('terminalCommands', this.db.get('terminalCommands').filter(c => c.projectId !== project.id));
    this.db.set('fileActivity', this.db.get('fileActivity').filter(f => f.projectId !== project.id));
    this.db.set('errors', this.db.get('errors').filter(e => e.projectId !== project.id));
    this.db.set('todos', this.db.get('todos').filter(t => t.projectId !== project.id));
    this.db.set('diffSnapshots', this.db.get('diffSnapshots').filter(s => s.projectId !== project.id));
    this.db.set('qualityCache', this.db.get('qualityCache').filter(e => e.projectId !== project.id));
    this.db.flush();
    if (this.settings.enabled) await this.init();
    this.sidebar.refresh();
    vscode.window.showInformationMessage('ContextBack: History cleared.');
  }

  private async bobProvider(root: string): Promise<BobShellProvider> {
    return new BobShellProvider(root, await this.context.secrets.get(BOB_API_KEY_SECRET));
  }

  private async enableBobForWorkspace(): Promise<boolean> {
    if (!vscode.workspace.workspaceFolders?.length) return false;
    const config = vscode.workspace.getConfiguration('contextBack');
    await config.update('ai.provider', 'bob', vscode.ConfigurationTarget.Workspace);
    await config.update('ai.enabled', true, vscode.ConfigurationTarget.Workspace);
    this.settings = readCBSettings();
    this.sidebar.refresh();
    return true;
  }

  private async configureBob(scanAfterSave: boolean): Promise<boolean> {
    const key = await vscode.window.showInputBox({
      title: 'Connect IBM Bob to ContextBack',
      prompt: 'Enter your IBM Bob API key. It is stored in VS Code SecretStorage and enables code scans for this workspace.',
      password: true,
      ignoreFocusOut: true,
      validateInput: value => value.trim() ? undefined : 'Enter an API key, or press Escape to cancel.',
    });
    if (key === undefined) return false;
    return this.storeBobKey(key, scanAfterSave);
  }

  private async storeBobKey(input: unknown, scanAfterSave: boolean): Promise<boolean> {
    if (typeof input !== 'string' || !input.trim() || input.length > 512) return false;
    if (!vscode.workspace.workspaceFolders?.length) {
      void vscode.window.showWarningMessage('ContextBack: Open a project before connecting IBM Bob.');
      return false;
    }
    await this.context.secrets.store(BOB_API_KEY_SECRET, input.trim());
    await this.enableBobForWorkspace();
    void vscode.window.showInformationMessage('ContextBack: IBM Bob API key saved in SecretStorage.');
    this.sidebar.refresh();
    if (scanAfterSave) await this.refreshQuality(true);
    return true;
  }


  private registerCommands(): void {
    const cmd = (id: string, fn: () => unknown) =>
      this.disposables.push(vscode.commands.registerCommand(`contextBack.${id}`, fn));
    cmd('openDashboard', () => this.openDashboard());
    cmd('openSidebar', () => openSidebarScreen('context'));
    cmd('configureBob', () => this.configureBob(true));
    this.disposables.push(vscode.commands.registerCommand('contextBack.storeBobKey', (key: unknown) => this.storeBobKey(key, true)));
    cmd('continueSession', () => this.continueSession());
    cmd('summarizeSession', () => this.summarizeSession());
    cmd('showOpenThreads', () => this.showOpenThreads());
    cmd('pauseTracking', () => this.pauseTracking());
    cmd('clearHistory', () => this.clearHistory());
  }

  dispose(): void {
    clearInterval(this.sidebarRefreshTimer);
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.stopCollectors();
    this.sessionMgr.endCurrent();
    this.sessionMgr.dispose();
    for (const d of [...this.disposables].reverse()) d.dispose();
    this.db.flush();
  }
}
