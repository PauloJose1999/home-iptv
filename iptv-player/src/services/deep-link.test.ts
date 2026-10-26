import { describe, expect, it } from 'vitest';
import { matchChannel, matchTitle, normalizeTitle, opensWithoutChannels, parseDeepLink } from './deep-link';

describe('parseDeepLink', () => {
  it('reads a cold-launch JSON string', () => {
    expect(parseDeepLink('{"deepLink":{"kind":"movie","title":"Alpha","year":2020}}'))
      .toEqual({ kind: 'movie', title: 'Alpha', year: 2020 });
  });

  it('reads a relaunch object, with the alternate title and id', () => {
    expect(parseDeepLink({ deepLink: { kind: 'series', title: 'Bravo', altTitle: 'Bravo Two', id: 7 } }))
      .toEqual({ kind: 'series', title: 'Bravo', altTitle: 'Bravo Two', id: '7' });
  });

  it('accepts value as the title', () => {
    expect(parseDeepLink({ deepLink: { kind: 'channel', value: 'ch1' } })).toEqual({ kind: 'channel', title: 'ch1' });
  });

  it('ignores other launch params and bad input', () => {
    expect(parseDeepLink(undefined)).toBeNull();
    expect(parseDeepLink('not json')).toBeNull();
    expect(parseDeepLink({ channel: 'ch1' })).toBeNull();
    expect(parseDeepLink({ deepLink: { kind: 'book', title: 'Alpha' } })).toBeNull();
    expect(parseDeepLink({ deepLink: { kind: 'movie', title: '  ' } })).toBeNull();
  });

  it('keeps a channel stream and logo only when they are web addresses', () => {
    expect(parseDeepLink({ deepLink: { kind: 'channel', title: 'ch1', url: 'http://host/a', logo: 'https://host/b' } }))
      .toEqual({ kind: 'channel', title: 'ch1', url: 'http://host/a', logo: 'https://host/b' });
    expect(parseDeepLink({ deepLink: { kind: 'channel', title: 'ch1', url: 'file:///a', logo: 'javascript:x' } }))
      .toEqual({ kind: 'channel', title: 'ch1' });
  });

  it('keeps the stable source and stream identity for a channel', () => {
    expect(parseDeepLink({ deepLink: { kind: 'channel', title: 'ESPN 2', sourceId: 'playlist-1',
      sourceType: 'xtream', streamId: 22, channelUrl: 'https://host/live/22.m3u8' } }))
      .toEqual({ kind: 'channel', title: 'ESPN 2', sourceId: 'playlist-1', sourceType: 'xtream', streamId: '22',
        channelUrl: 'https://host/live/22.m3u8' });
  });

  it('reads a series episode to play, the launcher id and the app to go back to', () => {
    expect(parseDeepLink({ deepLink: { kind: 'series', title: 'Alpha', tmdbId: 42, season: 2, episode: 5, resume: true, from: 'app.one' } }))
      .toEqual({ kind: 'series', title: 'Alpha', tmdbId: '42', season: 2, episode: 5, resume: true, from: 'app.one' });
    expect(parseDeepLink({ deepLink: { kind: 'series', title: 'Alpha', season: 0, episode: 1, from: 'bad id!' } }))
      .toEqual({ kind: 'series', title: 'Alpha' });
  });

  it('drops a year that is not one', () => {
    expect(parseDeepLink({ deepLink: { kind: 'movie', title: 'Alpha', year: 'soon' } })).toEqual({ kind: 'movie', title: 'Alpha' });
  });
});

