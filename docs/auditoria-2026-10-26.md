# Home IPTV — auditoria e plano de interface

26/10/2026 · Etapas 1 e 2 (auditoria e proposta de UI/UX). Nenhum código foi alterado nesta etapa.

## 1. Resumo

- O launcher tem hoje **dois caminhos de TV**: o player interno do launcher (`web/iptv.js`, com a lista própria
  `iptv-brasil.m3u`) e o **Player IPTV** (`iptv-player/`, com as listas e a conta Xtream do usuário). É a principal
  duplicidade a eliminar.
- O "aprisionamento em um canal" tem causa concreta: o card abre o canal no Player IPTV como um **vídeo avulso**
  (o link do stream), fora da lista de canais do player. Dentro dele não há canal acima/abaixo, guia nem lista:
  só tocar e voltar.
- **Limite técnico mais importante:** apps de TV não leem o armazenamento uns dos outros. Listas, favoritos,
  categorias e programação vivem dentro do Player IPTV; o launcher só consegue *abrir* o player num lugar
  (deep link) e receber de volta um relatório na volta. Por isso **Ao vivo, Esportes e Favoritos de canais devem
  morar no Player IPTV**, com o launcher levando direto até lá.
- Recuperável no Git sem esforço: **23 idiomas** que foram apagados (sobraram só pt e en) e a versão **Samsung
  (Tizen)** do launcher web.

## 2. Como o launcher está hoje

| Parte | Arquivo | Linhas | Função |
|---|---|---|---|
| Tela | `web/home.js` | 2.739 | Abas (TV aberta, Filmes, Séries), cards, prateleira, gaveta, Ajustes, páginas de detalhe, episódios, Trakt, protetor de tela, teclas, mouse |
| Estilo | `web/home.css` | 1.242 | Todo o visual |
| Dados | `web/data.js` | 721 | TMDB, OMDb, clima, progresso, preferências (`Prefs`) |
| TV | `web/tv.js` | 559 | Apps instalados, entradas HDMI, antena (SSAP e `utp.broadcast`), abrir apps |
| Trakt | `web/trakt.js` | 408 | Conta, histórico, Minha lista |
| Player interno | `web/iptv.js` | 355 | Lista M3U própria + player em tela cheia |
| Filmes Xtream | `web/vod.js` | 139 | Catálogo VOD da conta Xtream (configurada no launcher) |
| QR | `web/qr.js` | 262 | QR code do Trakt |
| Player IPTV | `iptv-player/` (TypeScript) | 174 arquivos | Listas, canais ao vivo, guia (EPG), filmes, séries, busca, favoritos, controle dos pais |

Fluxos de TV hoje:

| Ação | Caminho | Problema |
|---|---|---|
| OK no card IPTV | Player IPTV com o **link do stream** | Vídeo avulso: sem trocar de canal |
| Player IPTV não abre | `web/iptv.js` (player interno) | Segundo player, outra lista |
| Todos os canais | Player IPTV (tela de canais) | Ok; reserva: lista interna |
| Gaveta › IPTV | Player IPTV | Ok; reserva: lista interna |
| OK no card da antena | Tela cheia de antena no launcher | Ok |
| Filme/episódio | Player IPTV (deep link, abre direto) | Ok desde a última rodada |

## 3. Limites reais da TV (verificados nos testes desta semana)

| Fato | Consequência no projeto |
|---|---|
| A TV mostra **uma imagem por vez**: antena + internet juntas deixam a antena preta; dois streams pausam um ao outro | Só o card em foco toca (já implementado) |
| A antena toca **dentro do launcher** (`<video>` de broadcast) | Tela cheia de antena sem abrir o app da LG |
| A troca de canal funciona pelo serviço **`utp.broadcast/changeChannel`** (não documentado) usando a sessão do próprio vídeo | Sem abrir a TV ao vivo da LG; pode mudar numa atualização da LG |
| `tv/openChannel` abre a TV ao vivo da LG e ela **segura a antena** | Não usar mais para trocar canal |
| O launcher **não pode fechar** outros apps nem listar os que estão abertos | Sem "voltar automático" forçado |
| A lista de canais de antena vem do serviço SSAP, que às vezes cai; canais sem sinal somem da lista | Estado "sem sinal" precisa ser mostrado |
| Apps não compartilham armazenamento | O launcher não vê as listas, favoritos e categorias do player |

## 4. Duplicidades: remover, manter, unificar

| Item | Decisão proposta | Motivo |
|---|---|---|
| `web/iptv.js` (player interno + lista) | **Remover o player**; manter só a leitura da lista se ainda servir aos cards | Segundo player, segunda lista |
| `web/iptv-brasil.m3u` (11 canais) | **Substituir** pela lista do usuário via Player IPTV (ver seção 6) | Os cards mostram canais que não estão no player |
| Abrir canal por link avulso | **Trocar** por "abrir o canal dentro da lista do player" (por nome/id), link avulso só como reserva | Resolve o aprisionamento |
| `web/vod.js` + `iptv_server/user/pass` no launcher | **Avaliar**: a conta Xtream fica configurada nos dois lugares | Duas configurações da mesma conta |
| Filmes e Séries (TMDB) no launcher | **Manter** | Descoberta e páginas de detalhe; reprodução já vai ao player |
| Tela cheia de antena | **Manter** | Única forma de ver antena sem o app da LG |

