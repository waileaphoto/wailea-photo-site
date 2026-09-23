#!/usr/bin/env python3
"""Generate translated copies of every page (/fr/, /es/, ...) from the English source.

The English *.html files in the repo root stay the only thing anyone edits.
This script reads them, translates only the strings that are new or changed,
and writes fr/<page>.html, es/<page>.html, etc. Translations are cached in
i18n/cache/<lang>.json, keyed by the English text, so an edit to one paragraph
re-translates that paragraph and nothing else.

It also keeps three things in sync on every page, English included:
  - the EN / FR / ES switcher in the header
  - <link rel="alternate" hreflang> tags, so Google serves each language
  - sitemap-i18n.xml, listed in robots.txt

Usage:
    python3 tools/i18n/build.py              # translate + render (needs ANTHROPIC_API_KEY)
    python3 tools/i18n/build.py --no-api     # render from cache only; missing strings stay English
    python3 tools/i18n/build.py --fake       # offline test run with a dummy translator

Standard library only, like the rest of tools/.
"""
import argparse
import concurrent.futures as cf
import glob
import hashlib
import html
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_PATH = os.path.join(ROOT, 'i18n', 'config.json')
CACHE_DIR = os.path.join(ROOT, 'i18n', 'cache')
SITE = 'https://waileaphoto.com'

# Not pages, or deliberately noindex: never translated.
SKIP_PAGES = {'footer.html', 'atlas-template.html', 'hold-followup.html'}

INLINE = {'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'data', 'dfn', 'em', 'i',
          'kbd', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time',
          'u', 'var', 'wbr', 'img'}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
        'source', 'track', 'wbr'}
# Contents never translated.
OPAQUE = {'svg', 'code', 'pre', 'kbd', 'samp', 'math', 'template'}
TEXT_ATTRS = ('alt', 'title', 'aria-label', 'placeholder')
META_KEYS = {'description', 'og:title', 'og:description', 'og:image:alt',
             'twitter:title', 'twitter:description', 'twitter:image:alt'}
URL_ATTRS = ('href', 'src', 'poster', 'data-src', 'action', 'data-href', 'data-bg')
JSONLD_TEXT_KEYS = {'description', 'text', 'headline', 'caption', 'abstract'}
JSONLD_NAME_TYPES = {'Question', 'HowTo', 'HowToStep', 'Service', 'Offer', 'Product',
                     'Article', 'BlogPosting', 'WebPage', 'FAQPage', 'ItemList', 'ListItem'}

TOKEN_RE = re.compile(
    r'<!--.*?-->|<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<![^>]*>|<[^>]+>|[^<]+',
    re.S | re.I)
TAG_NAME_RE = re.compile(r'<\s*(/?)\s*([a-zA-Z][a-zA-Z0-9-]*)')
ATTR_RE = re.compile(r'''([^\s"'<>/=]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?''')
PH_RE = re.compile(r'</?x(\d+)/?>')
HAS_LETTERS = re.compile(r'[^\W\d_]{2,}', re.U)


# --------------------------------------------------------------------------
# config / cache
# --------------------------------------------------------------------------

def load_config():
    with open(CONFIG_PATH, encoding='utf-8') as f:
        return json.load(f)


class Cache:
    def __init__(self, lang):
        self.path = os.path.join(CACHE_DIR, lang + '.json')
        self.lock = threading.Lock()
        self.used = set()
        try:
            with open(self.path, encoding='utf-8') as f:
                self.data = json.load(f)
        except FileNotFoundError:
            self.data = {}

    def get(self, src):
        self.used.add(src)
        return self.data.get(src)

    def put_many(self, pairs):
        with self.lock:
            self.data.update(pairs)
            self.save()

    def save(self, prune=False):
        if prune:
            self.data = {k: v for k, v in self.data.items() if k in self.used}
        os.makedirs(CACHE_DIR, exist_ok=True)
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(dict(sorted(self.data.items())), f, ensure_ascii=False, indent=0)
            f.write('\n')
        os.replace(tmp, self.path)


# --------------------------------------------------------------------------
# page model
# --------------------------------------------------------------------------

