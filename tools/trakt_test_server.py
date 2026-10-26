#!/usr/bin/env python3
"""A test Trakt.tv API on this computer, to try the launcher's Trakt integration without a real account.

    python3 tools/trakt_test_server.py                  # http://<this computer's IP>:8098
    python3 tools/trakt_test_server.py --token-life 60  # access tokens that expire after a minute (refresh test)

In config.properties: trakt_api=http://<this computer's IP>:8098, trakt_client_id=test-id. It follows the official API (docs at trakt.docs.apiary.io) for what the launcher
uses: device codes (/oauth/device/code, /oauth/device/token with its 400/404/409/410/418/429 answers), refresh and
revoke (/oauth/token, /oauth/revoke), /users/settings, /sync/last_activities, /sync/watched/{movies,shows},
POST /sync/history (which, as on Trakt, does not refuse duplicate plays), and the watchlist with pagination.

To act as the person on the other device and to make things go wrong on purpose:
    GET  /activate?code=XXXX-XXXX[&deny=1]   approve (or deny) a device code
    POST /_test/mode {"rate429": 1}          the next request answers 429 with Retry-After: 2
    POST /_test/mode {"dropHistory": 1}      the next POST /sync/history is applied but its answer is lost
    POST /_test/mode {"expireCodes": 1}      device codes expire at once
    GET  /_test/state                        plays per item, watchlist, tokens
The watched history and the watchlist start with a few titles of out/xtream-test.json (tools/xtream_test_server.py).
Python 3, standard library only.
"""
import json
import os
import secrets
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8098
CLIENT_ID = 'test-id'
TOKEN_LIFE = int(sys.argv[sys.argv.index('--token-life') + 1]) if '--token-life' in sys.argv else 86400
lock = threading.Lock()


def iso(t):
    return time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(t))


def parse_iso(s):
    try:
        return time.mktime(time.strptime(s[:19], '%Y-%m-%dT%H:%M:%S')) - time.timezone
    except Exception:
        return time.time()


class State:
    codes = {}        # device_code -> {user_code, until, approved, denied, used, last_poll}
    tokens = {}       # access -> {refresh, until}
    refreshes = {}    # refresh -> access
    plays = []        # {kind: 'movie'|'episode', tmdb, season, episode, at}
    watchlist = {'movies': [], 'shows': []}   # [{tmdb, title, year, listed_at}]
    activity = {'movies_watched': time.time(), 'episodes_watched': time.time(), 'watchlist': time.time()}
    mode = {}


def seed():
    try:
        with open(os.path.join(ROOT, 'out', 'xtream-test.json'), encoding='utf-8') as f:
            kinds = json.load(f)
    except Exception:
        kinds = {'movie': [], 'tv': []}
    now = time.time()
    shows = kinds.get('tv', [])
    if shows:
        show = shows[0]   # its first three episodes of season 1, watched a week ago
        for e in (1, 2, 3):
            State.plays.append({'kind': 'episode', 'tmdb': show['id'], 'season': 1, 'episode': e, 'at': now - 7 * 86400 + e})
    for m in kinds.get('movie', [])[:2]:
        State.plays.append({'kind': 'movie', 'tmdb': m['id'], 'at': now - 3 * 86400})
    # A watchlist longer than one page, to test the pagination (the launcher asks 50 a page).
    for i, m in enumerate(kinds.get('movie', [])[2:62]):
        State.watchlist['movies'].append({'tmdb': m['id'], 'title': m.get('title', ''), 'year': (m.get('release_date') or '')[:4],
                                          'listed_at': now - i * 60})
    for s in shows[1:6]:
        State.watchlist['shows'].append({'tmdb': s['id'], 'title': s.get('name', ''), 'year': (s.get('first_air_date') or '')[:4],
                                         'listed_at': now})


