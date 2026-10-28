#!/usr/bin/env bash
# What CI runs on every pull request and push (.github/workflows/check.yml). Run it before you push: tools/check.sh
# Needs Python 3 and Node (for the ES5 check).
set -euo pipefail
cd "$(dirname "$0")/.."

python3 tools/translate.py --check

# The generic package lands where your own build leaves yours (with your city and keys): keep yours and put it back.
kept="$(mktemp -d)"
if [ -f HomeIPTV-webos.ipk ]; then cp HomeIPTV-webos.ipk "$kept/"; fi
trap 'if [ -f "$kept/HomeIPTV-webos.ipk" ]; then mv "$kept/HomeIPTV-webos.ipk" .; else rm -f HomeIPTV-webos.ipk; fi; rm -rf "$kept"' EXIT
python3 webos/build.py --generic

# webOS 3 and 4 run a Chromium from 2015 to 2017: web/ has to be ES5, in syntax...
for f in web/*.js; do npx --yes acorn@8.14.0 --ecma5 --silent "$f"; done
# ...and in what it calls. These parse fine but don't exist there (wrap a feature check in try, as strings.js does).
if grep -nE '\.(includes|startsWith|endsWith|padStart|padEnd|repeat|find|findIndex|closest)\(|Object\.(assign|entries|values)\(|Array\.from\(|\bPromise\b|\bfetch\(|new (Map|Set|WeakMap)\b' web/*.js; then
  echo "web/ calls something older TVs don't have (above)." >&2
  exit 1
fi

# Each file is one function: a name declared twice there (two `var ROW_H`) silently replaces the first.
python3 - <<'PY'
import re, sys, glob
bad = []
for f in sorted(glob.glob('web/*.js')):
    seen = {}
    for n, line in enumerate(open(f, encoding='utf-8'), 1):
        if re.match(r'^(var |\}\))', line):
            seen = {}   # a file can hold several modules (data.js: Place, Prefs, Data), each its own function
        m = re.match(r'^  (?:var|function) (.*)', line)
        if not m:
            continue
        # Without the comment and the strings, whose words aren't declarations.
        decl = re.sub(r"//.*|'(?:[^'\\]|\\.)*'", '', m.group(1))
        if line.startswith('  function'):
            names = re.findall(r'^([A-Za-z_$][\w$]*)', decl)
        else:
            names = re.findall(r'(?:^|,\s*)([A-Za-z_$][\w$]*)\s*(?==|,|;|$)', decl.strip())
        for name in names:
            if name in seen:
                bad.append('%s:%d: %s was already declared on line %d' % (f, n, name, seen[name]))
            seen.setdefault(name, n)
for b in bad:
    print(b)
sys.exit(1 if bad else 0)
PY

# Antenna names come from two webOS APIs and may differ by HD suffix, case, punctuation or Portuguese accents.
node tools/test_channel_names.js
node tools/test_sports.js
node tools/test_m3u_guide.js
python3 tools/test_sports_control.py

# How the home screen behaves (web/home.js), step by step, in headless Chrome: a change shows up as a difference from
# tools/home-test/baseline.json (python3 tools/home_test.py --update records it again when the change is meant).
python3 tools/home_test.py

echo "All checks passed."
