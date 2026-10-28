  // MARK: - Rules of Movies, Shows and episodes (web/home/12-rules-titles.js): the rows of a tab, what a title's or a
  // person's page holds, and which episode a show goes on from; nothing here draws. A part of web/home.js, joined in
  // order by tools/webapp.py into the one function the other parts share.

  function catalogRows() {
    var rows = catalog ? catalog.rows : [], kind = TAB_KIND[st.tab], list = kind === 'movie' || kind === 'tv' ? Trakt.watchlist(kind) : [];
    if (!list.length) { myList = null; return rows; }
    var key = kind + ':' + list.map(function (x) { return x.id; }).join(',');
    if (key !== myListKey) {
      myListKey = key;
      var shown = list.slice(0, 30);
      Data.loadBriefs(shown, function () { if (myListKey === key) { myList = null; drawnFor = null; drawCatalog(); } });
    }
    if (!myList) {
      myList = {title: tr('My list'), items: list.slice(0, 30).map(function (x) {
        var b = Data.briefOf(x.kind, x.id);
        return b || {id: x.id, kind: x.kind, title: x.title, year: x.year, backdrop: '', overview: '', rating: 0, genres: []};
      })};
    }
    return [myList].concat(rows);
  }

  function focusedItem() {
    var row = catalog && catalogRows()[st.crow];
    return row ? row.items[st.ccol[st.crow] || 0] : null;
  }

  /** What a page's rows hold: Watch, then cast and similar titles; a person's movies, shows and other work. */
  function detailRows(page) {
    var d = page.data, rows = [];
    if (page.type === 'title') {
      var t = d || page.item || {};
      if (page.kind === 'tv') {
        // A show: go on where it was left, or its episodes.
        var next = page.next = nextEpisode(page);
        rows.push({type: 'actions', items: [
          {label: next.label, run: function () { watchEpisode(page, next.season, next.episode, next.resume); }},
          {label: tr('Episodes'), run: function () { openEpisodes(page); }}
        ]});
      } else {
        rows.push({type: 'actions', items: [{label: tr('Watch'), run: function () {
          openTitle({kind: page.kind, id: page.id, title: t.title, year: t.year, original: t.original});
        }}]});
      }
      // With Trakt: My list, on or off; changed once Trakt confirms.
      if (Trakt.connected()) {
        var on = Trakt.listed(page.kind, page.id);
        rows[0].items.push({label: page.listing ? tr('Saving…') : on ? tr('In My list') : tr('Add to My list'), run: function () {
          if (page.listing) return;
          page.listing = true;
          renderDetail();
          Trakt.setListed({kind: page.kind, id: page.id, title: t.title, year: t.year}, !on, function (ok, why) {
            page.listing = false;
            toast(ok ? (on ? tr('Removed from My list.') : tr('Added to My list.'))
                : why === 'limit' ? tr('Your Trakt list is full.') : tr("Couldn't change My list. Try again."));
            if (pages[pages.length - 1] === page) renderDetail();
          });
        }});
      }
      if (d && d.cast.length) rows.push({type: 'cast', title: tr('Cast'), items: d.cast});
      if (d && d.similar.length) rows.push({type: 'posters', title: page.kind === 'movie' ? tr('Similar movies') : tr('Similar shows'), items: d.similar});
      return rows;
    }
    if (d && d.movies.length) rows.push({type: 'posters', title: tr('Movies'), items: d.movies});
    if (d && d.shows.length) rows.push({type: 'posters', title: tr('Shows'), items: d.shows});
    if (d && d.work.length) rows.push({type: 'posters', title: tr('Directing and other work'), items: d.work});
    return rows;
  }

  /** The first letters of a name, where there's no photo. */
  function initials(name) {
    var words = (name || '?').split(/\s+/);
    return (words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '')).toUpperCase();
  }

  /** "November 11, 1974" from TMDB's "1974-11-11", in the TV's language. */
  function longDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? formatDate('format|MMMM d, y', new Date(+m[1], m[2] - 1, +m[3], 12).getTime()) : '';
  }

  /** What a person is known for, as TMDB names it in English. */
  function department(name) {
    switch (name) {
      case 'Acting': return tr('dept|Acting');
      case 'Directing': return tr('dept|Directing');
      case 'Writing': return tr('dept|Writing');
      case 'Production': return tr('dept|Production');
      default: return name;
    }
  }

  /**
   * A show's episodes as far as they're known: the IPTV player's progress (position and length, the only source of a
   * purple bar), and the ones Trakt says were watched (done, with no position: `remote`). An episode in progress here
   * since Trakt's last watch of it is a re-watch: still in progress. Specials (season 0) are left out.
   */
  function episodeStates(tvId) {
    var prog = Data.progressOf(tvId), remote = Trakt.showEpisodes(tvId), eps = {}, any = false, k;
    for (k in prog ? prog.eps : {}) {
      if (prog.eps.hasOwnProperty(k) && k.indexOf('0:') !== 0) { eps[k] = prog.eps[k]; any = true; }
    }
    for (k in remote || {}) {
      if (!remote.hasOwnProperty(k) || k.indexOf('0:') === 0) continue;
      var local = eps[k];
      if (!local || (!local.done && (local.at || 0) < remote[k])) eps[k] = {p: 0, d: 0, done: true, remote: true};
      any = true;
    }
    return any ? {eps: eps} : null;
  }

  /** Where a show goes on: {season, episode, resume, left (seconds), share (0-1), label}. */
  function nextEpisode(page) {
    var seasons = (page.data && page.data.seasonList) || [], prog = episodeStates(page.id);
    var first = seasons.length ? seasons[0].n : 1;
    var start = {season: first, episode: 1, resume: false, label: trf('Watch S{s} · E{e}', {s: first, e: 1})};
    if (!prog) return start;
    // The furthest episode touched: continued when it was left in the middle, else the one after it.
    var last = null, far = -1;
    for (var k in prog.eps) {
      if (!prog.eps.hasOwnProperty(k)) continue;
      var se = k.split(':'), at = +se[0] * 10000 + +se[1];
      if (at > far) { far = at; last = {season: +se[0], episode: +se[1], x: prog.eps[k]}; }
    }
    if (!last.x.done) {
      return {season: last.season, episode: last.episode, resume: true, left: Math.max(0, last.x.d - last.x.p),
        share: last.x.d ? Math.min(1, last.x.p / last.x.d) : 0,
        label: trf('Continue S{s} · E{e}', {s: last.season, e: last.episode})};
    }
    var count = 0, i;
    for (i = 0; i < seasons.length; i++) if (seasons[i].n === last.season) count = seasons[i].count;
    if (last.episode < count || !seasons.length) {
      return {season: last.season, episode: last.episode + 1, resume: false,
        label: trf('Watch S{s} · E{e}', {s: last.season, e: last.episode + 1})};
    }
    for (i = 0; i < seasons.length; i++) {
      if (seasons[i].n > last.season) {
        return {season: seasons[i].n, episode: 1, resume: false, label: trf('Watch S{s} · E{e}', {s: seasons[i].n, e: 1})};
      }
    }
    start.label = tr('Watch again');
    return start;
  }

  /** A season all watched (as far as the player told). */
  function seasonDone(prog, season) {
    if (!prog || !season.count) return false;
    for (var e = 1; e <= season.count; e++) {
      var x = prog.eps[season.n + ':' + e];
      if (!x || !x.done) return false;
    }
    return true;
  }
