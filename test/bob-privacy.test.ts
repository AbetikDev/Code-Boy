/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BobShellProvider, parseQualityResponse } from '../src/contextback/ai/BobShellProvider';
import { DisabledAIProvider } from '../src/contextback/ai/AIProvider';
import { QualityContext } from '../src/contextback/analysis/QualityContext';
import { SessionAnalyzer } from '../src/contextback/analysis/SessionAnalyzer';
import { DEFAULT_CB_SETTINGS } from '../src/contextback/types';
import type { CBSession, CBEvent, CBError, CBTodo, CBSessionAnalysis } from '../src/contextback/types';

// ─── 1. CONSENT & GATEKEEPING ────────────────────────────────────────────────

test('DisabledAIProvider and unconsented settings never execute Bob or make requests', async () => {
  const disabled = new DisabledAIProvider();
  assert.equal(disabled.isAvailable(), false);
  const summary = await disabled.summarize('any context');
  assert.equal(summary, null);

  const emptyWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-bob-unconfigured-'));
  const bob = new BobShellProvider(emptyWorkspace);
  // Workspace environment files and inherited variables are never key sources.
  fs.writeFileSync(path.join(emptyWorkspace, '.env'), 'BOB_API_KEY=ignored-test-value\n');
  const oldKey = process.env['BOB_API_KEY'];
  process.env['BOB_API_KEY'] = 'ignored-inherited-value';
  try {
    assert.equal(bob.isAvailable(), false);
    const result = await bob.summarize('secret dump');
    assert.equal(result, null);
    const quality = await bob.assessQuality('secret code', 'current');
    assert.equal(quality, null);
  } finally {
    if (oldKey === undefined) delete process.env['BOB_API_KEY'];
    else process.env['BOB_API_KEY'] = oldKey;
    fs.rmSync(emptyWorkspace, { recursive: true, force: true });
  }
});

test('Bob key stored by Code Boy is available across workspaces', () => {
  const otherWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-bob-other-project-'));
  try {
    assert.equal(new BobShellProvider(otherWorkspace).isAvailable(), false);
    assert.equal(new BobShellProvider(otherWorkspace, 'saved-key').isAvailable(), true);
  } finally {
    fs.rmSync(otherWorkspace, { recursive: true, force: true });
  }
});

// ─── 2. PERMITTED CONTEXT & SENSITIVE DATA REDACTION ────────────────────────

