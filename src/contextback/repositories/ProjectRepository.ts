import { createHash } from 'node:crypto';
import type { Database } from '../Database';
import type { CBProject } from '../types';

export class ProjectRepository {
  constructor(private readonly db: Database) {}

  static makeId(rootPath: string, gitRemote: string): string {
    return createHash('sha1').update(rootPath + '\0' + gitRemote).digest('hex').slice(0, 16);
  }

  findOrCreate(rootPath: string, gitRemote: string, name: string): CBProject {
    const id = ProjectRepository.makeId(rootPath, gitRemote);
    const projects = this.db.get('projects');
    let project = projects.find(p => p.id === id);
    if (!project) {
      project = { id, name, rootPath, gitRemote, createdAt: Date.now(), lastSeenAt: Date.now() };
      this.db.set('projects', [...projects, project]);
    } else {
      project.lastSeenAt = Date.now();
      project.name = name;
      this.db.set('projects', projects);
    }
    return project;
  }

  findById(id: string): CBProject | undefined {
    return this.db.get('projects').find(p => p.id === id);
  }

  all(): CBProject[] {
    return this.db.get('projects');
  }
}
