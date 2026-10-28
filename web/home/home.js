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
    ['iptv', /^com\.lennylxx\.iptv$/, /iptv/i, ['#241E52', '#000000']],
    ['spotify', /spotify/, /spotify/i, ['#1DB954', '#0F7A36']]
  ];
  // Apps shown at once: 8 (today's smallest tiles, 178 wide); the shelf scrolls for the rest.
  var SHELF_VISIBLE = 8;

  // MARK: - Logos

  // The TV's icons are small squares with their own background (white behind Netflix, black behind Max). The logo is
  // lifted off it once: the background goes transparent and the rest is cropped to the logo, which then fills the
  // tile on the brand's color.
  var lifted = {};   // icon url -> {src, bg: [r, g, b], ink: luminance histogram} or false (keep the icon as it is)
  var LIFT_SIZE = 240;

  // sRGB (0-255) to linear light, computed once: lift() needs it for every pixel, and old TVs are slow at Math.pow.
  var LINEAR = [];
  for (var li = 0; li < 256; li++) LINEAR[li] = li <= 10 ? li / 255 / 12.92 : Math.pow((li / 255 + 0.055) / 1.055, 2.4);

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

  function paint(box, top, bottom) {
    box.style.background = '-webkit-linear-gradient(top, ' + top + ', ' + bottom + ')';
    box.style.background = 'linear-gradient(' + top + ', ' + bottom + ')';
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

  // MARK: - Focus

  var Z = {TOP: 'top', CARDS: 'cards', CATALOG: 'catalog', DETAIL: 'detail', TRAKT: 'trakt', SHELF: 'shelf', DRAWER: 'drawer', APPS: 'apps', SETTINGS: 'settings', EDIT: 'edit', LANG: 'lang', REMINDER: 'reminder'};
  var st = {zone: Z.SHELF, top: 0, tab: 0, card: 0, crow: 0, ccol: [], trow: 0, shelf: 0, drawer: 0, grid: 0, row: 0, edit: 0, lang: 0, reminderAction: 0};
  var cards = [];
  var reminderAlert = null;
  var reminderReturnTab = 0, reminderReturnZone = Z.SHELF;

  function sheetOpen() { return st.zone === Z.APPS || st.zone === Z.SETTINGS || st.zone === Z.EDIT || st.zone === Z.LANG || st.zone === Z.TRAKT || st.zone === Z.REMINDER; }

  function updateFocus() {
    var i, list;
    // A page open over the tabs owns the keys and the pointer until Back closes it (only a sheet may sit over it):
    // whatever moved the focus elsewhere, nothing under it (the shelf, the drawer and its inputs) may show through.
    if (pages.length && !sheetOpen()) st.zone = Z.DETAIL;
    list = $('tabs').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.tab);
      setClass(list[i], 'focus', st.zone === Z.TOP && st.top === i);
    }
    list = $('buttons').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.TOP && st.top === NTABS + i);
    list = $('cards').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.CARDS && st.card === i);
    if (st.zone === Z.CARDS && cards[st.card] && cards[st.card].live) focusedCardId = cards[st.card].id;
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
    focusRows($('traktsheet'), st.trow, st.zone === Z.TRAKT);
    list = $('sportsalert').querySelectorAll('.alert-action');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.REMINDER && st.reminderAction === i);
    if (settingsAbout && rowsNow[st.row]) settingsAbout.textContent = rowsNow[st.row].about || '';
    if (st.zone === Z.EDIT) placeEdit();
    if (st.zone === Z.LANG) renderPicker();
    setClass(body, 'drawer-open', st.zone === Z.DRAWER);
    if (st.tab === 0 && cards[0] && cards[0].live && !pages.length) placePlayer();
    else if (player.slots.length) stopPlayer();
    placeCatalog();
    if (st.zone === Z.DETAIL) placeDetail();
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

  // The first tab is open TV (the channels, live); then today's games; then the movies and the shows from the TV's
  // apps. The round buttons on the right come after the tabs in the focus order (st.top).
  var TAB_KIND = ['live', 'sports', 'movie', 'tv'], NTABS = TAB_KIND.length;

  function renderTop() {
    $('title').textContent = '';
    var tabs = $('tabs');
    tabs.innerHTML = '';
    var names = [tr('light|Live TV'), tr('Sports'), tr('Movies'), tr('Shows')];
    for (var i = 0; i < NTABS; i++) {
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
      hover(r, Z.TOP, NTABS + b);
    }
  }

  // MARK: - Picks and background

  // MARK: - TV aberta: the channels, live (a big card and two small ones, as in smart_tv_ui.html)

  var liveChannels = null, liveProblem = '', channelsAt = 0;
  // The antenna big on the left; on the right an IPTV channel, and under it the button to all the list's channels.
  var LIVE_RECTS = [[80, 150, 1120, 560], [1232, 150, 608, 400], [1232, 574, 608, 136]];
  // Each channel's card color, by its name; others take the theme's purple.
  var CHANNEL_COLORS = [
    [/globo/i, ['#2563EB', '#1E1B4B']], [/sbt/i, ['#E11D48', '#4C0519']], [/record/i, ['#0EA5E9', '#082F49']],
    [/band/i, ['#16A34A', '#052E16']], [/cnn/i, ['#DC2626', '#1C0A0A']], [/cultura/i, ['#F59E0B', '#451A03']],
    [/rede ?tv/i, ['#7C3AED', '#1E1B4B']]
  ];

  /** The All channels button: a grid symbol, its name, how many channels the list has, and an arrow. */
  function drawAllChannels(card) {
    el('div', 'img', card);
    var icon = el('div', 'icon', card);
    sym('apps', icon);
    var text = el('div', 'text', card);
    el('div', 'title', text, tr('All channels'));
    var n = Channels.channels().length;
    el('div', 'sub', text, n ? plural('plural|one:{n} channel|other:{n} channels', n) : tr('Opens the IPTV Player'));
    sym('chevron_right', el('div', 'go', card));
  }

  // The channel the antenna is on, as the TV tells it ({id, number, name}); null until it does (or when it won't).
  var antennaChannel = null;

  /** The antenna card shows `ch` ({id, number, name}), with what's on now when the TV tells it. */
  function showAntennaChannel(ch) {
    if (!ch || (antennaChannel && antennaChannel.id === ch.id)) return;
    antennaChannel = ch;
    TV.nowOnTuner(function (res) {
      if (res && res.program && antennaChannel && res.channelId === antennaChannel.id) antennaChannel.program = res.program;
      for (var i = 0; st.tab === 0 && i < cards.length; i++) {
        if (!cards[i].antenna) continue;
        cards[i].channel = antennaChannel;
        var card = $('cards').children[i];
        if (card) {
          card.querySelector('.chan').textContent = channelName(antennaChannel.name) || tr('Live TV');
          var num = card.querySelector('.num') || (antennaChannel.number ? el('span', 'num', card.querySelector('.head')) : null);
          if (num) num.textContent = antennaChannel.number ? trf('Channel {n}', {n: antennaChannel.number}) : '';
          fillFoot(card.querySelector('.foot'), antennaChannel, i === 0);
        }
      }
    });
  }

  /** Fills a card's bottom: the program, its start and end with the progress between them, and (big) the time left. */
  function fillFoot(foot, ch, big) {
    var p = ch && ch.program, now = Date.now();
    foot.innerHTML = '';
    el('div', 'prog', foot, p && p.title ? p.title : ch ? '' : big ? tr('The channel the TV is on') : liveChannels ? noChannelsText() : tr('Loading channels…'));
    if (!p || !p.start || !p.end) return;
    var line = el('div', 'timeline', foot);
    el('span', 't', line, formatDate('format|h:mm', p.start));
    var bar = el('div', 'bar', line);
    el('div', 'fill', bar).style.width = Math.round(Math.max(0, Math.min(1, (now - p.start) / (p.end - p.start))) * 100) + '%';
    el('span', 't', line, formatDate('format|h:mm', p.end));
    if (big) el('div', 'left', foot, trf('{n} min left', {n: Math.max(1, Math.ceil((p.end - now) / 60000))}));
  }

  var liveIds = '', focusedCardId = '', allCount = 0;   // the channel card last focused, kept when the cards are drawn again

  /** The channel cards; when the same channels are on them, only their programs and progress change (the player stays). */
  function renderLive() {
    var list = liveCards(), holder = $('cards');
    var ids = list.map(function (x) { return x.id; }).join(',');
    setClass(body, 'no-picks', false);
    if (ids === liveIds && holder.children.length === list.length && cards[0] && cards[0].live && Channels.channels().length === allCount) {
      cards = list;
      for (var u = 0; u < list.length; u++) if (!list[u].all) fillFoot(holder.children[u].querySelector('.foot'), list[u].channel, u === 0);
      placePlayer();
      return;
    }
    liveIds = ids;
    allCount = Channels.channels().length;
    cards = list;
    holder.innerHTML = '';
    for (var c = 0; c < list.length; c++) {
      var ch = list[c].channel, r = liveRect(c), name = ch && ch.name ? channelName(ch.name) : tr('Live TV');
      var card = el('div', list[c].all ? 'card allch' : 'card live' + (c === 0 ? ' big' : ' small'), holder);
      card.style.left = r[0] + 'px';
      card.style.top = r[1] + 'px';
      card.style.width = r[2] + 'px';
      card.style.height = r[3] + 'px';
      if (list[c].all) { drawAllChannels(card); hover(card, Z.CARDS, c); continue; }
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
    // The focus stays on its channel when the cards are drawn again (the TV's list may come back in parts).
    for (var f = 0; f < list.length; f++) if (list[f].id === focusedCardId) st.card = f;
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

  function liveRect(i) {
    return LIVE_RECTS[i];
  }

  // MARK: - The player: one channel card plays at a time
  //
  // The focused channel card plays (the big one at first, then the last one focused while the focus is elsewhere);
  // the other shows its channel's logo and what's on. One at a time: this TV shows one picture at once (with the
  // antenna and an internet stream both playing, the antenna's stays black; two streams pause each other). A
  // failed or paused stream also leaves its card on the logo.

  // slots[i]: card i's player {video, key, ok, timer}; failed: the keys that didn't play (not tried again here);
  // active: the card that plays.
  var player = {slots: [], failed: {}, active: 0};

  function makeVideo(src) {
    var v = document.createElement('video');
    v.autoplay = true;
    if (src.tv) {
      var source = document.createElement('source');
      source.type = 'service/webos-broadcast';
      source.src = 'tv://';
      v.appendChild(source);
    } else {
      v.src = src.url;
    }
    v.className = 'cardplayer';
    return v;
  }

  /** Stops card i's picture and sound. */
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

  /** Stops every card. */
  function stopPlayer() {
    for (var i = 0; i < player.slots.length; i++) stopSlot(i);
    player.slots = [];
    player.failed = {};
  }

  /** The focused (or last focused) channel card plays; silent unless focused with card sound on. */
  function placePlayer() {
    if (st.tab !== 0 || saverOn || sheetOpen() || antenna) { stopPlayer(); return; }
    var delay = 0, order = [], i;
    if (st.zone === Z.CARDS && sourceFor(cards[st.card])) player.active = st.card;
    if (!sourceFor(cards[player.active])) {
      player.active = -1;
      for (i = 0; i < cards.length && player.active < 0; i++) if (sourceFor(cards[i])) player.active = i;
    }
    // The other cards stop first, then the one that plays starts: two pictures never overlap.
    for (i = 0; i < cards.length; i++) if (i !== player.active) order.push(i);
    if (player.active >= 0) order.push(player.active);
    for (i = cards.length; i < player.slots.length; i++) stopSlot(i);
    for (var o = 0; o < order.length; o++) {
      var at = order[o], src = at === player.active ? sourceFor(cards[at]) : null;
      var key = src ? cards[at].id + ':' + (src.tv ? 'tv' : src.url) : '';
      if (player.failed[key]) key = '';
      var slot = player.slots[at];
      if (slot && slot.key === key) {
        // The same channel goes on playing when the focus comes or goes: only its sound changes.
        if (slot.video) slot.video.muted = !(Prefs.cardSound() && st.zone === Z.CARDS && st.card === at);
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
      v.muted = !(Prefs.cardSound() && st.zone === Z.CARDS && st.card === at);
      var r = liveRect(at);
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
        if (src.tv) setTimeout(function () { if (player.slots[at] === slot) tuneAntenna(v); }, 1000);   // once it runs
      }
      v.addEventListener('playing', works);
      v.addEventListener('loadeddata', works);
      // Paused by the TV (another app or picture took its decoder): the logo, not a still black card.
      v.addEventListener('pause', function () {
        if (player.slots[at] !== slot) return;
        slot.ok = false;
        setClass($('cards').children[at], 'playing', false);
      });
      v.addEventListener('error', function () {
        if (player.slots[at] !== slot) return;
        player.failed[key] = true;
        stopSlot(at);
      }, true);
    }, delay);
  }

  function renderCards() {
    setClass(body, 'catalog', st.tab !== 0);
    if (st.tab === 0) { renderLive(); return; }
    renderCatalog();
  }

  // MARK: - Movies and Shows: as on Netflix, the focused title large at the top and rows of titles below
  //
  // A tab's titles are fetched only when it's opened (Data.catalog). The rows scroll up and the focused row's titles
  // to the left; only the photos near the focus are loaded (small ones, w300), and the large one waits until the focus
  // rests on a title.

  var catalog = null, catalogKind = '', drawnFor = null, drawnKey = '', drawnRows = 0;
  var sportReturnId = '';
  var ITEM_STEP = 360, ROW_H = 300, ROW_TOP = 620;

  function renderCatalog() {
    var kind = TAB_KIND[st.tab];
    Trakt.syncIfStale();
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
    if (kind === 'sports') {
      Sports.today(function (games, failed) {
        if (catalogKind !== kind) return;
        catalog = sportsCatalog(games, failed, null);
        restoreSportsFocus();
        drawCatalog();
        Sports.dailyEpg(function (epg) {
          if (catalogKind !== kind || st.tab === 0) return;
          catalog = sportsCatalog(games, failed, epg);
          restoreSportsFocus();
          drawCatalog();
        });
      });
    } else {
      Data.catalog(kind, function (c) {
        if (catalogKind !== kind || st.tab === 0) return;
        catalog = c;
        drawCatalog();
      });
    }
    drawCatalog();
  }

  /**
   * The tab's rows: My list first (the Trakt watchlist of this kind, with TMDB's photos as they come), then the
   * catalog's. Its titles come from Trakt with ids only; the missing photos are fetched once, then it's drawn again.
   */
  var myList = null, myListKey = '';

  function drawCatalog() {
    var holder = $('rows'), msg = $('catalog').querySelector('.msg');
    var rows = catalogRows(), shownKey = catalog && (myList ? myListKey : '');
    if (!catalog || drawnFor !== catalog || drawnKey !== shownKey) {
      holder.innerHTML = '';
      drawnFor = catalog;
      drawnKey = shownKey;
      drawnRows = 0;
    }
    for (var r = drawnRows; r < rows.length; r++) {
      var row = el('div', 'crow', holder);
      row.style.top = r * ROW_H + 'px';
      el('div', 'ctitle', row, rows[r].title);
      var strip = el('div', 'strip', row);
      for (var i = 0; i < rows[r].items.length; i++) {
        var node = el('div', 'item', strip);
        node.style.left = i * ITEM_STEP + 'px';
        if (rows[r].items[i].game) gameCard(node, rows[r].items[i].game);
        else if (rows[r].items[i].epg) epgCard(node, rows[r].items[i].epg);
        else if (rows[r].items[i].epgStatus) {
          el('div', 'epg-empty', node, rows[r].items[i].title);
        }
        else {
          el('div', 'thumb', node);
          el('div', 'label', node, rows[r].items[i].title);
        }
        hover(node, Z.CATALOG, r * 1000 + i);
      }
    }
    drawnRows = rows.length;
    st.crow = Math.max(0, Math.min(st.crow, rows.length - 1));
    msg.textContent = rows.length ? '' : catalog && catalog.sports
        ? (catalog.error ? tr("Couldn't load today's games.") : tr('No games today'))
        : catalog && catalog.error === 'no key'
        ? tr('Add a free TMDB key to config.properties to see movies and shows here.')
        : catalog && catalog.error ? trf("Couldn't load the titles: {error}", {error: catalog.error}) : tr('Loading…');
    if (!rows.length && st.zone === Z.CATALOG) { st.zone = Z.TOP; st.top = st.tab; }
    updateFocus();
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
          var p = catalogRows()[r].items[i];
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
    setClass(hero, 'sports', !!(p && p.game));
    if (!p) return;
    if (p.game) { gameHero(hero, info, p.game); return; }
    if (p.epg) { epgHero(hero, info, p.epg); return; }
    if (p.epgStatus) {
      el('div', 'gkicker', info, tr('BrazilTVEPG programming'));
      el('div', 'htitle', info, p.title);
      return;
    }
    el('div', 'htitle', info, p.title);
    var meta = el('div', 'hmeta', info), parts = [];
    if (p.year) parts.push(p.year);
    if (p.rating) parts.push('★ ' + (Math.round(p.rating * 10) / 10).toFixed(1));
    var names = catalog && catalog.genreNames;
    for (var g = 0; names && g < p.genres.length && g < 2; g++) if (names[p.genres[g]]) parts.push(names[p.genres[g]]);
    el('span', '', meta, parts.join('  ·  '));
    if (p.service) el('span', 'svc', meta, p.service);
    fitText(el('div', 'story', info, p.overview));
    heroTimer = setTimeout(function () {
      if (heroFor !== p) return;
      // The IMDb rating, first on the line, once the focus rests here (one request, then kept).
      Data.imdbRating(p, function (rating) {
        if (heroFor !== p || !rating) return;
        meta.insertBefore(el('span', 'imdb', null, 'IMDb ' + rating), meta.firstChild);
      });
      if (!p.backdrop) return;
      var url = Data.image(p.backdrop, 'w1280'), img = new Image();
      img.onload = function () {
        if (heroFor !== p) return;
        hero.firstChild.style.backgroundImage = 'url(' + url + ')';
        setClass(hero.firstChild, 'on', true);
      };
      img.src = url;
    }, 400);
  }

  // MARK: - Sports: today's games (Sports.today), as the catalog's rows: one row per sport
  //
  // The focused game is large on top (the teams' colors behind, the score); OK opens its channel in the IPTV player,
  // found in the lists by the broadcaster. Scores come again every minute while the tab is open.

  function sportName(sport) {
    return sport === 'soccer' ? tr('Football') : sport === 'basketball' ? tr('Basketball')
        : sport === 'racing' ? tr('Formula 1') : tr('Fights');
  }

  /** A row per sport: football first, then the one with the most games live; in a row, live games first, then by start. */
  function sportsCatalog(games, failed, epg) {
    var rows = [], bySport = {};
    for (var i = 0; i < games.length; i++) {
      var g = games[i], row = bySport[g.sport];
      if (!row) {
        row = bySport[g.sport] = {sport: g.sport, live: 0, items: []};
        rows.push(row);
      }
      if (g.state === 'live') row.live++;
      row.items.push({id: g.id, title: g.title, game: g});
    }
    rows.sort(function (a, b) {
      return (b.sport === 'soccer') - (a.sport === 'soccer') || b.live - a.live || b.items.length - a.items.length;
    });
    for (var r = 0; r < rows.length; r++) {
      var name = sportName(rows[r].sport);
      rows[r].title = rows[r].live ? trf('{sport} · {n} live', {sport: name, n: rows[r].live}) : name;
    }
    var epgItems = [], epgTitle = tr('BrazilTVEPG programming');
    if (epg && (epg.status === 'ok' || epg.status === 'stale')) {
      if (epg.status === 'stale') {
        var staleTitle = epg.generatedAt
          ? trf('Guide may be outdated · updated {time}', {time: formatDate('format|d/M h:mm', epg.generatedAt)})
          : tr('The BrazilTVEPG guide is outdated.');
        epgItems.push({id: 'epg-status-stale', title: staleTitle, epgStatus: true});
      }
      for (var e = 0; e < epg.entries.length && epgItems.length < 80; e++) {
        var entry = epg.entries[e];
        epgItems.push({id: entry.id, title: entry.title, epg: entry});
      }
    }
    if (epg && epg.status !== 'ok' && epg.status !== 'stale') {
      var epgMessage = epg.status === 'stale' ? tr('The BrazilTVEPG guide is outdated.')
        : epg.status === 'disabled' ? tr('BrazilTVEPG guide is not configured.')
        : tr('Could not load the BrazilTVEPG guide.');
      epgItems.push({id: 'epg-status-' + epg.status, title: epgMessage, epgStatus: true});
    } else if (epg && !epg.entries.length && epg.status === 'ok') {
      epgItems.push({id: 'epg-status-empty', title: tr('No programmes in the BrazilTVEPG guide today.'), epgStatus: true});
    }
    if (epgItems.length) rows.push({sport: 'epg', title: tr('BrazilTVEPG programming'), items: epgItems});
    return {sports: true, epgPending: !epg, rows: rows, error: failed && !games.length ? 'failed' : ''};
  }

  function epgCard(node, item) {
    var card = el('div', 'epg-card', node);
    var start = formatDate('format|h:mm', item.start);
    var stop = formatDate('format|h:mm', item.stop);
    el('div', 'epg-time', card, start + ' – ' + stop);
    el('div', 'epg-channel', card, item.channel);
    el('div', 'epg-title', card, item.title);
    if (item.subtitle) el('div', 'epg-subtitle', card, item.subtitle);
    el('div', 'label', node, item.channel + ' · ' + item.title);
  }

  function epgHero(hero, info, item) {
    el('div', 'gkicker', info, tr('BrazilTVEPG programming'));
    el('div', 'htitle', info, item.title);
    var now = Date.now(), state = item.start <= now && item.stop > now ? tr('Live')
      : trf('Starts at {time}', {time: formatDate('format|h:mm', item.start)});
    el('div', 'hmeta', info, item.channel + '  ·  ' + state + '  ·  ' + formatDate('format|h:mm', item.start) + '–' + formatDate('format|h:mm', item.stop));
    if (item.subtitle) el('div', 'story', info, item.subtitle);
  }

  /** Tune only when the guide channel maps exactly to a channel in the user's IPTV sources. */
  function watchEpgProgram(program) {
    Channels.load(function () {
      var matches = Sports.named(program.channel, Channels.channels());
      if (!matches.length) { toast(tr('This guide channel is not in your IPTV lists.')); return; }
      if (matches.length === 1) { startEpgChannel(program, matches[0]); return; }
      var labels = matches.map(function (channel) { return channelName(channel.name) + (channel.group ? ' · ' + channel.group : ''); });
      openPicker(tr('Choose a channel for this game'), labels, -1, 'sports', function (at) {
        if (matches[at]) startEpgChannel(program, matches[at]);
      });
    });
  }

  function startEpgChannel(program, channel) {
    Sports.leaving({id: program.id});
    var failed = function () { Sports.forgetReturn(); noPlayer(); };
    if (!openInIptv('channel', channel.name, Channels.linkFor(channel), failed)) failed();
  }

  /** "2º tempo · 67'", "3º quarto · 4:12", "Intervalo"; `short`: the minute alone for football. */
  function gameClock(game, short) {
    var c = game.clock;
    if (!c) return game.state === 'ended' ? tr('Full time') : '';
    if (c.phase === 'halftime') return tr('Halftime');
    if (c.phase === 'other') return c.display;
    var period = game.sport === 'basketball' ? trf('Q{n}', {n: c.period})
        : c.phase === 'extra' ? tr('Extra time') : trf('Half {n}', {n: c.period});
    if (short) return game.sport === 'soccer' && c.display ? c.display : period;
    return c.display ? period + ' · ' + c.display : period;
  }

  function gameScore(game) {
    if (game.state === 'soon' || !game.home || !game.away) return 'x';
    return (game.home.score || '0') + ' – ' + (game.away.score || '0');
  }

  function gameBadge(game, parent) {
    var text = game.state === 'live' ? tr('Live') : game.state === 'ended' ? tr('Ended')
        : trf('Soon · {time}', {time: formatDate('format|h:mm', game.start)});
    return el('span', 'gbadge ' + game.state, parent, text);
  }

  /** A team's crest: its logo, or its code on its color. */
  function crest(t, cls, parent) {
    var c = el('div', 'crest' + (cls ? ' ' + cls : ''), parent);
    if (t.color) { c.style.backgroundColor = t.color; c.style.color = t.ink; }
    if (t.logo) {
      var img = el('img', '', c);
      img.alt = t.code;
      img.onerror = function () { c.removeChild(img); c.textContent = t.code; };
      img.src = t.logo;
    } else c.textContent = t.code;
    return c;
  }

  /** The teams' colors as a background: home on the left, away on the right. */
  function teamColors(node, game) {
    var home = (game.home && game.home.color) || '#334155', away = (game.away && game.away.color) || '#1E293B';
    node.style.backgroundImage = '-webkit-linear-gradient(left, ' + home + ' 50%, ' + away + ' 50%)';
    node.style.backgroundImage = 'linear-gradient(90deg, ' + home + ' 50%, ' + away + ' 50%)';
  }

  function gameChannel(game) {
    var channels = Channels.channels(), ch = Sports.selected(game, channels, Channels.identity);
    if (!ch) {
      var matches = Sports.broadcastMatches(game, channels, Channels.identity);
      if (matches.length === 1) ch = matches[0];
    }
    return ch ? channelName(ch.name) : tr('Channel not confirmed');
  }

  function setGameReminder(game) {
    var old = Sports.reminderFor(game.id), offsets = [0], choices = [tr('At kickoff')];
    if (game.start - 10 * 60000 > Date.now()) { offsets.push(10); choices.push(tr('10 minutes before')); }
    if (game.start - 30 * 60000 > Date.now()) { offsets.push(30); choices.push(tr('30 minutes before')); }
    if (old) choices.push(tr('Cancel reminder'));
    openPicker(tr('Remind me about this game'), choices, -1, 'sports', function (at) {
      if (old && at === choices.length - 1) {
        Sports.cancelReminder(game.id);
        toast(tr('Reminder cancelled'));
      } else {
        Sports.setReminder(game, offsets[at]);
        toast(trf('Reminder set: {time}', {time: formatDate('format|h:mm', game.start - offsets[at] * 60000)}));
      }
      drawCatalog();
    });
  }

  function gameFromReminder(item) {
    for (var r = 0; catalog && catalog.rows && r < catalog.rows.length; r++) {
      for (var i = 0; i < catalog.rows[r].items.length; i++) {
        var game = catalog.rows[r].items[i].game;
        if (game && game.id === item.id) return game;
      }
    }
    var league = null;
    for (var l = 0; l < Sports.LEAGUES.length; l++) if (Sports.LEAGUES[l].path === item.leaguePath) league = Sports.LEAGUES[l];
    return {id: item.id, title: item.title, competition: item.competition, start: item.start, sport: item.sport,
      league: league || {path: item.leaguePath, channels: []}, home: item.home, away: item.away,
      broadcasts: item.broadcasts || [], state: 'live'};
  }

  function renderSportsReminder(item) {
    var layer = $('sportsalert');
    layer.innerHTML = '';
    el('div', 'alert-shade', layer);
    var box = el('div', 'alert-box', layer);
    el('div', 'alert-kicker', box, tr('Game reminder'));
    el('div', 'alert-title', box, item.title);
    el('div', 'alert-subtitle', box, item.competition + '  ·  ' + trf('Starts at {time}', {time: formatDate('format|h:mm', item.start)}));
    var actions = el('div', 'alert-actions', box);
    var labels = [tr('Watch the game'), tr('Remind me in 10 minutes'), tr('Dismiss')];
    for (var i = 0; i < labels.length; i++) (function (at) {
      var button = el('button', 'alert-action', actions, labels[at]);
      button.onclick = function () { st.reminderAction = at; updateFocus(); activateSportsReminder(); };
    })(i);
    el('div', 'alert-hint', box, tr('Use arrows and OK. Back reminds again in 10 minutes.'));
    setClass(layer, 'on', true);
  }

  function checkSportsReminder() {
    if (reminderAlert || document.hidden) return;
    var item = Sports.dueReminder(Date.now());
    if (!item) return;
    reminderAlert = item;
    reminderReturnTab = st.tab;
    reminderReturnZone = st.zone;
    st.reminderAction = 0;
    hideSaver();
    stopPlayer();
    st.zone = Z.REMINDER;
    renderSportsReminder(item);
    updateFocus();
  }

  function closeSportsReminder(snooze) {
    if (!reminderAlert) return;
    if (snooze) Sports.snoozeReminder(reminderAlert.id, 10);
    reminderAlert = null;
    $('sportsalert').innerHTML = '';
    setClass($('sportsalert'), 'on', false);
    st.tab = reminderReturnTab;
    st.zone = reminderReturnZone;
    updateFocus();
  }

  function activateSportsReminder() {
    if (!reminderAlert) return;
    var item = reminderAlert;
    if (st.reminderAction === 1) { closeSportsReminder(true); toast(tr('Reminder postponed')); return; }
    if (st.reminderAction === 2) { Sports.cancelReminder(item.id); closeSportsReminder(false); return; }
    reminderAlert = null;
    $('sportsalert').innerHTML = '';
    setClass($('sportsalert'), 'on', false);
    st.zone = Z.CATALOG;
    updateFocus();
    watchGame(gameFromReminder(item), true);
  }

  /** A game in a row: always dark, as a poster, so the white score reads on it in the day look too. */
  function gameCard(node, game) {
    var card = el('div', 'game', node);
    teamColors(el('div', 'tint', card), game);
    var top = el('div', 'gtop', card);
    gameBadge(game, top);
    if (Sports.reminderFor(game.id)) el('span', 'greminder', top, tr('Reminder'));
    el('span', 'gch', top, gameChannel(game));
    if (game.home && game.away) {
      var mid = el('div', 'gmid', card);
      crest(game.home, '', el('div', 'gteam', mid));
      var score = el('div', 'gscore', mid);
      el('b', '', score, gameScore(game));
      el('span', '', score, gameClock(game, true));
      crest(game.away, '', el('div', 'gteam', mid));
    } else el('div', 'gevent', card, game.title);
    el('div', 'label', node, game.title);
    el('i', 'gbar', el('div', 'gprog', node)).style.width = game.progress + '%';
  }

  function gameHero(hero, info, game) {
    teamColors(hero.firstChild, game);
    setClass(hero.firstChild, 'on', true);
    // The sport's drawing (web/sport-*.svg) over the teams' colors, under the fade.
    var art = hero.querySelector('.sart');
    if (!art) art = hero.insertBefore(el('div', 'sart'), hero.firstChild.nextSibling);
    art.style.backgroundImage = 'url(sport-' + game.sport + '.svg)';
    el('div', 'gkicker', info, game.competition);
    var status = el('div', 'gstatus', info);
    gameBadge(game, status);
    el('span', '', status, gameClock(game, false));
    if (game.home && game.away) {
      var match = el('div', 'gmatch', info);
      var home = el('div', 'gside', match);
      crest(game.home, 'lg', home);
      el('span', '', home, game.home.name);
      el('div', 'gbig', match, gameScore(game));
      var away = el('div', 'gside away', match);
      el('span', '', away, game.away.name);
      crest(game.away, 'lg', away);
    } else el('div', 'htitle', info, game.title);
    var ch = gameChannel(game), channel = el('div', 'hmeta sports-channel', info, ch + '  ·  ' + tr('OK chooses; red key changes channel; green key sets reminder'));
    channel.onclick = function () { chooseSportsChannel(game); };
    channel.onmouseover = function () { if (Date.now() - pointerAt.t <= POINTER_MOVED) channel.focus(); };
    if (game.state === 'soon') {
      el('div', 'hmeta', info, trf('Starts at {time}', {time: formatDate('format|h:mm', game.start)}));
      var reminder = Sports.reminderFor(game.id), label = reminder ? trf('Reminder set: {time}', {time: formatDate('format|h:mm', reminder.triggerAt)}) : tr('Set a reminder');
      var button = el('button', 'sports-reminder', info, label);
      button.onclick = function () { setGameReminder(game); };
      button.onmouseover = function () { if (Date.now() - pointerAt.t <= POINTER_MOVED) button.focus(); };
    }
  }

  /** OK on a game: its channel in the IPTV player; a game still to come only says when it starts. */
  function watchGame(game, reminder) {
    if (game.state === 'soon' && !reminder) {
      toast(trf('Starts at {time}', {time: formatDate('format|h:mm', game.start)}));
      return;
    }
    if (game.state === 'ended') { toast(tr('This event has ended.')); return; }
    if (!Channels.count()) { toast(tr("This game's channel isn't in your IPTV lists.")); return; }
    toast(tr('Checking the channel guide…'));
    Channels.load(function () {
      Sports.resolve(game, Channels.channels(), Channels.identity, Channels.guide, function (result) {
        if (result.status === 'confirmed' || result.status === 'picked' || result.status === 'rule') {
          startSportsChannel(game, result.channel);
        } else {
          toast(result.status === 'ambiguous' ? tr('More than one channel may show this game. Choose one.')
            : tr('The channel is not confirmed. Choose from your IPTV lists.'));
          chooseSportsChannel(game, result.candidates);
        }
      }, Channels.guideScan);   // an M3U list's whole guide: any of its channels can be the one
    });
  }

  /** A picker for the game: likely channels first, then every configured IPTV channel. */
  function chooseSportsChannel(game, first) {
    Channels.load(function () {
      var channels = Channels.channels(), choices = [], seen = {};
      function add(ch) {
        if (!ch) return;
        var key = Channels.identity(ch);
        if (seen[key]) return;
        seen[key] = true;
        choices.push(ch);
      }
      for (var i = 0; first && i < first.length; i++) add(first[i]);
      for (var j = 0; j < channels.length; j++) add(channels[j]);
      if (!choices.length) { toast(tr("This game's channel isn't in your IPTV lists.")); return; }
      var labels = choices.map(function (ch) { return channelName(ch.name) + (ch.group ? ' · ' + ch.group : ''); });
      openPicker(tr('Choose a channel for this game'), labels, -1, 'sports', function (at) {
        var selected = choices[at];
        if (!selected) return;
        var scopes = [tr('This game only'), trf('All games in {competition}', {competition: game.competition})];
        openPicker(tr('Use this channel for…'), scopes, -1, 'sports', function (scope) {
          Sports.choose(game, selected, Channels.identity, scope === 1);
          drawCatalog();
          startSportsChannel(game, selected);
        });
      });
    });
  }

  function startSportsChannel(game, channel) {
    if (!channel) return;
    Sports.cancelReminder(game.id);
    if (reminderAlert && reminderAlert.id === game.id) closeSportsReminder(false);
    Sports.leaving(game);
    var failed = function () { Sports.forgetReturn(); noPlayer(); };
    if (!openInIptv('channel', channel.name, Channels.linkFor(channel), failed)) failed();
  }

  /** Restore the game and focus after the IPTV player returns to the launcher. */
  function restoreSportsFocus() {
    if (!sportReturnId || !catalog || !catalog.rows) return;
    for (var r = 0; r < catalog.rows.length; r++) for (var i = 0; i < catalog.rows[r].items.length; i++) {
      if (catalog.rows[r].items[i].id === sportReturnId) {
        st.tab = 1;
        st.zone = Z.CATALOG;
        st.crow = r;
        st.ccol[r] = i;
        sportReturnId = '';
        return;
      }
    }
    if (!catalog.epgPending) sportReturnId = '';
  }

  // MARK: - Details: a movie's or a show's page (Watch, cast, similar titles) and a person's (filmography)
  //
  // A stack of pages over the tabs: a title opens its page, a cast member theirs, a title of a filmography or a similar
  // one its own, and Back goes down the stack to the row and item it was left on. A page draws what it already has at
  // once (the title from its row, a cast member's name and photo) and the rest when TMDB answers; only the photos near
  // the focus load. Watch is the same OK as before this page (openTitle: the IPTV player, or the streaming app).

  var pages = [];   // {type: 'title' | 'person', kind, id, item, data, error, rows, row, cols, nodes}
  // Rows start under the header (a person's, without Watch, is shorter); a lower row, focused, comes up to LIFT_TO.
  var DETAIL_TOP = 650, PERSON_TOP = 560, LIFT_TO = 540, CAST_STEP = 220, POSTER_STEP = 250, DETAIL_ROW_H = {cast: 330, posters: 480};

  function openDetail(page) {
    page.row = 0;
    page.cols = [];
    pages.push(page);
    st.zone = Z.DETAIL;
    setClass(body, 'detail-open', true);
    renderDetail();
    var answer = function (err, data) {
      page.data = data || null;
      page.error = !!err;
      if (pages[pages.length - 1] === page) renderDetail();
    };
    if (page.type === 'person') Data.personDetails(page.id, answer);
    else if (page.type === 'episodes') Data.seasonDetails(page.id, page.season, answer);
    else Data.titleDetails(page.kind, page.id, answer);
  }

  /** Back: the page under this one, as it was left; from the last one, the tab it was opened from. */
  function detailBack() {
    pages.pop();
    if (pages.length) { renderDetail(); return; }
    closeDetails();
    st.zone = st.tab !== 0 && catalog ? Z.CATALOG : Z.TOP;
    updateFocus();
  }

  /** Every page closed at once (the home screen opened again): the tabs as they were under them. */
  function closeDetails() {
    pages = [];
    setClass(body, 'detail-open', false);
    $('detail').lastChild.innerHTML = '';
    if (st.zone === Z.DETAIL) st.zone = Z.TOP;
  }

  function renderDetail() {
    var page = pages[pages.length - 1], box = $('detail'), holder = box.lastChild;
    if (page.type === 'episodes') { renderEpisodes(page); return; }
    var d = page.data, it = page.item || {}, person = page.type === 'person';
    holder.innerHTML = '';
    page.rows = detailRows(page);
    page.row = Math.max(0, Math.min(page.row, page.rows.length - 1));
    page.nodes = [];

    // The backdrop, as on the tabs: the title's, or for a person their best-known title's.
    var known = person && d ? (d.movies[0] || d.shows[0]) : null;
    var backdrop = person ? known && known.backdrop : (d && d.backdrop) || it.backdrop;
    setClass(box.firstChild, 'on', false);
    if (backdrop) {
      var url = Data.image(backdrop, 'w1280'), img = new Image();
      img.onload = function () {
        if (pages[pages.length - 1] !== page) return;
        box.firstChild.style.backgroundImage = 'url(' + url + ')';
        setClass(box.firstChild, 'on', true);
      };
      img.src = url;
    }

    var head = el('div', 'dhead', holder);
    var photo = el('div', person ? 'dposter person' : 'dposter', head), photoPath = person ? (d && d.profile) || it.profile : (d && d.poster) || it.poster;
    if (photoPath) photo.style.backgroundImage = 'url(' + Data.image(photoPath, 'w342') + ')';
    else el('div', 'initials', photo, initials(person ? it.name : it.title));
    var info = el('div', 'dinfo', head);

    if (person) {
      el('div', 'dtitle', info, (d && d.name) || it.name || '');
      if (d) {
        var born = d.birthday && d.place ? trf('Born {date} in {place}', {date: longDate(d.birthday), place: d.place})
            : d.birthday ? trf('Born {date}', {date: longDate(d.birthday)}) : d.place ? trf('Born in {place}', {place: d.place}) : '';
        var line = [];
        if (d.department) line.push(department(d.department));
        if (born) line.push(born);
        if (d.deathday) line.push(trf('Died {date}', {date: longDate(d.deathday)}));
        if (line.length) el('div', 'dmeta', info, line.join('  ·  '));
        if (d.biography) fitText(el('div', 'dstory bio', info, d.biography));
        if (page.rows.length) el('div', 'dsmall', info, tr("The titles TMDB knows of, not necessarily the whole career."));
      }
    } else {
      var t = d || it;
      el('div', 'dtitle', info, t.title || '');
      var meta = el('div', 'dmeta', info), parts = [];
      if (t.year) parts.push(t.year);
      if (t.rating) parts.push('★ ' + (Math.round(t.rating * 10) / 10).toFixed(1));
      if (page.kind === 'movie' && (Trakt.movieWatched(page.id) || (Data.movieSeen(page.id) || {}).done)) parts.push('✓ ' + tr('Watched'));
      if (d && d.runtime && page.kind === 'movie') parts.push(trf('runtime|{n} min', {n: d.runtime}));
      if (d && d.seasons) parts.push(plural('plural|one:{n} season|other:{n} seasons', d.seasons));
      if (d && d.genreNames.length) parts.push(d.genreNames.slice(0, 3).join(', '));
      el('span', '', meta, parts.join('  ·  '));
      Data.imdbRating({kind: page.kind, id: page.id, title: t.title, year: t.year}, function (rating) {
        if (rating && pages[pages.length - 1] === page && meta.parentNode) meta.insertBefore(el('span', 'imdb', null, 'IMDb ' + rating), meta.firstChild);
      });
      if (t.overview) fitText(el('div', 'dstory', info, t.overview));
      if (d && d.directors.length) {
        var names = {names: d.directors.join(', ')};
        el('div', 'dline', info, page.kind === 'movie' ? trf('Directed by {names}', names) : trf('Created by {names}', names));
      }
      var actions = el('div', 'dactions', info), nodes = [];
      for (var a = 0; a < page.rows[0].items.length; a++) {
        var btn = el('div', 'dbtn', actions, page.rows[0].items[a].label);
        hover(btn, Z.DETAIL, a);
        nodes.push(btn);
      }
      page.nodes[0] = nodes;
      // Left in the middle: how far, in purple, and the minutes left.
      if (page.next && page.next.resume && page.next.share) {
        el('div', 'fill', el('div', 'dprog', info)).style.width = Math.round(page.next.share * 100) + '%';
        el('div', 'dleft', info, trf('episode|{n} min left', {n: Math.max(1, Math.ceil(page.next.left / 60))}));
      }
    }
    if (!d) el('div', 'dnote', info, page.error ? (person ? tr("Couldn't load this person's page.") : tr("Couldn't load more about this title.")) : tr('Loading…'));

    // The rows under the header: cast (round photos, name, character) and posters (title, year or role).
    var top = page.firstTop = person ? PERSON_TOP : DETAIL_TOP;
    for (var r = 0; r < page.rows.length; r++) {
      var row = page.rows[r];
      if (row.type === 'actions') continue;
      var rowNode = el('div', 'drow ' + row.type, holder), items = [];
      rowNode.style.top = top + 'px';
      row.top = top;
      top += DETAIL_ROW_H[row.type];
      el('div', 'dlabel', rowNode, row.title);
      var strip = el('div', 'dstrip', rowNode);
      for (var i = 0; i < row.items.length; i++) {
        var x = row.items[i], node = el('div', 'ditem ' + (row.type === 'cast' ? 'cast' : 'poster'), strip);
        node.style.left = i * (row.type === 'cast' ? CAST_STEP : POSTER_STEP) + 'px';
        var pic = el('div', row.type === 'cast' ? 'circle' : 'pimg', node);
        if (!(row.type === 'cast' ? x.profile : x.poster)) el('div', 'initials', pic, row.type === 'cast' ? initials(x.name) : x.title);
        el('div', 'dname', node, row.type === 'cast' ? x.name : x.title);
        var second = row.type === 'cast' ? x.character : person ? [x.year, x.role].filter(Boolean).join('  ·  ') : x.year;
        if (second) el('div', 'drole', node, second);
        hover(node, Z.DETAIL, r * 1000 + i);
        items.push(node);
      }
      page.nodes[r] = items;
      row.strip = strip;
      row.node = rowNode;
    }
    updateFocus();
  }

  /** The focus, the rows' scroll (the focused row comes up, its item stays in view) and the photos near the focus. */
  function placeDetail() {
    var page = pages[pages.length - 1];
    if (!page || !page.rows) return;
    if (page.type === 'episodes') { placeEpisodes(page); return; }
    var holder = $('detail').lastChild, focusRow = page.rows[page.row];
    // A row below the first one comes up to where the first one is; Watch and the first row keep the page still.
    var lift = focusRow && focusRow.top > page.firstTop ? focusRow.top - LIFT_TO : 0;
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-lift) + 'px)';
    for (var r = 0; r < page.rows.length; r++) {
      var row = page.rows[r], nodes = page.nodes[r] || [], col = page.cols[r] || 0, first = Math.max(0, col - 2);
      var step = row.type === 'cast' ? CAST_STEP : POSTER_STEP;
      if (row.strip) row.strip.style.webkitTransform = row.strip.style.transform = 'translateX(' + (-first * step) + 'px)';
      for (var i = 0; i < nodes.length; i++) {
        setClass(nodes[i], 'focus', st.zone === Z.DETAIL && r === page.row && i === col);
        // Only the photos of the rows near the focus, on screen or next to it, are loaded.
        if (!nodes[i].loaded && row.type !== 'actions' && Math.abs(r - page.row) <= 1 && i >= first - 1 && i <= first + 9) {
          var x = row.items[i], path = row.type === 'cast' ? x.profile : x.poster;
          nodes[i].loaded = true;
          if (path) nodes[i].firstChild.style.backgroundImage = 'url(' + Data.image(path, 'w185') + ')';
        }
      }
    }
  }

  function detailMove(dx, dy) {
    var page = pages[pages.length - 1];
    if (!page || !page.rows.length) return;
    if (dx) {
      var n = page.rows[page.row].items.length;
      page.cols[page.row] = Math.max(0, Math.min(n - 1, (page.cols[page.row] || 0) + dx));
    } else if (dy) {
      page.row = Math.max(0, Math.min(page.rows.length - 1, page.row + dy));
    }
  }

  /** OK: Watch; a cast member's page; a title's page. */
  function detailActivate() {
    var page = pages[pages.length - 1];
    if (!page || !page.rows.length) return;
    if (page.type === 'episodes') { episodesActivate(page); return; }
    var row = page.rows[page.row], x = row.items[page.cols[page.row] || 0];
    if (!x) return;
    if (row.type === 'actions') {
      x.run();
    } else if (row.type === 'cast') {
      openDetail({type: 'person', id: x.id, item: {name: x.name, profile: x.profile}});
    } else {
      openDetail({type: 'title', kind: x.kind, id: x.id, item: x});
    }
  }

  // MARK: - Series: Continue S·E, and the episodes page
  //
  // Where a show was left comes from the IPTV player: Back there brings this app back with the show's episode progress
  // in the launch params (Data.recordProgress), as apps can't read each other's storage. Without it (no player, never
  // watched), a show starts at S1·E1.

  function openEpisodes(show) {
    var next = nextEpisode(show), t = show.data || show.item || {};
    openDetail({type: 'episodes', kind: 'tv', id: show.id, item: {title: t.title, backdrop: t.backdrop}, show: show,
      seasons: (show.data && show.data.seasonList) || [], season: next.season, target: next, aim: true});
  }

  var EP_ROW = 200;

  /** The episodes page: the seasons on top, then a row per episode (still, title, minutes, story, progress). */
  function renderEpisodes(page) {
    var box = $('detail'), holder = box.lastChild, prog = episodeStates(page.id), target = page.target;
    holder.innerHTML = '';
    page.nodes = [];
    page.rows = [{type: 'seasons', items: page.seasons}];
    el('div', 'eptitle', holder, page.item.title || '');
    var pills = page.pills = el('div', 'eppills', el('div', 'epseasons', holder)), pnodes = [];
    for (var s = 0; s < page.seasons.length; s++) {
      var season = page.seasons[s];
      var pill = el('div', 'eppill' + (season.n === page.season ? ' on' : ''), pills,
          trf('Season {n}', {n: season.n}) + (seasonDone(prog, season) ? '  ✓' : ''));
      if (season.n === page.season && page.cols[0] === undefined) page.cols[0] = s;
      hover(pill, Z.DETAIL, s);
      pnodes.push(pill);
    }
    page.nodes[0] = pnodes;
    // The episodes scroll inside their own window, under the title and the seasons.
    var list = page.list = el('div', 'eplist', el('div', 'epview', holder));
    if (!page.data) {
      el('div', 'dnote', list, page.error ? tr("Couldn't load the episodes.") : tr('Loading…'));
      page.row = 0;
      updateFocus();
      return;
    }
    for (var i = 0; i < page.data.length; i++) {
      var ep = page.data[i], x = prog && prog.eps[page.season + ':' + ep.n], r = i + 1;
      page.rows.push({type: 'episode', items: [ep]});
      var row = el('div', 'eprow' + (x && x.done ? ' done' : ''), list);
      row.style.top = i * EP_ROW + 'px';
      var still = el('div', 'epstill', row);
      if (!ep.still) el('div', 'initials', still, String(ep.n));
      if (x && x.done) el('div', 'epcheck', still, '✓');
      var bodyNode = el('div', 'epbody', row), meta = [];
      el('div', 'epname', bodyNode, ep.n + '. ' + ep.title);
      if (ep.runtime) meta.push(trf('runtime|{n} min', {n: ep.runtime}));
      if (x && x.done) meta.push(tr('Watched'));
      else if (x && x.d) meta.push(trf('episode|{n} min left', {n: Math.max(1, Math.ceil((x.d - x.p) / 60))}));
      if (meta.length) el('div', 'epmeta', bodyNode, meta.join('  ·  '));
      if (ep.overview) el('div', 'epstory', bodyNode, ep.overview);
      // The bar only from the player's real position: watched at Trakt shows the check, not an invented share.
      if (x && !x.remote) el('div', 'fill', el('div', 'epbar', bodyNode)).style.width = (x.done ? 100 : Math.round(100 * x.p / Math.max(1, x.d))) + '%';
      hover(row, Z.DETAIL, r * 1000);
      page.nodes[r] = [row];
      // The focus starts on the episode where the show goes on.
      if (page.aim && target && target.season === page.season && target.episode === ep.n) page.row = r;
    }
    if (page.aim) { page.aim = false; if (!page.row && page.rows.length > 1) page.row = 1; }
    page.row = Math.max(0, Math.min(page.row, page.rows.length - 1));
    updateFocus();
  }

  /** The focus, the list's scroll (the focused episode stays in view) and the stills near it. */
  function placeEpisodes(page) {
    for (var r = 0; r < page.rows.length; r++) {
      var nodes = page.nodes[r] || [], col = page.cols[r] || 0;
      for (var i = 0; i < nodes.length; i++) setClass(nodes[i], 'focus', st.zone === Z.DETAIL && r === page.row && i === col);
    }
    // The seasons slide sideways so the focused one (or the one shown) stays on screen.
    var pill = page.nodes[0][page.cols[0] || 0];
    if (pill && page.pills) {
      var shift = Math.max(0, pill.offsetLeft - 1100);
      page.pills.style.webkitTransform = page.pills.style.transform = 'translateX(' + (-shift) + 'px)';
    }
    if (!page.list) return;
    var first = Math.max(0, page.row - 2);
    page.list.style.webkitTransform = page.list.style.transform = 'translateY(' + (-first * EP_ROW) + 'px)';
    for (var e = 1; e < page.rows.length; e++) {
      var node = page.nodes[e][0], ep = page.rows[e].items[0];
      if (!node.loaded && e >= first && e <= first + 5) {
        node.loaded = true;
        if (ep.still) node.firstChild.style.backgroundImage = 'url(' + Data.image(ep.still, 'w300') + ')';
      }
    }
  }

  /** OK on a season shows its episodes; on an episode, plays it (from where it was left, if it's the one to go on). */
  function episodesActivate(page) {
    var col = page.cols[page.row] || 0;
    if (page.row === 0) {
      var season = page.seasons[col];
      if (!season || season.n === page.season) return;
      page.season = season.n;
      page.data = null;
      page.error = false;
      page.row = 0;
      renderDetail();
      Data.seasonDetails(page.id, season.n, function (err, list) {
        if (page.season !== season.n) return;
        page.data = list || null;
        page.error = !!err;
        if (pages[pages.length - 1] === page) renderDetail();
      });
      return;
    }
    var ep = page.rows[page.row].items[0], t = page.target;
    watchEpisode(page.show, page.season, ep.n, !!(t && t.resume && t.season === page.season && t.episode === ep.n));
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
    if (TAB_KIND[st.tab] === 'sports' && !pages.length) renderCatalog();   // the scores
  }

  /** On the minute, so the clock never runs late (the 30-second refresh could, by up to 30 s). */
  function tickClock() {
    renderClock();
    checkSportsReminder();
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
    // IPTV: the IPTV player's channel list.
    if (iptvApp()) drawerItems.push({label: tr('IPTV'), symbol: 'live_tv', run: function () { closeDrawer(); openAllChannels(); }});
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
    if (!drawerItems.length || pages.length) return;
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
      // Without an icon the face already shows the name: no second one under it.
      if (others[i].icon) el('div', 'label', cell, others[i].title);
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
    if (st.zone === Z.TRAKT) { Trakt.cancel(); traktFlow = null; }
    setClass($('traktsheet'), 'open', false);
    picker = null;
    edit.held = false;
    edit.menu = false;
    st.zone = Z.SHELF;
    updateFocus();
  }

  // A click (mouse, Magic Remote) on the dim around Home Settings or one of its pickers closes them, nothing picked.
  ['settings', 'langpick', 'traktsheet'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === $(id)) closeSheets(); });
  });

  // MARK: - Home Settings: under the list, what the focused row does; OK or the arrows change it

  var SAVER_CHOICES = [0, 2, 5, 10, 30], resetArmed = false;

  // MARK: - Accessibility: a page of Home Settings (Back returns to the list). Each choice is a class on <body>, so it
  // reaches every screen at once: text-large / text-xlarge, contrast, focus-strong, still.

  var settingsPage = '';   // '' (the list) | 'access'
  var TEXT_SIZES = ['normal', 'large', 'xlarge'];

  function applyAccess() {
    var size = Prefs.textSize();
    setClass(body, 'text-large', size === 'large');
    setClass(body, 'text-xlarge', size === 'xlarge');
    setClass(body, 'contrast', Prefs.contrast());
    setClass(body, 'focus-strong', Prefs.strongFocus());
    setClass(body, 'still', Prefs.still());
  }

  /** Back on the Accessibility page: the list again, on its row. */
  function settingsBack() {
    if (settingsPage !== 'access') return false;
    settingsPage = '';
    renderSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].key === 'access') st.row = i;
    updateFocus();
    return true;
  }

  /** OK twice: the first press only asks. */
  function restoreDefaults() {
    if (!resetArmed) { resetArmed = true; return; }
    resetArmed = false;
    Prefs.reset();
    applyAccess();
    I18N.set(Prefs.language());
    pickShelf();
    liveIds = '';
    stopPlayer();
    loadChannels();
    renderAll();
    toast(tr('The settings are back to how they came.'));
  }

  var rowsNow = [], settingsAbout = null;

  function renderSettings() {
    var box = $('settings').firstChild;
    box.innerHTML = '';
    // Accessibility: a panel at the side, the home screen in full beside it, so each choice shows as it's made.
    setClass($('settings'), 'side', settingsPage === 'access');
    var title = el('div', 'title', box);
    sym('settings', title);
    title.appendChild(document.createTextNode(settingsPage === 'access' ? tr('Accessibility') : tr('Home Settings')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    rowsNow = settingRows();
    list.style.height = Math.min(rowsNow.length, 7) * 78 + 'px';
    for (var i = 0; i < rowsNow.length; i++) {
      var r = rowsNow[i], row = el('div', 'row' + (r.dim ? ' dim' : '') + (r.warn ? ' warn' : ''), holder, r.label);
      if (r.toggle !== undefined) setClass(el('div', 'toggle', row), 'on', r.toggle);
      else {
        var v = el('span', 'value', row);
        if (r.value === '›') v.textContent = '›';
        else if (r.opens || r.key === 'reset') { v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
        else { el('span', 'chev', v, '‹'); v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
      }
      hover(row, Z.SETTINGS, i);
    }
    settingsAbout = el('div', 'about', box);
    el('div', 'hint', box, tr('OK or the arrows change the value. Back closes.'));
    updateFocus();
  }

  /** key: the row to focus (the one the person came back from). */
  function openSettings(key) {
    st.zone = Z.SETTINGS;
    st.row = 0;
    settingsPage = '';
    resetArmed = false;
    renderSettings();
    for (var i = 0; key && i < rowsNow.length; i++) if (rowsNow[i].key === key) st.row = i;
    setClass($('settings'), 'open', true);
    updateFocus();
  }

  // MARK: - Trakt.tv: connect (a code to type on another device), sync, disconnect

  var traktFlow = null, traktRowsNow = [], traktArmed = false;

  function openTrakt() {
    setClass($('settings'), 'open', false);
    st.zone = Z.TRAKT;
    st.trow = 0;
    traktArmed = false;
    renderTrakt();
    setClass($('traktsheet'), 'open', true);
    updateFocus();
  }

  /** Back: the sign-in, if one is waiting, is given up; then Home Settings, on Trakt.tv. */
  function closeTrakt() {
    Trakt.cancel();
    traktFlow = null;
    setClass($('traktsheet'), 'open', false);
    openSettings('trakt');
  }

  function startTrakt() {
    traktFlow = {state: 'starting'};
    st.trow = 0;
    renderTrakt();
    Trakt.connect(function (update) {
      traktFlow = update.state === 'done' ? null : update;
      if (update.state === 'done') toast(trf('Connected to Trakt as {user}.', {user: Trakt.user() || 'Trakt'}));
      if (st.zone === Z.TRAKT) { st.trow = 0; renderTrakt(); }
    });
  }

  function renderTrakt() {
    var box = $('traktsheet').firstChild, f = traktFlow, rows = [];
    box.innerHTML = '';
    el('div', 'title', box, 'Trakt.tv');
    var body = el('div', 'tbody', box);
    if (!Trakt.configured) {
      el('div', 'tline', body, tr('Trakt is not set up on this TV yet.'));
      el('div', 'tsmall', body, tr('Put the Client ID of your Trakt app in config.properties (trakt_client_id) and install the launcher again.'));
      rows.push({label: tr('Close'), run: closeTrakt});
    } else if (Trakt.connected()) {
      el('div', 'tline', body, trf('Connected as {user}', {user: Trakt.user() || 'Trakt'}));
      el('div', 'tsmall', body, traktStatus());
      rows.push({label: tr('Sync now'), run: function () { Trakt.sync(true); renderTrakt(); }});
      rows.push({label: traktArmed ? tr('Press OK again to disconnect') : tr('Disconnect'), warn: traktArmed, run: function () {
        if (!traktArmed) { traktArmed = true; renderTrakt(); return; }
        traktArmed = false;
        Trakt.disconnect(function () { toast(tr('Disconnected from Trakt. The history on this TV stays.')); });
        renderTrakt();
      }});
    } else if (f && f.state === 'code') {
      // The square opens Trakt's page on a phone; Trakt doesn't fill the code from the link, so it stays large beside it.
      var qr = QR.canvas(f.url || 'https://trakt.tv/activate', 240), side = body;
      if (qr) {
        var pair = el('div', 'tqr', body);
        pair.appendChild(qr);
        side = el('div', 'tqrside', pair);
      }
      el('div', 'tsmall', side, trf('On your phone or computer, open {url} and type this code:', {url: (f.url || '').replace(/^https?:\/\//, '')}));
      el('div', 'tcode', side, f.code);
      if (qr) el('div', 'tsmall', side, tr("Or point the phone's camera at the square to open the page."));
      el('div', 'tsmall', body, trf('The code works until {time}. Waiting for you to allow it…', {time: formatDate('format|h:mm', f.until)}));
      rows.push({label: tr('Cancel'), run: function () { Trakt.cancel(); traktFlow = null; renderTrakt(); }});
    } else if (f && f.state === 'starting') {
      el('div', 'tsmall', body, tr('Asking Trakt for a code…'));
      rows.push({label: tr('Cancel'), run: function () { Trakt.cancel(); traktFlow = null; renderTrakt(); }});
    } else {
      if (f && f.state === 'expired') el('div', 'tline', body, tr('The code expired before it was allowed.'));
      else if (f && f.state === 'denied') el('div', 'tline', body, tr('The connection was refused at Trakt.'));
      else if (f && f.state === 'error') el('div', 'tline', body, tr("Couldn't reach Trakt. Check the internet and try again."));
      el('div', 'tsmall', body, tr('Connect your Trakt account to see the episodes you watched on other devices, keep a history of what you watch here, and use My list.'));
      rows.push({label: f ? tr('Try again') : tr('Connect'), run: startTrakt});
    }
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = rows.length * 78 + 'px';
    traktRowsNow = rows;
    st.trow = Math.min(st.trow, rows.length - 1);
    for (var i = 0; i < rows.length; i++) {
      hover(el('div', 'row' + (rows[i].warn ? ' warn' : ''), holder, rows[i].label), Z.TRAKT, i);
    }
    el('div', 'hint', box, tr('OK chooses. Back closes.'));
    updateFocus();
  }

  // What Trakt brings shows where it's on screen: this sheet, Home Settings, a page, Movies and Shows.
  Trakt.onChange(function () {
    if (st.zone === Z.TRAKT) renderTrakt();
    else if (st.zone === Z.SETTINGS) renderSettings();
    if (pages.length) {
      var top = pages[pages.length - 1];
      if (top.type === 'episodes') top.target = nextEpisode(top.show);
      renderDetail();
    }
    if (st.tab !== 0) { drawnFor = null; drawCatalog(); }
  });

  // MARK: - Picker: one choice out of a list (the language, a card's channel); only the rows on screen are drawn, as
  // an IPTV list can have thousands

  var picker = null, PICKER_ROWS = 7;   // picker: {title, choices: [label], current, onPick(index), back: settings row}

  function openPicker(title, choices, current, back, onPick) {
    setClass($('settings'), 'open', false);
    picker = {title: title, choices: choices, current: current, back: back, onPick: onPick};
    st.zone = Z.LANG;
    st.lang = Math.max(0, current);
    setClass($('langpick'), 'open', true);
    updateFocus();
  }

  function renderPicker() {
    if (!picker) return;
    var box = $('langpick').firstChild, n = picker.choices.length;
    var first = Math.max(0, Math.min(n - PICKER_ROWS, st.lang - 3));
    box.innerHTML = '';
    el('div', 'title', box, picker.title);
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(n, PICKER_ROWS) * 78 + 'px';
    for (var i = first; i < Math.min(n, first + PICKER_ROWS); i++) {
      var row = el('div', 'row' + (i === st.lang ? ' focus' : ''), holder, picker.choices[i]);
      if (i === picker.current) sym('check', el('span', 'value', row));
      hover(row, Z.LANG, i);
    }
    el('div', 'hint', box, (st.lang + 1) + ' / ' + n + '  ·  ' + tr('OK picks, Back cancels.'));
  }

  /** OK: the choice under the focus; Back: none. Either way, back to Home Settings, on the row it came from. */
  function closePicker(pick) {
    var p = picker, at = st.lang;
    picker = null;
    setClass($('langpick'), 'open', false);
    if (p && p.back === 'sports') {
      st.zone = Z.CATALOG;
      updateFocus();
      if (pick && at !== p.current && p.onPick) p.onPick(at);
      return;
    }
    if (pick && p && at !== p.current) p.onPick(at);
    openSettings(p ? p.back : null);
  }

  function openLanguages() {
    var codes = languageChoices();
    var names = codes.map(function (c) { return c === 'auto' ? tr('Automatic') : I18N.languageName(c); });
    openPicker(tr('Language'), names, codes.indexOf(pickedLanguage()), 'language', function (i) {
      Prefs.set('language', codes[i]);
      I18N.set(Prefs.language());
      renderAll();
    });
  }

  /**
   * A card's channel. The big card: every channel, the antenna's and the IPTV list's (each name once per kind). The
   * small card: only the other kind's (an antenna channel big, internet ones; an internet one big, the antenna's).
   * A big card of the small one's kind turns the small one to the other kind.
   */
  function pickChannel(which) {
    var picks = cardPicks(), kinds = which === 'big' ? ['antenna', 'iptv'] : [picks.big.kind === 'antenna' ? 'iptv' : 'antenna'];
    TV.channels([], 999, function (antenna) {
      Channels.load(function () {
        var choices = [], seen = {};
        function add(kind, list) {
          for (var i = 0; list && i < list.length; i++) {
            var name = channelName(list[i].name), k = kind + ':' + plainName(name);
            if (plainName(name) && !seen[k]) { seen[k] = true; choices.push({kind: kind, name: name}); }
          }
        }
        if (kinds.indexOf('antenna') >= 0) add('antenna', antenna);
        if (kinds.indexOf('iptv') >= 0) add('iptv', Channels.channels());
        if (!choices.length) {
          toast(kinds[0] === 'iptv' && !Channels.count() ? tr('Set up your IPTV list in the IPTV Player: its channels show here.')
              : tr('No channels found.'));
          return;
        }
        var mine = picks[which], now = -1;
        for (var n = 0; n < choices.length; n++) if (choices[n].kind === mine.kind && plainName(choices[n].name) === plainName(mine.name)) now = n;
        var labels = choices.map(function (c) { return kinds.length > 1 ? pickLabel(c) : c.name; });
        openPicker(which === 'big' ? tr('Big card') : tr('Small card'), labels, now, 'card' + which, function (at) {
          var next = {big: picks.big, small: picks.small};
          next[which] = choices[at];
          if (which === 'big' && next.small.kind === next.big.kind) next.small = {kind: next.big.kind === 'antenna' ? 'iptv' : 'antenna', name: ''};
          Prefs.set('cardPicks', next);
          liveIds = '';
          stopPlayer();
          loadChannels();   // the antenna card starts again, on the channel picked
        });
      });
    });
  }

  // MARK: - Shelf editor: the apps as on the shelf, in a grid. OK on one offers to move it or hide it; moving, the app
  // is lifted and the others make room as it goes (the arrows), or it follows the pointer (hold and drag).

  var EDIT_COLS = 5, EDIT_W = 300, EDIT_H = 169, EDIT_STEP_X = 340, EDIT_STEP_Y = 250, EDIT_LEFT = 130, EDIT_TOP = 250;
  // order: every app, as on the shelf; held: the app being moved (before: the order when it was picked up);
  // menu: its options are open (menuAt: the focused one); drag: the pointer holding an app.
  var edit = {order: [], hidden: [], held: false, before: null, menu: false, menuAt: 0, cells: {}, drag: null, first: 0};

  document.addEventListener('mousemove', function (e) {
    var d = edit.drag;
    if (!d || st.zone !== Z.EDIT) return;
    var at = stagePoint(e);
    if (!d.moved && Math.abs(at.x - d.x) + Math.abs(at.y - d.y) < 14) return;
    if (!d.moved) { d.moved = true; edit.held = true; edit.before = edit.order.slice(); }
    var cell = edit.cells[edit.order[st.edit].id];
    cell.style.left = (at.x - d.dx) + 'px';
    cell.style.top = (at.y - d.dy) + 'px';
    // The place under the pointer: the others make room there.
    var col = Math.max(0, Math.min(EDIT_COLS - 1, Math.round((at.x - d.dx - EDIT_LEFT) / EDIT_STEP_X)));
    var row = Math.max(0, edit.first + Math.round((at.y - d.dy - EDIT_TOP) / EDIT_STEP_Y));
    var to = Math.min(edit.order.length - 1, row * EDIT_COLS + col);
    if (to !== st.edit) moveHeld(to - st.edit); else placeEdit();
  });

  document.addEventListener('mouseup', function () {
    var d = edit.drag;
    if (!d) return;
    edit.drag = null;
    if (st.zone !== Z.EDIT) return;
    if (d.moved) {
      // The click that ends a drag lands wherever the pointer is: it isn't a click on the empty space.
      edit.dropped = true;
      setTimeout(function () { edit.dropped = false; }, 0);
      dropHeld();
    } else { edit.menu = true; edit.menuAt = 0; placeEdit(); }
  });

  // A click on the editor's empty space (not an app, not its options) closes it and Home Settings too, as a click
  // around Home Settings does; an app being moved goes back where it was.
  $('shelfedit').addEventListener('click', function (e) {
    if (st.zone !== Z.EDIT || edit.dropped) return;
    for (var n = e.target; n && n !== this; n = n.parentNode) if (n.appId || hasClass(n, 'menu')) return;
    if (edit.held) cancelHeld();
    closeSheets();
  });

  // MARK: - Opening things

  var iptvLaunchAt = 0;

  // MARK: - The antenna full screen: the channel the TV is on, inside the launcher (TV ao vivo on the top bar)
  //
  // The TV's picture plays in a <video> of this app (webOS's broadcast source), with its sound; OK, Back or a click
  // closes it. The channel is the one the TV is on: the TV has one tuner, and only LG's Live TV can switch it, so
  // that stays LG's (its remote buttons, or the drawer's inputs).

  var antenna = null;

  function showAntenna() {
    if (antenna || TV.name !== 'webos') return;   // a computer's browser has no antenna
    stopPlayer();   // the cards' streams stop while it plays: one picture at a time
    var v = document.createElement('video'), source = document.createElement('source');
    v.autoplay = true;
    v.className = 'antenna';
    source.type = 'service/webos-broadcast';
    source.src = 'tv://';
    v.appendChild(source);
    v.onclick = hideAntenna;
    v.addEventListener('error', function () {
      if (antenna !== v) return;
      hideAntenna();
      toast(tr("The antenna's picture didn't come. Try again."));
    }, true);
    $('stage').appendChild(v);
    antenna = v;
    setClass(body, 'antenna-open', true);
  }

  function hideAntenna() {
    var v = antenna;
    if (!v) return;
    antenna = null;
    setClass(body, 'antenna-open', false);
    try { v.pause(); } catch (e) {}
    while (v.firstChild) v.removeChild(v.firstChild);
    try { v.load(); } catch (e) {}
    if (v.parentNode) v.parentNode.removeChild(v);
    updateFocus();   // the cards play again
  }

  function activate() {
    if (st.zone === Z.REMINDER) { activateSportsReminder(); return; }
    switch (st.zone) {
      case Z.TOP:
        if (st.top < NTABS) return;
        if (st.top === NTABS) showAntenna();
        else if (st.top === NTABS + 1) { st.zone = Z.SHELF; openDrawer(); st.drawer = 1 < drawerInputs ? 1 : 0; updateFocus(); }
        else openSettings();
        return;
      case Z.CARDS:
        var p = cards[st.card];
        if (p && p.antenna) { showAntenna(); return; }
        if (p && p.all) { openAllChannels(); return; }
        if (p && p.live) { openLiveCard(p.channel); return; }
        var app = p && Data.appFor(p.app);
        if (app) launcher(app.id, app.title)();
        return;
      case Z.CATALOG:
        // A TMDB title opens its page (Watch is there, focused); one of the provider's rows plays as before.
        var item = focusedItem();
        if (item && item.game) watchGame(item.game);
        else if (item && item.epg) watchEpgProgram(item.epg);
        else if (item && item.epgStatus) toast(item.title);
        else if (item && !item.streamId && !item.seriesId) openDetail({type: 'title', kind: item.kind, id: item.id, item: item});
        else openTitle(item);
        return;
      case Z.DETAIL:
        detailActivate();
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
        editActivate();
        return;
      case Z.LANG:
        closePicker(true);
        return;
      case Z.TRAKT:
        if (traktRowsNow[st.trow]) traktRowsNow[st.trow].run();
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
      case Z.DETAIL:
        detailMove(dx, dy);
        break;
      case Z.CATALOG:
        var shownRows = catalogRows(), row = catalog && shownRows[st.crow];
        if (dx && row) st.ccol[st.crow] = Math.max(0, Math.min(row.items.length - 1, (st.ccol[st.crow] || 0) + dx));
        else if (dy > 0 && st.crow < shownRows.length - 1) st.crow++;
        else if (dy < 0 && st.crow > 0) st.crow--;
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        break;
      case Z.TOP:
        if (dx) {
          st.top = Math.max(0, Math.min(NTABS + 2, st.top + dx));
          if (st.top < NTABS) selectTab(st.top);   // as on Apple TV: focusing a tab selects it
        } else if (dy > 0 && st.tab !== 0) {
          if (catalog && catalogRows().length) st.zone = Z.CATALOG;
        } else if (dy > 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = Math.min(cards.length - 1, st.top < NTABS ? 0 : cards.length - 1); }
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
        if (dy) {
          st.row = Math.max(0, Math.min(rowsNow.length - 1, st.row + dy));
          if (resetArmed) { resetArmed = false; renderSettings(); }   // leaving Restore defaults: it asks again
        } else if (dx && rowsNow[st.row]) {
          var r = rowsNow[st.row];
          if (r.value !== '›' && !r.okOnly) { r.step(dx); if (st.zone === Z.SETTINGS) renderSettings(); }
        }
        break;
      case Z.EDIT:
        editMove(dx, dy);
        break;
      case Z.LANG:
        if (dy && picker) st.lang = Math.max(0, Math.min(picker.choices.length - 1, st.lang + dy));
        break;
      case Z.TRAKT:
        if (dy) st.trow = Math.max(0, Math.min(traktRowsNow.length - 1, st.trow + dy));
        if (dy && traktArmed) { traktArmed = false; renderTrakt(); }   // leaving Disconnect: it asks again
        break;
      case Z.REMINDER:
        if (dx) st.reminderAction = Math.max(0, Math.min(2, st.reminderAction + dx));
        else if (dy) st.reminderAction = Math.max(0, Math.min(2, st.reminderAction + (dy > 0 ? 1 : -1)));
        break;
    }
    updateFocus();
  }

  function back() {
    if (st.zone === Z.REMINDER) { closeSportsReminder(true); toast(tr('Reminder postponed')); return; }
    if (st.zone === Z.DETAIL) { detailBack(); return; }
    if (st.zone === Z.EDIT) { editBack(); return; }
    if (st.zone === Z.LANG) { closePicker(false); return; }
    if (st.zone === Z.TRAKT) { closeTrakt(); return; }
    if (st.zone === Z.SETTINGS && settingsBack()) return;
    if (sheetOpen()) { closeSheets(); return; }
    if (st.zone === Z.DRAWER) { closeDrawer(); return; }
    // Movies and Shows: Back goes up to the tabs, then to TV aberta.
    if (st.zone === Z.CATALOG) { st.zone = Z.TOP; st.top = st.tab; st.crow = 0; updateFocus(); return; }   // and back to the first row
    if (st.tab !== 0) { selectTab(0); st.zone = Z.SHELF; updateFocus(); return; }
    if (st.zone !== Z.SHELF && shelf.length) { st.zone = Z.SHELF; updateFocus(); return; }
    TV.back();
  }

  // The pointer moves the focus only when it really moves, and once it rests a moment on a thing: a row slides to keep
  // its focus in view, which puts the next poster under a still pointer (a mouseover too), and a pointer crossing a
  // row would otherwise scroll it at every poster it passes.
  var POINTER_REST = 150, POINTER_MOVED = 120, pointerAt = {x: -1, y: -1, t: 0}, hoverTimer = 0;
  document.addEventListener('mousemove', function (e) {
    if (Math.abs(e.clientX - pointerAt.x) + Math.abs(e.clientY - pointerAt.y) > 2) pointerAt = {x: e.clientX, y: e.clientY, t: Date.now()};
  });

  /** The pointer focuses what it's over (the Magic Remote, or a mouse when previewing). */
  function hover(node, zone, index) {
    var focusHere = function () {
      if (saverOn || (sheetOpen() !== (zone === Z.APPS || zone === Z.SETTINGS || zone === Z.EDIT || zone === Z.LANG || zone === Z.TRAKT))) return;
      if (pages.length && zone !== Z.DETAIL && !sheetOpen()) return;   // what's under an open page isn't there
      if (zone === Z.DRAWER && st.zone !== Z.DRAWER) return;
      if (zone !== Z.DRAWER && st.zone === Z.DRAWER && zone !== Z.SHELF) return;
      if (zone === Z.SHELF && st.zone === Z.DRAWER) closeDrawer();
      if (zone === Z.LANG && st.zone === Z.LANG && st.lang === index) return;   // the picker draws its rows again
      st.zone = zone;
      if (zone === Z.TOP) { st.top = index; if (index < NTABS) selectTab(index); }
      else if (zone === Z.CARDS) st.card = index;
      else if (zone === Z.CATALOG) { st.crow = Math.floor(index / 1000); st.ccol[st.crow] = index % 1000; }
      else if (zone === Z.DETAIL && pages.length) {
        pages[pages.length - 1].row = Math.floor(index / 1000);
        pages[pages.length - 1].cols[Math.floor(index / 1000)] = index % 1000;
      }
      else if (zone === Z.SHELF) st.shelf = index;
      else if (zone === Z.DRAWER) st.drawer = index;
      else if (zone === Z.APPS) st.grid = index;
      else if (zone === Z.SETTINGS) st.row = index;
      else if (zone === Z.EDIT) st.edit = index;
      else if (zone === Z.LANG) st.lang = index;
      else if (zone === Z.TRAKT) st.trow = index;
      updateFocus();
    };
    node.onmouseover = function () {
      if (Date.now() - pointerAt.t > POINTER_MOVED) return;   // it came under a still pointer
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(focusHere, POINTER_REST);
    };
    node.onmouseout = function () { clearTimeout(hoverTimer); };
    node.onclick = function () { clearTimeout(hoverTimer); focusHere(); activate(); };
  }

  // MARK: - Toast

  var toastTimer = 0;

  // MARK: - Night, clock, screensaver

  var lastNight = null;

  var saverOn = false, idleAt = Date.now(), saverIndex = 0, saverTimer = 0;

  // MARK: - Keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (poke()) { e.preventDefault(); return; }   // the first press only wakes the screen
    if (antenna) {
      if (k === TV.keys.ok || k === TV.keys.back || k === 27 || k === 8) hideAntenna();
      e.preventDefault();
      return;
    }
    if ((k === 403 || e.key === 'ColorF0Red') && st.tab === 1 && st.zone === Z.CATALOG) {
      var sportItem = focusedItem();
      if (sportItem && sportItem.game) chooseSportsChannel(sportItem.game);
      e.preventDefault();
      return;
    }
    if ((k === 404 || e.key === 'ColorF1Green') && st.tab === 1 && st.zone === Z.CATALOG) {
      var reminderItem = focusedItem();
      if (reminderItem && reminderItem.game && reminderItem.game.state === 'soon') {
        var existingReminder = Sports.reminderFor(reminderItem.game.id);
        if (existingReminder) { Sports.cancelReminder(reminderItem.game.id); toast(tr('Reminder cancelled')); drawCatalog(); }
        else { Sports.setReminder(reminderItem.game, 10); toast(trf('Reminder set: {time}', {time: formatDate('format|h:mm', reminderItem.game.start - 10 * 60000)})); drawCatalog(); }
      }
      e.preventDefault();
      return;
    }
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

  // The wheel (a mouse's, or the Magic Remote's) is the arrows: down and up go row by row (on the home screen, down to
  // the drawer with the inputs and the weather), sideways or with Shift along a row. One step per notch, however fast
  // it spins (a pad sends dozens of small ones). Nothing here scrolls by itself: every screen is drawn for 1920×1080
  // and moves with its focus, so the wheel moves the focus.
  var WHEEL_GAP = 160, wheelAt = 0;
  function wheel(e) {
    e.preventDefault();
    if (poke() || antenna) return;
    var dy = e.deltaY !== undefined ? e.deltaY : -(e.wheelDelta || 0), dx = e.deltaX || 0;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    if (!dx && !dy) return;
    var now = Date.now();
    if (now - wheelAt < WHEEL_GAP) return;
    wheelAt = now;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
    else move(0, dy > 0 ? 1 : -1);
  }
  // Not passive: the page itself must not take the wheel (and newer Chromes would make a document listener passive).
  document.addEventListener('onwheel' in document ? 'wheel' : 'mousewheel', wheel, {passive: false});

