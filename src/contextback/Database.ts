import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CBStore } from './types';

const STORE_VERSION = 1 as const;
const MAX_EVENTS = 5000;
const MAX_TERMINAL_COMMANDS = 500;
const MAX_SESSIONS = 200;

function empty(): CBStore {
  return {
    version: STORE_VERSION,
    projects: [],
    branches: [],
    sessions: [],
    events: [],
    fileActivity: [],
    errors: [],
    todos: [],
    terminalCommands: [],
  };
}

/** Lightweight JSON-file store in ~/.contextback/context.json  */
export class Database {
  private readonly dbPath: string;
  private store: CBStore;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(storageRoot?: string) {
    const dir = storageRoot ?? path.join(os.homedir(), '.contextback');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.dbPath = path.join(dir, 'context.json');
    this.store = this.load();
  }

  private load(): CBStore {
    try {
      if (!fs.existsSync(this.dbPath)) return empty();
      const text = fs.readFileSync(this.dbPath, 'utf8');
      const parsed = JSON.parse(text) as Partial<CBStore>;
      if (parsed.version !== STORE_VERSION) return empty();
      const base = empty();
      return {
        version: STORE_VERSION,
        projects: Array.isArray(parsed.projects) ? parsed.projects : base.projects,
        branches: Array.isArray(parsed.branches) ? parsed.branches : base.branches,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : base.sessions,
        events: Array.isArray(parsed.events) ? parsed.events : base.events,
        fileActivity: Array.isArray(parsed.fileActivity) ? parsed.fileActivity : base.fileActivity,
        errors: Array.isArray(parsed.errors) ? parsed.errors : base.errors,
        todos: Array.isArray(parsed.todos) ? parsed.todos : base.todos,
        terminalCommands: Array.isArray(parsed.terminalCommands) ? parsed.terminalCommands : base.terminalCommands,
      };
    } catch {
      return empty();
    }
  }

  get<K extends keyof CBStore>(key: K): CBStore[K] {
    return this.store[key];
  }

  set<K extends keyof CBStore>(key: K, value: CBStore[K]): void {
    this.store[key] = value;
    this.schedule();
  }

  /** Trim oversized arrays to stay under limits. */
  prune(): void {
    if (this.store.events.length > MAX_EVENTS) {
      this.store.events = this.store.events.slice(-MAX_EVENTS);
      this.dirty = true;
    }
    if (this.store.terminalCommands.length > MAX_TERMINAL_COMMANDS) {
      this.store.terminalCommands = this.store.terminalCommands.slice(-MAX_TERMINAL_COMMANDS);
      this.dirty = true;
    }
    if (this.store.sessions.length > MAX_SESSIONS) {
      this.store.sessions = this.store.sessions.slice(-MAX_SESSIONS);
      this.dirty = true;
    }
  }

  flush(): void {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = undefined; }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const tmp = this.dbPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.store), 'utf8');
      fs.renameSync(tmp, this.dbPath);
    } catch {
      // Non-fatal: next flush will retry
    }
  }

  dispose(): void {
    this.flush();
    if (this.flushTimer) clearTimeout(this.flushTimer);
  }

  private schedule(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = undefined; this.flush(); }, 5000);
  }
}
