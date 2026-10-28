/* The Sports tab reads an M3U list's XMLTV guide to confirm which of its channels shows a game (web/channels.js). */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const now = Math.floor(Date.now() / 1000) * 1000;   // XMLTV times are to the second
const stamp = (ms, offset) => {
  const shift = offset === '-0300' ? -3 * 3600000 : 0;
  return new Date(ms + shift).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' ' + (offset || '+0000');
};
const kickoff = now + 3600000;
const programme = (channel, title, start, desc) => '<programme start="' + stamp(start, '-0300') + '" stop="'
  + stamp(start + 2 * 3600000, '-0300') + '" channel="' + channel + '"><title lang="pt">' + title + '</title>'
  + (desc ? '<desc>' + desc + '</desc>' : '') + '</programme>';
const xml = '<?xml version="1.0"?><tv>'
  + '<channel id="premiere.br"><display-name>Premiere</display-name></channel>'
  + '<channel id="premiere2.br"><display-name>Premiere 2</display-name></channel>'
  + '<channel id="sportv.br"><display-name>SporTV</display-name></channel>'
  + '<channel id="espn.br"><display-name>ESPN</display-name></channel>'
  + '<channel id="espn2.br"><display-name>ESPN 2</display-name></channel>'
  + programme('premiere.br', 'Brasileirão', kickoff - 3 * 3600000, 'Bahia x Vitória')
  + programme('premiere2.br', 'Campeonato Brasileiro', kickoff, 'Palmeiras x Santos &amp; pré-jogo')
  + programme('sportv.br', 'Seleção SporTV', kickoff)
  + programme('espn.br', 'Futebol: Barcelona x Getafe', kickoff)
  + programme('espn2.br', 'NBA', kickoff)
  + programme('espn.br', 'Muito antigo', now - 30 * 3600000)
  + '</tv>';

// Two M3U lists: one declares its guide (url-tvg), the other gets it from the IPTV player (`epg`).
const m3uA = '#EXTM3U url-tvg="https://guide.example/a.xml"\n'
  + '#EXTINF:-1 tvg-id="premiere.br" group-title="Esportes",Premiere FHD\nhttps://tv.example/a/1\n'
  + '#EXTINF:-1 tvg-id="premiere2.br" group-title="Esportes",Premiere 2 FHD\nhttps://tv.example/a/2\n'
  + '#EXTINF:-1 group-title="Esportes",SporTV HD\nhttps://tv.example/a/3\n'
  + '#EXTINF:-1 group-title="Esportes",ESPN 2\nhttps://tv.example/a/5\n';
const m3uB = '#EXTM3U\n'
  + '#EXTINF:-1 tvg-id="espn.br" group-title="Esportes",ESPN\nhttps://tv.example/b/4\n'
  + '#EXTINF:-1 tvg-id="espn2.br" group-title="Esportes",ESPN 2\nhttps://tv.example/b/5\n';
const bodies = {
  'https://lists.example/a.m3u': m3uA,
  'https://lists.example/b.m3u': m3uB,
  'https://guide.example/a.xml': xml,
  'https://guide.example/b.xml': xml,
};
const requests = [];

