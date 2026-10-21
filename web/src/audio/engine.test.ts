import { describe, expect, it } from 'vitest';
import { preferPlaybackSession } from './engine';

describe('preferPlaybackSession', () => {
  it('sets the playback type where the browser has an audio session', () => {
    const host = { audioSession: { type: 'auto' } };
    preferPlaybackSession(host);
    expect(host.audioSession.type).toBe('playback');
  });

  it('does nothing where it has none', () => {
    const host = {};
    preferPlaybackSession(host);
    expect(host).toEqual({});
  });
});