def pages():
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(p)
        if name not in SKIP_PAGES:
            out.append(name)
    return out


def page_slug(name):
    s = name[:-5]
    return '' if s == 'index' else s


def page_url(name, lang=None, default_lang='en'):
    s = page_slug(name)
    prefix = '' if (lang is None or lang == default_lang) else '/' + lang
    if s == '':
        return SITE + prefix + '/'
    return SITE + prefix + '/' + s


def tag_info(tok):
    m = TAG_NAME_RE.match(tok)
    if not m:
        return None, False, False
    name = m.group(2).lower()
    closing = bool(m.group(1))
    selfclose = tok.rstrip().endswith('/>') or name in VOID
    return name, closing, selfclose


def get_attr(tok, attr):
    m = re.search(r'\s%s\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))' % re.escape(attr), tok, re.I)
    if not m:
        return None
    return next(g for g in m.groups()[1:] if g is not None)


def set_attr(tok, attr, value):
    """Replace attr's value, preserving everything else in the tag."""
    enc = value.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')
    pat = re.compile(r'(\s%s\s*=\s*)("[^"]*"|\'[^\']*\'|[^\s>]+)' % re.escape(attr), re.I)
    if pat.search(tok):
        return pat.sub(lambda m: m.group(1) + '"' + enc + '"', tok, count=1)
    return tok


def is_opaque_open(tok, name):
    if name in OPAQUE:
        return True
    if (get_attr(tok, 'translate') or '').lower() == 'no':
        return True
    cls = get_attr(tok, 'class') or ''
    return 'notranslate' in cls.split()


# --------------------------------------------------------------------------
# extraction: turn a page into tokens + translation units
# --------------------------------------------------------------------------

class Unit:
    """A run of text and inline tags between two block boundaries."""

    def __init__(self, tokens):
        self.tokens = tokens  # indices into the page's token list


def to_placeholders(toks):
    """['Call ', '<a href=x>', 'us', '</a>'] -> ('Call <x0>us</x0>', {0: ('<a href=x>', '</a>')}).
    Returns None if the inline tags are not balanced."""
    out, stack, tags, n = [], [], {}, 0
    for t in toks:
        if t.startswith('<'):
            name, closing, selfclose = tag_info(t)
            if closing:
                if not stack or stack[-1][1] != name:
                    return None
                i, _ = stack.pop()
                tags[i] = (tags[i][0], t)
                out.append('</x%d>' % i)
            elif selfclose:
                tags[n] = (t, None)
                out.append('<x%d/>' % n)
                n += 1
            else:
                tags[n] = (t, None)
                stack.append((n, name))
                out.append('<x%d>' % n)
                n += 1
        else:
            out.append(html.unescape(t))
    if stack:
        return None
    return ''.join(out), tags


def from_placeholders(text, tags):
    def esc(s):
        return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    out, pos = [], 0
    for m in PH_RE.finditer(text):
        out.append(esc(text[pos:m.start()]))
        i = int(m.group(1))
        tok = m.group(0)
        open_t, close_t = tags[i]
        out.append(close_t if tok.startswith('</') else open_t)
        pos = m.end()
    out.append(esc(text[pos:]))
    return ''.join(out)


def placeholders_ok(src, dst):
    """Every placeholder kept exactly once, and still properly nested."""
    if sorted(re.findall(r'</?x\d+/?>', src)) != sorted(re.findall(r'</?x\d+/?>', dst)):
        return False
    stack = []
    for m in re.finditer(r'<(/?)x(\d+)(/?)>', dst):
        if m.group(3):
            continue
        if not m.group(1):
            stack.append(m.group(2))
        elif not stack or stack.pop() != m.group(2):
            return False
    return not stack


