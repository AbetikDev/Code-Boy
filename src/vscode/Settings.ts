import * as vscode from 'vscode';
import { DEFAULT_SETTINGS, ROOM_THEMES, Settings } from '../models/types';

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('codeBoy');
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = config.get<unknown>(key);
    if (typeof DEFAULT_SETTINGS[key] === 'boolean' && typeof value === 'boolean') Object.assign(result, { [key]: value });
  }
  const theme = config.get<unknown>('roomTheme');
  if (typeof theme === 'string' && ROOM_THEMES.includes(theme as Settings['roomTheme'])) result.roomTheme = theme as Settings['roomTheme'];
  const speed = config.get<unknown>('animationSpeed');
  if (typeof speed === 'number' && Number.isFinite(speed)) result.animationSpeed = Math.max(0.5, Math.min(1.5, speed));
  return result;
}
export async function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await vscode.workspace.getConfiguration('codeBoy').update(key, value, vscode.ConfigurationTarget.Global);
}
