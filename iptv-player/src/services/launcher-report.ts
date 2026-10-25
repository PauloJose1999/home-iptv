import { CONFIG } from '../config';
import type { ResumeEntry, VodQueueItem } from '../types';

// What a launcher that deep-linked a series here learns back when Back
// returns to it: each episode's progress. Apps can't read each other's
// storage, and this app's service stops while it's in the background, so the
// report rides on the launcher's launch params instead.

export interface EpisodeReport {
  season: number;
  episode: number;
  position: number;
  duration: number;
  done: boolean;
}

export interface SeriesReport {
  tmdbId?: string;
  title: string;
  episodes: EpisodeReport[];
}

// Episodes played this run, by Xtream series id, then `season:episode`.
const played = new Map<string, Map<string, EpisodeReport>>();

function put(seriesId: string, report: EpisodeReport): void {
  let episodes = played.get(seriesId);
  if (!episodes) played.set(seriesId, episodes = new Map());
  const key = `${report.season}:${report.episode}`;
  // A finished episode stays finished when a later save (or the Continue entry) is partial.
  if (episodes.get(key)?.done && !report.done) return;
  episodes.set(key, report);
}

// A queue item's season and episode, from its search metadata or its "S2E5" label.
export function episodeOf(item: { title?: string; name?: string; searchMeta?: VodQueueItem['searchMeta'] }): { season: number; episode: number } | null {
  if (item.searchMeta?.season && item.searchMeta.episode) {
    return { season: item.searchMeta.season, episode: item.searchMeta.episode };
  }
  const m = /\bS(\d+)E(\d+)\b/.exec(item.title ?? item.name ?? '');
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
}

export const LauncherReport = {
  /** An episode's progress as the player saves it (or its end). */
  record(item: VodQueueItem, position: number, duration: number, done: boolean): void {
    const seriesId = item.watchlistOwner?.itemId;
    const code = episodeOf(item);
    if (item.kind !== 'episode' || !seriesId || !code) return;
    // As for the Continue points here: a few seconds in is starting over, not progress.
    if (!done && position < CONFIG.XTREAM.RESUME_MIN_SECS) return;
    put(seriesId, { ...code, position: Math.round(position), duration: Math.round(duration), done });
  },

  /**
   * The series' report for the launcher: this run's episodes plus the
   * Continue points saved before (episodes watched earlier, here).
   */
  take(seriesId: string, title: string, tmdbId: string | undefined, saved: ResumeEntry[]): SeriesReport {
    for (const r of saved) {
      const code = episodeOf(r);
      if (r.kind === 'episode' && r.watchlistOwner?.itemId === seriesId && code) {
        put(seriesId, { ...code, position: Math.round(r.position), duration: Math.round(r.duration), done: false });
      }
    }
    const episodes = Array.from(played.get(seriesId)?.values() ?? [])
      .sort((a, b) => a.season - b.season || a.episode - b.episode);
    return tmdbId ? { tmdbId, title, episodes } : { title, episodes };
  },
};
