#!/usr/bin/env python3
"""Write the shared editorial header, menu and page-chrome includes into every page.

Like tools/sync-footer.py, the markup lives here once and is copied into each page's
HTML, so every link exists in the served page for crawlers and AI assistants (nothing
is injected by JavaScript). Each page keeps its own language switcher block
(<!-- i18n:switcher --> ... <!-- /i18n:switcher -->), which tools/i18n/build.py owns.

What it does on every English page:
  - replaces <header class="site-header"> with the editorial top bar
    (brand, language switcher, Concierge + Book Now pills, MENU)
  - replaces <nav class="menu"> with the editorial menu ("Guides" for the Atlas)
  - preloads the self-hosted fonts, adds assets/editorial.css after site.css and
    assets/luxe-theme.css last in <head>,
    the concierge widget (+ its config) and assets/editorial.js before </body>
  - adds the music toggle button

Page content, titles, meta, canonical, JSON-LD and hreflang are never touched.

    python3 tools/sync-chrome.py           # rewrite pages that differ
    python3 tools/sync-chrome.py --check   # exit 1 if any page is stale
"""
import glob, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'footer.html', 'hold-followup.html', 'frame-preview.html'}
EDITORIAL_V = '20261107a'
LUXE_V = '20261107e'

HEADER = ('<header class="site-header ed"><a href="index.html#top" class="brand">Wailea Photo</a>'
          '<div class="header-right">{switcher}'
          '<div class="ed-pills"><button class="ed-pill ed-ask" type="button" data-ed-concierge aria-label="Ask the Wailea Photo Concierge">Concierge</button>'
          '<a class="ed-pill ed-book" href="pricing.html#sessions">Book Now</a></div>'
          '<button class="menu-open-btn" aria-expanded="false">MENU</button></div></header>')

MENU = ('<nav class="menu ed" aria-hidden="true"><button class="menu-close" aria-label="Close menu">×</button>'
        '<a href="index.html#story-paths">Photography</a>'
        '<a href="pricing.html">Sessions &amp; Pricing</a>'
        '<a href="index.html#experience">Our Family</a>'
        '<a href="atlas.html">Guides</a>'
        '<a href="index.html#reviews">Reviews</a>'
        '<a href="faq.html">FAQ &amp; Contact</a>'
        '<div class="menu-foot">'
        '<a href="tides.html">Tides &amp; Sunset Times</a>'
        '<a href="what-to-wear-maui-photos.html">What to Wear</a>'
        '<a href="the-apo-difference.html">The APO Difference</a>'
        '<a href="our-florist">Our Florist</a>'
        '<a href="https://waileaphoto.pic-time.com/client" target="_blank" rel="noopener">Client Hall of Fame</a>'
        '<a href="corporate-events.html">Corporate Events</a>'
        '<a href="tel:+18082985188">808.298.5188</a>'
        '</div></nav>')

SND = ('<button class="ed-snd" type="button" aria-label="Turn music on" aria-pressed="false" '
       'data-src="assets/ambient.mp3"><span class="bars"><i></i><i></i><i></i><i></i></span></button>')

FONT_SC = ('<link rel="preload" as="font" type="font/woff2" href="assets/fonts/cormorant-latin-300-normal.woff2" crossorigin data-ed>'
           '<link rel="preload" as="font" type="font/woff2" href="assets/fonts/jost-latin-300-normal.woff2" crossorigin data-ed>')
# quiet-luxury theme: loaded last in <head> so it sits above page-specific CSS
LUXE = '<link rel="stylesheet" href="assets/luxe-theme.css?v=%s" data-ed>' % LUXE_V
CSS = '<link rel="stylesheet" href="assets/editorial.css?v=%s" data-ed>' % EDITORIAL_V
CONCIERGE_CSS = '<link rel="stylesheet" href="assets/concierge-widget.css" data-ed>'
BODY_END = ('<script data-ed>window.WBW_CONFIG=window.WBW_CONFIG||{apiBase:"https://book.waileaphoto.com"};</script>'
            '<script src="assets/concierge-widget.js" defer data-ed></script>'
            '<script src="assets/editorial.js?v=%s" defer data-ed></script>' % EDITORIAL_V)