def split_siblings(toks):
    """If toks are 2+ top-level inline elements separated only by whitespace, return
    their (start, end) spans; otherwise None."""
    spans, depth, start = [], 0, None
    for i, t in enumerate(toks):
        if t.startswith('<'):
            name, closing, selfclose = tag_info(t)
            if closing:
                depth -= 1
                if depth == 0:
                    spans.append((start, i + 1))
                elif depth < 0:
                    return None
            elif selfclose:
                if depth == 0:
                    if name != 'br':
                        spans.append((i, i + 1))
            else:
                if depth == 0:
                    start = i
                depth += 1
        elif depth == 0 and t.strip():
            return None
    if depth != 0 or len(spans) < 2:
        return None
    return spans


def worth_translating(s):
    plain = PH_RE.sub(' ', s)
    return bool(HAS_LETTERS.search(plain))


def split_ws(s):
    m = re.match(r'^(\s*)(.*?)(\s*)$', s, re.S)
    return m.group(1), m.group(2), m.group(3)


class Page:
    def __init__(self, name):
        self.name = name
        with open(os.path.join(ROOT, name), encoding='utf-8') as f:
            self.src = f.read()
        self.tokens = TOKEN_RE.findall(self.src)
        assert ''.join(self.tokens) == self.src, name
        self.units = []      # list of (start, end, core_placeholder_text, tags, lead_ws, trail_ws)
        self.attr_strings = set()
        self.jsonld_strings = set()
        self._scan()

    def _scan(self):
        run = []
        opaque = []  # stack of tag names we're inside of and must not touch
        for i, t in enumerate(self.tokens):
            if t.startswith('<!--') or t.lower().startswith('<!'):
                self._flush(run); run = []
                continue
            low = t[:8].lower()
            if low.startswith('<script'):
                self._flush(run); run = []
                if 'ld+json' in t[:200].lower() and not opaque:
                    self._scan_jsonld(t)
                continue
            if low.startswith('<style'):
                self._flush(run); run = []
                continue
            if t.startswith('<'):
                name, closing, selfclose = tag_info(t)
                if name is None:
                    continue
                if opaque:
                    if closing and name == opaque[-1]:
                        opaque.pop()
                    elif not closing and not selfclose and name == opaque[-1]:
                        opaque.append(name)
                    continue
                if not closing and not is_opaque_open(t, name):
                    self._scan_attrs(t, name)
                if not closing and not selfclose and is_opaque_open(t, name):
                    self._flush(run); run = []
                    opaque.append(name)
                    continue
                if name in INLINE:
                    run.append(i)
                else:
                    self._flush(run); run = []
            else:
                if opaque:
                    continue
                run.append(i)
        self._flush(run)

    def _scan_attrs(self, tok, name):
        for a in TEXT_ATTRS:
            v = get_attr(tok, a)
            if v and worth_translating(html.unescape(v)):
                self.attr_strings.add(html.unescape(v).strip())
        if name == 'meta':
            key = (get_attr(tok, 'name') or get_attr(tok, 'property') or '').lower()
            v = get_attr(tok, 'content')
            if key in META_KEYS and v and worth_translating(html.unescape(v)):
                self.attr_strings.add(html.unescape(v).strip())
        if name == 'input' and (get_attr(tok, 'type') or '').lower() in ('submit', 'button'):
            v = get_attr(tok, 'value')
            if v and worth_translating(html.unescape(v)):
                self.attr_strings.add(html.unescape(v).strip())

    def _scan_jsonld(self, tok):
        body = re.sub(r'(?is)^<script[^>]*>|</script\s*>$', '', tok)
        try:
            data = json.loads(body)
        except ValueError:
            return
        for s in jsonld_walk(data):
            self.jsonld_strings.add(s)

    def _flush(self, run):
        if not run:
            return
        toks = [self.tokens[i] for i in run]
        # Peel off tags that open/close outside this run (e.g. <a> wrapping a whole card).
        lo, hi = 0, len(toks)
        while lo < hi and (toks[lo].startswith('</') or not toks[lo].strip()):
            lo += 1
        while hi > lo and ((toks[hi - 1].startswith('<') and not toks[hi - 1].startswith('</')
                            and not tag_info(toks[hi - 1])[2]) or not toks[hi - 1].strip()):
            hi -= 1
        if lo >= hi:
            return
        core = toks[lo:hi]
        # A run that is just a list of sibling links/spans (menus, footers, tag lists)
        # is several separate strings, not one sentence: translate each on its own.
        parts = split_siblings(core)
        if parts:
            for a, b in parts:
                self._flush(run[lo + a: lo + b])
            return
        conv = to_placeholders(core)
        if conv is None:
            # Unbalanced inline markup: fall back to translating each text node alone.
            for j in range(lo, hi):
                t = toks[j]
                if not t.startswith('<'):
                    self._add_unit(run[j], run[j] + 1, [t])
            return
        self._add_unit(run[lo], run[hi - 1] + 1, core)

    def _add_unit(self, start, end, toks):
        conv = to_placeholders(toks)
        if conv is None:
            return
        text, tags = conv
        lead, core, trail = split_ws(text)
        if not worth_translating(core):
            return
        self.units.append((start, end, core, tags, lead, trail))

    def strings(self):
        return {u[2] for u in self.units} | self.attr_strings | self.jsonld_strings


