import importlib.util
import os
import time
from datetime import datetime, timezone

PATH = os.path.join(os.path.dirname(__file__), 'sports-control', 'server.py')
SPEC = importlib.util.spec_from_file_location('sports_control_server', PATH)
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)

assert SERVER.clean('São Paulo') == 'sao paulo'
assert SERVER.parse_xmltv_time('20261023170000 -0300') == datetime(2026, 10, 23, 20, 0, tzinfo=timezone.utc).timestamp()

now = time.time()
SERVER.EPG_CACHE['epg.xml'] = (now, [
    {'channelId': 'sportv-2', 'channel': 'SporTV 2', 'start': now - 1800, 'stop': now + 9000,
     'title': 'Campeonato Brasileiro: São Paulo x Santos', 'subtitle': '', 'description': 'Partida ao vivo.'},
    {'channelId': 'premiere', 'channel': 'Premiere', 'start': now - 1800, 'stop': now + 9000,
     'title': 'Palmeiras x Flamengo', 'subtitle': '', 'description': 'Partida ao vivo.'},
    {'channelId': 'old', 'channel': 'Canal antigo', 'start': now - 86400, 'stop': now - 82000,
     'title': 'São Paulo x Santos', 'subtitle': '', 'description': ''},
])
matches = SERVER.event_epg_candidates('epg.xml', now, 'São Paulo', 'Santos')
assert len(matches) == 1
assert matches[0]['channel'] == 'SporTV 2'
assert matches[0]['matchedTeams'] == 2

print('Sports control EPG parsing and matching checks passed.')
