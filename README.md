# LG TV Launcher

Uma tela inicial para TVs LG (webOS), com TV aberta ao vivo, filmes e séries dos seus apps e todos os apps da TV
numa barra só. Feita a partir do [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT), só com o que serve
à LG.

## O que tem

- **TV aberta:** um card grande e um pequeno, mais o atalho para todos os canais. Nas configurações, escolha qualquer
  canal para o card grande; o pequeno mostra um canal da outra fonte (antena ou IPTV). Toca o card em foco (de início, o
  grande); o outro mostra o logo e o programa, porque a TV mostra uma imagem por vez. OK no card da antena abre a imagem em tela cheia dentro do launcher;
  OK no card IPTV abre o canal no Player IPTV.
- **Filmes e Séries:** como na Netflix: o título em foco grande no topo e fileiras (em alta, por app, lançamentos,
  mais bem avaliados, gêneros), só dos apps que você tem na TV (TMDB). Só carrega quando você abre a aba.
- **Página de cada filme e série:** cartaz, nota (do IMDb também, com a chave grátis do OMDb), sinopse, direção,
  **Assistir**, o elenco em fotos redondas e os filmes semelhantes. OK num artista abre a página dele, com biografia e
  os filmes e séries em que aparece; cada título leva à página dele, e Voltar volta ao ponto de onde você saiu.
- **Barra de apps:** todos os apps da TV, rolando com as setas.
- **IPTV no Player IPTV:** a conta e as listas ficam só no Player IPTV (configure por lá, na TV). Ele as passa ao
  launcher, que mostra os canais no card, em Todos os canais e na gaveta (↓ na barra › IPTV); todo canal abre no
  player, já dentro da lista (canal +/− e guia funcionam), e Voltar volta ao launcher.
- **Gaveta (↓):** entradas HDMI, atalhos, clima, ajustes.
- **Ajustes do Início:** os canais de cada cartão, o som dos canais, a prateleira, o tema, a proteção de tela, o
  idioma, o clima e restaurar o padrão, cada um com uma explicação. Na **Prateleira** você pega um app (OK › Mover) e
  leva com as setas, ou segura e arrasta com o ponteiro do Magic Remote; também dá para esconder apps que não usa.
- **Claro de dia, escuro à noite**, e uma proteção de tela com as fotos das sugestões.

## Trakt.tv

