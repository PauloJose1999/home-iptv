"""Local Windows control panel for validating sports broadcasts.

The server binds only to loopback. It edits the repository's public broadcast manifest;
it never reads or stores IPTV playlist URLs, usernames, passwords or stream IDs.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import unicodedata
import webbrowser
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PANEL = os.path.join(ROOT, 'tools', 'sports-control')
MANIFEST = os.path.join(ROOT, 'assets', 'sports', 'broadcasts.json')
HOST, PORT = '127.0.0.1', 8765
EPG_FILES = {'epg.xml', 'claro.xml', 'globo.xml', 'vivoplay.xml', 'xsports.xml'}
EPG_BASE = 'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/'
EPG_CACHE = {}
EPG_META = {}
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
        if self.path != '/api/catalog':
            return self.send(404, 'Not found', 'text/plain; charset=utf-8')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size > 1000000:
                raise ValueError('The catalog is too large.')
            catalog = json.loads(self.rfile.read(size).decode('utf-8'))
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
    print('Keep this window open. Save edits locally; publish assets/sports/broadcasts.json to share them with launcher users.')
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    webbrowser.open(url)
    server.serve_forever()
