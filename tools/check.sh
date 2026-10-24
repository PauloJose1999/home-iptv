#!/usr/bin/env bash
# What CI runs on every pull request and push (.github/workflows/check.yml). Run it before you push: tools/check.sh
# Needs Python 3 and Node (for the ES5 check).
set -euo pipefail
cd "$(dirname "$0")/.."

python3 tools/translate.py --check

# The generic package lands where your own build leaves yours (with your city and keys): keep yours and put it back.
kept="$(mktemp -d)"
if [ -f FreeMyTV-webos.ipk ]; then cp FreeMyTV-webos.ipk "$kept/"; fi
trap 'if [ -f "$kept/FreeMyTV-webos.ipk" ]; then mv "$kept/FreeMyTV-webos.ipk" .; else rm -f FreeMyTV-webos.ipk; fi; rm -rf "$kept"' EXIT
python3 webos/build.py --generic

# webOS 3 and 4 run a Chromium from 2015 to 2017: web/ has to be ES5, in syntax...
for f in web/*.js; do npx --yes acorn@8.14.0 --ecma5 --silent "$f"; done
# ...and in what it calls. These parse fine but don't exist there (wrap a feature check in try, as strings.js does).
if grep -nE '\.(includes|startsWith|endsWith|padStart|padEnd|repeat|find|findIndex|closest)\(|Object\.(assign|entries|values)\(|Array\.from\(|\bPromise\b|\bfetch\(|new (Map|Set|WeakMap)\b' web/*.js; then
  echo "web/ calls something older TVs don't have (above)." >&2
  exit 1
fi

echo "All checks passed."
