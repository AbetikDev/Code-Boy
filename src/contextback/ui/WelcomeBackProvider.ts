import * as vscode from 'vscode';
import type { CBWelcomeData } from '../types';
import { welcomeHtml } from './templates';

export class WelcomeBackProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private onCommand: (cmd: 'continue' | 'dismiss') => void
  ) {}

  show(data: CBWelcomeData): void {
    if (this.panel) {
      this.panel.webview.html = welcomeHtml(this.panel.webview, data);
      this.panel.reveal(vscode.ViewColumn.One, false);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'contextback.welcomeback',
      'Welcome Back',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
      { enableScripts: true }
    );
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.panel.webview.onDidReceiveMessage((msg: { command: string }) => {
      this.onCommand(msg.command as 'continue' | 'dismiss');
      this.panel?.dispose();
    });
    this.panel.webview.html = welcomeHtml(this.panel.webview, data);
  }

  dispose(): void { this.panel?.dispose(); }
}
