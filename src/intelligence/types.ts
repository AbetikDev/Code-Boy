/** Numeric editor metadata only. Source text and file paths never enter this model. */
export interface CodingEditSample {
  timestamp: number;
  insertedChars: number;
  deletedChars: number;
  insertedLines: number;
  languageId?: string;
}

/** These labels describe observed editing patterns, never who authored the code. */
export type CodingMode = 'idle' | 'handwritten' | 'flow' | 'assisted' | 'vibe-heavy';

export interface CodingBehaviorSnapshot {
  mode: CodingMode;
  windowStart: number;
  observedAt: number;
  lastEditAt: number | null;
  /** Characters in small edits; this is an editing metric, not an authorship claim. */
  typedChars: number;
  insertedChars: number;
  deletedChars: number;
  largestInsertion: number;
  largestInsertionLines: number;
  editCount: number;
  smallEditCount: number;
  largeInsertionCount: number;
  /** Share of inserted characters in large insertion events. */
  assistedRatio: number;
  confidence: number;
}

export type TestStatus = 'unknown' | 'passing' | 'stale' | 'failing';
export type QualityStatus = 'unknown' | 'healthy' | 'attention' | 'blocked';
export type QualityTrend = 'unknown' | 'up' | 'down' | 'steady';

/** Aggregated signals for the current workspace, with no paths or source text. */
export interface QualitySignals {
  hasProject: boolean;
  diagnosticsErrors: number;
  diagnosticsWarnings: number;
  failingTests?: number;
  redBlockers?: number;
  openTodos?: number;
  fixmeHacks?: number;
  largeFileCount?: number;
  buildFailed?: boolean;
  tests: TestStatus;
  /** Blockers known to be independent of diagnostics. Overrides inferred overlap. */
  unmatchedBlockers?: number;
}

export interface QualitySnapshot {
  status: QualityStatus;
  score: number | null;
  correctness: number | null;
  maintainability: number | null;
  testing: number | null;
  trend: QualityTrend;
  diagnosticsErrors: number;
  diagnosticsWarnings: number;
  failingTests: number;
  redBlockers: number;
  unmatchedBlockers: number;
  openTodos: number;
  fixmeHacks: number;
  largeFileCount: number;
  buildFailed: boolean;
  tests: TestStatus;
  measuredAt: number;
}

export interface DeveloperStateSnapshot {
  behavior: CodingBehaviorSnapshot;
  quality: QualitySnapshot;
  musicPlaying: boolean;
  musicStatus: string;
  tests: TestStatus;
  redBlockers: number;
  observedAt: number;
}
