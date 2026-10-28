# Refatoração do `web/home.js` — mapa e plano

28/10/2026 · Base: `main` em `ae43888` (2.791 linhas, 155 funções, 84 variáveis no topo do arquivo).
Nada foi alterado ainda: este documento espera aprovação antes do passo 1.

Observação sobre as camadas pedidas: o projeto não tem banco, Supabase nem Stripe. A camada "dados e serviços
externos" aqui é o que fala com a TV (Luna/SSAP), com o Player IPTV (deep link e launch params), com TMDB/OMDb/
Trakt/ESPN (pela `Data`, `Trakt`, `Channels`) e com o `localStorage` (`Prefs`). Esses módulos **já estão fora** do
`home.js` (`web/data.js`, `web/tv.js`, `web/trakt.js`, `web/channels.js`); dentro dele fica a "cola" que os chama.

## Situação: concluído (29/10/2026)

Os 20 passos foram feitos, um commit cada (`b19316f` a passo 20). O `web/home.js` saiu de um arquivo de 3.260
linhas para 19 partes em `web/home/`, por camada (base, regras, dados, telas, estado, navegação, início); o
`web/home.css`, para 10 fatias em `web/style/`. A prova:
- passos 1 a 3 e 20: o arquivo montado é idêntico byte a byte ao de antes;
- passos 4 a 19: `tools/same_home.py` contra o arquivo de antes da refatoração (`b667f66`): as mesmas 180 funções,
  letra por letra, e todo o resto na mesma ordem;
- `tools/home_test.py` (11 roteiros, 70 passos) igual em todos os passos; conferido na TV nos passos 4, 7, 12, 16,
  18, 19 e 20.

Desvios do plano: `Z` e `st` ficaram em `50-state.js` (subi-los muda a ordem do código); Esportes ganhou parte própria
(`33-ui-sports.js`); o CSS foi para `web/style/` em vez de `web/home/*.css`.

## 1. Mapa e classificação

Legenda: **UI** = desenha, posiciona, recebe tecla/mouse · **Regra** = calcula ou decide, sem tocar a tela ·
**Dados** = chama TV, Player IPTV, rede ou armazenamento.

