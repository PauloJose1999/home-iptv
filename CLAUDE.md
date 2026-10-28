# Home IPTV: notes for Claude

A home screen for LG TVs (webOS) as a web app: `web/`, packed by `webos/build.py` into `HomeIPTV-webos.ipk` and
installed through LG's Developer Mode (`webos/install.py`, or webOS Dev Manager). Only LG: the Android, Samsung and
website parts of the original Free My TV were removed. The person you're helping isn't technical and speaks
Portuguese: keep it short and simple, say what you'll do on their TV before you do it, and let them do the taps.

Before you push, run `tools/check.sh` (translations, the generic LG package, ES5 in `web/`); CI runs it too.

## Install

1. On the TV (they do it): LG Content Store → *Developer Mode* → free LG developer account → *Dev Mode Status* on (the
   TV restarts) → *Key Server* on. It shows the IP and a passphrase.
2. `python3 webos/build.py` must end with `Built HomeIPTV-webos.ipk` (the first run creates `config.properties`).
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
  `listLaunchPoints` there gives icons at `http://127.0.0.1:3000/resources/<hash>/…`, valid only while that
  connection is open (404 after), so `keepIcons` reads them at once into data URLs (`fmtv.icons`);
  `tv/getChannelProgramInfo` returns an empty list on Brazilian open TV, so each channel's program is kept from when it
  was tuned (`guide` in localStorage); `tv/openChannel` switches the tuner but brings the TV's Live TV app to the front
  (and a hidden app's timers stop, so it can't come back by itself).
- `web/home.js`: the screen, built from its parts in `web/home/` (joined as they are, in `_order.txt`'s order, by
  `tools/webapp.py` `home_js()`: one closure, as one file was). Edit the parts, never a `home.js`. Parts by layer:
  `00-base` (DOM helpers); rules, which decide and never draw: `10-rules-shelf`, `11-rules-live`, `12-rules-titles`,
  `13-rules-settings`; data, the IPTV player and the TV: `20-data-iptv`, `21-data-tv`; screens: `30-ui-focus`,
  `31-ui-top`, `32-ui-live`, `33-ui-catalog`, `33-ui-sports`, `34-ui-detail`, `35-ui-shelf`, `36-ui-settings`,
  `37-ui-shelfedit`, `38-ui-saver`; `50-state` (the shared state and the listeners, in the order they must run);
  `80-input` (OK, arrows, Back, pointer, wheel); `90-start`. A part holds functions only, except `00-base`, `50-state`
  and `90-start`: moving a function between parts changes nothing (`tools/same_home.py` proves a change is only that).
  How the screen behaves is recorded in `tools/home-test/` (`tools/home_test.py`, run by `tools/check.sh`).
  `web/home.css` is built the same way from `web/style/` (`_order.txt`; `home_css()`), in consecutive slices: in CSS
  a later rule wins, so a rule moves between slices only where its place in the whole stays the same. TV aberta has a big card and a small card, plus All channels. Settings choose any channel
  for the big card; the small card is restricted to the other kind (antenna or IPTV). Only the focused (or last
  focused) card plays: with a broadcast `<video>` (`service/webos-broadcast`) and an IPTV one playing, the TV shows the
  broadcast black, and two streams pause each other. The other card shows its logo. Antenna retuning goes through the
  playing broadcast session (`utp.broadcast/changeChannel`, its `video.mediaId` as `broadcastId`) in `web/tv.js`, not
  `tv/openChannel` (which opens LG Live TV and leaves it holding the antenna).
- Movies and Shows tabs: a Netflix-like catalog (light by day, dark at night, the focused title large on top, rows below). `Data.catalog`
  fetches a tab's rows from TMDB only when the tab is opened (one request per row, one after the other), only titles
  on the TV's streaming apps, kept 6 hours; only photos near the focus load (w300), the large one when focus rests.
