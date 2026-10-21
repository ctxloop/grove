import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Enforces the dependency rule in docs/architecture.md §5.

const SRC = resolve(import.meta.dirname);

// Which modules each module may import (besides itself).
const ALLOWED: Record<string, readonly string[]> = {
  config: [],
  world: ['config'],
  render: ['config', 'world'],
  audio: ['config', 'world'],
  player: ['config', 'world'],
  ui: ['config', 'world'],
};

// Only these modules may touch three.js.
const THREE_ALLOWED = new Set(['render', 'player', 'main']);

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return listSources(p);
    return e.name.endsWith('.ts') ? [p] : [];
  });
}

function moduleOf(file: string): string {
  const rel = relative(SRC, file);
  const head = rel.split(sep)[0] ?? rel;
  return head.replace(/\.ts$/, '');
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  const candidates = [base, `${base}.ts`, join(base, 'index.ts')];
  const files = new Set(sources);
  return candidates.find((c) => files.has(c)) ?? base;
}

const sources = listSources(SRC);

describe('module dependency rule', () => {
  it('only imports allowed modules', () => {
    const bad: string[] = [];
    for (const file of sources) {
      const from = moduleOf(file);
      for (const spec of importsOf(file)) {
        if (spec === 'three' || spec.startsWith('three/')) {
          if (!THREE_ALLOWED.has(from)) bad.push(`${relative(SRC, file)} imports ${spec}`);
          continue;
        }
        const target = resolveLocal(file, spec);
        if (target === null || !target.startsWith(SRC + sep)) continue;
        const to = moduleOf(target);
        if (to === from || from === 'main') continue;
        const allowed = ALLOWED[from];
        if (allowed === undefined || !allowed.includes(to)) {
          bad.push(`${relative(SRC, file)} (${from}) imports ${relative(SRC, target)} (${to})`);
        }
        if (to === 'main') bad.push(`${relative(SRC, file)} imports main`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has no import cycles between files', () => {
    const graph = new Map<string, string[]>();
    for (const file of sources) {
      const deps = importsOf(file)
        .map((s) => resolveLocal(file, s))
        .filter((t): t is string => t !== null && sources.includes(t));
      graph.set(file, deps);
    }
    const state = new Map<string, 'visiting' | 'done'>();
    const cycles: string[] = [];
    const visit = (f: string, path: string[]) => {
      if (state.get(f) === 'done') return;
      if (state.get(f) === 'visiting') {
        cycles.push([...path.slice(path.indexOf(f)), f].map((p) => relative(SRC, p)).join(' -> '));
        return;
      }
      state.set(f, 'visiting');
      for (const d of graph.get(f) ?? []) visit(d, [...path, f]);
      state.set(f, 'done');
    };
    for (const f of sources) visit(f, []);
    expect(cycles).toEqual([]);
  });

  it('assigns every source file to a known module', () => {
    const known = new Set([...Object.keys(ALLOWED), 'main', 'deps.test']);
    const unknown = sources.map(moduleOf).filter((m) => !known.has(m));
    expect(unknown).toEqual([]);
  });
});
