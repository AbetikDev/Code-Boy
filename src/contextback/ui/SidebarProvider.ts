import * as vscode from 'vscode';
import type { CBDashboardData } from '../types';
import { formatDuration } from '../util';

/** Lightweight tree item for the Activity Bar sidebar view */
class CBItem extends vscode.TreeItem {
  constructor(label: string, description?: string, collapsible = vscode.TreeItemCollapsibleState.None) {
    super(label, collapsible);
    this.description = description;
  }
}

export class SidebarProvider implements vscode.TreeDataProvider<CBItem>, vscode.Disposable {
  static readonly viewId = 'contextback.sidebar';
  private readonly emitter = new vscode.EventEmitter<CBItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private data: CBDashboardData | null = null;
  private readonly sub: vscode.Disposable;

  constructor(private getData: () => Promise<CBDashboardData | null>) {
    this.sub = vscode.window.registerTreeDataProvider(SidebarProvider.viewId, this);
  }

  refresh(): void { void this.reload(); }

  private async reload(): Promise<void> {
    this.data = await this.getData();
    this.emitter.fire(undefined);
  }

  getTreeItem(element: CBItem): vscode.TreeItem { return element; }

  async getChildren(): Promise<CBItem[]> {
    if (!this.data) return [new CBItem('No active project')];
    const d = this.data;
    const items: CBItem[] = [];
    items.push(new CBItem('📁 Project', d.project.name));
    items.push(new CBItem('⎇ Branch', d.branch.name));
    items.push(new CBItem(''));
    items.push(new CBItem('Today', formatDuration(d.todayMinutes * 60000)));
    items.push(new CBItem('This week', formatDuration(d.weekMinutes * 60000)));
    items.push(new CBItem('Sessions', String(d.totalSessions)));
    if (d.openThreads.length) {
      items.push(new CBItem(''));
      items.push(new CBItem('Open threads', `${d.openThreads.length}`));
      for (const t of d.openThreads.slice(0, 3)) {
        const dot = t.signal === 'red' ? '🔴' : t.signal === 'yellow' ? '🟡' : '🟢';
        items.push(new CBItem(`${dot} ${t.title}`));
      }
    }
    if (d.openTodos.length) {
      items.push(new CBItem(''));
      items.push(new CBItem('TODOs', `${d.openTodos.length}`));
      for (const t of d.openTodos.slice(0, 3)) items.push(new CBItem(`□ ${t.text.slice(0, 40)}`));
    }
    return items;
  }

  dispose(): void { this.emitter.dispose(); this.sub.dispose(); }
}
