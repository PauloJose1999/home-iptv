  // MARK: - Rules of TV aberta (web/home/11-rules-live.js): which channel goes on which card, what it plays, and how a
  // channel's name and color are told; nothing here draws or asks the TV. A part of web/home.js, joined in order by
  // tools/webapp.py into the one function the other parts share.

  /** A channel's name as shown: without "HD", and "RECORD NEWS" as "Record News" (short ones like SBT stay). */
  function channelName(name) {
    var n = (name || '').replace(/\s+(F?HD|SD|UHD|4K)$/i, '');
    if (n !== n.toUpperCase()) return n;
    return n.toLowerCase().replace(/(^|\s)(\S)(\S*)/g, function (m, sp, a, rest) {
      return sp + (rest.length < 3 ? (a + rest).toUpperCase() : a.toUpperCase() + rest);
    });
  }

  function channelColors(name, i) {
    for (var k = 0; k < CHANNEL_COLORS.length; k++) if (CHANNEL_COLORS[k][0].test(name)) return CHANNEL_COLORS[k][1];
    return i === 0 ? ['#7C3AED', '#1E1B4B'] : ['#6D28D9', '#0F172A'];
  }

  /**
   * TV aberta's two cards, as picked in Home Settings: the big one any channel, from the antenna or the internet
   * (IPTV); the other one a channel of the other kind. Before any pick: the antenna big (the channel the TV is on),
   * and an internet channel beside it.
   */
  function cardPicks() {
    var p = Prefs.cardPicks();
    if (p && p.big && p.small) return p;
    return {big: {kind: 'antenna', name: ''}, small: {kind: 'iptv', name: liveWanted()[1] || ''}};
  }

  /** A channel's comparison key: remove quality suffixes, punctuation and Portuguese accents. */
  function plainName(name) {
    return channelName(name || '').toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * The cards of the first tab: the antenna card (the channel the TV is on: it has one tuner) and the internet card
   * (a card that says why when the list can't be read), the big one as picked, and under the small one All channels,
   * the whole list in the IPTV player. Two pictures at once: the TV plays no more.
   */
  function liveCards() {
    var ch = liveChannels && liveChannels[0];
    var air = {live: true, antenna: true, channel: antennaChannel, id: 'antenna'};
    var net = ch ? {live: true, channel: ch, id: 'ch' + ch.id} : {live: true, channel: null, id: 'nochannels'};
    var big = cardPicks().big.kind === 'iptv';
    return [big ? net : air, big ? air : net, {all: true, id: 'all'}];
  }

  /** Why there's no channel on the cards: no IPTV list set, or one that is empty or couldn't be read. */
  function noChannelsText() {
    return liveProblem === 'none' ? tr('Set up your IPTV list in the IPTV Player: its channels show here.')
        : tr("Couldn't load the IPTV list. Check the internet and try again.");
  }

  /** What a card plays: {tv: true} (the antenna) | {url} | null. */
  function sourceFor(card) {
    if (card && card.antenna) return {tv: true};
    var ch = card && card.channel, net = ch && ch.iptv && ch.iptv.url;
    return net && !/youtube\.com|youtu\.be/.test(net) ? {url: net} : null;
  }

  /** A card's pick as Home Settings shows it: "TV Cultura · internet", or for the antenna alone, the TV's channel. */
  function pickLabel(p) {
    if (!p.name) return p.kind === 'antenna' ? tr("The TV's channel") : tr('Automatic');
    var name = {name: channelName(p.name)};
    return p.kind === 'antenna' ? trf('{name} · antenna', name) : trf('{name} · internet', name);
  }
