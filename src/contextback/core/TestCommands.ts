/** A stable key for the same tracked test invocation across terminal runs. */
import type { CBEvent, CBOpenThread } from '../types';

export function testCommandKey(command: string): string | undefined {
  const normalized = command.trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/(?:\s+--(?:watch|runinband|ci|color|no-color))\b/g, '')
    .replace(/\s+--\s*$/, '');
  if (!/^(?:(?:npm|pnpm|yarn|bun)(?: run)? test(?:[:\w-]*)?\b|(?:npx )?(?:jest|vitest|mocha|playwright)\b|(?:python(?:3)? -m )?pytest\b|go test\b|cargo test\b|dotnet test\b)/.test(normalized)) return undefined;
  return normalized;
}

export function failedTestThreads(projectId: string, events: CBEvent[]): CBOpenThread[] {
  const seen = new Set<string>();
  const result: CBOpenThread[] = [];
  for (const event of [...events].sort((a, b) => b.timestamp - a.timestamp)) {
    if (event.type !== 'terminal_command') continue;
    const command = event.data['command'];
    const exitCode = event.data['exitCode'];
    if (typeof command !== 'string' || typeof exitCode !== 'number') continue;
    const key = testCommandKey(command);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (exitCode === 0) continue;
    result.push({ id: `test:${projectId}:${key}`, title: 'Tests', blockerIds: [`test:${projectId}:${key}`],
      lastTouched: event.timestamp, lastError: `Test command failed (exit ${exitCode}): ${command.slice(0, 100)}`,
      unfinishedScore: 1, signal: 'red', todoCount: 0 });
  }
  return result;
}
