  // MARK: - The focus (web/home/30-ui-focus.js): which item of which zone has it, drawn on every screen at once
  // (updateFocus), the nearest item when the focus changes rows, and the sheets over the home screen (open or not,
  // closing them all). The zones (Z) and the focus (st) stay in home.js, in their place. A part of web/home.js, joined
  // in order by tools/webapp.py into the one function the other parts share.

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
