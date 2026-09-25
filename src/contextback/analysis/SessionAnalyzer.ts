import type { CBSession, CBEvent, CBError, CBTodo, CBSessionAnalysis, CBCommit } from '../types';
import { TopicAnalyzer } from './TopicAnalyzer';
import { formatDuration } from '../util';

export class SessionAnalyzer {
  private readonly topics = new TopicAnalyzer();

  analyze(session: CBSession, events: CBEvent[], errors: CBError[], todos: CBTodo[]): CBSessionAnalysis {
    const topicList = this.topics.analyze(events);
    const topTopic = topicList[0];
    const confidence = topTopic?.confidence ?? 0;
    const topic = topTopic ? topTopic.name : 'General development';

    const commits = events
      .filter(e => e.type === 'git_commit')
      .map(e => e.data['message'] as string)
      .filter(Boolean);

    const recentFiles = [...new Set(events.filter(e => e.filePath).map(e => e.filePath))].slice(0, 6);
    const completedItems: string[] = [];
    const unfinishedItems: string[] = [];

    for (const commit of commits) completedItems.push(`Committed: ${commit}`);
    for (const error of errors.filter(e => !e.resolved)) unfinishedItems.push(`Fix: ${error.message.slice(0, 80)}`);
    for (const todo of todos.filter(t => t.status === 'open')) unfinishedItems.push(`${todo.tag}: ${todo.text.slice(0, 80)}`);

    const durationStr = formatDuration((session.durationSecs || 0) * 1000);
    const fileCount = recentFiles.length;

    let summary = `Worked on ${topic.toLowerCase()}`;
    if (fileCount) summary += ` across ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    if (commits.length) summary += `, made ${commits.length} commit${commits.length !== 1 ? 's' : ''}`;
    summary += `. Session lasted ${durationStr}.`;

    let nextStep = '';
    if (errors.filter(e => !e.resolved).length > 0) {
      nextStep = `Fix: ${errors.find(e => !e.resolved)!.message.slice(0, 100)}`;
    } else if (todos.length > 0) {
      nextStep = `${todos[0]!.tag}: ${todos[0]!.text.slice(0, 100)}`;
    } else if (commits.length === 0 && fileCount > 0) {
      nextStep = 'Consider committing your recent changes';
    }

    return { topic, summary, completed: completedItems, unfinished: unfinishedItems, nextStep, confidence, topics: topicList };
  }

  /** Build a plain-text context dump for AI summarization (no code contents). */
  buildContextDump(
    projectName: string, branch: string,
    events: CBEvent[], errors: CBError[], todos: CBTodo[],
    commits: CBCommit[], diffStat: string
  ): string {
    const lines: string[] = [
      `Project: ${projectName}`,
      `Branch: ${branch}`,
      '',
      'Changed files:',
      ...[ ...new Set(events.filter(e => e.filePath).map(e => e.filePath))].slice(0, 20),
      '',
      'Git commits:',
      ...commits.slice(0, 10).map(c => `- [${c.hash}] ${c.message}`),
      '',
      'Terminal commands:',
      ...events.filter(e => e.type === 'terminal_command').map(e => `- ${e.data['command']} (exit ${e.data['exitCode']})`).slice(0, 20),
      '',
      'Diagnostics:',
      ...errors.filter(e => !e.resolved).slice(0, 10).map(e => `- [${e.severity}] ${e.file}:${e.line}: ${e.message}`),
      '',
      'Open TODOs:',
      ...todos.filter(t => t.status === 'open').slice(0, 10).map(t => `- [${t.tag}] ${t.file}:${t.line}: ${t.text}`),
      '',
      `Diff summary: ${diffStat}`,
    ];
    return lines.join('\n');
  }
}
