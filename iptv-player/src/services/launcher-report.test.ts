import { describe, expect, it } from 'vitest';
import type { ResumeEntry, VodQueueItem } from '../types';
import { LauncherReport, episodeOf, launcherSources } from './launcher-report';

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
        { season: 1, episode: 1, position: 2400, duration: 2400, done: true, endedAt: expect.any(Number) },
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

  it('keeps when an episode first ended, so the same end is one play', () => {
    LauncherReport.record(episode('s6', 1, 1), 2400, 2400, true);
    const first = LauncherReport.take('s6', 'Foxtrot', undefined, []).episodes[0].endedAt;
    LauncherReport.record(episode('s6', 1, 1), 2400, 2400, true);
    expect(LauncherReport.take('s6', 'Foxtrot', undefined, []).episodes[0].endedAt).toBe(first);
  });

  it('keeps a movie apart from the series', () => {
    LauncherReport.record({ ...episode('s4', 1, 1), kind: 'vod', itemId: 'm1' }, 100, 5000, false);
    expect(LauncherReport.take('s4', 'Delta', undefined, []).episodes).toEqual([]);
  });

  it('reports a movie that ended as done, and only then', () => {
    const movie: VodQueueItem = { url: 'http://host/a', title: 'Golf', poster: '', accountId: 'acc', itemId: 'm2', kind: 'vod', subtitles: [] };
    LauncherReport.record(movie, 600, 5400, false);
    expect(LauncherReport.takeMovie('m2', 'Golf', '7', null).movie).toEqual({ position: 600, duration: 5400, done: false });
    LauncherReport.record(movie, 5400, 5400, true);
    LauncherReport.record(movie, 20, 5400, false);
    expect(LauncherReport.takeMovie('m2', 'Golf', '7', null)).toEqual({ tmdbId: '7', title: 'Golf', movie: { position: 5400, duration: 5400, done: true, endedAt: expect.any(Number) } });
  });

  it('uses the Continue point saved before for a movie not played this run', () => {
    const saved: ResumeEntry = { accountId: 'acc', kind: 'vod', itemId: 'm3', name: 'Hotel', poster: '', ext: 'mp4', position: 300, duration: 6000, updatedAt: 1 };
    expect(LauncherReport.takeMovie('m3', 'Hotel', undefined, saved).movie).toEqual({ position: 300, duration: 6000, done: false });
  });
});

describe('launcherSources', () => {
  it('gives the launcher the enabled Xtream accounts and M3U links, not uploaded files', () => {
    expect(launcherSources([
      { id: 'a', name: 'Conta', url: 'http://srv:8080', source: 'xtream', xtream: { username: 'u', password: 'p' } },
      { id: 'b', name: 'Lista', url: 'https://example.com/list.m3u' },
      { id: 'c', name: 'Do celular', url: 'upload://x', source: 'upload' },
      { id: 'd', name: 'Desligada', url: 'https://example.com/off.m3u', enabled: false },
    ])).toEqual([
      { type: 'xtream', name: 'Conta', url: 'http://srv:8080', user: 'u', pass: 'p' },
      { type: 'm3u', name: 'Lista', url: 'https://example.com/list.m3u' },
    ]);
  });
});
