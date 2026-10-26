# Roadmap — LG TV Launcher

26/10/2026 · Segue a auditoria (`docs/auditoria-2026-10-26.md`).

## Decisões tomadas

| # | Decisão |
|---|---|
| 1 | A aba **Esportes fica na Home do launcher**. A interface é desenhada e aprovada antes de programar. |
| 2 | O **player interno do launcher sai**. Toda reprodução de IPTV vai para o Player IPTV. |
| 3 | **Todos os idiomas** voltam (25 no launcher; o Player IPTV vai de 11 para os mesmos 25). |
| 4 | **Samsung (Tizen)** entra no roadmap. |
| 5 | **A conta IPTV fica num lugar só: o Player IPTV** (onde já está configurada, pela TV). O launcher deixa de ter lista própria (`iptv_m3u`, `iptv_server`, `iptv_user`, `iptv_pass` saem do `config.properties`, e a lista embutida `iptv-brasil.m3u` também). O launcher recebe a conta do player (ver fase 1, item 6). *Proposta, aguardando aprovação.* |

## Visão geral

| Fase | Nome | Depende de | Tamanho |
|---|---|---|---|
| 0 | Marco de segurança | — | Pequeno |
| 1 | TV unificada no Player IPTV | 0 | Médio |
| 2 | Desenho da interface (Home com abas, Esportes) | 0 | Médio |
| 3 | Aba Esportes | 1, 2 | Grande |
| 4 | Acessibilidade e Home (último canal, continuar assistindo) | 2 | Médio |
| 5 | Todos os idiomas | 3, 4 (para traduzir os textos novos de uma vez) | Grande |
| 6 | Samsung (Tizen) | 1 a 5 | Grande |
| 7 | Testes e estabilidade | contínua; fechamento no fim | Médio |

As fases 1 e 2 podem andar em paralelo: uma é código, a outra é desenho.

---

## Fase 0 — Marco de segurança

- `git tag antes-da-reorganizacao` e envio da tag ao GitHub.
- **Pronto quando:** a tag existe no GitHub e dá para voltar a ela com um comando.

## Fase 1 — TV unificada no Player IPTV

**Objetivo:** um só player de IPTV, e o usuário nunca fica preso num canal.

1. **Separar `web/iptv.js` em dois:**
   - o carregador da lista (M3U/Xtream ao vivo, categorias) fica, num módulo de canais (`web/channels.js`);
   - o player e a grade de canais em tela cheia saem.
2. **Abrir o canal dentro da lista do player** (por nome/id), com o link avulso só como reserva. Assim canal
   acima/abaixo, guia e lista funcionam a partir do card. (`iptv-player/src/app.ts`, `services/deep-link.ts`)
3. **Deep link para seções do player:** `live`, `favorites` (e `sports`, se a fase 3 usar a categoria do player).
4. **Tirar todas as reservas que abriam o player interno** (card, Todos os canais, gaveta › IPTV). Sem o Player IPTV
   na TV: uma mensagem dizendo para instalar.
5. **Limpar a configuração:** os textos e comentários sobre "tocar dentro do launcher" em `config.example.properties`,
   `README.md` e `CLAUDE.md`.
6. **Uma conta só, a do Player IPTV.** Os apps não leem os dados um do outro, e o launcher não tem permissão para
   chamar o serviço do player (testado: "Denied"). O caminho que funciona é o que já levamos o progresso dos episódios:
   - toda vez que o player volta ao launcher, ele manda junto a conta em uso (servidor, usuário, senha), e o launcher
     guarda no armazenamento dele na TV;
   - sem conta ainda (primeira vez): o launcher abre o player um instante para pedir a conta, e o player volta sozinho
     com ela; nos Ajustes, "Lista IPTV › Atualizar do Player IPTV" faz o mesmo;
   - trocou de conta no player: o launcher recebe a nova na próxima volta.
   - A conta trafega só dentro da TV (entre os dois apps), nunca é mostrada na tela nem vai para o computador.

**Pronto também quando:** `config.properties` não tem mais campos de IPTV, e os cards, Todos os canais e Esportes
usam a conta configurada no Player IPTV.

**Pronto quando:**
- nenhum caminho abre o player interno (o código dele não existe mais);
- do card, o canal abre no Player IPTV e o canal +/− funciona;
- Voltar no player retorna ao card de onde saiu.

## Fase 2 — Desenho da interface

**Objetivo:** aprovar o visual e a navegação antes de programar a Esportes.

1. **Barra de abas da Home:** Início (hoje "TV aberta"), Esportes, Filmes, Séries, e talvez Favoritos. A ordem e os
   nomes são decididos aqui.