const stored = {'fmtv.iptvSources': JSON.stringify([
  {id: 'a', type: 'm3u', name: 'A', url: 'https://lists.example/a.m3u'},
  {id: 'b', type: 'm3u', name: 'B', url: 'https://lists.example/b.m3u', epg: ['https://guide.example/b.xml']},
])};
const context = {
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : null; },
    setItem(key, value) { stored[key] = String(value); },
    removeItem(key) { delete stored[key]; },
  },
  Date, Math, escape, decodeURIComponent,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  window: {CONFIG: {}},
  XMLHttpRequest: function () {
    let url = '';
    this.open = function (method, at) { url = at; };
    this.getResponseHeader = function () { return null; };
    this.send = function () {
      requests.push(url);
      this.readyState = 4;
      this.status = bodies[url] ? 200 : 404;
      this.responseText = bodies[url] || '';
      this.onreadystatechange();
    };
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('web/channels.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('web/sports.js', 'utf8'), context);
const {Channels, Sports} = context;

// The guide file: times with their offset, entities decoded, only what's on around now.
const parsed = Channels.parseXmltv(xml, now);
assert.strictEqual(parsed.byId['premiere2.br'].length, 1);
assert.ok(/Palmeiras x Santos & pré-jogo/.test(parsed.byId['premiere2.br'][0].title));
assert.strictEqual(parsed.byId['premiere2.br'][0].start, kickoff);
assert.strictEqual(parsed.byId['espn.br'].length, 1, 'a programme from 30 hours ago is left out');
assert.deepStrictEqual(Array.from(parsed.byName.premiere2), ['premiere2.br']);

let channels;
Channels.load(() => { channels = Channels.channels(); });
const byName = name => channels.filter(ch => ch.name === name);
const [premiere] = byName('Premiere FHD');
const [premiere2] = byName('Premiere 2 FHD');
const [sportv] = byName('SporTV HD');
const [espnB] = byName('ESPN');
const espn2s = byName('ESPN 2');

// A channel's entries: by tvg-id; by its name only when the guide has one channel of that name.
let items;
Channels.guide(premiere2, list => { items = list; });
assert.ok(items.length === 1 && /Palmeiras/.test(items[0].title));
Channels.guide(sportv, list => { items = list; });
assert.ok(items.length === 1 && /Seleção SporTV/.test(items[0].title), 'SporTV HD has no tvg-id: matched by its name');
Channels.guide(espnB, list => { items = list; });
assert.ok(/Barcelona/.test(items[0].title), 'list B reads the guide the IPTV player set up for it');

// One download per guide address, however many channels and games ask.
const guideRequests = () => requests.filter(url => /guide\.example/.test(url)).length;
const before = guideRequests();
Channels.guide(premiere, () => {});
Channels.guide(premiere2, () => {});
assert.strictEqual(guideRequests(), before, 'the guide is kept, not downloaded again');

const league = Sports.LEAGUES.filter(l => l.path === 'soccer/bra.1')[0];
const team = (name, code) => ({name, full: name, code});
const game = {id: 'soccer/bra.1:1', sport: 'soccer', league, competition: 'Brasileirão', title: 'Palmeiras x Santos',
  state: 'soon', start: kickoff, home: team('Palmeiras', 'PAL'), away: team('Santos', 'SAN'), broadcasts: []};
const resolve = (g, callback) => Sports.resolve(g, channels, Channels.identity, Channels.guide, callback, Channels.guideScan);

// Premiere 2 shows it, not Premiere (an earlier game) nor the similar names.
resolve(game, result => {
  assert.strictEqual(result.status, 'confirmed');
  assert.strictEqual(result.via, 'guide');
  assert.strictEqual(result.channel, premiere2);
});

// Any channel of an M3U list can be confirmed by the whole guide, not only the league's usual broadcasters.
const laLiga = Sports.LEAGUES.filter(l => l.path === 'soccer/esp.1')[0];
const away = {id: 'soccer/esp.1:2', sport: 'soccer', league: laLiga, competition: 'LaLiga', title: 'Barcelona x Getafe',
  state: 'soon', start: kickoff, home: team('Barcelona', 'BAR'), away: team('Getafe', 'GET'), broadcasts: []};
resolve(away, result => {
  assert.strictEqual(result.status, 'confirmed');
  assert.strictEqual(result.channel, espnB, 'ESPN, not ESPN 2');
});

// No entry names the game: not confirmed, the viewer chooses.
const unknown = Object.assign({}, game, {id: 'soccer/bra.1:3', title: 'Bahia x Ceará', start: kickoff,
  home: team('Fortaleza', 'FOR'), away: team('Ceará', 'CEA')});
resolve(unknown, result => assert.strictEqual(result.status, 'none'));

// The same game on two channels (here, the same guide line on both lists' "ESPN 2"): ambiguous, never a pick.
const nba = Sports.LEAGUES.filter(l => l.path === 'basketball/nba')[0];
assert.strictEqual(espn2s.length, 2);
const scanBoth = (shows, done) => done(espn2s);
Sports.resolve({id: 'basketball/nba:4', sport: 'basketball', league: nba, competition: 'NBA', title: 'Lakers x Celtics',
  state: 'soon', start: kickoff, home: team('Lakers', 'LAL'), away: team('Celtics', 'BOS'), broadcasts: []},
channels, Channels.identity, (c, done) => done([]), result => {
  assert.strictEqual(result.status, 'ambiguous');
  assert.strictEqual(result.candidates.length, 2);
}, scanBoth);

// A guide that can't be had (offline): nothing confirmed, nothing thrown, and no retry storm.
delete bodies['https://guide.example/a.xml'];
vm.runInContext(fs.readFileSync('web/channels.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('web/sports.js', 'utf8'), context);
context.Channels.load(() => {});
const offline = context.Channels.channels().filter(ch => ch.name === 'Premiere 2 FHD')[0];
context.Channels.guide(offline, list => assert.strictEqual(list, null));
const failedAt = requests.length;
context.Channels.guide(offline, list => assert.strictEqual(list, null));
assert.strictEqual(requests.length, failedAt, 'a failed guide is not downloaded again right away');

// A name with an accent finds the channel written without it (and the other way round).
assert.strictEqual(context.Channels.lookup('Spórtv').name, 'SporTV HD', 'accents are ignored');

console.log('M3U guide (XMLTV) channel confirmation checks passed.');