def jsonld_walk(node):
    """Yield the JSON-LD strings a reader would see (descriptions, FAQ text, offer names)."""
    if isinstance(node, list):
        for x in node:
            yield from jsonld_walk(x)
    elif isinstance(node, dict):
        t = node.get('@type')
        types = set(t) if isinstance(t, list) else {t}
        for k, v in node.items():
            if isinstance(v, str):
                if (k in JSONLD_TEXT_KEYS or (k == 'name' and types & JSONLD_NAME_TYPES)) \
                        and worth_translating(v):
                    yield v.strip()
            else:
                yield from jsonld_walk(v)


def jsonld_walk_copy(node, tr, parent_type=None):
    if isinstance(node, list):
        return [jsonld_walk_copy(x, tr, parent_type) for x in node]
    if isinstance(node, dict):
        t = node.get('@type')
        types = set(t) if isinstance(t, list) else {t}
        out = {}
        for k, v in node.items():
            if isinstance(v, str):
                if (k in JSONLD_TEXT_KEYS or (k == 'name' and types & JSONLD_NAME_TYPES)) \
                        and worth_translating(v):
                    out[k] = tr(v.strip()) or v
                else:
                    out[k] = v
            else:
                out[k] = jsonld_walk_copy(v, tr, t)
        return out
    return node


# --------------------------------------------------------------------------
# translation
# --------------------------------------------------------------------------

def build_system_prompt(cfg, lang):
    L = cfg['languages'][lang]
    g = cfg['glossary']
    keep = ', '.join(g['keep_in_english'])
    fixed = '\n'.join('- "%s" -> "%s"' % (en, tr[lang]) for en, tr in g['fixed'].items() if lang in tr)
    return f"""You translate the website of Wailea Photo, a small family-run beach photography business in Wailea, Maui, Hawaii, from English into {L['name']}.

Voice: {L['register']} Warm, personal, plain and confident, like the family wrote it themselves. Never stiff, never salesy, never literal where a native writer would phrase it differently. Keep sentences roughly as long as the original.

Rules:
1. Tags like <x3>, </x3> and <x7/> are markup placeholders. Keep every one exactly once, spelled exactly the same. You may move them so they wrap the right translated words. Never add new ones.
2. Never translate these; keep them exactly as written: {keep}.
3. Always render these terms exactly this way:
{fixed}
4. Hawaiian words (aloha, mahalo, ohana/ʻohana, keiki, pau, lanai, and Hawaiian place names) stay in Hawaiian with their ʻokina and kahakō.
5. Keep prices in US dollars exactly as written ($299, not 299 $ or 299 USD). Keep phone numbers, email addresses, URLs, times and numbers exactly as written.
6. If a string is only a proper name, a brand, a number or code, return it unchanged.
7. Translate everything else fully, including short button and menu labels.

Input: a JSON array of English strings. Output: only a JSON object {{"t": [...]}} whose array holds the translations in the same order and has exactly the same length. No commentary."""