def watched(kind):
    out = {}
    for p in State.plays:
        if (kind == 'movies') != (p['kind'] == 'movie'):
            continue
        if kind == 'movies':
            m = out.setdefault(p['tmdb'], {'plays': 0, 'last_watched_at': 0})
            m['plays'] += 1
            m['last_watched_at'] = max(m['last_watched_at'], p['at'])
        else:
            s = out.setdefault(p['tmdb'], {'last_watched_at': 0, 'seasons': {}})
            e = s['seasons'].setdefault(p['season'], {}).setdefault(p['episode'], {'plays': 0, 'last_watched_at': 0})
            e['plays'] += 1
            e['last_watched_at'] = max(e['last_watched_at'], p['at'])
            s['last_watched_at'] = max(s['last_watched_at'], p['at'])
    if kind == 'movies':
        return [{'plays': v['plays'], 'last_watched_at': iso(v['last_watched_at']), 'last_updated_at': iso(v['last_watched_at']),
                 'movie': {'title': '', 'ids': {'trakt': k, 'tmdb': k}}} for k, v in out.items()]
    return [{'plays': sum(e['plays'] for se in v['seasons'].values() for e in se.values()),
             'last_watched_at': iso(v['last_watched_at']), 'last_updated_at': iso(v['last_watched_at']), 'reset_at': None,
             'show': {'title': '', 'ids': {'trakt': k, 'tmdb': k}},
             'seasons': [{'number': sn, 'episodes': [{'number': en, 'plays': e['plays'], 'last_watched_at': iso(e['last_watched_at'])}
                                                     for en, e in sorted(se.items())]} for sn, se in sorted(v['seasons'].items())]}
            for k, v in out.items()]


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body=None, headers=None):
        data = b'' if body is None else json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Expose-Headers', 'X-Pagination-Page,X-Pagination-Page-Count,X-Pagination-Limit,'
                         'X-Pagination-Item-Count,Retry-After,X-Ratelimit')
        for k, v in (headers or {}).items():
            self.send_header(k, str(v))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'content-type,trakt-api-key,trakt-api-version,authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE')
        self.end_headers()

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        try:
            return json.loads(self.rfile.read(n).decode('utf-8') or '{}')
        except Exception:
            return {}

    def gate(self, authed):
        """The API's checks: the version and key headers, a valid token, and the injected 429."""
        if State.mode.get('rate429'):
            State.mode['rate429'] -= 1
            self.reply(429, {'error': 'rate limit'}, {'Retry-After': 2})
            return False
        if self.headers.get('trakt-api-version') != '2' or self.headers.get('trakt-api-key') != CLIENT_ID:
            self.reply(403, {'error': 'bad api key or version'})
            return False
        if authed:
            token = (self.headers.get('Authorization') or '').replace('Bearer ', '')
            t = State.tokens.get(token)
            if not t or t['until'] < time.time():
                self.reply(401, {'error': 'invalid_token'})
                return False
        return True

    def issue(self):
        access, refresh = secrets.token_hex(16), secrets.token_hex(16)
        State.tokens[access] = {'refresh': refresh, 'until': time.time() + TOKEN_LIFE}
        State.refreshes[refresh] = access
        return {'access_token': access, 'token_type': 'bearer', 'expires_in': TOKEN_LIFE, 'refresh_token': refresh,
                'scope': 'public', 'created_at': int(time.time())}

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(url.query))
        with lock:
            if url.path == '/activate':
                for c in State.codes.values():
                    if c['user_code'] == q.get('code'):
                        c['denied' if q.get('deny') else 'approved'] = True
                        return self.reply(200, {'ok': True})
                return self.reply(404, {'error': 'no such code'})
            if url.path == '/_test/state':
                return self.reply(200, {'plays': len(State.plays), 'history': State.plays[-10:], 'tokens': len(State.tokens),
                                        'watchlist': {k: [x['tmdb'] for x in v] for k, v in State.watchlist.items()}})
            if url.path == '/users/settings':
                return self.gate(True) and self.reply(200, {'user': {'username': 'teste', 'name': 'Conta de teste'}})
            if url.path == '/sync/last_activities':
                if not self.gate(True):
                    return
                a = State.activity
                return self.reply(200, {'all': iso(max(a.values())), 'movies': {'watched_at': iso(a['movies_watched']),
                                        'watchlisted_at': iso(a['watchlist'])}, 'episodes': {'watched_at': iso(a['episodes_watched'])},
                                        'shows': {'watchlisted_at': iso(a['watchlist'])}})
            if url.path in ('/sync/watched/movies', '/sync/watched/shows'):
                return self.gate(True) and self.reply(200, watched(url.path.rsplit('/', 1)[1]))
            if url.path.startswith('/sync/watchlist/'):
                if not self.gate(True):
                    return
                kind = url.path.split('/')[3]
                items = sorted(State.watchlist.get(kind, []), key=lambda x: -x['listed_at'])
                page, limit = max(1, int(q.get('page', 1))), max(1, int(q.get('limit', 10)))
                pages = max(1, -(-len(items) // limit))
                chunk = items[(page - 1) * limit:page * limit]
                what = 'movie' if kind == 'movies' else 'show'
                return self.reply(200, [{'rank': i, 'listed_at': iso(x['listed_at']), 'type': what,
                                         what: {'title': x['title'], 'year': int(x['year'] or 0), 'ids': {'trakt': x['tmdb'], 'tmdb': x['tmdb']}}}
                                        for i, x in enumerate(chunk)],
                                  {'X-Pagination-Page': page, 'X-Pagination-Limit': limit, 'X-Pagination-Page-Count': pages,
                                   'X-Pagination-Item-Count': len(items)})
        self.reply(404, {'error': 'not found'})

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        b = self.body()
        with lock:
            if url.path == '/_test/mode':
                State.mode.update(b)
                return self.reply(200, State.mode)
            if url.path == '/oauth/device/code':
                if b.get('client_id') != CLIENT_ID:
                    return self.reply(401, {'error': 'invalid_client'})
                device = secrets.token_hex(16)
                user = secrets.token_hex(2).upper() + '-' + secrets.token_hex(2).upper()
                life = 1 if State.mode.pop('expireCodes', 0) else 600
                State.codes[device] = {'user_code': user, 'until': time.time() + life, 'last_poll': 0}
                return self.reply(200, {'device_code': device, 'user_code': user, 'verification_url': 'https://trakt.tv/activate',
                                        'expires_in': life, 'interval': 2})
            if url.path == '/oauth/device/token':
                c = State.codes.get(b.get('code'))
                # As on Trakt today, client_secret is optional (deprecated): the device flow needs only the client id.
                if b.get('client_id') != CLIENT_ID:
                    return self.reply(401, {'error': 'invalid_client'})
                if not c:
                    return self.reply(404)
                if c.get('used'):
                    return self.reply(409)
                if c['until'] < time.time():
                    return self.reply(410)
                if c.get('denied'):
                    return self.reply(418)
                if time.time() - c['last_poll'] < 1.5:
                    c['last_poll'] = time.time()
                    return self.reply(429)
                c['last_poll'] = time.time()
                if not c.get('approved'):
                    return self.reply(400)
                c['used'] = True
                return self.reply(200, self.issue())
            if url.path == '/oauth/token':
                access = State.refreshes.pop(b.get('refresh_token'), None)
                if not access or b.get('client_id') != CLIENT_ID or b.get('grant_type') != 'refresh_token':
                    return self.reply(401, {'error': 'invalid_grant'})
                State.tokens.pop(access, None)
                return self.reply(200, self.issue())
            if url.path == '/oauth/revoke':
                State.tokens.pop(b.get('token'), None)
                return self.reply(200, {})
            if url.path == '/sync/history':
                if not self.gate(True):
                    return
                added = {'movies': 0, 'episodes': 0}
                for m in b.get('movies', []):
                    tmdb = (m.get('ids') or {}).get('tmdb')
                    if tmdb:
                        State.plays.append({'kind': 'movie', 'tmdb': tmdb, 'at': parse_iso(m.get('watched_at', iso(time.time())))})
                        added['movies'] += 1
                for s in b.get('shows', []):
                    tmdb = (s.get('ids') or {}).get('tmdb')
                    for se in s.get('seasons', []):
                        for e in se.get('episodes', []):
                            State.plays.append({'kind': 'episode', 'tmdb': tmdb, 'season': se['number'], 'episode': e['number'],
                                                'at': parse_iso(e.get('watched_at', iso(time.time())))})
                            added['episodes'] += 1
                if added['movies']:
                    State.activity['movies_watched'] = time.time()
                if added['episodes']:
                    State.activity['episodes_watched'] = time.time()
                if State.mode.get('dropHistory'):
                    State.mode['dropHistory'] -= 1
                    self.close_connection = True   # applied, but the answer never arrives
                    return
                return self.reply(201, {'added': added, 'not_found': {'movies': [], 'shows': [], 'episodes': []}})
            if url.path in ('/sync/watchlist', '/sync/watchlist/remove'):
                if not self.gate(True):
                    return
                result = {'movies': 0, 'shows': 0}
                for kind in ('movies', 'shows'):
                    for item in b.get(kind, []):
                        tmdb = (item.get('ids') or {}).get('tmdb')
                        have = [x for x in State.watchlist[kind] if x['tmdb'] == tmdb]
                        if url.path.endswith('remove'):
                            State.watchlist[kind] = [x for x in State.watchlist[kind] if x['tmdb'] != tmdb]
                            result[kind] += len(have)
                        elif not have and tmdb:
                            State.watchlist[kind].append({'tmdb': tmdb, 'title': item.get('title', ''), 'year': str(item.get('year', '')),
                                                          'listed_at': time.time()})
                            result[kind] += 1
                State.activity['watchlist'] = time.time()
                key = 'deleted' if url.path.endswith('remove') else 'added'
                return self.reply(201 if key == 'added' else 200, {key: result, 'not_found': {'movies': [], 'shows': []}})
        self.reply(404, {'error': 'not found'})

    def log_message(self, fmt, *args):
        sys.stdout.write('%s %s\n' % (self.address_string(), fmt % args))
        sys.stdout.flush()


if __name__ == '__main__':
    seed()
    print('Test Trakt: http://<this computer\'s IP>:%d (client id %s), %d plays, watchlist %d movies / %d shows.' % (
        PORT, CLIENT_ID, len(State.plays), len(State.watchlist['movies']), len(State.watchlist['shows'])))
    sys.stdout.flush()
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