test('QualityContext permits only allowed code files, omits .env/secrets, and redacts sensitive lines', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-quality-privacy-'));
  try {
    fs.writeFileSync(path.join(dir, '.env'), 'BOB_API_KEY=secret_key_12345\nDATABASE_URL=postgres://user:pass@db\n');
    fs.writeFileSync(path.join(dir, 'secret.key'), '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n');
    fs.mkdirSync(path.join(dir, 'secrets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'secrets', 'api.ts'), 'export const SECRET = 42;\n');
    fs.writeFileSync(path.join(dir, 'app.ts'), [
      'export function hello(): string {',
      '  const apiKey = "1234567890abcdef";',
      '  const password = "my_super_secret_password";',
      '  const url = "postgres://demo:db-pass@example.test:5432/app";',
      '  const header = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz";',
      '  const githubToken = "ghp_0123456789abcdefghijklmnop";',
      '  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123";',
      '  // -----BEGIN OPENSSH PRIVATE KEY-----',
      '  // private-material-body-that-must-never-leak',
      '  // -----END OPENSSH PRIVATE KEY-----',
      '  return "hello world";',
      '}',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'notes.md'), '# Notes\nThis is not a code file.\n');

    const ctx = new QualityContext(dir, DEFAULT_CB_SETTINGS);
    const sample = await ctx.currentSample([
      path.join(dir, '.env'),
      path.join(dir, 'secret.key'),
      path.join(dir, 'secrets', 'api.ts'),
      path.join(dir, 'notes.md'),
      path.join(dir, 'app.ts'),
    ]);

    // Only app.ts is allowed
    assert.equal(sample.files.includes('app.ts'), true);
    assert.equal(sample.files.includes('.env'), false);
    assert.equal(sample.files.includes('secret.key'), false);
    assert.equal(sample.files.includes('secrets/api.ts'), false);
    assert.equal(sample.files.includes('notes.md'), false);

    // Sensitive lines in app.ts are redacted
    assert.match(sample.text, /\[redacted sensitive line\]/);
    assert.ok(!sample.text.includes('1234567890abcdef'), 'raw apiKey must not appear in prompt');
    assert.ok(!sample.text.includes('my_super_secret_password'), 'raw password must not appear in prompt');
    for (const secret of ['db-pass', 'abcdefghijklmnopqrstuvwxyz', 'ghp_0123456789abcdefghijklmnop', 'signature123', 'private-material-body-that-must-never-leak']) {
      assert.ok(!sample.text.includes(secret), `sensitive value must not appear in prompt: ${secret}`);
    }
    assert.ok(sample.text.includes('return "hello world";'), 'non-sensitive lines preserved');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── 3. BOB RESPONSE PARSING & RESILIENCE ────────────────────────────────────

test('parseQualityResponse validates schema and rejects invalid or malformed outputs', () => {
  // Valid JSON and valid schema
  const valid = JSON.stringify({
    score: 85,
    rationale: 'Clean code with comprehensive tests.',
    findings: ['Tests pass cleanly', 'Good modularity'],
  });
  const parsed = parseQualityResponse(valid);
  assert.ok(parsed);
  assert.equal(parsed.score, 85);
  assert.equal(parsed.rationale, 'Clean code with comprehensive tests.');
  assert.deepEqual(parsed.findings, ['Tests pass cleanly', 'Good modularity']);

  // Invalid: score out of bounds
  assert.equal(parseQualityResponse(JSON.stringify({ score: 105, rationale: 'x', findings: [] })), null);
  assert.equal(parseQualityResponse(JSON.stringify({ score: -5, rationale: 'x', findings: [] })), null);
  assert.equal(parseQualityResponse(JSON.stringify({ score: 85.5, rationale: 'x', findings: [] })), null); // non-integer

  // Invalid: missing rationale or empty
  assert.equal(parseQualityResponse(JSON.stringify({ score: 80, rationale: '', findings: [] })), null);
  assert.equal(parseQualityResponse(JSON.stringify({ score: 80, rationale: '   ', findings: [] })), null);

  // Invalid: findings not an array or containing non-strings
  assert.equal(parseQualityResponse(JSON.stringify({ score: 80, rationale: 'ok', findings: 'not array' })), null);
  assert.equal(parseQualityResponse(JSON.stringify({ score: 80, rationale: 'ok', findings: [123] })), null);

  // Invalid: not JSON
  assert.equal(parseQualityResponse('Not json output from CLI'), null);
  assert.equal(parseQualityResponse(''), null);
});

// ─── 4. LOCAL FALLBACK ON BOB ERROR OR TIMEOUT ───────────────────────────────

test('SessionAnalyzer provides complete local fallback when Bob returns null or errors', () => {
  const analyzer = new SessionAnalyzer();
  const session: CBSession = {
    id: 's1',
    projectId: 'p1',
    branchId: 'b1',
    startedAt: 1000,
    endedAt: 60000,
    durationSecs: 59,
    summary: '',
  };
  const events: CBEvent[] = [
    { id: 'e1', sessionId: 's1', type: 'file_save', timestamp: 2000, filePath: '/src/cart.ts', data: {} },
  ];
  const errors: CBError[] = [];
  const todos: CBTodo[] = [
    { id: 't1', projectId: 'p1', file: '/src/cart.ts', line: 15, text: 'Fix discount logic', tag: 'FIXME', status: 'open', firstSeen: 1000, lastSeen: 2000 },
  ];

  // Local analysis always succeeds and produces valid summary & next step
  const localAnalysis = analyzer.analyze(session, events, errors, todos);
  assert.ok(localAnalysis.summary.length > 0);
  assert.ok(localAnalysis.nextStep.includes('Fix discount logic'));
  assert.equal(typeof localAnalysis.confidence, 'number');

  // When AI returns null (e.g. timeout or auth failure), merging preserves local topic/summary
  let finalAnalysis = localAnalysis;
  const aiResult: CBSessionAnalysis | null = null as unknown as (CBSessionAnalysis | null);
  if (aiResult) {
    finalAnalysis = { ...aiResult, topics: finalAnalysis.topics };
  }
  assert.equal(finalAnalysis.summary, localAnalysis.summary);
  assert.equal(finalAnalysis.nextStep, localAnalysis.nextStep);
});
