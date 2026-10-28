  // MARK: - The top and the background (web/home/31-ui-top.js): the logo, the tabs and the round buttons, which tab's
  // screen shows (TV aberta's cards or a catalog), the blurred background photo and the clocks. A part of web/home.js,
  // joined in order by tools/webapp.py into the one function the other parts share.

  function renderTop() {
    $('title').textContent = '';
    var tabs = $('tabs');
    tabs.innerHTML = '';
    var names = [tr('light|Live TV'), tr('Sports'), tr('Movies'), tr('Shows')];
    for (var i = 0; i < NTABS; i++) {
      var t = el('button', 'tab', tabs, names[i]);
      hover(t, Z.TOP, i);
    }
    var buttons = $('buttons');
    buttons.innerHTML = '';
    var defs = [['live_tv', tr('light|Live TV')], ['hdmi', tr('HDMI Inputs')], ['settings', tr('light|Settings')]];
    for (var b = 0; b < 3; b++) {
      var r = el('button', 'round' + (b === 2 ? ' last' : ''), buttons);
      r.style.left = (1660 + 66 * b) + 'px';
      sym(defs[b][0], r);
      el('div', 'tip', r, defs[b][1]);
      hover(r, Z.TOP, NTABS + b);
    }
  }

  function renderCards() {
    setClass(body, 'catalog', st.tab !== 0);
    if (st.tab === 0) { renderLive(); return; }
    renderCatalog();
  }

  /** The first pick's photo as the background: drawn tiny and stretched, it's already as soft as a heavy blur. */
  function backdrop(url) {
    if (url === bgUrl) return;
    bgUrl = url;
    var next = bgFront === 'bgA' ? 'bgB' : 'bgA';
    if (!url) {
      setClass($('bgA'), 'on', false);
      setClass($('bgB'), 'on', false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      var canvas = $(next), ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setClass(canvas, 'on', true);
      setClass($(bgFront), 'on', false);
      bgFront = next;
    };
    img.src = url;
  }

  function renderClock() {
    var d = new Date(), c = $('clock');
    c.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    c.lastChild.textContent = formatDate('format|EEEE, MMMM d', d.getTime());
    $('topclock').textContent = formatDate('format|h:mm', d.getTime());
    if (st.tab === 0 && cards[0] && cards[0].live) renderLive();   // the programs' progress, every minute
    if (TAB_KIND[st.tab] === 'sports' && !pages.length) renderCatalog();   // the scores
  }

  /** On the minute, so the clock never runs late (the 30-second refresh could, by up to 30 s). */
  function tickClock() {
    renderClock();
    checkSportsReminder();
    setTimeout(tickClock, 60000 - Date.now() % 60000 + 50);
  }