2. **Tela Esportes:** filtros de modalidade no topo (Todos, Futebol, Basquete, Tênis, Vôlei, Automobilismo, Lutas,
   Outros), grade de canais com logo, nome e "agora" (quando a lista tem guia), e um estado vazio por modalidade.
3. **Regras de acessibilidade:** tamanhos mínimos de texto, contraste nos dois temas, foco, no máximo 2 passos até
   assistir.
4. **Regra única do Voltar** para todas as telas.
5. **Entrega:** uma prévia navegável no navegador (o preview do launcher) com dados de exemplo marcados como
   exemplo, e capturas para aprovação.

**Pronto quando:** você aprova a prévia.

## Fase 3 — Aba Esportes

**Objetivo:** a aba aprovada na fase 2, com os canais reais da lista do launcher.

1. **Classificação por palavras-chave** (nome do canal e categoria da lista): futebol/premiere/sportv/espn/
   brasileirão → Futebol; nba → Basquete; f1/fórmula/stock car → Automobilismo; ufc/boxe → Lutas; e assim por diante.
   A tabela de palavras fica em um arquivo, fácil de ajustar.
2. **Correção manual:** nos Ajustes, mover um canal para outra modalidade, ou escondê-lo.
3. **Agora no ar:** quando a lista Xtream tem guia (EPG), mostrar o programa atual.
4. **OK no canal:** abre no Player IPTV, já dentro da lista (fase 1).
5. **Busca** por nome dentro de Esportes (teclado da TV), se aprovada na fase 2.
6. **Testes:** a classificação com nomes reais (incluindo acentos, "HD", "FHD") roda no `tools/check.sh`.

**Pronto quando:** Futebol mostra só canais de futebol da lista configurada, uma modalidade sem canais mostra o aviso
e o OK abre o canal no player.

## Fase 4 — Acessibilidade e Home

1. Aplicar as regras de tamanho e contraste da fase 2 em todas as telas.
2. **Último canal:** o Player IPTV devolve o último canal assistido na volta, e a Home mostra esse canal no card.
3. **Continuar assistindo:** uma fileira com filmes e episódios em andamento (o progresso já existe).
4. Revisão do foco: uma só região com foco por vez; o foco nunca some.

## Fase 5 — Todos os idiomas

1. **Launcher:** recuperar os 23 catálogos apagados no commit `8ceafe6` (`app/assets/i18n/`) para `assets/i18n/`,
   ligar a lista de idiomas e traduzir os textos criados depois (Trakt, Esportes, cards, episódios…).
2. **Player IPTV:** criar os 14 idiomas que faltam (cs, da, el, fi, hi, id, ja, ko, nb, nl, ro, sv, th, vi).
3. O `tools/check.sh` já falha quando falta uma tradução: vale para todos os idiomas.

**Pronto quando:** trocar o idioma nos Ajustes muda o launcher e o Player IPTV, sem texto faltando.

## Fase 6 — Samsung (Tizen)

1. Recuperar `tizen/` (build, install, config) do commit `8ceafe6`.
2. **Camada de TV por plataforma:** `web/tv.js` hoje é só LG. Separar o que é LG (Luna, SSAP, `utp.broadcast`) do que
   a Samsung oferece, mantendo a mesma interface para a Home.
3. **IPTV na Samsung:** o Player IPTV é só webOS. Decidir entre um player próprio na Samsung, outro app IPTV de
   Tizen, ou reprodução dentro do launcher só lá.
4. Antena, apps instalados, entradas HDMI: verificar o que o Tizen permite.

**Precisa:** uma TV Samsung com modo desenvolvedor para testar.

## Fase 7 — Testes e estabilidade

- **Lista de aceitação** (ver a auditoria, seção 9), testada na TV a cada fase.
- **TVs antigas:** o webOS 3 e 4 continuam como alvo (ES5, sem CSS moderno).
- **Recuperação após falhas:** lista fora do ar, sem internet, Player IPTV não instalado, antena sem sinal.
- **Desempenho:** tempo para abrir o launcher e para começar um canal ou episódio.

---

## Em aberto

| Item | Quando decidir |
|---|---|
| Ordem e nomes das abas; se Favoritos vira aba | Fase 2 |
| Busca dentro de Esportes | Fase 2 |
| Player para IPTV na Samsung | Fase 6 |
| O serviço `utp.broadcast` (troca de canal da antena) não é documentado pela LG e pode mudar numa atualização | Acompanhar na fase 7 |