HEADER_RE = re.compile(r'<header class="site-header[^"]*"[^>]*>.*?</header>', re.S)
MENU_RE = re.compile(r'<nav class="menu[^"]*"[^>]*>.*?</nav>\s*(?=<main|<section|<article|<div|<a |\n)', re.S)
SWITCH_RE = re.compile(r'<!-- i18n:switcher -->.*?<!-- /i18n:switcher -->', re.S)
ED_TAG_RE = re.compile(r'\s*(?:<script[^>]*\bdata-ed\b[^>]*>.*?</script>|<link[^>]*\bdata-ed\b[^>]*>)', re.S)
SND_RE = re.compile(r'\s*<button class="ed-snd".*?</button>', re.S)


def render(s, name):
    hm = HEADER_RE.search(s)
    if not hm:
        return None, 'no site-header'
    sw = SWITCH_RE.search(hm.group(0))
    s = s[:hm.start()] + HEADER.format(switcher=sw.group(0) if sw else '') + s[hm.end():]
    mm = re.search(r'<nav class="menu[^"]*"[^>]*>.*?</div></nav>', s, re.S) or re.search(r'<nav class="menu[^"]*"[^>]*>.*?</nav>', s, re.S)
    if mm:
        s = s[:mm.start()] + MENU + s[mm.end():]
    elif 'site.css' in s:
        # page has the shared header but never had the menu (e.g. art.html): add it after the header
        he = s.index('</header>', s.index('<header class="site-header ed"')) + len('</header>')
        s = s[:he] + '\n  ' + MENU + s[he:]
    else:
        return None, 'own layout, no shared stylesheet'
    # idempotent includes: strip ours, then add back in canonical places
    autostart = re.search(r'<button class="ed-snd"[^>]*data-autostart', s) is not None
    s = ED_TAG_RE.sub('', s)
    s = SND_RE.sub('', s)
    has_concierge = re.search(r'src="assets/concierge-widget\.js', s) is not None
    has_concierge_css = 'assets/concierge-widget.css' in s
    site_css = re.search(r'<link[^>]+href="assets/site\.css[^"]*"[^>]*>', s)
    head_add = FONT_SC + (CONCIERGE_CSS if not has_concierge_css else '') + CSS
    if site_css:
        s = s[:site_css.end()] + head_add + s[site_css.end():]
    else:
        s = s.replace('</head>', head_add + '\n</head>', 1)
    # sits just before the i18n head block (which tools/i18n/build.py re-adds before </head>), so the two never trade places
    anchor = '<!-- i18n:head -->' if '<!-- i18n:head -->' in s else '</head>'
    s = s.replace(anchor, LUXE + '\n' + anchor, 1)
    # tools/i18n/build.py and this script both write just before </head>; keep the gap from growing
    he = s.find('</head>')
    s = re.sub(r'\n[ \t]*(?:\n[ \t]*){2,}', '\n\n', s[:he]) + s[he:]
    snd = SND.replace('data-src=', 'data-autostart data-src=') if autostart else SND
    body_add = snd + (BODY_END if not has_concierge else BODY_END.split('<script src="assets/concierge-widget.js" defer data-ed></script>')[0]
                      + '<script src="assets/editorial.js?v=%s" defer data-ed></script>' % EDITORIAL_V)
    idx = s.rfind('</body>')
    s = s[:idx].rstrip() + '\n' + body_add + '\n' + s[idx:]
    return s, None


def main():
    check = '--check' in sys.argv
    stale, skipped = [], []
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(path)
        if name in SKIP:
            continue
        s = io.open(path, encoding='utf-8').read()
        out, why = render(s, name)
        if out is None:
            skipped.append('%s (%s)' % (name, why))
            continue
        if out != s:
            stale.append(name)
            if not check:
                io.open(path, 'w', encoding='utf-8', newline='').write(out)
    if skipped:
        print('skipped (own layout): ' + ', '.join(skipped))
    if check:
        if stale:
            print('stale chrome: ' + ', '.join(stale)); sys.exit(1)
        print('chrome in sync'); return
    print('updated %d page(s)' % len(stale))


if __name__ == '__main__':
    main()
