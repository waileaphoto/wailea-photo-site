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


def check_session_facts():
    """Session price, length and image count must agree everywhere they appear.

    These live in four places at once - the pricing card a visitor reads, the
    JSON-LD on the same page, llms.txt and llms-full.txt - with nothing keeping
    them in step. The 20-minute Sunrise session was published as "25+ images" in
    its card and "50+ edited images" in its own schema, so the page contradicted
    itself and an assistant reading it had no way to choose.
    """
    pricing = read('pricing.html')

    # what the JSON-LD offers claim
    schema = {}
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', pricing, re.S):
        try:
            d = json.loads(b)
        except ValueError:
            continue
        for node in (d.get('@graph') or [d]):
            if 'OfferCatalog' not in str(node.get('@type')):
                continue
            for offer in node.get('itemListElement', []):
                name = offer.get('name')
                desc = (offer.get('itemOffered') or {}).get('description', '')
                mins = re.search(r'(\d+)-(minute|hour)', desc)
                imgs = re.search(r'(\d+)\+ edited images', desc)
                schema[name] = {
                    'price': str(offer.get('price') or ''),
                    'minutes': (str(int(mins.group(1)) * (60 if mins.group(2) == 'hour' else 1))
                                if mins else None),
                    'images': imgs.group(1) if imgs else None,
                }

    # what the visitor actually reads on the card
    text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ',
                  re.sub(r'<(script|style)[^>]*>.*?</\1>', '', pricing, flags=re.S | re.I)))
    visible = {}
    for name in schema:
        i = text.find(name)
        if i < 0:
            continue
        window = text[i + len(name):i + len(name) + 90]
        mins = re.search(r'(\d+)\s*MIN', window, re.I)
        imgs = re.search(r'(\d+)\+\s*IMAGES', window, re.I)
        visible[name] = {'minutes': mins.group(1) if mins else None,
                         'images': imgs.group(1) if imgs else None}

    # what the llms files tell assistants
    llms = {}
    for f in ('llms.txt', 'llms-full.txt'):
        for line in read(f).split('\n'):
            # "20 min" and "1 hour" both appear; normalise so both are checked.
            m = re.match(r'\s*-\s+(.+?)\s+-\s+(\d+)\s*(min|hour)(?:s)?(?:,\s*(\d+)\+\s*images)?,\s*from \$(\d+)', line)
            if m:
                minutes = str(int(m.group(2)) * (60 if m.group(3) == 'hour' else 1))
                llms.setdefault(m.group(1).strip(), []).append(
                    {'file': f, 'minutes': minutes, 'images': m.group(4), 'price': m.group(5)})

    for name, s in sorted(schema.items()):
        for field in ('minutes', 'images'):
            v = visible.get(name, {}).get(field)
            if v and s[field] and v != s[field]:
                fail('sessions', '%s: the pricing card says %s %s but its own JSON-LD says %s'
                     % (name, v, field, s[field]))
        for entry in llms.get(name, []):
            for field in ('minutes', 'images', 'price'):
                a, b2 = entry.get(field), s.get(field)
                if a and b2 and a != b2:
                    fail('sessions', '%s: %s says %s %s but pricing.html says %s'
                         % (name, entry['file'], a, field, b2))

    covered = sum(1 for n in schema if n in llms)
    if schema:
        notes.append('session facts agree across %d offers (%d also described in the llms files)'
                     % (len(schema), covered))

CHECKS = [check_footer, check_head_tags, check_schema, check_sitemap,
          check_llms, check_orphans, check_asset_versions, check_review_counts,
          check_session_facts]


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
