  // MARK: - Rules of the shelf and of the apps' colors (web/home/10-rules-shelf.js): the shelf's order, which apps it
  // shows, a name's size on a tile, and the color math the logos are drawn with; nothing here draws. A part of
  // web/home.js, joined in order by tools/webapp.py into the one function the other parts share.

  function shelfKey(app) {
    for (var i = 0; i < SHELF.length; i++) if (SHELF[i][1].test(app.id) || SHELF[i][2].test(app.title)) return SHELF[i];
    return null;
  }

  function darken(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#161618';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  }

  /** A name that fits the tile on one line (the font shrinks for long names). */
  function wordFit(title, width, max) {
    return Math.max(18, Math.min(max, Math.floor(width * 0.8 / (Math.max(4, title.length) * 0.56))));
  }

  /** Relative luminance (0-1) of an sRGB color (whole numbers, as read from the canvas). */
  function luminance(r, g, b) {
    return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
  }

  function rgbOf(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color || '');
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  /**
   * Share of the logo that hardly shows on a tile of this luminance (YouTube's black type on a dark tile). Each bin
   * of the histogram holds the ink whose square-root luminance falls in it.
   */
  function unseen(ink, tileLum) {
    var share = 0;
    for (var b = 0; b < 8; b++) {
      var l = Math.pow((b + 0.5) / 8, 2);
      if ((Math.max(l, tileLum) + 0.05) / (Math.min(l, tileLum) + 0.05) < 1.8) share += ink[b];
    }
    return share;
  }

  /** A color that is clearly a hue (Crunchyroll's orange), not black, white or a gray. */
  function colorful(rgb) {
    return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) >= 96;
  }

  /**
   * Every app on the TV in the shelf's order: the ones placed in Home Settings › Shelf first, in their order; then the
   * well-known ones, in SHELF's order; then the rest as the TV lists them (new apps land there).
   */
  function fullOrder() {
    var chosen = Prefs.shelf() || [], out = [];
    for (var i = 0; i < chosen.length; i++) {
      for (var j = 0; j < apps.length; j++) if (apps[j].id === chosen[i] && out.indexOf(apps[j]) < 0) out.push(apps[j]);
    }
    for (var s = 0; s < SHELF.length; s++) {
      for (var a = 0; a < apps.length; a++) {
        if ((SHELF[s][1].test(apps[a].id) || SHELF[s][2].test(apps[a].title)) && out.indexOf(apps[a]) < 0) { out.push(apps[a]); break; }
      }
    }
    for (var r = 0; r < apps.length; r++) if (out.indexOf(apps[r]) < 0) out.push(apps[r]);
    return out;
  }

  function pickShelf() {
    // The shelf scrolls through every app but the ones hidden in Home Settings › Shelf.
    var hidden = Prefs.shelfHidden();
    shelf = fullOrder().filter(function (a) { return hidden.indexOf(a.id) < 0; });
    // All Apps lists every app, alphabetically, the shelf's too.
    others = apps.slice().sort(function (x, y) { var p = x.title.toLowerCase(), q = y.title.toLowerCase(); return p < q ? -1 : p > q ? 1 : 0; });
  }
