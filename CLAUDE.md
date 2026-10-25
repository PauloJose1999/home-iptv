# LG TV Launcher: notes for Claude

A home screen for LG TVs (webOS) as a web app: `web/`, packed by `webos/build.py` into `FreeMyTV-webos.ipk` and
installed through LG's Developer Mode (`webos/install.py`, or webOS Dev Manager). Only LG: the Android, Samsung and
website parts of the original Free My TV were removed. The person you're helping isn't technical and speaks
Portuguese: keep it short and simple, say what you'll do on their TV before you do it, and let them do the taps.

Before you push, run `tools/check.sh` (translations, the generic LG package, ES5 in `web/`); CI runs it too.

## Install

1. On the TV (they do it): LG Content Store → *Developer Mode* → free LG developer account → *Dev Mode Status* on (the
   TV restarts) → *Key Server* on. It shows the IP and a passphrase.
2. `python3 webos/build.py` must end with `Built FreeMyTV-webos.ipk` (the first run creates `config.properties`).
3. First install: they run `python3 webos/install.py <IP>` in their own terminal (the passphrase is theirs, never in
   the chat). Later updates run the same command. Raise `version` in `webos/appinfo.json` when an install doesn't
   replace the files.
4. On the TV: holding a number key while the launcher is open pins it to that key. Developer Mode lasts ~40 days
   (*EXTEND* renews it).

## Secrets

`config.properties` holds the TMDB key, the TV's remote-control key (`ssap_key`) and IPTV credentials: they are the
person's, stay only in that file (git ignores it), are never printed and never committed.

## The code

- Plain ES5 JavaScript and CSS without variables, grid or backdrop-filter: webOS 3 and 4 run a Chromium from 2015-2017;
  only transform and opacity animate. `tools/check.sh` rejects newer syntax and calls (`.find(`, `Promise`…).
- `web/tv.js`: Luna (`listLaunchPoints`, `launch`, inputs). webOS 6+ denies Developer Mode apps the app list and the
  channels; they come from the TV's remote-control API (SSAP, `ws://127.0.0.1:3000`), one shared connection, paired
  once (the TV asks) with the permissions in `SSAP_PERMISSIONS` (a key only works with the list it was granted for).
  Tested on this TV: `tv/getChannelList`, `tv/getCurrentChannel` and `tv/getChannelCurrentProgramInfo` work;
  `tv/getChannelProgramInfo` returns an empty list on Brazilian open TV, so each channel's program is kept from when it
  was tuned (`guide` in localStorage); `tv/openChannel` switches the tuner but brings the TV's Live TV app to the front
  (and a hidden app's timers stop, so it can't come back by itself).
- `web/home.js`: the screen. The TV aberta cards play the focused card's channel: its IPTV stream when the list has
  it, else the antenna (`<video>` with `service/webos-broadcast`), only on the card of the channel the tuner is on.
  With no card focused, the last focused card (or the first that can play) keeps playing muted; cards without a
  picture show the channel's logo from the IPTV list.
- `web/iptv.js`: the IPTV list (M3U or Xtream, from `config.properties`; by default `web/iptv-brasil.m3u`, the Free-TV
  Brazilian channels) and its full-screen player; it takes the remote's keys while open.
- Text: `tr('…')`, `trf('{n} min', {n: 3})`, `plural('plural|…', n)`, `formatDate('format|h:mm', at)`, from
  `assets/i18n/{en,pt}.json`. After changing text, `python3 tools/translate.py` lists what's missing; add it to
  `pt.json` by hand.
- Debugging on the TV: Dev Manager's terminal (user `prisoner`, no root) has Python 3. The app's Web Inspector answers
  on the TV at port 9998 (`/json` lists pages), so `Runtime.evaluate` over its WebSocket reads the running app.
- Preview: `python3 webos/build.py --preview`, then serve `out/webos` and open `index.html` (sample apps and channels).
