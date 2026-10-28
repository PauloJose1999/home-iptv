(function () {
  'use strict';
  var leagues = [
    ['soccer/bra.1', 'Futebol', 'Brasileirão Série A'],
    ['soccer/conmebol.libertadores', 'Futebol', 'Copa Libertadores'],
    ['soccer/bra.copa_do_brazil', 'Futebol', 'Copa do Brasil'],
    ['soccer/conmebol.sudamericana', 'Futebol', 'Copa Sul-Americana'],
    ['soccer/bra.2', 'Futebol', 'Brasileirão Série B'],
    ['soccer/uefa.champions', 'Futebol', 'Champions League'],
    ['soccer/eng.1', 'Futebol', 'Premier League'],
    ['soccer/esp.1', 'Futebol', 'La Liga'],
    ['soccer/ita.1', 'Futebol', 'Serie A'],
    ['basketball/nba', 'Basquete', 'NBA'],
    ['racing/f1', 'Automobilismo', 'Fórmula 1'],
    ['mma/ufc', 'Lutas', 'UFC']
  ];
  var events = [], catalog = {schema: 1, updatedAt: '', events: {}};
  var $ = function (id) { return document.getElementById(id); };
  function message(text, error) { $('message').textContent = text; $('message').className = 'message' + (error ? ' error' : ''); }
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function localDate() {
    var d = new Date();
    return '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }
  function status(ev) {
    var c = ev.competitions && ev.competitions[0], s = ev.status || c && c.status, t = s && s.type;
    return t && t.state === 'in' ? 'live' : t && (t.state === 'post' || t.completed) ? 'ended' : 'soon';
  }
  function normalize(ev, league) {
    var c = ev.competitions && ev.competitions[0], teams = c && c.competitors || [], home = '', away = '';
    teams.forEach(function (x) { if (x.homeAway === 'home') home = x.team.shortDisplayName || x.team.displayName; else if (x.homeAway === 'away') away = x.team.shortDisplayName || x.team.displayName; });
    return {id: league[0] + ':' + ev.id, leaguePath: league[0], sportName: league[1], competition: league[2], home: home, away: away,
      title: home && away ? home + ' x ' + away : ev.name || ev.shortName || league[2], start: Date.parse(ev.date), state: status(ev)};
  }
  function load() {
    message('Conectando à Central local…');
    $('refresh').disabled = true;
    getJson('/api/catalog').then(function (saved) {
      catalog = saved;
      message('Buscando jogos de hoje…');
      return Promise.all(leagues.map(function (league) {
        var url = 'https://site.api.espn.com/apis/site/v2/sports/' + league[0] + '/scoreboard?lang=pt&region=br&dates=' + localDate();
        return getJson(url).then(function (data) { return (data.events || []).map(function (ev) { return normalize(ev, league); }); }).catch(function () { return []; });
      }));
    }).then(function (groups) {
      if (!groups) return;
      events = [].concat.apply([], groups).filter(function (x) { return x.title && !isNaN(x.start); });
      events.sort(function (a, b) { var rank = {live: 0, soon: 1, ended: 2}; return rank[a.state] - rank[b.state] || a.start - b.start; });
      render(); message('Jogos atualizados.');
    }).catch(function (e) {
      message('Não conectei à Central local. Abra pelo atalho “Central de Esportes” e mantenha a janela preta do servidor aberta. ' + e.message, true);
    })
      .finally(function () { $('refresh').disabled = false; });
  }
  function filtered() {
    var q = $('search').value.toLowerCase(), f = $('filter').value;
    return events.filter(function (ev) {
      var saved = catalog.events[ev.id], valid = saved && saved.status === 'confirmed' && saved.expiresAt > new Date().toISOString();
      if (f === 'pending' && valid || f === 'validated' && !valid || f === 'live' && ev.state !== 'live') return false;
      return !q || (ev.title + ' ' + ev.competition).toLowerCase().indexOf(q) >= 0;
    });
  }
  function render() {
    var host = $('events'), list = filtered();
    host.innerHTML = '';
    $('summary').textContent = list.length + ' jogos · ' + Object.keys(catalog.events).length + ' validações no catálogo';
    if (!list.length) { host.innerHTML = '<div class="empty">Nenhum jogo corresponde a este filtro.</div>'; return; }
    list.forEach(function (ev) {
      var saved = catalog.events[ev.id], valid = saved && saved.status === 'confirmed' && saved.expiresAt > new Date().toISOString();
      var card = document.createElement('article'); card.className = 'event ' + ev.state + (valid ? ' validated' : '');
      var info = document.createElement('div');
      info.innerHTML = '<div class="comp"></div><div class="title"></div><div class="meta"></div>';
      info.querySelector('.comp').textContent = ev.sportName + ' · ' + ev.competition;
      info.querySelector('.title').textContent = ev.title;
      info.querySelector('.meta').textContent = new Date(ev.start).toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'}) + (ev.state === 'live' ? ' · AO VIVO' : ev.state === 'ended' ? ' · ENCERRADO' : ' · FUTURO');
      if (valid) { var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = 'VALIDADO'; info.querySelector('.title').appendChild(badge); }
      var field = document.createElement('label'); field.className = 'field'; field.textContent = 'Emissoras confirmadas (separe por vírgula)';
      var input = document.createElement('input'); input.placeholder = 'Ex.: Premiere, SporTV'; input.value = valid ? saved.broadcasters.join(', ') : '';
      field.appendChild(input);
      var tools = document.createElement('div'); tools.className = 'event-tools';
      var epgButton = document.createElement('button'); epgButton.className = 'epg-search'; epgButton.textContent = 'Buscar este jogo no guia XMLTV';
      var results = document.createElement('div'); results.className = 'epg-results';
      epgButton.onclick = function () { searchEpg(ev, input, results, epgButton); };
      tools.appendChild(epgButton); tools.appendChild(results);
      var actions = document.createElement('div'); actions.className = 'actions';
      var save = document.createElement('button'); save.textContent = 'Validar e salvar';
      save.onclick = function () { saveEvent(ev, input.value); };
      actions.appendChild(save);
      if (saved) { var remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = 'Remover'; remove.onclick = function () { delete catalog.events[ev.id]; saveCatalog('Validação removida.'); }; actions.appendChild(remove); }
      card.appendChild(info); card.appendChild(field); card.appendChild(tools); card.appendChild(actions); host.appendChild(card);
    });
  }
  function searchEpg(ev, input, results, button) {
    button.disabled = true; button.textContent = 'Consultando o XMLTV…'; results.innerHTML = '';
    var query = new URLSearchParams({source: $('epg-source').value, start: String(ev.start), home: ev.home, away: ev.away});
    fetch('/api/epg?' + query.toString()).then(function (r) { return r.json().then(function (data) { if (!r.ok) throw new Error(data.error || 'Falha ao consultar o guia'); return data; }); })
      .then(function (data) {
        if (data.stale) {
          var warning = document.createElement('div'); warning.className = 'epg-stale';
          warning.textContent = 'Atenção: este arquivo XMLTV parece desatualizado; confirme qualquer sugestão antes de usar.';
          results.appendChild(warning);
        }
        if (!data.programmes.length) {
          var empty = document.createElement('div'); empty.className = 'epg-note';
          empty.textContent = 'O guia não encontrou um programa com os nomes dos times neste horário. Você ainda pode validar manualmente.';
          results.appendChild(empty); return;
        }
        data.programmes.forEach(function (p) {
          var row = document.createElement('div'); row.className = 'epg-result';
          var description = document.createElement('div');
          var title = document.createElement('strong'); title.textContent = p.channel + ' · ' + p.title; description.appendChild(title);
          var detail = document.createElement('small');
          detail.textContent = new Date(p.start * 1000).toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'}) +
            '–' + new Date(p.stop * 1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) +
            (p.subtitle ? ' · ' + p.subtitle : '') + ' · ID XMLTV: ' + p.channelId +
            (p.matchedTeams === 2 ? ' · encontrou os dois times' : ' · encontrou um time');
          description.appendChild(detail);
          var choose = document.createElement('button'); choose.textContent = 'Usar emissora';
          choose.onclick = function () {
            var values = input.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
            if (values.indexOf(p.channel) < 0) values.push(p.channel);
            input.value = values.join(', ');
            input.focus();
          };
          row.appendChild(description); row.appendChild(choose); results.appendChild(row);
        });
      }).catch(function (e) { results.textContent = 'Não consegui consultar este guia: ' + e.message; })
      .finally(function () { button.disabled = false; button.textContent = 'Buscar este jogo no guia XMLTV'; });
  }
  function saveEvent(ev, raw) {
    var names = raw.split(',').map(function (x) { return x.trim(); }).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (!names.length) { message('Informe ao menos uma emissora para validar.', true); return; }
    catalog.events[ev.id] = {status: 'confirmed', region: 'BR', broadcasters: names.slice(0, 8),
      competition: ev.competition, title: ev.title, start: ev.start, validatedAt: new Date().toISOString(),
      expiresAt: new Date(ev.start + 4 * 60 * 60 * 1000).toISOString()};
    saveCatalog('Jogo validado e salvo no catálogo compartilhado do projeto.');
  }
  function saveCatalog(okText) {
    catalog.schema = 1; catalog.updatedAt = new Date().toISOString();
    fetch('/api/catalog', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(catalog)})
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function () { message(okText); render(); $('saved').textContent = 'Salvo localmente em assets/sports/broadcasts.json · precisa ser publicado no GitHub para chegar às TVs.'; })
      .catch(function (e) { message('Falha ao salvar: ' + e.message, true); });
  }
  function postJson(url, body) {
    return fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}).then(function (r) {
      return r.json().then(function (data) { if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status); return data; });
    });
  }
  function loadForecast() {
    getJson('/api/state').then(function (state) {
      $('threshold').value = String(state.threshold || 75);
      var stale = state.staleSources && state.staleSources.length ? ' · EPG para revisar: ' + state.staleSources.join(', ') : ' · EPG atualizado';
      var model = state.model || {mode: 'initial', samples: 0};
      var learning = model.mode === 'calibrated' ? ' · modelo validado em partidas anteriores (' + model.samples + ' resultados, Brier ' + model.brier + ')' : ' · aprendendo com ' + (model.samples || 0) + ' resultados reais; percentuais ainda são pontuação inicial';
      $('forecast-meta').textContent = state.lastRun ? 'Última análise: ' + new Date(state.lastRun).toLocaleString('pt-BR') + ' · ' + (state.eventCount || 0) + ' jogos · limite ' + state.threshold + '%' + learning + stale : 'Aguardando a primeira análise da Central.';
      $('run-badge').textContent = state.running ? 'Análise em andamento' : state.error ? 'Conferir avisos' : state.lastRun ? 'Análise concluída' : 'Iniciando';
      renderForecast(state.forecasts || [], state.history || [], state.observations || []);
      if (state.error) message('A análise terminou com fontes indisponíveis: ' + state.error, true);
      if (state.running) window.setTimeout(loadForecast, 4000);
    }).catch(function (e) { $('forecast-meta').textContent = 'Não consegui ler o estado da análise: ' + e.message; });
  }
  function renderForecast(items, history, observations) {
    var host = $('forecast-list');
    host.innerHTML = '';
    var seen = {};
    observations.forEach(function (x) { seen[x.eventId + '|' + String(x.channel).toLowerCase()] = true; });
    var review = items.filter(function (x) { return x.status === 'review'; });
    var approved = items.filter(function (x) { return x.status === 'approved' || x.status === 'manual-confirmed'; });
    var heading = document.createElement('h3'); heading.textContent = 'Previsões com confiança suficiente · ' + approved.length; host.appendChild(heading);
    if (!approved.length) { var emptyA = document.createElement('p'); emptyA.className = 'forecast-empty'; emptyA.textContent = 'Nenhuma previsão atingiu os critérios de segurança hoje.'; host.appendChild(emptyA); }
    approved.forEach(function (item) { host.appendChild(forecastCard(item, false, seen)); });
    var reviewHeading = document.createElement('h3'); reviewHeading.textContent = 'Revisão manual · ' + review.length; host.appendChild(reviewHeading);
    if (!review.length) { var emptyR = document.createElement('p'); emptyR.className = 'forecast-empty'; emptyR.textContent = 'Nenhum jogo aguardando revisão.'; host.appendChild(emptyR); }
    review.forEach(function (item) { host.appendChild(forecastCard(item, true, seen)); });
    var currentIds = {};
    items.forEach(function (x) { currentIds[x.id] = true; });
    var outcomeQueue = history.filter(function (x) {
      return !currentIds[x.id] && Date.now() > x.start + 4 * 3600000 && x.candidates && x.candidates.some(function (candidate) {
        return candidate.features && !seen[x.id + '|' + String(candidate.channel).toLowerCase()];
      });
    });
    var outcomeHeading = document.createElement('h3'); outcomeHeading.textContent = 'Resultados de jogos anteriores para calibrar · ' + outcomeQueue.length; host.appendChild(outcomeHeading);
    if (!outcomeQueue.length) { var emptyOutcome = document.createElement('p'); emptyOutcome.className = 'forecast-empty'; emptyOutcome.textContent = 'Quando houver resultados observados, registre aqui quais canais realmente transmitiram.'; host.appendChild(emptyOutcome); }
    outcomeQueue.forEach(function (item) { host.appendChild(forecastCard(item, false, seen)); });
  }
  function forecastCard(item, needsReview, seen) {
    var card = document.createElement('article'); card.className = 'forecast-card' + (needsReview ? ' needs-review' : '');
    var top = document.createElement('div'); top.className = 'forecast-top';
    var title = document.createElement('strong'); title.textContent = item.title || 'Evento esportivo';
    var calibrated = item.model && item.model.mode === 'calibrated';
    var score = document.createElement('span'); score.className = 'confidence ' + (item.confidence >= 75 ? 'high' : 'low'); score.textContent = (calibrated ? 'Chance estimada: ' : 'Aderência dos sinais: ') + (item.confidence || 0) + '%';
    top.appendChild(title); top.appendChild(score); card.appendChild(top);
    var meta = document.createElement('p'); meta.className = 'forecast-detail'; meta.textContent = (item.competition || '') + ' · ' + new Date(item.start).toLocaleString('pt-BR'); card.appendChild(meta);
    if (item.candidates && item.candidates.length) {
      item.candidates.slice(0, 3).forEach(function (candidate, index) {
        var line = document.createElement('div'); line.className = 'candidate';
        var label = document.createElement('span'); label.textContent = (index + 1) + '. ' + candidate.channel + ' — ' + (calibrated ? 'chance ' : 'sinais ') + candidate.score + '%'; line.appendChild(label);
        var reason = document.createElement('small'); reason.textContent = candidate.reasons.join(' · '); line.appendChild(reason); card.appendChild(line);
      });
    } else { var noMatch = document.createElement('p'); noMatch.className = 'forecast-detail'; noMatch.textContent = 'Sem correspondência no EPG. Escolha manualmente se souber a emissora.'; card.appendChild(noMatch); }
    var note = document.createElement('p'); note.className = 'estimate-note'; note.textContent = 'Estimativa baseada nos dados disponíveis; não é garantia de transmissão.'; card.appendChild(note);
    if (needsReview) {
      var actions = document.createElement('div'); actions.className = 'review-actions';
      var select = document.createElement('select'); select.setAttribute('aria-label', 'Canal a confirmar');
      var first = document.createElement('option'); first.value = ''; first.textContent = 'Escolha o canal correto'; select.appendChild(first);
      (item.candidates || []).forEach(function (candidate) { var option = document.createElement('option'); option.value = candidate.channel; option.textContent = candidate.channel + ' (' + candidate.score + '%)'; select.appendChild(option); });
      var custom = document.createElement('input'); custom.placeholder = 'Ou digite o nome da emissora';
      var confirm = document.createElement('button'); confirm.textContent = 'Confirmar canal'; confirm.onclick = function () {
        var channel = custom.value.trim() || select.value;
        if (!channel) { message('Escolha ou digite uma emissora antes de confirmar.', true); return; }
        postJson('/api/review', {id: item.id, action: 'confirm', channel: channel}).then(function () { message('Emissora confirmada e adicionada ao catálogo local.'); loadForecast(); load(); }).catch(function (e) { message('Não consegui salvar a revisão: ' + e.message, true); });
      };
      var dismiss = document.createElement('button'); dismiss.className = 'secondary'; dismiss.textContent = 'Sem canal confirmado'; dismiss.onclick = function () {
        postJson('/api/review', {id: item.id, action: 'dismiss'}).then(function () { message('Jogo marcado como sem canal confirmado.'); loadForecast(); }).catch(function (e) { message('Não consegui salvar: ' + e.message, true); });
      };
      actions.appendChild(select); actions.appendChild(custom); actions.appendChild(confirm); actions.appendChild(dismiss); card.appendChild(actions);
    } else if (item.status === 'manual-confirmed') {
      var manual = document.createElement('div'); manual.className = 'badge manual-badge'; manual.textContent = 'Confirmado manualmente: ' + item.reviewed.channel; card.appendChild(manual);
    } else if (item.candidates && item.candidates[0]) {
      var auto = document.createElement('div'); auto.className = 'badge auto-badge'; auto.textContent = 'Previsão automática: ' + item.candidates[0].channel; card.appendChild(auto);
    }
    if (item.start && Date.now() > item.start + 4 * 3600000 && item.candidates && item.candidates.some(function (x) { return x.features; })) {
      var outcome = document.createElement('div'); outcome.className = 'outcome-tools';
      var outcomeTitle = document.createElement('small'); outcomeTitle.textContent = 'Depois de conferir o resultado real, ajude a calibrar o modelo:'; outcome.appendChild(outcomeTitle);
        item.candidates.forEach(function (candidate) {
        if (!candidate.features || seen[item.id + '|' + String(candidate.channel).toLowerCase()]) return;
        var outcomeRow = document.createElement('div'); outcomeRow.className = 'outcome-row';
        var channelName = document.createElement('span'); channelName.textContent = candidate.channel; outcomeRow.appendChild(channelName);
        [[1, 'Transmitiu'], [0, 'Não transmitiu']].forEach(function (choice) {
          var button = document.createElement('button'); button.className = 'secondary'; button.textContent = choice[1];
          button.onclick = function () {
            postJson('/api/outcome', {id: item.id, channel: candidate.channel, label: choice[0]}).then(function (result) {
              message(result.model.mode === 'calibrated' ? 'Resultado salvo. O modelo já passou pela validação com jogos separados.' : 'Resultado salvo para treinar e medir o algoritmo; ainda falta uma amostra maior.');
              runForecast();
            }).catch(function (e) { message('Não consegui registrar o resultado: ' + e.message, true); });
          };
          outcomeRow.appendChild(button);
        });
        outcome.appendChild(outcomeRow);
      });
      card.appendChild(outcome);
    }
    return card;
  }
  function runForecast() {
    $('refresh').disabled = true;
    postJson('/api/forecast/run', {force: true}).then(function () { message('Análise iniciada. A Central vai avisar quando terminar.'); loadForecast(); }).catch(function (e) { message('Não consegui iniciar a análise: ' + e.message, true); }).finally(function () { $('refresh').disabled = false; });
  }
  $('threshold').addEventListener('change', function () {
    postJson('/api/settings', {threshold: Number($('threshold').value)}).then(function () { runForecast(); }).catch(function (e) { message('Não consegui guardar o limite: ' + e.message, true); });
  });
  $('refresh').addEventListener('click', function () { load(); runForecast(); });
  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  load();
  loadForecast();
})();