Conecte sua conta do [Trakt](https://trakt.tv) em **Ajustes do Início › Trakt.tv**: a TV mostra um código, você abre
trakt.tv/activate no celular e digita. Daí em diante:

- os episódios que você viu em outros aparelhos aparecem como vistos nas séries (✓; a barra roxa continua vindo só do
  Player IPTV, que é quem sabe onde você parou), e o botão da série vai para o episódio certo;
- cada episódio ou filme que o Player IPTV **termina** entra no seu histórico do Trakt (abrir ou parar no meio não
  conta), sem duplicar, e o que não deu para enviar sem internet vai depois;
- **Minha lista** (a watchlist do Trakt) aparece no alto de Filmes e Séries, e cada página tem o botão de pôr e tirar.

Para ligar, crie um app seu no Trakt (uma vez só):

1. Entre na sua conta em [trakt.tv](https://trakt.tv) e abra o painel de desenvolvedor,
   [developer.trakt.tv](https://developer.trakt.tv), em **My Apps**.
2. O Trakt exige uma **conta do GitHub verificada**: conecte a sua no painel de desenvolvedor (uma vez só).
3. Crie um app novo: **App name** (por exemplo, "Launcher da minha TV"), **App type: Development** (só você e quem você
   adicionar podem entrar, o certo para uso pessoal) e **Redirect URIs: `http://localhost`**. Deixe "Allowed origins"
   em branco.
4. Ao criar, você aceita os termos do Trakt (entre eles, seguir o repositório
   [trakt/trakt-api](https://github.com/trakt/trakt-api) no GitHub para receber os avisos da API).
5. Na página do app, copie o **Client ID** e cole em `trakt_client_id=` no `config.properties`. O **Client Secret não
   é usado**: o login pela TV não precisa dele, e o Trakt pede para nunca pô-lo num app.
6. Gere e instale de novo (`python3 webos/build.py` e `python3 webos/install.py <IP>`) e, na TV, **Ajustes do Início ›
   Trakt.tv › Conectar**.

O que fica na TV: o token de acesso (vale 7 dias e é renovado sozinho), o que veio do Trakt (episódios e filmes vistos,
a lista) e a fila de envios, no armazenamento do launcher, que **não é criptografado** (o webOS não oferece um cofre a
apps do Developer Mode). **Desconectar** revoga o token no Trakt e apaga tudo isso; o histórico desta TV continua. Para
testar sem conta: `python3 tools/trakt_test_server.py` (um Trakt de teste; veja o começo do arquivo).

## Player IPTV

Com o [webOS IPTV Player](https://github.com/lennylxx/webos-iptv-player) (Apache-2.0, em [`iptv-player/`](iptv-player))
na TV, os filmes e séries das abas abrem nele e **começam a tocar direto** (ele acha o título pelo nome na sua conta
Xtream), e os canais da TV aberta e a gaveta › IPTV também abrem nele. Para filmes e séries ele precisa de uma conta
Xtream de um provedor de IPTV (Configurações do player). Sem o player na TV, tudo funciona como antes. Para instalar:
`python3 webos/install.py 192.168.0.123 iptv-player/com.lennylxx.iptv_1.17.0_all.ipk` (depois de gerar o pacote).

### Conta de teste

Para testar sem uma conta de verdade: `python3 tools/xtream_test_server.py` liga um provedor de teste neste computador
(usa a chave do TMDB do `config.properties`). Ele tem os filmes e séries que o launcher mostra, com capa, sinopse,
nota, elenco, diretor e IMDb, e todos tocam um vídeo de teste livre (Big Buck Bunny). No Player IPTV: Xtream,
servidor `http://<IP deste computador>:8099`, usuário `teste`, senha `teste`.

## Instalar

Precisa de uma TV LG (webOS 3 ou mais novo) e de um computador na mesma rede, com Python 3.

1. **Na TV:** instale o app **Developer Mode** da LG Content Store, entre com uma conta grátis de desenvolvedor LG
   (webostv.developer.lge.com), ligue **Dev Mode Status** (a TV reinicia) e depois **Key Server**. Anote o IP e a
   senha que aparecem.
2. **No computador:**
   ```bash
   git clone https://github.com/PauloJose1999/lg-tv-launcher && cd lg-tv-launcher
   python3 webos/build.py        # a primeira vez cria config.properties: preencha e rode de novo
   python3 webos/install.py 192.168.0.123
   ```
   Na primeira vez ele pede a senha do Developer Mode. Também dá para instalar o `FreeMyTV-webos.ipk` pelo
   [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop).
3. **Na TV:** com o launcher aberto, segure uma tecla numérica do controle: ela passa a abrir o launcher de qualquer
   lugar. Na primeira vez a TV pergunta se permite o acesso ao controle remoto por rede: aperte **Permitir** (é o que
   deixa o launcher ver os apps, os canais e a programação).

O Developer Mode dura uns 40 dias: abra o app Developer Mode de vez em quando e aperte **EXTEND**. Para tirar o
launcher: `python3 webos/install.py 192.168.0.123 --uninstall`.

## Configurações

Ficam em `config.properties` (fora do git; o exemplo é `config.example.properties`): a chave do TMDB, a cidade, os
canais de reserva do card (`live_channels`), o Player IPTV (`iptv_app`) e a chave do controle remoto por rede
(`ssap_key`). A lista IPTV não fica aqui: fica no Player IPTV. Mudou algo? `python3 webos/build.py` e instale de novo.

## Como funciona

- HTML, CSS e JavaScript simples (ES5, sem bibliotecas) em [`web/`](web), para o Chromium das TVs LG mais antigas.
- [`web/tv.js`](web/tv.js) fala com a TV: os apps e as entradas pelo barramento da LG (Luna) e, onde o webOS 6+ não
  deixa, pelo controle remoto por rede da própria TV (`ws://127.0.0.1:3000`), que também dá os canais e a programação.
- [`web/home.js`](web/home.js) é a tela; [`web/channels.js`](web/channels.js), os canais das listas do Player IPTV;
  [`web/data.js`](web/data.js), as sugestões (TMDB) e o clima (Open-Meteo).
- [`webos/build.py`](webos/build.py) monta o `.ipk` sem as ferramentas da LG; [`webos/install.py`](webos/install.py)
  instala pelo Developer Mode. `python3 webos/build.py --preview` deixa uma prévia em `out/webos/index.html`.
- Textos em português e inglês ([`assets/i18n`](assets/i18n)), mantidos por `tools/translate.py`.
- Antes de enviar mudanças: `tools/check.sh`.

## Créditos

- Baseado no [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT), que se baseou no
  [FreeMyTvWebOS](https://github.com/danielthejoker18/FreeMyTvWebOS) (MIT) de @danielthejoker18.
- Canais gratuitos e oficiais do Brasil da lista [Free-TV](https://github.com/Free-TV/IPTV), nos testes
  (`tools/test-channels.m3u`).
- Usa a API do TMDB, sem ser endossado ou certificado pelo [TMDB](https://www.themoviedb.org/). Clima por
  [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
- Ícones: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0). Fonte: [Inter](https://rsms.me/inter/)
  (SIL OFL 1.1), só com as letras latinas.
- Sem ligação com a LG nem com os serviços de streaming. Nomes e logos são dos seus donos.

## Licença

[MIT](LICENSE).
