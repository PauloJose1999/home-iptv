/*
 * Xtream VOD: the movies and series of the IPTV provider, shown in the Movies and Shows tabs instead of
 * the TMDB catalog when config.properties has an Xtream server (iptv_server, iptv_user, iptv_pass).
 * Each row is a category; OK on a title deep-links the IPTV player to its exact page (stream_id/series_id).
 * Fetched only when a tab is opened, one category at a time, so a huge VOD list never loads whole.
 * Plain ES5, like the rest of web/.
 */
var VOD = (function () {
  'use strict';

  var cfg = (window.CONFIG && CONFIG.iptv) || {};
  var server = (cfg.server || '').replace(/\/+$/, '');
  var enabled = !!(server && cfg.user && cfg.pass);
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
    var prev = catalogs[kind], t = Date.now();
    if (prev && prev.loading) { prev.update = update; update(prev); return; }
    if (prev && prev.rows.length && t - prev.at < 6 * 3600000) { prev.update = update; update(prev); return; }
    var fresh = {rows: [], at: t, loading: true, error: '', update: update};
    catalogs[kind] = fresh;
    if (prev && prev.rows.length) { prev.update = update; update(prev); }   // old rows until the new ones come
    else update(fresh);
    fetch(kind, function (err, rows) {
      fresh.loading = false;
      fresh.rows = rows.length ? rows : fresh.rows;
      if (err && !fresh.rows.length) fresh.error = err.message;
      fresh.update(fresh);
    });
  }

  function fetch(kind, done) {
    var catsAction = kind === 'movie' ? 'get_vod_categories' : 'get_series_categories';
    var streamsAction = kind === 'movie' ? 'get_vod_streams' : 'get_series';
    api(catsAction, function (err, cats) {
      if (err) { done(err, []); return; }
      var rows = [];
      var wanted = (cats || []).slice(0, MAX_ROWS);
      each(wanted, function (cat, next) {
        api(streamsAction + '&category_id=' + encodeURIComponent(cat.category_id), function (e2, list) {
          var items = [];
          for (var i = 0; !e2 && list && i < list.length && i < MAX_ITEMS; i++) {
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

  return {enabled: enabled, catalog: catalog};
})();
