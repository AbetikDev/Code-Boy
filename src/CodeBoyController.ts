import * as vscode from 'vscode';
import { CodeBoyEngine } from './core/CodeBoyEngine';
import { Action, ClientMessage, ROOM_THEMES, RoomTheme } from './models/types';
import { MusicController, SPOTIFY_TOKEN_KEY } from './music/MusicController';
import { StateStore } from './StateStore';
import { DiagnosticsTracker } from './vscode/DiagnosticsTracker';
import { EditorTracker } from './vscode/EditorTracker';
import { readSettings, updateSetting } from './vscode/Settings';
import { TaskTracker } from './vscode/TaskTracker';
import { CodeBoyViewProvider } from './webview/CodeBoyViewProvider';

export class CodeBoyController implements vscode.Disposable {
  readonly engine: CodeBoyEngine;
  private readonly store: StateStore;
  private readonly view: CodeBoyViewProvider;
  private readonly music: MusicController;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly output = vscode.window.createOutputChannel('Code Boy');
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly saveTimer: ReturnType<typeof setInterval>;
  private disposed = false;
  private dirty = false;
  constructor(private readonly context: vscode.ExtensionContext) {
    this.store = new StateStore(context.globalState);
    const settings = readSettings();
    this.engine = new CodeBoyEngine(this.store.read(), settings, {
      development: context.extensionMode !== vscode.ExtensionMode.Production,
      hasWorkspace: Boolean(vscode.workspace.workspaceFolders?.length)
    });
    this.view = new CodeBoyViewProvider(context, this.engine, message => this.run(this.receive(message)));
    this.music = new MusicController(context, (playing, status) => this.engine.setMusic(playing, status));
    const emit = this.engine.handle.bind(this.engine);
    this.disposables.push(
      this.output, this.engine, this.view, this.music,
      vscode.window.registerWebviewViewProvider(CodeBoyViewProvider.viewType, this.view, { webviewOptions: { retainContextWhenHidden: true } }),
      new EditorTracker(emit), new DiagnosticsTracker(emit), new TaskTracker(emit),
      this.engine.onChange(() => { this.dirty = true; }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.engine.setWorkspace(Boolean(vscode.workspace.workspaceFolders?.length))),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('codeBoy')) {
          const next = readSettings();
          this.engine.updateSettings(next);
          this.run(this.music.configure(next));
        }
      })
    );
    this.timer = setInterval(() => this.engine.tick(), 1000);
    this.saveTimer = setInterval(() => { if (this.dirty) this.run(this.flush()); }, 30000);
    this.registerCommands();
    this.run(vscode.commands.executeCommand('setContext', 'codeBoy.development', context.extensionMode !== vscode.ExtensionMode.Production));
    this.run(this.music.configure(settings));
  }
  private run(work: PromiseLike<unknown>): void {
    void Promise.resolve(work).catch(() => this.output.appendLine('A Code Boy operation could not complete. Check that VS Code settings and local storage are writable.'));
  }
  private registerCommands(): void {
    const command = (name: string, handler: () => unknown) => this.disposables.push(vscode.commands.registerCommand(`codeBoy.${name}`, handler));
    command('open', () => this.open());
    command('pet', () => this.act('pet'));
    command('dance', () => this.act('dance'));
    command('toggleVibeMode', () => this.act('vibe'));
    command('sleep', () => this.act('sleep'));
    command('wakeUp', () => this.act('wake'));
    command('changeRoom', () => this.chooseRoom());
    command('showStats', async () => { await this.open(); this.view.showStats(); });
    command('toggleMusicDetection', () => updateSetting('musicDetection', !readSettings().musicDetection));
    command('resetCharacter', async () => {
      const answer = await vscode.window.showWarningMessage('Reset Code Boy’s level, stats, streak, and cosmetic unlocks on this device?', { modal: true }, 'Reset Character');
      if (answer === 'Reset Character') { this.engine.reset(); await updateSetting('roomTheme', 'DEFAULT'); await this.flush(); }
    });
    command('connectSpotify', () => this.connectSpotify());
    command('disconnectSpotify', async () => {
      await this.context.secrets.delete(SPOTIFY_TOKEN_KEY);
      await this.music.configure(readSettings());
      void vscode.window.showInformationMessage('Spotify disconnected. Manual MUSIC is always available.');
    });
    command('spriteGallery', async () => {
      if (this.context.extensionMode === vscode.ExtensionMode.Production) return;
      await this.open(); this.view.showGallery();
    });
  }
  private async open(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.codeBoy');
    await vscode.commands.executeCommand('codeBoy.companion.focus');
  }
  private async act(action: Action): Promise<void> {
    this.engine.action(action);
    if (action === 'vibe') await updateSetting('vibeMode', this.engine.snapshot().settings.vibeMode);
  }
  private async setRoom(room: RoomTheme): Promise<void> {
    this.engine.setRoom(room);
    await updateSetting('roomTheme', this.engine.snapshot().room);
  }
  private async chooseRoom(): Promise<void> {
    const levels: Record<RoomTheme, number> = { DEFAULT: 1, NIGHT: 1, RETRO_PC: 3, FOREST: 7, CYBER: 10, SPACE: 20 };
    const level = this.engine.snapshot().stats.level;
    const choice = await vscode.window.showQuickPick(ROOM_THEMES.map(room => ({
      label: room.replace('_', ' '), description: levels[room] > level ? `Unlocks at level ${levels[room]}` : room === this.engine.snapshot().room ? 'Current room' : 'Available', room
    })), { title: 'Code Boy · Choose a room' });
    if (choice && levels[choice.room] <= level) await this.setRoom(choice.room);
  }
  private async connectSpotify(): Promise<void> {
    const token = await vscode.window.showInputBox({ title: 'Optional Spotify connection', prompt: 'Paste a Spotify OAuth access token with user-read-playback-state scope. Stored in VS Code SecretStorage; expires according to Spotify.', password: true, ignoreFocusOut: true, validateInput: value => value.trim().length < 20 ? 'Enter a valid access token, or press Escape to cancel.' : undefined });
    if (!token) return;
    await this.context.secrets.store(SPOTIFY_TOKEN_KEY, token.trim());
    await updateSetting('musicDetection', true);
    await this.music.configure(readSettings());
  }
  private async receive(message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'action': await this.act(message.action); break;
      case 'room': await this.setRoom(message.room); break;
      case 'debug': if (this.context.extensionMode !== vscode.ExtensionMode.Production) this.engine.debug(message); break;
      case 'command':
        if (message.command === 'stats') this.view.showStats();
        else if (message.command === 'room') this.view.showRoom();
        else if (message.command === 'gallery' && this.context.extensionMode !== vscode.ExtensionMode.Production) this.view.showGallery();
        else if (message.command === 'settings') await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:code-boy-local.code-boy');
        break;
      case 'ready': break;
    }
  }
  async flush(): Promise<void> { this.dirty = false; await this.store.save(this.engine.serialize()); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer); clearInterval(this.saveTimer);
    for (const disposable of [...this.disposables].reverse()) disposable.dispose();
  }
}
