import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CBCommit, CBGitInfo } from '../types';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('git', args, { cwd, timeout: 8000 });
    return stdout.trim();
  } catch {
    return '';
  }
}

export class GitService {
  async getCurrentBranch(cwd: string): Promise<string> {
    const result = await git(cwd, ['branch', '--show-current']);
    return result || 'HEAD';
  }

  async getRemoteUrl(cwd: string): Promise<string> {
    return git(cwd, ['remote', 'get-url', 'origin']);
  }

  async getChangedFiles(cwd: string): Promise<string[]> {
    const out = await git(cwd, ['status', '--short']);
    return out.split('\n').filter(Boolean).map(line => line.slice(3).trim()).filter(Boolean);
  }

  async getStagedFiles(cwd: string): Promise<string[]> {
    const out = await git(cwd, ['diff', '--cached', '--name-only']);
    return out.split('\n').filter(Boolean);
  }

  async getRecentCommits(cwd: string, n = 10): Promise<CBCommit[]> {
    const fmt = '%H\x1F%s\x1F%an\x1F%ct\x1F%n';
    const out = await git(cwd, ['log', `-${n}`, `--pretty=format:${fmt}`]);
    return out.split('\n').filter(Boolean).map(line => {
      const parts = line.split('\x1F');
      return {
        hash: parts[0]?.slice(0, 8) ?? '',
        message: parts[1] ?? '',
        author: parts[2] ?? '',
        timestamp: (Number(parts[3]) || 0) * 1000,
        filesChanged: 0,
      };
    }).filter(c => c.hash);
  }

  async getCommitsInRange(cwd: string, start: number, end: number): Promise<CBCommit[]> {
    const fmt = '%H\x1F%s\x1F%an\x1F%ct';
    const out = await git(cwd, ['log', '--max-count=50', `--since=${new Date(start).toISOString()}`,
      `--until=${new Date(end - 1).toISOString()}`, `--pretty=format:${fmt}`]);
    return out.split('\n').filter(Boolean).map(line => {
      const parts = line.split('\x1F');
      return { hash: parts[0] ?? '', message: parts[1] ?? '', author: parts[2] ?? '',
        timestamp: (Number(parts[3]) || 0) * 1000, filesChanged: 0 };
    }).filter(c => c.hash && c.timestamp >= start && c.timestamp < end);
  }

  async getFilesForCommits(cwd: string, commits: CBCommit[]): Promise<string[]> {
    const files = new Set<string>();
    for (const commit of commits.slice(0, 20)) {
      const out = await git(cwd, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', commit.hash]);
      const names = out.split('\n').filter(Boolean);
      commit.filesChanged = names.length;
      for (const name of names) files.add(name);
    }
    return [...files];
  }

  async getDiffStat(cwd: string): Promise<string> {
    const out = await git(cwd, ['diff', '--stat', 'HEAD']);
    const lines = out.split('\n').filter(Boolean);
    return lines.slice(-1)[0] ?? '';
  }

  async getFullInfo(cwd: string): Promise<CBGitInfo> {
    const [branch, changedFiles, stagedFiles, commits, diffStat] = await Promise.all([
      this.getCurrentBranch(cwd),
      this.getChangedFiles(cwd),
      this.getStagedFiles(cwd),
      this.getRecentCommits(cwd),
      this.getDiffStat(cwd),
    ]);
    return { branch, changedFiles, stagedFiles, commits, diffStat };
  }
}