def call_claude(cfg, system, items, api_key):
    body = json.dumps({
        'model': cfg.get('model', 'claude-sonnet-5'),
        'max_tokens': 16000,
        'system': system,
        'messages': [{'role': 'user', 'content': json.dumps(items, ensure_ascii=False)}],
    }).encode('utf-8')
    req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=body, headers={
        'content-type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
    })
    delay = 5
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.load(r)
            text = ''.join(b.get('text', '') for b in data.get('content', []) if b.get('type') == 'text')
            text = text[text.find('{'): text.rfind('}') + 1]
            out = json.loads(text)['t']
            if len(out) != len(items):
                raise ValueError('got %d translations for %d strings' % (len(out), len(items)))
            return out
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')[:300]
            if e.code in (401, 403, 404):
                sys.exit('Anthropic API error %d: %s' % (e.code, msg))
            err = 'HTTP %d %s' % (e.code, msg)
        except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as e:
            err = str(e)
        print('  retry %d after error: %s' % (attempt + 1, err[:200]), flush=True)
        time.sleep(delay)
        delay = min(delay * 2, 90)
    raise RuntimeError('translation batch failed repeatedly')


def fake_translate(lang, items):
    def one(s):
        # Keeps placeholders, marks words, so structure bugs are obvious offline.
        return '[%s] %s' % (lang, s)
    return [one(s) for s in items]


def batches(items, max_chars=6000, max_items=80):
    cur, size = [], 0
    for s in items:
        if cur and (size + len(s) > max_chars or len(cur) >= max_items):
            yield cur
            cur, size = [], 0
        cur.append(s)
        size += len(s)
    if cur:
        yield cur


def translate_missing(cfg, lang, cache, wanted, mode, api_key, workers=4):
    missing = sorted(s for s in wanted if cache.get(s) is None)
    if not missing:
        print('%s: nothing new to translate' % lang)
        return []
    if mode == 'no-api':
        print('%s: %d strings not yet translated (left in English)' % (lang, len(missing)))
        return missing
    print('%s: translating %d new strings' % (lang, len(missing)), flush=True)
    system = build_system_prompt(cfg, lang)
    failed = []

    def work(batch):
        out = fake_translate(lang, batch) if mode == 'fake' else call_claude(cfg, system, batch, api_key)
        good, bad = {}, []
        for s, t in zip(batch, out):
            if isinstance(t, str) and t.strip() and placeholders_ok(s, t):
                good[s] = t.strip()
            else:
                bad.append(s)
        cache.put_many(good)
        return bad

    all_batches = list(batches(missing))
    with cf.ThreadPoolExecutor(max_workers=1 if mode == 'fake' else workers) as ex:
        for n, bad in enumerate(ex.map(work, all_batches), 1):
            failed.extend(bad)
            print('  %s batch %d/%d done' % (lang, n, len(all_batches)), flush=True)
    # One retry, one string at a time, for anything whose markup came back wrong.
    if failed and mode != 'fake':
        retry = failed
        failed = []
        for s in retry:
            try:
                bad = work([s])
            except RuntimeError:
                bad = [s]
            failed.extend(bad)
    for s in failed:
        print('  %s: kept English (markup mismatch): %s' % (lang, s[:90]))
    return failed


# --------------------------------------------------------------------------
# rendering
# --------------------------------------------------------------------------

def switcher_html(cfg, name, current):
    links = []
    for code in cfg['order']:
        L = cfg['languages'][code]
        href = page_url(name, code, cfg['default']).replace(SITE, '') or '/'
        cur = ' aria-current="true"' if code == current else ''
        links.append('<a href="%s" hreflang="%s" lang="%s" title="%s"%s>%s</a>'
                     % (href, code, code, L['native'], cur, code.upper()))
    return ('<!-- i18n:switcher --><nav class="lang-switch" translate="no" aria-label="%s">%s</nav><!-- /i18n:switcher -->'
            % (cfg['languages'][current]['switch_label'], ''.join(links)))


