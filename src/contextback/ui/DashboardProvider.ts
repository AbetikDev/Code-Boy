import * as vscode from 'vscode';
import type { CBDashboardData } from '../types';
import { dashboardHtml } from './templates';

export class DashboardProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private getData: () => Promise<CBDashboardData | null>,
    private onCommand: (cmd: string) => void
  ) {}

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      await this.refresh();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'contextback.dashboard',
      'ContextBack Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.panel.webview.onDidReceiveMessage((msg: { command: string }) => {
      this.onCommand(msg.command);
    });
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel) return;
    const data = await this.getData();
    if (!data) {
      this.panel.webview.html = '<html><body><p>No project data available yet.</p></body></html>';
      return;
    }
    this.panel.webview.html = dashboardHtml(this.panel.webview, data);
  }

  dispose(): void { this.panel?.dispose(); }
}