- Home Settings (`settingRows`): each row has an `about` shown under the list. Prefs set on the TV win over
  config.properties (`cardPicks`, `liveChannels`, `shelf` order, `shelfHidden`, `cardSound`, `saverMinutes`); `Prefs.reset()` forgets
  them. The picker (language, a card's channel) draws only the rows on screen. The Shelf editor is a grid: OK › Move
  lifts the app and the arrows move it (Back undoes), or the pointer holds and drags it; saved only when dropped.
- Detail pages (`openDetail`, zone `DETAIL`, a stack Back walks down): OK on a TMDB title opens its page (Watch focused,
  which calls `openTitle` as before; cast in round photos; similar titles), a cast member opens theirs (filmography:
  movies, shows, other work). `Data.titleDetails`/`personDetails`: one TMDB request each (`append_to_response`), kept
  3 days in `fmtv.details` (40 pages); only photos near the focus load.
- Series: the page's first button is `nextEpisode` (Continue S·E where it was left, else the next one; S1·E1 never
  watched; Watch again after the last), plus Episodes (`renderEpisodes`: seasons on top, a row per episode with a
  purple bar). The deep link carries `tmdbId`, `season`, `episode`, `resume` and `from`; Back in the player relaunches
  this app with `{progress: {tmdbId, title, episodes: [...]}}` (`takeLaunchParams` → `Data.recordProgress`,
  `fmtv.progress`): apps can't read each other's storage, and the player's service stops in the background.
- Trakt (`web/trakt.js`, `Trakt`): device-code sign-in with the client id only (`trakt_client_id`; Trakt deprecated
  the secret, never ship it; a refresh repeats the app's Redirect URI, `trakt_redirect_uri`, default http://localhost, the
  only kind a Development app takes); tokens, Trakt's data and a send queue in localStorage (`fmtv.trakt*`, not encrypted).
  `sync` reads `/sync/last_activities`, then only what changed (watched shows/movies, the watchlist page by page); one
  request at a time, POSTs 1/s, 429 waits Retry-After. Only plays the player saw end go to `/sync/history`, with the
  end time (`endedAt` in the player's report): Trakt doesn't refuse duplicates, so a key per item and end, and a lost
  answer is checked by re-reading the history first. `episodeStates` (home.js) merges the player's progress (the only
  source of a purple bar) with Trakt's watched episodes (✓ only). My list: `catalogRows`, the detail button.
  `tools/trakt_test_server.py` mimics the API (device codes, refresh, pagination, 429, a lost answer).
- IPTV player (`iptv-player/`, lennylxx/webos-iptv-player, app `com.lennylxx.iptv`, `iptv_app`): when it's installed,
  every IPTV playback happens there (the launcher has no player of its own). Deep link (`openInIptv`): launch params
  `{deepLink: {kind: movie|series|channel|section|account, title, from, year?, altTitle?, id?, url?, logo?, …}}`. A movie
  or series is found by name in its Xtream account and plays at once; a channel plays from its place in the player's
  list (`url` only when no list has it); `section` `live` opens its channel list; `account` just sends the lists back.
  Back (one press) returns here via `backToLauncher`, whose launch params always carry `iptv`: the player's enabled
  Xtream accounts and M3U links (`launcherSources`), as the account lives in the player alone. Build it in
  `iptv-player/` (`npm run build`, the service, `ares-package`) and install with `webos/install.py <IP> <ipk>`.
- `web/channels.js`: the channels of those lists (kept in `fmtv.iptvSources`; Xtream live categories as groups), for
  the channel card, All channels and Home Settings. Asked of the player once (`askForLists`) when there are none yet.
  The launcher's own player and list (`web/iptv.js`, `iptv-brasil.m3u`) are gone; the free list is now only test data
  (`tools/test-channels.m3u`).
- Text: `tr('…')`, `trf('{n} min', {n: 3})`, `plural('plural|…', n)`, `formatDate('format|h:mm', at)`, from
  `assets/i18n/{en,pt}.json`. After changing text, `python3 tools/translate.py` lists what's missing; add it to
  `pt.json` by hand.
- Debugging on the TV: Dev Manager's terminal (user `prisoner`, no root) has Python 3. The app's Web Inspector answers
  on the TV at port 9998 (`/json` lists pages), so `Runtime.evaluate` over its WebSocket reads the running app.
- Preview: `python3 webos/build.py --preview`, then serve `out/webos` and open `index.html` (sample apps and channels).