SWITCH_CSS = ('<style id="i18n-css">'
              '.lang-switch{display:flex;gap:12px;align-items:center}'
              '.lang-switch a{color:inherit;text-decoration:none;font-size:11px;font-weight:700;'
              'letter-spacing:.18em;opacity:.62;padding:4px 0;text-shadow:0 1px 12px rgba(0,0,0,.35)}'
              '.lang-switch a:hover,.lang-switch a:focus-visible{opacity:1}'
              '.lang-switch a[aria-current]{opacity:1;box-shadow:inset 0 -1px 0 currentColor}'
              '.lang-switch a:focus-visible{outline:1px solid currentColor;outline-offset:3px}'
              '@media(max-width:420px){.lang-switch{gap:9px}.lang-switch a{letter-spacing:.12em}}'
              '</style>')


def head_block(cfg, name):
    links = ['<link rel="alternate" hreflang="%s" href="%s">' % (c, page_url(name, c, cfg['default']))
             for c in cfg['order']]
    links.append('<link rel="alternate" hreflang="x-default" href="%s">' % page_url(name))
    return '<!-- i18n:head -->' + ''.join(links) + SWITCH_CSS + '<!-- /i18n:head -->'


def inject_blocks(doc, cfg, name, lang):
    doc = re.sub(r'<!-- i18n:head -->.*?<!-- /i18n:head -->', '', doc, flags=re.S)
    doc = re.sub(r'<!-- i18n:switcher -->.*?<!-- /i18n:switcher -->', '', doc, flags=re.S)
    doc = re.sub(r'(?i)</head>', head_block(cfg, name) + '\n</head>', doc, count=1)
    sw = switcher_html(cfg, name, lang)
    if '<div class="header-right">' in doc:
        doc = doc.replace('<div class="header-right">', '<div class="header-right">' + sw, 1)
    return doc


def rewrite_url(url, lang, slugs):
    """Point links at the translated page when there is one; everything else at the root."""
    u = url.strip()
    if not u or u.startswith(('#', 'mailto:', 'tel:', 'sms:', 'javascript:', 'data:', '//', '{{')):
        return url
    if u.startswith(SITE + '/') or u == SITE:
        path = u[len(SITE):] or '/'
        new = rewrite_url(path, lang, slugs)
        return SITE + new if new != path else url
    if re.match(r'^[a-z][a-z0-9+.-]*:', u, re.I):
        return url
    m = re.match(r'^([^?#]*)(.*)$', u)
    path, rest = m.group(1), m.group(2)
    rel = path.lstrip('./') if not path.startswith('/') else path[1:]
    s = rel[:-5] if rel.endswith('.html') else rel
    if s in ('', 'index'):
        s = ''
    if (s in slugs) and not path.startswith('/assets'):
        return '/%s/%s%s' % (lang, s, rest) if s else '/%s/%s' % (lang, rest)
    if path.startswith('/'):
        return url
    return '/' + rel + rest


def rewrite_css_urls(css):
    return re.sub(r'''url\(\s*(['"]?)(?!https?:|data:|/|#)([^'")]+)\1\s*\)''',
                  lambda m: 'url(%s/%s%s)' % (m.group(1), m.group(2).lstrip('./'), m.group(1)), css)


