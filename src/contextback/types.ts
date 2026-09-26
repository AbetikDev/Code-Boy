// ─── ContextBack — shared types ──────────────────────────────────────────────

export interface CBProject {
  id: string;          // hash(root + gitRemote)
  name: string;        // folder name
  rootPath: string;
  gitRemote: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface CBBranch {
  id: string;          // `${projectId}:${name}`
  projectId: string;
  name: string;
  lastSeenAt: number;
}

export interface CBSession {
  id: string;          // uuid v4-ish
  projectId: string;
  branchId: string;
  startedAt: number;
  endedAt: number | null;
  durationSecs: number;
  summary: string;
}

export type CBEventType =
  | 'file_open'
  | 'file_save'
  | 'file_close'
  | 'file_activity'
  | 'git_commit'
  | 'terminal_command'
  | 'diagnostic'
  | 'todo';

export interface CBEvent {
  id: string;
  sessionId: string;
  type: CBEventType;
  timestamp: number;
  filePath: string;
  data: Record<string, unknown>;
}

export interface CBFileActivity {
  id: string;
  projectId: string;
  path: string;
  opens: number;
  edits: number;
  saves: number;
  timeSpentSecs: number;
  lastActivity: number;
}

export interface CBError {
  id: string;
  projectId: string;
  sessionId: string;
  fingerprint: string;  // sha1(file+line+message)
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning';
  firstSeen: number;
  lastSeen: number;
  resolved: boolean;
}

export interface CBTodo {
  id: string;
  projectId: string;
  file: string;
  line: number;
  text: string;
  tag: 'TODO' | 'FIXME' | 'HACK' | 'XXX';
  status: 'open' | 'resolved';
  firstSeen: number;
  lastSeen: number;
}

export interface CBGitInfo {
  branch: string;
  changedFiles: string[];
  stagedFiles: string[];
  commits: CBCommit[];
  diffStat: string;
}

export interface CBCommit {
  hash: string;
  message: string;
  filesChanged: number;
  timestamp: number;
  author: string;
}

export interface CBTerminalCommand {
  command: string;
  cwd: string;
  startTime: number;
  endTime: number;
  exitCode: number | null;
  duration: number;
}

// ─── Analysis ──────────────────────────────────────────────────────────────

export interface CBTopic {
  name: string;
  confidence: number;   // 0..1
  keywords: string[];
}

export interface CBSessionAnalysis {
  topic: string;
  summary: string;
  completed: string[];
  unfinished: string[];
  nextStep: string;
  confidence: number;
  topics: CBTopic[];
}

export interface CBOpenThread {
  id: string;
  title: string;
  filePath?: string;
  blockerIds?: string[];
  lastTouched: number;
  lastError: string;
  unfinishedScore: number;  // 0..1
  signal: 'red' | 'yellow' | 'green';
  todoCount: number;
}

export interface CBWelcomeData {
  project: CBProject;
  branch: CBBranch;
  lastSession: CBSession;
  hoursAgo: number;
  analysis: CBSessionAnalysis | null;
  recentFiles: CBFileActivity[];
  openErrors: CBError[];
  openTodos: CBTodo[];
  recentCommands: CBTerminalCommand[];
  git: CBGitInfo | null;
}

export interface CBDashboardData {
  project: CBProject;
  branch: CBBranch;
  todayMinutes: number;
  weekMinutes: number;
  totalSessions: number;
  recentWork: Array<{ topic: string; minutes: number }>;
  openThreads: CBOpenThread[];
  recentFiles: CBFileActivity[];
  recentErrors: CBError[];
  openTodos: CBTodo[];
}

export interface CBDayRecap {
  date: string;
  active: boolean;
  summary: string;
  nextStep: string;
  minutes: number;
  files: string[];
  changedFilesCount: number;
  areas: Array<{ name: string; count: number }>;
  commits: string[];
  tests: { passed: number; failed: number };
  problems: string[];
  sources: Array<'Git' | 'ContextBack'>;
}

export interface CBQualityResult {
  score: number;
  rationale: string;
  findings: string[];
  checkedAt: number;
  inputHash: string;
}

export interface CBQualityCacheEntry {
  projectId: string;
  kind: 'yesterday' | 'current';
  day: string;
  result: CBQualityResult | null;
  inputHash: string;
  checkedAt: number;
}

export interface CBDiffSnapshot {
  projectId: string;
  day: string;
  patch: string;
  capturedAt: number;
}

export interface CBSidebarData {
  project: CBProject;
  branch: CBBranch;
  recap: CBDayRecap;
  yesterdayQuality: CBQualityCacheEntry | null;
  currentQuality: CBQualityCacheEntry | null;
  qualityEnabled: boolean;
  yesterdayReviewable: boolean;
  currentReviewable: boolean;
  openThreads: CBOpenThread[];
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface CBSettings {
  enabled: boolean;
  sessionTimeoutMinutes: number;
  welcomeBackAfterHours: number;
  trackTerminalCommands: boolean;
  trackDiagnostics: boolean;
  trackGit: boolean;
  trackTodos: boolean;
  aiEnabled: boolean;
  aiProvider: 'bob' | 'disabled';
  exclude: string[];
}

export const DEFAULT_CB_SETTINGS: CBSettings = {
  enabled: true,
  sessionTimeoutMinutes: 20,
  welcomeBackAfterHours: 8,
  trackTerminalCommands: true,
  trackDiagnostics: true,
  trackGit: true,
  trackTodos: true,
  aiEnabled: false,
  aiProvider: 'bob',
  exclude: ['**/.env*', '**/secrets/**', '**/credentials/**', '**/*.pem', '**/*.key'],
};

// ─── Persistence snapshot ──────────────────────────────────────────────────

export interface CBStore {
  version: 2;
  projects: CBProject[];
  branches: CBBranch[];
  sessions: CBSession[];
  events: CBEvent[];
  fileActivity: CBFileActivity[];
  errors: CBError[];
  todos: CBTodo[];
  terminalCommands: CBTerminalCommand[];
  diffSnapshots: CBDiffSnapshot[];
  qualityCache: CBQualityCacheEntry[];
}
