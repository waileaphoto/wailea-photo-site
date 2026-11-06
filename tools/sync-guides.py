#!/usr/bin/env python3
"""Build the Guides section from tools/guides.json, as static HTML.

  - atlas.html: replaces the old card lists with a topic index (photo cards)
  - every guide page: a 'Keep reading' block of three related guides
  - each session page in guides.json "sessions": a 'From the Guides' block

Everything is written into the page between <!-- guides:... --> markers, so links
exist in the served HTML for search and AI crawlers, and re-running is safe.
Card titles come from each guide's <h1>; descriptions from the existing Atlas
card copy (or "blurbs" in guides.json); photos from each guide's og:image,
resized into assets/guides/.

    python3 tools/sync-guides.py           # rewrite
    python3 tools/sync-guides.py --check   # exit 1 if anything is stale
"""
import html, io, json, os, re, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(io.open(os.path.join(ROOT, 'tools', 'guides.json'), encoding='utf-8'))
THUMB_DIR = os.path.join(ROOT, 'assets', 'guides')
E = lambda s: html.escape(s, quote=True)
CHECK = '--check' in sys.argv
changed = []


def read(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8').read()


def write(p, s):
    if read(p) != s:
        changed.append(p)
        if not CHECK:
            io.open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='').write(s)


def strip(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


# --- card data -------------------------------------------------------------
atlas = read('atlas.html')
blurb = {}
for m in re.finditer(r'<article class="atlas-card">([\s\S]*?)</article>', atlas):
    b = m.group(1); h = re.search(r'href="([^"]+)"', b); p = re.search(r'<p>([\s\S]*?)</p>', b)
    if h and p:
        blurb.setdefault(h.group(1), strip(p.group(1)))
saved = os.path.join(ROOT, 'tools', 'guides-blurbs.json')   # keeps copy once the old cards are gone
if os.path.exists(saved):
    old = json.load(io.open(saved, encoding='utf-8')); old.update(blurb); blurb = old
if not CHECK:
    json.dump(blurb, io.open(saved, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
blurb.update(CFG.get('blurbs', {}))

topic_of = {}
for t in CFG['topics']:
    for p in t['pages']:
        topic_of[p] = t


def card_data(p):
    s = read(p)
    h1 = re.search(r'<h1[^>]*>([\s\S]*?)</h1>', s)
    title = strip(re.sub(r'<span class="eyebrow">[\s\S]*?</span>', '', h1.group(1))) if h1 else p
    title = CFG.get('titles', {}).get(p, title).rstrip('.')
    og = re.search(r'property="og:image" content="https://waileaphoto\.com/([^"]+)"', s)
    img = CFG.get('images', {}).get(p) or (urllib.parse.unquote(og.group(1)) if og else 'assets/hero-v5-web.jpg')
    desc = blurb.get(p) or (re.search(r'name="description" content="([^"]*)"', s) or [None, ''])[1]
    return {'title': title, 'desc': html.unescape(desc), 'img': img}


def thumb(p, src):
    slug = p[:-5]
    out = os.path.join(THUMB_DIR, slug + '.webp')
    if not os.path.exists(out) and not CHECK:
        from PIL import Image, ImageOps
        im = ImageOps.exif_transpose(Image.open(os.path.join(ROOT, src))).convert('RGB')
        w, h = im.size; tw, th = 720, 480
        r = max(tw / w, th / h); im = im.resize((round(w * r), round(h * r)), Image.LANCZOS)
        l = (im.width - tw) // 2; t = (im.height - th) // 2
        im.crop((l, t, l + tw, t + th)).save(out, 'WEBP', quality=76, method=6)
    return 'assets/guides/%s.webp' % slug


DATA = {}
for t in CFG['topics']:
    for p in t['pages']:
        d = card_data(p); d['thumb'] = thumb(p, d['img']); d['topic'] = t['title']; DATA[p] = d


def card(p, show_topic=True, lazy=True):
    d = DATA[p]
    return ('<a class="gcard" href="%s"><figure><img src="%s" width="720" height="480" alt="" %sdecoding="async"></figure>'
            '%s<h3>%s</h3><p>%s</p><span class="go">Read the guide</span></a>') % (
        p, d['thumb'], 'loading="lazy" ' if lazy else '',
        '<span class="gt">%s</span>' % E(d['topic']) if show_topic else '', E(d['title']), E(d['desc']))


# --- atlas.html topic index -------------------------------------------------
nav = ''.join('<a href="#g-%s">%s</a>' % (t['id'], E(t['title'])) for t in CFG['topics'])
topics = ''.join(
    '<section class="gtopic" id="g-%s" aria-labelledby="g-%s-h"><header><h2 id="g-%s-h">%s</h2><p>%s</p></header><div class="ggrid">%s</div></section>'
    % (t['id'], t['id'], t['id'], E(t['title']), E(t['lead']), ''.join(card(p, False) for p in t['pages'])) for t in CFG['topics'])
index = ('<!-- guides:index --><section class="guides-index" id="guides" aria-label="All guides by topic">'
         '<nav class="gnav" aria-label="Guide topics">%s</nav>%s'
         '<p class="gnote">Also for confirmed clients: <a href="https://book.waileaphoto.com/client/posing-guide">The Private Posing Guide</a> — natural movement, relaxed hands and flattering angles.</p>'
         '</section><!-- /guides:index -->') % (nav, topics)
a = atlas
if '<!-- guides:index -->' in a:
    a = re.sub(r'<!-- guides:index -->[\s\S]*?<!-- /guides:index -->', index, a)
else:
    first = a.index('<section class="atlas-explore"')
    last_end = a.index('<section class="atlas-philosophy"')
    a = a[:first] + index + '\n\n    ' + a[last_end:]
write('atlas.html', a)


# --- related blocks ---------------------------------------------------------
def related_for(p):
    t = topic_of[p]; pages = t['pages']; i = pages.index(p)
    out = [pages[(i + k) % len(pages)] for k in range(1, len(pages))][:3]
    for q in CFG['topics'][0]['pages']:
        if len(out) >= 3: break
        if q != p and q not in out: out.append(q)
    return out


def block(kind, title, pages):
    return ('<!-- guides:%s --><section class="guides-more" aria-labelledby="gm-h"><div class="gm-head"><span class="gm-k">Guides</span>'
            '<h2 id="gm-h">%s</h2><a class="gm-all" href="atlas.html#guides">All guides</a></div><div class="ggrid">%s</div></section><!-- /guides:%s -->'
            ) % (kind, E(title), ''.join(card(q) for q in pages), kind)


def place(p, kind, blk):
    s = read(p)
    pat = r'\s*<!-- guides:%s -->[\s\S]*?<!-- /guides:%s -->' % (kind, kind)
    s = re.sub(pat, '', s)
    i = s.rfind('</main>')
    if i < 0:
        i = s.find('<footer')
    s = s[:i].rstrip() + '\n' + blk + '\n' + s[i:]
    write(p, s)


for p in DATA:
    place(p, 'related', block('related', 'Keep reading', related_for(p)))
for p, pages in CFG['sessions'].items():
    place(p, 'from', block('from', 'From the Guides', pages))

if CHECK:
    if changed:
        print('stale: ' + ', '.join(changed)); sys.exit(1)
    print('guides in sync')
else:
    print('updated %d file(s)' % len(changed))
