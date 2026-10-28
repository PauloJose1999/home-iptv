#!/usr/bin/env python3
"""Characterization tests of web/home.js: how the home screen behaves today, recorded, so a change shows up.

Builds a test copy of the app in out/home-test/ (the app's own files, a fixed test configuration, and
tools/home-test/harness.js first: a clean storage, a fixed clock, fixed answers in place of the network), then runs
the scenarios of tools/home-test/scenarios.js in headless Chrome, with the network blocked, and compares what each
step recorded with tools/home-test/baseline.json.

    python3 tools/home_test.py            compare with the baseline (exit 1 on a difference)
    python3 tools/home_test.py --update   record the baseline again (after a change that is meant)

Needs Chrome, Chromium or Edge (CHROME=path to name one). Without one it says so and exits 0: the other checks
still run. Python 3, standard library only.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import webapp  # noqa: E402

OUT = os.path.join(ROOT, 'out', 'home-test')
HERE = os.path.join(ROOT, 'tools', 'home-test')
BASELINE = os.path.join(HERE, 'baseline.json')

# The app as a first start would see it, in Portuguese, with a TMDB key the harness answers for.
CONFIG = dict(webapp.GENERIC, tmdbKey='test-key', tmdbRegion='BR', language='pt')


def chrome():
    found = os.environ.get('CHROME')
    if found:
        return found
    for name in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge'):
        path = shutil.which(name)
        if path:
            return path
    for path in (r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                 r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
                 r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'):
        if os.path.exists(path):
            return path
    return None


def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    files = webapp.files(CONFIG, 'tools/home_test.py')
    for path, content in files.items():
        target = os.path.join(OUT, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as f:
            f.write(content)
    for name in ('harness.js', 'scenarios.js'):
        shutil.copy(os.path.join(HERE, name), os.path.join(OUT, 'test-' + name))
    page = files['index.html'].decode('utf-8')
    # The harness before anything of the app (its first lines read storage), the scenarios after it.
    page = page.replace('<head>', '<head>\n<script src="test-harness.js"></script>', 1)
    page = page.replace('</body>', '<script src="test-scenarios.js"></script>\n</body>', 1)
    with open(os.path.join(OUT, 'app.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    with open(os.path.join(OUT, 'run.html'), 'w', encoding='utf-8') as f:
        f.write('<!doctype html><html><head><meta charset="utf-8"></head><body>'
                '<div id="home-test-runner"></div><script src="test-scenarios.js"></script></body></html>')


def run(browser):
    profile = tempfile.mkdtemp(prefix='home-test-')
    url = 'file:///' + os.path.join(OUT, 'run.html').replace('\\', '/').lstrip('/')
    try:
        args = [browser, '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--mute-audio',
                '--user-data-dir=' + profile, '--allow-file-access-from-files', '--window-size=1920,1080',
                '--host-resolver-rules=MAP * ~NOTFOUND', '--virtual-time-budget=900000', '--dump-dom', url]
        done = subprocess.run(args, capture_output=True, timeout=600)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    dom = done.stdout.decode('utf-8', 'replace')
    m = re.search(r'<pre id="home-test-result">(.*?)</pre>', dom, re.S)
    if not m:
        sys.exit('The test page gave no result (did every scenario finish?).\n' + done.stderr.decode('utf-8', 'replace')[-800:])
    text = m.group(1).replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'").replace('&amp;', '&')
    return json.loads(text)


def differences(old, new):
    out = []
    olds = {s['scenario']: s for s in old['scenarios']}
    for s in new['scenarios']:
        before = olds.pop(s['scenario'], None)
        if before is None:
            out.append('new scenario: ' + s['scenario'])
            continue
        if s.get('errors') != before.get('errors'):
            out.append('%s: script errors %s (were %s)' % (s['scenario'], s.get('errors'), before.get('errors')))
        for i in range(max(len(s['records']), len(before['records']))):
            a = before['records'][i] if i < len(before['records']) else None
            b = s['records'][i] if i < len(s['records']) else None
            if a == b:
                continue
            step = (b or a or {}).get('step', '?')
            if a is None or b is None:
                out.append('%s / %s: step %s' % (s['scenario'], step, 'added' if a is None else 'missing'))
                continue
            for key in sorted(set(a) | set(b)):
                if a.get(key) != b.get(key):
                    out.append('%s / %s / %s:\n    was: %s\n    now: %s' % (s['scenario'], step, key,
                                                                         json.dumps(a.get(key), ensure_ascii=False),
                                                                         json.dumps(b.get(key), ensure_ascii=False)))
    for name in olds:
        out.append('scenario gone: ' + name)
    return out


def main():
    browser = chrome()
    if not browser:
        print('Home screen tests skipped: no Chrome, Chromium or Edge found (CHROME=path to name one).')
        return
    build()
    result = run(browser)
    steps = sum(len(s['records']) for s in result['scenarios'])
    if '--update' in sys.argv or not os.path.exists(BASELINE):
        with open(BASELINE, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print('Home screen baseline recorded: %d scenarios, %d steps (tools/home-test/baseline.json).'
              % (len(result['scenarios']), steps))
        return
    with open(BASELINE, encoding='utf-8') as f:
        old = json.load(f)
    diff = differences(old, result)
    if diff:
        print('The home screen behaves differently from the baseline (%d differences):' % len(diff))
        for line in diff[:40]:
            print('  ' + line)
        if len(diff) > 40:
            print('  … and %d more' % (len(diff) - 40))
        print('Meant? python3 tools/home_test.py --update')
        sys.exit(1)
    print('OK: the home screen behaves as recorded (%d scenarios, %d steps).' % (len(result['scenarios']), steps))


if __name__ == '__main__':
    main()
