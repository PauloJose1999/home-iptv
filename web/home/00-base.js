/*
 * The home screen for LG TVs (webOS):
 *  - top: the tabs (TV aberta, Sports, Movies, Shows); the clock and icon-only glass buttons at the right (Live TV, HDMI
 *    Inputs, Settings);
 *  - three picks for this hour in the selected tab; the background is the first one's photo, blurred and almost white;
 *  - the glass shelf with the apps; ↓ opens the drawer (inputs, shortcuts, weather); ↑ or Back closes it;
 *  - a night look from sunset to sunrise; a screensaver after a few idle minutes.
 * The remote's arrows, OK and Back move the focus; a pointer (LG's Magic Remote) focuses what it points at.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  /**
   * A story cut to its box (a fixed or max height, overflow hidden) at the end of the last sentence that fits, not in
   * the middle of a line. When not even the first sentence fits, it ends at a word with "…". Needs the node on screen.
   */
  function fitText(node) {
    var full = node.textContent, box = node.clientHeight;
    if (!full || !box || node.scrollHeight <= box + 1) return;
    var sentences = full.match(/[^.!?…]+[.!?…]+["'”»)]*\s*/g) || [], text = '';
    for (var i = 0; i < sentences.length; i++) {
      node.textContent = text + sentences[i];
      if (node.scrollHeight > box + 1) break;
      text += sentences[i];
    }
    if (text) { node.textContent = text.replace(/\s+$/, ''); return; }
    var words = full.split(' '), lo = 1, hi = words.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      node.textContent = words.slice(0, mid).join(' ') + '…';
      if (node.scrollHeight > box + 1) hi = mid - 1; else lo = mid;
    }
    node.textContent = words.slice(0, lo).join(' ').replace(/[,;:\s]+$/, '') + '…';
  }

  function sym(name, parent, size) {
    var s = el('span', 'sym', parent);
    s.style.webkitMaskImage = 'url(symbols/' + name + '.png)';
    s.style.maskImage = 'url(symbols/' + name + '.png)';
    if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
    return s;
  }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function setClass(e, c, on) {
    if (!e) return;
    if (on && !hasClass(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && hasClass(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var stage = $('stage'), body = document.body;

  /** The 1920 × 1080 stage fills the window (on the TV it already is 1920 × 1080). */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

