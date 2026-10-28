  // MARK: - The Sports tab (web/home/33-ui-sports.js): today's games and the guide's sports programs as rows, their
  // cards and the featured one, the channel a game is on (and the viewer's pick), reminders, and opening a game in
  // the IPTV player. A part of web/home.js, joined in order by tools/webapp.py into the one function the other parts
  // share.

  function sportName(sport) {
    return sport === 'soccer' ? tr('Football') : sport === 'basketball' ? tr('Basketball')
        : sport === 'racing' ? tr('Formula 1') : tr('Fights');
  }

  /** A row per sport: football first, then the one with the most games live; in a row, live games first, then by start. */
  function sportsCatalog(games, failed, epg) {
    var rows = [], bySport = {};
    for (var i = 0; i < games.length; i++) {
      var g = games[i], row = bySport[g.sport];
      if (!row) {
        row = bySport[g.sport] = {sport: g.sport, live: 0, items: []};
        rows.push(row);
      }
      if (g.state === 'live') row.live++;
      row.items.push({id: g.id, title: g.title, game: g});
    }
    rows.sort(function (a, b) {
      return (b.sport === 'soccer') - (a.sport === 'soccer') || b.live - a.live || b.items.length - a.items.length;
    });
    for (var r = 0; r < rows.length; r++) {
      var name = sportName(rows[r].sport);
      rows[r].title = rows[r].live ? trf('{sport} · {n} live', {sport: name, n: rows[r].live}) : name;
    }
    var epgItems = [], epgTitle = tr('BrazilTVEPG programming');
    if (epg && (epg.status === 'ok' || epg.status === 'stale')) {
      if (epg.status === 'stale') {
        var staleTitle = epg.generatedAt
          ? trf('Guide may be outdated · updated {time}', {time: formatDate('format|d/M h:mm', epg.generatedAt)})
          : tr('The BrazilTVEPG guide is outdated.');
        epgItems.push({id: 'epg-status-stale', title: staleTitle, epgStatus: true});
      }
      for (var e = 0; e < epg.entries.length && epgItems.length < 80; e++) {
        var entry = epg.entries[e];
        epgItems.push({id: entry.id, title: entry.title, epg: entry});
      }
    }
    if (epg && epg.status !== 'ok' && epg.status !== 'stale') {
      var epgMessage = epg.status === 'stale' ? tr('The BrazilTVEPG guide is outdated.')
        : epg.status === 'disabled' ? tr('BrazilTVEPG guide is not configured.')
        : tr('Could not load the BrazilTVEPG guide.');
      epgItems.push({id: 'epg-status-' + epg.status, title: epgMessage, epgStatus: true});
    } else if (epg && !epg.entries.length && epg.status === 'ok') {
      epgItems.push({id: 'epg-status-empty', title: tr('No programmes in the BrazilTVEPG guide today.'), epgStatus: true});
    }
    if (epgItems.length) rows.push({sport: 'epg', title: tr('BrazilTVEPG programming'), items: epgItems});
    return {sports: true, epgPending: !epg, rows: rows, error: failed && !games.length ? 'failed' : ''};
  }

  function epgCard(node, item) {
    var card = el('div', 'epg-card', node);
    var start = formatDate('format|h:mm', item.start);
    var stop = formatDate('format|h:mm', item.stop);
    el('div', 'epg-time', card, start + ' – ' + stop);
    el('div', 'epg-channel', card, item.channel);
    el('div', 'epg-title', card, item.title);
    if (item.subtitle) el('div', 'epg-subtitle', card, item.subtitle);
    el('div', 'label', node, item.channel + ' · ' + item.title);
  }

  function epgHero(hero, info, item) {
    el('div', 'gkicker', info, tr('BrazilTVEPG programming'));
    el('div', 'htitle', info, item.title);
    var now = Date.now(), state = item.start <= now && item.stop > now ? tr('Live')
      : trf('Starts at {time}', {time: formatDate('format|h:mm', item.start)});
    el('div', 'hmeta', info, item.channel + '  ·  ' + state + '  ·  ' + formatDate('format|h:mm', item.start) + '–' + formatDate('format|h:mm', item.stop));
    if (item.subtitle) el('div', 'story', info, item.subtitle);
  }

  /** Tune only when the guide channel maps exactly to a channel in the user's IPTV sources. */
  function watchEpgProgram(program) {
    Channels.load(function () {
      var matches = Sports.named(program.channel, Channels.channels());
      if (!matches.length) { toast(tr('This guide channel is not in your IPTV lists.')); return; }
      if (matches.length === 1) { startEpgChannel(program, matches[0]); return; }
      var labels = matches.map(function (channel) { return channelName(channel.name) + (channel.group ? ' · ' + channel.group : ''); });
      openPicker(tr('Choose a channel for this game'), labels, -1, 'sports', function (at) {
        if (matches[at]) startEpgChannel(program, matches[at]);
      });
    });
  }

  function startEpgChannel(program, channel) {
    Sports.leaving({id: program.id});
    var failed = function () { Sports.forgetReturn(); noPlayer(); };
    if (!openInIptv('channel', channel.name, Channels.linkFor(channel), failed)) failed();
  }

  /** "2º tempo · 67'", "3º quarto · 4:12", "Intervalo"; `short`: the minute alone for football. */
  function gameClock(game, short) {
    var c = game.clock;
    if (!c) return game.state === 'ended' ? tr('Full time') : '';
    if (c.phase === 'halftime') return tr('Halftime');
    if (c.phase === 'other') return c.display;
    var period = game.sport === 'basketball' ? trf('Q{n}', {n: c.period})
        : c.phase === 'extra' ? tr('Extra time') : trf('Half {n}', {n: c.period});
    if (short) return game.sport === 'soccer' && c.display ? c.display : period;
    return c.display ? period + ' · ' + c.display : period;
  }

  function gameScore(game) {
    if (game.state === 'soon' || !game.home || !game.away) return 'x';
    return (game.home.score || '0') + ' – ' + (game.away.score || '0');
  }

  function gameBadge(game, parent) {
    var text = game.state === 'live' ? tr('Live') : game.state === 'ended' ? tr('Ended')
        : trf('Soon · {time}', {time: formatDate('format|h:mm', game.start)});
    return el('span', 'gbadge ' + game.state, parent, text);
  }

  /** A team's crest: its logo, or its code on its color. */
  function crest(t, cls, parent) {
    var c = el('div', 'crest' + (cls ? ' ' + cls : ''), parent);
    if (t.color) { c.style.backgroundColor = t.color; c.style.color = t.ink; }
    if (t.logo) {
      var img = el('img', '', c);
      img.alt = t.code;
      img.onerror = function () { c.removeChild(img); c.textContent = t.code; };
      img.src = t.logo;
    } else c.textContent = t.code;
    return c;
  }

  /** The teams' colors as a background: home on the left, away on the right. */
  function teamColors(node, game) {
    var home = (game.home && game.home.color) || '#334155', away = (game.away && game.away.color) || '#1E293B';
    node.style.backgroundImage = '-webkit-linear-gradient(left, ' + home + ' 50%, ' + away + ' 50%)';
    node.style.backgroundImage = 'linear-gradient(90deg, ' + home + ' 50%, ' + away + ' 50%)';
  }

  function gameChannel(game) {
    var channels = Channels.channels(), ch = Sports.selected(game, channels, Channels.identity);
    if (!ch) {
      var matches = Sports.broadcastMatches(game, channels, Channels.identity);
      if (matches.length === 1) ch = matches[0];
    }
    return ch ? channelName(ch.name) : tr('Channel not confirmed');
  }

  function setGameReminder(game) {
    var old = Sports.reminderFor(game.id), offsets = [0], choices = [tr('At kickoff')];
    if (game.start - 10 * 60000 > Date.now()) { offsets.push(10); choices.push(tr('10 minutes before')); }
    if (game.start - 30 * 60000 > Date.now()) { offsets.push(30); choices.push(tr('30 minutes before')); }
    if (old) choices.push(tr('Cancel reminder'));
    openPicker(tr('Remind me about this game'), choices, -1, 'sports', function (at) {
      if (old && at === choices.length - 1) {
        Sports.cancelReminder(game.id);
        toast(tr('Reminder cancelled'));
      } else {
        Sports.setReminder(game, offsets[at]);
        toast(trf('Reminder set: {time}', {time: formatDate('format|h:mm', game.start - offsets[at] * 60000)}));
      }
      drawCatalog();
    });
  }

  function gameFromReminder(item) {
    for (var r = 0; catalog && catalog.rows && r < catalog.rows.length; r++) {
      for (var i = 0; i < catalog.rows[r].items.length; i++) {
        var game = catalog.rows[r].items[i].game;
        if (game && game.id === item.id) return game;
      }
    }
    var league = null;
    for (var l = 0; l < Sports.LEAGUES.length; l++) if (Sports.LEAGUES[l].path === item.leaguePath) league = Sports.LEAGUES[l];
    return {id: item.id, title: item.title, competition: item.competition, start: item.start, sport: item.sport,
      league: league || {path: item.leaguePath, channels: []}, home: item.home, away: item.away,
      broadcasts: item.broadcasts || [], state: 'live'};
  }

  function renderSportsReminder(item) {
    var layer = $('sportsalert');
    layer.innerHTML = '';
    el('div', 'alert-shade', layer);
    var box = el('div', 'alert-box', layer);
    el('div', 'alert-kicker', box, tr('Game reminder'));
    el('div', 'alert-title', box, item.title);
    el('div', 'alert-subtitle', box, item.competition + '  ·  ' + trf('Starts at {time}', {time: formatDate('format|h:mm', item.start)}));
    var actions = el('div', 'alert-actions', box);
    var labels = [tr('Watch the game'), tr('Remind me in 10 minutes'), tr('Dismiss')];
    for (var i = 0; i < labels.length; i++) (function (at) {
      var button = el('button', 'alert-action', actions, labels[at]);
      button.onclick = function () { st.reminderAction = at; updateFocus(); activateSportsReminder(); };
    })(i);
    el('div', 'alert-hint', box, tr('Use arrows and OK. Back reminds again in 10 minutes.'));
    setClass(layer, 'on', true);
  }

  function checkSportsReminder() {
    if (reminderAlert || document.hidden) return;
    var item = Sports.dueReminder(Date.now());
    if (!item) return;
    reminderAlert = item;
    reminderReturnTab = st.tab;
    reminderReturnZone = st.zone;
    st.reminderAction = 0;
    hideSaver();
    stopPlayer();
    st.zone = Z.REMINDER;
    renderSportsReminder(item);
    updateFocus();
  }

  function closeSportsReminder(snooze) {
    if (!reminderAlert) return;
    if (snooze) Sports.snoozeReminder(reminderAlert.id, 10);
    reminderAlert = null;
    $('sportsalert').innerHTML = '';
    setClass($('sportsalert'), 'on', false);
    st.tab = reminderReturnTab;
    st.zone = reminderReturnZone;
    updateFocus();
  }

  function activateSportsReminder() {
    if (!reminderAlert) return;
    var item = reminderAlert;
    if (st.reminderAction === 1) { closeSportsReminder(true); toast(tr('Reminder postponed')); return; }
    if (st.reminderAction === 2) { Sports.cancelReminder(item.id); closeSportsReminder(false); return; }
    reminderAlert = null;
    $('sportsalert').innerHTML = '';
    setClass($('sportsalert'), 'on', false);
    st.zone = Z.CATALOG;
    updateFocus();
    watchGame(gameFromReminder(item), true);
  }

  /** A game in a row: always dark, as a poster, so the white score reads on it in the day look too. */
  function gameCard(node, game) {
    var card = el('div', 'game', node);
    teamColors(el('div', 'tint', card), game);
    var top = el('div', 'gtop', card);
    gameBadge(game, top);
    if (Sports.reminderFor(game.id)) el('span', 'greminder', top, tr('Reminder'));
    el('span', 'gch', top, gameChannel(game));
    if (game.home && game.away) {
      var mid = el('div', 'gmid', card);
      crest(game.home, '', el('div', 'gteam', mid));
      var score = el('div', 'gscore', mid);
      el('b', '', score, gameScore(game));
      el('span', '', score, gameClock(game, true));
      crest(game.away, '', el('div', 'gteam', mid));
    } else el('div', 'gevent', card, game.title);
    el('div', 'label', node, game.title);
    el('i', 'gbar', el('div', 'gprog', node)).style.width = game.progress + '%';
  }

  function gameHero(hero, info, game) {
    teamColors(hero.firstChild, game);
    setClass(hero.firstChild, 'on', true);
    // The sport's drawing (web/sport-*.svg) over the teams' colors, under the fade.
    var art = hero.querySelector('.sart');
    if (!art) art = hero.insertBefore(el('div', 'sart'), hero.firstChild.nextSibling);
    art.style.backgroundImage = 'url(sport-' + game.sport + '.svg)';
    el('div', 'gkicker', info, game.competition);
    var status = el('div', 'gstatus', info);
    gameBadge(game, status);
    el('span', '', status, gameClock(game, false));
    if (game.home && game.away) {
      var match = el('div', 'gmatch', info);
      var home = el('div', 'gside', match);
      crest(game.home, 'lg', home);
      el('span', '', home, game.home.name);
      el('div', 'gbig', match, gameScore(game));
      var away = el('div', 'gside away', match);
      el('span', '', away, game.away.name);
      crest(game.away, 'lg', away);
    } else el('div', 'htitle', info, game.title);
    var ch = gameChannel(game), channel = el('div', 'hmeta sports-channel', info, ch + '  ·  ' + tr('OK chooses; red key changes channel; green key sets reminder'));
    channel.onclick = function () { chooseSportsChannel(game); };
    channel.onmouseover = function () { if (Date.now() - pointerAt.t <= POINTER_MOVED) channel.focus(); };
    if (game.state === 'soon') {
      el('div', 'hmeta', info, trf('Starts at {time}', {time: formatDate('format|h:mm', game.start)}));
      var reminder = Sports.reminderFor(game.id), label = reminder ? trf('Reminder set: {time}', {time: formatDate('format|h:mm', reminder.triggerAt)}) : tr('Set a reminder');
      var button = el('button', 'sports-reminder', info, label);
      button.onclick = function () { setGameReminder(game); };
      button.onmouseover = function () { if (Date.now() - pointerAt.t <= POINTER_MOVED) button.focus(); };
    }
  }

  /** OK on a game: its channel in the IPTV player; a game still to come only says when it starts. */
  function watchGame(game, reminder) {
    if (game.state === 'soon' && !reminder) {
      toast(trf('Starts at {time}', {time: formatDate('format|h:mm', game.start)}));
      return;
    }
    if (game.state === 'ended') { toast(tr('This event has ended.')); return; }
    if (!Channels.count()) { toast(tr("This game's channel isn't in your IPTV lists.")); return; }
    toast(tr('Checking the channel guide…'));
    Channels.load(function () {
      Sports.resolve(game, Channels.channels(), Channels.identity, Channels.guide, function (result) {
        if (result.status === 'confirmed' || result.status === 'picked' || result.status === 'rule') {
          startSportsChannel(game, result.channel);
        } else {
          toast(result.status === 'ambiguous' ? tr('More than one channel may show this game. Choose one.')
            : tr('The channel is not confirmed. Choose from your IPTV lists.'));
          chooseSportsChannel(game, result.candidates);
        }
      }, Channels.guideScan);   // an M3U list's whole guide: any of its channels can be the one
    });
  }

  /** A picker for the game: likely channels first, then every configured IPTV channel. */
  function chooseSportsChannel(game, first) {
    Channels.load(function () {
      var channels = Channels.channels(), choices = [], seen = {};
      function add(ch) {
        if (!ch) return;
        var key = Channels.identity(ch);
        if (seen[key]) return;
        seen[key] = true;
        choices.push(ch);
      }
      for (var i = 0; first && i < first.length; i++) add(first[i]);
      for (var j = 0; j < channels.length; j++) add(channels[j]);
      if (!choices.length) { toast(tr("This game's channel isn't in your IPTV lists.")); return; }
      var labels = choices.map(function (ch) { return channelName(ch.name) + (ch.group ? ' · ' + ch.group : ''); });
      openPicker(tr('Choose a channel for this game'), labels, -1, 'sports', function (at) {
        var selected = choices[at];
        if (!selected) return;
        var scopes = [tr('This game only'), trf('All games in {competition}', {competition: game.competition})];
        openPicker(tr('Use this channel for…'), scopes, -1, 'sports', function (scope) {
          Sports.choose(game, selected, Channels.identity, scope === 1);
          drawCatalog();
          startSportsChannel(game, selected);
        });
      });
    });
  }

  function startSportsChannel(game, channel) {
    if (!channel) return;
    Sports.cancelReminder(game.id);
    if (reminderAlert && reminderAlert.id === game.id) closeSportsReminder(false);
    Sports.leaving(game);
    var failed = function () { Sports.forgetReturn(); noPlayer(); };
    if (!openInIptv('channel', channel.name, Channels.linkFor(channel), failed)) failed();
  }

  /** Restore the game and focus after the IPTV player returns to the launcher. */
  function restoreSportsFocus() {
    if (!sportReturnId || !catalog || !catalog.rows) return;
    for (var r = 0; r < catalog.rows.length; r++) for (var i = 0; i < catalog.rows[r].items.length; i++) {
      if (catalog.rows[r].items[i].id === sportReturnId) {
        st.tab = 1;
        st.zone = Z.CATALOG;
        st.crow = r;
        st.ccol[r] = i;
        sportReturnId = '';
        return;
      }
    }
    if (!catalog.epgPending) sportReturnId = '';
  }
