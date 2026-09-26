/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, timeAgo, matchGlob, isExcluded } from '../src/contextback/util';

// ─── 1. FORMAT DURATION ───────────────────────────────────────────────────────

test('formatDuration renders minutes only for durations under one hour', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(30_000), '0m');    // 30 s → Math.floor(30/60) = 0 m
  assert.equal(formatDuration(60_000), '1m');
  assert.equal(formatDuration(90_000), '1m');    // totalSecs=90, minutes=Math.floor(90/60)=1
  assert.equal(formatDuration(5 * 60_000), '5m');
  assert.equal(formatDuration(59 * 60_000), '59m');
});

test('formatDuration renders hours and minutes for durations of one hour or more', () => {
  assert.equal(formatDuration(60 * 60_000), '1h 0m');
  assert.equal(formatDuration(90 * 60_000), '1h 30m');
  assert.equal(formatDuration(125 * 60_000), '2h 5m');
});

// ─── 2. TIME AGO ──────────────────────────────────────────────────────────────

test('timeAgo returns "just now" for timestamps within the last 2 minutes', () => {
  const now = Date.now();
  assert.equal(timeAgo(now), 'just now');
  assert.equal(timeAgo(now - 60_000), 'just now');    // Math.round(1.0) = 1 < 2 → just now
  assert.equal(timeAgo(now - 89_000), 'just now');    // Math.round(89/60) = 1 < 2 → just now
  // At 90 s, Math.round(1.5) = 2, which is NOT < 2 → 'minutes ago'
  assert.match(timeAgo(now - 120_000), /minutes ago/);
});

test('timeAgo returns minutes ago for timestamps 2–59 minutes old', () => {
  const now = Date.now();
  const result2 = timeAgo(now - 2 * 60_000);
  assert.match(result2, /minutes ago/);
  const result30 = timeAgo(now - 30 * 60_000);
  assert.match(result30, /minutes ago/);
  assert.match(result30, /30/);
});

test('timeAgo returns hours ago for timestamps 1–23 hours old', () => {
  const now = Date.now();
  const result1 = timeAgo(now - 60 * 60_000);
  assert.match(result1, /hour/);
  assert.match(result1, /1 hour ago/);       // singular

  const result3 = timeAgo(now - 3 * 60 * 60_000);
  assert.match(result3, /3 hours ago/);      // plural
});

test('timeAgo returns days ago for timestamps 24+ hours old', () => {
  const now = Date.now();
  const result1 = timeAgo(now - 24 * 60 * 60_000);
  assert.match(result1, /1 day ago/);        // singular

  const result3 = timeAgo(now - 3 * 24 * 60 * 60_000);
  assert.match(result3, /3 days ago/);       // plural
});

// ─── 3. MATCH GLOB ────────────────────────────────────────────────────────────

test('matchGlob matches exact paths', () => {
  assert.equal(matchGlob('/src/index.ts', '/src/index.ts'), true);
  assert.equal(matchGlob('/src/index.ts', '/src/other.ts'), false);
});

test('matchGlob single-star wildcard matches within a single directory segment', () => {
  assert.equal(matchGlob('*.ts', 'index.ts'), true);
  assert.equal(matchGlob('*.ts', 'index.js'), false);
  assert.equal(matchGlob('/src/*.ts', '/src/app.ts'), true);
  assert.equal(matchGlob('/src/*.ts', '/src/deep/app.ts'), false);
});

test('matchGlob double-star matches across multiple path segments', () => {
  assert.equal(matchGlob('**/*.ts', '/a/b/c/index.ts'), true);
  assert.equal(matchGlob('**/*.ts', '/a/b/c/index.js'), false);
  assert.equal(matchGlob('**/secrets/**', '/project/secrets/key.pem'), true);
  assert.equal(matchGlob('**/secrets/**', '/project/public/key.pem'), false);
});

test('matchGlob normalises backslash separators from Windows paths', () => {
  assert.equal(matchGlob('**/*.ts', 'src\\deep\\file.ts'), true);
  assert.equal(matchGlob('**/node_modules/**', 'src\\node_modules\\pkg\\index.js'), true);
});

test('matchGlob matches the .env exclude patterns used in default settings', () => {
  assert.equal(matchGlob('**/.env*', '/project/.env'), true);
  assert.equal(matchGlob('**/.env*', '/project/.env.local'), true);
  assert.equal(matchGlob('**/*.pem', '/certs/server.pem'), true);
  assert.equal(matchGlob('**/*.key', '/certs/private.key'), true);
  assert.equal(matchGlob('**/*.key', '/src/app.ts'), false);
});

// ─── 4. IS EXCLUDED ───────────────────────────────────────────────────────────

test('isExcluded returns true when a file matches any of the provided patterns', () => {
  const patterns = ['**/.env*', '**/secrets/**', '**/*.pem', '**/*.key'];
  assert.equal(isExcluded('/project/.env', patterns), true);
  assert.equal(isExcluded('/project/.env.production', patterns), true);
  assert.equal(isExcluded('/project/secrets/token', patterns), true);
  assert.equal(isExcluded('/certs/server.pem', patterns), true);
  assert.equal(isExcluded('/certs/private.key', patterns), true);
});

test('isExcluded returns false when no patterns match', () => {
  const patterns = ['**/.env*', '**/secrets/**'];
  assert.equal(isExcluded('/src/app.ts', patterns), false);
  assert.equal(isExcluded('/src/index.js', patterns), false);
});

test('isExcluded returns false for an empty patterns array', () => {
  assert.equal(isExcluded('/src/.env', []), false);
});
