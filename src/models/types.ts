export const CHARACTER_STATES = ['IDLE', 'CODING', 'VIBE_CODING', 'THINKING', 'HAPPY', 'VERY_HAPPY', 'SAD', 'VERY_SAD', 'TIRED', 'SLEEPING', 'LISTENING_MUSIC', 'DANCING', 'ERROR', 'SUCCESS', 'CONFUSED', 'BORED', 'AFK', 'CELEBRATING'] as const;
export type CharacterState = typeof CHARACTER_STATES[number];
export const ROOM_THEMES = ['DEFAULT', 'NIGHT', 'CYBER', 'FOREST', 'SPACE', 'RETRO_PC'] as const;
export type RoomTheme = typeof ROOM_THEMES[number];
export interface Stats { mood: number; energy: number; focus: number; boredom: number; happiness: number; xp: number; level: number }
export interface DailyStats { date: string; codingSeconds: number; filesSaved: number; errorsFixed: number; buildsCompleted: number }
export interface Settings {
  enabled: boolean; soundEnabled: boolean; musicDetection: boolean; animations: boolean; reactions: boolean;
  idleAnimations: boolean; showDiagnosticsReaction: boolean; vibeMode: boolean; roomTheme: RoomTheme;
  animationSpeed: number; reducedMotion: boolean;
}
export const DEFAULT_SETTINGS: Settings = { enabled: true, soundEnabled: false, musicDetection: false, animations: true, reactions: true, idleAnimations: true, showDiagnosticsReaction: true, vibeMode: false, roomTheme: 'DEFAULT', animationSpeed: 1, reducedMotion: false };
export interface LanguageProfile { id: string; displayName: string; icon: string; color: string; reactions: string[] }
export interface SavedState { version: 1; stats: Stats; daily: DailyStats; unlockedItems: string[]; room: RoomTheme; streak: number; lastCodingDate: string; savedAt: number; progression?: { date: string; xpEarned: number; cooldowns: Record<string, number>; codingRemainder: number } }
export interface Snapshot {
  state: CharacterState; animation: string; stats: Stats; daily: DailyStats; unlockedItems: string[];
  room: RoomTheme; streak: number; language: LanguageProfile; bubble: string; bubbleKind: 'TOP' | 'LEFT' | 'RIGHT' | 'BOTTOM' | 'THOUGHT' | 'WARNING' | 'HAPPY';
  musicPlaying: boolean; musicStatus: string; settings: Settings; hasWorkspace: boolean; development: boolean;
  typingSpeed: number; nextLevelXp: number;
}
export type Action = 'pet' | 'look' | 'music' | 'dance' | 'sleep' | 'wake' | 'play' | 'vibe';
export type ActivityEvent =
  | { type: 'typing'; characters: number; languageId: string }
  | { type: 'editor'; languageId: string }
  | { type: 'save'; languageId: string }
  | { type: 'diagnostics'; errors: number; previousErrors: number }
  | { type: 'taskStart'; kind: 'build' | 'test' | 'task' }
  | { type: 'taskEnd'; success: boolean; kind: 'build' | 'test' | 'task' }
  | { type: 'taskCancel' }
  | { type: 'debug'; active: boolean }
  | { type: 'terminal' }
  | { type: 'focus'; focused: boolean };
export interface AnimationDefinition { name: string; src: string; frameWidth: number; frameHeight: number; frames: number; fps: number; loop: boolean; priority?: number; rarity?: 'COMMON' | 'UNCOMMON' | 'RARE' | 'LEGENDARY'; next?: string }
export interface AssetImage { src: string; width: number; height: number }
export interface AssetManifest { character: Record<string, AnimationDefinition>; room: Record<string, AssetImage>; icons: Record<string, AssetImage>; effects: Record<string, AnimationDefinition> }
export type ClientMessage = { type: 'ready' } | { type: 'action'; action: Action } | { type: 'room'; room: RoomTheme } | { type: 'command'; command: 'stats' | 'room' | 'settings' | 'gallery' } | { type: 'debug'; state?: CharacterState; mood?: number; energy?: number; random?: boolean; animation?: string; fps?: number };
export type HostMessage = { type: 'snapshot'; snapshot: Snapshot } | { type: 'init'; manifest: AssetManifest; snapshot: Snapshot } | { type: 'visibility'; visible: boolean } | { type: 'panel'; panel: 'stats' | 'room' | 'gallery' } | { type: 'error'; message: string };
