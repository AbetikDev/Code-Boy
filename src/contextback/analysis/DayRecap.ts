import * as path from 'node:path';
import type { CBCommit, CBDayRecap, CBEvent, CBSession, CBError, CBTodo } from '../types';
import { testCommandKey } from '../core/TestCommands';
import { yesterdayRange } from './QualityContext';

export function buildDayRecap(
  sessions: CBSession[], events: CBEvent[], commits: CBCommit[], errors: CBError[], todos: CBTodo[], now = new Date(), gitFiles: string[] = []
): CBDayRecap {
  const { day, start, end } = yesterdayRange(now);
  const daySessions = sessions.filter(s => s.startedAt < end && (s.endedAt ?? now.getTime()) > start);
  const sessionIds = new Set(daySessions.map(s => s.id));
  const dayEvents = events.filter(e => sessionIds.has(e.sessionId) && e.timestamp >= start && e.timestamp < end);
  const dayCommits = commits.filter(c => c.timestamp >= start && c.timestamp < end);
  const touched = dayEvents.filter(e => e.filePath && ['file_save', 'file_activity'].includes(e.type));
  const allFiles = [...new Set([...touched.map(e => e.filePath), ...gitFiles])];
  const area = (file: string): string => {
    const p = file.replace(/\\/g, '/');
    if (/(?:^|\/)src\//.test(p)) return 'Source';
    if (/(?:^|\/)(?:test|tests|ui-tests)\//.test(p)) return 'Tests';
    if (/(?:^|\/)(?:assets|media)\//.test(p)) return 'Visuals';
    if (/(?:^|\/)(?:docs)\//.test(p) || /README|CHANGELOG/i.test(p)) return 'Docs';
    return 'Project files';
  };
  const priority: Record<string, number> = { Source: 0, Tests: 1, Visuals: 2, Docs: 3, 'Project files': 4 };
  const areas = [...new Set(allFiles.map(area))].map(name => ({ name, count: allFiles.filter(f => area(f) === name).length }))
    .sort((a, b) => b.count - a.count).slice(0, 3);
  allFiles.sort((a, b) => priority[area(a)]! - priority[area(b)]! || a.localeCompare(b));
  const files = allFiles.slice(0, 5);
  const testEvents = dayEvents.filter(e => e.type === 'terminal_command' && typeof e.data['command'] === 'string' && testCommandKey(e.data['command'] as string));
  const tests = { passed: testEvents.filter(e => e.data['exitCode'] === 0).length, failed: testEvents.filter(e => typeof e.data['exitCode'] === 'number' && e.data['exitCode'] !== 0).length };
  const problems = errors.filter(e => !e.resolved && e.firstSeen < end).slice(0, 2).map(e => e.message);
  const dayTodos = todos.filter(t => t.status === 'open' && t.firstSeen < end);
  const minutes = Math.round(daySessions.reduce((sum, s) => sum + Math.max(0, Math.min(s.endedAt ?? now.getTime(), end) - Math.max(s.startedAt, start)), 0) / 60_000);
  const active = !!dayEvents.length || !!dayCommits.length || minutes > 0;
  const fileLabels = files.slice(0, 2).map(f => path.basename(f));
  const summary = !active ? 'No activity was recorded yesterday.'
    : dayCommits.length ? `${dayCommits.length} commit${dayCommits.length === 1 ? '' : 's'} recorded${allFiles.length ? ` across ${allFiles.length} file${allFiles.length === 1 ? '' : 's'}` : ''}.`
      : fileLabels.length ? `Worked on ${fileLabels.join(', ')}${allFiles.length > 2 ? ` and ${allFiles.length - 2} more file${allFiles.length - 2 === 1 ? '' : 's'}` : ''}.`
        : `Worked on this project for ${minutes} minutes.`;
  const nextStep = !active ? '' : tests.failed ? 'Rerun the failed tests and check the failure.'
    : problems[0] ? `Check: ${problems[0]}`
      : dayTodos[0] ? `${dayTodos[0].tag}: ${dayTodos[0].text}` : '';
  const sources: CBDayRecap['sources'] = [];
  if (dayCommits.length) sources.push('Git');
  if (dayEvents.length || minutes > 0) sources.push('ContextBack');
  return { date: day, active, summary, nextStep, minutes, files, changedFilesCount: allFiles.length, areas,
    commits: dayCommits.map(c => c.message), tests, problems, sources };
}
