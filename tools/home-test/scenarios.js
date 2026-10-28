/*
 * Characterization tests of web/home.js, part 2: the scenarios, and what is recorded at each step. They record how the
 * home screen behaves today, right or wrong, so a refactoring that changes any of it shows up (tools/home_test.py).
 *
 * run.html runs each scenario in a fresh iframe of the app (app.html?scenario=N) and gathers the records; in the app,
 * this file plays the scenario: keys as the remote sends them, clicks, the IPTV player's launch params, the wheel.
 * Test code only: desktop Chrome, never the TV.
 */
(function () {
  'use strict';

  var KEYS = {left: 37, up: 38, right: 39, down: 40, ok: 13, back: 461};

  // Each step: ['k', key] a key; ['w', ms] wait; ['s', label] record; ['c', selector, text] click the element with
  // that text; ['wheel', dy]; ['launch', params] the app opened again (webOSRelaunch); ['saver'] the screensaver.
  var SCENARIOS = [
    {name: 'inicio', steps: [['s', 'aberto']]},
    {name: 'setas na Home', steps: [
      ['k', 'up'], ['s', 'cima'], ['k', 'right'], ['s', 'direita'], ['k', 'down'], ['s', 'baixo'],
      ['k', 'down'], ['s', 'baixo 2'], ['k', 'down'], ['s', 'gaveta'], ['k', 'right'], ['s', 'gaveta direita'],
      ['k', 'up'], ['s', 'fecha gaveta'], ['k', 'up'], ['k', 'up'], ['s', 'topo'], ['k', 'back'], ['s', 'voltar']]},
    {name: 'filmes, titulo e pessoa', steps: [
      ['k', 'up'], ['k', 'up'], ['k', 'right'], ['k', 'right'], ['w', 1500], ['s', 'aba filmes'],
      ['k', 'down'], ['s', 'fileira'], ['k', 'right'], ['s', 'segundo titulo'], ['k', 'down'], ['s', 'segunda fileira'],
      ['k', 'up'], ['k', 'ok'], ['w', 1200], ['s', 'pagina do titulo'], ['k', 'down'], ['s', 'elenco'],
      ['k', 'ok'], ['w', 1200], ['s', 'pagina da pessoa'], ['k', 'back'], ['s', 'volta ao titulo'],
      ['k', 'back'], ['s', 'volta a fileira'], ['k', 'back'], ['s', 'volta as abas'], ['k', 'back'], ['s', 'volta a home']]},
    {name: 'serie e episodios', steps: [
      ['k', 'up'], ['k', 'up'], ['k', 'right'], ['k', 'right'], ['k', 'right'], ['w', 1500], ['s', 'aba series'],
      ['k', 'down'], ['k', 'ok'], ['w', 1200], ['s', 'pagina da serie'], ['k', 'right'], ['s', 'botao episodios'],
      ['k', 'ok'], ['w', 1200], ['s', 'episodios'], ['k', 'right'], ['k', 'ok'], ['w', 1200], ['s', 'temporada 2'],
      ['k', 'down'], ['s', 'episodio'], ['k', 'back'], ['s', 'volta a serie'], ['k', 'back'], ['s', 'volta a fileira']]},
    {name: 'ajustes e acessibilidade', steps: [
      ['c', '#buttons > *:last-child'], ['w', 500], ['s', 'ajustes'], ['k', 'down'], ['k', 'down'], ['k', 'down'], ['s', 'linha 4'],
      ['k', 'ok'], ['s', 'som trocado'], ['c', '#settings .row', 'Acessibilidade'], ['w', 400], ['s', 'acessibilidade'],
      ['k', 'ok'], ['s', 'texto grande'], ['k', 'ok'], ['s', 'texto muito grande'], ['k', 'down'], ['k', 'ok'], ['s', 'contraste'],
      ['k', 'down'], ['k', 'ok'], ['s', 'foco'], ['k', 'down'], ['k', 'ok'], ['s', 'animacoes'], ['k', 'back'], ['s', 'volta a lista'],
      ['k', 'back'], ['s', 'fecha']]},
    {name: 'seletores dos cards', steps: [
      ['c', '#buttons > *:last-child'], ['w', 500], ['c', '#settings .row', 'Card grande'], ['w', 600], ['s', 'card grande'],
      ['k', 'down'], ['s', 'card grande desce'], ['k', 'back'], ['w', 300], ['s', 'volta'],
      ['c', '#settings .row', 'Card pequeno'], ['w', 600], ['s', 'card pequeno'], ['k', 'back'], ['w', 300], ['k', 'back'], ['s', 'fecha']]},
    {name: 'editor da prateleira', steps: [
      ['c', '#buttons > *:last-child'], ['w', 500], ['c', '#settings .row', 'Prateleira'], ['w', 500], ['s', 'editor'],
      ['k', 'right'], ['s', 'segundo app'], ['k', 'ok'], ['s', 'menu'], ['k', 'ok'], ['s', 'mover'], ['k', 'right'], ['s', 'movido'],
      ['k', 'ok'], ['s', 'solto'], ['k', 'back'], ['s', 'volta'], ['k', 'back'], ['s', 'fecha']]},
    {name: 'reabrir e player', steps: [
      ['k', 'up'], ['k', 'up'], ['k', 'right'], ['k', 'right'], ['w', 1500], ['k', 'down'], ['k', 'ok'], ['w', 1200], ['s', 'pagina aberta'],
      ['launch', {}], ['w', 500], ['s', 'reaberto'],
      ['launch', {returned: 'channel'}], ['w', 500], ['s', 'volta de canal'],
      ['launch', {progress: {tmdbId: '2001', title: 'Série 2001', episodes: [{season: 1, episode: 2, position: 600, duration: 2400, done: false}]}}],
      ['w', 500], ['s', 'progresso recebido']]},
    {name: 'roda e protetor de tela', steps: [
      ['wheel', 100], ['s', 'roda baixo'], ['wheel', 100], ['s', 'roda baixo 2'], ['wheel', -100], ['s', 'roda cima'],
      ['saver'], ['w', 300], ['s', 'protetor'], ['k', 'down'], ['s', 'acorda'], ['k', 'down'], ['s', 'depois de acordar']]},
    {name: 'antena', steps: [
      ['k', 'up'], ['s', 'card da antena'], ['k', 'ok'], ['w', 300], ['s', 'ok na antena'], ['k', 'back'], ['s', 'voltar']]},
    {name: 'esportes', steps: [
      ['k', 'up'], ['k', 'up'], ['k', 'right'], ['w', 2000], ['s', 'aba esportes'], ['k', 'down'], ['s', 'fileira'],
      ['k', 'right'], ['s', 'segundo jogo'], ['k', 'back'], ['s', 'voltar']]}
  ];

  // MARK: - What a record holds: where the focus is and what is on screen, without times (they depend on the clock)

  function norm(text) {
    return String(text || '').replace(/\s+/g, ' ').replace(/(^|\D)\d{1,2}:\d{2}(?!\d)/g, '$1hh:mm').trim().slice(0, 90);
  }

  function texts(selector, max) {
    var out = [], list = document.querySelectorAll(selector);
    for (var i = 0; i < list.length && out.length < (max || 8); i++) {
      if (list[i].offsetParent === null && getComputedStyle(list[i]).position !== 'fixed') continue;
      out.push(norm(list[i].textContent));
    }
    return out;
  }

  function record(label) {
    var s = window.FreeMyTV && window.FreeMyTV.state || {};
    var sheets = [], open = document.querySelectorAll('.sheet.open');
    for (var i = 0; i < open.length; i++) sheets.push(open[i].id + (open[i].className.indexOf('side') >= 0 ? '(side)' : ''));
    return {
      step: label,
      zone: s.zone, tab: s.tab, card: s.card, shelf: s.shelf, row: s.row,
      body: document.body.className.split(/\s+/).filter(Boolean).sort().join(' '),
      sheets: sheets,
      focus: texts('.focus', 4),
      tabs: texts('#tabs > *', 6),
      cards: s.tab === 0 ? texts('#cards .card', 4) : [],
      catalog: s.tab !== 0 ? texts('#catalog .ctitle, #rows .ctitle', 4) : [],
      page: texts('#detail .dtitle, #detail .dbtn, #detail .dlabel, #detail .epname, #detail .eppill', 10),
      settings: sheets.length ? texts('.sheet.open .title, .sheet.open .row', 16) : [],
      toast: norm((document.getElementById('toast') || {}).textContent)
    };
  }

  // MARK: - In the app (app.html?scenario=N): play the scenario

  function key(name) {
    var e = document.createEvent('Event');
    e.initEvent('keydown', true, true);
    Object.defineProperty(e, 'keyCode', {get: function () { return KEYS[name]; }});
    document.dispatchEvent(e);
  }

  function play(index) {
    var sc = SCENARIOS[index], out = [], i = 0;
    function next() {
      if (i >= sc.steps.length) { parent.postMessage({homeTest: true, index: index, name: sc.name, records: out, errors: window.__homeTestErrors || []}, '*'); return; }
      var step = sc.steps[i++], wait = 250;
      try {
        if (step[0] === 'k') key(step[1]);
        else if (step[0] === 'w') wait = step[1];
        else if (step[0] === 's') { out.push(record(step[1])); wait = 0; }
        else if (step[0] === 'c') {
          var list = document.querySelectorAll(step[1]), hit = null;
          for (var j = 0; j < list.length && !hit; j++) if (!step[2] || list[j].textContent.indexOf(step[2]) >= 0) hit = list[j];
          if (hit) hit.click(); else out.push({step: 'not found: ' + step[1] + ' ' + (step[2] || '')});
        } else if (step[0] === 'wheel') {
          var w = document.createEvent('Event');
          w.initEvent('onwheel' in document ? 'wheel' : 'mousewheel', true, true);
          Object.defineProperty(w, 'deltaY', {get: function () { return step[1]; }});
          Object.defineProperty(w, 'deltaX', {get: function () { return 0; }});
          document.dispatchEvent(w);
        } else if (step[0] === 'launch') {
          var ev = document.createEvent('CustomEvent');
          ev.initCustomEvent('webOSRelaunch', true, true, step[1]);
          document.dispatchEvent(ev);
        } else if (step[0] === 'saver') window.FreeMyTV.showSaver();
      } catch (err) {
        out.push({step: 'error: ' + String(err && err.message || err).slice(0, 120)});
      }
      setTimeout(next, wait);
    }
    setTimeout(next, 1500);   // the app draws its first screen
  }

  // MARK: - In run.html: each scenario in a fresh iframe, then everything in <pre id="home-test-result">

  function runAll() {
    var results = [], index = 0, frame = null, errors = [];
    window.addEventListener('message', function (e) {
      if (!e.data || !e.data.homeTest) return;
      results.push({scenario: e.data.name, errors: e.data.errors, records: e.data.records});
      start();
    });
    function start() {
      if (frame) frame.parentNode.removeChild(frame);
      if (index >= SCENARIOS.length) {
        var pre = document.createElement('pre');
        pre.id = 'home-test-result';
        pre.textContent = JSON.stringify({scenarios: results, errors: errors});
        document.body.appendChild(pre);
        return;
      }
      frame = document.createElement('iframe');
      frame.style.width = '1920px';
      frame.style.height = '1080px';
      frame.src = 'app.html?scenario=' + index++;
      document.body.appendChild(frame);
    }
    window.addEventListener('error', function (e) { errors.push(String(e.message)); });
    start();
  }

  var m = /[?&]scenario=(\d+)/.exec(location.search);
  if (m) {
    window.addEventListener('load', function () { play(+m[1]); });
  } else if (document.getElementById('home-test-runner')) runAll();
})();
