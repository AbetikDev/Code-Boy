import { spawn } from 'node:child_process';
import type { CBSessionAnalysis } from '../types';
import type { AIProvider } from './AIProvider';

/** Uses IBM Bob Shell's documented non-interactive JSON output. */
export class BobShellProvider implements AIProvider {
  constructor(private readonly workspace: string) {}

  isAvailable(): boolean { return true; }

  async summarize(contextDump: string): Promise<CBSessionAnalysis | null> {
    const prompt = `Summarize this developer session metadata. Do not edit files or run commands. Return only a JSON object with topic, summary, completed (string array), unfinished (string array), nextStep, and confidence (number from 0 to 1).\n\n${contextDump.slice(0, 4000)}`;
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const bobArgs = ['run', '--format', 'json', '--mode', 'ask', '--max-turns', '1', '--max-cost', '0.10'];
        // npm installs Windows command shims as .cmd files, which CreateProcess
        // cannot execute directly. Route the fixed CLI arguments through cmd.exe.
        const command = process.platform === 'win32' ? 'cmd.exe' : 'bob';
        const args = process.platform === 'win32'
          ? ['/d', '/s', '/c', 'bob.cmd', ...bobArgs]
          : bobArgs;
        const child = spawn(command, args, {
          cwd: this.workspace, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => child.kill(), 45_000);
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
          if (stdout.length > 524_288) child.kill();
        });
        child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2048); });
        child.on('error', reject);
        child.on('close', code => {
          clearTimeout(timer);
          if (code === 0) resolve(stdout);
          else reject(new Error(stderr || `Bob Shell exited with code ${code}`));
        });
        child.stdin.on('error', () => { /* process exit is handled above */ });
        child.stdin.end(prompt);
      });
      const result = JSON.parse(output) as { status?: string; last_message?: string };
      if (result.status !== 'success' || typeof result.last_message !== 'string') return null;
      const content = result.last_message.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(content) as Partial<CBSessionAnalysis>;
      if (typeof parsed.summary !== 'string' || !parsed.summary) return null;
      return {
        topic: String(parsed.topic ?? 'Development'), summary: parsed.summary,
        completed: Array.isArray(parsed.completed) ? parsed.completed.map(String) : [],
        unfinished: Array.isArray(parsed.unfinished) ? parsed.unfinished.map(String) : [],
        nextStep: String(parsed.nextStep ?? ''),
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
        topics: [],
      };
    } catch {
      return null;
    }
  }
}
