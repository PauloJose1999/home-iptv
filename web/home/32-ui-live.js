  // MARK: - TV aberta's screen (web/home/32-ui-live.js): the channel cards and All channels, the card that plays (one
  // picture at a time: the antenna's or a stream), and the antenna full screen; which channel goes on which card is in
  // 11-rules-live.js, and their state (cards, player, antenna) stays in home.js, in its place. A part of web/home.js,
  // joined in order by tools/webapp.py into the one function the other parts share.

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