| Trecho (linhas) | Funções | Camada |
|---|---|---|
| Utilitários de DOM (15–67) | `el`, `sym`, `hasClass`, `setClass`, `fit` | UI (base) |
| Prateleira: chaves e cores (68–97) | `shelfKey`, `darken`, `wordFit` | Regra (`darken`), UI (`wordFit`) |
| Logos (98–276) | `luminance`, `rgbOf`, `lift`, `colorful` | Regra (cor) |
| | `unseen`, `paint`, `showLogo`, `face` | UI |
| | `fullOrder`, `pickShelf` | Regra (ordem da prateleira) |
| Foco (277–343) | `sheetOpen`, `nearest`, `centerX` | Regra / UI |
| | `updateFocus`, `focusRows` | UI (central: toca em todas as telas) |
| Topo (344–379) | `renderTop` | UI |
| TV aberta (380–630) | `channelName`, `channelColors`, `cardPicks`, `plainName`, `liveCards`, `liveRect`, `noChannelsText`, `pickLabel` | Regra |
| | `iptvCards`, `loadChannels`, `tuneAntenna`, `learnAntenna`, `askForLists`, `openAllChannels`, `noPlayer` | Dados |
| | `drawAllChannels`, `showAntennaChannel`, `fillFoot`, `renderLive`, `channelMark` | UI |
| Player dos cards (631–754) | `sourceFor` | Regra |
| | `makeVideo`, `stopSlot`, `stopPlayer`, `placePlayer`, `startSlot` | UI (vídeo) |
| | `renderCards` | UI (troca TV aberta / catálogo) |
| Filmes e Séries (755–929) | `catalogRows`, `focusedItem` | Regra |
| | `renderCatalog` | Dados + UI |
| | `drawCatalog`, `placeCatalog`, `showHero` | UI |
| | `openTitle` | Dados (Player IPTV / app de streaming) |
| Páginas de detalhe (930–1196) | `detailRows`, `initials`, `longDate`, `department` | Regra |
| | `openDetail` | Dados + UI |
| | `detailBack`, `closeDetails`, `renderDetail` (106 linhas), `placeDetail`, `detailMove`, `detailActivate` | UI |
| Séries e episódios (1197–1404) | `episodeStates`, `nextEpisode`, `seasonDone` | Regra |
| | `watchEpisode`, `takeLaunchParams` | Dados |
| | `openEpisodes`, `renderEpisodes`, `placeEpisodes`, `episodesActivate` | UI |
| Fundo e relógio (1405–1443) | `backdrop`, `renderClock`, `tickClock` | UI |
| Prateleira (1444–1508) | `renderShelf`, `placeTiles`, `revealShelf` | UI |
| Gaveta (1509–1600) | `renderDrawer`, `renderPanels`, `renderWeather`, `openDrawer`, `closeDrawer` | UI |
| Todos os apps (1601–1645) | `renderApps`, `openApps`, `closeSheets` | UI |
| Ajustes (1646–1810) | `liveWanted`, `settingRows`, `accessRows`, `cycle`, `restoreDefaults` | Regra (linhas e valores) + Dados (`Prefs.set`) |
| | `applyAccess`, `settingsBack`, `renderSettings`, `openSettings` | UI |
| Trakt (1811–1921) | `traktStatus` | Regra |
| | `startTrakt` | Dados |
| | `openTrakt`, `closeTrakt`, `renderTrakt` (70 linhas) | UI |
| Seletor (1922–2028) | `languageChoices`, `pickedLanguage`, `pickLabel` | Regra |
| | `openLanguages`, `pickChannel` | Dados + UI |
| | `openPicker`, `renderPicker`, `closePicker` | UI |
| Editor da prateleira (2029–2269) | `editIndex`, `editMenuItems`, `moveHeld`, `dropHeld`, `cancelHeld`, `saveEdit` | Regra |
| | os outros 11 (`renderShelfEdit`, `placeEdit`, `editPointer`, `stagePoint`…) | UI |
| Abrir coisas (2270–2333) | `iptvApp`, `openInIptv`, `launcher`, `tvSettings`, `openLiveCard` | Dados |
| Antena em tela cheia (2334–2365) | `showAntenna`, `hideAntenna` | UI (vídeo) |
| Navegação (2366–2563) | `activate`, `selectTab`, `move` (82 linhas), `back`, `hover` | UI (central: decide por zona) |
| Aviso, noite, proteção de tela (2564–2672) | `toast`, `checkNight`, `saverPhotos`, `showSaver`, `tickSaverClock`, `hideSaver`, `poke` | UI (+ Regra em `saverPhotos`) |
| Roda do mouse (2673–2689) | `wheel` | UI |
| Início (2690–2791) | `renderAll`, `hidden`, `loadApps`, `reset`, `reopened` + escutadores e `setInterval` | Dados + UI |

Resumo: cerca de **95 funções de UI**, **40 de regra** e **20 de dados/serviços**.

## 2. O que dificulta a separação

**Estado compartilhado (variáveis no topo, todas dentro de um único `(function () { … })()`):**

| Variável | Usada por | Papel |
|---|---|---|
| `st` | 55 funções | zona do foco, aba, item em foco de cada tela |
| `Z` | 40 | nomes das zonas |
| `player` | 26 | vídeos dos cards |
| `shelf`, `apps`, `others`, `inputs` | 24 / 20 / 11 / 6 | apps da TV |
| `antenna` | 23 | antena em tela cheia |
| `edit` | 21 | editor da prateleira |
| `cards` | 18 | cards da TV aberta |
| `pages` | 16 | pilha de páginas de detalhe |
| `catalog`, `liveChannels`, `rowsNow`, `picker`, `saverOn`… | 5 a 10 cada | uma tela cada |

(A contagem procura o nome no corpo de cada função; algumas palavras comuns, como `player` e `antenna`, aparecem
também em comentários, então os números são aproximados.)

**Funções-central, que conhecem todas as telas:** `updateFocus`, `activate`, `move`, `back` e `hover` têm um
`switch`/`if` por zona. Cada tela nova precisa mexer nelas: é daí que vem o "mexo aqui, quebra ali".

**Código que roda ao carregar (a ordem importa):** 12 escutadores (`keydown`, `mousemove` ×3, `mouseup`, `wheel`,
`resize`, `webOSRelaunch`, `visibilitychange`, cliques fora dos Ajustes), `Trakt.onChange`, `Data.onChange`,
`TV.holdScreenSaver`, um `setInterval` e a inicialização no fim.

**Nomes públicos que não podem mudar:** `window.FreeMyTV` (`state`, `move`, `activate`, `back`, `showSaver`,
`hideSaver`, `toast`), usado pela prévia e pelos testes; as chaves `fmtv.*` do `localStorage`; os `id` do
`index.html`; os parâmetros de deep link com o Player IPTV.

