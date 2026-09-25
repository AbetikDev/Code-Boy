import * as vscode from 'vscode';
import { SavedState } from './models/types';

export const STATE_KEY = 'codeBoy.state.v1';
/** Serializes writes, so an older asynchronous save cannot overwrite a newer one. */
export class StateStore {
  private writing: Promise<void> = Promise.resolve();
  constructor(private readonly state: vscode.Memento) {}
  read(): unknown { return this.state.get(STATE_KEY); }
  save(value: SavedState): Promise<void> {
    const copy: SavedState = JSON.parse(JSON.stringify(value)) as SavedState;
    this.writing = this.writing.catch(() => undefined).then(async () => { await this.state.update(STATE_KEY, copy); });
    return this.writing;
  }
}