def transform_tag(tok, lang, slugs, tr, cfg, name):
    tname, closing, _ = tag_info(tok)
    if tname is None or closing:
        return tok
    if tname == 'html':
        return set_attr(tok, 'lang', lang) if get_attr(tok, 'lang') is not None else tok.replace('<html', '<html lang="%s"' % lang, 1)
    if tname == 'link' and (get_attr(tok, 'rel') or '').lower() == 'canonical':
        return set_attr(tok, 'href', page_url(name, lang, cfg['default']))
    if tname == 'meta':
        key = (get_attr(tok, 'name') or get_attr(tok, 'property') or '').lower()
        if key == 'og:url':
            return set_attr(tok, 'content', page_url(name, lang, cfg['default']))
        if key == 'og:locale':
            return set_attr(tok, 'content', cfg['languages'][lang]['og_locale'])
        v = get_attr(tok, 'content')
        if key in META_KEYS and v:
            t = tr(html.unescape(v).strip())
            return set_attr(tok, 'content', t) if t else tok
        return tok
    for a in TEXT_ATTRS:
        v = get_attr(tok, a)
        if v:
            t = tr(html.unescape(v).strip())
            if t:
                tok = set_attr(tok, a, t)
    if tname == 'input' and (get_attr(tok, 'type') or '').lower() in ('submit', 'button'):
        v = get_attr(tok, 'value')
        t = tr(html.unescape(v).strip()) if v else None
        if t:
            tok = set_attr(tok, 'value', t)
    rel = (get_attr(tok, 'rel') or '').lower()
    for a in URL_ATTRS:
        v = get_attr(tok, a)
        if v is None:
            continue
        raw = html.unescape(v)
        if a == 'href' and tname in ('a', 'area'):
            nv = rewrite_url(raw, lang, slugs)
        elif a == 'href' and tname == 'link' and rel in ('alternate', 'canonical'):
            continue
        else:
            nv = _asset_only(raw)
        if nv != raw:
            tok = set_attr(tok, a, nv)
    for a in ('srcset', 'data-srcset', 'imagesrcset'):
        v = get_attr(tok, a)
        if v:
            parts = []
            for p in v.split(','):
                bits = p.strip().split(None, 1)
                if bits:
                    bits[0] = _asset_only(bits[0])
                parts.append(' '.join(bits))
            tok = set_attr(tok, a, ', '.join(parts))
    st = get_attr(tok, 'style')
    if st and 'url(' in st:
        tok = set_attr(tok, 'style', rewrite_css_urls(html.unescape(st)))
    return tok


def _asset_only(u):
    """Non-navigation URLs (images, scripts, css): relative -> root-absolute."""
    s = u.strip()
    if not s or s.startswith(('/', '#', 'data:', 'mailto:', 'tel:', '{{')) or re.match(r'^[a-z][a-z0-9+.-]*:', s, re.I):
        return u
    return '/' + s.lstrip('./')


def render(page, lang, cfg, cache, slugs):
    def tr(s):
        return cache.data.get(s)

    toks = list(page.tokens)
    # 1. text units (replace spans of tokens with translated HTML)
    replaced = {}
    for (start, end, core, tags, lead, trail) in page.units:
        t = tr(core)
        if t is None:
            continue
        replaced[start] = (end, lead + from_placeholders(t, tags) + trail)
    out = []
    i = 0
    while i < len(toks):
        if i in replaced:
            end, htm = replaced[i]
            # Tags inside the unit were captured before attribute/url transforms; apply them now.
            out.append(TOKEN_RE.sub(lambda m: transform_tag(m.group(0), lang, slugs, tr, cfg, page.name)
                                    if m.group(0).startswith('<') else m.group(0), htm))
            i = end
            continue
        t = toks[i]
        low = t[:8].lower()
        if low.startswith('<script'):
            if 'ld+json' in t[:200].lower():
                t = translate_jsonld(t, tr, lang, cfg, page.name)
            else:
                t = re.sub(r'(?i)(<script\b[^>]*\bsrc\s*=\s*")([^"]+)',
                           lambda m: m.group(1) + _asset_only(m.group(2)), t, count=1)
            out.append(t)
        elif low.startswith('<style'):
            out.append(rewrite_css_urls(t))
        elif t.startswith('<!--') or t.startswith('<!'):
            out.append(t)
        elif t.startswith('<'):
            out.append(transform_tag(t, lang, slugs, tr, cfg, page.name))
        else:
            out.append(t)
        i += 1
    doc = ''.join(out)
    doc = inject_blocks(doc, cfg, page.name, lang)
    note = ('<!-- Generated by tools/i18n/build.py from %s. Do not edit: edit the English page '
            'and this copy is rebuilt on push. -->\n' % page.name)
    doc = re.sub(r'(?i)^(\s*<!doctype[^>]*>\s*)', lambda m: m.group(1) + note, doc, count=1)
    return doc