**Duplicação:**
- normalizar nome de canal: `plainName` (`home.js`), `plain` (`channels.js`) e `normalizeChannelName` (Player);
- abrir/fechar folhas (`open*`/`close*`) repetem o mesmo trecho de `setClass(…, 'open', …)` + zona + foco;
- `iptvApp()`/`openInIptv()`/`launcher()` com tratamento de erro parecido em vários pontos.

**Teste que depende do arquivo:** `tools/test_channel_names.js` lê `web/home.js` e extrai `channelName` e
`plainName` por expressão regular.

## 3. Nova estrutura (no padrão do projeto: ES5, sem módulos, sem biblioteca)

O `home.js` é um fechamento só: todas as funções enxergam as mesmas variáveis. Trocar isso por módulos de verdade
mexeria em comportamento. O caminho seguro é **partir o arquivo em vários e o `webos/build.py` juntá-los de novo,
na ordem, dentro do mesmo fechamento** — o app instalado continua recebendo um `home.js` igual em comportamento.

```
web/home/                       (fontes; o build gera web/home.js a partir daqui, na ordem do _order.txt)
  _order.txt                    a ordem de junção
  00-base.js        UI base     el, sym, setClass, fit, Z, st (o estado compartilhado fica num lugar só)
  10-rules-shelf.js Regra       cores, logos, ordem da prateleira
  11-rules-live.js  Regra       channelName, plainName, cardPicks, liveCards, sourceFor, pickLabel…
  12-rules-titles.js Regra      catalogRows, detailRows, episodeStates, nextEpisode, seasonDone…
  13-rules-settings.js Regra    settingRows, accessRows, editMenuItems…
  20-data-iptv.js   Dados       iptvApp, openInIptv, iptvCards, loadChannels, askForLists, takeLaunchParams…
  21-data-tv.js     Dados       loadApps, tuneAntenna, learnAntenna, launcher, tvSettings…
  30-ui-focus.js    UI          updateFocus, focusRows, nearest, centerX
  31-ui-top.js      UI          renderTop, relógio, fundo
  32-ui-live.js     UI          cards, vídeos dos cards, antena em tela cheia
  33-ui-catalog.js  UI          Filmes e Séries
  34-ui-detail.js   UI          páginas de detalhe e episódios
  35-ui-shelf.js    UI          prateleira, gaveta, todos os apps
  36-ui-settings.js UI          Ajustes, Acessibilidade, Trakt, seletor
  37-ui-shelfedit.js UI         editor da prateleira
  38-ui-saver.js    UI          aviso, noite, proteção de tela
  80-input.js       UI          activate, move, back, hover, teclas, roda
  90-start.js       Início      escutadores e inicialização (por último, como hoje)
web/home.css → web/style/*.css  (fatias seguidas, na ordem: no CSS a regra de depois vence)
```

O que muda fora de `web/`: `webos/build.py` e `tools/webapp.py` (juntar `web/home/*.js` na ordem), `tools/check.sh`
(as verificações de ES5 e de nomes repetidos passam a olhar o arquivo juntado) e `tools/test_channel_names.js` (lê
o arquivo juntado). O `index.html` continua carregando `home.js`.

## 4. Testes: o que existe e o que falta

**Hoje:** `tools/check.sh` verifica sintaxe ES5, traduções, nomes declarados duas vezes e a comparação de nomes de
canais. **Nenhum teste cobre o comportamento da tela** (navegação, foco, Ajustes, páginas).

**Testes de caracterização (antes do passo 1):**
- Uma página de teste (`tools/home-test/`) carrega os mesmos scripts do app com **dados fixos no lugar da rede e da
  TV** (respostas falsas de TMDB, ESPN, lista IPTV, apps da TV), relógio fixo e `localStorage` limpo.
- Ela executa roteiros de teclas pelo `window.FreeMyTV` e registra, a cada passo, uma "foto" do estado: zona, item
  em foco (texto), classes do `body`, folhas abertas, cards, linhas dos Ajustes.
- A primeira execução grava a **referência** (`tools/home-test/baseline.json`) — o comportamento de hoje, mesmo
  onde pareça errado. As seguintes comparam com ela.
- Roda com o Chrome sem interface (`--headless --dump-dom`): já existe no PC e no GitHub Actions. Nenhuma biblioteca
  nova. Entra no `tools/check.sh`.

