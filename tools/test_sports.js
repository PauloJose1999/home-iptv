const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const stored = {};
const context = {
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : null; },
    setItem(key, value) { stored[key] = String(value); },
    removeItem(key) { delete stored[key]; },
  },
  Date,
  Math,
  XMLHttpRequest: function () { throw new Error('network must not be used in this test'); },
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  escape,
  decodeURIComponent,
  window: {CONFIG: {sportsCatalogUrl: '', sportsEpgUrl: 'https://example.test/epg.xml'}},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('web/channels.js', 'utf8'), context);
stored['fmtv.sportsBroadcastCatalog'] = JSON.stringify({at: Date.now(), data: {schema: 1, events: {
  'soccer/bra.1:global-1': {status: 'confirmed', region: 'BR', broadcasters: ['Premiere'],
    expiresAt: new Date(Date.now() + 3600000).toISOString()},
}}});
vm.runInContext(fs.readFileSync('web/sports.js', 'utf8'), context);
const { Sports, Channels } = context;

assert.notStrictEqual(Sports.norm('ESPN'), Sports.norm('ESPN 2'));
assert.notStrictEqual(Sports.norm('Premiere'), Sports.norm('Premiere 2'));
assert.strictEqual(Sports.norm('BR: ESPN FHD'), 'espn');

const now = Date.now();
const stamp = value => {
  const d = new Date(value);
  return d.toISOString().replace(/[-:]/g, '').replace('T', '').replace(/\.\d{3}Z$/, ' +0000');
};
const epgXml = '<tv generator-info-name="BrazilTVEPG 2026-10-26 12:00:00">'
  + '<channel id="espn.br"><display-name>ESPN Brasil</display-name></channel>'
  + '<programme start="' + stamp(now - 60000) + '" stop="' + stamp(now + 3600000) + '" channel="espn.br">'
  + '<title>Palmeiras &amp; Santos</title><sub-title>Brasileirão</sub-title><desc>Jogo ao vivo</desc></programme></tv>';
const epg = Sports.parseDailyEpg(epgXml, now);
assert.strictEqual(epg.status, 'ok');
assert.strictEqual(epg.entries.length, 1);
assert.strictEqual(epg.entries[0].channel, 'ESPN Brasil');
assert.strictEqual(epg.entries[0].title, 'Palmeiras & Santos');

const parsed = Sports.parse({
  leagues: [{name: 'Test'}],
  events: [{
    id: 'event-br', date: new Date().toISOString(),
    status: {type: {state: 'in'}},
    competitions: [{
      competitors: [],
      geoBroadcasts: [{region: 'us', media: {shortName: 'ESPN US'}}, {region: 'br', media: {shortName: 'ESPN Brasil'}}],
      broadcasts: [{region: 'br', media: {shortName: 'Premiere'}}],
    }],
  }],
}, Sports.LEAGUES[0]);
assert.deepStrictEqual(Array.from(parsed[0].broadcasts), ['ESPN Brasil', 'Premiere']);

const league = Sports.LEAGUES[0];
const game = {
  id: 'game-1', league, broadcasts: [], start: Date.now(), sport: 'soccer',
  home: {name: 'Palmeiras', full: 'Palmeiras'}, away: {name: 'Santos', full: 'Santos'},
};
const chan = (name, id, type = 'xtream', extra = {}) => ({
  name, sourceId: 'list-a', sourceType: type, streamId: id, id,
  url: 'https://iptv.example/live/' + id + '.m3u8',
  list: {url: 'https://iptv.example', user: 'u', pass: 'p'}, ...extra,
});
const espn = chan('ESPN', '20');
const espn2 = chan('ESPN 2', '21');
const premiere = chan('Premiere HD', '30');
assert.strictEqual(Sports.named(epg.entries[0].channel, [espn, espn2]).length, 0);
assert.strictEqual(Sports.named('ESPN', [espn, espn2]).length, 1);

const staleXml = '<tv generator-info-name="BrazilTVEPG ' + new Date(now - 4 * 86400000).toISOString().slice(0, 19).replace('T', ' ') + '">'
  + '<channel id="c"><display-name>Canal</display-name></channel>'
  + '<programme start="' + stamp(now) + '" stop="' + stamp(now + 3600000) + '" channel="c"><title>Jogo</title></programme></tv>';
const stale = Sports.parseDailyEpg(staleXml, now);
assert.strictEqual(stale.status, 'stale');
assert.strictEqual(stale.entries.length, 1, 'stale schedules with current programme times remain visible with a warning');
assert.ok(stale.generatedAt > 0);

