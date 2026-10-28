  // MARK: - The TV (web/home/21-data-tv.js): its apps and inputs, opening an app or the TV's own settings, and the
  // antenna card's channel (switched and read through the card's own picture). A part of web/home.js, joined in order
  // by tools/webapp.py into the one function the other parts share.

  /**
   * The antenna card's picture on the channel picked for it, once it plays (the switch goes through that picture,
   * staying in this app); then its name and number. Nothing picked: the channel the TV is on.
   */
  function tuneAntenna(video) {
    var picks = cardPicks(), want = picks.big.kind === 'antenna' ? picks.big.name : picks.small.name;
    if (!want) { learnAntenna(video); return; }
    TV.channels([], 999, function (list) {
      var target = null;
      for (var i = 0; list && i < list.length && !target; i++) if (plainName(list[i].name) === plainName(want)) target = list[i];
      if (!target) { learnAntenna(video); return; }
      TV.tune(video, target, function () { learnAntenna(video, target); });
    });
  }

  /**
   * Which channel the antenna card's picture is on: the card takes its name, number and program. The broadcast
   * service may leave a subchannel's name out: the channel list's (`known`, the one tuned) fills it in.
   */
  function learnAntenna(video, known) {
    TV.broadcastChannel(video, function (ch) {
      if (!ch) { TV.currentChannel(showAntennaChannel); return; }   // an older TV: its remote-control service tells it
      if (!ch.name && known && known.id === ch.id) ch.name = known.name;
      showAntennaChannel(ch);
    });
  }

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
