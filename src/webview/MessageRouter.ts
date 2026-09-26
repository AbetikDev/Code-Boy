import { CHARACTER_STATES, ROOM_THEMES } from '../models/types';
import type { Action, CharacterState, ClientMessage, RoomTheme } from '../models/types';

const actions = new Set<Action>(['pet', 'look', 'music', 'dance', 'sleep', 'wake', 'play', 'vibe']);
const commands = new Set(['stats', 'room', 'settings', 'gallery', 'context', 'toggleOverlay']);
const ownKeys = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).every(key => keys.includes(key));

/** Treat messages as untrusted even though the webview is local. */
export function parseClientMessage(input: unknown, development: boolean, animations: ReadonlySet<string> = new Set()): ClientMessage | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) { return; }
  const value = input as Record<string, unknown>;
  switch (value.type) {
    case 'ready': return ownKeys(value, ['type']) ? { type: 'ready' } : undefined;
    case 'action':
      return ownKeys(value, ['type', 'action']) && typeof value.action === 'string' && actions.has(value.action as Action) ? { type: 'action', action: value.action as Action } : undefined;
    case 'room':
      return ownKeys(value, ['type', 'room']) && ROOM_THEMES.includes(value.room as RoomTheme) ? { type: 'room', room: value.room as RoomTheme } : undefined;
    case 'command':
      if (!ownKeys(value, ['type', 'command']) || typeof value.command !== 'string' || !commands.has(value.command) || (value.command === 'gallery' && !development)) { return; }
      return { type: 'command', command: value.command as 'stats' | 'room' | 'settings' | 'gallery' | 'context' | 'toggleOverlay' };
    case 'debug': {
      if (!development || !ownKeys(value, ['type', 'state', 'mood', 'energy', 'random', 'animation', 'fps'])) { return; }
      if (value.state !== undefined && !CHARACTER_STATES.includes(value.state as CharacterState)) { return; }
      for (const key of ['mood', 'energy']) { if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 100)) { return; } }
      if (value.random !== undefined && typeof value.random !== 'boolean') { return; }
      if (value.animation !== undefined && (typeof value.animation !== 'string' || !animations.has(value.animation))) { return; }
      if (value.fps !== undefined && (typeof value.fps !== 'number' || !Number.isFinite(value.fps) || value.fps < 4 || value.fps > 12)) { return; }
      return { type: 'debug', state: value.state as CharacterState | undefined, mood: value.mood as number | undefined, energy: value.energy as number | undefined, random: value.random as boolean | undefined, animation: value.animation as string | undefined, fps: value.fps as number | undefined };
    }
    default: return;
  }
}
