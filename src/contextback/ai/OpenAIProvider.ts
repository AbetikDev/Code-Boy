import type { CBSessionAnalysis } from '../types';
import type { AIProvider } from './AIProvider';

const SYSTEM_PROMPT = `You are a developer context analyzer. Given metadata about a coding session (NO source code), return a JSON object with this exact shape:
{
  "topic": "short label",
  "summary": "1-2 sentence description",
  "completed": ["item1", "item2"],
  "unfinished": ["item1", "item2"],
  "nextStep": "one actionable sentence",
  "confidence": 0.0-1.0
}
Only return valid JSON, no extra text.`;

export class OpenAIProvider implements AIProvider {
  constructor(private readonly apiKey: string, private readonly model = 'gpt-4o-mini') {}

  isAvailable(): boolean { return Boolean(this.apiKey); }

  async summarize(contextDump: string): Promise<CBSessionAnalysis | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: contextDump.slice(0, 4000) },
          ],
          max_tokens: 400,
          temperature: 0.2,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';
      const parsed = JSON.parse(content.trim()) as Partial<CBSessionAnalysis>;
      return {
        topic: String(parsed.topic ?? ''),
        summary: String(parsed.summary ?? ''),
        completed: Array.isArray(parsed.completed) ? parsed.completed.map(String) : [],
        unfinished: Array.isArray(parsed.unfinished) ? parsed.unfinished.map(String) : [],
        nextStep: String(parsed.nextStep ?? ''),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        topics: [],
      };
    } catch {
      return null;
    }
  }
}
