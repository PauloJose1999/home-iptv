// Another app on the TV (a home-screen launcher) opens a title or channel here by
// name: launch params `{ deepLink: { kind, title, year?, altTitle?, id?, url?, logo? } }`.
// A movie plays at once, a series opens on its episodes, a channel tunes (or,
// missing from the playlists, plays from the stream URL the launcher sent).

export type DeepLinkKind = 'movie' | 'series' | 'channel';

export interface DeepLink {
  kind: DeepLinkKind;
  title: string;
  /** The title in another language (the original one), tried when `title` finds nothing. */
  altTitle?: string;
  year?: number;
  /** The provider's own stream/series id, when the caller has it. */
  id?: string;
  /** A channel's stream, played when no playlist here has the channel. */
  url?: string;
  logo?: string;
}

const KINDS: readonly DeepLinkKind[] = ['movie', 'series', 'channel'];

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

// Cold launch passes launchParams as a JSON string, webOSRelaunch as an object.
export function parseDeepLink(raw: unknown): DeepLink | null {
  let params: unknown = raw;
  if (typeof params === 'string') {
    try { params = JSON.parse(params); } catch { return null; }
  }
  if (!params || typeof params !== 'object') return null;
  const link = (params as { deepLink?: unknown }).deepLink;
  if (!link || typeof link !== 'object') return null;
  const o = link as Record<string, unknown>;
  const kind = KINDS.find(k => k === o.kind);
  const title = text(o.title) || text(o.value);
  if (!kind || !title) return null;
  const year = Number(o.year);
  const out: DeepLink = { kind, title };
  const altTitle = text(o.altTitle);
  if (altTitle && altTitle !== title) out.altTitle = altTitle;
  if (year >= 1900 && year <= 2100) out.year = Math.floor(year);
  const id = text(o.id);
  if (id) out.id = id;
  const url = text(o.url);
  if (/^https?:\/\//i.test(url)) out.url = url;
  const logo = text(o.logo);
  if (/^https?:\/\//i.test(logo)) out.logo = logo;
  return out;
}

// Provider names carry tags the launcher's titles don't: "BR | Title (2024) [4K]".
const TAGS = /\b(4k|uhd|fhd|hd|sd|hdr|dublado|legendado|dual audio|dub|leg|nacional)\b/g;

export function normalizeTitle(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^\s*[a-z]{2,3}\s*\|\s*/, '')
    .replace(/\[[^\]]*\]|\((19|20)\d\d\)/g, ' ')
    .replace(TAGS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function yearIn(name: string): number | undefined {
  const m = /\b(19|20)\d\d\b/.exec(name);
  return m ? Number(m[0]) : undefined;
}

export interface Candidate {
  name: string;
  year?: number;
}

function score(target: string, year: number | undefined, item: Candidate): number {
  const name = normalizeTitle(item.name);
  if (!name || !target) return 0;
  const itemYear = item.year || yearIn(item.name);
  // A remake or a namesake from another year is another title.
  if (year && itemYear && Math.abs(year - itemYear) > 1) return 0;
  const bonus = year && itemYear ? 10 : 0;
  if (name === target) return 100 + bonus;
  // "Title" for "Title Extended Cut", never the other way: a shorter name is often another film.
  if (target.length >= 4 && name.indexOf(target + ' ') === 0) return 60 + bonus;
  if (target.length >= 6 && name.indexOf(target) >= 0) return 40 + bonus;
  return 0;
}

// The item the link names: its id when given, else the best title match.
export function matchTitle<T extends Candidate>(
  items: readonly T[],
  link: Pick<DeepLink, 'title' | 'altTitle' | 'year'>,
  idOf?: (item: T) => string,
  id?: string,
): T | null {
  if (id && idOf) {
    const exact = items.find(item => idOf(item) === id);
    if (exact) return exact;
  }
  const titles = [link.title, link.altTitle].filter((x): x is string => !!x).map(normalizeTitle);
  for (const target of titles) {
    let best: T | null = null;
    let bestScore = 0;
    for (const item of items) {
      const s = score(target, link.year, item);
      if (s > bestScore) { best = item; bestScore = s; }
    }
    if (best) return best;
  }
  return null;
}
