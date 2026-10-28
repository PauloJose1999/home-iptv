  // MARK: - The pages (web/home/34-ui-detail.js): a movie's, a show's and a person's page, stacked over the tabs (Back
  // goes down the stack), and a show's episodes page; what they hold is in 12-rules-titles.js, and the stack (`pages`)
  // stays in home.js, in its place. A part of web/home.js, joined in order by tools/webapp.py into the one function
  // the other parts share.

  function openDetail(page) {
    page.row = 0;
    page.cols = [];
    pages.push(page);
    st.zone = Z.DETAIL;
    setClass(body, 'detail-open', true);
    renderDetail();
    var answer = function (err, data) {
      page.data = data || null;
      page.error = !!err;
      if (pages[pages.length - 1] === page) renderDetail();
    };
    if (page.type === 'person') Data.personDetails(page.id, answer);
    else if (page.type === 'episodes') Data.seasonDetails(page.id, page.season, answer);
    else Data.titleDetails(page.kind, page.id, answer);
  }

  /** Back: the page under this one, as it was left; from the last one, the tab it was opened from. */
  function detailBack() {
    pages.pop();
    if (pages.length) { renderDetail(); return; }
    closeDetails();
    st.zone = st.tab !== 0 && catalog ? Z.CATALOG : Z.TOP;
    updateFocus();
  }

  /** Every page closed at once (the home screen opened again): the tabs as they were under them. */
  function closeDetails() {
    pages = [];
    setClass(body, 'detail-open', false);
    $('detail').lastChild.innerHTML = '';
    if (st.zone === Z.DETAIL) st.zone = Z.TOP;
  }

  function renderDetail() {
    var page = pages[pages.length - 1], box = $('detail'), holder = box.lastChild;
    if (page.type === 'episodes') { renderEpisodes(page); return; }
    var d = page.data, it = page.item || {}, person = page.type === 'person';
    holder.innerHTML = '';
    page.rows = detailRows(page);
    page.row = Math.max(0, Math.min(page.row, page.rows.length - 1));
    page.nodes = [];

    // The backdrop, as on the tabs: the title's, or for a person their best-known title's.
    var known = person && d ? (d.movies[0] || d.shows[0]) : null;
    var backdrop = person ? known && known.backdrop : (d && d.backdrop) || it.backdrop;
    setClass(box.firstChild, 'on', false);
    if (backdrop) {
      var url = Data.image(backdrop, 'w1280'), img = new Image();
      img.onload = function () {
        if (pages[pages.length - 1] !== page) return;
        box.firstChild.style.backgroundImage = 'url(' + url + ')';
        setClass(box.firstChild, 'on', true);
      };
      img.src = url;
    }

    var head = el('div', 'dhead', holder);
    var photo = el('div', person ? 'dposter person' : 'dposter', head), photoPath = person ? (d && d.profile) || it.profile : (d && d.poster) || it.poster;
    if (photoPath) photo.style.backgroundImage = 'url(' + Data.image(photoPath, 'w342') + ')';
    else el('div', 'initials', photo, initials(person ? it.name : it.title));
    var info = el('div', 'dinfo', head);

    if (person) {
      el('div', 'dtitle', info, (d && d.name) || it.name || '');
      if (d) {
        var born = d.birthday && d.place ? trf('Born {date} in {place}', {date: longDate(d.birthday), place: d.place})
            : d.birthday ? trf('Born {date}', {date: longDate(d.birthday)}) : d.place ? trf('Born in {place}', {place: d.place}) : '';
        var line = [];
        if (d.department) line.push(department(d.department));
        if (born) line.push(born);
        if (d.deathday) line.push(trf('Died {date}', {date: longDate(d.deathday)}));
        if (line.length) el('div', 'dmeta', info, line.join('  ·  '));
        if (d.biography) fitText(el('div', 'dstory bio', info, d.biography));
        if (page.rows.length) el('div', 'dsmall', info, tr("The titles TMDB knows of, not necessarily the whole career."));
      }
    } else {
      var t = d || it;
      el('div', 'dtitle', info, t.title || '');
      var meta = el('div', 'dmeta', info), parts = [];
      if (t.year) parts.push(t.year);
      if (t.rating) parts.push('★ ' + (Math.round(t.rating * 10) / 10).toFixed(1));
      if (page.kind === 'movie' && (Trakt.movieWatched(page.id) || (Data.movieSeen(page.id) || {}).done)) parts.push('✓ ' + tr('Watched'));
      if (d && d.runtime && page.kind === 'movie') parts.push(trf('runtime|{n} min', {n: d.runtime}));
      if (d && d.seasons) parts.push(plural('plural|one:{n} season|other:{n} seasons', d.seasons));
      if (d && d.genreNames.length) parts.push(d.genreNames.slice(0, 3).join(', '));
      el('span', '', meta, parts.join('  ·  '));
      Data.imdbRating({kind: page.kind, id: page.id, title: t.title, year: t.year}, function (rating) {
        if (rating && pages[pages.length - 1] === page && meta.parentNode) meta.insertBefore(el('span', 'imdb', null, 'IMDb ' + rating), meta.firstChild);
      });
      if (t.overview) fitText(el('div', 'dstory', info, t.overview));
      if (d && d.directors.length) {
        var names = {names: d.directors.join(', ')};
        el('div', 'dline', info, page.kind === 'movie' ? trf('Directed by {names}', names) : trf('Created by {names}', names));
      }
      var actions = el('div', 'dactions', info), nodes = [];
      for (var a = 0; a < page.rows[0].items.length; a++) {
        var btn = el('div', 'dbtn', actions, page.rows[0].items[a].label);
        hover(btn, Z.DETAIL, a);
        nodes.push(btn);
      }
      page.nodes[0] = nodes;
      // Left in the middle: how far, in purple, and the minutes left.
      if (page.next && page.next.resume && page.next.share) {
        el('div', 'fill', el('div', 'dprog', info)).style.width = Math.round(page.next.share * 100) + '%';
        el('div', 'dleft', info, trf('episode|{n} min left', {n: Math.max(1, Math.ceil(page.next.left / 60))}));
      }
    }
    if (!d) el('div', 'dnote', info, page.error ? (person ? tr("Couldn't load this person's page.") : tr("Couldn't load more about this title.")) : tr('Loading…'));

    // The rows under the header: cast (round photos, name, character) and posters (title, year or role).
    var top = page.firstTop = person ? PERSON_TOP : DETAIL_TOP;
    for (var r = 0; r < page.rows.length; r++) {
      var row = page.rows[r];
      if (row.type === 'actions') continue;
      var rowNode = el('div', 'drow ' + row.type, holder), items = [];
      rowNode.style.top = top + 'px';
      row.top = top;
      top += DETAIL_ROW_H[row.type];
      el('div', 'dlabel', rowNode, row.title);
      var strip = el('div', 'dstrip', rowNode);
      for (var i = 0; i < row.items.length; i++) {
        var x = row.items[i], node = el('div', 'ditem ' + (row.type === 'cast' ? 'cast' : 'poster'), strip);
        node.style.left = i * (row.type === 'cast' ? CAST_STEP : POSTER_STEP) + 'px';
        var pic = el('div', row.type === 'cast' ? 'circle' : 'pimg', node);
        if (!(row.type === 'cast' ? x.profile : x.poster)) el('div', 'initials', pic, row.type === 'cast' ? initials(x.name) : x.title);
        el('div', 'dname', node, row.type === 'cast' ? x.name : x.title);
        var second = row.type === 'cast' ? x.character : person ? [x.year, x.role].filter(Boolean).join('  ·  ') : x.year;
        if (second) el('div', 'drole', node, second);
        hover(node, Z.DETAIL, r * 1000 + i);
        items.push(node);
      }
      page.nodes[r] = items;
      row.strip = strip;
      row.node = rowNode;
    }
    updateFocus();
  }

  /** The focus, the rows' scroll (the focused row comes up, its item stays in view) and the photos near the focus. */
  function placeDetail() {
    var page = pages[pages.length - 1];
    if (!page || !page.rows) return;
    if (page.type === 'episodes') { placeEpisodes(page); return; }
    var holder = $('detail').lastChild, focusRow = page.rows[page.row];
    // A row below the first one comes up to where the first one is; Watch and the first row keep the page still.
    var lift = focusRow && focusRow.top > page.firstTop ? focusRow.top - LIFT_TO : 0;
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-lift) + 'px)';
    for (var r = 0; r < page.rows.length; r++) {
      var row = page.rows[r], nodes = page.nodes[r] || [], col = page.cols[r] || 0, first = Math.max(0, col - 2);
      var step = row.type === 'cast' ? CAST_STEP : POSTER_STEP;
      if (row.strip) row.strip.style.webkitTransform = row.strip.style.transform = 'translateX(' + (-first * step) + 'px)';
      for (var i = 0; i < nodes.length; i++) {
        setClass(nodes[i], 'focus', st.zone === Z.DETAIL && r === page.row && i === col);
        // Only the photos of the rows near the focus, on screen or next to it, are loaded.
        if (!nodes[i].loaded && row.type !== 'actions' && Math.abs(r - page.row) <= 1 && i >= first - 1 && i <= first + 9) {
          var x = row.items[i], path = row.type === 'cast' ? x.profile : x.poster;
          nodes[i].loaded = true;
          if (path) nodes[i].firstChild.style.backgroundImage = 'url(' + Data.image(path, 'w185') + ')';
        }
      }
    }
  }

  function detailMove(dx, dy) {
    var page = pages[pages.length - 1];
    if (!page || !page.rows.length) return;
    if (dx) {
      var n = page.rows[page.row].items.length;
      page.cols[page.row] = Math.max(0, Math.min(n - 1, (page.cols[page.row] || 0) + dx));
    } else if (dy) {
      page.row = Math.max(0, Math.min(page.rows.length - 1, page.row + dy));
    }
  }

  /** OK: Watch; a cast member's page; a title's page. */
  function detailActivate() {
    var page = pages[pages.length - 1];
    if (!page || !page.rows.length) return;
    if (page.type === 'episodes') { episodesActivate(page); return; }
    var row = page.rows[page.row], x = row.items[page.cols[page.row] || 0];
    if (!x) return;
    if (row.type === 'actions') {
      x.run();
    } else if (row.type === 'cast') {
      openDetail({type: 'person', id: x.id, item: {name: x.name, profile: x.profile}});
    } else {
      openDetail({type: 'title', kind: x.kind, id: x.id, item: x});
    }
  }

  function openEpisodes(show) {
    var next = nextEpisode(show), t = show.data || show.item || {};
    openDetail({type: 'episodes', kind: 'tv', id: show.id, item: {title: t.title, backdrop: t.backdrop}, show: show,
      seasons: (show.data && show.data.seasonList) || [], season: next.season, target: next, aim: true});
  }

  /** The episodes page: the seasons on top, then a row per episode (still, title, minutes, story, progress). */
  function renderEpisodes(page) {
    var box = $('detail'), holder = box.lastChild, prog = episodeStates(page.id), target = page.target;
    holder.innerHTML = '';
    page.nodes = [];
    page.rows = [{type: 'seasons', items: page.seasons}];
    el('div', 'eptitle', holder, page.item.title || '');
    var pills = page.pills = el('div', 'eppills', el('div', 'epseasons', holder)), pnodes = [];
    for (var s = 0; s < page.seasons.length; s++) {
      var season = page.seasons[s];
      var pill = el('div', 'eppill' + (season.n === page.season ? ' on' : ''), pills,
          trf('Season {n}', {n: season.n}) + (seasonDone(prog, season) ? '  ✓' : ''));
      if (season.n === page.season && page.cols[0] === undefined) page.cols[0] = s;
      hover(pill, Z.DETAIL, s);
      pnodes.push(pill);
    }
    page.nodes[0] = pnodes;
    // The episodes scroll inside their own window, under the title and the seasons.
    var list = page.list = el('div', 'eplist', el('div', 'epview', holder));
    if (!page.data) {
      el('div', 'dnote', list, page.error ? tr("Couldn't load the episodes.") : tr('Loading…'));
      page.row = 0;
      updateFocus();
      return;
    }
    for (var i = 0; i < page.data.length; i++) {
      var ep = page.data[i], x = prog && prog.eps[page.season + ':' + ep.n], r = i + 1;
      page.rows.push({type: 'episode', items: [ep]});
      var row = el('div', 'eprow' + (x && x.done ? ' done' : ''), list);
      row.style.top = i * EP_ROW + 'px';
      var still = el('div', 'epstill', row);
      if (!ep.still) el('div', 'initials', still, String(ep.n));
      if (x && x.done) el('div', 'epcheck', still, '✓');
      var bodyNode = el('div', 'epbody', row), meta = [];
      el('div', 'epname', bodyNode, ep.n + '. ' + ep.title);
      if (ep.runtime) meta.push(trf('runtime|{n} min', {n: ep.runtime}));
      if (x && x.done) meta.push(tr('Watched'));
      else if (x && x.d) meta.push(trf('episode|{n} min left', {n: Math.max(1, Math.ceil((x.d - x.p) / 60))}));
      if (meta.length) el('div', 'epmeta', bodyNode, meta.join('  ·  '));
      if (ep.overview) el('div', 'epstory', bodyNode, ep.overview);
      // The bar only from the player's real position: watched at Trakt shows the check, not an invented share.
      if (x && !x.remote) el('div', 'fill', el('div', 'epbar', bodyNode)).style.width = (x.done ? 100 : Math.round(100 * x.p / Math.max(1, x.d))) + '%';
      hover(row, Z.DETAIL, r * 1000);
      page.nodes[r] = [row];
      // The focus starts on the episode where the show goes on.
      if (page.aim && target && target.season === page.season && target.episode === ep.n) page.row = r;
    }
    if (page.aim) { page.aim = false; if (!page.row && page.rows.length > 1) page.row = 1; }
    page.row = Math.max(0, Math.min(page.row, page.rows.length - 1));
    updateFocus();
  }

  /** The focus, the list's scroll (the focused episode stays in view) and the stills near it. */
  function placeEpisodes(page) {
    for (var r = 0; r < page.rows.length; r++) {
      var nodes = page.nodes[r] || [], col = page.cols[r] || 0;
      for (var i = 0; i < nodes.length; i++) setClass(nodes[i], 'focus', st.zone === Z.DETAIL && r === page.row && i === col);
    }
    // The seasons slide sideways so the focused one (or the one shown) stays on screen.
    var pill = page.nodes[0][page.cols[0] || 0];
    if (pill && page.pills) {
      var shift = Math.max(0, pill.offsetLeft - 1100);
      page.pills.style.webkitTransform = page.pills.style.transform = 'translateX(' + (-shift) + 'px)';
    }
    if (!page.list) return;
    var first = Math.max(0, page.row - 2);
    page.list.style.webkitTransform = page.list.style.transform = 'translateY(' + (-first * EP_ROW) + 'px)';
    for (var e = 1; e < page.rows.length; e++) {
      var node = page.nodes[e][0], ep = page.rows[e].items[0];
      if (!node.loaded && e >= first && e <= first + 5) {
        node.loaded = true;
        if (ep.still) node.firstChild.style.backgroundImage = 'url(' + Data.image(ep.still, 'w300') + ')';
      }
    }
  }

  /** OK on a season shows its episodes; on an episode, plays it (from where it was left, if it's the one to go on). */
  function episodesActivate(page) {
    var col = page.cols[page.row] || 0;
    if (page.row === 0) {
      var season = page.seasons[col];
      if (!season || season.n === page.season) return;
      page.season = season.n;
      page.data = null;
      page.error = false;
      page.row = 0;
      renderDetail();
      Data.seasonDetails(page.id, season.n, function (err, list) {
        if (page.season !== season.n) return;
        page.data = list || null;
        page.error = !!err;
        if (pages[pages.length - 1] === page) renderDetail();
      });
      return;
    }
    var ep = page.rows[page.row].items[0], t = page.target;
    watchEpisode(page.show, page.season, ep.n, !!(t && t.resume && t.season === page.season && t.episode === ep.n));
  }
