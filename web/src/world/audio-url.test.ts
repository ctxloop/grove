import { describe, expect, it } from 'vitest';
import { audioUrl } from './audio-url';
import { makeWorld } from './test-util';

describe('audioUrl', () => {
  it('replaces {id} in the path and prepends the base', () => {
    const w = makeWorld([], '{id}.m4a');
    expect(audioUrl(w, 1234, '/audio/')).toBe('/audio/1234.m4a');
    expect(audioUrl(w, 5, 'https://audio.example.test/audio/')).toBe('https://audio.example.test/audio/5.m4a');
  });

  it('replaces every occurrence and keeps other text', () => {
    expect(audioUrl(makeWorld([], 'x/{id}/{id}.m4a'), 42, '/a/')).toBe('/a/x/42/42.m4a');
  });

  it('defaults to the configured base', () => {
    expect(audioUrl(makeWorld([], '{id}.m4a'), 7)).toMatch(/7\.m4a$/);
  });
});
