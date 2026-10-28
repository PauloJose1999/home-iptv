  // MARK: - Navigation (web/home/80-input.js): what OK, the arrows, Back, the pointer and the wheel do in each zone;
  // the listeners that call them stay in home.js, in their place. A part of web/home.js, joined in order by
  // tools/webapp.py into the one function the other parts share.

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
