/*
 * Trakt.tv: the account's watched history, the episodes seen of each show, and its watchlist ("My list").
 *
 * Sign-in is Trakt's device flow (a code shown on the TV, typed at trakt.tv/activate on a phone), with only the app's
 * client id (trakt_client_id in config.properties): Trakt deprecated the client secret and asks apps never to ship it.
 * The tokens (7 days, then refreshed) stay in this app's localStorage, which is not encrypted: webOS gives a Developer
 * Mode app no keystore. Disconnecting revokes the token at Trakt and forgets it, the history and the list.
 *
 * Reading: /sync/last_activities first, then only what changed (/sync/watched/{shows,movies}, the watchlist, page by
 * page). Writing: a finished episode or movie (as the IPTV player reports it, never one only opened) goes to a queue
 * kept in localStorage, sent to /sync/history when Trakt answers. Trakt doesn't refuse duplicate plays, so a send
 * whose answer was lost is checked against Trakt's history (re-read) before it's sent again.
 * One request at a time, a POST at most each second (Trakt's limit); a 429 waits its Retry-After.
 * Plain ES5, like the rest of web/.
 */
var Trakt = (function () {
  'use strict';

  var cfg = (window.CONFIG && CONFIG.trakt) || {};
  var ID = cfg.id || '', API = (cfg.api || 'https://api.trakt.tv').replace(/\/+$/, '');
  var AUTH = 'fmtv.trakt', DATA = 'fmtv.traktdata', QUEUE = 'fmtv.traktqueue', SENT = 'fmtv.traktsent';
  var PAGE = 50, SYNC_EVERY = 15 * 60000;

  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function save(key, value) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function blank() { return {shows: {}, movies: {}, watchlist: {movie: [], tv: []}, activities: null, syncedAt: 0}; }

  var auth = load(AUTH, null);   // {access, refresh, expiresAt, user}
  var data = load(DATA, blank());   // shows: {tmdb: {'s:e': watched ms}}, movies: {tmdb: watched ms}, watchlist
  var queue = load(QUEUE, []);   // [{key, kind: 'movie'|'episode', tmdb, season, episode, at (ISO), tried}]
  var sent = load(SENT, []);   // the keys of the plays already in Trakt's history (the 300 last): never sent again
  var status = {syncing: false, error: ''};
  var listeners = [];

  function changed() { for (var i = 0; i < listeners.length; i++) listeners[i](); }

  // MARK: - Requests: one at a time

  var busy = false, jobs = [];

  /** done(status, json, xhr): status 0 is no connection. */
  function request(method, path, body, authed, done, opts) {
    jobs.push({method: method, path: path, body: body, authed: authed, done: done, opts: opts || {}});
    pump();
  }

  function pump() {
    if (busy || !jobs.length) return;
    busy = true;
    send(jobs.shift(), 0);
  }

  function send(job, tries) {
    var x = new XMLHttpRequest(), over = false;
    x.open(job.method, API + job.path, true);
    x.timeout = 20000;
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('trakt-api-version', '2');
    x.setRequestHeader('trakt-api-key', ID);
    if (job.authed && auth) x.setRequestHeader('Authorization', 'Bearer ' + auth.access);
    function end() {
      if (over) return;
      over = true;
      var s = x.status;
      // Too many requests: wait as long as Trakt says; a dropped connection or a server error: a little, twice.
      if (s === 429 && !job.opts.noRetry && tries < 3) {
        setTimeout(function () { send(job, tries + 1); }, (parseInt(x.getResponseHeader('Retry-After'), 10) || 10) * 1000);
        return;
      }
      if ((s === 0 || s >= 500) && job.method === 'GET' && tries < 2) {
        setTimeout(function () { send(job, tries + 1); }, 3000 * (tries + 1));
        return;
      }
      var json = null;
      try { json = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) {}
      try { job.done(s, json, x); } catch (e) {}
      setTimeout(function () { busy = false; pump(); }, job.method === 'GET' ? 0 : 1000);   // POSTs: 1 a second
    }
    x.onloadend = end;
    x.ontimeout = x.onerror = end;
    try { x.send(job.body ? JSON.stringify(job.body) : null); } catch (e) { end(); }
  }

  // MARK: - Tokens

  function keep(t) {
    auth = {access: t.access_token, refresh: t.refresh_token,
      expiresAt: ((t.created_at || Date.now() / 1000) + (t.expires_in || 604800)) * 1000, user: auth ? auth.user : ''};
    save(AUTH, auth);
  }

  /** A fresh access token (refreshed a minute before it ends): done(ok). */
  function fresh(done) {
    if (!auth) { done(false); return; }
    if (Date.now() < auth.expiresAt - 60000) { done(true); return; }
    request('POST', '/oauth/token', {refresh_token: auth.refresh, client_id: ID, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      grant_type: 'refresh_token'}, false, function (s, t) {
      if (s === 200 && t && t.access_token) { keep(t); done(true); return; }
      // Refused (revoked at trakt.tv, or a refresh token already used): signed out, the local history stays.
      if (s === 400 || s === 401) forget('expired');
      done(false);
    });
  }

  /** An authorized call: a stale token is refreshed first, a 401 once more. */
  function api(method, path, body, done, retried) {
    fresh(function (ok) {
      if (!ok) { done(401, null); return; }
      request(method, path, body, true, function (s, json, x) {
        if (s === 401 && !retried && auth) { auth.expiresAt = 0; api(method, path, body, done, true); return; }
        done(s, json, x);
      });
    });
  }

  // MARK: - Device sign-in

  var flow = null;

  /**
   * Starts the sign-in; update({state: 'code', code, url, until} | {state: 'done'} | {state: 'expired' | 'denied' |
   * 'error'}) as it goes. Polls at Trakt's interval (slower after a 429) and stops when the code expires.
   */
  function connect(update) {
    cancel();
    var mine = flow = {timer: 0};
    request('POST', '/oauth/device/code', {client_id: ID}, false, function (s, c) {
      if (flow !== mine) return;
      if (s !== 200 || !c || !c.device_code) { update({state: 'error', status: s}); return; }
      var interval = (c.interval || 5) * 1000, until = Date.now() + (c.expires_in || 600) * 1000;
      update({state: 'code', code: c.user_code, url: c.verification_url, until: until});
      (function poll() {
        mine.timer = setTimeout(function () {
          if (flow !== mine) return;
          if (Date.now() > until) { flow = null; update({state: 'expired'}); return; }
          request('POST', '/oauth/device/token', {code: c.device_code, client_id: ID}, false, function (t, tokens) {
            if (flow !== mine) return;
            if (t === 200 && tokens && tokens.access_token) {
              flow = null;
              keep(tokens);
              api('GET', '/users/settings', null, function (u, settings) {
                if (u === 200 && settings && settings.user) { auth.user = settings.user.username || settings.user.name || ''; save(AUTH, auth); }
                update({state: 'done'});
                changed();
                sync(true);
              });
              return;
            }
            if (t === 400) { poll(); return; }   // not authorized yet
            if (t === 429) { interval += 5000; poll(); return; }   // polling too fast
            if (t === 0) { poll(); return; }   // no connection: keep trying until the code expires
            flow = null;
            update({state: t === 410 ? 'expired' : t === 418 ? 'denied' : 'error', status: t});
          }, {noRetry: true});
        }, interval);
      })();
    }, {noRetry: true});
  }

  function cancel() {
    if (flow) clearTimeout(flow.timer);
    flow = null;
  }

  /** Signed out: the token revoked at Trakt (when it answers), then forgotten with what came from Trakt. */
  function disconnect(done) {
    cancel();
    var token = auth && auth.access;
    forget('');
    if (!token) { if (done) done(); return; }
    request('POST', '/oauth/revoke', {token: token, client_id: ID}, false, function () { if (done) done(); }, {noRetry: true});
  }

  function forget(error) {
    auth = null;
    data = blank();
    queue = [];
    sent = [];
    save(AUTH, null);
    save(DATA, null);
    save(QUEUE, null);
    save(SENT, null);
    status.error = error;
    changed();
  }

  // MARK: - Reading the account

  function ms(iso) { var t = Date.parse(iso || ''); return isNaN(t) ? 0 : t; }

  /** Each show's watched episodes (by TMDB id), from a re-watch's start when the show has one. */
  function pullShows(done) {
    api('GET', '/sync/watched/shows', null, function (s, list) {
      if (s !== 200 || !list || typeof list.length !== 'number') { done(false); return; }
      var shows = {};
      for (var i = 0; i < list.length; i++) {
        var w = list[i], tmdb = w.show && w.show.ids && w.show.ids.tmdb, reset = ms(w.reset_at);
        if (!tmdb) continue;   // no TMDB id: not matched by name, left out
        var eps = {};
        for (var j = 0; w.seasons && j < w.seasons.length; j++) {
          var season = w.seasons[j];
          for (var k = 0; season.episodes && k < season.episodes.length; k++) {
            var at = ms(season.episodes[k].last_watched_at);
            if (at >= reset) eps[season.number + ':' + season.episodes[k].number] = at;
          }
        }
        shows[tmdb] = eps;
      }
      data.shows = shows;   // the whole list (not paged): it replaces the old one
      done(true);
    });
  }

  function pullMovies(done) {
    api('GET', '/sync/watched/movies', null, function (s, list) {
      if (s !== 200 || !list || typeof list.length !== 'number') { done(false); return; }
      var movies = {};
      for (var i = 0; i < list.length; i++) {
        var tmdb = list[i].movie && list[i].movie.ids && list[i].movie.ids.tmdb;
        if (tmdb) movies[tmdb] = ms(list[i].last_watched_at);
      }
      data.movies = movies;
      done(true);
    });
  }

  /** The watchlist of one kind, page by page; kept only when every page came (a missing page drops nothing). */
  function pullList(kind, done) {
    var items = [], type = kind === 'movie' ? 'movies' : 'shows', what = kind === 'movie' ? 'movie' : 'show';
    (function page(n) {
      api('GET', '/sync/watchlist/' + type + '/added/desc?page=' + n + '&limit=' + PAGE, null, function (s, list, x) {
        if (s !== 200 || !list || typeof list.length !== 'number') { done(false); return; }
        for (var i = 0; i < list.length; i++) {
          var o = list[i][what], tmdb = o && o.ids && o.ids.tmdb;
          if (tmdb) items.push({id: tmdb, kind: kind, title: o.title || '', year: o.year ? String(o.year) : ''});
        }
        var pages = parseInt(x && x.getResponseHeader('X-Pagination-Page-Count'), 10) || 1;
        if (n < pages && n < 20) { page(n + 1); return; }
        data.watchlist[kind] = items;
        done(true);
      });
    })(1);
  }

  /** Brings the account up to date: only what /sync/last_activities says changed, unless forced. Then sends the queue. */
  function sync(force, done) {
    done = done || function () {};
    if (!auth || status.syncing) { done(false); return; }
    status.syncing = true;
    status.error = '';
    changed();
    api('GET', '/sync/last_activities', null, function (s, act) {
      if (s !== 200 || !act) { finish(s === 0 ? 'offline' : 'error'); return; }
      var old = data.activities || {}, steps = [];
      function moved(a, b) { return !old[a] || !act[a] || old[a][b] !== act[a][b]; }
      // A send whose answer was lost makes the history worth re-reading before it goes again.
      var lost = queue.some(function (q) { return q.tried; });
      if (force || lost || moved('episodes', 'watched_at')) steps.push(pullShows);
      if (force || lost || moved('movies', 'watched_at')) steps.push(pullMovies);
      if (force || moved('movies', 'watchlisted_at')) steps.push(function (d) { pullList('movie', d); });
      if (force || moved('shows', 'watchlisted_at')) steps.push(function (d) { pullList('tv', d); });
      var failed = false;
      (function next(i) {
        if (i < steps.length) { steps[i](function (ok) { failed = failed || !ok; next(i + 1); }); return; }
        if (!failed) data.activities = act;   // a partial read is read again next time
        data.syncedAt = Date.now();
        save(DATA, data);
        push(function () { finish(failed ? 'error' : ''); });
      })(0);
    });
    function finish(error) {
      status.syncing = false;
      status.error = error;
      changed();
      done(!error);
    }
  }

  // MARK: - Writing the history

  function remote(q) {
    var at = ms(q.at) - 1000;
    if (q.kind === 'movie') return (data.movies[q.tmdb] || 0) >= at;
    var show = data.shows[q.tmdb];
    return !!show && (show[q.season + ':' + q.episode] || 0) >= at;
  }

  var pushing = false, again = false;

  /** Sends the queue to /sync/history; what Trakt already has (an answer lost) leaves the queue unsent. One at a time. */
  function push(done) {
    done = done || function () {};
    if (pushing) { again = true; done(); return; }
    if (!auth || !queue.length) { done(); return; }
    var body = {movies: [], shows: []}, shows = {}, batch = [];
    queue = queue.filter(function (q) { if (remote(q)) { done1(q.key); return false; } return true; });
    for (var i = 0; i < queue.length; i++) {
      var q = queue[i];
      if (q.kind === 'movie') body.movies.push({ids: {tmdb: q.tmdb}, watched_at: q.at});
      else {
        var show = shows[q.tmdb];
        if (!show) { show = shows[q.tmdb] = {ids: {tmdb: q.tmdb}, seasons: []}; body.shows.push(show); }
        var season = null;
        for (var j = 0; j < show.seasons.length; j++) if (show.seasons[j].number === q.season) season = show.seasons[j];
        if (!season) { season = {number: q.season, episodes: []}; show.seasons.push(season); }
        season.episodes.push({number: q.episode, watched_at: q.at});
      }
      q.tried = true;
      batch.push(q);
    }
    save(QUEUE, queue);
    if (!batch.length) { done(); return; }
    pushing = true;
    api('POST', '/sync/history', body, function (s) {
      pushing = false;
      if (s === 201 || s === 200) {
        queue = queue.filter(function (q) { return batch.indexOf(q) < 0; });
        for (var k = 0; k < batch.length; k++) {
          var q2 = batch[k];
          done1(q2.key);
          if (q2.kind === 'movie') data.movies[q2.tmdb] = ms(q2.at);
          else (data.shows[q2.tmdb] = data.shows[q2.tmdb] || {})[q2.season + ':' + q2.episode] = ms(q2.at);
        }
        save(DATA, data);
        changed();
      }
      // Otherwise they stay queued, marked tried: the next sync re-reads the history before sending them again.
      save(QUEUE, queue);
      done();
      if (again) { again = false; push(); }
    });
  }

  function done1(key) {
    if (sent.indexOf(key) < 0) sent.push(key);
    if (sent.length > 300) sent = sent.slice(-300);
    save(SENT, sent);
  }

  /**
   * A finished movie or episode (item.at: when it ended, as the player saw it): queued and sent once. The same end
   * reported again is the same key, so never a second play; a later end (a re-watch) is a new one. Not signed in:
   * nothing (the local history keeps it).
   */
  function watched(item) {
    if (!auth || !item || !item.tmdb) return;
    if (item.kind === 'episode' && !(item.season >= 1 && item.episode >= 1)) return;   // specials (season 0): left out
    var at = new Date(item.at || Date.now()).toISOString().replace(/\.\d+Z$/, '.000Z');
    var key = item.kind + ':' + item.tmdb + (item.kind === 'episode' ? ':' + item.season + ':' + item.episode : '') + '@' + at;
    if (sent.indexOf(key) >= 0) return;
    for (var i = 0; i < queue.length; i++) if (queue[i].key === key) return;
    queue.push({key: key, kind: item.kind, tmdb: +item.tmdb, season: item.season, episode: item.episode, at: at});
    save(QUEUE, queue);
    // A send left without an answer: the history is read again first (sync), so it isn't sent twice.
    if (!status.syncing) {
      if (queue.some(function (q) { return q.tried; })) sync(false); else push();
    }
  }

  // MARK: - The watchlist

  function listed(kind, tmdb) {
    var list = data.watchlist[kind] || [];
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(tmdb)) return true;
    return false;
  }

  /** Adds or removes a title; done(ok, why): changed here only once Trakt confirms. */
  function setListed(item, on, done) {
    if (!auth) { done(false, 'signed out'); return; }
    var type = item.kind === 'movie' ? 'movies' : 'shows', body = {};
    body[type] = [{ids: {tmdb: +item.id}}];
    api('POST', on ? '/sync/watchlist' : '/sync/watchlist/remove', body, function (s) {
      if (s !== 200 && s !== 201) { done(false, s === 420 ? 'limit' : s === 0 ? 'offline' : 'error'); return; }
      var list = (data.watchlist[item.kind] || []).filter(function (x) { return String(x.id) !== String(item.id); });
      if (on) list.unshift({id: +item.id, kind: item.kind, title: item.title || '', year: item.year || ''});
      data.watchlist[item.kind] = list;
      save(DATA, data);
      changed();
      done(true);
    });
  }

  return {
    configured: !!ID,
    connected: function () { return !!auth; },
    user: function () { return auth ? auth.user : ''; },
    status: function () { return {syncing: status.syncing, error: status.error, syncedAt: data.syncedAt, pending: queue.length}; },
    onChange: function (fn) { listeners.push(fn); },
    connect: connect,
    cancel: cancel,
    disconnect: disconnect,
    sync: sync,
    /** Syncs when the last one is older than 15 minutes (opening Movies or Shows, the app coming back). */
    syncIfStale: function () { if (auth && Date.now() - data.syncedAt > SYNC_EVERY) sync(false); },
    watched: watched,
    /** A show's episodes watched at Trakt: {'season:episode': ms}, or null. */
    showEpisodes: function (tmdb) { return auth ? data.shows[tmdb] || null : null; },
    movieWatched: function (tmdb) { return !!(auth && data.movies[tmdb]); },
    watchlist: function (kind) { return auth ? data.watchlist[kind] || [] : []; },
    listed: function (kind, tmdb) { return !!auth && listed(kind, tmdb); },
    setListed: setListed
  };
})();