## 5. Removido no histórico e recuperável

| O quê | Commit | Recuperar? |
|---|---|---|
| 23 idiomas (es, fr, de, it, ja, ko, zh-CN, ru, …) | `8ceafe6` (`app/assets/i18n/`) | Sim, começando por **es** (os textos novos precisam de tradução) |
| Samsung Tizen (`tizen/`) | `8ceafe6` | Depois; o web é compartilhado, mas precisa de teste num Samsung |
| Android/Google TV (`app/`, Kotlin) | `8ceafe6` | Não agora: é outro código |
| Site, ferramentas de arte | `8ceafe6` | Não |
| Testes e2e, benchmarks e docs do Player IPTV | `ed4dcd2` | Os testes unitários sim (já parcialmente restaurados) |

## 6. Arquitetura proposta

- **Launcher = porta de entrada.** Home, apps, Filmes/Séries (descoberta), Ajustes do launcher, antena.
- **Player IPTV = núcleo da TV.** Toda reprodução de IPTV, lista de canais, guia, favoritos, esportes, filmes e séries.
- **Um só caminho de ida e volta** entre os dois:
  - ida: deep link com destino (`channel` por nome/id da lista do player, `section: live | sports | favorites`, filme, episódio);
  - volta: o player reabre o launcher com o relatório (progresso, último canal).
- **Último canal / continuar assistindo na Home:** o player inclui o último canal no relatório da volta; o launcher
  guarda e mostra no card.
- **Cards da Home sem a lista própria do launcher:** o card IPTV passa a ser "último canal assistido no player"
  (com reserva no canal escolhido nos Ajustes).

## 7. Proposta de interface

**Abas (sempre no mesmo lugar, foco muito visível, texto grande):**

| Aba | Conteúdo | Onde vive |
|---|---|---|
| Início | Card grande (antena ou último canal), card pequeno, Continuar assistindo, apps | Launcher |
| Ao vivo | Lista de canais com guia | Player IPTV (o launcher abre direto) |
| Esportes | Filtros: Todos, Futebol, Basquete, Tênis, Vôlei, Automobilismo, Outros | Player IPTV (categoria nova, por palavras-chave) |
| Filmes / Séries | Como hoje | Launcher (reprodução no player) |
| Favoritos | Canais favoritos | Player IPTV |
| Ajustes | Como hoje | Launcher |

**Acessibilidade (para a sua mãe):**
- Texto mínimo de 28 px nos itens, 36 px nos títulos; contraste alto nos dois temas.
- No máximo 2 passos do Início até assistir qualquer coisa.
- O foco nunca some; uma só região com foco por vez.

**Botão Voltar (regra única):** fecha o que está por cima (menu, página, player) e volta ao lugar de onde veio,
com o foco no mesmo item; no Início, não faz nada além do padrão da LG.

**Esportes por palavras-chave (no player):** futebol/brasileirão/premiere/sportv → Futebol; nba → Basquete;
f1/fórmula → Automobilismo; etc. Correção manual de categoria por canal.

## 8. Etapas de implementação

| # | Etapa | Arquivos principais |
|---|---|---|
| 0 | Marco de segurança (`git tag antes-da-reorganizacao`) | — |
| 1 | Abrir canal **dentro da lista** do player (não avulso) | `iptv-player/src/app.ts`, `services/deep-link.ts` |
| 2 | Deep link para seções (`live`, `sports`, `favorites`) | `iptv-player/src/app.ts`, `web/home.js` |
| 3 | Retirar o player interno do launcher | `web/iptv.js`, `web/home.js`, `web/index.html` |
| 4 | Último canal na volta do player e no card | `iptv-player/src/services/launcher-report.ts`, `web/home.js` |
| 5 | Categoria Esportes no player | `iptv-player/src/services/playlist-service.ts`, componentes da lista |
| 6 | Nova barra de abas e ajustes de acessibilidade | `web/home.js`, `web/home.css` |
| 7 | Espanhol de volta (depois os demais) | `assets/i18n/es.json`, `iptv-player/src/i18n/` |

## 9. Testes de aceitação

- Do Início, abrir um canal IPTV e trocar para o próximo/anterior **sem sair do player**.
- Voltar do player cai no Início com o foco no card de onde saiu, mostrando o último canal.
- Esportes › Futebol lista só canais de futebol das listas configuradas; sem canais, mostra aviso.
- Antena: escolher canal nos Ajustes, o card troca sem abrir o app da LG; canal sem sinal mostra aviso.
- Nenhum caminho abre o player interno antigo nem a TV ao vivo da LG por engano.
- Filmes e episódios abrem direto no player (≤ 5 s com conta configurada).
- Tudo com controle remoto e com o Magic Remote; Voltar previsível em todas as telas.
- `tools/check.sh` e os testes do Player IPTV passam.

## 10. Decisões para aprovar

1. **Ao vivo, Esportes e Favoritos dentro do Player IPTV** (o launcher só leva até lá)?
2. **Remover o player interno** (`web/iptv.js`) e a lista própria `iptv-brasil.m3u`?
3. **Conta Xtream só no Player IPTV** (tirar `iptv_server/user/pass` do launcher)?
4. **Idiomas:** recuperar só o espanhol agora, ou todos os 23?
5. **Samsung:** fica para depois?
