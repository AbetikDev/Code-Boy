import type { CBSessionAnalysis } from '../types';

export interface QualityAssessment { score: number; rationale: string; findings: string[] }

export interface AIProvider {
  summarize(contextDump: string): Promise<CBSessionAnalysis | null>;
  isAvailable(): boolean;
  assessQuality(context: string, scope: 'yesterday' | 'current'): Promise<QualityAssessment | null>;
}

export class DisabledAIProvider implements AIProvider {
  isAvailable(): boolean { return false; }
  async summarize(): Promise<null> { return null; }
  async assessQuality(): Promise<null> { return null; }
}
