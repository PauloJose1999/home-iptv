# LG TV Launcher

Uma tela inicial para TVs LG (webOS), com TV aberta ao vivo, filmes e séries dos seus apps e todos os apps da TV
numa barra só. Feita a partir do [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT), só com o que serve
à LG.

## O que tem

- **TV aberta:** três canais em cartões (um grande e dois pequenos), com o nome, o selo AO VIVO, o programa, o horário
  de começo e de fim e a barra de progresso. O cartão em foco toca o seu canal, imagem e som: pela internet quando a
  lista IPTV tem o canal, senão pela antena. OK abre o canal em tela cheia.
- **Filmes e Séries:** como na Netflix: o título em foco grande no topo e fileiras (em alta, por app, lançamentos,
  mais bem avaliados, gêneros), só dos apps que você tem na TV (TMDB). Só carrega quando você abre a aba.
- **Barra de apps:** todos os apps da TV, rolando com as setas.
- **IPTV dentro do launcher:** os canais gratuitos e oficiais do Brasil (lista
  [Free-TV](https://github.com/Free-TV/IPTV)) ou a sua lista M3U ou Xtream, tocados em tela cheia sem abrir outro app
  (↓ na barra › IPTV). Canais do YouTube abrem no app do YouTube.
- **Gaveta (↓):** entradas HDMI, atalhos, clima, ajustes.
- **Ajustes do Início:** os canais de cada cartão, o som dos canais, a prateleira, o tema, a proteção de tela, o
  idioma, o clima e restaurar o padrão, cada um com uma explicação. Na **Prateleira** você pega um app (OK › Mover) e
  leva com as setas, ou segura e arrasta com o ponteiro do Magic Remote; também dá para esconder apps que não usa.
- **Claro de dia, escuro à noite**, e uma proteção de tela com as fotos das sugestões.

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
canais da TV aberta (`live_channels`), a lista IPTV (`iptv_m3u` ou `iptv_server`, `iptv_user`, `iptv_pass`) e a chave
do controle remoto por rede (`ssap_key`). Mudou algo? `python3 webos/build.py` e instale de novo.

## Como funciona

- HTML, CSS e JavaScript simples (ES5, sem bibliotecas) em [`web/`](web), para o Chromium das TVs LG mais antigas.
- [`web/tv.js`](web/tv.js) fala com a TV: os apps e as entradas pelo barramento da LG (Luna) e, onde o webOS 6+ não
  deixa, pelo controle remoto por rede da própria TV (`ws://127.0.0.1:3000`), que também dá os canais e a programação.
- [`web/home.js`](web/home.js) é a tela; [`web/iptv.js`](web/iptv.js), a lista e o player IPTV;
  [`web/data.js`](web/data.js), as sugestões (TMDB) e o clima (Open-Meteo).
- [`webos/build.py`](webos/build.py) monta o `.ipk` sem as ferramentas da LG; [`webos/install.py`](webos/install.py)
  instala pelo Developer Mode. `python3 webos/build.py --preview` deixa uma prévia em `out/webos/index.html`.
- Textos em português e inglês ([`assets/i18n`](assets/i18n)), mantidos por `tools/translate.py`.
- Antes de enviar mudanças: `tools/check.sh`.

## Créditos

- Baseado no [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT), que se baseou no
  [FreeMyTvWebOS](https://github.com/danielthejoker18/FreeMyTvWebOS) (MIT) de @danielthejoker18.
- Canais gratuitos e oficiais do Brasil da lista [Free-TV](https://github.com/Free-TV/IPTV).
- Usa a API do TMDB, sem ser endossado ou certificado pelo [TMDB](https://www.themoviedb.org/). Clima por
  [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
- Ícones: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0). Fonte: [Inter](https://rsms.me/inter/)
  (SIL OFL 1.1), só com as letras latinas.
- Sem ligação com a LG nem com os serviços de streaming. Nomes e logos são dos seus donos.

## Licença

[MIT](LICENSE).
