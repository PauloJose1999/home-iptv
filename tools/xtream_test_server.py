#!/usr/bin/env python3
"""A test IPTV provider (Xtream Codes API) on this computer, to try the launcher and the IPTV player on the TV without
a real account.

    python3 tools/xtream_test_server.py            # http://<this computer's IP>:8099, user teste, password teste
    python3 tools/xtream_test_server.py --refresh  # fetch the titles from TMDB again

Its movies and series are the ones the launcher shows (TMDB, in Portuguese, on the Brazilian streaming services), with
their posters, synopses, ratings, cast, director and IMDb ids, so a title picked in the launcher is found here. Every
movie and episode plays the same free test video (Big Buck Bunny, a public HLS test stream). Its live channels are the
free Brazilian ones of tools/test-channels.m3u. Needs the TMDB key in config.properties. Python 3, standard library only.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'out', 'xtream-test.json')
PORT = 8099
USER, PASSWORD = 'teste', 'teste'
VIDEO = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'   # Big Buck Bunny (Blender Foundation, CC BY)
# Netflix, Prime Video, Disney+, Max, Globoplay, Apple TV+: what the launcher's rows come from.
PROVIDERS = '8|119|337|1899|307|350'


def tmdb_key():
    with open(os.path.join(ROOT, 'config.properties'), encoding='utf-8') as f:
        for line in f:
            if line.startswith('tmdb_key='):
                return line.split('=', 1)[1].strip()
    return ''


def tmdb(key, path, **params):
    params.setdefault('language', 'pt-BR')
    bearer = key.startswith('eyJ')
    if not bearer:
        params['api_key'] = key
    req = urllib.request.Request('https://api.themoviedb.org/3' + path + '?' + urllib.parse.urlencode(params),
                                 headers={'Authorization': 'Bearer ' + key} if bearer else {})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))


def image(path, size='w500'):
    return 'https://image.tmdb.org/t/p/%s%s' % (size, path) if path else ''


def fetch_titles():
    key = tmdb_key()
    if not key:
        sys.exit('No tmdb_key in config.properties.')
    kinds = {}
    for kind in ('movie', 'tv'):
        ids, seen = [], set()
        lists = [tmdb(key, '/trending/%s/week' % kind)]
        for page in (1, 2, 3):
            lists.append(tmdb(key, '/discover/' + kind, watch_region='BR', with_watch_providers=PROVIDERS,
                              with_watch_monetization_types='flatrate', sort_by='popularity.desc', page=page))
        for res in lists:
            for o in res.get('results', []):
                if o['id'] not in seen and o.get('poster_path'):
                    seen.add(o['id'])
                    ids.append(o['id'])
        print('%s: %d titles, reading their details ...' % (kind, len(ids)))
        with ThreadPoolExecutor(8) as pool:
            kinds[kind] = [d for d in pool.map(
                lambda i: tmdb(key, '/%s/%d' % (kind, i), append_to_response='credits,external_ids'), ids) if d]
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, 'w', encoding='utf-8') as f:
        json.dump(kinds, f, ensure_ascii=False)
    return kinds


def build(kinds):
    """The catalog in Xtream's shapes: categories by genre, lists, and each title's info."""
    def common(d):
        credits = d.get('credits') or {}
        cast = ', '.join(c['name'] for c in credits.get('cast', [])[:8])
        crew = credits.get('crew', [])
        director = ', '.join(c['name'] for c in crew if c.get('job') == 'Director')
        if not director:
            director = ', '.join(c['name'] for c in d.get('created_by', []))
        genres = d.get('genres') or [{'id': 0, 'name': 'Outros'}]
        imdb = (d.get('external_ids') or {}).get('imdb_id') or d.get('imdb_id') or ''
        return cast, director, genres, imdb

    cats = {'movie': {}, 'tv': {}}
    vod, vod_info, series, series_info = [], {}, [], {}
    for n, d in enumerate(kinds.get('movie', []), 1):
        cast, director, genres, imdb = common(d)
        cats['movie'][genres[0]['id']] = genres[0]['name']
        rating = round(d.get('vote_average') or 0, 1)
        vod.append({'num': n, 'name': d['title'], 'stream_type': 'movie', 'stream_id': d['id'],
                    'stream_icon': image(d.get('poster_path')), 'rating': str(rating), 'rating_5based': rating / 2,
                    'added': '1767225600', 'category_id': str(genres[0]['id']), 'container_extension': 'm3u8',
                    'tmdb': str(d['id']), 'year': (d.get('release_date') or '')[:4]})
        vod_info[str(d['id'])] = {
            'info': {'name': d['title'], 'o_name': d.get('original_title', ''), 'plot': d.get('overview', ''),
                     'cast': cast, 'director': director, 'genre': ', '.join(g['name'] for g in genres),
                     'releasedate': d.get('release_date', ''), 'duration_secs': (d.get('runtime') or 0) * 60,
                     'duration': '%d min' % (d.get('runtime') or 0), 'rating': str(rating),
                     'movie_image': image(d.get('poster_path')), 'cover_big': image(d.get('poster_path')),
                     'backdrop_path': [image(d.get('backdrop_path'), 'w1280')], 'tmdb_id': str(d['id']),
                     'imdb_id': imdb},
            'movie_data': {'stream_id': d['id'], 'name': d['title'], 'container_extension': 'm3u8',
                           'category_id': str(genres[0]['id'])}}
    for n, d in enumerate(kinds.get('tv', []), 1):
        cast, director, genres, imdb = common(d)
        cats['tv'][genres[0]['id']] = genres[0]['name']
        rating = round(d.get('vote_average') or 0, 1)
        sid = d['id']
        series.append({'num': n, 'name': d['name'], 'series_id': sid, 'cover': image(d.get('poster_path')),
                       'plot': d.get('overview', ''), 'cast': cast, 'director': director,
                       'genre': ', '.join(g['name'] for g in genres), 'releaseDate': d.get('first_air_date', ''),
                       'rating': str(rating), 'rating_5based': rating / 2, 'category_id': str(genres[0]['id']),
                       'last_modified': '1767225600', 'tmdb': str(sid)})
        episodes = {}
        for s in d.get('seasons') or []:
            num = s.get('season_number') or 0
            if num < 1:
                continue
            episodes[str(num)] = [{
                'id': '%d%03d%03d' % (sid, num, e), 'episode_num': e, 'season': num,
                'title': '%s - T%d E%d' % (d['name'], num, e), 'container_extension': 'm3u8',
                'info': {'plot': s.get('overview') or d.get('overview', ''), 'duration_secs': 2700,
                         'movie_image': image(s.get('poster_path') or d.get('poster_path'))}}
                for e in range(1, min(s.get('episode_count') or 1, 12) + 1)]
        series_info[str(sid)] = {
            'info': {'name': d['name'], 'plot': d.get('overview', ''), 'cast': cast, 'director': director,
                     'genre': ', '.join(g['name'] for g in genres), 'releaseDate': d.get('first_air_date', ''),
                     'rating': str(rating), 'cover': image(d.get('poster_path')),
                     'backdrop_path': [image(d.get('backdrop_path'), 'w1280')], 'episode_run_time': [45],
                     'tmdb_id': str(sid), 'imdb_id': imdb},
            'seasons': [], 'episodes': episodes}
    return {
        'vod_categories': [{'category_id': str(k), 'category_name': v, 'parent_id': 0} for k, v in cats['movie'].items()],
        'series_categories': [{'category_id': str(k), 'category_name': v, 'parent_id': 0} for k, v in cats['tv'].items()],
        'vod': vod, 'vod_info': vod_info, 'series': series, 'series_info': series_info,
    }


def live_channels():
    """The free Brazilian channels of the launcher's list (the YouTube ones can't play in a player)."""
    out, info = [], None
    with open(os.path.join(ROOT, 'tools', 'test-channels.m3u'), encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('#EXTINF'):
                info = line
            elif line and not line.startswith('#') and info:
                if 'youtube.com' not in line:
                    logo = re.search(r'tvg-logo="([^"]*)"', info)
                    out.append({'num': len(out) + 1, 'name': info.split(',', 1)[1], 'stream_type': 'live',
                                'stream_id': len(out) + 1, 'stream_icon': logo.group(1) if logo else '',
                                'epg_channel_id': '', 'category_id': '1', 'tv_archive': 0, 'url': line})
                info = None
    return out


class Handler(BaseHTTPRequestHandler):
    catalog = None
    live = []

    def send(self, value, status=200, kind='application/json'):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, url):
        self.send_response(302)
        self.send_header('Location', url)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(url.query))
        c, path = self.catalog, url.path
        m = re.match(r'^/(movie|series|live)/([^/]+)/([^/]+)/(\d+)', path)
        if m:
            if (m.group(2), m.group(3)) != (USER, PASSWORD):
                return self.send({'error': 'auth'}, 403)
            if m.group(1) == 'live':
                ch = next((x for x in self.live if x['stream_id'] == int(m.group(4))), None)
                return self.redirect(ch['url']) if ch else self.send({'error': 'not found'}, 404)
            return self.redirect(VIDEO)
        if path in ('/get.php', '/xmltv.php'):
            if (q.get('username'), q.get('password')) != (USER, PASSWORD):
                return self.send(b'', 403, 'text/plain')
            if path == '/xmltv.php':
                return self.send(b'<?xml version="1.0" encoding="UTF-8"?><tv></tv>', kind='application/xml')
            base = 'http://%s' % self.headers.get('Host')
            lines = ['#EXTM3U']
            for ch in self.live:
                lines.append('#EXTINF:-1 tvg-name="%s" tvg-logo="%s" group-title="Brasil",%s'
                             % (ch['name'], ch['stream_icon'], ch['name']))
                lines.append('%s/live/%s/%s/%d.m3u8' % (base, USER, PASSWORD, ch['stream_id']))
            return self.send(('\n'.join(lines) + '\n').encode('utf-8'), kind='audio/x-mpegurl')
        if path != '/player_api.php':
            return self.send({'error': 'not found'}, 404)
        if (q.get('username'), q.get('password')) != (USER, PASSWORD):
            return self.send({'user_info': {'auth': 0}})
        action = q.get('action', '')
        cat = q.get('category_id')
        if not action:
            host = (self.headers.get('Host') or '').split(':')
            return self.send({
                'user_info': {'username': USER, 'password': PASSWORD, 'auth': 1, 'status': 'Active',
                              'exp_date': '1893456000', 'is_trial': '1', 'active_cons': '0', 'max_connections': '2',
                              'allowed_output_formats': ['m3u8', 'ts']},
                'server_info': {'url': host[0], 'port': host[1] if len(host) > 1 else '80', 'server_protocol': 'http',
                                'timezone': 'America/Sao_Paulo', 'timestamp_now': 0, 'time_now': ''}})
        if action == 'get_live_categories':
            return self.send([{'category_id': '1', 'category_name': 'Brasil', 'parent_id': 0}])
        if action == 'get_live_streams':
            return self.send([{k: v for k, v in ch.items() if k != 'url'} for ch in self.live])
        if action == 'get_vod_categories':
            return self.send(c['vod_categories'])
        if action == 'get_vod_streams':
            return self.send([v for v in c['vod'] if not cat or v['category_id'] == cat])
        if action == 'get_vod_info':
            return self.send(c['vod_info'].get(q.get('vod_id', ''), {'info': {}}))
        if action == 'get_series_categories':
            return self.send(c['series_categories'])
        if action == 'get_series':
            return self.send([s for s in c['series'] if not cat or s['category_id'] == cat])
        if action == 'get_series_info':
            return self.send(c['series_info'].get(q.get('series_id', ''), {'info': {}, 'episodes': {}}))
        return self.send([])

    def log_message(self, fmt, *args):
        sys.stdout.write('%s %s\n' % (self.address_string(), fmt % args))


def main():
    if '--refresh' in sys.argv or not os.path.exists(CACHE):
        kinds = fetch_titles()
    else:
        with open(CACHE, encoding='utf-8') as f:
            kinds = json.load(f)
    Handler.catalog = build(kinds)
    Handler.live = live_channels()
    print('Test provider: %d movies, %d series, %d channels.' % (
        len(Handler.catalog['vod']), len(Handler.catalog['series']), len(Handler.live)))
    print('In the IPTV player: Xtream, server http://<this computer\'s IP>:%d, user %s, password %s.' % (PORT, USER, PASSWORD))
    sys.stdout.flush()
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
