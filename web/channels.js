/*
 * The IPTV channels the home screen shows (the channel card, All channels, Sports): read from the lists set up in the
 * IPTV player, the one place the account lives. Apps can't read each other's storage, so the player hands its lists
 * over each time it opens this app again (launch params, `iptv`), and they're kept here (fmtv.iptvSources). Each is an
 * Xtream account (its live channels and their categories) or an M3U link. Nothing plays here: a channel opens in the
 * IPTV player.
 * Plain ES5, like the rest of web/.
 */
var Channels = (function () {
  'use strict';

  var KEY = 'fmtv.iptvSources';
  var sources = [];   // [{type: 'xtream' | 'm3u', name, url, user, pass}]
  try { sources = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
  var list = [], loading = false, loaded = false, waiting = [], failed = '';

  function request(url, done) {
    var x = new XMLHttpRequest(), over = false;
    x.open('GET', url, true);
    x.timeout = 20000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      if (x.status !== 200) done('HTTP ' + x.status);
      else done(null, x.responseText);
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; done('no connection'); } };
    x.send();
  }

  /** An M3U playlist: each #EXTINF line, with its logo and group, and the address on the next line. */
  function parseM3u(text) {
    var out = [], lines = text.split(/\r?\n/), info = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^\s+|\s+$/g, '');
      if (line.indexOf('#EXTINF') === 0) {
        var attr = function (name) { var m = new RegExp(name + '="([^"]*)"').exec(line); return m ? m[1] : ''; };
        var comma = line.lastIndexOf(',');
        info = {name: comma >= 0 ? line.slice(comma + 1) : attr('tvg-name'), logo: attr('tvg-logo'), group: attr('group-title') || ''};
      } else if (line && line.charAt(0) !== '#' && info) {
        info.url = line;
        out.push(info);
        info = null;
      }
    }
    return out;
  }

  /** An Xtream account's live channels, with their category as the group. */
  function xtream(src, done) {
    var server = (src.url || '').replace(/\/+$/, '');
    var base = server + '/player_api.php?username=' + encodeURIComponent(src.user) + '&password=' + encodeURIComponent(src.pass);
    request(base + '&action=get_live_categories', function (err, text) {
      var names = {};
      if (!err) {
        try {
          var cats = JSON.parse(text);
          for (var i = 0; i < cats.length; i++) names[cats[i].category_id] = cats[i].category_name;
        } catch (e) {}
      }
      request(base + '&action=get_live_streams', function (err2, text2) {
        if (err2) { done(err2, []); return; }
        var streams;
        try { streams = JSON.parse(text2); } catch (e) { done('the server did not answer with a list', []); return; }
        if (Object.prototype.toString.call(streams) !== '[object Array]') { done('the provider refused the account', []); return; }
        var out = [];
        for (var j = 0; j < streams.length; j++) {
          var s = streams[j];
          out.push({name: s.name || '', logo: s.stream_icon || '', group: names[s.category_id] || '', id: String(s.stream_id),
            url: server + '/live/' + encodeURIComponent(src.user) + '/' + encodeURIComponent(src.pass) + '/' + s.stream_id + '.m3u8'});
        }
        done(null, out);
      });
    });
  }

  function loadOne(src, done) {
    if (src.type === 'xtream') { xtream(src, done); return; }
    request(src.url, function (err, text) { done(err, err ? [] : parseM3u(text)); });
  }

  /** Every list's channels, one list after the other; done() once they're in (or failed: `failed` says why). */
  function load(done) {
    if (done) waiting.push(done);
    if (loaded || loading) { if (loaded) flush(); return; }
    loading = true;
    var all = [], errors = [], i = 0;
    (function next() {
      if (i >= sources.length) {
        loading = false;
        loaded = true;
        list = all;
        failed = all.length ? '' : errors.length ? errors[0] : '';
        flush();
        return;
      }
      loadOne(sources[i++], function (err, channels) {
        if (err) errors.push(err);
        all = all.concat(channels || []);
        next();
      });
    })();
  }

  function flush() {
    var w = waiting;
    waiting = [];
    for (var i = 0; i < w.length; i++) w[i]();
  }

  /** A channel's name, to compare: lower case, letters and digits only, without HD/SD/FHD/4K. */
  function plain(x) {
    return (x || '').toLowerCase().replace(/\b(f?hd|sd|4k|uhd)\b/g, '').replace(/[^a-z0-9]/g, '');
  }

  /** The list's channel for a name ("GloboNews"): the one that is that name, else the shortest that contains it. */
  function lookup(name) {
    var needle = plain(name), best = null;
    if (!needle) return null;
    for (var i = 0; i < list.length; i++) {
      var n = plain(list[i].name);
      if (n.indexOf(needle) < 0) continue;
      if (n === needle) return list[i];
      if (!best || n.length < plain(best.name).length) best = list[i];
    }
    return best;
  }

  return {
    /** Whether the IPTV player has handed its lists over (an empty answer counts: it has none). */
    known: function () { try { return localStorage.getItem(KEY) !== null; } catch (e) { return sources.length > 0; } },
    /** How many lists there are. */
    count: function () { return sources.length; },
    /** The player's lists, as it sent them; reloaded when they changed. True when they did. */
    setSources: function (next) {
      next = Object.prototype.toString.call(next) === '[object Array]' ? next : [];
      var changed = JSON.stringify(next) !== JSON.stringify(sources) || !this.known();
      sources = next;
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
      if (changed) { list = []; loaded = false; }
      return changed;
    },
    /** The first Xtream account ({url, user, pass}), or null. */
    xtream: function () {
      for (var i = 0; i < sources.length; i++) if (sources[i].type === 'xtream') return sources[i];
      return null;
    },
    load: load,
    lookup: lookup,
    /** Every channel of the lists (after load): {name, logo, group, url, id?}. */
    channels: function () { return list; },
    /** Why there are no channels after load: '' (none set up, or simply none), or the first list's error. */
    error: function () { return failed; }
  };
})();
