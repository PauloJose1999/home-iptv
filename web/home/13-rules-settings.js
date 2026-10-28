  // MARK: - Rules of Home Settings (web/home/13-rules-settings.js): which rows the list and the Accessibility page
  // hold and what each one changes, the languages offered, the Trakt line, and the shelf editor's menu; nothing here
  // draws (a row's step opens its screen only when it's picked). A part of web/home.js, joined in order by
  // tools/webapp.py into the one function the other parts share.

  /** The three channels of TV aberta, by name: set on the TV, else config.properties' live_channels. */
  function liveWanted() { return Prefs.liveChannels() || CONFIG.liveChannels || []; }

  function settingRows() {
    if (settingsPage === 'access') return accessRows();
    var unit = Prefs.temperature(), theme = Prefs.theme(), mins = Prefs.saverMinutes();
    var auto = tr('Automatic'), picked = pickedLanguage(), wanted = liveWanted();
    var rows = [], picks = cardPicks();
    rows.push({key: 'card0', label: tr('Big card'), value: pickLabel(picks.big), opens: true,
      about: tr('Any channel, from the antenna or from the internet (IPTV). OK picks it.'),
      step: function (d) { if (d >= 0) pickChannel('big'); }});
    rows.push({key: 'card1', label: tr('Small card'), value: pickLabel(picks.small), opens: true,
      about: picks.big.kind === 'antenna' ? tr('Beside an antenna channel, an internet one: the TV plays one of each at once.')
          : tr('Beside an internet channel, an antenna one: the TV plays one of each at once.'),
      step: function (d) { if (d >= 0) pickChannel('small'); }});
    rows.push({key: 'lists', label: tr('IPTV list'), value: Channels.count() ? plural('plural|one:{n} list|other:{n} lists', Channels.count()) : tr('None'),
      opens: true, about: tr('The lists set up in the IPTV Player. OK brings them here again.'),
      step: function (d) { if (d >= 0) { closeSheets(); askForLists(true); } }});
    rows.push({key: 'sound', label: tr('Channel sound'), toggle: Prefs.cardSound(),
      about: tr('The selected channel card plays with sound; the others stay silent.'),
      step: function () { Prefs.set('cardSound', !Prefs.cardSound()); }});
    rows.push({key: 'shelf', label: tr('Shelf'), value: '›',
      about: tr("Put the apps in the order you like, and hide the ones you don't use."),
      step: function (d) { if (d >= 0) openShelfEdit(); }});
    rows.push({key: 'trakt', label: 'Trakt.tv', opens: true,
      value: !Trakt.configured ? tr('Not set up') : Trakt.connected() ? (Trakt.user() || tr('Connected')) : tr('Not connected'),
      about: tr('Your Trakt account: the episodes and movies you watched here and on other devices, and My list.'),
      step: function (d) { if (d >= 0) openTrakt(); }});
    rows.push({key: 'access', label: tr('Accessibility'), value: '›',
      about: tr('Text size, contrast and focus, to see the screen well from afar.'),
      step: function (d) { if (d >= 0) { settingsPage = 'access'; st.row = 0; } }});
    rows.push({key: 'theme', label: tr('Theme'), value: theme === 'light' ? tr('Light') : theme === 'dark' ? tr('Dark') : auto,
      about: tr('Automatic: light by day, dark at night.'),
      step: function (d) { cycle('theme', ['auto', 'light', 'dark'], theme, d); checkNight(); }});
    rows.push({key: 'saver', label: tr('Screensaver'), value: mins ? trf('After {n} min', {n: mins}) : tr('saver|Off'),
      about: tr('Photos of movies and shows after a while without the remote.'),
      step: function (d) { cycle('saverMinutes', SAVER_CHOICES, mins, d); }});
    rows.push({key: 'language', label: tr('Language'), value: picked === 'auto' ? auto : I18N.languageName(picked), opens: true,
      about: tr('The language of the home screen.'),
      step: function (d) { if (d >= 0) openLanguages(); }});
    rows.push({key: 'temperature', label: tr('Temperature'), value: unit === 'C' ? '°C' : unit === 'F' ? '°F' : tr('unit|Automatic'),
      about: tr('Celsius or Fahrenheit, for the weather.'),
      step: function (d) { cycle('temperature', ['auto', 'C', 'F'], unit, d); renderPanels(); }});
    rows.push({key: 'weather', label: tr('Weather widget'), toggle: Prefs.weather(),
      about: tr('The weather card in the drawer (↓ on the shelf).'),
      step: function () { Prefs.set('weather', !Prefs.weather()); renderPanels(); }});
    rows.push({key: 'tv', label: tr('TV Settings'), value: '›',
      about: tr("The TV's own settings: picture, sound, network."),
      step: function (d) { if (d >= 0) tvSettings(); }});
    rows.push({key: 'reset', label: tr('Restore defaults'), value: resetArmed ? tr('Press OK again') : '›', okOnly: true, warn: resetArmed,
      about: tr('Forgets every setting made here, the shelf and the channels too.'),
      step: function (d) { if (d >= 0) restoreDefaults(); }});
    return rows;
  }

  function accessRows() {
    var size = Prefs.textSize();
    return [
      {key: 'textsize', label: tr('Text size'),
        value: size === 'xlarge' ? tr('Extra large') : size === 'large' ? tr('Large') : tr('text|Normal'),
        about: tr('Bigger letters on the home screen, the title pages and these settings.'),
        step: function (d) { cycle('textSize', TEXT_SIZES, size, d); applyAccess(); }},
      {key: 'contrast', label: tr('High contrast'), toggle: Prefs.contrast(),
        about: tr('The smaller texts in solid colors, easier to read.'),
        step: function () { Prefs.set('contrast', !Prefs.contrast()); applyAccess(); }},
      {key: 'focus', label: tr('Stronger focus'), toggle: Prefs.strongFocus(),
        about: tr('A thick yellow frame around what is selected.'),
        step: function () { Prefs.set('strongFocus', !Prefs.strongFocus()); applyAccess(); }},
      {key: 'motion', label: tr('Fewer animations'), toggle: Prefs.still(),
        about: tr('Nothing slides or fades: the screen changes at once.'),
        step: function () { Prefs.set('still', !Prefs.still()); applyAccess(); }}
    ];
  }

  function cycle(name, values, current, d) {
    var i = values.indexOf(current);
    Prefs.set(name, values[(i + (d || 1) + values.length) % values.length]);
  }

  /** What Trakt is doing, in a line. */
  function traktStatus() {
    var s = Trakt.status();
    if (s.syncing) return tr('Syncing…');
    if (s.error === 'offline') return tr("No connection to Trakt. What you watch is kept here and sent later.");
    if (s.error === 'expired') return tr('Trakt signed you out. Connect again.');
    if (s.error) return tr("Trakt didn't answer. Try syncing again.");
    var line = s.syncedAt ? trf('Synced at {time}', {time: formatDate('format|h:mm', s.syncedAt)}) : '';
    if (s.pending) line += (line ? '  ·  ' : '') + plural('plural|one:{n} item waiting to be sent|other:{n} items waiting to be sent', s.pending);
    return line;
  }

  function languageChoices() {
    return ['auto'].concat(I18N.languages());
  }

  /** The language in use: "auto", or the catalogue the setting resolved to ("pt-BR" in config.properties is "pt"). */
  function pickedLanguage() {
    return Prefs.language() === 'auto' ? 'auto' : I18N.lang;
  }

  function editIndex(id) {
    for (var i = 0; i < edit.order.length; i++) if (edit.order[i].id === id) return i;
    return -1;
  }

  function editMenuItems() {
    var app = edit.order[st.edit], hidden = app && edit.hidden.indexOf(app.id) >= 0;
    return [tr('Move'), hidden ? tr('Show on the shelf') : tr('Hide from the shelf'), tr('Put it first'), tr('Cancel')];
  }
