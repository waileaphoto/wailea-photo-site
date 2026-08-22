#!/usr/bin/env python3
"""Scaffold a new Atlas page with everything a crawler needs already in place.

Adding a page by hand means remembering a canonical, Open Graph tags, a
dateModified, a sitemap entry, an inbound link and a line in llms.txt. Miss one
and the page is invisible to either search or AI assistants. This writes the
page from atlas-template.html, registers it in the sitemap, and tells you the
two things it cannot decide for you.

    python3 tools/new-page.py wailea-sunrise-guide \
        --title "Sunrise Sessions in Wailea" \
        --description "When to shoot sunrise in Wailea, which beaches face east, and how early to arrive." \
        --heading "Sunrise sessions in Wailea" \
        --breadcrumb "Sunrise Sessions" \
        --subtitle "Light, timing and parking for an early start." \
        --hero-alt "Sunrise over Keawakapu Beach in Wailea"

Then do the two manual steps it prints: add a line to llms.txt, and link the
page from somewhere (footer.html for a service page, a related guide otherwise).
"""
import argparse
import datetime
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = 'atlas-template.html'

FIELDS = {
    'PAGE_TITLE': 'title',
    'META_DESCRIPTION': 'description',
    'MAIN_TITLE': 'heading',
    'BREADCRUMB_NAME': 'breadcrumb',
    'SUBTITLE': 'subtitle',
    'HERO_IMG_ALT': 'hero_alt',
}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('slug', help='url slug, e.g. wailea-sunrise-guide (no .html)')
    ap.add_argument('--title', required=True,
                    help='page title WITHOUT the " | The Maui Atlas" suffix - the template adds it')
    ap.add_argument('--description', required=True, help='meta description')
    ap.add_argument('--heading', required=True, help='the page <h1>')
    ap.add_argument('--breadcrumb', help='breadcrumb label (defaults to --heading)')
    ap.add_argument('--subtitle', default='', help='hero subtitle')
    ap.add_argument('--hero-alt', default='', dest='hero_alt', help='alt text for the hero image')
    args = ap.parse_args()

    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.slug):
        sys.exit('slug must be lowercase words separated by hyphens: %r' % args.slug)
    dest = os.path.join(ROOT, args.slug + '.html')
    if os.path.exists(dest):
        sys.exit('%s.html already exists' % args.slug)
    if not args.breadcrumb:
        args.breadcrumb = args.heading

    # The template already renders "<title>{{PAGE_TITLE}} | The Maui Atlas</title>",
    # so a title that carries the suffix would end up with it twice.
    suffix = ' | The Maui Atlas'
    if args.title.endswith(suffix):
        args.title = args.title[:-len(suffix)]
        print('note: dropped the trailing "%s" - the template adds it' % suffix.strip(' |'))

    s = io.open(os.path.join(ROOT, TEMPLATE), encoding='utf-8').read()
    s = s.replace('{{SLUG}}', args.slug)
    for token, field in FIELDS.items():
        s = s.replace('{{%s}}' % token, getattr(args, field))

    today = datetime.date.today().isoformat()
    s = re.sub(r'"dateModified"\s*:\s*"\d{4}-\d{2}-\d{2}"', '"dateModified":"%s"' % today, s)
    s = re.sub(r'"datePublished"\s*:\s*"\d{4}-\d{2}-\d{2}"', '"datePublished":"%s"' % today, s)

    left = re.findall(r'\{\{[A-Z_]+\}\}', s)
    if left:
        sys.exit('template still has unfilled placeholders: %s' % ', '.join(sorted(set(left))))

    io.open(dest, 'w', encoding='utf-8').write(s)
    print('wrote %s.html' % args.slug)

    # The template ships noindex via netlify.toml; a real page must be indexable.
    print('registering in sitemap and syncing the footer:')
    sys.stdout.flush()
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'check-site.py'), '--fix'],
                   cwd=ROOT)

    print()
    print('Two things left that need you, not the script:')
    print('  1. Add a line to llms.txt (and llms-full.txt if it belongs there):')
    print('       - %s: https://waileaphoto.com/%s - %s'
          % (args.breadcrumb, args.slug, args.description))
    print('  2. Give it an inbound link. A service page goes in footer.html')
    print('     (then run tools/sync-footer.py); a guide is better linked from a')
    print('     related guide so the link sits in context.')
    print()
    print('Then run: python3 tools/check-site.py')


if __name__ == '__main__':
    main()
