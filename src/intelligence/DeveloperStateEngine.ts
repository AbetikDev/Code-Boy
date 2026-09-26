import { CodingBehaviorAnalyzer } from './CodingBehaviorAnalyzer';
import { CodeQualityAnalyzer } from './CodeQualityAnalyzer';
import { CodingBehaviorSnapshot, CodingEditSample, DeveloperStateSnapshot, QualitySignals, QualitySnapshot } from './types';

/** Coordinates the pure analyzers and exposes copy-only state for UI and future MCP consumers. */
export class DeveloperStateEngine {
  private readonly behavior = new CodingBehaviorAnalyzer();
  private readonly quality = new CodeQualityAnalyzer();
  private musicPlaying = false;
  private musicStatus = 'Music not detected';

  recordEdit(sample: CodingEditSample): CodingBehaviorSnapshot {
    return this.behavior.record(sample);
  }

  updateQuality(signals: QualitySignals, now = Date.now()): QualitySnapshot {
    return this.quality.evaluate(signals, now);
  }

  setMusic(playing: boolean, status = playing ? 'Playing' : 'Music not detected'): void {
    this.musicPlaying = playing === true;
    this.musicStatus = status;
  }

  getCodingBehavior(now = Date.now()): CodingBehaviorSnapshot {
    return this.behavior.snapshot(now);
  }

  getQualitySnapshot(): QualitySnapshot {
    return this.quality.getSnapshot();
  }

  getDeveloperState(now = Date.now()): DeveloperStateSnapshot {
    const behavior = this.getCodingBehavior(now);
    const quality = this.getQualitySnapshot();
    return {
      behavior, quality, musicPlaying: this.musicPlaying, musicStatus: this.musicStatus,
      tests: quality.tests, redBlockers: quality.redBlockers, observedAt: behavior.observedAt
    };
  }

  clear(): void {
    this.behavior.clear();
    this.quality.clear();
    this.musicPlaying = false;
    this.musicStatus = 'Music not detected';
  }
}
