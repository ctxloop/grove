import { describe, expect, it } from 'vitest';
import { LruCache } from './lru';

describe('LruCache', () => {
  it('rejects invalid capacity', () => {
    expect(() => new LruCache(0)).toThrow(RangeError);
    expect(() => new LruCache(1.5)).toThrow(RangeError);
  });

  it('stores and returns values', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
    expect(c.size).toBe(1);
  });

  it('evicts the least recently set entry beyond capacity', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
    expect(c.has('c')).toBe(true);
    expect(c.size).toBe(2);
  });

  it('get marks an entry as most recent', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
  });

  it('peek does not change the order', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.peek('a')).toBe(1);
    expect(c.peek('zzz')).toBeUndefined();
    c.set('c', 3);
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
  });

  it('re-setting an existing key updates the value, refreshes it, and does not evict', () => {
    const evicted: string[] = [];
    const c = new LruCache<string, number>(2, (k) => evicted.push(k));
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 10);
    expect(evicted).toEqual([]);
    expect(c.size).toBe(2);
    expect(c.peek('a')).toBe(10);
    c.set('c', 3);
    expect(evicted).toEqual(['b']);
  });

  it('works with capacity 1', () => {
    const evicted: Array<[string, number]> = [];
    const c = new LruCache<string, number>(1, (k, v) => evicted.push([k, v]));
    c.set('a', 1);
    c.set('b', 2);
    c.set('b', 3);
    c.set('c', 4);
    expect(c.size).toBe(1);
    expect(c.peek('c')).toBe(4);
    expect(evicted).toEqual([
      ['a', 1],
      ['b', 3],
    ]);
  });

  it('calls onEvict oldest first with key and value', () => {
    const evicted: Array<[number, string]> = [];
    const c = new LruCache<number, string>(3, (k, v) => evicted.push([k, v]));
    for (let i = 1; i <= 3; i++) c.set(i, `v${i}`);
    c.get(1);
    c.set(4, 'v4');
    c.set(5, 'v5');
    expect(evicted).toEqual([
      [2, 'v2'],
      [3, 'v3'],
    ]);
  });

  it('delete and clear do not call onEvict', () => {
    const evicted: number[] = [];
    const c = new LruCache<number, number>(3, (k) => evicted.push(k));
    c.set(1, 1);
    c.set(2, 2);
    c.set(3, 3);
    expect(c.delete(2)).toBe(true);
    expect(c.delete(2)).toBe(false);
    expect(c.size).toBe(2);
    c.clear();
    expect(c.size).toBe(0);
    expect(evicted).toEqual([]);
  });

  it('stores undefined-free falsy values', () => {
    const c = new LruCache<string, number>(2);
    c.set('z', 0);
    expect(c.get('z')).toBe(0);
    expect(c.has('z')).toBe(true);
  });
});
