// Another app on the TV (a home-screen launcher) opens a title or channel here by
// name: launch params `{ deepLink: { kind, title, year?, altTitle?, id?, url?, logo?,
// tmdbId?, season?, episode?, resume?, from? } }`. A movie plays at once; a series
// opens on its episodes, or plays the one asked for; a channel plays from the stream
// URL the launcher sent (else the playlist channel of that name).

// section: one of this app's sections (title: 'live'); account: the launcher asks for this app's IPTV lists.
export type DeepLinkKind = 'movie' | 'series' | 'channel' | 'section' | 'account';

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
  /** Stable playlist ID shared with the launcher, never a credential. */
  sourceId?: string;
  sourceType?: 'xtream' | 'm3u';
  /** Xtream stream_id, distinct from an EPG channel ID. */
  streamId?: string;
  /** Exact M3U stream URL, used with sourceId to distinguish duplicate names. */
  channelUrl?: string;
  logo?: string;
  /** The launcher's id for the title (TMDB), handed back with the series' progress. */
  tmdbId?: string;
  /** A series' episode to play at once; `resume` continues it from where it was left. */
  season?: number;
  episode?: number;
  resume?: boolean;
  /** The app to go back to with Back (the launcher's id), carrying the progress. */
  from?: string;
}

const KINDS: readonly DeepLinkKind[] = ['movie', 'series', 'channel', 'section', 'account'];

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
  const sourceId = text(o.sourceId);
  if (sourceId) out.sourceId = sourceId;
  if (o.sourceType === 'xtream' || o.sourceType === 'm3u') out.sourceType = o.sourceType;
  const streamId = text(o.streamId);
  if (streamId) out.streamId = streamId;
  const channelUrl = text(o.channelUrl);
  if (/^https?:\/\//i.test(channelUrl)) out.channelUrl = channelUrl;
  const logo = text(o.logo);
  if (/^https?:\/\//i.test(logo)) out.logo = logo;
  const tmdbId = text(o.tmdbId);
  if (tmdbId) out.tmdbId = tmdbId;
  const season = Number(o.season), episode = Number(o.episode);
  if (season >= 1 && episode >= 1) {
    out.season = Math.floor(season);
    out.episode = Math.floor(episode);
    out.resume = o.resume === true;
  }
  const from = text(o.from);
  if (/^[\w.-]+$/.test(from)) out.from = from;
  return out;
}

// Provider names carry tags the launcher's titles don't: "BR | Title (2024) [4K]".
const TAGS = /\b(4k|uhd|fhd|hd|sd|hdr|dublado|legendado|dual audio|dub|leg|nacional)\b/g;

export function normalizeTitle(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
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

export interface ChannelCandidate {
  name: string;
  url: string;
  playlistIds?: readonly string[];
  xtreamStreamId?: string;
}

export interface ChannelMatch<T> {
  channel: T | null;
  ambiguous: boolean;
  via: 'identity' | 'url' | 'name' | '';
}

/** Channel matching is exact: IDs first, then exact URL, then a unique exact normalized name for older launchers. */
export function matchChannel<T extends ChannelCandidate>(items: readonly T[], link: DeepLink): ChannelMatch<T> {
  const result = (matches: T[], via: ChannelMatch<T>['via']): ChannelMatch<T> => ({
    channel: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
    via: matches.length ? via : '',
  });
  let matches: T[] = [];
  if (link.sourceType === 'xtream' && link.sourceId && link.streamId) {
    matches = items.filter(item => item.xtreamStreamId === link.streamId
      && !!item.playlistIds?.includes(link.sourceId!));
    if (matches.length) return result(matches, 'identity');
    return result([], 'identity');
  }
  if (link.sourceType === 'm3u' && link.sourceId && link.channelUrl) {
    matches = items.filter(item => item.url === link.channelUrl && !!item.playlistIds?.includes(link.sourceId!));
    if (matches.length) return result(matches, 'identity');
    return result([], 'identity');
  }
  if (link.sourceId || link.streamId || link.channelUrl) return result([], 'identity');
  const url = link.channelUrl || link.url;
  if (url) {
    matches = items.filter(item => item.url === url);
    if (matches.length) return result(matches, 'url');
  }
  const wanted = normalizeChannelName(link.title);
  if (!wanted) return result([], '');
  matches = items.filter(item => normalizeChannelName(item.name) === wanted);
  return result(matches, 'name');
}

function normalizeChannelName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/\b(fhd|uhd|hd|sd|4k|8k|1080p|720p|480p)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/**
 * A link handled before this app's live channels load: a movie or a series
 * (from the Xtream account), or the launcher asking for the lists. A channel
 * and a section wait for them: a channel plays from its place in the list, so
 * channel up and down, the guide and the list work from it.
 */
export function opensWithoutChannels(link: DeepLink): boolean {
  return link.kind === 'movie' || link.kind === 'series' || link.kind === 'account';
}
