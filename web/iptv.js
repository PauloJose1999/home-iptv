/*
 * IPTV: the channels of an IPTV list, and a full-screen player for them, inside the home screen (no other app opens).
 * The list comes from config.properties: iptv_m3u (an M3U link), or iptv_server, iptv_user and iptv_pass (an
 * Xtream Codes server, as most providers give). Opened from the drawer (↓ on the shelf): the groups on the left, the
 * channels on the right; OK plays one. In the player, ↑ ↓ change the channel, OK shows its name, Back goes back.
 * While open, this takes the remote's keys (a capturing listener), so home.js needs nothing more than IPTV.open().
 * Plain ES5, like the rest of web/.
 */
var IPTV = (function () {
  'use strict';

  var cfg = (window.CONFIG && CONFIG.iptv) || {};
  var server = (cfg.server || '').replace(/\/+$/, '');
  var enabled = !!(cfg.m3u || (server && cfg.user && cfg.pass));

  var COLS = 4;
  var list = [], groups = [], loading = false, loaded = false, failed = '';
  var st = {open: false, zone: 'groups', group: 0, cell: 0, playing: -1, shown: [], direct: false};
  var root = null, video = null, infoTimer = 0;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function setClass(e, c, on) {
    if (!e) return;
    var has = (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0;
    if (on && !has) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && has) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  // MARK: - The list

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
        info = {name: comma >= 0 ? line.slice(comma + 1) : attr('tvg-name'), logo: attr('tvg-logo'), group: attr('group-title') || '—'};
      } else if (line && line.charAt(0) !== '#' && info) {
        info.url = line;
        out.push(info);
        info = null;
      }
    }
    return out;
  }

  function xtream(done) {
    var base = server + '/player_api.php?username=' + encodeURIComponent(cfg.user) + '&password=' + encodeURIComponent(cfg.pass);
    request(base + '&action=get_live_categories', function (err, text) {
      var names = {};
      if (!err) {
        try {
          var cats = JSON.parse(text);
          for (var i = 0; i < cats.length; i++) names[cats[i].category_id] = cats[i].category_name;
        } catch (e) {}
      }
      request(base + '&action=get_live_streams', function (err2, text2) {
        if (err2) { done(err2); return; }
        var streams;
        try { streams = JSON.parse(text2); } catch (e) { done('the server did not answer with a list'); return; }
        if (!streams || !streams.length) { done('the list is empty'); return; }
        var out = [];
        for (var j = 0; j < streams.length; j++) {
          var s = streams[j];
          out.push({name: s.name || '', logo: s.stream_icon || '', group: names[s.category_id] || '—',
            url: server + '/live/' + encodeURIComponent(cfg.user) + '/' + encodeURIComponent(cfg.pass) + '/' + s.stream_id + '.m3u8'});
        }
        done(null, out);
      });
    });
  }

  function load(done) {
    if (loaded || loading) { if (done) done(); return; }
    loading = true;
    function finish(err, channels) {
      loading = false;
      failed = err || '';
      if (!err) {
        list = channels;
        loaded = true;
        groups = [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
          if (!seen[list[i].group]) { seen[list[i].group] = true; groups.push(list[i].group); }
        }
        groups.unshift(tr('All'));
      }
      if (done) done();
    }
    if (server) xtream(finish);
    else request(cfg.m3u, function (err, text) {
      if (err) { finish(err); return; }
      var channels = parseM3u(text);
      finish(channels.length ? null : 'the list is empty', channels);
    });
  }

  function inGroup() {
    if (st.group === 0) return list;
    var g = groups[st.group];
    return list.filter(function (c) { return c.group === g; });
  }

  // MARK: - The sheet: groups and channels

  function build() {
    if (root) return;
    root = el('div', 'layer', $('stage'));
    root.id = 'iptv';
    el('div', 'title', root);
    el('div', 'groups', root);
    var grid = el('div', 'grid', root);
    el('div', 'rows', grid);
    el('div', 'status', root);
    video = el('video', 'player', root);
    video.autoplay = true;
    var info = el('div', 'info', root);
    el('div', 'name', info);
    el('div', 'sub', info);
    video.addEventListener('error', function () { status(tr("Couldn't play this channel.")); });
    video.addEventListener('playing', function () { status(''); });
  }

  function status(text) {
    var s = root.querySelector('.status');
    s.textContent = text;
    setClass(s, 'on', !!text);
  }

  function render() {
    root.firstChild.textContent = tr('IPTV');
    var g = root.querySelector('.groups');
    g.innerHTML = '';
    for (var i = 0; i < groups.length; i++) el('div', 'group', g, groups[i]);
    var rows = root.querySelector('.rows');
    rows.innerHTML = '';
    st.shown = inGroup();
    for (var c = 0; c < st.shown.length; c++) {
      var ch = st.shown[c], cell = el('div', 'chan', rows);
      cell.style.left = (c % COLS) * 340 + 'px';
      cell.style.top = Math.floor(c / COLS) * 170 + 'px';
      var face = el('div', 'face', cell), word = el('div', 'word', face, ch.name);
      if (ch.logo) {
        var img = el('img', '', face);
        word.style.visibility = 'hidden';
        img.onerror = function () { this.previousSibling.style.visibility = ''; this.parentNode.removeChild(this); };
        img.src = ch.logo;
      }
      el('div', 'label', cell, ch.name);
      (function (index) {
        cell.onclick = function () { st.zone = 'grid'; st.cell = index; focus(); play(index); };
      })(c);
    }
    if (!loaded) status(loading ? tr('Loading channels…') : trf("Couldn't load the IPTV list: {error}", {error: failed}));
    else if (!list.length) status(tr('The list is empty.'));
    else status('');
    focus();
  }

  function focus() {
    var gs = root.querySelectorAll('.group');
    for (var i = 0; i < gs.length; i++) {
      setClass(gs[i], 'on', i === st.group);
      setClass(gs[i], 'focus', st.zone === 'groups' && i === st.group);
    }
    var first = Math.max(0, Math.min(gs.length - 9, st.group - 4));
    root.querySelector('.groups').style.webkitTransform = root.querySelector('.groups').style.transform = 'translateY(' + (-first * 74) + 'px)';
    var cells = root.querySelectorAll('.chan');
    for (var c = 0; c < cells.length; c++) setClass(cells[c], 'focus', st.zone === 'grid' && c === st.cell);
    var row = Math.floor(st.cell / COLS), top = Math.max(0, row - 1);
    var rows = root.querySelector('.rows');
    rows.style.webkitTransform = rows.style.transform = 'translateY(' + (-top * 170) + 'px)';
  }

  // MARK: - The player

  function play(index) {
    var ch = st.shown[index];
    if (!ch) return;
    st.playing = index;
    st.cell = index;
    setClass(root, 'playing', true);
    status(tr('Loading channels…'));
    try { video.pause(); } catch (e) {}
    video.src = ch.url;
    try { video.load(); video.play(); } catch (e) {}
    showInfo();
  }

  function showInfo() {
    var ch = st.shown[st.playing];
    if (!ch) return;
    var info = root.querySelector('.info');
    info.firstChild.textContent = ch.name;
    info.lastChild.textContent = (st.playing + 1) + ' / ' + st.shown.length + '  ·  ' + ch.group;
    setClass(info, 'on', true);
    clearTimeout(infoTimer);
    infoTimer = setTimeout(function () { setClass(info, 'on', false); }, 4000);
  }

  function stopVideo() {
    if (!video) return;
    try { video.pause(); } catch (e) {}
    video.removeAttribute('src');
    try { video.load(); } catch (e) {}
    st.playing = -1;
    setClass(root, 'playing', false);
    status('');
  }

  // MARK: - Keys

  function key(k) {
    var K = TV.keys;
    if (st.playing >= 0) {
      if (k === K.up || k === K.down) {
        var next = (st.playing + (k === K.up ? -1 : 1) + st.shown.length) % st.shown.length;
        play(next);
      } else if (k === K.ok) showInfo();
      else if (k === K.back || k === 27 || k === 8) {
        if (st.direct) close();   // opened from a card on the home screen: Back goes back there
        else { stopVideo(); focus(); }
      }
      return;
    }
    if (k === K.back || k === 27 || k === 8) { close(); return; }
    if (st.zone === 'groups') {
      if (k === K.up) st.group = Math.max(0, st.group - 1);
      else if (k === K.down) st.group = Math.min(groups.length - 1, st.group + 1);
      else if ((k === K.right || k === K.ok) && st.shown.length) { st.zone = 'grid'; st.cell = 0; focus(); return; }
      else return;
      st.cell = 0;
      render();
      return;
    }
    var n = st.shown.length, c = st.cell;
    if (k === K.left) { if (c % COLS === 0) st.zone = 'groups'; else st.cell = c - 1; }
    else if (k === K.right) { if (c % COLS < COLS - 1 && c + 1 < n) st.cell = c + 1; }
    else if (k === K.up) { if (c - COLS >= 0) st.cell = c - COLS; }
    else if (k === K.down) { if (c + COLS < n) st.cell = c + COLS; else if (Math.floor(c / COLS) < Math.floor((n - 1) / COLS)) st.cell = n - 1; }
    else if (k === K.ok) { play(c); return; }
    focus();
  }

  document.addEventListener('keydown', function (e) {
    if (!st.open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    key(e.keyCode);
  }, true);

  // MARK: - Open and close

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

  /** Plays one channel of the list full screen, from a card on the home screen; ↑ ↓ go through the whole list. */
  function playChannel(ch) {
    if (!enabled) return;
    build();
    st.open = true;
    st.direct = true;
    st.group = 0;
    st.shown = list;
    setClass(root, 'open', true);
    var at = list.indexOf(ch);
    play(at >= 0 ? at : 0);
  }

  function open() {
    if (!enabled) return;
    build();
    st.open = true;
    st.direct = false;
    st.zone = 'groups';
    setClass(root, 'open', true);
    render();
    load(function () { if (st.open) render(); });
  }

  function close() {
    stopVideo();
    st.open = false;
    if (root) setClass(root, 'open', false);
  }

  return {
    enabled: enabled,
    open: open,
    close: close,
    isOpen: function () { return st.open; },
    load: load,
    lookup: lookup,
    playChannel: playChannel,
    parseM3u: parseM3u
  };
})();
