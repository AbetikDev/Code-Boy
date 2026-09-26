import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { CodeBoyEngine } from '../core/CodeBoyEngine';
import type { AssetManifest, ClientMessage, HostMessage, Snapshot } from '../models/types';
import { parseClientMessage } from './MessageRouter';

export class CodeBoyViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'codeBoy.companion';
  private view?: vscode.WebviewView;
  private manifest?: AssetManifest;
  private ready = false;
  private pendingPanel?: 'stats' | 'room' | 'gallery';
  private readonly subscriptions: vscode.Disposable[] = [];
  private viewSubscriptions: vscode.Disposable[] = [];
  private readonly development: boolean;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly engine: CodeBoyEngine,
    private readonly onMessage: (message: ClientMessage) => void
  ) {
    this.development = context.extensionMode === vscode.ExtensionMode.Development;
    this.subscriptions.push(engine.onChange(snapshot => { if (this.ready && this.view?.visible) { this.post({ type: 'snapshot', snapshot: this.safeSnapshot(snapshot) }); } }));
  }

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.viewSubscriptions.forEach(item => item.dispose());
    this.viewSubscriptions = [];
    this.ready = false;
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media'), vscode.Uri.joinPath(this.context.extensionUri, 'assets')] };

    this.viewSubscriptions.push(view.webview.onDidReceiveMessage((input: unknown) => {
      const message = parseClientMessage(input, this.development, new Set(Object.keys(this.manifest?.character ?? {})));
      if (!message) { return; }
      if (message.type === 'ready') {
        this.ready = true;
        if (this.manifest) { this.post({ type: 'init', manifest: this.manifest, snapshot: this.safeSnapshot(this.engine.snapshot()) }); }
        else { this.post({ type: 'error', message: 'The local sprite pack could not be loaded. Reinstall Code Boy to repair its assets.' }); }
        if (this.pendingPanel) { this.post({ type: 'panel', panel: this.pendingPanel }); this.pendingPanel = undefined; }
        return;
      }
      if (message.type === 'command') {
        if (message.command === 'stats' || message.command === 'room' || message.command === 'gallery') { this.openPanel(message.command); return; }
      }
      this.onMessage(message);
    }));
    this.viewSubscriptions.push(view.onDidChangeVisibility(() => {
      this.post({ type: 'visibility', visible: view.visible });
      if (view.visible && this.ready) { this.post({ type: 'snapshot', snapshot: this.safeSnapshot(this.engine.snapshot()) }); }
    }));
    this.viewSubscriptions.push(view.onDidDispose(() => { if (this.view === view) { this.view = undefined; this.ready = false; } }));
    try { this.manifest = await this.loadManifest(view.webview); }
    catch (error) { this.manifest = undefined; console.error('[Code Boy] Could not load local assets:', error); }
    if (this.view === view) { view.webview.html = this.html(view.webview); }
  }

  showStats(): void { this.openPanel('stats'); }
  showRoom(): void { this.openPanel('room'); }
  showGallery(): void { if (this.development) { this.openPanel('gallery'); } }
  dispose(): void { [...this.subscriptions, ...this.viewSubscriptions].forEach(item => item.dispose()); this.view = undefined; }

  private openPanel(panel: 'stats' | 'room' | 'gallery'): void {
    if (panel === 'gallery' && !this.development) { return; }
    if (!this.view || !this.ready) { this.pendingPanel = panel; void vscode.commands.executeCommand('codeBoy.companion.focus'); return; }
    this.view.show(true); this.post({ type: 'panel', panel });
  }
  private safeSnapshot(snapshot: Snapshot): Snapshot { return { ...snapshot, development: this.development }; }
  private post(message: HostMessage): void { if (this.view) { void this.view.webview.postMessage(message); } }

  private async loadManifest(webview: vscode.Webview): Promise<AssetManifest> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.context.extensionUri, 'assets', 'manifest.json'));
    const manifest = JSON.parse(Buffer.from(bytes).toString('utf8')) as AssetManifest;
    for (const section of ['character', 'room', 'icons', 'effects'] as const) {
      if (!manifest[section] || typeof manifest[section] !== 'object') { throw new Error(`Missing manifest section: ${section}`); }
      for (const asset of Object.values(manifest[section])) {
        if (typeof asset.src !== 'string' || !asset.src.startsWith('assets/') || asset.src.includes('..') || asset.src.includes('\\')) { throw new Error('Invalid asset path'); }
        asset.src = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, asset.src)).toString();
      }
    }
    return manifest;
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(20).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css'));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.js'));
    const sprite = this.manifest?.character.loading?.src ?? this.manifest?.character.idle?.src;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; connect-src 'none'; media-src 'none';"><link rel="stylesheet" href="${css}"><title>Code Boy</title></head><body><div id="app"><div class="boot" role="status">${sprite ? `<div class="boot-sprite"><img src="${sprite}" alt="Code Boy assembling his computer"></div>` : ''}<p>BOOTING LITTLE WORLD<span class="blink">_</span></p></div></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
  }
}
