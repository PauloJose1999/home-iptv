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

  /**
   * The tab's rows: My list first (the Trakt watchlist of this kind, with TMDB's photos as they come), then the
   * catalog's. Its titles come from Trakt with ids only; the missing photos are fetched once, then it's drawn again.
   */
  var myList = null, myListKey = '';

  var heroFor = null, heroTimer = 0;

  // MARK: - Sports: today's games (Sports.today), as the catalog's rows: one row per sport
  //
  // The focused game is large on top (the teams' colors behind, the score); OK opens its channel in the IPTV player,
  // found in the lists by the broadcaster. Scores come again every minute while the tab is open.

  // MARK: - Details: a movie's or a show's page (Watch, cast, similar titles) and a person's (filmography)
  //
  // A stack of pages over the tabs: a title opens its page, a cast member theirs, a title of a filmography or a similar
  // one its own, and Back goes down the stack to the row and item it was left on. A page draws what it already has at
  // once (the title from its row, a cast member's name and photo) and the rest when TMDB answers; only the photos near
  // the focus load. Watch is the same OK as before this page (openTitle: the IPTV player, or the streaming app).

  var pages = [];   // {type: 'title' | 'person', kind, id, item, data, error, rows, row, cols, nodes}
  // Rows start under the header (a person's, without Watch, is shorter); a lower row, focused, comes up to LIFT_TO.
  var DETAIL_TOP = 650, PERSON_TOP = 560, LIFT_TO = 540, CAST_STEP = 220, POSTER_STEP = 250, DETAIL_ROW_H = {cast: 330, posters: 480};

  // MARK: - Series: Continue S·E, and the episodes page
  //
  // Where a show was left comes from the IPTV player: Back there brings this app back with the show's episode progress
  // in the launch params (Data.recordProgress), as apps can't read each other's storage. Without it (no player, never
  // watched), a show starts at S1·E1.

  var EP_ROW = 200;

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

  // MARK: - Drawer

  var drawerItems = [], drawerInputs = 0;

  // MARK: - All Apps

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

  var rowsNow = [], settingsAbout = null;

  // MARK: - Trakt.tv: connect (a code to type on another device), sync, disconnect

  var traktFlow = null, traktRowsNow = [], traktArmed = false;

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

