import { LanguageProfile } from '../models/types';

const definitions: Array<[string, string, string, string, string]> = [
  ['c', 'C', 'code', '#3b82f6', 'close to the metal.'],
  ['cpp', 'C++', 'cpp', '#3b82f6', 'C++ mode!'],
  ['csharp', 'C#', 'csharp', '#a855f7', 'sharp thinking.'],
  ['java', 'Java', 'java', '#ff8a00', 'coffee time.'],
  ['kotlin', 'Kotlin', 'kotlin', '#a855f7', 'Kotlin time.'],
  ['javascript', 'JavaScript', 'js', '#ffd166', 'JS time.'],
  ['typescript', 'TypeScript', 'ts', '#3b82f6', 'TypeScript time.'],
  ['python', 'Python', 'python', '#ffd166', 'indent with care.'],
  ['rust', 'Rust', 'rust', '#ff8a00', 'borrowed, not stolen.'],
  ['go', 'Go', 'code', '#22d3ee', 'ready, set, Go.'],
  ['php', 'PHP', 'code', '#a855f7', 'PHP time.'],
  ['ruby', 'Ruby', 'code', '#ff8a00', 'a little Ruby.'],
  ['swift', 'Swift', 'code', '#ff8a00', 'swift progress.'],
  ['dart', 'Dart', 'code', '#22d3ee', 'right on target.'],
  ['lua', 'Lua', 'code', '#7c4dff', 'small and mighty.'],
  ['html', 'HTML', 'html', '#ff8a00', 'tag, you are it.'],
  ['css', 'CSS', 'css', '#3b82f6', 'CSS again?'],
  ['scss', 'SCSS', 'css', '#a855f7', 'style time.'],
  ['vue', 'Vue', 'code', '#5ee173', 'a nice Vue.'],
  ['javascriptreact', 'React / JSX', 'js', '#22d3ee', 'one more component.'],
  ['typescriptreact', 'React / TSX', 'ts', '#3b82f6', 'typed components.'],
  ['sql', 'SQL', 'code', '#ffd166', 'select good vibes.'],
  ['shellscript', 'Shell', 'terminal', '#5ee173', 'shell we code?'],
  ['powershell', 'PowerShell', 'terminal', '#3b82f6', 'power on.'],
  ['json', 'JSON', 'code', '#ffd166', 'braces in place.'],
  ['yaml', 'YAML', 'code', '#a855f7', 'spaces matter.'],
  ['markdown', 'Markdown', 'code', '#22d3ee', 'words are code too.'],
];

export const LANGUAGE_PROFILES: Readonly<Record<string, LanguageProfile>> = Object.freeze(Object.fromEntries(
  definitions.map(([id, displayName, icon, color, reaction]) => [id, { id, displayName, icon, color, reactions: [reaction, 'nice.', 'let\'s code.'] }]),
));

const fallback: LanguageProfile = { id: 'plaintext', displayName: 'Code', icon: 'code', color: '#22d3ee', reactions: ['let\'s code.', 'interesting...'] };

/** Only known language IDs are retained; arbitrary document metadata is never persisted. */
export function getLanguageProfile(languageId: string): LanguageProfile {
  const profile = LANGUAGE_PROFILES[languageId] ?? fallback;
  return { ...profile, reactions: [...profile.reactions] };
}
