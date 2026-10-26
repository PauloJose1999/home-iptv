/*
 * The Sports tab's games: today's, from ESPN's public scoreboards (site.api.espn.com, no key, open to any page), one
 * request per league, all at once; a league that fails is left out. Kept a minute, as scores change. Each game:
 * {id, sport, league, competition, title, state: live|soon|ended, start, clock, progress, home, away, broadcasts}.
 *
 * Which channel shows a game is never guessed (resolve): ESPN's Brazilian broadcasters for it, else the provider's
 * guide naming it, else a choice the viewer made. The league's usual broadcasters are only suggestions to look at.
 */
var Sports = (function () {
  'use strict';

  var BASE = 'https://site.api.espn.com/apis/site/v2/sports/';
  var KEEP_MS = 60000;
  var CATALOG_URL = window.CONFIG && window.CONFIG.sportsCatalogUrl || '';
  var DAILY_EPG_URL = window.CONFIG && window.CONFIG.sportsEpgUrl || '';
  var DAILY_EPG_KEY = 'fmtv.sportsDailyEpg.v2', dailyEpgCache = null, dailyEpgLoading = false, dailyEpgWaiters = [];
  var CATALOG_KEY = 'fmtv.sportsBroadcastCatalog', BROADCAST_KEEP_MS = 15 * 60000;
  var broadcastCatalog = {schema: 1, events: {}}, broadcastAt = 0, broadcastRetryAt = 0, broadcastLoading = false, broadcastWaiters = [];
  try {
    var savedCatalog = JSON.parse(localStorage.getItem(CATALOG_KEY));
    if (savedCatalog && savedCatalog.data && savedCatalog.data.schema === 1) {
      broadcastCatalog = savedCatalog.data;
      broadcastAt = savedCatalog.at || 0;
    }
  } catch (catalogError) {}

  // In this order the featured game is picked. `channels`: the Brazilian broadcasters to look for in the IPTV lists
  // when ESPN names none (its Brazilian region rarely does).
  // `channels` are only where to look (in the guide) and what to offer first in the chooser, never a confirmation.
  var LEAGUES = [
    {path: 'soccer/bra.1', sport: 'soccer', channels: ['premiere', 'globo', 'sportv', 'record', 'cazetv']},
    {path: 'soccer/conmebol.libertadores', sport: 'soccer', channels: ['espn', 'globo', 'paramount', 'sportv']},
    {path: 'soccer/bra.copa_do_brazil', sport: 'soccer', channels: ['premiere', 'globo', 'sportv', 'prime']},
    {path: 'soccer/conmebol.sudamericana', sport: 'soccer', channels: ['espn', 'paramount', 'sbt']},
    {path: 'soccer/bra.2', sport: 'soccer', channels: ['espn', 'sportv', 'band']},
    {path: 'soccer/uefa.champions', sport: 'soccer', channels: ['tnt', 'space', 'hbo', 'sbt']},
    {path: 'soccer/eng.1', sport: 'soccer', channels: ['espn', 'disney']},
    {path: 'soccer/esp.1', sport: 'soccer', channels: ['espn', 'disney']},
    {path: 'soccer/ita.1', sport: 'soccer', channels: ['espn', 'disney']},
    {path: 'basketball/nba', sport: 'basketball', channels: ['espn', 'prime', 'sportv']},
    {path: 'racing/f1', sport: 'racing', channels: ['band', 'bandsports']},
    {path: 'mma/ufc', sport: 'mma', channels: ['combate', 'ufc']}
  ];

  var games = null, gamesAt = 0, loading = false, waiting = [];

  function get(url, done, timeout) {
    var x = new XMLHttpRequest(), over = false;
    x.open('GET', url, true);
    x.timeout = timeout || 12000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      var json = null;
      try { if (x.status === 200) json = JSON.parse(x.responseText); } catch (e) {}
      done(json);
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; done(null); } };
    x.send();
  }

  function loadBroadcastCatalog(done) {
    if (!CATALOG_URL || Date.now() - broadcastAt < BROADCAST_KEEP_MS || Date.now() < broadcastRetryAt) { done(); return; }
    broadcastWaiters.push(done);
    if (broadcastLoading) return;
    broadcastLoading = true;
    get(CATALOG_URL, function (json) {
      if (json && json.schema === 1 && json.events && typeof json.events === 'object') {
        broadcastCatalog = json;
        broadcastAt = Date.now();
        broadcastRetryAt = 0;
        try { localStorage.setItem(CATALOG_KEY, JSON.stringify({at: broadcastAt, data: json})); } catch (e) {}
      } else broadcastRetryAt = Date.now() + 5 * 60000;
      broadcastLoading = false;
      var waiters = broadcastWaiters;
      broadcastWaiters = [];
      for (var i = 0; i < waiters.length; i++) waiters[i]();
    }, 4500);
  }

  function applyBroadcastCatalog(game) {
    var entry = broadcastCatalog.events && broadcastCatalog.events[game.id];
    if (!entry || entry.status !== 'confirmed' || String(entry.region || '').toUpperCase() !== 'BR'
        || Object.prototype.toString.call(entry.broadcasters) !== '[object Array]'
        || (entry.expiresAt && (isNaN(Date.parse(entry.expiresAt)) || Date.parse(entry.expiresAt) <= Date.now()))) return game;
    game.broadcasts = game.broadcasts || [];
    for (var i = 0; i < entry.broadcasters.length; i++) {
      var name = entry.broadcasters[i];
      if (name && game.broadcasts.indexOf(name) < 0) game.broadcasts.push(name);
    }
    return game;
  }

  function xmlAttr(text, name) {
    var match = new RegExp(name + '="([^"]*)"', 'i').exec(text || '');
    return match ? match[1] : '';
  }

  function xmlText(text) {
    return (text || '').replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (all, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (all, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function xmlTime(value) {
    var match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])(\d{2})(\d{2})$/.exec(value || '');
    if (!match) return 0;
    var stamp = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]);
    var offset = (+match[8] * 60 + +match[9]) * (match[7] === '+' ? 1 : -1);
    return stamp - offset * 60000;
  }

  /** Parse the public XMLTV feed without building a DOM; retain only today's programmes, never the multi-megabyte XML. */
  function parseDailyEpg(xml, now) {
    var date = new Date(now), dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    var dayEnd = dayStart + 86400000, channelNames = {}, channels = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi, match;
    while ((match = channels.exec(xml))) {
      var id = xmlAttr(match[1], 'id'), display = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/i.exec(match[2]);
      if (id) channelNames[id] = display ? xmlText(display[1]) : id;
    }
    var events = [], latest = 0, programs = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
    while ((match = programs.exec(xml))) {
      var start = xmlTime(xmlAttr(match[1], 'start')), stop = xmlTime(xmlAttr(match[1], 'stop'));
      if (!start || !stop || stop <= start) continue;
      if (stop > latest) latest = stop;
      if (stop <= now - 30 * 60000 || start >= dayEnd) continue;
      var titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(match[2]);
      if (!titleMatch) continue;
      var subMatch = /<sub-title\b[^>]*>([\s\S]*?)<\/sub-title>/i.exec(match[2]);
      var descMatch = /<desc\b[^>]*>([\s\S]*?)<\/desc>/i.exec(match[2]);
      var channelId = xmlAttr(match[1], 'channel');
      events.push({id: 'epg:' + channelId + ':' + start, channelId: channelId, channel: channelNames[channelId] || channelId,
        title: xmlText(titleMatch[1]), subtitle: subMatch ? xmlText(subMatch[1]) : '',
        description: descMatch ? xmlText(descMatch[1]).slice(0, 180) : '', start: start, stop: stop});
      if (events.length >= 500) break;
    }
    var generated = /generator-info-name=["'][^"']*?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/i.exec(xml), generatedAt = 0;
    if (generated) generatedAt = Date.parse(generated[1].replace(' ', 'T'));
    var stale = generatedAt ? now - generatedAt > 72 * 3600000 : latest < now - 2 * 3600000;
    events.sort(function (a, b) { return a.start - b.start; });
    return {status: stale ? 'stale' : 'ok', fetchedAt: now, generatedAt: generatedAt, latestStop: latest, entries: events};
  }

  function dailyEpg(done) {
    var todayKey = day(new Date());
    if (dailyEpgCache && dailyEpgCache.day === todayKey) { done(dailyEpgCache); return; }
    try {
      var saved = JSON.parse(localStorage.getItem(DAILY_EPG_KEY));
      if (saved && saved.day === todayKey) { dailyEpgCache = saved; done(saved); return; }
    } catch (e) {}
    dailyEpgWaiters.push(done);
    if (dailyEpgLoading) return;
    dailyEpgLoading = true;
    function finish(result) {
      dailyEpgCache = result;
      try { localStorage.setItem(DAILY_EPG_KEY, JSON.stringify(result)); } catch (e) {}
      dailyEpgLoading = false;
      var waiting = dailyEpgWaiters;
      dailyEpgWaiters = [];
      for (var i = 0; i < waiting.length; i++) waiting[i](result);
    }
    if (!DAILY_EPG_URL) { finish({day: todayKey, status: 'disabled', entries: []}); return; }
    var x = new XMLHttpRequest(), over = false;
    x.open('GET', DAILY_EPG_URL, true);
    x.timeout = 20000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      var size = +(x.getResponseHeader('Content-Length') || 0);
      if (x.status !== 200 || size > 12582912 || !x.responseText || x.responseText.length > 12582912 || x.responseText.indexOf('<tv') < 0) {
        finish({day: todayKey, status: 'error', entries: []});
        return;
      }
      var result = parseDailyEpg(x.responseText, Date.now());
      result.day = todayKey;
      finish(result);
    };
    x.ontimeout = x.onerror = function () {
      if (over) return;
      over = true;
      finish({day: todayKey, status: 'error', entries: []});
    };
    x.send();
  }

  /** Text that reads on the team's color (4.5:1): white, unless the color is light. */
  function inkFor(hex) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#FFF';
    var n = parseInt(m[1], 16);
    function c(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    var lum = 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
    return 1.05 / (lum + 0.05) >= 4.5 ? '#FFF' : '#111118';
  }

  function team(c) {
    var t = c && c.team;
    if (!t) return null;
    var color = /^[0-9a-f]{6}$/i.test(t.color || '') ? '#' + t.color : '';
    var name = t.shortDisplayName || t.displayName || t.abbreviation || '';
    return {code: (t.abbreviation || name.slice(0, 3)).toUpperCase(), name: name, full: t.displayName || name, color: color,
      ink: color ? inkFor(color) : '', logo: t.logo || '', score: c.score || ''};
  }

  function side(list, which) {
    for (var i = 0; i < list.length; i++) if (list[i].homeAway === which) return list[i];
    return null;
  }

  /** How far a live game is (0–100) and its clock: {phase: period|halftime|extra|other, period, display}. */
  function live(sport, s) {
    var period = Math.max(1, s.period || 1), display = s.displayClock || '';
    if (s.type && s.type.name === 'STATUS_HALFTIME') return {clock: {phase: 'halftime', period: period, display: display}, progress: 50};
    if (sport === 'soccer') {
      var minute = parseInt(display, 10) || 0;
      return {clock: {phase: period > 2 ? 'extra' : 'period', period: period, display: display},
        progress: Math.min(100, Math.round(minute / 90 * 100))};
    }
    if (sport === 'basketball') {
      var m = /^(\d+):(\d{2})/.exec(display), done = m ? 1 - (+m[1] + m[2] / 60) / 12 : 0.5;
      return {clock: {phase: 'period', period: period, display: display},
        progress: Math.min(100, Math.round((period - 1 + Math.max(0, Math.min(1, done))) / 4 * 100))};
    }
    return {clock: {phase: 'other', period: period, display: (s.type && s.type.detail) || ''}, progress: 50};
  }

  function parse(json, league) {
    var out = [], events = (json && json.events) || [];
    var competition = json && json.leagues && json.leagues[0] ? json.leagues[0].name || '' : '';
    for (var i = 0; i < events.length; i++) {
      var ev = events[i], comp = ev.competitions && ev.competitions[0], s = ev.status || (comp && comp.status);
      var start = Date.parse(ev.date || '');
      if (!ev.id || !comp || !s || isNaN(start)) continue;
      var two = league.sport === 'soccer' || league.sport === 'basketball', list = comp.competitors || [];
      var home = two ? team(side(list, 'home')) : null, away = two ? team(side(list, 'away')) : null;
      var state = s.type && s.type.state === 'in' ? 'live' : s.type && (s.type.state === 'post' || s.type.completed) ? 'ended' : 'soon';
      var now = state === 'live' ? live(league.sport, s) : null, broadcasts = [];
      // Only who shows it in Brazil: ESPN's other broadcasters (US regional networks...) aren't on a Brazilian list.
      var b = (comp.geoBroadcasts || []).concat(comp.broadcasts || []);
      for (var k = 0; k < b.length; k++) {
        var media = b[k].media && (b[k].media.shortName || b[k].media.name) || b[k].shortName || b[k].name;
        if (media && String(b[k].region || '').toLowerCase() === 'br' && broadcasts.indexOf(media) < 0) broadcasts.push(media);
      }
      out.push({
        id: league.path + ':' + ev.id, sport: league.sport, league: league, competition: competition,
        title: home && away ? home.name + ' x ' + away.name : ev.name || ev.shortName || '',
        state: state, start: start, clock: now ? now.clock : null,
        progress: state === 'ended' ? 100 : now ? now.progress : 0,
        home: home, away: away, broadcasts: broadcasts
      });
    }
    return out;
  }

  function day(d) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return '' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate());
  }

  /** Every league's games of the local day, live first, then by start time; done(games, failed). */
  function today(done) {
    if (games && Date.now() - gamesAt < KEEP_MS) {
      loadBroadcastCatalog(function () { done(games.map(applyBroadcastCatalog), false); });
      return;
    }
    waiting.push(done);
    if (loading) return;
    loading = true;
    var left = LEAGUES.length, all = [], answered = 0, date = day(new Date());
    function one(league) {
      get(BASE + league.path + '/scoreboard?lang=pt&region=br&dates=' + date, function (json) {
        if (json) { answered++; all = all.concat(parse(json, league)); }
        if (--left) return;
        var rank = {live: 0, soon: 1, ended: 2};
        all.sort(function (a, b) { return rank[a.state] - rank[b.state] || a.start - b.start; });
        loading = false;
        if (answered) { games = all; gamesAt = Date.now(); }
        loadBroadcastCatalog(function () {
          var w = waiting;
          waiting = [];
          for (var i = 0; i < w.length; i++) w[i](games ? games.map(applyBroadcastCatalog) : [], !answered);
        });
      });
    }
    for (var i = 0; i < LEAGUES.length; i++) one(LEAGUES[i]);
  }

  // MARK: - Which channel shows a game

  // What a channel's name carries that isn't the channel: quality and codec tags.
  var QUALITY = /^(hd|fhd|sd|uhd|4k|8k|hq|h264|h265|hevc|1080p|720p|480p|60fps|50fps|fps)$/;
  // Words many teams share: alone, they don't say which team a guide means.
  var GENERIC = /^(atletico|clube|club|sport|sports|esporte|futebol|fc|ec|sc|ac|cf|cd|de|do|da|dos|das|the|team)$/;

  /** A name to compare: lower case, no accents, letters apart from digits ("ESPN2" is "espn 2"), no HD/FHD/4K, no "BR:". */
  function norm(x) {
    var t = (x || '').toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c').replace(/ñ/g, 'n')
      .replace(/^\s*[\[(]?(br|bra|pt)[\])]?\s*[:|\-]\s*/, '')
      .replace(/([a-z])([0-9])/g, '$1 $2').replace(/([0-9])([a-z])/g, '$1 $2')
      .replace(/[^a-z0-9]+/g, ' ');
    var words = t.split(' '), out = [];
    for (var i = 0; i < words.length; i++) if (words[i] && !QUALITY.test(words[i])) out.push(words[i]);
    return out.join(' ');
  }

  /** The channels whose name is exactly `name` (ESPN is not ESPN 2, Premiere is not Premiere Clubes). */
  function named(name, channels) {
    var want = norm(name), out = [];
    if (!want) return out;
    for (var i = 0; i < channels.length; i++) if (norm(channels[i].name) === want) out.push(channels[i]);
    return out;
  }

  function broadcastMatches(game, channels, identity) {
    var out = [], seen = {};
    var broadcasts = game.broadcasts || [];
    for (var b = 0; b < broadcasts.length; b++) {
      var matches = named(broadcasts[b], channels);
      for (var i = 0; i < matches.length; i++) {
        var key = identity(matches[i]) || matches[i].url || matches[i].name;
        if (!seen[key]) { seen[key] = true; out.push(matches[i]); }
      }
    }
    return out;
  }

  /** The league's usual broadcasters in the lists ("Premiere", "Premiere 2"...): where to look, and what to offer first. */
  function suggestions(game, channels) {
    var out = [], hints = game.league.channels;
    for (var i = 0; i < channels.length; i++) {
      var first = norm(channels[i].name).split(' ')[0];
      for (var h = 0; h < hints.length; h++) if (first === hints[h]) { out.push(channels[i]); break; }
    }
    return out;
  }

  function hasWords(text, phrase) {
    return !!phrase && (' ' + text + ' ').indexOf(' ' + phrase + ' ') >= 0;
  }

  /** Whether a guide's title names this team: its whole name, or a word of it that only it has (not "Atlético"). */
  function namesTeam(text, team) {
    if (!team) return false;
    var names = [norm(team.name), norm(team.full)];
    for (var i = 0; i < names.length; i++) {
      if (hasWords(text, names[i])) return true;
      var words = names[i].split(' ');
      for (var w = 0; w < words.length; w++) {
        if (words[w].length >= 4 && !GENERIC.test(words[w]) && hasWords(text, words[w])) return true;
      }
    }
    return false;
  }

  /** Whether a guide entry is this game: on at its start, and naming both teams (or the race, the fight night). */
  function guideShows(item, game) {
    if (!(item.start <= game.start + 15 * 60000 && item.stop >= game.start + 10 * 60000)) return false;
    var text = norm(item.title);
    if (game.home && game.away) return namesTeam(text, game.home) && namesTeam(text, game.away);
    if (game.sport === 'racing') return /\b(formula 1|f 1|grande premio|gp)\b/.test(text);
    if (game.sport === 'mma') return /\bufc\b/.test(text);
    return false;
  }

  // The viewer's choices: a channel for a game (kept 3 days), and one for every game of a competition.
  var PICKS = 'fmtv.sportsPicks';

  function picks() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(PICKS)); } catch (e) {}
    return p && p.games && p.rules ? p : {games: {}, rules: {}};
  }

  function savePicks(p) {
    var now = Date.now();
    for (var id in p.games) if (p.games.hasOwnProperty(id) && now - p.games[id].at > 3 * 86400000) delete p.games[id];
    try { localStorage.setItem(PICKS, JSON.stringify(p)); } catch (e) {}
  }

  /** The viewer chose `channel` for this game; `always`: for every game of its competition too. */
  function choose(game, channel, identity, always) {
    var p = picks(), pick = {key: identity(channel), name: channel.name, at: Date.now()};
    p.games[game.id] = pick;
    if (always) p.rules[game.league.path] = pick;
    savePicks(p);
  }

  /** Forget the viewer's channel for this game, and the competition's rule when `rule`, to choose again. */
  function forget(game, rule) {
    var p = picks();
    delete p.games[game.id];
    if (rule) delete p.rules[game.league.path];
    savePicks(p);
  }

  /** A channel chosen for this game or its competition; null if that saved identity is no longer available. */
  function selected(game, channels, identity) {
    var p = picks(), item = p.games[game.id] || p.rules[game.league.path];
    return item ? byKey(item.key, channels, identity) : null;
  }

  function byKey(key, channels, identity) {
    for (var i = 0; key && i < channels.length; i++) if (identity(channels[i]) === key) return channels[i];
    return null;
  }

  /**
   * Which of the lists' channels shows `game`; done({status, via, channel, candidates}):
   *  - 'picked': the viewer chose it for this game (first: it's how a wrong match is corrected);
   *  - 'confirmed': one channel, `via` 'broadcast' (ESPN names its Brazilian broadcaster, and one channel is exactly
   *    that name) or 'guide' (the provider's guide names the game on one channel only);
   *  - 'rule': the viewer's channel for every game of the competition;
   *  - 'ambiguous': several channels fit (`candidates`); 'none': nothing says which (`candidates`: suggestions).
   * Nothing opens from a suggestion alone. `guide(channel, cb)` reads a channel's guide: cb(items) or cb(null).
   * `scan(shows, cb)`, when given, looks through whole guides (an M3U list's XMLTV) for the channels where
   * `shows(item)` holds: any channel of those lists can be confirmed so, not only the league's usual broadcasters.
   */
  function resolveLoaded(game, channels, identity, guide, done, scan) {
    var p = picks(), pick = p.games[game.id] && byKey(p.games[game.id].key, channels, identity);
    if (pick) { done({status: 'picked', via: 'viewer', channel: pick, candidates: [pick]}); return; }
    var from = broadcastMatches(game, channels, identity);
    if (from.length === 1) { done({status: 'confirmed', via: 'broadcast', channel: from[0], candidates: from}); return; }
    if (from.length > 1) { done({status: 'ambiguous', via: 'broadcast', channel: null, candidates: from}); return; }
    // A guide query is a network request. The chooser still contains every list channel, but only a small set of
    // league-relevant candidates is checked before asking the viewer; never fan out across an entire IPTV playlist.
    var look = suggestions(game, channels).slice(0, 10), shown = [], seen = {}, left = look.length + (scan ? 1 : 0);
    function found(ch) {
      var key = identity(ch) || ch.url || ch.name;
      if (!seen[key]) { seen[key] = true; shown.push(ch); }
    }
    function after() {
      if (shown.length === 1) { done({status: 'confirmed', via: 'guide', channel: shown[0], candidates: shown}); return; }
      if (shown.length > 1) { done({status: 'ambiguous', via: 'guide', channel: null, candidates: shown}); return; }
      var rule = p.rules[game.league.path], ruled = rule && byKey(rule.key, channels, identity);
      if (ruled) { done({status: 'rule', via: 'viewer', channel: ruled, candidates: [ruled]}); return; }
      done({status: 'none', via: '', channel: null, candidates: look});
    }
    if (!left) { after(); return; }
    if (scan) {
      scan(function (item) { return guideShows(item, game); }, function (list) {
        for (var s = 0; list && s < list.length; s++) found(list[s]);
        if (!--left) after();
      });
    }
    for (var i = 0; i < look.length; i++) (function (ch) {
      guide(ch, function (items) {
        for (var k = 0; items && k < items.length; k++) if (guideShows(items[k], game)) { found(ch); break; }
        if (!--left) after();
      });
    })(look[i]);
  }

  function resolve(game, channels, identity, guide, done, scan) {
    loadBroadcastCatalog(function () {
      applyBroadcastCatalog(game);
      resolveLoaded(game, channels, identity, guide, done, scan);
    });
  }

  // The game the IPTV player was opened for: Back there brings this app again, onto that game.
  var RETURN = 'fmtv.sportsReturn';

  function leaving(game) {
    try { localStorage.setItem(RETURN, JSON.stringify({game: game.id, at: Date.now()})); } catch (e) {}
  }

  function forgetReturn() { try { localStorage.removeItem(RETURN); } catch (e) {} }

  /** The game to focus again (once), when the player brought this app back within 6 hours; '' otherwise. */
  function takeReturn() {
    var r = null;
    try { r = JSON.parse(localStorage.getItem(RETURN)); localStorage.removeItem(RETURN); } catch (e) {}
    return r && r.game && Date.now() - r.at < 6 * 3600000 ? r.game : '';
  }

  // Match reminders live in this app's local storage and fire while the launcher is running or returns to the foreground.
  var REMINDERS = 'fmtv.sportsReminders';

  function reminders() {
    try { return JSON.parse(localStorage.getItem(REMINDERS)) || []; } catch (e) { return []; }
  }

  function saveReminders(items) {
    try { localStorage.setItem(REMINDERS, JSON.stringify(items)); } catch (e) {}
  }

  function setReminder(game, leadMinutes) {
    var items = reminders(), item = {id: game.id, title: game.title, competition: game.competition, start: game.start,
      sport: game.sport, leaguePath: game.league.path, home: game.home, away: game.away, broadcasts: game.broadcasts || [], lead: leadMinutes,
      triggerAt: game.start - leadMinutes * 60000, status: 'pending'};
    for (var i = items.length - 1; i >= 0; i--) if (items[i].id === game.id) items.splice(i, 1);
    items.push(item);
    saveReminders(items);
    return item;
  }

  function reminderFor(id) {
    var items = reminders();
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function dueReminder(now) {
    var items = reminders(), active = null, candidate = null, dirty = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].start + 4 * 3600000 < now) { items.splice(i--, 1); dirty = true; continue; }
      if (items[i].status === 'active' && (!active || items[i].triggerAt < active.triggerAt)) active = items[i];
      else if (items[i].status === 'pending' && items[i].triggerAt <= now && (!candidate || items[i].triggerAt < candidate.triggerAt)) candidate = items[i];
    }
    if (dirty) saveReminders(items);
    if (active) return active;
    if (!candidate) return null;
    candidate.status = 'active';
    saveReminders(items);
    return candidate;
  }

  function finishReminder(id) {
    saveReminders(reminders().filter(function (item) { return item.id !== id; }));
  }

  function snoozeReminder(id, minutes) {
    var items = reminders();
    for (var i = 0; i < items.length; i++) if (items[i].id === id) {
      items[i].status = 'pending';
      items[i].triggerAt = Date.now() + minutes * 60000;
      break;
    }
    saveReminders(items);
  }

  function cancelReminder(id) { finishReminder(id); }

  return {today: today, parse: parse, inkFor: inkFor, LEAGUES: LEAGUES, norm: norm, named: named, suggestions: suggestions,
    dailyEpg: dailyEpg, parseDailyEpg: parseDailyEpg,
    broadcastMatches: broadcastMatches, selected: selected, guideShows: guideShows, resolve: resolve, choose: choose,
    forget: forget, leaving: leaving, forgetReturn: forgetReturn, takeReturn: takeReturn,
    setReminder: setReminder, reminderFor: reminderFor, dueReminder: dueReminder, cancelReminder: cancelReminder,
    snoozeReminder: snoozeReminder};
})();
