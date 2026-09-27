/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { WindowsMediaProvider } from '../src/music/WindowsMediaProvider';
import { LinuxMprisProvider, parseMprisNames, parsePlaybackStatus } from '../src/music/LinuxMprisProvider';
import { MacMusicProvider, macPlayerScript } from '../src/music/MacMusicProvider';
import { ManualMusicProvider } from '../src/music/ManualMusicProvider';

// ─── 1. WINDOWS MEDIA PROVIDER ───────────────────────────────────────────────

test('WindowsMediaProvider safely returns false on non-windows platforms', async () => {
  const provider = new WindowsMediaProvider('resources/windows-media.ps1');
  if (process.platform !== 'win32') {
    const playing = await provider.isPlaying();
    assert.equal(playing, false);
  }
  provider.dispose();
});

test('WindowsMediaProvider dispose cancels active checks and prevents subsequent execution', async () => {
  const provider = new WindowsMediaProvider('resources/windows-media.ps1');
  provider.dispose();
  const playing = await provider.isPlaying();
  assert.equal(playing, false);
});

// ─── 2. LINUX MPRIS PROVIDER ─────────────────────────────────────────────────

test('LinuxMprisProvider returns false on non-linux platforms', async () => {
  const provider = new LinuxMprisProvider();
  if (process.platform !== 'linux') {
    const playing = await provider.isPlaying();
    assert.equal(playing, false);
  }
});

test('LinuxMprisProvider parseMprisNames extracts media player bus names correctly', () => {
  const sampleBusOutput = [
    'NAME                                  PID  PROCESS         USER',
    'org.freedesktop.DBus                    1  systemd         root',
    'org.mpris.MediaPlayer2.spotify       1234  spotify         user',
    'org.mpris.MediaPlayer2.vlc           5678  vlc             user',
    ':1.42                                1234  spotify         user',
  ].join('\n');

  const names = parseMprisNames(sampleBusOutput);
  assert.deepEqual(names, ['org.mpris.MediaPlayer2.spotify', 'org.mpris.MediaPlayer2.vlc']);
});

test('LinuxMprisProvider parsePlaybackStatus accurately distinguishes playing from paused/stopped', () => {
  assert.equal(parsePlaybackStatus('s "Playing"'), true);
  assert.equal(parsePlaybackStatus('   s   "Playing"   '), true);
  assert.equal(parsePlaybackStatus('s "Paused"'), false);
  assert.equal(parsePlaybackStatus('s "Stopped"'), false);
  assert.equal(parsePlaybackStatus(''), false);
  assert.equal(parsePlaybackStatus('error reading property'), false);
});

// ─── 3. MAC MUSIC PROVIDER ───────────────────────────────────────────────────

test('MacMusicProvider returns false on non-darwin platforms', async () => {
  const provider = new MacMusicProvider();
  if (process.platform !== 'darwin') {
    const playing = await provider.isPlaying();
    assert.equal(playing, false);
  }
});

test('MacMusicProvider macPlayerScript queries Apple Music and Spotify without launching', () => {
  for (const app of ['Music', 'Spotify'] as const) {
    const lines = macPlayerScript(app);
    assert.ok(lines.some(l => l.includes(`if application "${app}" is running then`)));
    assert.ok(lines.some(l => l.includes('return "not running"')));
  }
});

// ─── 4. MANUAL MUSIC PROVIDER ────────────────────────────────────────────────

test('ManualMusicProvider toggles state and reports playback status', async () => {
  const provider = new ManualMusicProvider();
  assert.equal(provider.name, 'Manual music');
  assert.equal(await provider.isPlaying(), false);
  provider.toggle();
  assert.equal(await provider.isPlaying(), true);
  provider.toggle();
  assert.equal(await provider.isPlaying(), false);
});
