// Data contract (docs/architecture.md §4), mirrored by
// pipeline/internal/export/types.go and pinned by contract/fixtures.

export const SCHEMA_VERSION = 1;

/** Tree kinds, in the order of contract/fixtures/species.json. Every tree of a biome is of its species. */
export const SPECIES = ['oak', 'birch', 'fir', 'kapok', 'acacia', 'magnolia'] as const;
export type Species = (typeof SPECIES)[number];

export type Vec2 = readonly [number, number];

export interface Bounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface Palette {
  readonly hue: number;
  readonly saturation: number;
}

export interface Grove {
  readonly name: string;
  readonly center: Vec2;
  readonly radius: number;
  readonly trees: number;
}

export interface Biome {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly center: Vec2;
  readonly radius: number;
  readonly palette: Palette;
  readonly species: Species;
  readonly trees: number;
  readonly file: string;
  readonly groves: readonly Grove[];
}

export interface License {
  readonly name: string;
  readonly url: string;
}

export interface World {
  readonly schema: number;
  readonly subset: string;
  readonly bounds: Bounds;
  readonly fmaBase: string;
  readonly audio: { readonly path: string };
  readonly biomes: readonly Biome[];
  readonly licenses: Readonly<Record<string, License>>;
}

export interface Tree {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** Grove index into the biome's `groves`. */
  readonly g: number;
  /** Height, lightness, roughness as uint8. */
  readonly h: number;
  readonly l: number;
  readonly r: number;
  /** Title, artist, album. */
  readonly t: string;
  readonly a: string;
  readonly al: string;
  /** License code, a key of `World.licenses`. */
  readonly lic: string;
  /** FMA page, relative to `World.fmaBase`. */
  readonly url: string;
}

export interface BiomeFile {
  readonly schema: number;
  readonly biome: number;
  readonly trees: readonly Tree[];
}

export interface Credit {
  readonly id: number;
  /** Biome id. */
  readonly b: number;
  readonly t: string;
  readonly a: string;
  readonly lic: string;
  readonly url: string;
}

export interface Attribution {
  readonly schema: number;
  readonly fmaBase: string;
  readonly licenses: Readonly<Record<string, License>>;
  readonly tracks: readonly Credit[];
}

export class SchemaError extends Error {
  override name = 'SchemaError';
}

// Validators check exact key sets, so an added or missing field is an error.

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string, keys: readonly string[]): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SchemaError(`${path}: expected object`);
  const o = v as Obj;
  for (const k of keys) if (!(k in o)) throw new SchemaError(`${path}.${k}: missing`);
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new SchemaError(`${path}.${k}: unexpected field`);
  return o;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SchemaError(`${path}: expected number`);
  return v;
}

function int(v: unknown, path: string): number {
  const n = num(v, path);
  if (!Number.isInteger(n)) throw new SchemaError(`${path}: expected integer`);
  return n;
}

function u8(v: unknown, path: string): number {
  const n = int(v, path);
  if (n < 0 || n > 255) throw new SchemaError(`${path}: expected 0..255`);
  return n;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new SchemaError(`${path}: expected string`);
  return v;
}

function arr<T>(v: unknown, path: string, item: (x: unknown, p: string) => T): T[] {
  if (!Array.isArray(v)) throw new SchemaError(`${path}: expected array`);
  return v.map((x, i) => item(x, `${path}[${i}]`));
}

function vec2(v: unknown, path: string): Vec2 {
  const a = arr(v, path, num);
  if (a.length !== 2) throw new SchemaError(`${path}: expected [x, z]`);
  return [a[0] ?? 0, a[1] ?? 0];
}

function schema(v: unknown, path: string): number {
  const n = int(v, path);
  if (n !== SCHEMA_VERSION) throw new SchemaError(`${path}: schema ${n}, expected ${SCHEMA_VERSION}`);
  return n;
}

function licenses(v: unknown, path: string): Record<string, License> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SchemaError(`${path}: expected object`);
  const out: Record<string, License> = {};
  for (const [code, l] of Object.entries(v)) {
    const o = obj(l, `${path}.${code}`, ['name', 'url']);
    out[code] = { name: str(o.name, `${path}.${code}.name`), url: str(o.url, `${path}.${code}.url`) };
  }
  return out;
}

