#!/usr/bin/env python3
"""Copy footer.html into every page's inline <footer> block.

The footer used to be pulled in at runtime with fetch('footer.html'), which meant
none of its ~29 internal links existed in the served HTML. Search crawlers and AI
assistants generally do not run JavaScript, so every page looked far more weakly
linked than it is. The footer is now inlined into each page instead.

footer.html remains the single source of truth: edit it, then run this script to
push the change out to every page.

    python3 tools/sync-footer.py           # rewrite pages that differ
    python3 tools/sync-footer.py --check   # exit 1 if any page is stale
"""
import glob, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOOTER_RE = re.compile(r'<footer[^>]*>.*?</footer>', re.S)


def main():
    check = '--check' in sys.argv
    footer = io.open(os.path.join(ROOT, 'footer.html'), encoding='utf-8').read().strip()
    if not (footer.startswith('<footer') and footer.endswith('</footer>')):
        sys.exit('footer.html must be exactly one <footer> element')

    stale, missing = [], []
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(path)
        if name in ('footer.html', 'atlas-template.html'):
            continue
        s = io.open(path, encoding='utf-8').read()
        m = FOOTER_RE.search(s)
        if not m:
            missing.append(name)
            continue
        if m.group(0) == footer:
            continue
        stale.append(name)
        if not check:
            io.open(path, 'w', encoding='utf-8').write(s[:m.start()] + footer + s[m.end():])

    for n in missing:
        print('no <footer> element: %s' % n)
    if check:
        for n in stale:
            print('stale footer: %s' % n)
        if stale or missing:
            sys.exit(1)
        print('all footers in sync')
    else:
        print('updated %d page(s)' % len(stale))
        if missing:
            sys.exit(1)


if __name__ == '__main__':
    main()
