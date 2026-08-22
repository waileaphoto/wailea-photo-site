#!/usr/bin/env python3
"""Check the invariants that keep this site legible to search and AI crawlers.

Every one of these checks exists because the invariant was broken at some point
and nothing noticed. Run it before you push; CI runs it on every push and PR.

    python3 tools/check-site.py          # report problems, exit 1 if any
    python3 tools/check-site.py --fix    # apply the safe automatic fixes first

--fix handles the two things a machine can do correctly on its own: syncing the
footer out of footer.html, and regenerating sitemap.xml from each page's own
dateModified. Everything else needs a human, because it needs a sentence written
about the page rather than a field filled in.
"""
import glob
import io
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://waileaphoto.com'

# footer.html is a fragment, not a page. atlas-template.html is the source
# template for generated Atlas pages and is served noindex on purpose.
NOT_PAGES = {'footer.html', 'atlas-template.html'}

SM_NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

problems = []
notes = []


def fail(check, message):
    problems.append((check, message))


def read(path):
    return io.open(os.path.join(ROOT, path), encoding='utf-8', errors='replace').read()


def pages():
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(p)
        if name not in NOT_PAGES:
            out.append(name)
    return out


def slug(name):
    return name[:-5]


def url_slug(url):
    tail = url.rstrip('/').split('/')[-1]
    if tail in ('', 'waileaphoto.com'):
        return 'index'
    return tail[:-5] if tail.endswith('.html') else tail


# --------------------------------------------------------------------------
# fixes
# --------------------------------------------------------------------------

def fix_footer():
    import subprocess
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'sync-footer.py')],
                       capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode:
        sys.stdout.write(r.stderr)


def date_modified(name):
    found = re.findall(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})', read(name))
    return max(found) if found else None


