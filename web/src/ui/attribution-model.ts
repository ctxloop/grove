import type { Attribution } from '../world/schema';

export interface CreditRow {
  id: number;
  title: string;
  artist: string;
  /** The license name, or the raw code when the code is not in `licenses`. */
  licenseName: string;
  licenseUrl: string | null;
  fmaUrl: string | null;
}

export interface CreditSection {
  biomeId: number;
  name: string;
  rows: CreditRow[];
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Returns the URL only when it is plain http(s); anything else is not rendered as a link. */
export function httpUrl(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Groups tracks by biome, sorted by biome name then title. Pure, no DOM. */
export function buildSections(
  attribution: Attribution,
  biomeName: (id: number) => string,
): CreditSection[] {
  const byBiome = new Map<number, CreditSection>();
  for (const c of attribution.tracks) {
    let section = byBiome.get(c.b);
    if (section === undefined) {
      section = { biomeId: c.b, name: biomeName(c.b), rows: [] };
      byBiome.set(c.b, section);
    }
    const license = attribution.licenses[c.lic];
    section.rows.push({
      id: c.id,
      title: c.t,
      artist: c.a,
      licenseName: license?.name ?? c.lic,
      licenseUrl: license === undefined ? null : httpUrl(license.url),
      fmaUrl: httpUrl(attribution.fmaBase + c.url),
    });
  }
  const sections = [...byBiome.values()];
  for (const s of sections) {
    s.rows.sort((x, y) => collator.compare(x.title, y.title) || x.id - y.id);
  }
  return sections.sort((x, y) => collator.compare(x.name, y.name) || x.biomeId - y.biomeId);
}