def translate_jsonld(tok, tr, lang, cfg, name):
    m = re.match(r'(?is)(<script[^>]*>)(.*?)(</script\s*>)$', tok)
    try:
        data = json.loads(m.group(2))
    except (ValueError, AttributeError):
        return tok
    data = jsonld_walk_copy(data, tr)

    def fix(node):
        if isinstance(node, dict):
            if 'inLanguage' in node:
                node['inLanguage'] = lang
            if node.get('@type') in ('WebPage', 'FAQPage', 'AboutPage', 'CollectionPage') and 'url' in node:
                node['url'] = page_url(name, lang, cfg['default'])
            for v in node.values():
                fix(v)
        elif isinstance(node, list):
            for v in node:
                fix(v)
    fix(data)
    body = json.dumps(data, ensure_ascii=False, indent=2).replace('</', '<\\/')
    return m.group(1) + '\n' + body + '\n' + m.group(3)


def write_sitemap(cfg, names):
    langs = [c for c in cfg['order'] if c != cfg['default']]
    rows = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for name in names:
        src = open(os.path.join(ROOT, name), encoding='utf-8').read()
        dates = re.findall(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})', src)
        for lang in langs:
            rows.append('  <url>')
            rows.append('    <loc>%s</loc>' % page_url(name, lang, cfg['default']))
            if dates:
                rows.append('    <lastmod>%s</lastmod>' % max(dates))
            for c in cfg['order']:
                rows.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>'
                            % (c, page_url(name, c, cfg['default'])))
            rows.append('  </url>')
    rows.append('</urlset>')
    with open(os.path.join(ROOT, 'sitemap-i18n.xml'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(rows) + '\n')
    robots = os.path.join(ROOT, 'robots.txt')
    r = open(robots, encoding='utf-8').read()
    line = 'Sitemap: %s/sitemap-i18n.xml' % SITE
    if line not in r:
        with open(robots, 'a', encoding='utf-8') as f:
            f.write(('' if r.endswith('\n') else '\n') + line + '\n')


def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument('--no-api', action='store_true', help='render from cache only')
    mode.add_argument('--fake', action='store_true', help='offline dummy translator (writes to a scratch cache)')
    ap.add_argument('--lang', action='append', help='only this language (repeatable)')
    ap.add_argument('--workers', type=int, default=4)
    args = ap.parse_args()

    cfg = load_config()
    langs = args.lang or [c for c in cfg['order'] if c != cfg['default']]
    run_mode = 'fake' if args.fake else 'no-api' if args.no_api else 'api'
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if run_mode == 'api' and not api_key:
        sys.exit('ANTHROPIC_API_KEY is not set. Add it as a GitHub Actions secret, or run with --no-api.')
    if run_mode == 'fake':
        global CACHE_DIR
        CACHE_DIR = os.path.join(ROOT, '.i18n-fake-cache')

    names = pages()
    parsed = [Page(n) for n in names]
    slugs = {page_slug(n) for n in names}
    wanted = set()
    for p in parsed:
        wanted |= p.strings()
    print('%d pages, %d unique strings' % (len(parsed), len(wanted)))

    untranslated = {}
    for lang in langs:
        cache = Cache(lang)
        untranslated[lang] = translate_missing(cfg, lang, cache, wanted, run_mode, api_key, args.workers)
        for s in wanted:
            cache.get(s)  # mark used
        cache.save(prune=(run_mode == 'api'))
        os.makedirs(os.path.join(ROOT, lang), exist_ok=True)
        keep = set()
        for p in parsed:
            out = render(p, lang, cfg, cache, slugs)
            path = os.path.join(ROOT, lang, p.name)
            keep.add(p.name)
            old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
            if old != out:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(out)
        for stale in glob.glob(os.path.join(ROOT, lang, '*.html')):
            if os.path.basename(stale) not in keep:
                os.remove(stale)

    # English sources get the switcher + hreflang block too.
    for n in names:
        path = os.path.join(ROOT, n)
        src = open(path, encoding='utf-8').read()
        out = inject_blocks(src, cfg, n, cfg['default'])
        if out != src:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(out)
    write_sitemap(cfg, names)

    left = sum(len(v) for v in untranslated.values())
    print('done: %s%s' % (', '.join('/%s/' % l for l in langs),
                          '' if not left else ' (%d strings still English)' % left))


if __name__ == '__main__':
    main()
