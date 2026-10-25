/*
 * Xtream VOD: the movies and series of the IPTV provider, shown in the Movies and Shows tabs instead of
 * the TMDB catalog when config.properties has an Xtream server (iptv_server, iptv_user, iptv_pass).
 * Each row is a category; OK on a title deep-links the IPTV player to its exact page (stream_id/series_id).
 * Fetched only when a tab is opened, one category at a time, so a huge VOD list never loads whole.
 * Plain ES5, like the rest of web/.
 */
// Demo (browser preview only): open with ?demo=vod to see the VOD screen and the deep link without a real Xtream account.
var VOD_DEMO = (typeof TV !== 'undefined' && TV.name === 'browser') && /(?:^|[?&])demo=vod(?:&|$)/.test(window.location.search);

var VOD = (function () {
  'use strict';

  var cfg = (window.CONFIG && CONFIG.iptv) || {};
  var server = (cfg.server || '').replace(/\/+$/, '');
  var enabled = !!(server && cfg.user && cfg.pass) || VOD_DEMO;
  var catalogs = {};          // kind ('movie' | 'tv') -> catalog
  var MAX_ROWS = 12, MAX_ITEMS = 30;

  function get(url, done) {
    var x = new XMLHttpRequest(), over = false;
    x.open('GET', url, true);
    x.timeout = 20000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      if (x.status !== 200) { done(new Error('HTTP ' + x.status)); return; }
      var json;
      try { json = JSON.parse(x.responseText); } catch (e) { done(e); return; }
      done(null, json);
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; done(new Error('no connection')); } };
    x.send();
  }

  function api(action, done) {
    get(server + '/player_api.php?username=' + encodeURIComponent(cfg.user)
        + '&password=' + encodeURIComponent(cfg.pass) + '&action=' + action, done);
  }

  /** Runs fn on each item one after the other, then done(). */
  function each(list, fn, done) {
    var i = 0;
    (function next() {
      if (i >= list.length) { done(); return; }
      fn(list[i++], next);
    })();
  }

  /** The tab's catalog: {rows: [{title, items}], at, loading, error, update}, like Data.catalog. */
  function catalog(kind, update) {
    if (VOD_DEMO && !server) { update(sampleCatalog(kind)); return; }
    var prev = catalogs[kind], t = Date.now();
    if (prev && prev.loading) { prev.update = update; update(prev); return; }
    if (prev && prev.rows.length && t - prev.at < 6 * 3600000) { prev.update = update; update(prev); return; }
    var fresh = {rows: [], at: t, loading: true, error: '', update: update};
    catalogs[kind] = fresh;
    if (prev && prev.rows.length) { prev.update = update; update(prev); }   // old rows until the new ones come
    else update(fresh);
    load(kind, function (err, rows) {
      fresh.loading = false;
      fresh.rows = rows.length ? rows : fresh.rows;
      if (err && !fresh.rows.length) fresh.error = err.message;
      fresh.update(fresh);
    });
  }

  function load(kind, done) {
    var catsAction = kind === 'movie' ? 'get_vod_categories' : 'get_series_categories';
    var streamsAction = kind === 'movie' ? 'get_vod_streams' : 'get_series';
    api(catsAction, function (err, cats) {
      if (err) { done(err, []); return; }
      // A refused account answers with an object ({user_info: {auth: 0}}), not the list of categories.
      if (Object.prototype.toString.call(cats) !== '[object Array]') { done(new Error('the provider refused the account'), []); return; }
      var rows = [];
      var wanted = cats.slice(0, MAX_ROWS);
      each(wanted, function (cat, next) {
        api(streamsAction + '&category_id=' + encodeURIComponent(cat.category_id), function (e2, list) {
          var items = [];
          var ok = !e2 && Object.prototype.toString.call(list) === '[object Array]';
          for (var i = 0; ok && i < list.length && i < MAX_ITEMS; i++) {
            items.push(item(kind, list[i], cat.category_name));
          }
          if (items.length) rows.push({title: cat.category_name, items: items});
          next();
        });
      }, function () { done(rows.length ? null : new Error('the provider returned no titles'), rows); });
    });
  }

  function item(kind, s, categoryName) {
    if (kind === 'movie') {
      return {
        id: 'vod' + s.stream_id, kind: 'movie', title: s.name,
        backdrop: s.stream_icon || '', poster: s.stream_icon || '',
        overview: '', year: '', rating: parseFloat(s.rating) || 0,
        genres: [categoryName], service: 'IPTV',
        streamId: String(s.stream_id), categoryId: String(s.category_id),
        containerExtension: s.container_extension || 'mp4'
      };
    }
    return {
      id: 'ser' + s.series_id, kind: 'tv', title: s.name,
      backdrop: s.cover || '', poster: s.cover || '',
      overview: s.plot || '', year: (s.releaseDate || '').slice(0, 4),
      rating: parseFloat(s.rating) || 0, genres: [categoryName], service: 'IPTV',
      seriesId: String(s.series_id), categoryId: String(s.category_id)
    };
  }

  /** Sample rows for the browser preview (?demo=vod): the VOD screen without a real provider. */
  function sampleCatalog(kind) {
    var cats = kind === 'movie' ? ['Ação', 'Comédia', 'Drama', 'Ficção Científica'] : ['Séries em Alta', 'Documentários', 'Dramas'];
    var rows = [];
    for (var r = 0; r < cats.length; r++) {
      var items = [];
      for (var i = 1; i <= 8; i++) {
        var id = String(r * 100 + i);
        var poster = 'https://picsum.photos/seed/' + (kind === 'movie' ? 'vod' : 'ser') + id + '/400/600';
        var it = {
          id: (kind === 'movie' ? 'vod' : 'ser') + id,
          kind: kind,
          title: (kind === 'movie' ? 'Filme' : 'Série') + ' ' + (r + 1) + '.' + i,
          backdrop: poster, poster: poster,
          overview: 'Demonstração do modo VOD (' + cats[r] + '). Sem provedor Xtream configurado.',
          year: String(2018 + r), rating: 7 + (i % 3),
          genres: [cats[r]], service: 'IPTV (demo)',
          categoryId: String(r + 1), containerExtension: 'mp4'
        };
        if (kind === 'movie') it.streamId = id; else it.seriesId = id;
        items.push(it);
      }
      rows.push({title: cats[r], items: items});
    }
    return {rows: rows, at: Date.now(), loading: false, error: ''};
  }

  return {enabled: enabled, catalog: catalog};
})();