let epgRequests = 0;
context.XMLHttpRequest = function () {
  this.open = function () {};
  this.getResponseHeader = function () { return String(epgXml.length); };
  this.send = function () {
    epgRequests++;
    this.status = 200;
    this.readyState = 4;
    this.responseText = epgXml.replace('2026-10-26 12:00:00', new Date(now).toISOString().slice(0, 19).replace('T', ' '));
    this.onreadystatechange();
  };
};
let firstDaily;
Sports.dailyEpg(result => { firstDaily = result; });
assert.strictEqual(firstDaily.status, 'ok');
assert.strictEqual(epgRequests, 1);
let secondDaily;
Sports.dailyEpg(result => { secondDaily = result; });
assert.strictEqual(secondDaily.status, 'ok');
assert.strictEqual(epgRequests, 1, 'the XML feed should be fetched at most once per local day');

stored['fmtv.sportsDailyEpg.v2'] = '';
let failedRequests = 0;
context.XMLHttpRequest = function () {
  this.open = function () {};
  this.getResponseHeader = function () { return '0'; };
  this.send = function () {
    failedRequests++;
    this.status = 503;
    this.readyState = 4;
    this.responseText = '';
    this.onreadystatechange();
  };
};
vm.runInContext(fs.readFileSync('web/sports.js', 'utf8'), context);
let failedDaily;
context.Sports.dailyEpg(result => { failedDaily = result; });
assert.strictEqual(failedDaily.status, 'error');
context.Sports.dailyEpg(result => { assert.strictEqual(result.status, 'error'); });
assert.strictEqual(failedRequests, 1, 'a failed daily download must not trigger repeated requests that day');

game.broadcasts = ['ESPN'];
assert.deepStrictEqual(Array.from(Sports.broadcastMatches(game, [espn, espn2], Channels.identity)), [espn]);
game.broadcasts = [];

function resolve(channels, guide, callback) {
  Sports.resolve(game, channels, Channels.identity, guide || ((c, done) => done([])), callback);
}

resolve([premiere], null, result => assert.strictEqual(result.status, 'none'));

const globalGame = Object.assign({}, game, {id: 'soccer/bra.1:global-1', broadcasts: []});
Sports.resolve(globalGame, [premiere], Channels.identity, (c, done) => done([]), result => {
  assert.strictEqual(result.status, 'confirmed');
  assert.strictEqual(result.via, 'broadcast');
  assert.strictEqual(result.channel, premiere);
});

const guideLine = {title: 'Palmeiras x Santos - Campeonato Brasileiro', start: game.start, stop: game.start + 2 * 3600000};
resolve([premiere], (c, done) => done([guideLine]), result => {
  assert.strictEqual(result.status, 'confirmed');
  assert.strictEqual(result.via, 'guide');
  assert.strictEqual(result.channel, premiere);
});

const wrongGuide = {title: 'Palmeiras x Flamengo', start: game.start, stop: game.start + 2 * 3600000};
resolve([premiere], (c, done) => done([wrongGuide]), result => assert.strictEqual(result.status, 'none'));

const m3u = {
  name: 'ESPN', url: 'https://m3u.example/channel/espn', sourceId: 'm3u-1', sourceType: 'm3u',
};
const id = Channels.identity(m3u);
assert.ok(id.indexOf('m:m3u-1#') === 0);
assert.strictEqual(Channels.linkFor(m3u).channelUrl, m3u.url);
assert.strictEqual(Channels.linkFor(espn).streamId, '20');
assert.strictEqual(Channels.linkFor(espn).sourceId, 'list-a');

Sports.choose(game, espn2, Channels.identity, false);
assert.strictEqual(Sports.selected(game, [espn, espn2], Channels.identity), espn2);
Sports.leaving(game);
assert.strictEqual(Sports.takeReturn(), game.id);
assert.strictEqual(Sports.takeReturn(), '');

const reminderGame = {id: 'remind-me', title: 'Palmeiras x Santos', competition: 'Brasileirão', start: Date.now() + 60000,
  sport: 'soccer', league, home: game.home, away: game.away, broadcasts: []};
Sports.setReminder(reminderGame, 0);
assert.strictEqual(Sports.reminderFor(reminderGame.id).lead, 0);
assert.strictEqual(Sports.dueReminder(Date.now()), null);
assert.strictEqual(Sports.dueReminder(reminderGame.start).id, reminderGame.id);
assert.strictEqual(Sports.dueReminder(reminderGame.start).status, 'active');
Sports.snoozeReminder(reminderGame.id, 10);
assert.ok(Sports.reminderFor(reminderGame.id).triggerAt > reminderGame.start);
Sports.cancelReminder(reminderGame.id);
assert.strictEqual(Sports.reminderFor(reminderGame.id), null);

console.log('Sports channel identity and confirmation checks passed.');
