"""Local Windows control panel for validating sports broadcasts.

The server binds only to loopback. It edits the repository's public broadcast manifest;
it never reads or stores IPTV playlist URLs, usernames, passwords or stream IDs.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
import re
import subprocess
import threading
import time
import unicodedata
import webbrowser
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PANEL = os.path.join(ROOT, 'tools', 'sports-control')
MANIFEST = os.path.join(ROOT, 'assets', 'sports', 'broadcasts.json')
STATE_FILE = os.path.join(PANEL, 'central-state.json')
NOTIFIER = os.path.join(PANEL, 'notify.ps1')
HOST, PORT = '127.0.0.1', 8765
EPG_FILES = {'epg.xml', 'claro.xml', 'globo.xml', 'vivoplay.xml', 'xsports.xml'}
EPG_BASE = 'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/'
LEAGUES = [
    ('soccer/bra.1', 'Futebol', 'Brasileirão Série A'),
    ('soccer/conmebol.libertadores', 'Futebol', 'Copa Libertadores'),
    ('soccer/bra.copa_do_brazil', 'Futebol', 'Copa do Brasil'),
    ('soccer/conmebol.sudamericana', 'Futebol', 'Copa Sul-Americana'),
    ('soccer/bra.2', 'Futebol', 'Brasileirão Série B'),
    ('soccer/uefa.champions', 'Futebol', 'Champions League'),
    ('soccer/eng.1', 'Futebol', 'Premier League'),
    ('soccer/esp.1', 'Futebol', 'La Liga'),
    ('soccer/ita.1', 'Futebol', 'Serie A'),
    ('basketball/nba', 'Basquete', 'NBA'),
    ('racing/f1', 'Automobilismo', 'Fórmula 1'),
    ('mma/ufc', 'Lutas', 'UFC'),
]
DEFAULT_THRESHOLD = 75
FEATURES = ('bothTeams', 'oneTeam', 'timeFit', 'sportsSource', 'espnBrazil', 'freshEpg', 'sourceAgreement')
EPG_CACHE = {}
EPG_META = {}
STATE_LOCK = threading.Lock()
RUN_LOCK = threading.Lock()
FORECAST_RUNNING = False
BRAZIL = timezone(timedelta(hours=-3))


def clean(value):
    value = unicodedata.normalize('NFD', value or '')
    value = ''.join(c for c in value if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()


def parse_xmltv_time(value):
    try:
        return datetime.strptime(value.strip(), '%Y%m%d%H%M%S %z').timestamp()
    except (ValueError, TypeError):
        return None


def epg_programmes(filename):
    cached = EPG_CACHE.get(filename)
    if cached and datetime.now(timezone.utc).timestamp() - cached[0] < 20 * 60:
        return cached[1]
    if filename not in EPG_FILES:
        raise ValueError('Fonte XMLTV não permitida.')
    req = Request(EPG_BASE + filename, headers={'User-Agent': 'HomeIPTV-SportsControl/1.0'})
    with urlopen(req, timeout=20) as response:
        chunks, total = [], 0
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            total += len(block)
            if total > 35 * 1024 * 1024:
                raise ValueError('Arquivo XMLTV excede o limite de 35 MB.')
            chunks.append(block)
    root = ET.fromstring(b''.join(chunks))
    generated = root.get('generator-info-name', '')
    generated_at = None
    match = re.search(r'Criado em (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', generated, re.I)
    if match:
        try:
            generated_at = datetime.strptime(match.group(1), '%Y-%m-%d %H:%M:%S').replace(tzinfo=BRAZIL).timestamp()
        except ValueError:
            pass
    names = {}
    for node in root.findall('channel'):
        channel_id = node.get('id', '')
        display = [x.text.strip() for x in node.findall('display-name') if x.text and x.text.strip()]
        names[channel_id] = display[0] if display else channel_id
    records = []
    latest_end = 0
    for node in root.findall('programme'):
        start, stop = parse_xmltv_time(node.get('start')), parse_xmltv_time(node.get('stop'))
        if start is None or stop is None or stop <= start:
            continue
        latest_end = max(latest_end, stop)
        title = next((x.text.strip() for x in node.findall('title') if x.text and x.text.strip()), '')
        if not title:
            continue
        subtitle = next((x.text.strip() for x in node.findall('sub-title') if x.text and x.text.strip()), '')
        desc = next((x.text.strip() for x in node.findall('desc') if x.text and x.text.strip()), '')
        channel_id = node.get('channel', '')
        records.append({'channelId': channel_id, 'channel': names.get(channel_id, channel_id), 'start': start,
                        'stop': stop, 'title': title[:300], 'subtitle': subtitle[:200], 'description': desc[:500]})
    EPG_CACHE[filename] = (datetime.now(timezone.utc).timestamp(), records)
    EPG_META[filename] = {'generatedAt': generated_at, 'latestEnd': latest_end, 'generator': generated[:180]}
    return records


def event_epg_candidates(filename, start, home, away):
    records = epg_programmes(filename)
    now = datetime.now(BRAZIL).timestamp()
    anchor = start if start > 0 else now
    terms = []
    for team in (home, away):
        words = [w for w in clean(team).split() if len(w) >= 4 and w not in ('clube', 'atletico', 'sport', 'futebol')]
        terms.append(words)
    candidates = []
    for item in records:
        if item['start'] > anchor + 3 * 3600 or item['stop'] < anchor - 2 * 3600:
            continue
        text = clean(' '.join((item['title'], item['subtitle'], item['description'])))
        matched = [any((' ' + word + ' ') in (' ' + text + ' ') for word in words) for words in terms]
        if not any(matched):
            continue
        item = dict(item)
        item['matchedTeams'] = sum(1 for flag in matched if flag)
        candidates.append(item)
    candidates.sort(key=lambda item: (-item['matchedTeams'], abs(item['start'] - anchor)))
    return candidates[:30]


def read_state():
    try:
        with open(STATE_FILE, encoding='utf-8') as f:
            state = json.load(f)
        if isinstance(state, dict):
            return state
    except (OSError, ValueError):
        pass
    return {'threshold': DEFAULT_THRESHOLD, 'runDate': '', 'lastRun': '', 'error': '', 'forecasts': [], 'history': [], 'reviewed': {}, 'observations': []}


def write_state(state):
    temp = STATE_FILE + '.tmp'
    with open(temp, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(temp, STATE_FILE)


def fetch_scoreboard(path, today):
    url = 'https://site.api.espn.com/apis/site/v2/sports/%s/scoreboard?lang=pt&region=br&dates=%s' % (path, today)
    req = Request(url, headers={'User-Agent': 'HomeIPTV-SportsControl/1.0'})
    with urlopen(req, timeout=20) as response:
        data = json.loads(response.read().decode('utf-8'))
    result = []
    for event in data.get('events', []):
        comps = event.get('competitions') or []
        comp = comps[0] if comps else {}
        teams = comp.get('competitors') or []
        home, away = '', ''
        for team in teams:
            name = (team.get('team') or {}).get('shortDisplayName') or (team.get('team') or {}).get('displayName') or ''
            if team.get('homeAway') == 'home':
                home = name
            elif team.get('homeAway') == 'away':
                away = name
        try:
            start = datetime.fromisoformat(event.get('date', '').replace('Z', '+00:00')).timestamp()
        except (ValueError, TypeError):
            continue
        result.append({'id': path + ':' + str(event.get('id', '')), 'leaguePath': path, 'sport': 'racing' if path.startswith('racing/') else 'mma' if path.startswith('mma/') else 'basketball' if path.startswith('basketball/') else 'soccer',
            'sportName': '', 'competition': '', 'home': home, 'away': away, 'title': (home + ' x ' + away) if home and away else event.get('name', ''), 'start': start * 1000, 'broadcasts': brazil_broadcasts(comp)})
    return result


def brazil_broadcasts(comp):
    names = []
    for item in (comp.get('geoBroadcasts') or []) + (comp.get('broadcasts') or []):
        if str(item.get('region', '')).lower() != 'br':
            continue
        media = item.get('media') or {}
        name = media.get('shortName') or media.get('name') or ''
        if name and name not in names:
            names.append(name)
    return names


def team_matches(text, team):
    normalized, full = ' ' + clean(text) + ' ', clean(team)
    if not full:
        return False
    if ' ' + full + ' ' in normalized:
        return True
    # ESPN often supplies abbreviated team names while XMLTV uses their full name.
    words = [x for x in full.split() if len(x) >= 5 and x not in ('atletico', 'futebol', 'clube')]
    return any(' ' + word + ' ' in normalized for word in words)


def logistic_value(features, weights):
    value = weights[0] + sum(weights[i + 1] * float(features.get(name, 0)) for i, name in enumerate(FEATURES))
    return 1.0 / (1.0 + math.exp(-max(-30, min(30, value))))


def calibrated_probability(features, model):
    raw = logistic_value(features, model['weights'])
    raw_logit = math.log(max(0.000001, raw) / max(0.000001, 1.0 - raw))
    calibrated = model['calibration'][0] + model['calibration'][1] * raw_logit
    return 1.0 / (1.0 + math.exp(-max(-30, min(30, calibrated))))


def fit_logistic(rows, iterations=1200):
    weights = [-1.1] + [0.0] * len(FEATURES)
    rate, penalty = 0.04, 0.02
    for _ in range(iterations):
        gradient = [0.0] * len(weights)
        for row in rows:
            features, label = row['features'], float(row['label'])
            error = logistic_value(features, weights) - label
            gradient[0] += error
            for i, name in enumerate(FEATURES):
                gradient[i + 1] += error * float(features.get(name, 0))
        scale = 1.0 / max(1, len(rows))
        for i in range(1, len(weights)):
            gradient[i] += penalty * weights[i]
        weights = [max(-8, min(8, weight - rate * gradient[i] * scale)) for i, weight in enumerate(weights)]
    return weights


def train_model(observations):
    rows = [x for x in observations if isinstance(x, dict) and isinstance(x.get('features'), dict) and x.get('label') in (0, 1)]
    event_times = {}
    for row in rows:
        if row.get('eventId'):
            event_times[row['eventId']] = max(event_times.get(row['eventId'], ''), row.get('recordedAt', ''))
    event_ids = sorted(event_times, key=lambda event_id: (event_times[event_id], event_id))
    positives = sum(1 for x in rows if x['label'] == 1)
    negatives = len(rows) - positives
    info = {'mode': 'initial', 'samples': len(rows), 'events': len(event_ids), 'brier': None}
    # Use separate chronological groups for fitting, probability calibration and final validation.
    if len(rows) < 60 or len(event_ids) < 20 or positives < 10 or negatives < 10:
        return None, info
    fit_end = max(1, int(len(event_ids) * 0.7))
    calibration_end = max(fit_end + 1, int(len(event_ids) * 0.85))
    fit_ids = set(event_ids[:fit_end])
    calibration_ids = set(event_ids[fit_end:calibration_end])
    test_ids = set(event_ids[calibration_end:])
    train_ids = fit_ids
    training = [x for x in rows if x.get('eventId') in train_ids]
    calibration_rows = [x for x in rows if x.get('eventId') in calibration_ids]
    testing = [x for x in rows if x.get('eventId') in test_ids]
    if (len(calibration_rows) < 10 or len(testing) < 10 or not any(x['label'] == 0 for x in training)
            or not any(x['label'] == 1 for x in training) or not any(x['label'] == 0 for x in calibration_rows)
            or not any(x['label'] == 1 for x in calibration_rows)):
        return None, info
    weights = fit_logistic(training)
    # Platt scaling maps model scores to probabilities, trained on a separate group of games.
    calibration = [{'features': {'raw': math.log(max(0.000001, logistic_value(x['features'], weights)) /
        max(0.000001, 1.0 - logistic_value(x['features'], weights)))}, 'label': x['label']} for x in calibration_rows]
    calibrator = [0.0, 1.0]
    for _ in range(1000):
        grad = [0.0, 0.0]
        for row in calibration:
            z = max(-30, min(30, calibrator[0] + calibrator[1] * row['features']['raw']))
            error = (1.0 / (1.0 + math.exp(-z))) - row['label']
            grad[0] += error
            grad[1] += error * row['features']['raw']
        calibrator[0] -= 0.03 * grad[0] / len(calibration)
        calibrator[1] -= 0.03 * (grad[1] / len(calibration) + 0.01 * calibrator[1])
        calibrator[0] = max(-8, min(8, calibrator[0]))
        calibrator[1] = max(-8, min(8, calibrator[1]))
    model = {'weights': weights, 'calibration': calibrator}
    brier = sum((calibrated_probability(x['features'], model) - x['label']) ** 2 for x in testing) / len(testing)
    info['brier'] = round(brier, 4)
    prevalence = sum(x['label'] for x in training) / float(len(training))
    baseline = sum((prevalence - x['label']) ** 2 for x in testing) / len(testing)
    info['baselineBrier'] = round(baseline, 4)
    if brier >= baseline:
        return None, info
    info['mode'] = 'calibrated'
    return model, info


def score_programme(game, programme, stale):
    text = ' '.join((programme.get('title', ''), programme.get('subtitle', ''), programme.get('description', '')))
    home = team_matches(text, game.get('home', ''))
    away = team_matches(text, game.get('away', ''))
    delta = abs(programme['start'] - game['start'] / 1000)
    if delta > 3 * 3600:
        return None
    reasons, score = [], 0
    if home and away:
        score += 48
        reasons.append('o guia cita os dois times')
    elif home or away:
        score += 21
        reasons.append('o guia cita apenas um dos times')
    else:
        title = clean(text)
        if not any(x in title for x in ('futebol', 'nba', 'formula 1', 'ufc', 'ao vivo', 'live')):
            return None
        score += 5
        reasons.append('horário e tipo de programa coincidem, sem nomes dos times')
    time_score = 25 if delta <= 20 * 60 else 18 if delta <= 60 * 60 else 10 if delta <= 2 * 3600 else 5
    score += time_score
    reasons.append('horário do programa a %d min do jogo' % round(delta / 60))
    if programme.get('source') == 'epg.xml':
        score += 12
        reasons.append('fonte esportiva principal do BrazilTVEPG')
    else:
        score += 6
        reasons.append('programação encontrada em %s' % programme.get('source', 'XMLTV'))
    espn_brazil = programme['channel'].lower() in [x.lower() for x in game.get('broadcasts', [])]
    if espn_brazil:
        score += 15
        reasons.append('a ESPN também indica esta emissora no Brasil')
    if stale:
        score = min(score, 59)
        reasons.append('EPG possivelmente desatualizado; limitado à revisão')
    features = {'bothTeams': int(home and away), 'oneTeam': int(home != away),
        'timeFit': max(0.0, 1.0 - delta / (3 * 3600)), 'sportsSource': int(programme.get('source') == 'epg.xml'),
        'espnBrazil': int(espn_brazil), 'freshEpg': int(not stale)}
    return min(score, 100), reasons, home and away, features


def forecast_game(game, programmes, stale_sources, threshold, reviewed_map=None, model=None, model_info=None):
    by_channel = {}
    for programme in programmes:
        result = score_programme(game, programme, programme.get('source') in stale_sources)
        if result is None:
            continue
        initial_score, reasons, exact_teams, features = result
        channel = programme.get('channel') or programme.get('channelId')
        score = round(calibrated_probability(features, model) * 100) if model else initial_score
        previous = by_channel.get(channel)
        candidate = {'channel': channel, 'channelId': programme.get('channelId', ''), 'score': score,
            'programme': programme.get('title', ''), 'programmeStart': programme['start'] * 1000,
            'programmeStop': programme['stop'] * 1000, 'source': programme.get('source', ''),
            'reasons': reasons, 'exactTeams': exact_teams, 'features': features, 'sources': [programme.get('source', '')],
            'percentKind': 'probability' if model else 'initial-match-score'}
        if previous is not None:
            candidate['sources'] = sorted(set(previous.get('sources', []) + candidate['sources']))
        if previous is None or score > previous['score']:
            by_channel[channel] = candidate
        elif previous is not None:
            previous['sources'] = candidate['sources']
    for candidate in by_channel.values():
        candidate['features']['sourceAgreement'] = min(1.0, max(0, len(candidate.get('sources', [])) - 1) / 2.0)
        if len(candidate.get('sources', [])) > 1:
            candidate['reasons'].append('canal encontrado em %d fontes de programação' % len(candidate['sources']))
            if model:
                candidate['score'] = round(calibrated_probability(candidate['features'], model) * 100)
    candidates = sorted(by_channel.values(), key=lambda x: (-x['score'], x['channel'].lower()))[:10]
    top = candidates[0] if candidates else None
    second = candidates[1]['score'] if len(candidates) > 1 else 0
    # A close tie is never auto-approved, even if the leading score clears the threshold.
    auto = bool(model and top and top['score'] >= threshold and top['exactTeams']
        and top.get('features', {}).get('freshEpg') == 1 and top['score'] - second >= 12)
    reviewed = (reviewed_map if reviewed_map is not None else read_state().get('reviewed', {})).get(game['id'])
    if reviewed and reviewed.get('action') == 'confirm':
        chosen = reviewed.get('channel', '')
        if chosen and chosen not in by_channel:
            by_channel[chosen] = {'channel': chosen, 'channelId': '', 'score': 0,
                'programme': 'Canal indicado manualmente; sem correspondência no guia', 'programmeStart': 0,
                'programmeStop': 0, 'source': 'manual', 'reasons': ['canal escolhido manualmente; sem sinal de EPG'],
                'exactTeams': False, 'features': dict((name, 0) for name in FEATURES), 'percentKind': 'initial-match-score'}
            candidates = sorted(by_channel.values(), key=lambda x: (-x['score'], x['channel'].lower()))[:10]
        return {'id': game['id'], 'title': game['title'], 'competition': game['competition'], 'sportName': game['sportName'],
            'home': game['home'], 'away': game['away'], 'start': game['start'], 'candidates': candidates,
            'confidence': top['score'] if top else 0, 'status': 'manual-confirmed', 'reviewed': reviewed,
            'manualChannel': chosen, 'note': 'emissora escolhida manualmente', 'model': model_info or {'mode': 'initial'}}
    if reviewed and reviewed.get('action') == 'dismiss':
        return {'id': game['id'], 'title': game['title'], 'competition': game['competition'], 'sportName': game['sportName'],
            'home': game['home'], 'away': game['away'], 'start': game['start'], 'candidates': candidates,
            'confidence': top['score'] if top else 0, 'status': 'dismissed', 'reviewed': reviewed,
            'note': 'revisão manual: sem canal confirmado'}
    return {'id': game['id'], 'title': game['title'], 'competition': game['competition'], 'sportName': game['sportName'],
        'home': game['home'], 'away': game['away'], 'start': game['start'], 'candidates': candidates,
        'confidence': top['score'] if top else 0, 'status': 'approved' if auto else 'review',
        'reviewed': reviewed or None,
        'note': 'probabilidade calibrada em jogos anteriores' if model else 'pontuação inicial; ainda sem amostra validada',
        'model': model_info or {'mode': 'initial'}}


def run_daily_forecast(force=False):
    with STATE_LOCK:
        current = read_state()
        today = datetime.now(BRAZIL).strftime('%Y%m%d')
        if not force and current.get('runDate') == today:
            return current
        now_iso = datetime.now(BRAZIL).isoformat(timespec='seconds')
        try:
            programmes, stale_sources, epg_failures = [], set(), []
            # Baixa todos os arquivos primeiro; só então inicia o cruzamento.
            for filename in sorted(EPG_FILES):
                try:
                    rows = epg_programmes(filename)
                    meta = EPG_META.get(filename, {})
                    now = datetime.now(BRAZIL).timestamp()
                    if (meta.get('latestEnd') or 0) < now - 2 * 3600 or (meta.get('generatedAt') and now - meta['generatedAt'] > 72 * 3600):
                        stale_sources.add(filename)
                    for row in rows:
                        row = dict(row)
                        row['source'] = filename
                        programmes.append(row)
                except (ValueError, OSError, ET.ParseError) as exc:
                    stale_sources.add(filename)
                    epg_failures.append(filename + ': ' + str(exc)[:120])
            events, failures = [], []
            for path, sport, competition in LEAGUES:
                try:
                    rows = fetch_scoreboard(path, today)
                    for game in rows:
                        game['sportName'], game['competition'] = sport, competition
                    events.extend(rows)
                except (OSError, ValueError, KeyError) as exc:
                    failures.append(path + ': ' + str(exc)[:120])
            threshold = max(1, min(100, int(current.get('threshold', DEFAULT_THRESHOLD))))
            model, model_info = train_model(current.get('observations', []))
            forecasts = [forecast_game(game, programmes, stale_sources, threshold, current.get('reviewed', {}), model, model_info) for game in events]
            forecasts.sort(key=lambda x: (x['start'], x['title']))
            if not failures:
                publish_high_confidence(forecasts)
            all_failures = epg_failures + failures
            previous = current.get('forecasts', [])
            history = current.setdefault('history', [])
            known_history = set(x.get('id') for x in history)
            for item in previous:
                if item.get('id') and item.get('id') not in known_history:
                    history.append(item)
                    known_history.add(item.get('id'))
            history[:] = [x for x in history if x.get('start', 0) > (datetime.now(BRAZIL).timestamp() - 35 * 86400) * 1000][-600:]
            current.update({'runDate': today, 'lastRun': now_iso, 'error': '; '.join(all_failures), 'epgErrors': epg_failures,
                'epgSources': len(EPG_FILES) - len(stale_sources), 'staleSources': sorted(stale_sources),
                'eventCount': len(events), 'threshold': threshold, 'forecasts': forecasts, 'model': model_info})
            write_state(current)
            review_count = sum(1 for x in forecasts if x['status'] == 'review')
            note = '%d jogos analisados; %d precisam de revisão.' % (len(forecasts), review_count)
            if all_failures:
                note += ' Há fontes indisponíveis; confira a Central.'
            notify_windows('Central de Esportes atualizada', note)
            return current
        except Exception as exc:
            current.update({'runDate': today, 'lastRun': now_iso, 'error': str(exc)[:300]})
            write_state(current)
            notify_windows('Falha na análise esportiva', str(exc)[:160])
            return current


def publish_high_confidence(forecasts):
    """Update this PC's shared manifest; publication to TVs still requires pushing the file."""
    with open(MANIFEST, encoding='utf-8') as f:
        catalog = json.load(f)
    events = catalog.setdefault('events', {})
    for key in list(events):
        if events[key].get('autoGenerated'):
            del events[key]
    for item in forecasts:
        if item.get('status') != 'approved' or not item.get('candidates'):
            continue
        # A validação humana sempre tem precedência sobre uma nova estimativa automática.
        if item['id'] in events and not events[item['id']].get('autoGenerated'):
            continue
        lead = item['candidates'][0]
        events[item['id']] = {'status': 'confirmed', 'region': 'BR', 'broadcasters': [lead['channel']],
            'competition': item.get('competition', ''), 'title': item.get('title', ''), 'start': item.get('start', 0),
            'validatedAt': datetime.now(timezone.utc).isoformat(), 'autoGenerated': True,
            'confidence': lead['score'], 'confidenceReasons': lead.get('reasons', []),
            'expiresAt': datetime.fromtimestamp(item.get('start', 0) / 1000 + 4 * 3600, timezone.utc).isoformat()}
    catalog['updatedAt'] = datetime.now(timezone.utc).isoformat()
    temp = MANIFEST + '.tmp'
    with open(temp, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(temp, MANIFEST)


def notify_windows(title, message):
    if os.name != 'nt' or not os.path.isfile(NOTIFIER):
        return
    try:
        subprocess.Popen(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', NOTIFIER,
            '-Title', title[:100], '-Message', message[:240]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except OSError:
        pass


def scheduler():
    global FORECAST_RUNNING
    while True:
        with RUN_LOCK:
            start = not FORECAST_RUNNING
            if start:
                FORECAST_RUNNING = True
        if start:
            try:
                run_daily_forecast(False)
            except Exception:
                pass
            finally:
                with RUN_LOCK:
                    FORECAST_RUNNING = False
        time.sleep(60)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, status, content, kind):
        data = content.encode('utf-8') if isinstance(content, str) else content
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/api/state':
            state = read_state()
            state['running'] = FORECAST_RUNNING
            return self.send(200, json.dumps(state, ensure_ascii=False), 'application/json; charset=utf-8')
        if self.path == '/api/catalog':
            with open(MANIFEST, encoding='utf-8') as f:
                return self.send(200, f.read(), 'application/json; charset=utf-8')
        if self.path.startswith('/api/epg?'):
            try:
                q = parse_qs(urlparse(self.path).query)
                filename = q.get('source', ['epg.xml'])[0]
                start = float(q.get('start', ['0'])[0]) / 1000
                home, away = q.get('home', [''])[0], q.get('away', [''])[0]
                found = event_epg_candidates(filename, start, home, away)
                meta = EPG_META.get(filename, {})
                now = datetime.now(BRAZIL).timestamp()
                latest = meta.get('latestEnd') or 0
                generated = meta.get('generatedAt')
                stale = latest < now - 2 * 3600 or bool(generated and now - generated > 72 * 3600)
                return self.send(200, json.dumps({'source': filename, 'count': len(found), 'programmes': found,
                    'stale': stale, 'latestEnd': latest, 'generatedAt': generated, 'generator': meta.get('generator', '')}, ensure_ascii=False), 'application/json; charset=utf-8')
            except (ValueError, OSError, ET.ParseError) as exc:
                return self.send(502, json.dumps({'error': str(exc)}, ensure_ascii=False), 'application/json; charset=utf-8')
        name = 'index.html' if self.path in ('/', '/index.html') else self.path.lstrip('/')
        if name not in ('index.html', 'app.js', 'style.css'):
            return self.send(404, 'Not found', 'text/plain; charset=utf-8')
        path = os.path.join(PANEL, name)
        with open(path, 'rb') as f:
            kind = 'text/html; charset=utf-8' if name.endswith('.html') else 'text/javascript; charset=utf-8' if name.endswith('.js') else 'text/css; charset=utf-8'
            return self.send(200, f.read(), kind)

    def do_POST(self):
        global FORECAST_RUNNING
        if self.path not in ('/api/catalog', '/api/forecast/run', '/api/settings', '/api/review', '/api/outcome'):
            return self.send(404, 'Not found', 'text/plain; charset=utf-8')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size > 1000000:
                raise ValueError('A solicitação excede o limite permitido.')
            payload = json.loads(self.rfile.read(size).decode('utf-8'))
            if self.path == '/api/forecast/run':
                with RUN_LOCK:
                    if FORECAST_RUNNING:
                        return self.send(202, json.dumps({'ok': True, 'running': True}), 'application/json; charset=utf-8')
                    FORECAST_RUNNING = True
                def run_now():
                    global FORECAST_RUNNING
                    try:
                        run_daily_forecast(True)
                    finally:
                        with RUN_LOCK:
                            FORECAST_RUNNING = False
                threading.Thread(target=run_now, daemon=True).start()
                return self.send(202, json.dumps({'ok': True, 'running': True}), 'application/json; charset=utf-8')
            if self.path == '/api/settings':
                threshold = max(1, min(100, int(payload.get('threshold', DEFAULT_THRESHOLD))))
                state = read_state()
                state['threshold'] = threshold
                write_state(state)
                return self.send(200, json.dumps({'ok': True, 'threshold': threshold}), 'application/json; charset=utf-8')
            if self.path == '/api/outcome':
                event_id = str(payload.get('id', ''))[:180]
                channel = str(payload.get('channel', '')).strip()[:100]
                label = payload.get('label')
                state = read_state()
                forecast = next((x for x in state.get('forecasts', []) + state.get('history', []) if x.get('id') == event_id), None)
                if not forecast or not channel or label not in (0, 1):
                    raise ValueError('Resultado inválido.')
                if datetime.now(BRAZIL).timestamp() < forecast.get('start', 0) / 1000 + 4 * 3600:
                    raise ValueError('Registre se transmitiu depois do horário do jogo.')
                candidate = next((x for x in forecast.get('candidates', []) if x.get('channel') == channel), None)
                if not candidate or not isinstance(candidate.get('features'), dict):
                    raise ValueError('Esse canal não faz parte dos candidatos analisados.')
                observations = state.setdefault('observations', [])
                record = {'eventId': event_id, 'channel': channel, 'label': label,
                    'features': candidate['features'], 'recordedAt': datetime.now(BRAZIL).isoformat(timespec='seconds')}
                observations[:] = [x for x in observations if not (x.get('eventId') == event_id and x.get('channel', '').lower() == channel.lower())]
                observations.append(record)
                del observations[:-2000]
                write_state(state)
                model, model_info = train_model(observations)
                state['model'] = model_info
                write_state(state)
                return self.send(200, json.dumps({'ok': True, 'model': model_info}), 'application/json; charset=utf-8')
            if self.path == '/api/review':
                event_id = str(payload.get('id', ''))[:180]
                action = payload.get('action')
                channel = str(payload.get('channel', '')).strip()[:100]
                if not event_id or action not in ('confirm', 'dismiss') or (action == 'confirm' and not channel):
                    raise ValueError('Revisão inválida.')
                state = read_state()
                forecast = next((x for x in state.get('forecasts', []) if x.get('id') == event_id), None)
                if not forecast:
                    raise ValueError('O jogo não está na análise atual.')
                reviewed = {'action': action, 'channel': channel, 'at': datetime.now(BRAZIL).isoformat(timespec='seconds')}
                state.setdefault('reviewed', {})[event_id] = reviewed
                forecast['reviewed'] = reviewed
                forecast['status'] = 'manual-confirmed' if action == 'confirm' else 'dismissed'
                if action == 'confirm':
                    with open(MANIFEST, encoding='utf-8') as f:
                        catalog = json.load(f)
                    catalog.setdefault('events', {})[event_id] = {'status': 'confirmed', 'region': 'BR', 'broadcasters': [channel],
                        'competition': forecast.get('competition', ''), 'title': forecast.get('title', ''), 'start': forecast.get('start', 0),
                        'validatedAt': datetime.now(timezone.utc).isoformat(),
                        'expiresAt': datetime.fromtimestamp(forecast.get('start', 0) / 1000 + 4 * 3600, timezone.utc).isoformat()}
                    catalog['updatedAt'] = datetime.now(timezone.utc).isoformat()
                    temp = MANIFEST + '.tmp'
                    with open(temp, 'w', encoding='utf-8') as f:
                        json.dump(catalog, f, ensure_ascii=False, indent=2)
                        f.write('\n')
                    os.replace(temp, MANIFEST)
                write_state(state)
                return self.send(200, json.dumps({'ok': True, 'reviewed': reviewed}), 'application/json; charset=utf-8')
            catalog = payload
            if not isinstance(catalog, dict) or catalog.get('schema') != 1 or not isinstance(catalog.get('events'), dict):
                raise ValueError('Invalid catalog format.')
            for key, item in catalog['events'].items():
                if not isinstance(key, str) or not isinstance(item, dict) or not isinstance(item.get('broadcasters'), list):
                    raise ValueError('Invalid event entry.')
                item['broadcasters'] = [str(x).strip()[:100] for x in item['broadcasters'] if str(x).strip()][:8]
            temp = MANIFEST + '.tmp'
            with open(temp, 'w', encoding='utf-8') as f:
                json.dump(catalog, f, ensure_ascii=False, indent=2)
                f.write('\n')
            os.replace(temp, MANIFEST)
            return self.send(200, json.dumps({'ok': True, 'updatedAt': catalog.get('updatedAt', '')}), 'application/json; charset=utf-8')
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            return self.send(400, json.dumps({'error': str(exc)}), 'application/json; charset=utf-8')


if __name__ == '__main__':
    url = 'http://%s:%d/' % (HOST, PORT)
    print('Sports Control Center: ' + url)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    threading.Thread(target=scheduler, daemon=True).start()
    webbrowser.open(url)
    server.serve_forever()
