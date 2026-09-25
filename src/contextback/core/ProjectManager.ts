import * as vscode from 'vscode';
import * as path from 'node:path';
import type { CBProject } from '../types';
import type { Database } from '../Database';
import type { GitService } from '../git/GitService';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { SessionRepository } from '../repositories/SessionRepository';

export class ProjectManager {
  private readonly projects: ProjectRepository;
  private readonly sessions: SessionRepository;
  private currentProject: CBProject | undefined;
  private workspaceRoot: string | undefined;

  constructor(
    private readonly db: Database,
    private readonly git: GitService
  ) {
    this.projects = new ProjectRepository(db);
    this.sessions = new SessionRepository(db);
  }

  async initWorkspace(): Promise<CBProject | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return undefined;
    const folder = folders[0]!;
    this.workspaceRoot = folder.uri.fsPath;
    const name = path.basename(this.workspaceRoot);
    const remote = await this.git.getRemoteUrl(this.workspaceRoot).catch(() => '');
    this.currentProject = this.projects.findOrCreate(this.workspaceRoot, remote, name);
    return this.currentProject;
  }

  get current(): CBProject | undefined {
    return this.currentProject;
  }

  get root(): string | undefined {
    return this.workspaceRoot;
  }

  refreshWorkspace(folders: readonly vscode.WorkspaceFolder[]): void {
    if (!folders.length) { this.currentProject = undefined; this.workspaceRoot = undefined; }
  }
}