function species(v: unknown, path: string): Species {
  const s = str(v, path);
  const known: readonly string[] = SPECIES;
  if (!known.includes(s)) throw new SchemaError(`${path}: unknown species ${s}`);
  return s as Species;
}

function grove(v: unknown, p: string): Grove {
  const o = obj(v, p, ['name', 'center', 'radius', 'trees']);
  return { name: str(o.name, `${p}.name`), center: vec2(o.center, `${p}.center`), radius: num(o.radius, `${p}.radius`), trees: int(o.trees, `${p}.trees`) };
}

function biome(v: unknown, p: string): Biome {
  const o = obj(v, p, ['id', 'slug', 'name', 'center', 'radius', 'palette', 'species', 'trees', 'file', 'groves']);
  const pal = obj(o.palette, `${p}.palette`, ['hue', 'saturation']);
  return {
    id: int(o.id, `${p}.id`),
    slug: str(o.slug, `${p}.slug`),
    name: str(o.name, `${p}.name`),
    center: vec2(o.center, `${p}.center`),
    radius: num(o.radius, `${p}.radius`),
    palette: { hue: num(pal.hue, `${p}.palette.hue`), saturation: num(pal.saturation, `${p}.palette.saturation`) },
    species: species(o.species, `${p}.species`),
    trees: int(o.trees, `${p}.trees`),
    file: str(o.file, `${p}.file`),
    groves: arr(o.groves, `${p}.groves`, grove),
  };
}

export function parseWorld(v: unknown): World {
  const o = obj(v, 'world', ['schema', 'subset', 'bounds', 'fmaBase', 'audio', 'biomes', 'licenses']);
  const b = obj(o.bounds, 'world.bounds', ['minX', 'minZ', 'maxX', 'maxZ']);
  const audio = obj(o.audio, 'world.audio', ['path']);
  return {
    schema: schema(o.schema, 'world.schema'),
    subset: str(o.subset, 'world.subset'),
    bounds: { minX: num(b.minX, 'bounds.minX'), minZ: num(b.minZ, 'bounds.minZ'), maxX: num(b.maxX, 'bounds.maxX'), maxZ: num(b.maxZ, 'bounds.maxZ') },
    fmaBase: str(o.fmaBase, 'world.fmaBase'),
    audio: { path: str(audio.path, 'world.audio.path') },
    biomes: arr(o.biomes, 'world.biomes', biome),
    licenses: licenses(o.licenses, 'world.licenses'),
  };
}

const TREE_KEYS = ['id', 'x', 'z', 'g', 'h', 'l', 'r', 't', 'a', 'al', 'lic', 'url'] as const;

function tree(v: unknown, p: string): Tree {
  const o = obj(v, p, TREE_KEYS);
  return {
    id: int(o.id, `${p}.id`),
    x: num(o.x, `${p}.x`),
    z: num(o.z, `${p}.z`),
    g: int(o.g, `${p}.g`),
    h: u8(o.h, `${p}.h`),
    l: u8(o.l, `${p}.l`),
    r: u8(o.r, `${p}.r`),
    t: str(o.t, `${p}.t`),
    a: str(o.a, `${p}.a`),
    al: str(o.al, `${p}.al`),
    lic: str(o.lic, `${p}.lic`),
    url: str(o.url, `${p}.url`),
  };
}

export function parseBiomeFile(v: unknown): BiomeFile {
  const o = obj(v, 'biome', ['schema', 'biome', 'trees']);
  return { schema: schema(o.schema, 'biome.schema'), biome: int(o.biome, 'biome.biome'), trees: arr(o.trees, 'biome.trees', tree) };
}

function credit(v: unknown, p: string): Credit {
  const o = obj(v, p, ['id', 'b', 't', 'a', 'lic', 'url']);
  return { id: int(o.id, `${p}.id`), b: int(o.b, `${p}.b`), t: str(o.t, `${p}.t`), a: str(o.a, `${p}.a`), lic: str(o.lic, `${p}.lic`), url: str(o.url, `${p}.url`) };
}

export function parseAttribution(v: unknown): Attribution {
  const o = obj(v, 'attribution', ['schema', 'fmaBase', 'licenses', 'tracks']);
  return {
    schema: schema(o.schema, 'attribution.schema'),
    fmaBase: str(o.fmaBase, 'attribution.fmaBase'),
    licenses: licenses(o.licenses, 'attribution.licenses'),
    tracks: arr(o.tracks, 'attribution.tracks', credit),
  };
}