describe('matchChannel', () => {
  const channels = [
    { name: 'ESPN FHD', url: 'https://host/10.m3u8', playlistIds: ['account-a'], xtreamStreamId: '10' },
    { name: 'ESPN 2 HD', url: 'https://host/11.m3u8', playlistIds: ['account-a'], xtreamStreamId: '11' },
    { name: 'ESPN', url: 'https://other/10.m3u8', playlistIds: ['account-b'], xtreamStreamId: '10' },
    { name: 'TV Cultura HD', url: 'https://m3u/cultura.m3u8?token=x', playlistIds: ['m3u-a'] },
  ];

  it('uses the account and Xtream stream_id, not a similar name or another account', () => {
    const result = matchChannel(channels, { kind: 'channel', title: 'ESPN', sourceType: 'xtream',
      sourceId: 'account-a', streamId: '11' });
    expect(result.channel?.name).toBe('ESPN 2 HD');
    expect(result.via).toBe('identity');
  });

  it('does not fall back to a same-name channel if a stable identity is missing', () => {
    const result = matchChannel(channels, { kind: 'channel', title: 'ESPN', sourceType: 'xtream',
      sourceId: 'account-a', streamId: '404' });
    expect(result).toEqual({ channel: null, ambiguous: false, via: '' });
  });

  it('uses the M3U playlist and exact address, preserving signed URLs', () => {
    const result = matchChannel(channels, { kind: 'channel', title: 'Cultura', sourceType: 'm3u',
      sourceId: 'm3u-a', channelUrl: 'https://m3u/cultura.m3u8?token=x' });
    expect(result.channel?.name).toBe('TV Cultura HD');
  });

  it('matches a legacy channel name only when it is unique', () => {
    expect(matchChannel(channels, { kind: 'channel', title: 'TV Cultura' }).channel?.name).toBe('TV Cultura HD');
    const duplicate = channels.concat({ ...channels[0], url: 'https://duplicate/10.m3u8' });
    expect(matchChannel(duplicate, { kind: 'channel', title: 'ESPN' })).toMatchObject({ channel: null, ambiguous: true });
  });
});

describe('normalizeTitle', () => {
  it('drops accents, case, provider tags and the year', () => {
    expect(normalizeTitle('XY | Ação Alpha (2020) [4K] Dublado')).toBe('acao alpha');
  });

  it('keeps a short title before a colon', () => {
    expect(normalizeTitle('Ab: Bravo')).toBe('ab bravo');
  });
});

describe('matchTitle', () => {
  const items = [
    { id: '1', name: 'Alpha Bravo (2010)' },
    { id: '2', name: 'Alpha Bravo (2021)' },
    { id: '3', name: 'XY | Alpha Bravo Charlie 4K' },
    { id: '4', name: 'Delta' },
  ];
  const idOf = (i: { id: string }) => i.id;

  it('picks the id when given', () => {
    expect(matchTitle(items, { title: 'Delta' }, idOf, '3')?.id).toBe('3');
  });

  it('picks the exact title from the right year', () => {
    expect(matchTitle(items, { title: 'Alpha Bravo', year: 2021 })?.id).toBe('2');
    expect(matchTitle(items, { title: 'alpha bravo', year: 2010 })?.id).toBe('1');
  });

  it('takes a title that starts with the wanted one', () => {
    expect(matchTitle(items, { title: 'Alpha Bravo Charlie' })?.id).toBe('3');
  });

  it('tries the alternate title', () => {
    expect(matchTitle(items, { title: 'Echo', altTitle: 'Delta' })?.id).toBe('4');
  });

  it('finds nothing for another title or year', () => {
    expect(matchTitle(items, { title: 'Echo' })).toBeNull();
    expect(matchTitle(items, { title: 'Delta Echo Foxtrot' })).toBeNull();
    expect(matchTitle(items.slice(0, 2), { title: 'Alpha Bravo', year: 1990 })).toBeNull();
  });
});

describe('opensWithoutChannels', () => {
  it('handles a movie, a series, or the account request before the live channels load', () => {
    expect(opensWithoutChannels({ kind: 'movie', title: 'Dune' })).toBe(true);
    expect(opensWithoutChannels({ kind: 'series', title: 'Breaking Bad', season: 1, episode: 2 })).toBe(true);
    expect(opensWithoutChannels({ kind: 'account', title: 'account' })).toBe(true);
  });

  it('waits for the playlists for a channel (even with its stream) and a section', () => {
    expect(opensWithoutChannels({ kind: 'channel', title: 'TV Cultura' })).toBe(false);
    expect(opensWithoutChannels({ kind: 'channel', title: 'TV Cultura', url: 'https://example.com/c.m3u8' })).toBe(false);
    expect(opensWithoutChannels({ kind: 'section', title: 'live' })).toBe(false);
  });

  it('reads a section and an account request', () => {
    expect(parseDeepLink({ deepLink: { kind: 'section', title: 'live', from: 'io.freemytv' } }))
      .toEqual({ kind: 'section', title: 'live', from: 'io.freemytv' });
    expect(parseDeepLink({ deepLink: { kind: 'account', title: 'account', from: 'io.freemytv' } }))
      .toEqual({ kind: 'account', title: 'account', from: 'io.freemytv' });
  });
});
