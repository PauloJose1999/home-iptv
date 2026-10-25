/*
 * The home screen for LG TVs (webOS):
 *  - top: the tabs (TV aberta, Movies, Shows); the clock and icon-only glass buttons at the right (Live TV, HDMI
 *    Inputs, Settings);
 *  - three picks for this hour in the selected tab; the background is the first one's photo, blurred and almost white;
 *  - the glass shelf with the apps; ↓ opens the drawer (inputs, shortcuts, weather); ↑ or Back closes it;
 *  - a night look from sunset to sunrise; a screensaver after a few idle minutes.
 * The remote's arrows, OK and Back move the focus; a pointer (LG's Magic Remote) focuses what it points at.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function sym(name, parent, size) {
    var s = el('span', 'sym', parent);
    s.style.webkitMaskImage = 'url(symbols/' + name + '.png)';
    s.style.maskImage = 'url(symbols/' + name + '.png)';
    if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
    return s;
  }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function setClass(e, c, on) {
    if (!e) return;
    if (on && !hasClass(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && hasClass(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var stage = $('stage'), body = document.body;

  /** The 1920 × 1080 stage fills the window (on the TV it already is 1920 × 1080). */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // MARK: - Apps on the shelf

  /** Shelf apps in this order when installed: key, LG app id, name on the TV, brand gradient. */
  var SHELF = [
    ['netflix', /^netflix$/, /netflix/i, ['#0A0A0A', '#000000']],
    ['youtube', /youtube/, /^youtube$/i, ['#1C1C1E', '#09090A']],
    ['prime', /^amazon$/, /prime video|amazon/i, ['#2AA8FF', '#0A68D4']],
    ['disney', /disney/, /disney/i, ['#173584', '#08143F']],
    ['max', /hbo|wbd/, /^(hbo )?max$|hbo max/i, ['#5C30E8', '#221684']],
    ['appletv', /appletv|apple\.tv/, /apple tv/i, ['#1C1C1E', '#000000']],
    ['hulu', /^hulu/, /hulu/i, ['#1CE783', '#0B8F4E']],
    ['paramount', /paramount|cbs/, /paramount/i, ['#0064FF', '#002A86']],
    ['peacock', /peacock/, /peacock/i, ['#1C1C1E', '#000000']],
    ['nfl', /nfl/, /^nfl/i, ['#013369', '#00163D']],
    ['globoplay', /globoplay/, /globoplay/i, ['#FF8A1F', '#FF2D5A']],
    ['jellyfin', /jellyfin/i, /jellyfin/i, ['#AA5CC3', '#00A4DC']],
    ['spotify', /spotify/, /spotify/i, ['#1DB954', '#0F7A36']]
  ];
  // Apps shown at once: 8 (today's smallest tiles, 178 wide); the shelf scrolls for the rest.
  var SHELF_VISIBLE = 8;

  function shelfKey(app) {
    for (var i = 0; i < SHELF.length; i++) if (SHELF[i][1].test(app.id) || SHELF[i][2].test(app.title)) return SHELF[i];
    return null;
  }

  function darken(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#161618';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  }

  /** A name that fits the tile on one line (the font shrinks for long names). */
  function wordFit(title, width, max) {
    return Math.max(18, Math.min(max, Math.floor(width * 0.8 / (Math.max(4, title.length) * 0.56))));
  }

  // MARK: - Logos

  // The TV's icons are small squares with their own background (white behind Netflix, black behind Max). The logo is
  // lifted off it once: the background goes transparent and the rest is cropped to the logo, which then fills the
  // tile on the brand's color.
  var lifted = {};   // icon url -> {src, bg: [r, g, b], ink: luminance histogram} or false (keep the icon as it is)
  var LIFT_SIZE = 240;

  // sRGB (0-255) to linear light, computed once: lift() needs it for every pixel, and old TVs are slow at Math.pow.
  var LINEAR = [];
  for (var li = 0; li < 256; li++) LINEAR[li] = li <= 10 ? li / 255 / 12.92 : Math.pow((li / 255 + 0.055) / 1.055, 2.4);

  /** Relative luminance (0-1) of an sRGB color (whole numbers, as read from the canvas). */
  function luminance(r, g, b) {
    return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
  }

  function rgbOf(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color || '');
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  function lift(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return false;
    var f = Math.min(1, LIFT_SIZE / Math.max(w, h));
    w = Math.max(1, Math.round(w * f));
    h = Math.max(1, Math.round(h * f));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var g = canvas.getContext('2d');
    var data;
    try {
      g.drawImage(img, 0, 0, w, h);
      data = g.getImageData(0, 0, w, h);
    } catch (e) {
      return false;   // a TV that doesn't let the page read its icons
    }
    var px = data.data;
    // The background: the most common color a little inside the edges (rounded icons have transparent corners).
    var votes = {}, best = null, bestN = 0, inset = Math.round(Math.min(w, h) * 0.08);
    for (var s = 0; s < 64; s++) {
      var t = s % 16 / 16, side = s >> 4;
      var x = side < 2 ? Math.round(inset + t * (w - 2 * inset)) : side === 2 ? inset : w - 1 - inset;
      var y = side < 2 ? (side === 0 ? inset : h - 1 - inset) : Math.round(inset + t * (h - 2 * inset));
      var i = (y * w + x) * 4;
      var key = px[i + 3] < 128 ? 'clear' : (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);
      votes[key] = (votes[key] || 0) + 1;
      if (votes[key] > bestN) { bestN = votes[key]; best = key === 'clear' ? null : [px[i], px[i + 1], px[i + 2]]; }
    }
    var minX = w, minY = h, maxX = -1, maxY = -1, ink = [0, 0, 0, 0, 0, 0, 0, 0], inkSum = 0;
    for (var p = 0; p < w * h; p++) {
      var j = p * 4, a = px[j + 3] / 255;
      if (best) {
        // color to alpha: how far each channel is from the background, as a share of how far it could go, so the
        // anti-aliased edges come out as the logo's color, partly clear, without a fringe of the background
        var k = 0, c;
        for (c = 0; c < 3; c++) {
          var v = px[j + c], o = best[c];
          k = Math.max(k, v > o ? (v - o) / Math.max(1, 255 - o) : (o - v) / Math.max(1, o));
        }
        k = Math.max(0, Math.min(1, (k - 0.1) / 0.9));   // compression noise stays clear
        if (k > 0 && k < 1) {
          for (c = 0; c < 3; c++) px[j + c] = Math.max(0, Math.min(255, best[c] + (px[j + c] - best[c]) / k));
        }
        a *= k;
      }
      px[j + 3] = Math.round(a * 255);
      if (a > 0.3) {
        var px0 = p % w, py0 = (p / w) | 0;
        if (px0 < minX) minX = px0;
        if (px0 > maxX) maxX = px0;
        if (py0 < minY) minY = py0;
        if (py0 > maxY) maxY = py0;
        ink[Math.min(7, Math.floor(Math.sqrt(luminance(px[j], px[j + 1], px[j + 2])) * 8))] += a;
        inkSum += a;
      }
    }
    // Nothing left, or nothing taken away (a picture rather than a logo on a background): keep the icon.
    if (maxX < 0 || (maxX - minX > w * 0.96 && maxY - minY > h * 0.96)) return false;
    var crop = document.createElement('canvas');
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    g.putImageData(data, 0, 0);
    crop.getContext('2d').drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    for (var b = 0; b < 8; b++) ink[b] /= inkSum;
    try {
      return {src: crop.toDataURL('image/png'), bg: best, ink: ink};
    } catch (e2) {
      return false;
    }
  }

  /**
   * Share of the logo that hardly shows on a tile of this luminance (YouTube's black type on a dark tile). Each bin
   * of the histogram holds the ink whose square-root luminance falls in it.
   */
  function unseen(ink, tileLum) {
    var share = 0;
    for (var b = 0; b < 8; b++) {
      var l = Math.pow((b + 0.5) / 8, 2);
      if ((Math.max(l, tileLum) + 0.05) / (Math.min(l, tileLum) + 0.05) < 1.8) share += ink[b];
    }
    return share;
  }

  function paint(box, top, bottom) {
    box.style.background = '-webkit-linear-gradient(top, ' + top + ', ' + bottom + ')';
    box.style.background = 'linear-gradient(' + top + ', ' + bottom + ')';
  }

  /** A color that is clearly a hue (Crunchyroll's orange), not black, white or a gray. */
  function colorful(rgb) {
    return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) >= 96;
  }

  /** own: the tile has the TV's color for the app, not one of SHELF's. */
  function showLogo(img, box, top, bottom, logo, own) {
    img.className = 'logo';
    img.src = logo.src;
    var a = rgbOf(top), z = rgbOf(bottom);
    var tileLum = (luminance(a[0], a[1], a[2]) + luminance(z[0], z[1], z[2])) / 2;
    // The tile takes the icon's background when the logo only reads on it, and when that background is the brand's
    // color: LG's bgColor isn't always the icon's (Crunchyroll's is black, on an orange icon).
    if (logo.bg && ((own && colorful(logo.bg)) || unseen(logo.ink, tileLum) > 0.35)) {
      var bg = 'rgb(' + logo.bg.join(',') + ')';
      var hex = '#' + ((1 << 24) | (logo.bg[0] << 16) | (logo.bg[1] << 8) | logo.bg[2]).toString(16).slice(1);
      paint(box, bg, darken(hex, 0.93));
    }
  }

  /** An app's face: its logo on its brand color (or its name, when the icon can't be read). */
  function face(app, box, wordSize) {
    var k = shelfKey(app);
    var top = k ? k[3][0] : app.color ? darken(app.color, 0.92) : '#2A2A2E';
    var bottom = k ? k[3][1] : app.color ? darken(app.color, 0.62) : '#161618';
    paint(box, top, bottom);
    var word = el('div', 'word', box, app.title);
    if (wordSize) word.style.fontSize = wordSize + 'px';
    if (app.icon) {
      var img = el('img', '', box), url = app.icon;
      word.style.visibility = 'hidden';
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); word.style.visibility = ''; };
      if (lifted[url]) { showLogo(img, box, top, bottom, lifted[url], !k); return; }
      if (lifted[url] !== false) {
        img.onload = function () {
          img.onload = null;
          if (lifted[url] === undefined) lifted[url] = lift(img);
          if (lifted[url]) showLogo(img, box, top, bottom, lifted[url], !k);
        };
      }
      img.src = url;
    }
  }

  var apps = [], shelf = [], others = [], inputs = [];

  function pickShelf() {
    var chosen = Prefs.shelf(), out = [];
    if (chosen) {
      // The apps picked in Home Settings › Shelf come first, in their order; every other app follows, so the shelf
      // always scrolls through all of them.
      for (var i = 0; i < chosen.length; i++) {
        for (var j = 0; j < apps.length; j++) if (apps[j].id === chosen[i] && out.indexOf(apps[j]) < 0) out.push(apps[j]);
      }
      for (var o = 0; o < apps.length; o++) if (out.indexOf(apps[o]) < 0) out.push(apps[o]);
    } else {
      // Every app on the TV: the well-known ones first, in SHELF's order, then the rest as the TV lists them. The shelf
      // scrolls through them all.
      for (var s = 0; s < SHELF.length; s++) {
        for (var a = 0; a < apps.length; a++) {
          if ((SHELF[s][1].test(apps[a].id) || SHELF[s][2].test(apps[a].title)) && out.indexOf(apps[a]) < 0) { out.push(apps[a]); break; }
        }
      }
      for (var r = 0; r < apps.length; r++) if (out.indexOf(apps[r]) < 0) out.push(apps[r]);
    }
    shelf = out;
    // All Apps lists every app, alphabetically, the shelf's too.
    others = apps.slice().sort(function (x, y) { var p = x.title.toLowerCase(), q = y.title.toLowerCase(); return p < q ? -1 : p > q ? 1 : 0; });
  }

  // MARK: - Focus

  var Z = {TOP: 'top', CARDS: 'cards', CATALOG: 'catalog', SHELF: 'shelf', DRAWER: 'drawer', APPS: 'apps', SETTINGS: 'settings', EDIT: 'edit', LANG: 'lang'};
  var st = {zone: Z.SHELF, top: 0, tab: 0, card: 0, crow: 0, ccol: [], shelf: 0, drawer: 0, grid: 0, row: 0, edit: 0, lang: 0};
  var cards = [];

  function sheetOpen() { return st.zone === Z.APPS || st.zone === Z.SETTINGS || st.zone === Z.EDIT || st.zone === Z.LANG; }

  function updateFocus() {
    var i, list;
    list = $('tabs').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.tab);
      setClass(list[i], 'focus', st.zone === Z.TOP && st.top === i);
    }
    list = $('buttons').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.TOP && st.top === 3 + i);
    list = $('cards').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.CARDS && st.card === i);
    list = $('tiles').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.SHELF && st.shelf === i);
    revealShelf();
    list = document.querySelectorAll('#drawer .key');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.DRAWER && st.drawer === i);
    list = document.querySelectorAll('#apps .cell');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.APPS && st.grid === i);
    var rows = Math.max(1, Math.ceil(others.length / 5)), r = Math.floor(st.grid / 5), first = Math.max(0, Math.min(rows - 3, r - 1));
    $('apps').lastChild.style.webkitTransform = $('apps').lastChild.style.transform = 'translateY(' + (-first * 239) + 'px)';
    focusRows($('settings'), st.row, st.zone === Z.SETTINGS);
    focusRows($('shelfedit'), st.edit, st.zone === Z.EDIT);
    focusRows($('langpick'), st.lang, st.zone === Z.LANG);
    if (langHint) langHint.textContent = (st.lang + 1) + ' / ' + languageChoices().length + '  ·  ' + tr('OK picks, Back cancels.');
    setClass(body, 'drawer-open', st.zone === Z.DRAWER);
    if (st.tab === 0 && cards[0] && cards[0].live) placePlayer();
    else if (player.slots.length) stopPlayer();
    placeCatalog();
  }

  function focusRows(sheet, index, on) {
    var rows = sheet.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) setClass(rows[i], 'focus', on && i === index);
    var holder = sheet.querySelector('.rows');
    if (!holder) return;
    var visible = 7, first = Math.max(0, Math.min(rows.length - visible, index - 3));
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-first * 78) + 'px)';
  }

  function nearest(nodes, x) {
    var best = 0, bestD = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function centerX(node) {
    if (!node) return 960;
    var r = node.getBoundingClientRect();
    return (r.left + r.right) / 2;
  }

  // MARK: - Top: tabs and buttons

  // The first tab is open TV (the channels, live); then the movies and the shows from the TV's apps.
  var TAB_KIND = ['live', 'movie', 'tv'];

  function renderTop() {
    $('title').textContent = '';
    var tabs = $('tabs');
    tabs.innerHTML = '';
    var names = [tr('light|Live TV'), tr('Movies'), tr('Shows')];
    for (var i = 0; i < 3; i++) {
      var t = el('button', 'tab', tabs, names[i]);
      hover(t, Z.TOP, i);
    }
    var buttons = $('buttons');
    buttons.innerHTML = '';
    var defs = [['live_tv', tr('light|Live TV')], ['hdmi', tr('HDMI Inputs')], ['settings', tr('light|Settings')]];
    for (var b = 0; b < 3; b++) {
      var r = el('button', 'round' + (b === 2 ? ' last' : ''), buttons);
      r.style.left = (1660 + 66 * b) + 'px';
      sym(defs[b][0], r);
      el('div', 'tip', r, defs[b][1]);
      hover(r, Z.TOP, 3 + b);
    }
  }

  // MARK: - Picks and background

  // MARK: - TV aberta: the channels, live (a big card and two small ones, as in smart_tv_ui.html)

  var liveChannels = null, channelsAt = 0;
  var LIVE_RECTS = [[80, 150, 1120, 560], [1232, 150, 608, 268], [1232, 442, 608, 268]];
  // Each channel's card color, by its name; others take the theme's purple.
  var CHANNEL_COLORS = [
    [/globo/i, ['#2563EB', '#1E1B4B']], [/sbt/i, ['#E11D48', '#4C0519']], [/record/i, ['#0EA5E9', '#082F49']],
    [/band/i, ['#16A34A', '#052E16']], [/cnn/i, ['#DC2626', '#1C0A0A']], [/cultura/i, ['#F59E0B', '#451A03']],
    [/rede ?tv/i, ['#7C3AED', '#1E1B4B']]
  ];

  /** A channel's name as shown: without "HD", and "RECORD NEWS" as "Record News" (short ones like SBT stay). */
  function channelName(name) {
    var n = (name || '').replace(/\s+(F?HD|SD|UHD|4K)$/i, '');
    if (n !== n.toUpperCase()) return n;
    return n.toLowerCase().replace(/(^|\s)(\S)(\S*)/g, function (m, sp, a, rest) {
      return sp + (rest.length < 3 ? (a + rest).toUpperCase() : a.toUpperCase() + rest);
    });
  }

  function channelColors(name, i) {
    for (var k = 0; k < CHANNEL_COLORS.length; k++) if (CHANNEL_COLORS[k][0].test(name)) return CHANNEL_COLORS[k][1];
    return i === 0 ? ['#7C3AED', '#1E1B4B'] : ['#6D28D9', '#0F172A'];
  }

  /** The channels wanted on the cards that the antenna doesn't have, from the IPTV list (GloboNews, CNN Brasil…). */
  function withIptv(list, done) {
    var wanted = CONFIG.liveChannels || [];
    if (!IPTV.enabled || !wanted.length) { done(list); return; }
    IPTV.load(function () {
      function plain(x) { return (x || '').toLowerCase().replace(/\b(f?hd|sd|4k)\b/g, '').replace(/[^a-z0-9]/g, ''); }
      var out = [], antenna = (list || []).slice();
      for (var w = 0; w < wanted.length && out.length < 3; w++) {
        var needle = plain(wanted[w]), got = null;
        for (var i = 0; i < antenna.length; i++) {
          if (plain(antenna[i].name).indexOf(needle) >= 0) { got = antenna.splice(i, 1)[0]; break; }
        }
        if (!got) {
          var ch = IPTV.lookup(wanted[w]);
          if (ch) got = {id: 'iptv:' + ch.url, number: '', name: ch.name, program: null, iptv: ch};
        }
        if (got) out.push(got);
      }
      while (out.length < 3 && antenna.length) out.push(antenna.shift());
      // An antenna channel the list also has plays its own stream in the card (Record News, TV Cultura…), and every
      // card takes the list's logo for the channel.
      for (var k = 0; k < out.length; k++) {
        if (out[k].iptv) { out[k].logo = out[k].iptv.logo; continue; }
        var same = IPTV.lookup(channelName(out[k].name));
        if (same) { out[k].stream = same.url; out[k].logo = same.logo; }
      }
      done(out);
    });
  }

  function loadChannels(done) {
    TV.channels(CONFIG.liveChannels || [], 6, function (antenna) {
     withIptv(antenna, function (list) {
      liveChannels = list;
      channelsAt = Date.now();
      for (var i = 0; list && i < list.length; i++) list[i].program = list[i].program || TV.known(list[i].id);
      if (st.tab === 0) renderCards();
      if (done) done();
     });
    });
  }

  /** The cards of the first tab: the channels, or Live TV alone when the TV doesn't list them. */
  function liveCards() {
    var out = [];
    for (var i = 0; liveChannels && i < liveChannels.length && i < 3; i++) out.push({live: true, channel: liveChannels[i], id: 'ch' + liveChannels[i].id});
    if (!out.length) out.push({live: true, channel: null, id: 'livetv'});
    return out;
  }

  /** Fills a card's bottom: the program, its start and end with the progress between them, and (big) the time left. */
  function fillFoot(foot, ch, big) {
    var p = ch && ch.program, now = Date.now();
    foot.innerHTML = '';
    el('div', 'prog', foot, p && p.title ? p.title : ch ? '' : tr('Live TV'));
    if (!p || !p.start || !p.end) return;
    var line = el('div', 'timeline', foot);
    el('span', 't', line, formatDate('format|h:mm', p.start));
    var bar = el('div', 'bar', line);
    el('div', 'fill', bar).style.width = Math.round(Math.max(0, Math.min(1, (now - p.start) / (p.end - p.start))) * 100) + '%';
    el('span', 't', line, formatDate('format|h:mm', p.end));
    if (big) el('div', 'left', foot, trf('{n} min left', {n: Math.max(1, Math.ceil((p.end - now) / 60000))}));
  }

  var liveIds = '';

  /** The channel cards; when the same channels are on them, only their programs and progress change (the player stays). */
  function renderLive() {
    var list = liveCards(), holder = $('cards');
    var ids = list.map(function (x) { return x.id; }).join(',');
    setClass(body, 'no-picks', false);
    if (ids === liveIds && holder.children.length === list.length && cards[0] && cards[0].live) {
      cards = list;
      for (var u = 0; u < list.length; u++) fillFoot(holder.children[u].querySelector('.foot'), list[u].channel, u === 0);
      placePlayer();
      return;
    }
    liveIds = ids;
    cards = list;
    holder.innerHTML = '';
    for (var c = 0; c < list.length; c++) {
      var ch = list[c].channel, r = liveRect(c, list.length), name = ch ? channelName(ch.name) : tr('Live TV');
      var card = el('div', 'card live' + (c === 0 ? ' big' : ' small'), holder);
      card.style.left = r[0] + 'px';
      card.style.top = r[1] + 'px';
      card.style.width = r[2] + 'px';
      card.style.height = r[3] + 'px';
      var img = el('div', 'img', card);
      paint(img, channelColors(name, c)[0], channelColors(name, c)[1]);
      el('div', 'shade', card);
      channelMark(el('div', 'mark', card), ch);
      var head = el('div', 'head', card);
      el('span', 'chan', head, name);
      if (ch && ch.number) el('span', 'num', head, trf('Channel {n}', {n: ch.number}));
      var badge = el('span', 'badge', card);
      el('span', 'dot', badge);
      badge.appendChild(document.createTextNode(tr('badge|Live')));
      fillFoot(el('div', 'foot', card), ch, c === 0);
      hover(card, Z.CARDS, c);
    }
    st.card = Math.min(st.card, list.length - 1);
    backdrop('');
    updateFocus();
  }

  /** The channel's logo on its card, while no picture plays there; the TV symbol when the list has none (or it fails). */
  function channelMark(mark, ch) {
    var symbol = sym('live_tv', mark);
    if (!ch || !ch.logo) return;
    var img = el('img', 'logo', mark);
    img.style.display = 'none';
    img.onload = function () { img.style.display = ''; symbol.style.display = 'none'; setClass(mark, 'has-logo', true); };
    img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
    img.src = ch.logo;
  }

  function liveRect(i, n) {
    var r = LIVE_RECTS[i];
    return [r[0], r[1], r[2], n === 2 && i === 1 ? 560 : r[3]];
  }

  // MARK: - The players: every channel card plays at once, silent; the focused one has the sound
  //
  // Each card plays its own channel: from the internet when the IPTV list has it (Record News, TV Cultura… a stream per
  // card), else from the antenna. The TV has one tuner, and switching it from here takes the TV out of this app, so the
  // antenna plays only on one card, the one of the channel the TV is on; the other antenna cards show the channel's
  // logo (OK opens them full screen). A stream that fails leaves its card on the logo.

  // slots[i]: card i's player {video, key, ok, timer}; failed: the keys that didn't play (not tried again here).
  var player = {slots: [], failed: {}, current: null, currentAt: 0, learned: false};

  /** What a card plays: {kind: 'net', url} | {kind: 'tv'} | null. */
  function sourceFor(card) {
    var ch = card && card.channel;
    if (!ch) return TV.name === 'webos' ? {kind: 'tv'} : null;
    var net = ch.iptv ? ch.iptv.url : ch.stream;
    if (net && !/youtube\.com|youtu\.be/.test(net)) return {kind: 'net', url: net};
    // The antenna: on the card of the channel it's on, or to find out (the TV only tells while its picture runs).
    if (TV.name === 'webos' && (!player.current || ch.id === player.current)) return {kind: 'tv'};
    if (TV.name === 'browser') return {kind: 'sample'};
    return null;
  }

  function makeVideo(src) {
    var v;
    if (src.kind === 'sample') {
      v = document.createElement('div');   // the browser preview: a stand-in for the antenna's picture
      v.className = 'sample';
    } else {
      v = document.createElement('video');
      v.autoplay = true;
      if (src.kind === 'tv') {
        var source = document.createElement('source');
        source.type = 'service/webos-broadcast';
        source.src = 'tv://';
        v.appendChild(source);
      } else {
        v.src = src.url;
      }
    }
    v.className += ' cardplayer';
    return v;
  }

  /** Stops card i's picture and sound (and lets go of the tuner, when it was the antenna). */
  function stopSlot(i) {
    var s = player.slots[i];
    if (!s) return;
    clearTimeout(s.timer);
    if (s.video) {
      try { s.video.pause(); } catch (e) {}
      try { s.video.removeAttribute('src'); s.video.load(); } catch (e) {}
      if (s.video.parentNode) s.video.parentNode.removeChild(s.video);
    }
    player.slots[i] = null;
    setClass($('cards').children[i], 'playing', false);
  }

  /** Stops every card, and lets go of the tuner (the TV's Live TV app needs it). */
  function stopPlayer() {
    for (var i = 0; i < player.slots.length; i++) stopSlot(i);
    player.slots = [];
    player.failed = {};
    player.learned = false;
  }

  /** Which channel the antenna is on (asked again after a while: the person may have changed it on the TV). */
  function checkCurrent() {
    if (TV.name !== 'webos' || Date.now() - player.currentAt < 15000) return;
    player.currentAt = Date.now();
    TV.currentChannel(function (ch) {
      var id = ch ? ch.id : null;
      if (id !== player.current) { player.current = id; placePlayer(); }
    });
  }

  /** Every card plays its channel, silent; the focused card has the sound. */
  function placePlayer() {
    if (st.tab !== 0 || saverOn || sheetOpen() || IPTV.isOpen()) { stopPlayer(); return; }
    checkCurrent();
    var tuner = false, delay = 0, order = [], i;
    // The focused (or last focused) card starts first; the others follow a moment apart, so they don't all load at once.
    order.push(st.card);
    for (i = 0; i < cards.length; i++) if (i !== st.card) order.push(i);
    for (i = cards.length; i < player.slots.length; i++) stopSlot(i);
    for (var o = 0; o < order.length; o++) {
      var at = order[o], src = sourceFor(cards[at]);
      if (src && src.kind === 'tv') { if (tuner) src = null; else tuner = true; }   // one tuner: one antenna card
      var key = src ? cards[at].id + ':' + src.kind + ':' + (src.url || '') : '';
      if (player.failed[key]) key = '';
      var slot = player.slots[at];
      if (slot && slot.key === key) {
        // The same channel goes on playing when the focus comes or goes: only its sound changes.
        if (slot.video) slot.video.muted = !(st.zone === Z.CARDS && st.card === at);
        if (slot.ok) setClass($('cards').children[at], 'playing', true);   // the cards may have been drawn again
        continue;
      }
      stopSlot(at);
      if (!key) continue;
      delay += 400;
      startSlot(at, src, key, delay);
    }
  }

  function startSlot(at, src, key, delay) {
    var slot = {video: null, key: key, ok: false, timer: 0};
    player.slots[at] = slot;
    slot.timer = setTimeout(function () {
      if (player.slots[at] !== slot) return;
      var v = makeVideo(src);
      v.muted = !(st.zone === Z.CARDS && st.card === at);
      var r = liveRect(at, cards.length);
      v.style.left = r[0] + 'px';
      v.style.top = r[1] + 'px';
      v.style.width = r[2] + 'px';
      v.style.height = r[3] + 'px';
      $('top').insertBefore(v, $('cards'));
      slot.video = v;
      function works() {
        if (player.slots[at] !== slot || slot.ok) return;
        slot.ok = true;
        setClass($('cards').children[at], 'playing', true);
        if (src.kind === 'tv') {
          // Now the TV tells which channel the antenna is on: another card's channel isn't played here.
          setTimeout(function () {
            if (player.slots[at] !== slot) return;
            TV.currentChannel(function (cur) {
              if (player.slots[at] !== slot || !cur) return;
              player.current = cur.id;
              player.currentAt = Date.now();
              var mine = cards[at] && cards[at].channel;
              if (mine && mine.id !== cur.id) { stopSlot(at); placePlayer(); }   // the tuner's card takes it
              else if (!player.learned) { player.learned = true; learnProgram(); }
            });
          }, 1500);
        }
      }
      if (src.kind === 'sample') { works(); return; }
      v.addEventListener('playing', works);
      v.addEventListener('loadeddata', works);
      v.addEventListener('error', function () {
        if (player.slots[at] !== slot) return;
        player.failed[key] = true;
        stopSlot(at);
      }, true);
    }, delay);
  }

  /** What's on the tuned channel, now that it's playing: the TV tells it for that one only. */
  function learnProgram() {
    TV.nowOnTuner(function (res) {
      if (!res || !res.program || !liveChannels) return;
      for (var i = 0; i < liveChannels.length; i++) {
        if (liveChannels[i].id === res.channelId) liveChannels[i].program = res.program;
      }
      if (st.tab === 0) renderLive();
    });
  }

  function renderCards() {
    setClass(body, 'catalog', st.tab !== 0);
    setClass(body, 'night', Data.isNight(Date.now()) || st.tab !== 0);
    if (st.tab === 0) { renderLive(); return; }
    renderCatalog();
  }

  // MARK: - Movies and Shows: as on Netflix, the focused title large at the top and rows of titles below
  //
  // A tab's titles are fetched only when it's opened (Data.catalog). The rows scroll up and the focused row's titles
  // to the left; only the photos near the focus are loaded (small ones, w300), and the large one waits until the focus
  // rests on a title.

  var catalog = null, catalogKind = '', drawnFor = null, drawnRows = 0;
  var ITEM_STEP = 360, ROW_H = 300, ROW_TOP = 620;

  function renderCatalog() {
    var kind = TAB_KIND[st.tab];
    setClass(body, 'no-picks', false);
    if (cards.length) { cards = []; $('cards').innerHTML = ''; liveIds = ''; }
    backdrop('');
    if (kind !== catalogKind) {
      catalogKind = kind;
      catalog = null;
      st.crow = 0;
      st.ccol = [];
      heroFor = null;
    }
    Data.catalog(kind, function (c) {
      if (catalogKind !== kind || st.tab === 0) return;
      catalog = c;
      drawCatalog();
    });
    drawCatalog();
  }

  function drawCatalog() {
    var holder = $('rows'), msg = $('catalog').querySelector('.msg');
    if (!catalog || drawnFor !== catalog) { holder.innerHTML = ''; drawnFor = catalog; drawnRows = 0; }
    var rows = catalog ? catalog.rows : [];
    for (var r = drawnRows; r < rows.length; r++) {
      var row = el('div', 'crow', holder);
      row.style.top = r * ROW_H + 'px';
      el('div', 'ctitle', row, rows[r].title);
      var strip = el('div', 'strip', row);
      for (var i = 0; i < rows[r].items.length; i++) {
        var node = el('div', 'item', strip);
        node.style.left = i * ITEM_STEP + 'px';
        el('div', 'thumb', node);
        el('div', 'label', node, rows[r].items[i].title);
        hover(node, Z.CATALOG, r * 1000 + i);
      }
    }
    drawnRows = rows.length;
    st.crow = Math.max(0, Math.min(st.crow, rows.length - 1));
    msg.textContent = rows.length ? '' : catalog && catalog.error === 'no key'
        ? tr('Add a free TMDB key to config.properties to see movies and shows here.')
        : catalog && catalog.error ? trf("Couldn't load the titles: {error}", {error: catalog.error}) : tr('Loading…');
    if (!rows.length && st.zone === Z.CATALOG) { st.zone = Z.TOP; st.top = st.tab; }
    updateFocus();
  }

  function focusedItem() {
    var row = catalog && catalog.rows[st.crow];
    return row ? row.items[st.ccol[st.crow] || 0] : null;
  }

  /** Moves the rows and the focused row's titles, loads the photos near the focus, and shows the focused title on top. */
  function placeCatalog() {
    if (st.tab === 0 || !catalog) return;
    var rows = $('rows').children;
    $('rows').style.webkitTransform = $('rows').style.transform = 'translateY(' + (ROW_TOP - st.crow * ROW_H) + 'px)';
    for (var r = 0; r < rows.length; r++) {
      setClass(rows[r], 'gone', r < st.crow);
      var col = st.ccol[r] || 0, first = Math.max(0, col - 1), items = rows[r].lastChild.children;
      rows[r].lastChild.style.webkitTransform = rows[r].lastChild.style.transform = 'translateX(' + (-first * ITEM_STEP) + 'px)';
      for (var i = 0; i < items.length; i++) {
        setClass(items[i], 'focus', st.zone === Z.CATALOG && r === st.crow && i === col);
        // Only the photos on screen, and a little around it, are loaded.
        if (!items[i].loaded && r >= st.crow - 1 && r <= st.crow + 2 && i >= first - 1 && i <= first + 6) {
          var p = catalog.rows[r].items[i];
          items[i].loaded = true;
          if (p.backdrop) items[i].firstChild.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'w300') + ')';
        }
      }
    }
    showHero(focusedItem());
  }

  var heroFor = null, heroTimer = 0;

  /** The title on top: its name, year, rating, genres, app and story now; its large photo once the focus rests. */
  function showHero(p) {
    var hero = $('hero');
    if (p === heroFor) return;
    heroFor = p;
    clearTimeout(heroTimer);
    var info = hero.querySelector('.info');
    info.innerHTML = '';
    setClass(hero.firstChild, 'on', false);
    if (!p) return;
    el('div', 'htitle', info, p.title);
    var meta = el('div', 'hmeta', info), parts = [];
    if (p.year) parts.push(p.year);
    if (p.rating) parts.push('★ ' + (Math.round(p.rating * 10) / 10).toFixed(1));
    var names = catalog && catalog.genreNames;
    for (var g = 0; names && g < p.genres.length && g < 2; g++) if (names[p.genres[g]]) parts.push(names[p.genres[g]]);
    el('span', '', meta, parts.join('  ·  '));
    if (p.service) el('span', 'svc', meta, p.service);
    el('div', 'story', info, p.overview);
    heroTimer = setTimeout(function () {
      if (heroFor !== p || !p.backdrop) return;
      var url = Data.image(p.backdrop, 'w1280'), img = new Image();
      img.onload = function () {
        if (heroFor !== p) return;
        hero.firstChild.style.backgroundImage = 'url(' + url + ')';
        setClass(hero.firstChild, 'on', true);
      };
      img.src = url;
    }, 400);
  }

  /** OK on a title: opens the app it's on. */
  function openTitle(p) {
    if (!p) return;
    Data.whereToWatch(p, function (app) {
      if (app) launcher(app.id, app.title)();
      else toast(trf("{title} isn't on this TV's apps.", {title: p.title}));
    });
  }

  var bgUrl = null, bgFront = 'bgA';

  /** The first pick's photo as the background: drawn tiny and stretched, it's already as soft as a heavy blur. */
  function backdrop(url) {
    if (url === bgUrl) return;
    bgUrl = url;
    var next = bgFront === 'bgA' ? 'bgB' : 'bgA';
    if (!url) {
      setClass($('bgA'), 'on', false);
      setClass($('bgB'), 'on', false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      var canvas = $(next), ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setClass(canvas, 'on', true);
      setClass($(bgFront), 'on', false);
      bgFront = next;
    };
    img.src = url;
  }

  function renderClock() {
    var d = new Date(), c = $('clock');
    c.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    c.lastChild.textContent = formatDate('format|EEEE, MMMM d', d.getTime());
    $('topclock').textContent = formatDate('format|h:mm', d.getTime());
    if (st.tab === 0 && cards[0] && cards[0].live) renderLive();   // the programs' progress, every minute
  }

  /** On the minute, so the clock never runs late (the 30-second refresh could, by up to 30 s). */
  function tickClock() {
    renderClock();
    setTimeout(tickClock, 60000 - Date.now() % 60000 + 50);
  }

  // MARK: - Shelf

  var shelfFirst = 0, tileStep = 0, tileLeft = 0;

  function renderShelf() {
    var n = Math.min(shelf.length, SHELF_VISIBLE), gap = 48, pad = 40;
    // 16:9 tiles: never taller than 126, and the glass keeps its bottom edge.
    var tw = Math.min(126 * 16 / 9, (1760 - Math.max(0, n - 1) * gap) / Math.max(1, n)), th = tw * 9 / 16;
    var width = n * tw + Math.max(0, n - 1) * gap, left = (1920 - width) / 2;
    var platter = $('platter');
    platter.style.display = n ? '' : 'none';
    platter.style.left = (left - pad) + 'px';
    platter.style.width = (width + 2 * pad) + 'px';
    platter.style.top = (814 + 126 - th) + 'px';
    platter.style.height = (th + 2 * pad) + 'px';
    var tiles = $('tiles');
    tiles.innerHTML = '';
    tileStep = tw + gap;
    tileLeft = left;
    shelfFirst = Math.max(0, Math.min(shelfFirst, shelf.length - n));
    for (var i = 0; i < shelf.length; i++) {
      var t = el('div', 'tile', tiles);
      t.style.top = (854 + 126 - th) + 'px';
      t.style.width = tw + 'px';
      t.style.height = th + 'px';
      face(shelf[i], t, wordFit(shelf[i].title, tw, 30));
      hover(t, Z.SHELF, i);
    }
    // More apps than fit: a small arrow inside the glass's edge on each side that has more, where no tile reaches
    // even focused (inside the screen's safe area).
    platter.innerHTML = '';
    for (var a = 0; a < 2; a++) {
      var arrow = sym('chevron_right', platter);
      arrow.className += a ? ' more' : ' more back';
      arrow.style.left = (a ? width + 2 * pad - 14 : 14) - 8.5 + 'px';
      arrow.style.top = (pad + th / 2 - 8.5) + 'px';
    }
    st.shelf = Math.min(st.shelf, Math.max(0, shelf.length - 1));
    placeTiles();
  }

  /** The row slides (a transform on #tiles, which old TVs animate), and the apps it takes past the glass fade out. */
  function placeTiles() {
    var row = $('tiles'), tiles = row.children, n = Math.min(shelf.length, SHELF_VISIBLE);
    for (var i = 0; i < shelf.length; i++) {
      var shown = i >= shelfFirst && i < shelfFirst + n;
      tiles[i].style.left = (tileLeft + i * tileStep) + 'px';
      tiles[i].style.opacity = shown ? '' : '0';
      tiles[i].style.pointerEvents = shown ? '' : 'none';
    }
    row.style.webkitTransform = row.style.transform = 'translateX(' + (-shelfFirst * tileStep) + 'px)';
    var arrows = $('platter').children;
    arrows[0].style.visibility = shelfFirst > 0 ? '' : 'hidden';
    arrows[1].style.visibility = shelfFirst + n < shelf.length ? '' : 'hidden';
  }

  /** Scrolls the shelf, one app at a time, so the focused app is shown. */
  function revealShelf() {
    var n = Math.min(shelf.length, SHELF_VISIBLE);
    var first = Math.max(0, Math.min(Math.max(shelfFirst, st.shelf - n + 1), Math.min(st.shelf, shelf.length - n)));
    if (first === shelfFirst || !shelf.length) return;
    shelfFirst = first;
    placeTiles();
  }

  // MARK: - Drawer

  var drawerItems = [], drawerInputs = 0;

  function renderDrawer() {
    var d = $('drawer');
    d.innerHTML = '';
    drawerItems = [];
    for (var i = 0; i < inputs.length; i++) {
      var x = inputs[i];
      drawerItems.push({label: x.label || tr('Live TV'), symbol: x.symbol, off: !x.connected, run: launcher(x.id, x.label)});
    }
    drawerInputs = drawerItems.length;
    if (IPTV.enabled) drawerItems.push({label: tr('IPTV'), symbol: 'live_tv', run: function () { closeDrawer(); IPTV.open(); }});
    drawerItems.push({label: tr('All Apps'), symbol: 'apps', run: openApps});
    drawerItems.push({label: tr('Home Settings'), symbol: 'settings', run: openSettings});
    drawerItems.push({label: tr('TV Settings'), symbol: 'tv_settings', run: tvSettings});
    var n = drawerItems.length, gap = 18, groupGap = 56, groups = drawerInputs > 0 && drawerInputs < n ? 2 : 1;
    var tw = Math.min(230, (1760 - Math.max(0, n - groups) * gap - (groups - 1) * groupGap) / Math.max(1, n));
    var xPos = 80;
    for (var k = 0; k < n; k++) {
      if (k === drawerInputs && k > 0) {
        xPos += groupGap - gap;
        el('div', 'row-title', d, tr('Shortcuts')).style.left = (xPos + 4) + 'px';
      }
      if (k === 0 && drawerInputs) el('div', 'row-title', d, tr('Inputs')).style.left = '84px';
      var item = drawerItems[k], key = el('div', 'key glass' + (item.off ? ' off' : ''), d);
      key.style.left = xPos + 'px';
      key.style.width = tw + 'px';
      sym(item.symbol, key);
      el('div', 'label', key, item.label);
      hover(key, Z.DRAWER, k);
      xPos += tw + gap;
    }
    renderPanels();
    updateFocus();
  }

  function renderPanels() {
    var d = $('drawer');
    var old = d.querySelectorAll('.panel');
    for (var o = 0; o < old.length; o++) d.removeChild(old[o]);
    if (Prefs.weather()) {
      var w = el('div', 'panel glass', d);
      w.id = 'weather';
      w.style.left = '80px';
      w.style.width = '1760px';
      renderWeather(w);
    }
  }

  function renderWeather(card) {
    el('div', 'head', card, Data.city || tr('Weather'));
    var w = Data.weather;
    if (!w) {
      el('div', 'cond', card, tr('No weather data right now.')).style.top = '96px';
      return;
    }
    var now = el('div', 'now', card);
    sym(Data.symbol(w.code, w.isDay), now);
    el('span', 'temp', now, Data.degrees(w.temp));
    el('div', 'cond', card, Data.condition(w.code, w.isDay));
    el('div', 'range', card, trf('H:{max}', {max: Data.degrees(w.max)}) + '   ' + trf('L:{min}', {min: Data.degrees(w.min)}));
    el('div', 'split', card);
    var hours = el('div', 'hours', card), width = parseFloat(card.style.width) - 30 - 422, hw = width / 6;
    for (var i = 0; i < w.hours.length && i < 6; i++) {
      var h = el('div', 'hour', hours), x = w.hours[i];
      h.style.left = (hw * i) + 'px';
      h.style.width = hw + 'px';
      el('div', 't', h, Data.hour(x.at));
      sym(Data.symbol(x.code, x.day), h);
      el('div', 'd', h, Data.degrees(x.temp));
    }
    var sun = el('div', 'sun', card);
    if (w.sunrise) { var a = el('span', '', sun); sym('sunrise', a); a.appendChild(document.createTextNode(trf('Sunrise {time}', {time: Data.time(w.sunrise)}))); }
    if (w.sunset) { var b = el('span', '', sun); sym('sunset', b); b.appendChild(document.createTextNode(trf('Sunset {time}', {time: Data.time(w.sunset)}))); }
  }

  function openDrawer() {
    if (!drawerItems.length) return;
    var tiles = $('tiles').children;
    st.zone = Z.DRAWER;
    st.drawer = Math.min(drawerItems.length - 1, nearest(document.querySelectorAll('#drawer .key'), centerX(tiles[st.shelf])));
    updateFocus();
  }

  function closeDrawer() {
    var keys = document.querySelectorAll('#drawer .key');
    st.zone = Z.SHELF;
    if (shelf.length) st.shelf = nearest($('tiles').children, centerX(keys[st.drawer]));
    updateFocus();
  }

  // MARK: - All Apps

  function renderApps() {
    var sheet = $('apps');
    sheet.firstChild.textContent = tr('All Apps');
    var grid = sheet.lastChild;
    grid.innerHTML = '';
    for (var i = 0; i < others.length; i++) {
      var r = Math.floor(i / 5), c = i % 5, cell = el('div', 'cell', grid);
      cell.style.left = (130 + c * 340) + 'px';
      cell.style.top = (196 + r * 239) + 'px';
      face(others[i], el('div', 'face', cell), wordFit(others[i].title, 300, 34));
      el('div', 'label', cell, others[i].title);
      hover(cell, Z.APPS, i);
    }
  }

  function openApps() {
    renderApps();
    st.zone = Z.APPS;
    st.grid = 0;
    setClass($('apps'), 'open', true);
    updateFocus();
  }

  function closeSheets() {
    setClass($('apps'), 'open', false);
    setClass($('settings'), 'open', false);
    setClass($('shelfedit'), 'open', false);
    setClass($('langpick'), 'open', false);
    langHint = null;
    st.zone = Z.SHELF;
    updateFocus();
  }

  // MARK: - Home Settings

  function settingRows() {
    var unit = Prefs.temperature(), theme = Prefs.theme();
    var auto = tr('Automatic'), picked = pickedLanguage();
    var rows = [
      {label: tr('Language'), value: picked === 'auto' ? auto : I18N.languageName(picked), opens: true, language: true,
        step: function (d) { if (d >= 0) openLanguages(); }},
      {label: tr('Temperature'), value: unit === 'C' ? '°C' : unit === 'F' ? '°F' : tr('unit|Automatic'),
        step: function (d) { cycle('temperature', ['auto', 'C', 'F'], unit, d); renderPanels(); }},
      {label: tr('Theme'), value: theme === 'light' ? tr('Light') : theme === 'dark' ? tr('Dark') : auto,
        step: function (d) { cycle('theme', ['auto', 'light', 'dark'], theme, d); checkNight(); }},
      {label: tr('Weather widget'), toggle: Prefs.weather(),
        step: function () { Prefs.set('weather', !Prefs.weather()); renderPanels(); }}
    ];
    rows.push({label: tr('Shelf'), value: '›', step: function (d) { if (d >= 0) openShelfEdit(); }});
    rows.push({label: tr('TV Settings'), value: '›', step: function (d) { if (d >= 0) tvSettings(); }});
    return rows;
  }

  function cycle(name, values, current, d) {
    var i = values.indexOf(current);
    Prefs.set(name, values[(i + (d || 1) + values.length) % values.length]);
  }

  var rowsNow = [];

  function renderSettings() {
    var box = $('settings').firstChild;
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('settings', title);
    title.appendChild(document.createTextNode(tr('Home Settings')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    rowsNow = settingRows();
    list.style.height = Math.min(rowsNow.length, 7) * 78 + 'px';
    for (var i = 0; i < rowsNow.length; i++) {
      var r = rowsNow[i], row = el('div', 'row' + (r.dim ? ' dim' : ''), holder, r.label);
      if (r.toggle !== undefined) setClass(el('div', 'toggle', row), 'on', r.toggle);
      else {
        var v = el('span', 'value', row);
        if (r.value === '›') v.textContent = '›';
        else if (r.opens) { v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
        else { el('span', 'chev', v, '‹'); v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
      }
      hover(row, Z.SETTINGS, i);
    }
    el('div', 'hint', box, tr('OK or the arrows change the value.'));
    updateFocus();
  }

  function openSettings() {
    st.zone = Z.SETTINGS;
    st.row = 0;
    renderSettings();
    setClass($('settings'), 'open', true);
    updateFocus();
  }

  // MARK: - Language: a list of every catalogue in its own name (moving through it doesn't switch the app)

  var langHint = null;

  function languageChoices() {
    return ['auto'].concat(I18N.languages());
  }

  /** The language in use: "auto", or the catalogue the setting resolved to ("pt-BR" in config.properties is "pt"). */
  function pickedLanguage() {
    return Prefs.language() === 'auto' ? 'auto' : I18N.lang;
  }

  function renderLanguages() {
    var box = $('langpick').firstChild, choices = languageChoices(), current = choices.indexOf(pickedLanguage());
    box.innerHTML = '';
    el('div', 'title', box, tr('Language'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(choices.length, 7) * 78 + 'px';
    for (var i = 0; i < choices.length; i++) {
      var row = el('div', 'row', holder, choices[i] === 'auto' ? tr('Automatic') : I18N.languageName(choices[i]));
      if (i === current) sym('check', el('span', 'value', row));
      hover(row, Z.LANG, i);
    }
    langHint = el('div', 'hint', box);
    updateFocus();
  }

  function openLanguages() {
    setClass($('settings'), 'open', false);
    st.zone = Z.LANG;
    st.lang = Math.max(0, languageChoices().indexOf(pickedLanguage()));
    renderLanguages();
    setClass($('langpick'), 'open', true);
    updateFocus();
  }

  /** OK: the language under the focus; Back: none. Either way, back to Home Settings, on the Language row. */
  function closeLanguages(pick) {
    setClass($('langpick'), 'open', false);
    langHint = null;
    var code = languageChoices()[st.lang];
    if (pick && code !== pickedLanguage()) {
      Prefs.set('language', code);
      I18N.set(Prefs.language());
      renderAll();
      Data.refresh();   // the picks' titles and genres come in the new language
    }
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].language) st.row = i;
    updateFocus();
  }

  // MARK: - Shelf editor: which apps, in what order

  function editList() {
    var ids = shelf.map(function (a) { return a.id; });
    return {ids: ids, rows: apps.slice().sort(function (a, b) {
      var ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    })};
  }

  function renderShelfEdit() {
    var box = $('shelfedit').firstChild, e = editList();
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('apps', title);
    title.appendChild(document.createTextNode(tr('Shelf')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(e.rows.length, 7) * 78 + 'px';
    for (var i = 0; i < e.rows.length; i++) {
      var a = e.rows[i], at = e.ids.indexOf(a.id), row = el('div', 'row', holder, a.title);
      var place = el('span', 'value', row, at >= 0 ? '#' + (at + 1) : tr('shelf|Off'));
      if (at >= 0) sym('check', place).style.marginLeft = '16px';   // on the shelf: a check, as in the pickers
      hover(row, Z.EDIT, i);
    }
    el('div', 'hint', box, tr('OK adds or removes an app. ← → change the order.'));
    updateFocus();
  }

  function openShelfEdit() {
    setClass($('settings'), 'open', false);
    st.zone = Z.EDIT;
    st.edit = 0;
    renderShelfEdit();
    setClass($('shelfedit'), 'open', true);
    updateFocus();
  }

  function editShelf(dx) {
    var e = editList(), app = e.rows[st.edit];
    if (!app) return;
    var ids = e.ids.slice(), at = ids.indexOf(app.id);
    if (dx === 0) {
      if (at >= 0) ids.splice(at, 1);
      else ids.push(app.id);
    } else {
      if (at < 0) return;
      var to = Math.max(0, Math.min(ids.length - 1, at + dx));
      ids.splice(at, 1);
      ids.splice(to, 0, app.id);
    }
    Prefs.set('shelf', ids);
    pickShelf();
    renderShelf();
    var again = editList();
    for (var i = 0; i < again.rows.length; i++) if (again.rows[i].id === app.id) st.edit = i;
    renderShelfEdit();
  }

  // MARK: - Opening things

  function launcher(id, name) {
    return function () {
      TV.launch(id, null, function (ok) {
        if (!ok) toast(trf("Couldn't open {app}.", {app: name || id}));
      });
    };
  }

  function tvSettings() {
    TV.settings(function (ok) {
      if (!ok) toast(tr("Couldn't open TV Settings"));
    });
  }

  function liveTV() {
    for (var i = 0; i < inputs.length; i++) if (inputs[i].key === 'live') return inputs[i];
    return null;
  }

  function activate() {
    switch (st.zone) {
      case Z.TOP:
        if (st.top < 3) return;
        if (st.top === 3) { var live = liveTV(); if (live) launcher(live.id, tr('Live TV'))(); }
        else if (st.top === 4) { st.zone = Z.SHELF; openDrawer(); st.drawer = 1 < drawerInputs ? 1 : 0; updateFocus(); }
        else openSettings();
        return;
      case Z.CARDS:
        var p = cards[st.card];
        if (p && p.live) {
          var ch = p.channel;
          if (ch && ch.iptv) { stopPlayer(); IPTV.playChannel(ch.iptv); }
          else if (ch) TV.openChannel(ch, function (ok) { if (!ok) toast(trf("Couldn't open {app}.", {app: ch.name})); });
          else { var tv = liveTV(); if (tv) launcher(tv.id, tr('Live TV'))(); }
          return;
        }
        var app = p && Data.appFor(p.app);
        if (app) launcher(app.id, app.title)();
        return;
      case Z.CATALOG:
        openTitle(focusedItem());
        return;
      case Z.SHELF:
        if (shelf[st.shelf]) launcher(shelf[st.shelf].id, shelf[st.shelf].title)();
        return;
      case Z.DRAWER:
        if (drawerItems[st.drawer]) drawerItems[st.drawer].run();
        return;
      case Z.APPS:
        if (others[st.grid]) launcher(others[st.grid].id, others[st.grid].title)();
        return;
      case Z.SETTINGS:
        if (rowsNow[st.row]) { rowsNow[st.row].step(1); if (st.zone === Z.SETTINGS) renderSettings(); }
        return;
      case Z.EDIT:
        editShelf(0);
        return;
      case Z.LANG:
        closeLanguages(true);
        return;
    }
  }

  function selectTab(i) {
    if (i === st.tab) return;
    st.tab = i;
    renderCards();
  }

  function move(dx, dy) {
    var tiles = $('tiles').children, cardNodes = $('cards').children;
    switch (st.zone) {
      case Z.SHELF:
        if (dx) st.shelf = Math.max(0, Math.min(shelf.length - 1, st.shelf + dx));
        else if (dy > 0) { openDrawer(); return; }
        else if (dy < 0) {
          if (cards.length) {
            st.zone = Z.CARDS;
            st.card = nearest(cardNodes, centerX(tiles[st.shelf]));
            if (st.tab === 0 && st.card === 1 && cards.length > 2) st.card = 2;   // the lower of the stacked channels
          }
          else { st.zone = Z.TOP; st.top = st.tab; }
        }
        break;
      case Z.CARDS:
        if (st.tab === 0 && cards.length > 1) {
          // The big channel on the left, the other two stacked on the right.
          if (dx > 0 && st.card === 0) st.card = 1;
          else if (dx < 0 && st.card > 0) st.card = 0;
          else if (dy > 0 && st.card === 1 && cards.length > 2) st.card = 2;
          else if (dy < 0 && st.card === 2) st.card = 1;
          else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
          else if (dy > 0 && shelf.length) { st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX(cardNodes[st.card])); }
          break;
        }
        if (dx) st.card = Math.max(0, Math.min(cards.length - 1, st.card + dx));
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        else if (shelf.length) { st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX(cardNodes[st.card])); }
        break;
      case Z.CATALOG:
        var row = catalog && catalog.rows[st.crow];
        if (dx && row) st.ccol[st.crow] = Math.max(0, Math.min(row.items.length - 1, (st.ccol[st.crow] || 0) + dx));
        else if (dy > 0 && st.crow < catalog.rows.length - 1) st.crow++;
        else if (dy < 0 && st.crow > 0) st.crow--;
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        break;
      case Z.TOP:
        if (dx) {
          st.top = Math.max(0, Math.min(5, st.top + dx));
          if (st.top < 3) selectTab(st.top);   // as on Apple TV: focusing a tab selects it
        } else if (dy > 0 && st.tab !== 0) {
          if (catalog && catalog.rows.length) st.zone = Z.CATALOG;
        } else if (dy > 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = Math.min(cards.length - 1, st.top < 3 ? 0 : cards.length - 1); }
          else st.zone = Z.SHELF;
        }
        break;
      case Z.DRAWER:
        if (dx) st.drawer = Math.max(0, Math.min(drawerItems.length - 1, st.drawer + dx));
        else if (dy < 0) { closeDrawer(); return; }
        break;
      case Z.APPS:
        var g = st.grid + dx + dy * 5;
        if (g >= 0 && g < others.length && (dx === 0 || Math.floor(g / 5) === Math.floor(st.grid / 5))) st.grid = g;
        break;
      case Z.SETTINGS:
        if (dy) st.row = Math.max(0, Math.min(rowsNow.length - 1, st.row + dy));
        else if (dx && rowsNow[st.row]) {
          var r = rowsNow[st.row];
          if (r.value !== '›') { r.step(dx); if (st.zone === Z.SETTINGS) renderSettings(); }
        }
        break;
      case Z.EDIT:
        if (dy) st.edit = Math.max(0, Math.min(apps.length - 1, st.edit + dy));
        else if (dx) editShelf(dx);
        break;
      case Z.LANG:
        if (dy) st.lang = Math.max(0, Math.min(languageChoices().length - 1, st.lang + dy));
        break;
    }
    updateFocus();
  }

  function back() {
    if (st.zone === Z.EDIT) { setClass($('shelfedit'), 'open', false); openSettings(); st.row = rowsNow.length - 2; updateFocus(); return; }
    if (st.zone === Z.LANG) { closeLanguages(false); return; }
    if (sheetOpen()) { closeSheets(); return; }
    if (st.zone === Z.DRAWER) { closeDrawer(); return; }
    // Movies and Shows: Back goes up to the tabs, then to TV aberta.
    if (st.zone === Z.CATALOG) { st.zone = Z.TOP; st.top = st.tab; updateFocus(); return; }
    if (st.tab !== 0) { selectTab(0); st.zone = Z.SHELF; updateFocus(); return; }
    if (st.zone !== Z.SHELF && shelf.length) { st.zone = Z.SHELF; updateFocus(); return; }
    TV.back();
  }

  /** The pointer focuses what it's over (the Magic Remote, or a mouse when previewing). */
  function hover(node, zone, index) {
    node.onmouseover = function () {
      if (saverOn || (sheetOpen() !== (zone === Z.APPS || zone === Z.SETTINGS || zone === Z.EDIT || zone === Z.LANG))) return;
      if (zone === Z.DRAWER && st.zone !== Z.DRAWER) return;
      if (zone !== Z.DRAWER && st.zone === Z.DRAWER && zone !== Z.SHELF) return;
      if (zone === Z.SHELF && st.zone === Z.DRAWER) closeDrawer();
      st.zone = zone;
      if (zone === Z.TOP) { st.top = index; if (index < 3) selectTab(index); }
      else if (zone === Z.CARDS) st.card = index;
      else if (zone === Z.CATALOG) { st.crow = Math.floor(index / 1000); st.ccol[st.crow] = index % 1000; }
      else if (zone === Z.SHELF) st.shelf = index;
      else if (zone === Z.DRAWER) st.drawer = index;
      else if (zone === Z.APPS) st.grid = index;
      else if (zone === Z.SETTINGS) st.row = index;
      else if (zone === Z.EDIT) st.edit = index;
      else if (zone === Z.LANG) st.lang = index;
      updateFocus();
    };
    node.onclick = function () { node.onmouseover(); activate(); };
  }

  // MARK: - Toast

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    setClass(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { setClass(t, 'on', false); }, 6000);
  }

  // MARK: - Night, clock, screensaver

  var lastNight = null;

  function checkNight() {
    var night = Data.isNight(Date.now());
    setClass(body, 'night', night || st.tab !== 0);   // Movies and Shows are always dark, as on Netflix
    if (night === lastNight) return;
    lastNight = night;
    document.documentElement.style.background = night ? '#020617' : '';
    try { localStorage.setItem('fmtv.night', night ? 'true' : 'false'); } catch (e) {}   // for index.html, next start
  }

  var saverOn = false, idleAt = Date.now(), saverIndex = 0, saverTimer = 0, SAVER_AFTER = 5 * 60000;

  /** The screensaver's photos: picks with an app on the TV. */
  function saverPhotos() {
    return Data.showcase().filter(function (p) { return p.backdrop && Data.appFor(p.app); });
  }

  function showSaver() {
    var photos = saverPhotos();
    saverOn = true;
    stopPlayer();
    var s = $('saver');
    s.innerHTML = '';
    var a = el('div', 'photo', s), b = el('div', 'photo', s);
    el('div', 'shade', s);
    var clock = el('div', 'clock', s);
    el('div', 'time', clock);
    el('div', 'date', clock);
    el('div', 'title', clock);
    var front = a;
    function next() {
      if (!saverOn) return;
      var p = photos.length ? photos[saverIndex++ % photos.length] : null;
      var back = front === a ? b : a;
      if (p) {
        // w1280 rather than the original (up to 4K): the same on a TV's screen, a fraction of the download and memory
        back.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'w1280') + ')';
        back.style.webkitTransform = back.style.transform = 'scale(1.0)';
        clock.lastChild.textContent = p.title;
        setTimeout(function () {
          setClass(back, 'on', true);
          setClass(front, 'on', false);
          back.style.webkitTransform = back.style.transform = 'scale(1.08) translateX(-1.5%)';
          front = back;
        }, 60);
      }
      tickSaverClock(clock);
      saverTimer = setTimeout(next, 12000);
    }
    setClass(s, 'on', true);
    next();
  }

  function tickSaverClock(clock) {
    var d = new Date();
    clock.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    clock.children[1].textContent = formatDate('format|EEEE, MMMM d', d.getTime());
  }

  function hideSaver() {
    saverOn = false;
    clearTimeout(saverTimer);
    setClass($('saver'), 'on', false);
    if (st.tab === 0 && cards[0] && cards[0].live) placePlayer();
  }

  function poke() {
    idleAt = Date.now();
    if (saverOn) { hideSaver(); return true; }
    return false;
  }

  // MARK: - Keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (poke()) { e.preventDefault(); return; }   // the first press only wakes the screen
    if (k === TV.keys.left) move(-1, 0);
    else if (k === TV.keys.right) move(1, 0);
    else if (k === TV.keys.up) move(0, -1);
    else if (k === TV.keys.down) move(0, 1);
    else if (k === TV.keys.ok) activate();
    else if (k === TV.keys.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function () { poke(); });

  // MARK: - Start

  function renderAll() {
    renderTop();
    cards = [];
    renderCards();
    renderShelf();
    renderDrawer();
    renderClock();
    checkNight();
    if (st.zone === Z.SETTINGS) renderSettings();
    updateFocus();
  }

  /** hide_apps in config.properties: left out of the shelf, All Apps and the picks, by id or name (part of it). */
  var HIDE = (CONFIG.hideApps || []).map(function (s) { return s.toLowerCase(); });
  function hidden(app) {
    var id = (app.id || '').toLowerCase(), title = (app.title || '').toLowerCase();
    for (var i = 0; i < HIDE.length; i++) if (id.indexOf(HIDE[i]) >= 0 || title.indexOf(HIDE[i]) >= 0) return true;
    return false;
  }

  function loadApps(done) {
    TV.apps(function (list) {
      apps = list.filter(function (a) { return !hidden(a); });
      Data.setApps(apps);
      pickShelf();
      TV.inputs(function (list2) {
        inputs = list2;
        if (done) done();
        loadChannels();
      });
    });
  }

  /** Back to the home screen (the app was opened again): the shelf, everything closed, the first tab. */
  function reset() {
    hideSaver();
    closeSheets();
    st.zone = Z.SHELF;
    st.shelf = 0;
    if (st.tab !== 0) { st.tab = 0; renderCards(); }
    updateFocus();
  }

  Data.onChange(function () {
    renderCards();
    renderPanels();
    checkNight();
  });

  function reopened() {
    // LG: with handlesRelaunch the app has to come to the front itself, or opening it again while it runs shows nothing.
    if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    reset();
    loadApps(function () { renderShelf(); renderDrawer(); Data.refresh(); });
  }

  window.addEventListener('resize', fit);
  document.addEventListener('webOSRelaunch', reopened);   // LG: opened again while running
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPlayer();
      hideSaver();
      return;
    }
    player.currentAt = 0;   // back from the TV's own Live TV: the antenna may be on another channel
    idleAt = Date.now();
    loadApps(function () { renderShelf(); renderDrawer(); updateFocus(); Data.refresh(); });
  });

  I18N.set(Prefs.language());
  checkNight();   // now, from the last forecast: not after the TV lists its apps, with the day look until then
  // LG's screensaver waits only when ours will show: not under a sheet (ours waits there), and not without photos.
  TV.holdScreenSaver(function () { return IPTV.isOpen() || (!sheetOpen() && saverPhotos().length > 0); });
  fit();
  renderTop();
  tickClock();
  loadApps(function () {
    renderAll();
    Data.refresh();
  });
  setInterval(function () {
    checkNight();
    Data.refresh();
    if (Date.now() - channelsAt > 5 * 60000) loadChannels();   // what's on now, every 5 minutes
    if (IPTV.isOpen()) idleAt = Date.now();   // watching a channel: no screensaver
    if (!saverOn && !sheetOpen() && Date.now() - idleAt > SAVER_AFTER) showSaver();
    if (saverOn) tickSaverClock($('saver').querySelector('.clock'));
  }, 30000);

  // For the browser preview and tests.
  window.FreeMyTV = {state: st, move: move, activate: activate, back: back, showSaver: showSaver, hideSaver: hideSaver, toast: toast};
})();
