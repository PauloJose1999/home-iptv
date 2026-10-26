/*
 * The TV's side of the web home screen: its apps, opening one, its inputs, its settings, the Back key, its time zone.
 *  - LG webOS: the TV's service bus (Luna), the same calls LG's launcher makes.
 *  - A desktop browser: a stand-in with sample apps, so the screen can be previewed and tested on a computer.
 * Plain ES5: older TVs run a Chromium from 2015-2017 (webOS 3 and 4).
 */
var TV = (function () {
  'use strict';

  var webos = typeof window.PalmServiceBridge !== 'undefined';
  var calls = [];   // a bridge is collected if nothing holds it before its reply arrives

  /** One Luna call; done(result) with null on failure. */
  function luna(uri, params, done) {
    if (!webos) {
      if (done) setTimeout(function () { done(null); }, 0);
      return;
    }
    var bridge = new window.PalmServiceBridge();
    calls.push(bridge);
    var finished = false;
    bridge.onservicecallback = function (message) {
      if (finished) return;
      finished = true;
      var i = calls.indexOf(bridge);
      if (i >= 0) calls.splice(i, 1);
      var result = null;
      try { result = JSON.parse(message); } catch (e) {}
      if (done) done(result && result.returnValue !== false ? result : null);
    };
    bridge.call(uri, JSON.stringify(params || {}));
  }

  // LG's own screensaver asks every subscribed app first. While Home IPTV is on screen and its own screensaver will
  // take over (`hold`, from home.js), it says no; otherwise, and in the background, the TV's runs as before.
  var saverBridge = null;

  function holdScreenSaver(hold) {
    if (!webos || saverBridge) return;
    saverBridge = new window.PalmServiceBridge();
    saverBridge.onservicecallback = function (message) {
      var m = null;
      try { m = JSON.parse(message); } catch (e) {}
      if (!m || m.timestamp === undefined) return;
      luna('luna://com.webos.service.tvpower/power/responseScreenSaverRequest',
          {clientName: self, ack: !!document.hidden || !hold(), timestamp: m.timestamp});
    };
    saverBridge.call('luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
        JSON.stringify({subscribe: true, clientName: self}));
  }

  // webOS 6 gives Developer Mode apps only the "public" group, which leaves out listLaunchPoints and the channels. Those
  // come from the TV's remote control API on 127.0.0.1:3000 (the one LG's phone app uses), which takes file:// pages.
  // The TV asks once to allow it; the key it gives back is kept (or comes in config.properties, ssap_key=, when the TV
  // was paired from its own shell).
  var SSAP_KEY = 'fmtv.ssapKey', SSAP_REFUSED = 'fmtv.ssapRefused2';

  // The same list the key was granted for: a key only works with the permissions it was given. READ_TV_PROGRAM_INFO
  // is what's on; CONTROL_INPUT_TV and TEST_OPEN switch the channel.
  var SSAP_PERMISSIONS = ['LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'READ_APP_STATUS', 'READ_RUNNING_APPS',
    'READ_INSTALLED_APPS', 'READ_CURRENT_CHANNEL', 'READ_TV_CHANNEL_LIST', 'READ_TV_PROGRAM_INFO',
    'READ_TV_CURRENT_TIME', 'READ_TV_CONTENT_STATE', 'CONTROL_INPUT_TV', 'CONTROL_AUDIO', 'TEST_OPEN',
    'TEST_PROTECTED', 'READ_INPUT_DEVICE_LIST', 'READ_COUNTRY_INFO'];

  function ssapAllowed() {
    try { return !localStorage.getItem(SSAP_REFUSED); } catch (e) { return true; }
  }

  function ssapKey() {
    var key = null;
    try { key = localStorage.getItem(SSAP_KEY); } catch (e) {}
    return key || (window.CONFIG && CONFIG.ssapKey) || null;
  }

  function ssapPaired() { return !!ssapKey(); }

  // One connection for every call, opened when the first one comes: two at once would each ask the TV to pair, and the
  // second's error was taken for a "no". Calls wait while the TV asks.
  var conn = {ws: null, ready: false, queue: [], waiting: {}, next: 1};

  function ssapClose() {
    var w = conn.waiting;
    conn.ws = null;
    conn.ready = false;
    conn.waiting = {};
    var q = conn.queue;
    conn.queue = [];
    for (var id in w) if (w.hasOwnProperty(id)) w[id](null);
    for (var i = 0; i < q.length; i++) q[i].done(null);
  }

  function ssapSend(call) {
    var id = 'c' + (conn.next++);
    var timer = setTimeout(function () {
      if (conn.waiting[id]) { delete conn.waiting[id]; call.done(null); }
    }, 15000);
    conn.waiting[id] = function (m) {
      clearTimeout(timer);
      call.done(m && m.type !== 'error' && m.payload && m.payload.returnValue !== false ? m.payload : null);
    };
    var request = {type: 'request', id: id, uri: 'ssap://' + call.uri};
    if (call.payload) request.payload = call.payload;
    try { conn.ws.send(JSON.stringify(request)); } catch (e) { delete conn.waiting[id]; call.done(null); }
  }

  function ssapOpen() {
    var ws;
    try { ws = new WebSocket('ws://127.0.0.1:3000'); } catch (e) { ssapClose(); return; }
    conn.ws = ws;
    var pairing = setTimeout(function () { if (!conn.ready) { try { ws.close(); } catch (e) {} ssapClose(); } }, 90000);
    ws.onopen = function () {
      var payload = {forcePairing: false, pairingType: 'PROMPT',
        manifest: {manifestVersion: 1, appVersion: '1.0', permissions: SSAP_PERMISSIONS}};
      var key = ssapKey();
      if (key) payload['client-key'] = key;
      ws.send(JSON.stringify({type: 'register', id: 'register', payload: payload}));
    };
    ws.onmessage = function (event) {
      var m = null;
      try { m = JSON.parse(event.data); } catch (e) {}
      if (!m) return;
      if (m.id === 'register') {
        if (m.type === 'registered') {
          clearTimeout(pairing);
          try { localStorage.setItem(SSAP_KEY, m.payload['client-key']); } catch (e) {}
          conn.ready = true;
          var q = conn.queue;
          conn.queue = [];
          for (var i = 0; i < q.length; i++) ssapSend(q[i]);
        } else if (m.type === 'error') {
          // Only a "no" on the TV stops asking; any other error (busy, a key that expired) tries again next time.
          if (/reject|denied|cancel/i.test(m.error || '')) { try { localStorage.setItem(SSAP_REFUSED, '1'); } catch (e) {} }
          try { localStorage.removeItem(SSAP_KEY); } catch (e) {}
          clearTimeout(pairing);
          try { ws.close(); } catch (e) {}
          ssapClose();
        }
        return;
      }
      var cb = conn.waiting[m.id];
      if (cb) { delete conn.waiting[m.id]; cb(m); }
    };
    ws.onerror = ws.onclose = function () { if (conn.ws === ws) { clearTimeout(pairing); ssapClose(); } };
  }

  /** One call to the remote control API; done(result) with null on failure. */
  function ssap(uri, payload, done) {
    if (typeof payload === 'function') { done = payload; payload = null; }
    if (!webos) { setTimeout(function () { done(null); }, 0); return; }
    var call = {uri: uri, payload: payload, done: done};
    if (conn.ready) { ssapSend(call); return; }
    conn.queue.push(call);
    if (!conn.ws) ssapOpen();
  }

  // LG inputs: the antenna and the four HDMI ports, with the apps LG opens for them.
  var INPUTS = [
    {id: 'com.webos.app.livetv', key: 'live', label: null, symbol: 'live_tv'},
    {id: 'com.webos.app.hdmi1', key: 'hdmi1', label: 'HDMI 1', symbol: 'hdmi'},
    {id: 'com.webos.app.hdmi2', key: 'hdmi2', label: 'HDMI 2', symbol: 'hdmi'},
    {id: 'com.webos.app.hdmi3', key: 'hdmi3', label: 'HDMI 3', symbol: 'hdmi'},
    {id: 'com.webos.app.hdmi4', key: 'hdmi4', label: 'HDMI 4', symbol: 'hdmi'}
  ];

  // Not shown among LG's apps: the inputs above, LG's own home and launchers.
  var HIDDEN = /^(com\.webos\.app\.(livetv|hdmi\d|home|homeconnect|discovery|launcher)|com\.webos\.app\.inputpicker)$/;

  var SAMPLE = [
    ['netflix', 'Netflix', '#E50914'], ['youtube.leanback.v4', 'YouTube', '#FF0033'], ['amazon', 'Prime Video', '#1A98FF'],
    ['com.disney.disneyplus-prod', 'Disney+', '#1838C8'], ['com.hbo.hbomax', 'Max', '#6C3BE0'],
    ['com.apple.appletv', 'Apple TV', '#B8BCC6'], ['globoplaywebos', 'Globoplay', '#FF5A1F'], ['spotify-beehive', 'Spotify', '#1DB954'],
    ['cdp-30', 'Plex', '#E5A00D'], ['com.crunchyroll.webapp', 'Crunchyroll', '#F47521'], ['com.webos.app.browser', 'Web Browser', '#3A7BD5'],
    ['com.palm.app.settings', 'Settings', '#8E8E93']
  ];

  // Newer webOS (11 tested) denies listLaunchPoints to Developer Mode apps, but still answers getAppLoadStatus for
  // one app id: these are checked one by one there. Their icons can't be read, so they get our logo where web/icons
  // has one, and otherwise their name on the brand's color: [id, title, logo, color].
  var KNOWN = [
    ['netflix', 'Netflix', 'icons/netflix.svg'], ['youtube.leanback.v4', 'YouTube', 'icons/youtube.png'],
    ['amazon', 'Prime Video', 'icons/prime.png'], ['com.disney.disneyplus-prod', 'Disney+'],
    ['com.wbd.stream', 'HBO Max', 'icons/max.svg'], ['com.hbo.hbomax', 'Max', 'icons/max.svg'],
    ['com.apple.appletv', 'Apple TV'], ['hulu', 'Hulu'], ['com.peacock.tv', 'Peacock'], ['com.nfl.app', 'NFL'],
    ['globoplaywebos', 'Globoplay'], ['spotify-beehive', 'Spotify', 'icons/spotify.svg'],
    ['tv.twitch.tv.starshot.lg', 'Twitch', '', '#9146FF'], ['cdp-30', 'Plex', '', '#E5A00D'],
    ['org.jellyfin.webos', 'Jellyfin', 'icons/jellyfin.svg'], ['com.crunchyroll.webapp', 'Crunchyroll', '', '#F47521'],
    ['com.webos.app.browser', 'Web Browser', '', '#3A7BD5'],
    // The IPTV player (iptv_app): the cards and Movies/Shows reach it even when only these known apps are listed.
    ['com.lennylxx.iptv', 'Player IPTV', '', '#241E52']
  ];

  // The remote control API gives each icon an address that only works while that connection is open (a new one each
  // time, 404 after), so the icons are read right away and kept as data URLs, by app (fmtv.icons): they always show,
  // and the logo can be lifted off them (a data URL doesn't taint the canvas).
  var ICONS = 'fmtv.icons';
  var iconCache = {};
  try { iconCache = JSON.parse(localStorage.getItem(ICONS) || '{}') || {}; } catch (e) { iconCache = {}; }

  /** An image at url as a data URL; done(null) when it can't be read. */
  function dataUrl(url, done) {
    var x = new XMLHttpRequest();
    try {
      x.open('GET', url, true);
      x.responseType = 'arraybuffer';
    } catch (e) { done(null); return; }
    x.timeout = 8000;
    x.onloadend = function () {
      if (x.status !== 200 || !x.response || !x.response.byteLength) { done(null); return; }
      var bytes = new Uint8Array(x.response), bin = '';
      for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      var type = x.getResponseHeader('content-type') ||
          (/\.jpe?g$/i.test(url) ? 'image/jpeg' : /\.svg$/i.test(url) ? 'image/svg+xml' : 'image/png');
      done('data:' + type + ';base64,' + btoa(bin));
    };
    x.send();
  }

  /** Each app's icon read now, while its address works; else the one kept from before. Apps gone leave the cache. */
  function keepIcons(apps, done) {
    var left = apps.length + 1, kept = {};
    function one() {
      if (--left > 0) return;
      iconCache = kept;
      try { localStorage.setItem(ICONS, JSON.stringify(kept)); } catch (e) {}   // full: they stay for this run
      done(apps);
    }
    apps.forEach(function (a) {
      if (!/^https?:\/\/127\.0\.0\.1:300\d\//.test(a.icon)) {
        if (!a.icon && iconCache[a.id]) a.icon = iconCache[a.id];
        if (iconCache[a.id]) kept[a.id] = iconCache[a.id];
        one();
        return;
      }
      dataUrl(a.icon, function (d) {
        a.icon = d || iconCache[a.id] || '';
        if (a.icon) kept[a.id] = a.icon;
        one();
      });
    });
    one();
  }

  var appsWaiting = null;   // the callers of TV.apps while a listing runs

  function knownApps(done) {
    var found = [], left = KNOWN.length, sent = false;
    function finish() {
      if (sent) return;
      sent = true;
      done(found.filter(function (x) { return x; }));
    }
    setTimeout(finish, 5000);   // an id that never answers doesn't hold the rest
    KNOWN.forEach(function (k, i) {
      luna('luna://com.webos.applicationManager/getAppLoadStatus', {appId: k[0]}, function (res) {
        // Our logo where web/icons has one, else the TV's own icon kept from a time the API listed it.
        if (res && res.exist) found[i] = {id: k[0], title: k[1], icon: k[2] || iconCache[k[0]] || '', color: k[3] || ''};
        if (--left === 0) finish();
      });
    });
  }

  var self = 'io.freemytv';
  if (webos && window.PalmSystem && window.PalmSystem.identifier) self = window.PalmSystem.identifier.split(' ')[0];

  // The antenna inside this app: a <video> of the broadcast is a session of the TV's broadcast service (its mediaId is
  // the session's broadcastId), which tells and switches that picture's channel. Not LG's Live TV: opening it to
  // switch the tuner left it holding the antenna, and this app's picture went black.
  var BROADCAST = 'luna://com.webos.service.utp.broadcast/';

  /** The channel of the antenna's picture in `video`: {id, number, name} or null. */
  function broadcastChannel(video, done) {
    if (!webos || !video || !video.mediaId) { setTimeout(function () { done(null); }, 0); return; }
    luna(BROADCAST + 'getCurrentChannel', {broadcastId: video.mediaId, subscribe: false}, function (res) {
      var c = res && res.channel;
      done(c && c.channelId ? {id: c.channelId, number: c.channelNumber || '', name: c.channelName || ''} : null);
    });
  }

  // MARK: - Live channels (LG), for the "TV aberta" tab

  /** A time as LG gives it ("2026,10,24,20,30,00", "2026/10/24 20:30:00", seconds or ms) in ms, or 0. */
  function lgTime(v) {
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    var m = /(\d{4})\D(\d{1,2})\D(\d{1,2})\D+(\d{1,2})\D(\d{1,2})(?:\D(\d{1,2}))?/.exec(v || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() : 0;
  }

  /** One program as LG gives it, as {title, start, end}, or null. */
  function program(p) {
    if (!p) return null;
    var start = lgTime(p.localStartTime || p.startTime), end = lgTime(p.localEndTime || p.endTime);
    if (!end && start && p.duration) end = start + p.duration * 1000;
    return start && end ? {title: p.programName || p.programTitle || p.title || '', start: start, end: end} : null;
  }

  /** What's on a channel now, from LG's program list: {title, start, end} or null. */
  function onNow(list) {
    var now = Date.now();
    for (var i = 0; list && i < list.length; i++) {
      var p = program(list[i]);
      if (p && p.start <= now && now < p.end) return p;
    }
    return null;
  }

  // What's on each channel, as last seen. LG's guide only tells what's on the channel the tuner is on (the program list
  // of the others comes back empty on Brazilian open TV), so each channel's program is kept from when it was tuned,
  // until it ends.
  var GUIDE = 'fmtv.guide';
  var guide = {};
  try { guide = JSON.parse(localStorage.getItem(GUIDE) || '{}') || {}; } catch (e) { guide = {}; }

  function remember(channelId, p) {
    if (!channelId || !p) return;
    guide[channelId] = p;
    var now = Date.now();
    for (var id in guide) if (guide.hasOwnProperty(id) && guide[id].end < now) delete guide[id];
    try { localStorage.setItem(GUIDE, JSON.stringify(guide)); } catch (e) {}
  }

  function known(channelId) {
    var p = guide[channelId];
    return p && p.end > Date.now() ? p : null;
  }

  /** What's on the channel the tuner is on, kept for later; done({channelId, program} | null). */
  function nowOnTuner(done) {
    if (!webos || !ssapAllowed()) { setTimeout(function () { done(null); }, 0); return; }
    ssap('tv/getChannelCurrentProgramInfo', function (res) {
      var p = program(res);
      if (res && res.channelId && p) remember(res.channelId, p);
      done(res && res.channelId ? {channelId: res.channelId, program: p} : null);
    });
  }

  function lgChannelList(done) {
    luna('luna://com.webos.service.tv.channel/getChannelList', {}, function (res) {
      if (res && res.channelList && res.channelList.length) { done(res.channelList); return; }
      if (!ssapAllowed()) { done(null); return; }
      ssap('tv/getChannelList', function (res2) { done(res2 && res2.channelList ? res2.channelList : null); });
    });
  }

  // For the browser preview: Brazilian open TV, with programs around now.
  var SAMPLE_CHANNELS = [['12-1', '12-1', 'Globo HD', 'É de Casa', -32, 195], ['27-1', '27-1', 'RECORD NEWS HD', 'Record News Rural', -20, 60],
    ['7-1', '7-1', 'Band Minas HD', 'Band Esporte Clube', -10, 90], ['5-1', '5-1', 'TV ALTEROSA HD', 'Sábado Animado', -5, 40]];

  function sampleChannels() {
    var now = Date.now();
    return SAMPLE_CHANNELS.map(function (c) {
      return {id: c[0], number: c[1], name: c[2], program: {title: c[3], start: now + c[4] * 60000, end: now + (c[4] + c[5]) * 60000}};
    });
  }

  /** A channel's name, to compare: lower case, letters and digits only, without HD/SD/4K. */
  function plainName(x) {
    return (x || '').toLowerCase().replace(/\b(hd|sd|4k)\b/g, '').replace(/[^a-z0-9]/g, '');
  }

  /**
   * The wanted ones first, in their order: each name takes the channel that is that name ("Globo HD" for Globo), else
   * the shortest one that contains it, so "Globo" doesn't take GloboNews. The TV's first channels fill the rest.
   */
  function pickChannels(all, wanted, max) {
    var out = [];
    for (var w = 0; w < wanted.length && out.length < max; w++) {
      var needle = plainName(wanted[w]), best = null;
      if (!needle) continue;
      for (var j = 0; j < all.length; j++) {
        var n = plainName(all[j].name);
        if (out.indexOf(all[j]) >= 0 || n.indexOf(needle) < 0) continue;
        if (n === needle) { best = all[j]; break; }
        if (!best || n.length < plainName(best.name).length) best = all[j];
      }
      if (best) out.push(best);
    }
    for (var k = 0; k < all.length && out.length < max; k++) if (out.indexOf(all[k]) < 0) out.push(all[k]);
    return out;
  }

  /**
   * The TV's channels, the ones whose name matches `wanted` first (["Globo", "GloboNews"]), at most `max`, each with
   * what's on now when the TV tells: [{id, number, name, program: {title, start, end} | null}], or null when it can't
   * list them.
   */
  function channels(wanted, max, done) {
    if (!webos) { done(pickChannels(sampleChannels(), wanted, max)); return; }
    lgChannelList(function (list) {
      if (!list) { done(null); return; }
      var all = [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c || c.Invisible || c.invisible || c.skipped) continue;
        all.push({id: c.channelId, number: c.channelNumber || '', name: c.channelName || c.channelNumber || '', program: null});
      }
      var out = pickChannels(all, wanted, max);
      if (!out.length || !ssapAllowed()) { done(out); return; }
      var left = out.length + 1;
      function one() { if (--left === 0) { out.forEach(function (ch) { ch.program = ch.program || known(ch.id); }); done(out); } }
      out.forEach(function (ch) {
        ssap('tv/getChannelProgramInfo', {channelId: ch.id}, function (res) {
          ch.program = res ? onNow(res.programList) : null;
          if (ch.program) remember(ch.id, ch.program);
          one();
        });
      });
      nowOnTuner(one);
    });
  }

  /** The channel the TV is on: {id, number, name} or null. */
  function currentChannel(done) {
    if (!webos || !ssapAllowed()) { setTimeout(function () { done(null); }, 0); return; }
    ssap('tv/getCurrentChannel', function (res) {
      done(res && res.channelId ? {id: res.channelId, number: res.channelNumber || '', name: res.channelName || ''} : null);
    });
  }

  /** Live TV on this channel; done(ok). */
  function openChannel(ch, done) {
    if (!webos) { if (done) setTimeout(function () { done(true); }, 0); return; }
    luna('luna://com.webos.applicationManager/launch', {id: 'com.webos.app.livetv', params: {channelId: ch.id}}, function (res) {
      if (!ssapAllowed()) { if (done) done(!!res); return; }
      ssap('tv/openChannel', {channelId: ch.id}, function (res2) { if (done) done(!!res || !!res2); });
    });
  }

  // MARK: - The TV, whichever it is

  return {
    name: webos ? 'webos' : 'browser',

    /**
     * Installed apps, as the TV's launcher lists them: [{id, title, icon, color}]. One listing at a time, shared by
     * whoever asks meanwhile: a second listLaunchPoints gives new icon addresses and ends the first one's.
     */
    apps: function (done) {
      if (!webos) {
        done(SAMPLE.map(function (s) { return {id: s[0], title: s[1], icon: '', color: s[2]}; }));
        return;
      }
      if (appsWaiting) { appsWaiting.push(done); return; }
      appsWaiting = [done];
      var waiting = appsWaiting;
      done = function (out) {
        appsWaiting = null;
        for (var w = 0; w < waiting.length; w++) waiting[w](out);
      };
      function list(res) {
        var out = [];
        var points = res && res.launchPoints ? res.launchPoints : [];
        for (var i = 0; i < points.length; i++) {
          var p = points[i];
          if (!p.id || p.id === self || HIDDEN.test(p.id)) continue;
          out.push({id: p.id, title: p.title || p.id, icon: p.largeIcon || p.icon || '', color: p.bgColor || p.iconColor || ''});
        }
        return out;
      }
      luna('luna://com.webos.applicationManager/listLaunchPoints', {}, function (res) {
        if (res) { done(list(res)); return; }
        // Denied to Developer Mode apps (webOS 6 and newer): once the TV has allowed the remote control API, it lists
        // every app with its icon; until then, the known apps the TV says it has, while the TV asks once (an answer
        // only counts from the next load on, and a "no" isn't asked again).
        var paired = ssapPaired(), refused = !ssapAllowed();
        if (paired) {
          ssap('com.webos.applicationManager/listLaunchPoints', function (res2) {
            if (res2) keepIcons(list(res2), done); else knownApps(done);
          });
          return;
        }
        knownApps(done);
        if (!refused) ssap('com.webos.applicationManager/listLaunchPoints', function () {});
      });
    },

    /** Opens an app (or an input); done(ok). */
    launch: function (id, params, done) {
      if (!webos) {
        if (done) setTimeout(function () { done(true); }, 0);
        return;
      }
      luna('luna://com.webos.applicationManager/launch', params ? {id: id, params: params} : {id: id}, function (res) {
        if (done) done(!!res);
      });
    },

    /** The antenna and HDMI inputs; `connected` when the TV says a device is on (when it tells). */
    inputs: function (done) {
      var list = INPUTS.map(function (x) { return {id: x.id, key: x.key, label: x.label, symbol: x.symbol, connected: true}; });
      if (!webos) {
        list[2].connected = false;
        list[3].connected = false;
        list[4].connected = false;
        done(list);
        return;
      }
      luna('luna://com.webos.service.eim/getAllInputStatus', {}, function (res) {
        var devices = res && res.devices ? res.devices : null;
        if (devices) {
          for (var i = 1; i < list.length; i++) {
            for (var j = 0; j < devices.length; j++) {
              var d = devices[j];
              if (d.appId !== list[i].id) continue;
              list[i].connected = d.connected !== false;
              // A name the person gave the input on the TV ("PS5"), if any.
              if (d.label && !/^hdmi\s*\d$/i.test(d.label)) list[i].label = d.label;
            }
          }
        }
        done(list);
      });
    },

    /** LG's channels for the "TV aberta" tab (see above). */
    channels: channels,

    /** Live TV on a channel from channels(). */
    openChannel: openChannel,

    /** The player in the cards: which channel it's on and what's on it (kept for each channel). */
    currentChannel: currentChannel,
    nowOnTuner: nowOnTuner,
    known: known,

    /** The TV's own settings; done(ok). */
    settings: function (done) {
      this.launch('com.palm.app.settings', null, done);
    },

    /** LG: keeps the TV's screensaver away while ours will take over (`hold` says when). */
    holdScreenSaver: holdScreenSaver,

    /** Back on the first screen: back to wherever the person came from. */
    back: function () {
      if (window.PalmSystem && window.PalmSystem.platformBack) window.PalmSystem.platformBack();
    },

    /** The TV's time zone ("America/Sao_Paulo"), or ''. */
    zone: function () {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
    },

    broadcastChannel: broadcastChannel,

    /** The antenna's picture in `video` on another channel ({id}), in this app. done(ok). */
    tune: function (video, ch, done) {
      broadcastChannel(video, function (cur) {
        if (!cur) { done(false); return; }
        if (cur.id === ch.id) { done(true); return; }
        luna(BROADCAST + 'changeChannel', {channelId: ch.id, broadcastId: video.mediaId, currentChannelId: cur.id}, function (res) {
          done(!!res);
        });
      });
    },

    /** Key codes: the arrows, OK and the TV's Back (461 on LG). */
    keys: {left: 37, up: 38, right: 39, down: 40, ok: 13, back: 461}
  };
})();
