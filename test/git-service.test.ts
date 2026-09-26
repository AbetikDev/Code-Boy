/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { GitService } from '../src/contextback/git/GitService';
import { ManualMusicProvider } from '../src/music/ManualMusicProvider';

test('GitService accurately inspects current repository branch, commits, and status', async () => {
  const git = new GitService();
  const cwd = process.cwd();

  const branch = await git.getCurrentBranch(cwd);
  assert.equal(typeof branch, 'string');
  assert.ok(branch.length > 0);

  const commits = await git.getRecentCommits(cwd, 5);
  assert.ok(Array.isArray(commits));
  assert.ok(commits.length > 0);
  assert.ok(commits[0]!.hash.length >= 7);
  assert.ok(commits[0]!.message.length > 0);
  assert.ok(commits[0]!.timestamp > 0);

  const fullInfo = await git.getFullInfo(cwd);
  assert.equal(fullInfo.branch, branch);
  assert.ok(Array.isArray(fullInfo.changedFiles));
  assert.ok(Array.isArray(fullInfo.stagedFiles));
  assert.ok(Array.isArray(fullInfo.commits));

  // Non-git directory fallback test
  const fallbackBranch = await git.getCurrentBranch('/tmp');
  assert.equal(typeof fallbackBranch, 'string');
});

test('ManualMusicProvider toggles state and reports playback status', async () => {
  const provider = new ManualMusicProvider();
  assert.equal(provider.name, 'Manual music');
  assert.equal(await provider.isPlaying(), false);

  const state1 = provider.toggle();
  assert.equal(state1, true);
  assert.equal(await provider.isPlaying(), true);

  provider.setPlaying(false);
  assert.equal(await provider.isPlaying(), false);

  const state2 = provider.toggle();
  assert.equal(state2, true);
});
