/*
 * What the home screen shows, kept in localStorage so it opens with numbers:
 *  - the Movies and Shows catalogs, as on Netflix: rows of titles only from the streaming apps on this TV (TMDB, with
 *    the person's own free key from config.properties), fetched only when their tab is opened;
 *  - weather, sunrise and sunset (Open-Meteo, every 30 min).
 * Settings changed on the TV (Prefs) win over config.properties. Built without a city (--generic), the
 * TV's time zone gives the city, and its country the region (zones.js).
 */
var CONFIG = window.CONFIG || {};

var Place = (function () {
  'use strict';
  /** A time zone's main city: {country, lat, lon, name}, or null. */
  function zone(name) {
    var all = window.ZONES || {}, v = all[name], hops = 0;
    while (v && v.charAt(0) === '=' && hops++ < 3) { name = v.slice(1); v = all[name]; }
    if (!v) return null;
    var p = v.split(',');
    return {country: p[0], lat: p[1], lon: p[2], name: p[3] || name.slice(name.lastIndexOf('/') + 1).replace(/_/g, ' ')};
  }

  var tz = zone(TV.zone()), set = CONFIG.latitude !== '' && CONFIG.latitude !== undefined;
  var country = (CONFIG.tmdbRegion || (tz ? tz.country : '') || 'US').toUpperCase();
  return {
    lat: set ? CONFIG.latitude : tz ? tz.lat : '40.7128',
    lon: set ? CONFIG.longitude : tz ? tz.lon : '-74.0060',
    city: CONFIG.city || (!set && tz ? tz.name : ''),
    country: country,
    /** Fahrenheit for TVs in the US (by their time zone, or their language when it doesn't tell). */
    fahrenheit: tz ? tz.country === 'US' : /-US$/i.test(navigator.language || '')
  };
})();

