  // MARK: - Movies and Shows (web/home/33-ui-catalog.js): a tab's rows as on Netflix, the focused title large at
  // the top; which rows there are is in 12-rules-titles.js, and the catalog's state stays in home.js, in its place.
  // A part of web/home.js, joined in order by tools/webapp.py into the one function the other parts share.

  function renderCatalog() {
    var kind = TAB_KIND[st.tab];
    Trakt.syncIfStale();
    setClass(body, 'no-picks', false);
    if (cards.length) { cards = []; $('cards').innerHTML = ''; liveIds = ''; }
    backdrop('');
    if (kind !== catalogKind) {
      catalogKind = kind;
      catalog = null;
      st.crow = 0;
      st.ccol = [];
      heroFor = null;
    }
    if (kind === 'sports') {
      Sports.today(function (games, failed) {
        if (catalogKind !== kind) return;
        catalog = sportsCatalog(games, failed, null);
        restoreSportsFocus();
        drawCatalog();
        Sports.dailyEpg(function (epg) {
          if (catalogKind !== kind || st.tab === 0) return;
          catalog = sportsCatalog(games, failed, epg);
          restoreSportsFocus();
          drawCatalog();
        });
      });
    } else {
      Data.catalog(kind, function (c) {
        if (catalogKind !== kind || st.tab === 0) return;
        catalog = c;
        drawCatalog();
      });
    }
    drawCatalog();
  }

  function drawCatalog() {
    var holder = $('rows'), msg = $('catalog').querySelector('.msg');
    var rows = catalogRows(), shownKey = catalog && (myList ? myListKey : '');
    if (!catalog || drawnFor !== catalog || drawnKey !== shownKey) {
      holder.innerHTML = '';
      drawnFor = catalog;
      drawnKey = shownKey;
      drawnRows = 0;
    }
    for (var r = drawnRows; r < rows.length; r++) {
      var row = el('div', 'crow', holder);
      row.style.top = r * ROW_H + 'px';
      el('div', 'ctitle', row, rows[r].title);
      var strip = el('div', 'strip', row);
      for (var i = 0; i < rows[r].items.length; i++) {
        var node = el('div', 'item', strip);
        node.style.left = i * ITEM_STEP + 'px';
        if (rows[r].items[i].game) gameCard(node, rows[r].items[i].game);
        else if (rows[r].items[i].epg) epgCard(node, rows[r].items[i].epg);
        else if (rows[r].items[i].epgStatus) {
          el('div', 'epg-empty', node, rows[r].items[i].title);
        }
        else {
          el('div', 'thumb', node);
          el('div', 'label', node, rows[r].items[i].title);
        }
        hover(node, Z.CATALOG, r * 1000 + i);
      }
    }
    drawnRows = rows.length;
    st.crow = Math.max(0, Math.min(st.crow, rows.length - 1));
    msg.textContent = rows.length ? '' : catalog && catalog.sports
        ? (catalog.error ? tr("Couldn't load today's games.") : tr('No games today'))
        : catalog && catalog.error === 'no key'
        ? tr('Add a free TMDB key to config.properties to see movies and shows here.')
        : catalog && catalog.error ? trf("Couldn't load the titles: {error}", {error: catalog.error}) : tr('Loading…');
    if (!rows.length && st.zone === Z.CATALOG) { st.zone = Z.TOP; st.top = st.tab; }
    updateFocus();
  }

  /** Moves the rows and the focused row's titles, loads the photos near the focus, and shows the focused title on top. */
  function placeCatalog() {
    if (st.tab === 0 || !catalog) return;
    var rows = $('rows').children;
    $('rows').style.webkitTransform = $('rows').style.transform = 'translateY(' + (ROW_TOP - st.crow * ROW_H) + 'px)';
    for (var r = 0; r < rows.length; r++) {
      setClass(rows[r], 'gone', r < st.crow);
      var col = st.ccol[r] || 0, first = Math.max(0, col - 1), items = rows[r].lastChild.children;
      rows[r].lastChild.style.webkitTransform = rows[r].lastChild.style.transform = 'translateX(' + (-first * ITEM_STEP) + 'px)';
      for (var i = 0; i < items.length; i++) {
        setClass(items[i], 'focus', st.zone === Z.CATALOG && r === st.crow && i === col);
        // Only the photos on screen, and a little around it, are loaded.
        if (!items[i].loaded && r >= st.crow - 1 && r <= st.crow + 2 && i >= first - 1 && i <= first + 6) {
          var p = catalogRows()[r].items[i];
          items[i].loaded = true;
          if (p.backdrop) items[i].firstChild.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'w300') + ')';
        }
      }
    }
    showHero(focusedItem());
  }

  /** The title on top: its name, year, rating, genres, app and story now; its large photo once the focus rests. */
  function showHero(p) {
    var hero = $('hero');
    if (p === heroFor) return;
    heroFor = p;
    clearTimeout(heroTimer);
    var info = hero.querySelector('.info');
    info.innerHTML = '';
    setClass(hero.firstChild, 'on', false);
    setClass(hero, 'sports', !!(p && p.game));
    if (!p) return;
    if (p.game) { gameHero(hero, info, p.game); return; }
    if (p.epg) { epgHero(hero, info, p.epg); return; }
    if (p.epgStatus) {
      el('div', 'gkicker', info, tr('BrazilTVEPG programming'));
      el('div', 'htitle', info, p.title);
      return;
    }
    el('div', 'htitle', info, p.title);
    var meta = el('div', 'hmeta', info), parts = [];
    if (p.year) parts.push(p.year);
    if (p.rating) parts.push('★ ' + (Math.round(p.rating * 10) / 10).toFixed(1));
    var names = catalog && catalog.genreNames;
    for (var g = 0; names && g < p.genres.length && g < 2; g++) if (names[p.genres[g]]) parts.push(names[p.genres[g]]);
    el('span', '', meta, parts.join('  ·  '));
    if (p.service) el('span', 'svc', meta, p.service);
    fitText(el('div', 'story', info, p.overview));
    heroTimer = setTimeout(function () {
      if (heroFor !== p) return;
      // The IMDb rating, first on the line, once the focus rests here (one request, then kept).
      Data.imdbRating(p, function (rating) {
        if (heroFor !== p || !rating) return;
        meta.insertBefore(el('span', 'imdb', null, 'IMDb ' + rating), meta.firstChild);
      });
      if (!p.backdrop) return;
      var url = Data.image(p.backdrop, 'w1280'), img = new Image();
      img.onload = function () {
        if (heroFor !== p) return;
        hero.firstChild.style.backgroundImage = 'url(' + url + ')';
        setClass(hero.firstChild, 'on', true);
      };
      img.src = url;
    }, 400);
  }
