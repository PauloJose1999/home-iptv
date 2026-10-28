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
  // Each M3U list's guide addresses (XMLTV): the ones its #EXTM3U line declares (url-tvg), by the list's id or address.
  var declaredGuides = {};

  function request(url, done, timeout) {
    var x = new XMLHttpRequest(), over = false;
    x.open('GET', url, true);
    x.timeout = timeout || 20000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      if (x.status !== 200) done('HTTP ' + x.status);
      else done(null, x.responseText);
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; done('no connection'); } };
    x.send();
  }

  function listKey(src) { return (src && (src.id || src.url)) || ''; }

  /** The guide addresses an #EXTM3U line declares (url-tvg, x-tvg-url, tvg-url; several, comma separated). */
  function headerGuides(line) {
    var out = [], names = ['url-tvg', 'x-tvg-url', 'tvg-url'];
    for (var n = 0; n < names.length; n++) {
      var m = new RegExp(names[n] + '="([^"]*)"', 'i').exec(line);
      var parts = m ? m[1].split(',') : [];
      for (var k = 0; k < parts.length; k++) {
        var url = parts[k].replace(/^\s+|\s+$/g, '');
        if (/^https?:\/\//i.test(url) && out.indexOf(url) < 0) out.push(url);
      }
    }
    return out;
  }

  /** An M3U playlist: each #EXTINF line, with its logo and group, and the address on the next line. */
  function parseM3u(text, src) {
    var out = [], lines = text.split(/\r?\n/), info = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^\s+|\s+$/g, '');
      if (line.indexOf('#EXTM3U') === 0) { declaredGuides[listKey(src)] = headerGuides(line); continue; }
      if (line.indexOf('#EXTINF') === 0) {
        var attr = function (name) { var m = new RegExp(name + '="([^"]*)"').exec(line); return m ? m[1] : ''; };
        var comma = line.lastIndexOf(',');
        info = {name: comma >= 0 ? line.slice(comma + 1) : attr('tvg-name'), logo: attr('tvg-logo'), group: attr('group-title') || '',
          tvgId: attr('tvg-id'), tvgName: attr('tvg-name'), sourceId: src.id || '', sourceType: 'm3u', list: src};
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
          // `source` and `id` say which channel this is, as the IPTV player reads the same account: the server and the
          // provider's stream_id (never the user or the password).
          out.push({name: s.name || '', logo: s.stream_icon || '', group: names[s.category_id] || '', id: String(s.stream_id),
            streamId: String(s.stream_id), sourceId: src.id || '', sourceType: 'xtream', source: server, list: src,
            url: server + '/live/' + encodeURIComponent(src.user) + '/' + encodeURIComponent(src.pass) + '/' + s.stream_id + '.m3u8'});
        }
        done(null, out);
      });
    });
  }

  function loadOne(src, done) {
    if (src.type === 'xtream') { xtream(src, done); return; }
    request(src.url, function (err, text) { done(err, err ? [] : parseM3u(text, src)); });
  }

  /** A short text hash (FNV-1a), so an M3U address, which may hold a password, isn't kept or compared in full. */
  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /**
   * Which channel this is, the same tomorrow and in the IPTV player: an Xtream channel by its server and stream_id, an
   * M3U one by its address. Never by name: two lists can both have an "ESPN".
   */
  function identity(ch) {
    if (!ch) return '';
    if (ch.sourceType === 'xtream' && ch.sourceId && ch.streamId) return 'x:' + ch.sourceId + '#' + ch.streamId;
    if (ch.sourceType === 'm3u' && ch.sourceId && ch.url) return 'm:' + ch.sourceId + '#' + hash(ch.url.split('#')[0]);
    return 'u:' + hash((ch.url || '').split('#')[0]);
  }

  /** The deep link's fields that let the IPTV player open exactly this channel of its own lists. */
  function linkFor(ch) {
    var out = {url: ch.url, logo: ch.logo || '', sourceId: ch.sourceId || '', sourceType: ch.sourceType || ''};
    if (ch.sourceType === 'xtream' && ch.streamId) out.streamId = ch.streamId;
    if (ch.sourceType === 'm3u') out.channelUrl = ch.url;
    return out;
  }

  var guides = {}, GUIDE_KEEP_MS = 10 * 60000;

  function decode(text) {
    try { return decodeURIComponent(escape(atob(text || ''))); } catch (e) { return text || ''; }
  }

  /** What an Xtream channel shows now and next (get_short_epg), as guide() returns it. */
  function xtreamGuide(ch, done) {
    var key = identity(ch), had = guides[key];
    if (had && Date.now() - had.at < GUIDE_KEEP_MS) { done(had.items); return; }
    var src = ch.list, server = (src.url || '').replace(/\/+$/, '');
    request(server + '/player_api.php?username=' + encodeURIComponent(src.user) + '&password=' + encodeURIComponent(src.pass) +
        '&action=get_short_epg&limit=6&stream_id=' + encodeURIComponent(ch.streamId || ch.id), function (err, text) {
      if (err) { done(null); return; }
      var items = [], json;
      try { json = JSON.parse(text); } catch (e) { done(null); return; }
      var list = (json && json.epg_listings) || [];
      for (var i = 0; i < list.length; i++) {
        var start = +list[i].start_timestamp * 1000, stop = +list[i].stop_timestamp * 1000;
        if (isNaN(start) || isNaN(stop)) continue;
        items.push({title: decode(list[i].title) + ' ' + decode(list[i].description), start: start, stop: stop});
      }
      guides[key] = {at: Date.now(), items: items};
      done(items);
    }, 9000);
  }

  // MARK: - An M3U list's guide (XMLTV)
  //
  // A list's guide is one file for all its channels: downloaded once (kept 30 minutes, one download at a time per
  // address) and read without a DOM, keeping only what's on from 6 hours ago to a day ahead. A channel's entries are
  // found by its tvg-id, else by its name when the guide has exactly one channel of that name. A compressed file
  // (.gz) can't be read here unless the server sends it already unpacked.

  var XMLTV_KEEP_MS = 30 * 60000, XMLTV_MAX = 41943040, xmltvs = {};

  function xmlAttr(text, name) {
    var m = new RegExp('\\b' + name + '="([^"]*)"', 'i').exec(text || '');
    return m ? m[1] : '';
  }

  function xmlText(text) {
    return (text || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (all, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (all, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  /** "20261026223000 -0300" in ms; without an offset, the TV's own time. 0 when it isn't a time. */
  function xmlTime(value) {
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2}))?/.exec(value || '');
    if (!m) return 0;
    if (!m[7]) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
    var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    return utc - (m[7] === '+' ? 1 : -1) * (+m[8] * 60 + +m[9]) * 60000;
  }

  /** A channel name to compare with the guide's: lower case, no accents or quality tags, letters and digits only. */
  function guideName(name) {
    return (name || '').toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
      .replace(/\b(f?hd|sd|uhd|4k|h26[45]|hevc)\b/g, '').replace(/[^a-z0-9]/g, '');
  }

  /**
   * An XMLTV file read for the guide: {byId: {channel id: [{title, start, stop}]}, byName: {name: [channel ids]}},
   * with only the programmes on between `now` - 6 h and `now` + 24 h; title, subtitle and description in `title`.
   */
  function parseXmltv(xml, now) {
    var byId = {}, byName = {}, m;
    var channelRe = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
    while ((m = channelRe.exec(xml))) {
      var id = xmlText(xmlAttr(m[1], 'id')), names = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi, d;
      if (!id) continue;
      while ((d = names.exec(m[2]))) {
        var n = guideName(xmlText(d[1]));
        if (!n) continue;
        byName[n] = byName[n] || [];
        if (byName[n].indexOf(id) < 0) byName[n].push(id);
      }
    }
    var from = now - 6 * 3600000, to = now + 24 * 3600000, programmeRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
    while ((m = programmeRe.exec(xml))) {
      var start = xmlTime(xmlAttr(m[1], 'start')), stop = xmlTime(xmlAttr(m[1], 'stop'));
      if (!start || !stop || stop <= from || start >= to) continue;
      var channel = xmlText(xmlAttr(m[1], 'channel')), parts = [];
      var tags = ['title', 'sub-title', 'desc'];
      for (var t = 0; t < tags.length; t++) {
        var tag = new RegExp('<' + tags[t] + '\\b[^>]*>([\\s\\S]*?)</' + tags[t] + '>', 'i').exec(m[2]);
        if (tag) parts.push(xmlText(tag[1]).slice(0, 300));
      }
      if (!channel || !parts.length) continue;
      (byId[channel] = byId[channel] || []).push({title: parts.join(' '), start: start, stop: stop});
    }
    return {byId: byId, byName: byName};
  }

  /** A guide file, read (done(guide)) or null when it can't be had; one download per address at a time, kept 30 min. */
  function xmltv(url, done) {
    var had = xmltvs[url];
    if (had && had.guide !== undefined && Date.now() - had.at < XMLTV_KEEP_MS) { done(had.guide); return; }
    if (had && had.waiting) { had.waiting.push(done); return; }
    var entry = xmltvs[url] = {waiting: [done]};
    request(url, function (err, text) {
      var guide = null;
      if (!err && text && text.length <= XMLTV_MAX && text.indexOf('<tv') >= 0) {
        try { guide = parseXmltv(text, Date.now()); } catch (e) { guide = null; }
      }
      var waiting = entry.waiting;
      xmltvs[url] = {at: Date.now(), guide: guide};
      for (var i = 0; i < waiting.length; i++) waiting[i](guide);
    }, 45000);
  }

  /** An M3U list's guide addresses: the ones the IPTV player set up for it, then the ones the list declares. */
  function guideUrls(src) {
    var out = [], lists = [src && src.epg, declaredGuides[listKey(src)]];
    for (var l = 0; l < lists.length; l++) {
      for (var i = 0; lists[l] && i < lists[l].length; i++) {
        if (/^https?:\/\//i.test(lists[l][i]) && out.indexOf(lists[l][i]) < 0) out.push(lists[l][i]);
      }
    }
    return out;
  }

  /** Every guide of an M3U list, read one after the other: done([guide...]) (the ones that could be read). */
  function listGuides(src, done) {
    var urls = guideUrls(src), out = [], i = 0;
    (function next() {
      if (i >= urls.length) { done(out); return; }
      xmltv(urls[i++], function (guide) {
        if (guide) out.push(guide);
        next();
      });
    })();
  }

  /** A channel's entries in a guide: by its tvg-id; else by its name, only when the guide has one channel of that name. */
  function entriesIn(guide, ch) {
    if (ch.tvgId && guide.byId[ch.tvgId]) return guide.byId[ch.tvgId];
    var ids = guide.byName[guideName(ch.tvgName || ch.name)];
    return ids && ids.length === 1 ? guide.byId[ids[0]] || [] : null;
  }

  /**
   * What a channel shows around now: [{title, start, stop}] in ms. An Xtream channel from the provider's short guide;
   * an M3U channel from its list's XMLTV guides. [] when there is no guide for it; null when it couldn't be read.
   */
  function guide(ch, done) {
    if (!ch) { done([]); return; }
    if (ch.sourceType === 'xtream' && ch.list && (ch.streamId || ch.id)) { xtreamGuide(ch, done); return; }
    if (ch.sourceType !== 'm3u' || !guideUrls(ch.list).length) { done([]); return; }
    listGuides(ch.list, function (found) {
      if (!found.length) { done(null); return; }
      var items = [];
      for (var g = 0; g < found.length; g++) items = items.concat(entriesIn(found[g], ch) || []);
      done(items);
    });
  }

  /**
   * The M3U channels whose guide has an entry `shows(item)` accepts, over every M3U list's guides (no request per
   * channel: one file per list). done(channels); [] when no list has a guide.
   */
  function guideScan(shows, done) {
    var lists = [], out = [], seen = {};
    for (var s = 0; s < sources.length; s++) if (sources[s].type !== 'xtream' && guideUrls(sources[s]).length) lists.push(sources[s]);
    var i = 0;
    (function next() {
      if (i >= lists.length) { done(out); return; }
      var src = lists[i++];
      listGuides(src, function (found) {
        for (var c = 0; c < list.length; c++) {
          var ch = list[c];
          if (ch.list !== src) continue;
          var key = identity(ch);
          if (seen[key]) continue;
          for (var g = 0; g < found.length && !seen[key]; g++) {
            var items = entriesIn(found[g], ch) || [];
            for (var k = 0; k < items.length; k++) if (shows(items[k])) { seen[key] = true; out.push(ch); break; }
          }
        }
        next();
      });
    })();
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

  /** A channel's name, to compare: lower case, without accents, letters and digits only, without HD/SD/FHD/4K. */
  function plain(x) {
    return (x || '').toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
      .replace(/\b(f?hd|sd|4k|uhd)\b/g, '').replace(/[^a-z0-9]/g, '');
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
    identity: identity,
    linkFor: linkFor,
    guide: guide,
    guideScan: guideScan,
    parseXmltv: parseXmltv,
    /** Every channel of the lists (after load): {name, logo, group, url, id?}. */
    channels: function () { return list; },
    /** Why there are no channels after load: '' (none set up, or simply none), or the first list's error. */
    error: function () { return failed; }
  };
})();
