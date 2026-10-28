  // MARK: - The shelf editor's screen (web/home/37-ui-shelfedit.js): the apps in a grid, the menu on one, moving one
  // with the arrows or the pointer, and saving the order (its state, `edit`, and its pointer listeners stay in
  // home.js, in their place). A part of web/home.js, joined in order by tools/webapp.py into the one function the
  // other parts share.

  function openShelfEdit() {
    setClass($('settings'), 'open', false);
    edit.order = fullOrder();
    edit.hidden = Prefs.shelfHidden().slice();
    edit.held = false;
    edit.menu = false;
    st.zone = Z.EDIT;
    st.edit = 0;
    renderShelfEdit();
    setClass($('shelfedit'), 'open', true);
    updateFocus();
  }

  function closeShelfEdit() {
    edit.held = false;
    edit.menu = false;
    setClass($('shelfedit'), 'open', false);
    openSettings('shelf');
  }

  function renderShelfEdit() {
    var sheet = $('shelfedit');
    sheet.innerHTML = '';
    el('h2', '', sheet, tr('Shelf'));
    edit.banner = el('div', 'banner', sheet);
    var grid = el('div', 'grid', sheet);
    edit.cells = {};
    for (var i = 0; i < edit.order.length; i++) {
      var a = edit.order[i], cell = el('div', 'cell', grid);
      face(a, el('div', 'face', cell), wordFit(a.title, EDIT_W, 34));
      el('div', 'label', cell, a.title);
      el('div', 'num', cell);
      el('div', 'off', cell, tr('Hidden'));
      cell.appId = a.id;
      edit.cells[a.id] = cell;
      editPointer(cell);
    }
    edit.menuNode = el('div', 'menu', sheet);
    edit.keys = el('div', 'keys', sheet);
  }

  /** Puts every app in its place (they slide there), and says what the keys do now. */
  function placeEdit() {
    var n = edit.order.length, rows = Math.ceil(n / EDIT_COLS), r = Math.floor(st.edit / EDIT_COLS), shown = 0;
    edit.first = Math.max(0, Math.min(rows - 3, r - 1));
    for (var i = 0; i < n; i++) {
      var a = edit.order[i], cell = edit.cells[a.id], row = Math.floor(i / EDIT_COLS);
      var hidden = edit.hidden.indexOf(a.id) >= 0, dragged = edit.drag && edit.drag.moved && i === st.edit;
      if (!dragged) {
        cell.style.left = EDIT_LEFT + (i % EDIT_COLS) * EDIT_STEP_X + 'px';
        cell.style.top = EDIT_TOP + (row - edit.first) * EDIT_STEP_Y + 'px';
      }
      setClass(cell, 'away', !dragged && (row < edit.first || row >= edit.first + 3));
      setClass(cell, 'focus', st.zone === Z.EDIT && i === st.edit);
      setClass(cell, 'held', edit.held && i === st.edit);
      setClass(cell, 'dragging', !!dragged);
      setClass(cell, 'hidden-app', hidden);
      if (!hidden) shown++;
      cell.childNodes[2].textContent = hidden ? '' : String(shown);
    }
    var app = edit.order[st.edit], place = 0;
    for (var p = 0; p <= st.edit && p < n; p++) if (edit.hidden.indexOf(edit.order[p].id) < 0) place++;
    edit.banner.textContent = edit.held && app ? trf('Moving {app}', {app: app.title}) + '  ·  ' + trf('Position {n} of {total}', {n: place, total: shown}) : '';
    setClass(edit.banner, 'on', edit.held);
    renderEditMenu();
    edit.keys.textContent = edit.menu ? tr('↑ ↓ choose, OK confirms, Back closes.')
        : edit.held ? tr('The arrows move the app. OK leaves it here, Back puts it back.')
        : tr('OK on an app to move it or hide it. With the pointer: hold it and drag. Back: done.');
  }

  function renderEditMenu() {
    var m = edit.menuNode;
    setClass(m, 'on', edit.menu);
    if (!edit.menu) return;
    var cell = edit.cells[edit.order[st.edit].id], items = editMenuItems();
    m.innerHTML = '';
    m.style.left = Math.min(1920 - 420, parseFloat(cell.style.left) + 40) + 'px';
    m.style.top = Math.min(1080 - 360, parseFloat(cell.style.top) + 130) + 'px';
    for (var i = 0; i < items.length; i++) {
      var row = el('div', 'opt' + (i === edit.menuAt ? ' focus' : ''), m, items[i]);
      row.optIndex = i;
      row.onmouseover = function () { edit.menuAt = this.optIndex; renderEditMenu(); };
      row.onmouseup = function (e) { e.stopPropagation(); edit.menuAt = this.optIndex; runEditMenu(); };
    }
  }

  function runEditMenu() {
    var app = edit.order[st.edit], which = edit.menuAt;
    edit.menu = false;
    if (!app) return;
    if (which === 0) {
      edit.held = true;
      edit.before = edit.order.slice();
    } else if (which === 1) {
      var h = edit.hidden.indexOf(app.id);
      if (h >= 0) edit.hidden.splice(h, 1); else edit.hidden.push(app.id);
      saveEdit(h >= 0 ? trf('{app} is back on the shelf.', {app: app.title}) : trf('{app} is off the shelf (still in All Apps).', {app: app.title}));
    } else if (which === 2) {
      edit.order.splice(st.edit, 1);
      edit.order.unshift(app);
      st.edit = 0;
      saveEdit(trf('{app} is now first.', {app: app.title}));
    }
    placeEdit();
  }

  /** The held app goes `delta` places on (←/→ one, ↑/↓ a row); the others move over. */
  function moveHeld(delta) {
    var to = st.edit + delta;
    if (to < 0 || to >= edit.order.length) return;
    var app = edit.order.splice(st.edit, 1)[0];
    edit.order.splice(to, 0, app);
    st.edit = to;
    placeEdit();
  }

  function dropHeld() {
    var app = edit.order[st.edit];
    edit.held = false;
    saveEdit(app ? trf('{app} stays here.', {app: app.title}) : '');
    placeEdit();
  }

  function cancelHeld() {
    var id = edit.order[st.edit] && edit.order[st.edit].id;
    edit.order = edit.before || edit.order;
    edit.held = false;
    st.edit = Math.max(0, editIndex(id));
    placeEdit();
  }

  /** The new order and hidden apps go to the shelf (it changes behind the sheet) and are kept. */
  function saveEdit(message) {
    Prefs.set('shelf', edit.order.map(function (a) { return a.id; }));
    Prefs.set('shelfHidden', edit.hidden.slice());
    pickShelf();
    renderShelf();
    if (message) toast(message);
  }

  function editMove(dx, dy) {
    if (edit.menu) {
      edit.menuAt = Math.max(0, Math.min(editMenuItems().length - 1, edit.menuAt + (dy || dx)));
    } else if (edit.held) {
      moveHeld(dx + dy * EDIT_COLS);
    } else {
      var g = st.edit + dx + dy * EDIT_COLS;
      if (g >= 0 && g < edit.order.length && (dx === 0 || Math.floor(g / EDIT_COLS) === Math.floor(st.edit / EDIT_COLS))) st.edit = g;
    }
  }

  function editActivate() {
    if (edit.menu) runEditMenu();
    else if (edit.held) dropHeld();
    else { edit.menu = true; edit.menuAt = 0; placeEdit(); }
  }

  function editBack() {
    if (edit.menu) { edit.menu = false; placeEdit(); }
    else if (edit.held) cancelHeld();
    else closeShelfEdit();
  }

  /** The pointer: over an app focuses it; a click opens its options; held and dragged, the app follows it. */
  function editPointer(cell) {
    cell.onmouseover = function () {
      if (st.zone !== Z.EDIT || edit.held || edit.menu) return;
      st.edit = editIndex(cell.appId);
      placeEdit();
    };
    cell.onmousedown = function (e) {
      if (st.zone !== Z.EDIT || edit.menu) return;
      st.edit = editIndex(cell.appId);
      var at = stagePoint(e);
      edit.drag = {x: at.x, y: at.y, dx: at.x - parseFloat(cell.style.left), dy: at.y - parseFloat(cell.style.top), moved: false};
      if (e.preventDefault) e.preventDefault();
    };
  }

  /** A pointer event's place on the 1920 × 1080 stage (scaled to fit the window in the browser). */
  function stagePoint(e) {
    var r = stage.getBoundingClientRect(), s = r.width / 1920 || 1;
    return {x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s};
  }
