import type { CBSessionAnalysis } from '../types';

export interface AIProvider {
  summarize(contextDump: string): Promise<CBSessionAnalysis | null>;
  isAvailable(): boolean;
}

export class DisabledAIProvider implements AIProvider {
  isAvailable(): boolean { return false; }
  async summarize(): Promise<null> { return null; }
}
