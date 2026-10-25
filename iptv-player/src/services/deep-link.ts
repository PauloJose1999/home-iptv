import type { Channel } from '../types';
import { PlaylistService } from './playlist-service';
import { rankChannels } from '../utils/channel-search';

// An external launcher (a home screen) can open this app straight at an item.
// The params arrive as a JSON string on a cold launch (PalmSystem.launchParams)
// and as the event detail on webOSRelaunch, so both shapes are accepted — the
// same contract reminder-service uses for its channel key.
//
// Expected shape (the launcher sends the `params` of a Luna launch). `value` is
// the name; a movie/series deep link also carries its Xtream id so the exact
// detail page opens:
//   { "deepLink": { "kind": "movie", "value": "Title", "id": "123", "categoryId": "5", "poster": "…", "ext": "mp4" } }
export type DeepLinkKind = 'channel' | 'movie' | 'series' | 'search';

export interface DeepLink {
  kind: DeepLinkKind;
  value: string;
  /** Xtream stream_id (movie) or series_id (series). */
  id?: string;
  categoryId?: string;
  poster?: string;
  /** Container extension for a VOD movie URL (mp4, mkv, …). */
  ext?: string;
}

export function parseDeepLink(raw: unknown): DeepLink | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const box = (obj as { deepLink?: unknown }).deepLink;
  if (!box || typeof box !== 'object') return null;
  const b = box as Record<string, unknown>;
  const kind = b.kind;
  const value = b.value;
  if (kind !== 'channel' && kind !== 'movie' && kind !== 'series' && kind !== 'search') return null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const dl: DeepLink = { kind, value: value.trim() };
  if (typeof b.id === 'string' && b.id.trim()) dl.id = b.id.trim();
  if (typeof b.categoryId === 'string' && b.categoryId.trim()) dl.categoryId = b.categoryId.trim();
  if (typeof b.poster === 'string' && b.poster.trim()) dl.poster = b.poster.trim();
  if (typeof b.ext === 'string' && b.ext.trim()) dl.ext = b.ext.trim();
  return dl;
}

// The visible channel whose name best matches the query, or null.
export function matchChannel(name: string): Channel | null {
  return rankChannels(PlaylistService.channels, name)[0] ?? null;
}
