import { describe, expect, it } from 'vitest';
import type { ResumeEntry, VodQueueItem } from '../types';
import { LauncherReport, episodeOf } from './launcher-report';

function episode(seriesId: string, season: number, ep: number): VodQueueItem {
  return {
    url: 'http://host/a', title: `Alpha — S${season}E${ep}`, poster: '', accountId: 'acc', itemId: `${seriesId}-${season}-${ep}`,
    kind: 'episode', subtitles: [], searchMeta: { season, episode: ep }, watchlistOwner: { kind: 'series', itemId: seriesId },
  };
}

describe('episodeOf', () => {
  it('reads the search metadata, else the label', () => {
    expect(episodeOf({ searchMeta: { season: 2, episode: 5 } })).toEqual({ season: 2, episode: 5 });
    expect(episodeOf({ name: 'Alpha — S3E7 — Bravo' })).toEqual({ season: 3, episode: 7 });
    expect(episodeOf({ name: 'Alpha' })).toBeNull();
  });
});

describe('LauncherReport', () => {
  it('reports the series episodes in order, a finished one staying finished', () => {
    LauncherReport.record(episode('s1', 1, 2), 600, 2400, false);
    LauncherReport.record(episode('s1', 1, 1), 2400, 2400, true);
    LauncherReport.record(episode('s1', 1, 1), 30, 2400, false);
    LauncherReport.record(episode('s9', 1, 1), 10, 100, false);
    expect(LauncherReport.take('s1', 'Alpha', '42', [])).toEqual({
      tmdbId: '42', title: 'Alpha',
      episodes: [
        { season: 1, episode: 1, position: 2400, duration: 2400, done: true },
        { season: 1, episode: 2, position: 600, duration: 2400, done: false },
      ],
    });
  });

  it('adds the Continue points saved before, only this series', () => {
    const saved: ResumeEntry[] = [
      { accountId: 'acc', kind: 'episode', itemId: 'x', name: 'Alpha — S2E3', poster: '', ext: 'mp4', position: 90, duration: 1800, updatedAt: 1, watchlistOwner: { kind: 'series', itemId: 's2' } },
      { accountId: 'acc', kind: 'episode', itemId: 'y', name: 'Charlie — S1E1', poster: '', ext: 'mp4', position: 90, duration: 1800, updatedAt: 1, watchlistOwner: { kind: 'series', itemId: 's3' } },
    ];
    expect(LauncherReport.take('s2', 'Bravo', undefined, saved)).toEqual({
      title: 'Bravo', episodes: [{ season: 2, episode: 3, position: 90, duration: 1800, done: false }],
    });
  });

  it('leaves out an episode only started (a few seconds)', () => {
    LauncherReport.record(episode('s5', 1, 1), 5, 2400, false);
    expect(LauncherReport.take('s5', 'Echo', undefined, []).episodes).toEqual([]);
  });

  it('ignores what is not an episode of a series', () => {
    LauncherReport.record({ ...episode('s4', 1, 1), kind: 'vod' }, 10, 100, false);
    expect(LauncherReport.take('s4', 'Delta', undefined, []).episodes).toEqual([]);
  });
});
