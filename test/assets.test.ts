import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { AssetManifest } from '../src/models/types';

test('every manifest PNG exists, is bounded to assets, and matches frame geometry', () => {
  const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as AssetManifest;
  const root = resolve('assets') + sep;
  for (const [section, assets] of Object.entries(manifest)) {
    if (!['character', 'room', 'icons', 'effects'].includes(section)) continue;
    for (const [key, asset] of Object.entries(assets as AssetManifest['character'])) {
      const target = resolve(asset.src);
      assert.ok(target.startsWith(root), key + ' stays in assets');
      const bytes = readFileSync(target);
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG', key + ' is PNG');
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      if ('frames' in asset) {
        assert.equal(width, asset.frameWidth * asset.frames, key + ' horizontal frame count');
        assert.equal(height, asset.frameHeight, key + ' frame height');
        assert.ok(asset.fps >= 4 && asset.fps <= 12, key + ' safe FPS');
        if (asset.next) assert.ok(manifest.character[asset.next] || manifest.effects[asset.next], key + ' valid next animation');
      }
    }
  }
  assert.ok(Object.keys(manifest.character).filter(key => key.startsWith('idle_')).length >= 15);
  for (const key of ['coding_start', 'coding_loop', 'coding_fast', 'coding_stop', 'vibe_coding_start', 'vibe_coding_loop', 'vibe_coding_fast', 'vibe_coding_end', 'music_loop', 'sleep', 'pet_start', 'pet_loop', 'pet_happy', 'pet_end', 'dance_01', 'dance_02', 'dance_03', 'dance_04', 'dance_05', 'loading', 'error_loading', 'no_workspace']) assert.ok(manifest.character[key], key);
  for (const theme of ['default', 'night', 'cyber', 'forest', 'space', 'retro_pc']) assert.ok(manifest.room['theme_' + theme], theme);
});
