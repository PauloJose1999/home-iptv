  // MARK: - Home Settings' screens (web/home/36-ui-settings.js): the list and its Accessibility page (a side panel),
  // the Trakt.tv sheet, and the picker (a language, a card's channel); which rows there are is in
  // 13-rules-settings.js, and their state and listeners stay in home.js, in their place. A part of web/home.js, joined
  // in order by tools/webapp.py into the one function the other parts share.

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
