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
    hideAntenna();
    hideSaver();
    closeSheets();
    closeDetails();
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

  function reopened(e) {
    // LG: with handlesRelaunch the app has to come to the front itself, or opening it again while it runs shows nothing.
    if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    // Back from the IPTV player: its report, and the page it was opened from stays.
    if (takeLaunchParams((e && e.detail) || (window.PalmSystem && window.PalmSystem.launchParams))) return;
    reset();
    loadApps(function () { renderShelf(); renderDrawer(); Data.refresh(); });
  }

  window.addEventListener('resize', fit);
  document.addEventListener('webOSRelaunch', reopened);   // LG: opened again while running
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      hideAntenna();
      stopPlayer();
      hideSaver();
      return;
    }
    Trakt.syncIfStale();
    checkSportsReminder();
    idleAt = Date.now();
    loadApps(function () { renderShelf(); renderDrawer(); updateFocus(); Data.refresh(); });
  });

  I18N.set(Prefs.language());
  if (window.PalmSystem) takeLaunchParams(window.PalmSystem.launchParams);   // opened by the IPTV player, with a report
  applyAccess();   // the accessibility choices, before anything is drawn
  checkNight();   // now, from the last forecast: not after the TV lists its apps, with the day look until then
  // LG's screensaver waits only when ours will show: not under a sheet (ours waits there), and not without photos.
  TV.holdScreenSaver(function () { return !!antenna || (Prefs.saverMinutes() > 0 && !sheetOpen() && saverPhotos().length > 0); });
  fit();
  renderTop();
  tickClock();
  loadApps(function () {
    renderAll();
    Data.refresh();
    setTimeout(Trakt.syncIfStale, 5000);   // Trakt, after the screen is up
    if (TV.name === 'webos') setTimeout(function () { askForLists(false); }, 3000);   // the IPTV player's lists, once
  });
  setInterval(function () {
    checkNight();
    Data.refresh();
    if (Date.now() - channelsAt > 5 * 60000) loadChannels();   // what's on now, every 5 minutes
    if (antenna) idleAt = Date.now();   // watching the antenna full screen: no screensaver
    if (!saverOn && !sheetOpen() && Prefs.saverMinutes() && Date.now() - idleAt > Prefs.saverMinutes() * 60000) showSaver();
    checkSportsReminder();
    if (saverOn) tickSaverClock($('saver').querySelector('.clock'));
  }, 30000);

  // For the browser preview and tests.
  window.FreeMyTV = {state: st, move: move, activate: activate, back: back, showSaver: showSaver, hideSaver: hideSaver, toast: toast};
})();
