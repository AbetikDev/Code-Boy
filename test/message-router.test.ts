import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseClientMessage } from '../src/webview/MessageRouter';

test('webview accepts only enumerated actions and commands', () => {
  assert.deepEqual(parseClientMessage({ type: 'action', action: 'pet' }, false), { type: 'action', action: 'pet' });
  assert.deepEqual(parseClientMessage({ type: 'command', command: 'context' }, false), { type: 'command', command: 'context' });
  for (const input of [null, [], 'pet', { type: 'action', action: 'runShell' }, { type: 'command', command: 'workbench.action.terminal.new' }, { type: 'action', action: 'pet', script: 'unexpected' }]) assert.equal(parseClientMessage(input, false), undefined);
});
test('development tools cannot be requested by a production webview', () => {
  assert.equal(parseClientMessage({ type: 'debug', mood: 100 }, false), undefined);
  assert.equal(parseClientMessage({ type: 'command', command: 'gallery' }, false), undefined);
  assert.equal(parseClientMessage({ type: 'debug', fps: Infinity }, true), undefined);
  assert.equal(parseClientMessage({ type: 'debug', energy: -1 }, true), undefined);
  assert.equal(parseClientMessage({ type: 'debug', animation: '../external' }, true, new Set(['idle_blink'])), undefined);
  assert.equal(parseClientMessage({ type: 'debug', state: 'RUN_ARBITRARY' }, true), undefined);
  assert.equal(parseClientMessage({ type: 'debug', animation: 'idle_blink' }, true, new Set(['idle_blink']))?.type, 'debug');
});
