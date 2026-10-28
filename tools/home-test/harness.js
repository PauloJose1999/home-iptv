/*
 * Characterization tests of web/home.js, part 1: loaded first in the test copy of the app (tools/home_test.py). It
 * makes every run see the same world: a clean localStorage, a fixed clock (28/10/2026 15:00 UTC, moving on from
 * there), and fixed answers in place of the network (TMDB, ESPN, the sports files); anything else answers 404.
 * Test code only: it runs in desktop Chrome, never on the TV, so it isn't held to web/'s ES5 rule.
 */
(function () {
  'use strict';
  try { localStorage.clear(); } catch (e) {}
  // Script errors of the app, from the first line on: they go into the scenario's record.
  window.__homeTestErrors = [];
  window.addEventListener('error', function (e) { window.__homeTestErrors.push(String(e.message).slice(0, 160)); });

  // MARK: - The clock: a fixed start that moves on with (virtual) time.
  var RealDate = Date, startedAt = RealDate.now(), BASE = RealDate.UTC(2026, 9, 28, 15, 0, 0);
  function now() { return BASE + (RealDate.now() - startedAt); }
  function FakeDate() {
    if (!(this instanceof FakeDate)) return new RealDate(now()).toString();
    var args = Array.prototype.slice.call(arguments);
    return args.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(args)))() : new RealDate(now());
  }
  FakeDate.now = now;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  FakeDate.prototype = RealDate.prototype;
  window.Date = FakeDate;

  // MARK: - TMDB: a small, fixed catalog.
  function titles(kind, base, n) {
    var out = [];
    for (var i = 1; i <= n; i++) {
      var o = {id: base + i, overview: 'Sinopse fixa ' + (base + i) + '.', backdrop_path: '/b' + (base + i) + '.jpg',
        poster_path: '/p' + (base + i) + '.jpg', vote_average: 7 + i / 10, vote_count: 900, genre_ids: [18], popularity: 100 - i,
        media_type: kind};
      if (kind === 'movie') { o.title = 'Filme ' + (base + i); o.original_title = o.title; o.release_date = '2025-0' + i + '-10'; }
      else { o.name = 'Série ' + (base + i); o.original_name = o.name; o.first_air_date = '2024-0' + i + '-10'; }
      out.push(o);
    }
    return out;
  }

  function tmdb(path) {
    var m;
    if ((m = /^\/watch\/providers\/(movie|tv)/.exec(path))) {
      return {results: [{provider_id: 8, provider_name: 'Netflix'}, {provider_id: 119, provider_name: 'Amazon Prime Video'}]};
    }
    if (/^\/genre\/(movie|tv)\/list/.test(path)) {
      return {genres: [{id: 28, name: 'Ação'}, {id: 35, name: 'Comédia'}, {id: 18, name: 'Drama'}, {id: 10759, name: 'Action & Adventure'}]};
    }
    if ((m = /^\/discover\/(movie|tv)/.exec(path))) return {results: titles(m[1], m[1] === 'movie' ? 1000 : 2000, 6)};
    if ((m = /^\/tv\/(\d+)\/season\/(\d+)/.exec(path))) {
      var eps = [];
      for (var e = 1; e <= 3; e++) {
        eps.push({episode_number: e, name: 'Episódio ' + e + ' da temporada ' + m[2], overview: 'História do episódio ' + e + '.',
          still_path: '/s' + e + '.jpg', runtime: 45, air_date: '2024-02-0' + e});
      }
      return {episodes: eps};
    }
    if ((m = /^\/person\/(\d+)/.exec(path))) {
      var cast = titles('movie', 3000, 2).concat(titles('tv', 4000, 1));
      cast.forEach(function (c) { c.character = 'Papel'; });
      return {id: +m[1], name: 'Pessoa ' + m[1], profile_path: '/pp.jpg', biography: 'Biografia fixa.', birthday: '1970-05-20',
        place_of_birth: 'São Paulo, Brasil', known_for_department: 'Acting', combined_credits: {cast: cast, crew: []}};
    }
    if ((m = /^\/(movie|tv)\/(\d+)/.exec(path))) {
      var kind = m[1], id = +m[2], o = titles(kind, id - 1, 1)[0];
      o.genres = [{id: 18, name: 'Drama'}];
      o.runtime = 110;
      o.episode_run_time = [45];
      o.credits = {cast: [{id: 501, name: 'Atriz Um', character: 'Personagem Um', profile_path: '/a.jpg'},
        {id: 502, name: 'Ator Dois', character: 'Personagem Dois', profile_path: '/b.jpg'}],
        crew: [{job: 'Director', name: 'Diretora Fixa'}]};
      o.recommendations = {results: titles(kind, kind === 'movie' ? 5000 : 6000, 6)};
      o.similar = {results: []};
      if (kind === 'tv') {
        o.number_of_seasons = 2;
        o.created_by = [{name: 'Criador Fixo'}];
        o.seasons = [{season_number: 1, episode_count: 3, name: 'Temporada 1'}, {season_number: 2, episode_count: 3, name: 'Temporada 2'}];
      }
      return o;
    }
    return {results: []};
  }

  // MARK: - ESPN: two games of the Brasileirão today, nothing in the other leagues.
  function team(id, name, home) {
    return {homeAway: home ? 'home' : 'away', score: '0',
      team: {id: id, displayName: name, shortDisplayName: name, abbreviation: name.slice(0, 3).toUpperCase(), color: '1E3A8A', logo: ''}};
  }
  function espn(url) {
    if (url.indexOf('/soccer/bra.1/') < 0) return {events: []};
    var day = new RealDate(BASE);
    function game(id, h, home, away) {
      return {id: id, date: new RealDate(BASE + h * 3600000).toISOString(), name: home + ' x ' + away,
        status: {type: {state: 'pre', completed: false, name: 'STATUS_SCHEDULED', detail: ''}},
        competitions: [{competitors: [team(id + 'h', home, true), team(id + 'a', away, false)], broadcasts: [], geoBroadcasts: []}]};
    }
    return {day: day.toISOString(), events: [game('9001', 2, 'Flamengo', 'Palmeiras'), game('9002', 4, 'Corinthians', 'Santos')]};
  }

  function answer(url) {
    var m = /api\.themoviedb\.org\/3(\/[^?]*)/.exec(url);
    if (m) return [200, tmdb(m[1])];
    if (url.indexOf('site.api.espn.com/') >= 0) return [200, espn(url)];
    if (url.indexOf('broadcasts.json') >= 0) return [200, {schema: 1, updatedAt: '', events: {}}];
    return [404, ''];
  }

  // MARK: - XMLHttpRequest: answers from above, a moment later, as the network would.
  function FakeXHR() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.timeout = 0;
    this._url = '';
  }
  FakeXHR.prototype.open = function (method, url) { this._url = String(url); this.readyState = 1; };
  FakeXHR.prototype.setRequestHeader = function () {};
  FakeXHR.prototype.getResponseHeader = function () { return null; };
  FakeXHR.prototype.getAllResponseHeaders = function () { return ''; };
  FakeXHR.prototype.abort = function () { this._aborted = true; };
  FakeXHR.prototype.addEventListener = function (type, fn) { this['on' + type] = fn; };
  FakeXHR.prototype.send = function () {
    var self = this;
    setTimeout(function () {
      if (self._aborted) return;
      var a = answer(self._url);
      self.status = a[0];
      self.responseText = typeof a[1] === 'string' ? a[1] : JSON.stringify(a[1]);
      self.response = self.responseText;
      self.readyState = 4;
      if (self.onreadystatechange) self.onreadystatechange();
      if (self.onload) self.onload();
      if (self.onloadend) self.onloadend();
    }, 20);
  };
  window.XMLHttpRequest = FakeXHR;
  window.fetch = function () { return Promise.reject(new TypeError('no network in the tests')); };
})();
