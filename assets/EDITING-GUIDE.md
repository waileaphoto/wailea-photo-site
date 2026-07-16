# Editing the Wailea Photo site yourself

Everything is plain HTML/CSS — no build tools, no login. Open a file in any text editor (TextEdit in plain-text mode, VS Code, Notepad++), make a change, save, refresh the browser.

## Change text
Open the relevant page (`index.html`, `pricing.html`, `faq.html`, `corporate-events.html`, `our-florist.html`) and just edit the words between tags, e.g.:
```html
<h1>Maui's most awarded photography experience.</h1>
```
Leave the `<h1>` / `</h1>` parts alone — only change what's between them. Same idea everywhere: `<p>...</p>`, `<h2>...</h2>`, etc.

## Swap a photo
Every image looks like:
```html
<img src="assets/hero-v5-web.jpg" alt="...">
```
1. Drop your new photo into the `assets` folder.
2. Change `hero-v5-web.jpg` to your new filename (keep the `assets/` part).
3. Keep the `alt="..."` description accurate — it matters for SEO and accessibility.
Avoid filenames with spaces or special characters — use hyphens (`my-photo-1.jpg`) instead.

## Change colors or fonts (one place updates the whole site)
Open `assets/site.css`, scroll to the very top:
```css
:root{
  --paper:#f5efe5;   /* background */
  --ink:#1b1917;     /* body text */
  --charcoal:#171716;/* dark sections */
  --red:#9e2b23;     /* accent / buttons */
  --gold:#b99254;    /* accent 2 */
}
```
Change a hex code here and it updates everywhere that color is used, across all 5 pages.

## Add or remove a session on the Pricing page
Each session is one `.session-card` block. Copy an existing one, paste it, edit the price/title/description/links, done. Delete a whole `<div class="session-card">...</div>` block to remove one.

## Add or remove an FAQ question
In `faq.html`, each question is:
```html
<details class="faq-item">
  <summary>Your question here?</summary>
  <p>Your answer here.</p>
</details>
```
Copy/paste/edit to add one; delete the block to remove one.

## Add or remove a photo in "The Archive Collection" or "Art" slider (homepage)
These two sections use the same pattern — each photo is one `<figure>` inside the slider `<div>`. To add a photo:

**The Archive Collection** (`id="archiveSlider"`): copy any line like this one and paste it just before `</div>`:
```html
<figure><img src="assets/your-photo.jpg" alt="Description of the photo" loading="lazy"></figure>
```

**Art** (`id="artSlider"`): same idea, but each figure needs `class="art-slide"`:
```html
<figure class="art-slide"><img src="assets/your-photo.jpg" alt="Description of the photo" loading="lazy"></figure>
```

To remove a photo, delete its whole `<figure>...</figure>` line. The arrows and dots below the slider update automatically — you don't need to touch anything else. One tip: large photos slow the page down, so before adding a new one, resize it to roughly 2000px wide if it's a full-size camera file (anything over a few MB is worth shrinking first).

## Add a page to the menu
The navigation repeats at the top of every page (`<nav class="menu">`). Add a line like:
```html
<a href="your-new-page.html">Your Link Text</a>
```
Repeat the same line in all 5 files so the menu stays consistent everywhere.

## Things to leave alone
- The `id="..."` attributes (e.g. `id="archiveSlider"`, `id="portfolio"`) — the sliders and menu links depend on these exact names.
- `assets/site.js` — unless you're comfortable with JavaScript, no need to touch this.
- Class names like `session-card`, `faq-item`, `mood-copy` — renaming these breaks the styling.

## Preview your changes
Just double-click `index.html` (or any page) to open it in your browser. No server needed. Refresh after every save.

## Known placeholders to swap when ready
- `our-florist.html` — the 4 gallery photos and hero image are stand-ins; replace with Mya's real floral work.
- `corporate-events.html` — hero and portrait-station photos are stand-ins; replace with real event photos.
- The Elfsight review widget on the homepage needs your real widget ID confirmed before it will show live reviews.
