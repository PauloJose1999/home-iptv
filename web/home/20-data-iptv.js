  // MARK: - The IPTV player (web/home/20-data-iptv.js): opening a channel, a movie, an episode or the channel list in
  // it (deep links), asking it for its IPTV lists, the channel card's channel from them, and what it hands back when
  // it brings this app back (launch params). A part of web/home.js, joined in order by tools/webapp.py into the one
  // function the other parts share.

  /**
   * The internet card's channel, from the IPTV list: OK plays it in the IPTV player (never LG's Live TV). The one
   * picked first; when the list doesn't have it (one the list dropped), the config's channels, then the list's first
   * one. [] when the list can't be read.
   */
  function iptvCards(done) {
    if (!Channels.count()) { done([], 'none'); return; }
    Channels.load(function () {
      var all = Channels.channels(), out = [], seen = {}, picks = cardPicks();
      function add(ch) {
        if (!ch || seen[ch.url] || out.length >= 1) return;
        seen[ch.url] = true;
        out.push({id: 'iptv:' + ch.url, number: '', name: ch.name, program: null, iptv: ch, logo: ch.logo});
      }
      var wanted = [picks.big.kind === 'iptv' ? picks.big.name : picks.small.name].concat(CONFIG.liveChannels || []);
      for (var w = 0; w < wanted.length; w++) if (wanted[w]) add(Channels.lookup(wanted[w]));
      for (var i = 0; i < all.length && out.length < 1; i++) add(all[i]);
      done(out, all.length ? '' : Channels.error() ? 'error' : 'none');
    });
  }

  function loadChannels(done) {
    iptvCards(function (list, why) {
      liveChannels = list;
      liveProblem = why || '';
      channelsAt = Date.now();
      if (st.tab === 0) renderCards();
      if (done) done();
    });
  }

  /** All channels: the IPTV player's channel list (Back there comes back here). */
  function openAllChannels() {
    stopPlayer();
    if (!openInIptv('section', 'live', null, playerMissing)) playerMissing();
  }

  /** The IPTV player didn't open: say so, and the card that played plays again. */
  function playerMissing() {
    noPlayer();
    placePlayer();
  }

  /**
   * The IPTV player's lists, asked for: it opens a moment and comes back with them (the account is set up there, the
   * one place). Once when this app has none yet (a day apart, if the player has none either), or from Home Settings.
   */
  function askForLists(always) {
    var asked = 0;
    try { asked = +localStorage.getItem('fmtv.iptvAsked') || 0; } catch (e) {}
    if (!always && (Channels.known() || Date.now() - asked < 86400000)) return;
    try { localStorage.setItem('fmtv.iptvAsked', String(Date.now())); } catch (e) {}
    if (!openInIptv('account', 'account', null, noPlayer) && always) noPlayer();
  }

  /** The IPTV player isn't set or isn't on the TV: every channel plays there. */
  function noPlayer() { toast(tr('Install the IPTV Player to watch the channels.')); }

  /**
   * OK on a title: the IPTV player, when it's on the TV, finds it in the IPTV account and plays a movie at once (a
   * series opens on its episodes); its name and year say which, or the provider's id for Xtream VOD rows. Without the
   * player: the streaming app a TMDB title is on (Netflix, Prime Video…).
   */
  function openTitle(p) {
    if (!p) return;
    var extra = {};
    if (p.streamId || p.seriesId) extra.id = p.streamId || p.seriesId;
    if (p.year) extra.year = p.year;
    if (p.original && p.original !== p.title) extra.altTitle = p.original;
    if (!p.streamId && !p.seriesId && p.id) extra.tmdbId = String(p.id);   // handed back with the progress
    var elsewhere = function () {
      if (extra.id) { toast(tr('Install the IPTV Player on the TV to watch this title.')); return; }
      Data.whereToWatch(p, function (app) {
        if (app) launcher(app.id, app.title)();
        else toast(trf("{title} isn't on this TV's apps.", {title: p.title}));
      });
    };
    if (!openInIptv(p.kind === 'movie' ? 'movie' : 'series', p.title, extra, elsewhere)) elsewhere();
  }

  /** An episode in the IPTV player (from where it was left when `resume`); without the player, the show as before. */
  function watchEpisode(show, season, episode, resume) {
    var t = show.data || show.item || {}, extra = {tmdbId: String(show.id), season: season, episode: episode, resume: resume};
    if (t.year) extra.year = t.year;
    if (t.original && t.original !== t.title) extra.altTitle = t.original;
    var elsewhere = function () { Data.whereToWatch({kind: 'tv', id: show.id, title: t.title, year: t.year, original: t.original}, function (app) {
      if (app) launcher(app.id, app.title)();
      else toast(trf("{title} isn't on this TV's apps.", {title: t.title}));
    }); };
    if (!openInIptv('series', t.title, extra, elsewhere)) elsewhere();
  }

  /**
   * The IPTV player's report, when it brings this app back: its lists (the account lives there alone), and a show's
   * or a movie's progress, kept, the page on screen showing it.
   */
  function takeLaunchParams(params) {
    if (typeof params === 'string') { try { params = JSON.parse(params); } catch (e) { params = null; } }
    if (params && params.iptv && Channels.setSources(params.iptv)) loadChannels();
    if (params && params.returned === 'channel') {
      var returnedGame = Sports.takeReturn();
      if (returnedGame) {
        sportReturnId = returnedGame;
        st.tab = 1;
        st.zone = Z.CATALOG;
        catalogKind = '';
        renderCatalog();
        updateFocus();
        return true;
      }
    }
    if (params && (params.returned || params.iptv) && !params.progress) return true;   // the card or page it was opened from
    if (!params || !params.progress) return false;
    var report = params.progress;
    if (report.movie) {
      Data.recordMovie(report);
      if (report.movie.done) Trakt.watched({kind: 'movie', tmdb: report.tmdbId, at: report.movie.endedAt});
    } else {
      Data.recordProgress(report);
      // Only what the player saw to the end goes to Trakt's history; one only opened or left halfway doesn't.
      for (var i = 0; report.episodes && i < report.episodes.length; i++) {
        var e = report.episodes[i];
        if (e.done) Trakt.watched({kind: 'episode', tmdb: report.tmdbId, season: e.season, episode: e.episode, at: e.endedAt});
      }
    }
    if (pages.length) {
      var top = pages[pages.length - 1];
      if (top.type === 'episodes') top.target = nextEpisode(top.show);
      renderDetail();
    }
    return true;
  }

  /**
   * The IPTV player the home deep-links into (iptv_app in config.properties, e.g. lennylxx/webos-iptv-player's
   * com.lennylxx.iptv); '' when none is set. Not checked against the TV's app list: that list comes from a TV service
   * that is sometimes down, and then every channel, movie and show went to LG's Live TV or the wrong player. The
   * launch itself tells whether the player is there.
   */
  function iptvApp() {
    if (window.VOD_DEMO) return 'com.lennylxx.iptv';   // demo: pretend the player is installed on the TV
    return (window.CONFIG && CONFIG.iptvApp) || '';
  }

  /**
   * Opens the IPTV player at a channel, movie or series; extra fields (id, year, tmdbId, season…) make the deep link
   * exact. False when no player is set (the caller does what it did before); `failed` runs when the TV can't open it
   * (not installed). A second OK while the player is opening is ignored: one press, one launch.
   */
  function openInIptv(kind, value, extra, failed) {
    var id = iptvApp();
    if (!id) return false;
    if (Date.now() - iptvLaunchAt < 3000) return true;
    iptvLaunchAt = Date.now();
    // from: this app, which the player brings back with Back (with a show's progress).
    var self = window.PalmSystem && window.PalmSystem.identifier ? window.PalmSystem.identifier.split(' ')[0] : 'io.freemytv';
    var dl = {kind: kind, title: value, from: self};
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) dl[k] = extra[k];
    TV.launch(id, {deepLink: dl}, function (ok) {
      if (!ok) {
        iptvLaunchAt = 0;
        if (failed) failed();
        else toast(trf("Couldn't open {app}.", {app: 'IPTV Player'}));
      } else if (window.VOD_DEMO) toast('▶ Player IPTV: ' + value + ' (' + kind + (dl.id ? ', id ' + dl.id : '') + ')');
    });
    return true;
  }

  /**
   * OK on a channel card: the channel in the IPTV player, from its place in the player's list (channel up and down
   * and the guide work there); its stream goes along for when no list there has it. Never LG's Live TV.
   */
  function openLiveCard(ch) {
    if (!ch) { toast(noChannelsText()); return; }
    var entry = ch.iptv;
    stopPlayer();
    if (!openInIptv('channel', entry.name, {url: entry.url, logo: entry.logo || ''}, playerMissing)) playerMissing();
  }
