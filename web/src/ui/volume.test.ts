import { describe, expect, it } from 'vitest';
import { isTextEntry } from './volume';

describe('isTextEntry', () => {
  it('detects text fields', () => {
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true);
    expect(isTextEntry({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isTextEntry({ tagName: 'textarea' })).toBe(true);
    expect(isTextEntry({ tagName: 'SELECT' })).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('ignores everything else', () => {
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTextEntry({ tagName: 'BODY', isContentEditable: false })).toBe(false);
    expect(isTextEntry({})).toBe(false);
  });
});
