/*
 * QR codes for a short text (a link): byte mode, error correction M, versions 1 to 9 (up to 180 bytes), drawn on a
 * canvas. Enough for the Trakt sign-in link; no library, so nothing more to load on the TV.
 * The encoding follows ISO/IEC 18004 as in Nayuki's reference implementation. Plain ES5, like the rest of web/.
 */
var QR = (function () {
  'use strict';

  var EC_LEN = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22];   // error-correction codewords per block, level M
  var BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5];             // blocks, level M

  function rawModules(ver) {
    var n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var align = Math.floor(ver / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  }

  function dataCodewords(ver) { return Math.floor(rawModules(ver) / 8) - EC_LEN[ver] * BLOCKS[ver]; }

  // MARK: - Reed-Solomon over GF(256), polynomial 0x11D

  function mul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function divisor(degree) {
    var r = [], root = 1, i, j;
    for (i = 0; i < degree - 1; i++) r.push(0);
    r.push(1);
    for (i = 0; i < degree; i++) {
      for (j = 0; j < r.length; j++) {
        r[j] = mul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = mul(root, 0x02);
    }
    return r;
  }

  function remainder(data, div) {
    var r = div.map(function () { return 0; });
    for (var k = 0; k < data.length; k++) {
      var factor = data[k] ^ r.shift();
      r.push(0);
      for (var i = 0; i < div.length; i++) r[i] ^= mul(div[i], factor);
    }
    return r;
  }

  // MARK: - Codewords: the text, padded, split into blocks with their error correction, interleaved

  function utf8(text) {
    var s = unescape(encodeURIComponent(text)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function codewords(bytes, ver) {
    var bits = [], i, j, cap = dataCodewords(ver) * 8;
    function put(v, n) { for (var k = n - 1; k >= 0; k--) bits.push((v >>> k) & 1); }
    put(4, 4);
    put(bytes.length, 8);
    for (i = 0; i < bytes.length; i++) put(bytes[i], 8);
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }

    var nb = BLOCKS[ver], ecl = EC_LEN[ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = divisor(ecl), blocks = [], at = 0;
    for (i = 0; i < nb; i++) {
      var part = data.slice(at, at + shortLen - ecl + (i < nShort ? 0 : 1));
      at += part.length;
      var ec = remainder(part, div);
      if (i < nShort) part.push(0);   // a gap, so all blocks line up; skipped when interleaving
      blocks.push(part.concat(ec));
    }
    var out = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (j = 0; j < nb; j++) {
        if (i !== shortLen - ecl || j >= nShort) out.push(blocks[j][i]);
      }
    }
    return out;
  }

  // MARK: - The matrix

  function alignments(ver, size) {
    if (ver === 1) return [];
    var n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, r = [6];
    for (var pos = size - 7; r.length < n; pos -= step) r.splice(1, 0, pos);
    return r;
  }

  function matrix(bytes, ver) {
    var size = ver * 4 + 17, dark = [], fixed = [], x, y, i, j;
    for (y = 0; y < size; y++) {
      dark.push([]);
      fixed.push([]);
      for (x = 0; x < size; x++) { dark[y].push(false); fixed[y].push(false); }
    }
    function set(x, y, on) { dark[y][x] = on; fixed[y][x] = true; }

    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4);
        }
      }
    }
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    var al = alignments(ver, size);
    for (i = 0; i < al.length; i++) {
      for (j = 0; j < al.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    format(set, size, 0);   // reserves the format areas; drawn again with the chosen mask
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vbits = ver << 12 | rem;
      for (i = 0; i < 18; i++) {
        var on = ((vbits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, on);
        set(b, a, on);
      }
    }

    var cw = codewords(bytes, ver), k = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var v = 0; v < size; v++) {
        for (j = 0; j < 2; j++) {
          x = right - j;
          y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
          if (!fixed[y][x] && k < cw.length * 8) {
            dark[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0;
            k++;
          }
        }
      }
    }

    var best = null, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      var copy = dark.map(function (row) { return row.slice(); });
      mask(copy, fixed, m, size);
      format(function (x, y, on) { copy[y][x] = on; }, size, m);
      var s = penalty(copy, size);
      if (s < bestScore) { best = copy; bestScore = s; }
    }
    return best;
  }

  function format(set, size, m) {
    var data = m, rem = data, i;   // level M is 00 in the format bits
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = (data << 10 | rem) ^ 0x5412;
    function bit(i) { return ((bits >>> i) & 1) !== 0; }
    for (i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  }

  function mask(dark, fixed, m, size) {
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (fixed[y][x]) continue;
        var flip;
        switch (m) {
          case 0: flip = (x + y) % 2 === 0; break;
          case 1: flip = y % 2 === 0; break;
          case 2: flip = x % 3 === 0; break;
          case 3: flip = (x + y) % 3 === 0; break;
          case 4: flip = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: flip = x * y % 2 + x * y % 3 === 0; break;
          case 6: flip = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: flip = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (flip) dark[y][x] = !dark[y][x];
      }
    }
  }

  /** The standard's penalties for runs, 2×2 blocks and imbalance (finder-like patterns left out: any mask reads). */
  function penalty(d, size) {
    var score = 0, darkCount = 0, x, y;
    for (var pass = 0; pass < 2; pass++) {
      for (y = 0; y < size; y++) {
        var run = 1;
        for (x = 1; x <= size; x++) {
          var same = x < size && (pass ? d[x][y] === d[x - 1][y] : d[y][x] === d[y][x - 1]);
          if (same) { run++; continue; }
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
    }
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        if (d[y][x]) darkCount++;
        if (x < size - 1 && y < size - 1 && d[y][x] === d[y][x + 1] && d[y][x] === d[y + 1][x] && d[y][x] === d[y + 1][x + 1]) score += 3;
      }
    }
    var total = size * size;
    return score + Math.floor(Math.abs(darkCount * 20 - total * 10) / total) * 10;
  }

  /** The modules (rows of booleans, true = dark) of the smallest version that holds `text`; null if too long. */
  function fit(text) {
    var bytes = utf8(text), ver = 1;
    while (ver <= 9 && dataCodewords(ver) < bytes.length + 2) ver++;   // + the mode and the length: 12 bits
    return ver > 9 ? null : matrix(bytes, ver);
  }

  /** A canvas of about `px` pixels a side with `text`'s QR code (dark on white, a 4-module margin); null if too long. */
  function canvas(text, px) {
    var m = fit(text);
    if (!m) return null;
    var n = m.length + 8, unit = Math.max(1, Math.floor(px / n));
    var c = document.createElement('canvas'), g;
    c.width = c.height = n * unit;
    g = c.getContext('2d');
    g.fillStyle = '#FFF';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    for (var y = 0; y < m.length; y++) {
      for (var x = 0; x < m.length; x++) if (m[y][x]) g.fillRect((x + 4) * unit, (y + 4) * unit, unit, unit);
    }
    return c;
  }

  return {canvas: canvas, matrix: fit};
})();
