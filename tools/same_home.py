#!/usr/bin/env python3
"""Proof that a refactoring of web/home.js only moved functions: python3 tools/same_home.py [git ref, default HEAD].

web/home.js is one function (one closure) built from the parts in web/home/ (tools/webapp.py, home_js). Inside it,
a function declaration is found wherever it is, so moving one changes nothing; everything else (a var with its value,
a listener, the start) runs in the order it's written. This compares the joined file now with the one at the ref:
  - every function, with the comment right above it, the same text, wherever it is now;
  - everything else, the same text in the same order;
  - the comments between them: listed when they differ (a new part's heading), never a failure, as they don't run.
Blank lines and which part a piece is in don't count. Python 3, standard library only.
"""
import os
import re
import subprocess
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import webapp  # noqa: E402


def joined_at(ref):
    """The joined web/home.js at a git ref (before web/home/ existed: web/home.js itself)."""
    def show(path):
        done = subprocess.run(['git', 'show', ref + ':' + path], cwd=ROOT, capture_output=True)
        return done.stdout.decode('utf-8') if done.returncode == 0 else None
    order = show('web/home/_order.txt')
    if order is None:
        return show('web/home.js')
    names = [l.strip() for l in order.splitlines() if l.strip() and not l.strip().startswith('#')]
    return ''.join(show('web/home/' + n) for n in names)


def pieces(text):
    """The top-level pieces of the file, in order: ('function', name, text) with its comment, ('code', text) and
    ('comment', text). A piece is what starts at the closure's own indent (2 spaces) or at the file's (0)."""
    lines = text.replace('\r\n', '\n').split('\n')
    out, comment, current = [], [], None

    def flush():
        nonlocal current
        if current:
            out.append(current)
        current = None

    for line in lines:
        if not line.strip():
            flush()
            if comment:
                out.append(('comment', '\n'.join(comment)))
                comment = []
            continue
        indent = len(line) - len(line.lstrip(' '))
        top = indent <= 2 and not re.match(r'^ {0,2}[}\])]', line)
        is_comment = re.match(r'^ {0,2}(//|/\*|\*)', line) or (current is None and re.match(r'^ {0,3}\*', line))
        if current is None and is_comment:
            comment.append(line)
            continue
        if current and current[0] == 'function':
            current = ('function', current[1], current[2] + '\n' + line)
            if line.rstrip() == '  }':
                flush()
            continue
        if top:
            flush()
            m = re.match(r'^  function (\w+)\(', line)
            head = '\n'.join(comment)
            comment = []
            if m:
                current = ('function', m.group(1), (head + '\n' if head else '') + line)
                if line.rstrip().endswith('}') and line.count('{') == line.count('}'):
                    flush()
            else:
                if head:
                    out.append(('comment', head))
                current = ('code', line)
            continue
        if current is None:
            current = ('code', line)
        else:
            current = (current[0], current[1] + '\n' + line) if current[0] == 'code' else current
    flush()
    if comment:
        out.append(('comment', '\n'.join(comment)))
    return out


def main():
    ref = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
    before_text = joined_at(ref)
    if before_text is None:
        sys.exit('No web/home.js at ' + ref)
    before, after = pieces(before_text), pieces(webapp.home_js().decode('utf-8'))
    problems = []

    fb = Counter(p[2] for p in before if p[0] == 'function')
    fa = Counter(p[2] for p in after if p[0] == 'function')
    for text in (fb - fa):
        problems.append('function changed or gone: ' + re.search(r'function (\w+)', text).group(1))
    for text in (fa - fb):
        problems.append('function new or changed: ' + re.search(r'function (\w+)', text).group(1))

    cb = [p[1] for p in before if p[0] == 'code']
    ca = [p[1] for p in after if p[0] == 'code']
    if cb != ca:
        for i in range(max(len(cb), len(ca))):
            x = cb[i] if i < len(cb) else '(none)'
            y = ca[i] if i < len(ca) else '(none)'
            if x != y:
                problems.append('code out of order or changed at piece %d:\n    was: %s\n    now: %s'
                                % (i + 1, x.splitlines()[0][:100], y.splitlines()[0][:100]))
                break

    mb = Counter(p[1] for p in before if p[0] == 'comment')
    ma = Counter(p[1] for p in after if p[0] == 'comment')
    for text in (mb - ma):
        print('  note: comment changed or gone: ' + text.strip().splitlines()[0][:100])
    for text in (ma - mb):
        print('  note: comment new or changed: ' + text.strip().splitlines()[0][:100])

    names = sum(1 for p in after if p[0] == 'function')
    if problems:
        print('web/home.js changed more than a move (against %s):' % ref)
        for p in problems[:30]:
            print('  ' + p)
        sys.exit(1)
    print('OK: against %s, web/home.js only moved pieces (%d functions, %d other pieces in the same order).'
          % (ref, names, len(ca)))


if __name__ == '__main__':
    main()