**Roteiros cobertos (fluxos principais do arquivo):**
1. Início: zona, aba, cards (antena, canal, Todos os canais), prateleira.
2. Setas pela Home: topo ↔ cards ↔ prateleira ↔ gaveta, e voltar.
3. Abas Filmes e Séries: fileiras, foco, abrir título, abrir pessoa do elenco, Voltar até a aba.
4. Série: página, Episódios, trocar temporada, Voltar.
5. Ajustes: abrir, cada linha muda o valor; Acessibilidade (painel lateral, quatro opções, classes no `body`), Voltar.
6. Seletor do card grande (lista com antena e internet) e do pequeno (só o outro tipo).
7. Editor da prateleira: mover um app e soltar, cancelar.
8. Reabrir o launcher com página aberta (volta à Home limpa); launch params do player (lista IPTV, progresso).
9. Roda do mouse; proteção de tela e o primeiro toque que só acorda.
10. Antena em tela cheia: abrir e fechar (no navegador, o que dá para registrar).

## 5. Plano em passos pequenos

Cada passo: um pedaço só, mesmos nomes, app funcionando; ao final, `tools/check.sh` (com os testes de
caracterização) e a prévia; a cada 3 ou 4 passos, instalar na TV.

| Passo | O que move | Risco |
|---|---|---|
| 0 | Testes de caracterização e referência gravada | — |
| 1 | Infraestrutura: `web/home/` com **um arquivo só** (o `home.js` inteiro) + junção no build, check e prévia. O resultado tem de ser idêntico ao de hoje, byte a byte | Baixo |
| 2 | Separar `90-start.js` (escutadores e inicialização) no fim | Baixo |
| 3 | `00-base.js` (utilitários, `Z`, `st`) no começo | Baixo |
| 4 | Regras da TV aberta → `11-rules-live.js` | Baixo (funções sem tela) |
| 5 | Regras dos títulos → `12-rules-titles.js` | Baixo |
| 6 | Regras da prateleira e cores → `10-rules-shelf.js` | Baixo |
| 7 | Regras dos Ajustes → `13-rules-settings.js` | Médio (`settingRows` chama telas) |
| 8 | Dados: Player IPTV → `20-data-iptv.js` | Médio |
| 9 | Dados: TV → `21-data-tv.js` | Médio |
| 10–17 | Uma tela por passo: editor, proteção de tela, Ajustes, prateleira/gaveta, detalhe, catálogo, cards, topo | Médio |
| 18 | Navegação (`activate`, `move`, `back`, `hover`, teclas) → `80-input.js` | Alto (central) |
| 19 | Foco (`updateFocus`) → `30-ui-focus.js` | Alto (central) |
| 20 | `home.css` → `web/style/*.css`, em fatias seguidas (a ordem do CSS não muda) | Médio |

Depois desta refatoração (fora deste escopo, se você quiser): trocar os `switch` por zona em `activate`/`move`/
`back`/`hover`/`updateFocus` por uma tabela onde cada tela registra o que faz — isso sim reduz o "quebra ali", mas
muda a estrutura da navegação e precisa de aprovação à parte.

## 6. Possíveis problemas anotados (não corrigidos)

1. O comentário da seção "TV aberta" ainda fala em "um card grande e dois pequenos"; hoje são dois cards e o botão.
2. `openAllChannels` para os vídeos dos cards antes de saber se o Player IPTV abriu; se não abrir, os cards ficam
   parados até o próximo movimento de foco. *(a confirmar na TV)*
3. Três funções diferentes normalizam nomes de canais (`plainName`, `Channels.plain` e a do Player); podem dar
   resultados diferentes para o mesmo nome. *(a confirmar)*
4. O seletor de canal dos cards (Ajustes › Card grande) só abre depois que a lista IPTV responde; com o servidor da
   conta fora do ar, leva uns 20 segundos (o tempo limite do pedido), embora os canais da antena já estejam prontos.
   *(visto na TV no passo 12; já era assim antes da refatoração)*

## 7. Decisão antes do passo 1

O ramo Esportes (`marca-home-iptv`) mudou o `home.js` em mais de 400 linhas. Refatorar a `main` agora faz essas
linhas mudarem de arquivo, e juntar Esportes depois vira um trabalho manual grande. Opções:
- **A)** juntar Esportes à `main` primeiro e refatorar depois (recomendado);
- **B)** refatorar a `main` agora e, ao juntar Esportes, mover os trechos dela para os novos arquivos à mão;
- **C)** refatorar dentro do ramo Esportes.
