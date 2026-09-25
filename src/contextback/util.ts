import { randomBytes } from 'node:crypto';

/** Generate a short unique ID (URL-safe base64, 12 chars ≈ 72 bits). */
export function nanoid(): string {
  return randomBytes(9).toString('base64url');
}

/** Format milliseconds as human-readable duration. */
export function formatDuration(ms: number): string {
  const totalSecs = Math.round(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Format a timestamp as relative time ("3 days ago", "2 hours ago"). */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.round(diff / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

/** Simple glob-match (supports ** and *). */
export function matchGlob(pattern: string, filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  const regex = pattern
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*/g, '§STAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§STAR§/g, '.*');
  return new RegExp(`^${regex}$`).test(norm) || new RegExp(regex).test(norm);
}

/** Return true if filePath matches any of the exclude patterns. */
export function isExcluded(filePath: string, patterns: string[]): boolean {
  return patterns.some(p => matchGlob(p, filePath));
}