var Prefs = (function () {
  'use strict';
  var KEY = 'fmtv.prefs';
  var v = {};
  try { v = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function pick(name, fallback) { return v[name] === undefined ? fallback : v[name]; }
  return {
    version: 0,
    language: function () { return pick('language', CONFIG.language || 'auto'); },
    temperature: function () { return pick('temperature', CONFIG.temperature || 'auto'); },
    theme: function () { return pick('theme', 'auto'); },
    weather: function () { return pick('weather', true); },
    shelf: function () { return pick('shelf', null); },
    /** Apps kept off the shelf (still in All Apps). */
    shelfHidden: function () { return pick('shelfHidden', []); },
    /** The three channels of TV aberta, by name (before the two cards); null: config.properties' live_channels. */
    liveChannels: function () { return pick('liveChannels', null); },
    /** TV aberta's two cards: {big, small}, each {kind: 'antenna' | 'iptv', name ('' for the antenna: its channel)}. */
    cardPicks: function () { return pick('cardPicks', null); },
    /** The focused channel card plays with sound. */
    cardSound: function () { return pick('cardSound', true); },
    /** Accessibility: the text size ('normal' | 'large' | 'xlarge'), solid colors for small text, a thick focus frame,
     *  and no sliding or fading. */
    textSize: function () { return pick('textSize', 'normal'); },
    contrast: function () { return pick('contrast', false); },
    strongFocus: function () { return pick('strongFocus', false); },
    still: function () { return pick('still', false); },
    /** Minutes without a key before the screensaver; 0: never. */
    saverMinutes: function () { return pick('saverMinutes', 5); },
    set: function (name, value) { v[name] = value; save(); this.version++; },
    /** Back to how the launcher came: every setting made on the TV is forgotten. */
    reset: function () { v = {}; save(); this.version++; }
  };
})();

var Data = (function () {
  'use strict';

  function store(key, value) { try { localStorage.setItem('fmtv.' + key, JSON.stringify(value)); } catch (e) {} }
  function stored(key) { try { return JSON.parse(localStorage.getItem('fmtv.' + key)); } catch (e) { return null; } }

  /** GET a JSON document; done(error, json). */
  function get(url, headers, done) {
    var x = new XMLHttpRequest();
    var over = false;
    x.open('GET', url, true);
    x.timeout = 10000;
    for (var h in headers) if (headers.hasOwnProperty(h)) x.setRequestHeader(h, headers[h]);
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      if (x.status !== 200) { done(new Error(x.status === 401 ? 'TMDB rejected the key' : 'HTTP ' + x.status)); return; }
      var json;
      try { json = JSON.parse(x.responseText); } catch (e) { done(e); return; }
      done(null, json);
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; done(new Error('no connection')); } };
    x.send();
  }

  var listeners = [];
  function changed() { for (var i = 0; i < listeners.length; i++) listeners[i](); }

  // MARK: - Weather

  var PLACE = Place.lat + ',' + Place.lon;
  var weather = null, weatherAt = 0, fetchingWeather = false;
  (function () {
    var w = stored('weather');
    if (w && w.place === PLACE) { weather = parseWeather(w.body); weatherAt = w.at; }
  })();

  /** "2026-10-20T18:31" at the location (Open-Meteo's local time) → epoch ms. */
  function localTime(iso, offsetSeconds) {
    var m = /^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/.exec(iso || '');
    if (!m) return 0;
    return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) - offsetSeconds * 1000;
  }

  function parseWeather(o) {
    if (!o || !o.current) return null;
    var off = o.utc_offset_seconds || 0, now = Date.now();
    var w = {
      temp: o.current.temperature_2m, code: o.current.weather_code, isDay: o.current.is_day !== 0,
      max: o.daily.temperature_2m_max[0], min: o.daily.temperature_2m_min[0],
      sunrise: localTime(o.daily.sunrise[0], off), sunset: localTime(o.daily.sunset[0], off), hours: []
    };
    var hr = o.hourly;
    for (var i = 0; hr && i < hr.time.length && w.hours.length < 6; i++) {
      var at = localTime(hr.time[i], off);
      if (at <= now) continue;
      w.hours.push({at: at, temp: hr.temperature_2m[i], code: hr.weather_code[i], day: !hr.is_day || hr.is_day[i] !== 0});
    }
    return w;
  }

  function refreshWeather() {
    var now = Date.now();
    if (fetchingWeather || (now - weatherAt < 30 * 60000 && now >= weatherAt)) return;
    fetchingWeather = true;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + Place.lat + '&longitude=' + Place.lon
        + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset'
        + '&hourly=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=2';
    get(url, {}, function (err, body) {
      fetchingWeather = false;
      if (err) return;
      weather = parseWeather(body);
      weatherAt = Date.now();
      store('weather', {place: PLACE, body: body, at: weatherAt});
      changed();
    });
  }

  // MARK: - Picks (TMDB)

  var KEY = (CONFIG.tmdbKey || '').trim();
  var REGION = Place.country;
  var API = 'https://api.themoviedb.org/3';

  /** Service name on TMDB (part of it, lowercase) → our key, how to find its app on the TV (id, name), its name. */
  var SERVICES = [
    ['netflix', 'netflix', /^netflix$/, /netflix/i, 'Netflix'],
    ['prime video', 'prime', /^amazon$/, /prime video|amazon/i, 'Prime Video'],
    ['disney', 'disney', /disney/, /disney/i, 'Disney+'],
    ['hulu', 'hulu', /^hulu/, /hulu/i, 'Hulu'],
    ['paramount', 'paramount', /paramount|cbs/, /paramount/i, 'Paramount+'],
    ['peacock', 'peacock', /peacock/, /peacock/i, 'Peacock'],
    ['globoplay', 'globoplay', /globoplay/, /globoplay/i, 'Globoplay'],
    ['max', 'max', /hbo|wbd|\.max/, /^(hbo )?max$|hbo max/i, 'Max'],
    ['apple tv', 'appletv', /appletv|apple\.tv/, /apple tv/i, 'Apple TV'],
    ['hotstar', 'hotstar', /hotstar/, /hotstar/i, 'JioHotstar'],
    ['crunchyroll', 'crunchyroll', /crunchyroll/, /crunchyroll/i, 'Crunchyroll']
  ];

  var installed = [];   // the TV's apps, from TV.apps()

  /** The installed app for a service key, or null. */
  function appFor(key) {
    for (var s = 0; s < SERVICES.length; s++) {
      if (SERVICES[s][1] !== key) continue;
      for (var i = 0; i < installed.length; i++) {
        if (SERVICES[s][2].test(installed[i].id) || SERVICES[s][3].test(installed[i].title)) return installed[i];
      }
    }
    return null;
  }

  /** "… Amazon Channel" is sold inside another app; Apple TV is only the streaming service (350; 2 is the store). */
  function service(providerName, providerId) {
    var n = (providerName || '').toLowerCase();
    if (n.indexOf(' channel') >= 0) return null;
    for (var i = 0; i < SERVICES.length; i++) {
      var s = SERVICES[i];
      if (s[1] === 'appletv' && providerId !== 350) continue;
      if (s[0] === 'max' ? /\bmax\b/.test(n) : n.indexOf(s[0]) >= 0) return s;
    }
    return null;
  }

  function tmdb(path, done) {
    var bearer = KEY.indexOf('eyJ') === 0;   // read access token (v4) or API key (v3)
    var url = API + path + (bearer ? '' : (path.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(KEY));
    get(url, bearer ? {Authorization: 'Bearer ' + KEY, Accept: 'application/json'} : {Accept: 'application/json'}, done);
  }

  /** TMDB's language: Latin American Spanish unless the TV is in Spain, and Germany's German. */
  function lang() {
    if (I18N.lang === 'es') return /-ES\b/i.test(navigator.language || '') ? 'es-ES' : 'es-MX';
    if (I18N.lang === 'de') return 'de-DE';   // TMDB's de-AT and de-CH have few translations of their own
    return I18N.locale();
  }

  function day(offset) {
    var d = new Date(Date.now() + offset * 86400000);
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
  }

  /** TMDB's genres that it leaves in English in some languages. */
  function genre(name) {
    switch (name) {
      case 'Action & Adventure': return tr('genre|Action & Adventure');
      case 'Sci-Fi & Fantasy': return tr('genre|Sci-Fi & Fantasy');
      case 'War & Politics': return tr('genre|War & Politics');
      case 'Kids': return tr('genre|Kids');
      case 'News': return tr('genre|News');
      case 'Soap': return tr('genre|Soap');
      case 'Talk': return tr('genre|Talk');
      default: return name;
    }
  }

  /** TMDB's Animation genre (movies and shows: cartoons and anime), left out with hide_animation=true. */
  var ANIMATION = 16;

  /** Runs fn on each item one after the other (the TV's network is shared with what's playing). */
  function each(items, fn, done) {
    var i = 0;
    (function next() {
      if (i >= items.length) { done(); return; }
      fn(items[i++], next);
    })();
  }

  // MARK: - Catalog: the Movies and Shows tabs, as on Netflix
  //
  // Nothing is fetched until a tab is opened: then its rows come one by one (each a TMDB request, one after the other),
  // only with titles on the streaming apps this TV has, and are kept 6 hours (memory and localStorage).

  // The genre rows, by TMDB id: what a family watches, and novelas.
  var GENRE_ROWS = {movie: [35, 18, 10749, 10751, 28, 99], tv: [10766, 35, 18, 80, 10751, 99]};
  var catalogs = {};   // kind -> {rows: [{title, items}], at, lang, stamp, loading, error}
  try { localStorage.removeItem('fmtv.recs'); } catch (e) {}   // the three picks of the version before

  function appsStamp() {
    var s = KEY.length + ':' + KEY.slice(-6) + ':' + REGION + (CONFIG.hideAnimation ? ':no-animation' : '');
    for (var i = 0; i < SERVICES.length; i++) s += appFor(SERVICES[i][1]) ? '1' : '0';
    return s;
  }

  function item(o, kind, app) {
    var date = kind === 'movie' ? o.release_date : o.first_air_date;
    return {
      id: o.id, kind: kind, title: kind === 'movie' ? o.title : o.name, backdrop: o.backdrop_path,
      original: kind === 'movie' ? o.original_title : o.original_name,
      overview: o.overview || '', year: date ? date.slice(0, 4) : '', rating: o.vote_average || 0,
      genres: o.genre_ids || [], app: app ? app[1] : null, service: app ? app[4] : ''
    };
  }

  /** The browser preview without a TMDB key: sample rows, to see the screen. */
  function sampleCatalog(kind) {
    var rows = [], names = ['Em alta', 'No Netflix', 'Comédia', 'Drama'];
    for (var r = 0; r < names.length; r++) {
      var items = [];
      for (var i = 0; i < 12; i++) {
        items.push({id: r * 100 + i, kind: kind, title: (kind === 'movie' ? 'Filme ' : 'Série ') + (r * 12 + i + 1), backdrop: '',
          overview: 'Uma história de exemplo para a prévia no computador, com duas ou três linhas de texto para ver como fica.',
          year: '2026', rating: 7.5, genres: [], app: 'netflix', service: 'Netflix'});
      }
      rows.push({title: names[r], items: items});
    }
    return {rows: rows, at: Date.now(), lang: I18N.lang, stamp: '', loading: false, error: ''};
  }

  /**
   * The tab's catalog: update(catalog) runs now with what's kept, and again as each row arrives. Fetches only when
   * what's kept is old (6 h), in another language, or the TV's apps changed.
   */
  function catalog(kind, update) {
    // An Xtream account in config.properties shows the provider's own movies and series instead of TMDB.
    if (window.VOD && VOD.enabled) { VOD.catalog(kind, update); return; }
    var c = catalogs[kind] || stored('catalog.' + kind), stamp = appsStamp(), t = Date.now();
    if (!KEY) {
      c = TV.name === 'browser' ? sampleCatalog(kind) : {rows: [], loading: false, error: 'no key'};
      catalogs[kind] = c;
      update(c);
      return;
    }
    if (c && (c.loading || (c.stamp === stamp && c.lang === I18N.lang && t - c.at < 6 * 3600000 && t >= c.at && c.rows.length))) {
      catalogs[kind] = c;
      c.update = update;
      update(c);
      return;
    }
    if (!installed.length) { update(c || {rows: [], loading: true, error: ''}); return; }
    var fresh = {rows: [], at: t, lang: I18N.lang, stamp: stamp, loading: true, error: '', update: update};
    catalogs[kind] = fresh;
    if (c && c.rows && c.rows.length) { c.update = update; update(c); }   // the old rows until the new ones come
    fetchCatalog(kind, fresh, function (err) {
      fresh.loading = false;
      if (err && !fresh.rows.length) { fresh.error = err.message; if (c && c.rows && c.rows.length) { c.loading = false; catalogs[kind] = c; } }
      else store('catalog.' + kind, {rows: fresh.rows, at: fresh.at, lang: fresh.lang, stamp: fresh.stamp, genreNames: fresh.genreNames});
      catalogs[kind].update(catalogs[kind]);
    });
  }

  function fetchCatalog(kind, c, done) {
    var common = '&language=' + lang() + '&watch_region=' + REGION + '&with_watch_monetization_types=flatrate&include_adult=false'
        + (CONFIG.hideAnimation ? '&without_genres=' + ANIMATION : '');
    tmdb('/watch/providers/' + kind + '?language=' + lang() + '&watch_region=' + REGION, function (err, res) {
      if (err) { done(err); return; }
      // One row per app: TMDB lists some services twice ("Netflix" and "Netflix Standard with Ads"), both ids go in it.
      var mine = [], ids = [], byApp = {};
      for (var i = 0; res.results && i < res.results.length; i++) {
        var id = res.results[i].provider_id, s = service(res.results[i].provider_name, id);
        if (!s || !appFor(s[1])) continue;
        ids.push(id);
        if (byApp[s[1]]) byApp[s[1]][0] += '|' + id;
        else { byApp[s[1]] = [String(id), s]; mine.push(byApp[s[1]]); }
      }
      if (!ids.length) { done(new Error("none of the TV's streaming apps are on TMDB")); return; }
      var all = '&with_watch_providers=' + encodeURIComponent(ids.join('|'));
      var dated = kind === 'movie' ? 'primary_release_date' : 'first_air_date';
      // [title, query, the app every title of the row is on]
      var plan = [[tr('Popular on your apps'), 'sort_by=popularity.desc' + all, null]];
      for (var m = 0; m < mine.length; m++) {
        plan.push([trf('On {app}', {app: mine[m][1][4]}), 'sort_by=popularity.desc&with_watch_providers=' + encodeURIComponent(mine[m][0]), mine[m][1]]);
      }
      plan.push([tr('New releases'), 'sort_by=popularity.desc&' + dated + '.gte=' + day(-180) + '&' + dated + '.lte=' + day(0) + all, null]);
      plan.push([tr('Top rated'), 'sort_by=vote_average.desc&vote_count.gte=' + (kind === 'movie' ? 1000 : 300) + all, null]);
      tmdb('/genre/' + kind + '/list?language=' + lang(), function (e, g) {
        var names = {};
        for (var n = 0; !e && g.genres && n < g.genres.length; n++) names[g.genres[n].id] = genre(g.genres[n].name);
        c.genreNames = names;
        var wanted = GENRE_ROWS[kind];
        for (var w = 0; w < wanted.length; w++) {
          if (names[wanted[w]] && !(CONFIG.hideAnimation && wanted[w] === ANIMATION)) {
            plan.push([names[wanted[w]], 'sort_by=popularity.desc&with_genres=' + wanted[w] + all, null]);
          }
        }
        each(plan, function (row, next) {
          tmdb('/discover/' + kind + '?' + row[1] + common, function (e2, r) {
            var items = [];
            for (var j = 0; !e2 && r.results && j < r.results.length; j++) {
              if (r.results[j].backdrop_path) items.push(item(r.results[j], kind, row[2]));
            }
            if (items.length) {
              c.rows.push({title: row[0], items: items});
              if (catalogs[kind] === c) c.update(c);
            }
            next();
          });
        }, function () { done(c.rows.length ? null : new Error('TMDB returned nothing')); });
      });
    });
  }

  // MARK: - Details: a title's page (cast, similar titles) and a person's (filmography)
  //
  // One TMDB request each (append_to_response), only when the page opens; what the pages show is kept 3 days (the 40
  // last pages, trimmed to what's drawn), so going back and forth costs nothing.

  var DETAIL_DAYS = 3, DETAIL_MAX = 100, CAST_MAX = 20, SIMILAR_MAX = 20, CREDITS_MAX = 60;
  // TV credits that are appearances as oneself (talk shows, news, reality, awards), not roles.
  var SELF_GENRES = [10767, 10763, 10764];
  var details = stored('details') || {};   // 'movie:1' | 'tv:2' | 'person:3' -> {at, lang, data}

  var DETAIL_VERSION = 2;   // raised when a page keeps more (2: a show's seasons)

  function cachedDetail(k) {
    var hit = details[k], t = Date.now();
    return hit && hit.v === DETAIL_VERSION && hit.lang === I18N.lang && t - hit.at < DETAIL_DAYS * 86400000 && t >= hit.at
        ? hit.data : null;
  }

  function keepDetail(k, data) {
    details[k] = {at: Date.now(), lang: I18N.lang, v: DETAIL_VERSION, data: data};
    var keys = Object.keys(details);
    if (keys.length > DETAIL_MAX) {
      keys.sort(function (a, b) { return details[a].at - details[b].at; });
      for (var i = 0; i < keys.length - DETAIL_MAX; i++) delete details[keys[i]];
    }
    store('details', details);
  }

  function dateOf(o) { return o.release_date || o.first_air_date || ''; }

  /** A title as the pages and rows draw it. */
  function brief(o, kind) {
    var date = dateOf(o);
    return {
      id: o.id, kind: kind, title: kind === 'movie' ? o.title : o.name,
      original: kind === 'movie' ? o.original_title : o.original_name,
      poster: o.poster_path || '', backdrop: o.backdrop_path || '', overview: o.overview || '',
      year: date ? date.slice(0, 4) : '', rating: o.vote_average || 0, genres: o.genre_ids || []
    };
  }

  /**
   * Similar titles: TMDB's recommendations first (what people who liked this one watched), then its similar titles;
   * each scored by that, by the genres it shares with this one and by its rating, without repeats or this title.
   */
  function rankSimilar(o, kind) {
    var mine = (o.genres || []).map(function (g) { return g.id; }), seen = {}, scored = [];
    seen[o.id] = true;
    function add(list, weight) {
      for (var i = 0; list && i < list.length; i++) {
        var x = list[i];
        if (seen[x.id] || !x.poster_path || (x.vote_count || 0) < 10) continue;
        seen[x.id] = true;
        var shared = 0;
        for (var g = 0; x.genre_ids && g < x.genre_ids.length; g++) if (mine.indexOf(x.genre_ids[g]) >= 0) shared++;
        scored.push({score: weight * 10 - i * 0.3 + shared * 3 + Math.min(x.vote_average || 0, 10) * 0.5, item: brief(x, kind)});
      }
    }
    add(o.recommendations && o.recommendations.results, 2);
    add(o.similar && o.similar.results, 1);
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, SIMILAR_MAX).map(function (s) { return s.item; });
  }

  /** A movie's or a show's page: done(err, data). */
  function titleDetails(kind, id, done) {
    var k = kind + ':' + id, hit = cachedDetail(k);
    if (hit) { done(null, hit); return; }
    if (!KEY) { done(new Error('no key')); return; }
    tmdb('/' + kind + '/' + id + '?language=' + lang() + '&append_to_response=credits,recommendations,similar', function (err, o) {
      if (err || !o || !o.id) { done(err || new Error('TMDB returned nothing')); return; }
      var b = brief(o, kind), credits = o.credits || {}, crew = credits.crew || [];
      b.genreNames = (o.genres || []).map(function (g) { return genre(g.name); });
      b.runtime = kind === 'movie' ? o.runtime || 0 : (o.episode_run_time && o.episode_run_time[0]) || 0;
      b.seasons = o.number_of_seasons || 0;
      // A show's seasons, without the specials (season 0): number, episodes, name.
      b.seasonList = (o.seasons || []).filter(function (s) { return s.season_number >= 1 && s.episode_count > 0; })
          .map(function (s) { return {n: s.season_number, count: s.episode_count, name: s.name || ''}; });
      b.directors = (kind === 'movie' ? crew.filter(function (c) { return c.job === 'Director'; }) : o.created_by || [])
          .map(function (c) { return c.name; }).slice(0, 3);
      b.cast = (credits.cast || []).slice(0, CAST_MAX).map(function (c) {
        return {id: c.id, name: c.name, character: c.character || '', profile: c.profile_path || ''};
      });
      b.similar = rankSimilar(o, kind);
      var finish = function () { keepDetail(k, b); done(null, b); };
      // Too few: the most popular titles of its two main genres, still never this one.
      var top = (o.genres || []).slice(0, 2).map(function (g) { return g.id; });
      if (b.similar.length >= 6 || !top.length) { finish(); return; }
      tmdb('/discover/' + kind + '?language=' + lang() + '&sort_by=popularity.desc&vote_count.gte=50&with_genres=' + top.join(','), function (e2, r) {
        var have = {};
        have[o.id] = true;
        for (var s = 0; s < b.similar.length; s++) have[b.similar[s].id] = true;
        for (var i = 0; !e2 && r && r.results && i < r.results.length && b.similar.length < SIMILAR_MAX; i++) {
          var x = r.results[i];
          if (!have[x.id] && x.poster_path) { have[x.id] = true; b.similar.push(brief(x, kind)); }
        }
        finish();
      });
    });
  }

  /** A season's episodes (number, title, story, still, minutes, air date): done(err, list). */
  function seasonDetails(tvId, n, done) {
    var k = 'season:' + tvId + ':' + n, hit = cachedDetail(k);
    if (hit) { done(null, hit); return; }
    if (!KEY) { done(new Error('no key')); return; }
    tmdb('/tv/' + tvId + '/season/' + n + '?language=' + lang(), function (err, o) {
      if (err || !o || !o.episodes) { done(err || new Error('TMDB returned nothing')); return; }
      var list = o.episodes.map(function (e) {
        return {n: e.episode_number, title: e.name || '', overview: e.overview || '', still: e.still_path || '',
          runtime: e.runtime || 0, air: e.air_date || ''};
      });
      keepDetail(k, list);
      done(null, list);
    });
  }

  // MARK: - Series progress: where each show was left, as the IPTV player reports it when Back returns here (apps
  // can't read each other's storage). By TMDB id: {title, at, eps: {'season:episode': {p, d, done}}}, the 50 last.

  var PROGRESS_MAX = 50;
  var progressAll = stored('progress') || {};

  /** The player's report ({tmdbId, title, episodes: [{season, episode, position, duration, done}]}), kept. */
  function recordProgress(report) {
    if (!report || !report.tmdbId || !report.episodes) return;
    var show = progressAll[report.tmdbId] || {title: report.title || '', eps: {}};
    for (var i = 0; i < report.episodes.length; i++) {
      var e = report.episodes[i];
      if (!(e.season >= 1 && e.episode >= 1)) continue;
      show.eps[e.season + ':' + e.episode] = {p: e.position || 0, d: e.duration || 0, done: !!e.done, at: Date.now()};
    }
    show.at = Date.now();
    progressAll[report.tmdbId] = show;
    var keys = Object.keys(progressAll);
    if (keys.length > PROGRESS_MAX) {
      keys.sort(function (a, b) { return progressAll[a].at - progressAll[b].at; });
      for (var j = 0; j < keys.length - PROGRESS_MAX; j++) delete progressAll[keys[j]];
    }
    store('progress', progressAll);
  }

  /** A show's progress: {eps: {'season:episode': {p, d, done}}}, or null when nothing was watched. */
  function progressOf(tvId) {
    var show = progressAll[tvId];
    return show && Object.keys(show.eps).length ? show : null;
  }

  /** A title's short form (for My list, whose items come from Trakt with ids only), kept like the pages. */
  function briefOf(kind, id) { return cachedDetail('brief:' + kind + ':' + id); }

  /** Fetches the short forms missing among items ({id, kind}), one after the other; done() at the end. */
  function loadBriefs(items, done) {
    var todo = items.filter(function (x) { return !briefOf(x.kind, x.id); });
    if (!KEY || !todo.length) { done(); return; }
    each(todo, function (x, next) {
      tmdb('/' + x.kind + '/' + x.id + '?language=' + lang(), function (err, o) {
        if (!err && o && o.id) {
          var b = brief(o, x.kind);
          b.genres = (o.genres || []).map(function (g) { return g.id; });
          keepDetail('brief:' + x.kind + ':' + x.id, b);
        }
        next();
      });
    }, done);
  }

  // A movie's progress as the IPTV player reports it (TMDB id -> {p, d, done, at}), the 200 last.
  var moviesSeen = stored('moviesSeen') || {};

  function recordMovie(report) {
    if (!report || !report.tmdbId || !report.movie) return;
    var m = report.movie;
    moviesSeen[report.tmdbId] = {p: m.position || 0, d: m.duration || 0, done: !!m.done, at: Date.now()};
    var keys = Object.keys(moviesSeen);
    if (keys.length > 200) {
      keys.sort(function (a, b) { return moviesSeen[a].at - moviesSeen[b].at; });
      delete moviesSeen[keys[0]];
    }
    store('moviesSeen', moviesSeen);
  }

  /** A person's credits of one kind, each title once (its roles together), the most relevant first. */
  function credits(list, kind, crew) {
    var byId = {}, out = [];
    for (var i = 0; list && i < list.length; i++) {
      var c = list[i];
      if (c.media_type !== kind) continue;
      if (!crew && kind === 'tv' && c.genre_ids && c.genre_ids.some(function (g) { return SELF_GENRES.indexOf(g) >= 0; })) continue;
      var role = crew ? c.job : c.character;
      if (byId[c.id]) {
        if (role && byId[c.id].role.indexOf(role) < 0) byId[c.id].role += ', ' + role;
        continue;
      }
      var b = brief(c, kind);
      b.role = role || '';
      b.popularity = c.popularity || 0;
      byId[c.id] = b;
      out.push(b);
    }
    out.sort(function (a, b) { return b.popularity - a.popularity || (b.year > a.year ? 1 : b.year < a.year ? -1 : 0); });
    return out.slice(0, CREDITS_MAX);
  }

  /** A person's page: done(err, data). */
  function personDetails(id, done) {
    var k = 'person:' + id, hit = cachedDetail(k);
    if (hit) { done(null, hit); return; }
    if (!KEY) { done(new Error('no key')); return; }
    tmdb('/person/' + id + '?language=' + lang() + '&append_to_response=combined_credits', function (err, o) {
      if (err || !o || !o.id) { done(err || new Error('TMDB returned nothing')); return; }
      var cc = o.combined_credits || {};
      var p = {
        id: o.id, name: o.name, profile: o.profile_path || '', biography: o.biography || '',
        birthday: o.birthday || '', deathday: o.deathday || '', place: o.place_of_birth || '',
        department: o.known_for_department || '',
        movies: credits(cc.cast, 'movie', false), shows: credits(cc.cast, 'tv', false),
        // Directing, writing, producing…: a title once, its jobs together; the ones also acted in stay in their row.
        work: credits((cc.crew || []), 'movie', true).concat(credits((cc.crew || []), 'tv', true)).slice(0, CREDITS_MAX)
      };
      var finish = function () { keepDetail(k, p); done(null, p); };
      if (p.biography || I18N.lang === 'en') { finish(); return; }
      // No biography in this language: the English one, when TMDB has it.
      tmdb('/person/' + id + '?language=en-US', function (e2, en) {
        if (!e2 && en && en.biography) { p.biography = en.biography; p.biographyLang = 'en'; }
        finish();
      });
    });
  }

  // MARK: - IMDb rating (OMDb, with the person's free key from config.properties): only the title the focus rests on
  // asks, and the answer is kept a week, so a tab never sends a request per title.

  var OMDB = (CONFIG.omdbKey || '').trim(), imdbCache = stored('imdb') || {};

  function omdb(query, done) {
    get('https://www.omdbapi.com/?apikey=' + encodeURIComponent(OMDB) + '&' + query, {}, function (err, o) {
      done(!err && o && o.imdbRating && o.imdbRating !== 'N/A' ? o.imdbRating : '');
    });
  }

  /** A title's IMDb rating ("7.8"): done(rating or null). TMDB's titles by their IMDb id; the provider's by name. */
  function imdbRating(p, done) {
    if (!OMDB || !p) { done(null); return; }
    var k = p.kind + ':' + p.id, hit = imdbCache[k];
    if (hit && Date.now() - hit.at < 7 * 86400000 && Date.now() >= hit.at) { done(hit.rating || null); return; }
    function keep(rating) {
      if (Object.keys(imdbCache).length > 300) imdbCache = {};
      imdbCache[k] = {rating: rating, at: Date.now()};
      store('imdb', imdbCache);
      done(rating || null);
    }
    if (p.streamId || p.seriesId) {
      omdb('t=' + encodeURIComponent(p.title) + (p.year ? '&y=' + p.year : '') + '&type=' + (p.kind === 'movie' ? 'movie' : 'series'), keep);
      return;
    }
    if (!KEY) { done(null); return; }
    tmdb('/' + p.kind + '/' + p.id + '/external_ids', function (err, ids) {
      if (err || !ids || !ids.imdb_id) { keep(''); return; }
      omdb('i=' + encodeURIComponent(ids.imdb_id), keep);
    });
  }

  /** The app on this TV a title is on: done(app or null). Known for the rows of one app; else TMDB is asked. */
  function whereToWatch(p, done) {
    if (p.app && appFor(p.app)) { done(appFor(p.app)); return; }
    if (!KEY) { done(null); return; }
    tmdb('/' + p.kind + '/' + p.id + '/watch/providers', function (err, o) {
      var here = !err && o.results && o.results[REGION], flat = here && here.flatrate;
      for (var i = 0; flat && i < flat.length; i++) {
        var s = service(flat[i].provider_name, flat[i].provider_id);
        if (s && appFor(s[1])) { p.app = s[1]; p.service = s[4]; done(appFor(s[1])); return; }
      }
      done(null);
    });
  }

  /** Photos for the screensaver: titles of the catalogs already loaded (or kept) that are on the TV's apps. */
  function showcase() {
    var out = [], seen = {}, kinds = ['movie', 'tv'];
    for (var k = 0; k < kinds.length; k++) {
      var c = catalogs[kinds[k]] || stored('catalog.' + kinds[k]);
      for (var r = 0; c && c.rows && r < c.rows.length; r++) {
        for (var i = 0; i < c.rows[r].items.length && i < 6; i++) {
          var p = c.rows[r].items[i];
          if (p.backdrop && p.app && !seen[p.kind + p.id]) { seen[p.kind + p.id] = true; out.push(p); }
        }
      }
    }
    return out;
  }

  // MARK: - Formatting

  return {
    city: Place.city,
    onChange: function (fn) { listeners.push(fn); },
    setApps: function (apps) { installed = apps; },
    appFor: appFor,
    refresh: refreshWeather,
    get weather() { return weather; },
    catalog: catalog,
    whereToWatch: whereToWatch,
    imdbRating: imdbRating,
    titleDetails: titleDetails,
    seasonDetails: seasonDetails,
    recordProgress: recordProgress,
    recordMovie: recordMovie,
    movieSeen: function (tmdbId) { return moviesSeen[tmdbId] || null; },
    briefOf: briefOf,
    loadBriefs: loadBriefs,
    progressOf: progressOf,
    personDetails: personDetails,
    showcase: showcase,
    image: function (path, size) {
      if (!path) return '';
      if (/^https?:\/\//i.test(path)) return path;   // Xtream posters/backdrops are full URLs
      return 'https://image.tmdb.org/t/p/' + (size || 'w1280') + path;
    },

    /** Night at the location: from sunset to sunrise (the last forecast; without one, 6:00 and 18:00). */
    isNight: function (at) {
      var theme = Prefs.theme();
      if (theme === 'dark') return true;
      if (theme === 'light') return false;
      var d = new Date(at), mins = d.getHours() * 60 + d.getMinutes();
      function hm(t, fallback) { if (!t) return fallback; var x = new Date(t); return x.getHours() * 60 + x.getMinutes(); }
      var rise = hm(weather && weather.sunrise, 360), set = hm(weather && weather.sunset, 1080);
      return mins < rise || mins >= set;
    },

    degrees: function (v) {
      if (v === undefined || v === null || isNaN(v)) return '—';
      var unit = Prefs.temperature();
      var f = unit === 'F' || (unit === 'auto' && Place.fahrenheit);
      return Math.round(f ? v * 9 / 5 + 32 : v) + '°';
    },
    /** "3 PM", "15:00", "15 Uhr": the hourly forecast. */
    hour: function (at) { return formatDate('format|h a', at); },
    /** "5:21 AM", "05:21": the clock, sunrise and sunset. */
    time: function (at) { return formatDate('format|h:mm a', at); },
    condition: function (code, day) {
      if (code === undefined || code === null || code < 0) return '';
      if (code === 0) return day ? tr('Clear') : tr('night|Clear');
      if (code === 1) return day ? tr('Mostly Sunny') : tr('Mostly Clear');
      if (code === 2) return tr('Partly Cloudy');
      if (code === 3) return tr('Cloudy');
      if (code === 45 || code === 48) return tr('Fog');
      if (code >= 51 && code <= 57) return tr('Drizzle');
      if (code === 65 || code === 67 || code === 82) return tr('Heavy Rain');
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) return tr('Snow');
      if (code >= 95) return tr('Thunderstorms');
      return tr('Rain');
    },
    symbol: function (code, day) {
      if (code <= 1) return day ? 'sunny' : 'clear_night';
      if (code === 2) return day ? 'partly_cloudy_day' : 'partly_cloudy_night';
      if (code === 3) return 'cloud';
      if (code === 45 || code === 48) return 'foggy';
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowflake';
      if (code >= 95) return 'thunderstorm';
      return 'rainy';
    }
  };
})();