def fix_sitemap():
    path = os.path.join(ROOT, 'sitemap.xml')
    urls = re.findall(r'<loc>\s*(.*?)\s*</loc>', io.open(path, encoding='utf-8').read())
    have = {url_slug(u) for u in urls}
    added = []
    for name in pages():
        if slug(name) not in have:
            urls.append('%s/%s' % (SITE, slug(name)))
            added.append(slug(name))
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', '']
    for u in urls:
        s = url_slug(u)
        d = date_modified(s + '.html') if os.path.exists(os.path.join(ROOT, s + '.html')) else None
        out.append('  <url>')
        out.append('    <loc>%s</loc>' % u)
        if d:
            out.append('    <lastmod>%s</lastmod>' % d)
        out.append('  </url>')
    out += ['', '</urlset>']
    io.open(path, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print('sitemap: %d urls%s' % (len(urls), (', added ' + ', '.join(added)) if added else ''))


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------

def check_footer():
    footer = read('footer.html').strip()
    for name in pages():
        s = read(name)
        if 'footer-placeholder' in s or "fetch('footer.html')" in s:
            fail('footer', '%s still loads its footer with JavaScript - crawlers will not see those links' % name)
        m = re.search(r'<footer[^>]*>.*?</footer>', s, re.S)
        if not m:
            fail('footer', '%s has no <footer> - run tools/sync-footer.py' % name)
        elif m.group(0) != footer:
            fail('footer', '%s footer differs from footer.html - run tools/sync-footer.py' % name)
    if "fetch('footer.html')" in read('assets/site.js'):
        fail('footer', 'assets/site.js fetches footer.html again')


def check_head_tags():
    for name in pages():
        s = read(name)
        if 'rel="canonical"' not in s:
            fail('head', '%s has no canonical link' % name)
        if 'name="description"' not in s:
            fail('head', '%s has no meta description' % name)
        if 'property="og:' not in s:
            fail('head', '%s has no Open Graph tags' % name)
        n = len(re.findall(r'<h1[\s>]', s))
        if n != 1:
            fail('head', '%s has %d <h1> elements, expected exactly 1' % (name, n))


def check_schema():
    for name in pages():
        s = read(name)
        blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
        if not blocks:
            fail('schema', '%s has no JSON-LD' % name)
        for b in blocks:
            try:
                json.loads(b)
            except ValueError as e:
                fail('schema', '%s has malformed JSON-LD: %s' % (name, str(e)[:80]))
        if 'dateModified' not in s:
            fail('schema', '%s has no dateModified - crawlers cannot tell it is current' % name)


def check_sitemap():
    root = ET.parse(os.path.join(ROOT, 'sitemap.xml')).getroot()
    entries = root.findall('s:url', SM_NS)
    listed = {}
    for e in entries:
        loc = e.find('s:loc', SM_NS).text.strip()
        lm = e.find('s:lastmod', SM_NS)
        listed[url_slug(loc)] = lm.text.strip() if lm is not None else None
    for name in pages():
        sl = slug(name)
        if sl not in listed:
            fail('sitemap', '%s is not in sitemap.xml - run with --fix' % name)
            continue
        if listed[sl] is None:
            fail('sitemap', '%s has no <lastmod> in sitemap.xml - run with --fix' % name)
            continue
        d = date_modified(name)
        if d and listed[sl] != d:
            fail('sitemap', '%s lastmod is %s but the page says %s - run with --fix'
                 % (name, listed[sl], d))
    known = {slug(n) for n in pages()}
    for sl in listed:
        if sl not in known and sl != 'index':
            fail('sitemap', 'sitemap.xml lists %s but there is no such page' % sl)


def check_llms():
    both = read('llms.txt') + read('llms-full.txt')
    for name in pages():
        sl = slug(name)
        if sl == 'index':
            continue
        if sl not in both:
            fail('llms', '%s is in neither llms.txt nor llms-full.txt - AI crawlers read those '
                         'files as the map of this site, so add a line describing the page' % name)


def check_orphans():
    src = {n: read(n) for n in pages()}
    for name in pages():
        sl = slug(name)
        if sl == 'index':
            continue
        pattern = re.compile(r'href="(?:\./|/)?%s(?:\.html)?(?:[#?][^"]*)?"' % re.escape(sl))
        inbound = sum(1 for other, s in src.items() if other != name and pattern.search(s))
        if inbound == 0:
            fail('orphans', '%s has no inbound internal links - nothing can crawl to it. Add it to '
                            'footer.html (then run tools/sync-footer.py) or link it from a related page' % name)


def check_asset_versions():
    versions = set()
    unversioned = []
    for name in pages():
        s = read(name)
        for attr, asset in (('href', 'site.css'), ('src', 'site.js')):
            for m in re.finditer(r'%s="[^"]*%s(\?v=[^"]*)?"' % (attr, re.escape(asset)), s):
                if m.group(1):
                    versions.add(m.group(1))
                else:
                    unversioned.append('%s (%s)' % (name, asset))
    for u in unversioned:
        fail('assets', '%s has no ?v= cache-busting version' % u)
    if len(versions) > 1:
        fail('assets', 'site.css/site.js use %d different ?v= versions (%s) - a returning visitor '
                       'can end up with new markup and old CSS'
             % (len(versions), ', '.join(sorted(versions))))


def check_review_counts():
    """The combined review total is hand-maintained in several places at once."""
    s = read('index.html')
    seen = {}

    m = re.search(r'id="combinedReviewCount">([\d,]+)<', s)
    if m:
        seen['visible total'] = int(m.group(1).replace(',', ''))

    rows = re.findall(r'class="crb-count">(\d+)<', s)
    if rows:
        seen['breakdown rows'] = sum(int(r) for r in rows)

    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            d = json.loads(b)
        except ValueError:
            continue
        if d.get('@id', '').endswith('#organization'):
            ar = d.get('aggregateRating', {}).get('ratingCount')
            if ar:
                seen['LocalBusiness ratingCount'] = int(ar)
        if d.get('@id', '').endswith('#review-breakdown'):
            seen['#review-breakdown schema'] = sum(
                int(i['item']['ratingCount']) for i in d.get('itemListElement', []))

    for f in ('llms.txt', 'llms-full.txt'):
        nums = {int(n.replace(',', '')) for n in re.findall(r'([\d,]{4,}) reviews', read(f))}
        if len(nums) == 1:
            seen[f] = nums.pop()
        elif len(nums) > 1:
            fail('reviews', '%s quotes more than one review total: %s' % (f, sorted(nums)))

    if len(set(seen.values())) > 1:
        detail = ', '.join('%s=%s' % (k, v) for k, v in sorted(seen.items()))
        fail('reviews', 'the combined review total disagrees between places: %s' % detail)
    elif seen:
        notes.append('review total consistent at %d across %d places'
                     % (list(seen.values())[0], len(seen)))


CHECKS = [check_footer, check_head_tags, check_schema, check_sitemap,
          check_llms, check_orphans, check_asset_versions, check_review_counts]


def main():
    if '--fix' in sys.argv:
        fix_footer()
        fix_sitemap()
        print()

    for c in CHECKS:
        c()

    if notes:
        for n in notes:
            print('ok: %s' % n)
        print()

    if not problems:
        print('all site checks passed (%d pages)' % len(pages()))
        return 0

    by_check = {}
    for name, msg in problems:
        by_check.setdefault(name, []).append(msg)
    for name in sorted(by_check):
        print('%s:' % name)
        for msg in by_check[name]:
            print('  - %s' % msg)
        print()
    print('%d problem(s) across %d check(s)' % (len(problems), len(by_check)))
    return 1


if __name__ == '__main__':
    sys.exit(main())
