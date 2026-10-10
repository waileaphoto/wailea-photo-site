/**
 * Gallery photo lookup for the frame preview page.
 * Path when deployed: /.netlify/functions/gallery-photos
 *
 *   ?list=1            -> [{n: "Gloria Lo", p: "/Gloria-Lo"}, ...]  (top-level client galleries)
 *   ?g=/Gloria-Lo      -> {name, photos: [{id: "i-abc123", f: "WaileaPhoto-15.jpg"}, ...]}
 *
 * Reads only what SmugMug already shows publicly on waileaphoto.smugmug.com. The host is fixed,
 * so this cannot be pointed at any other site. Nothing is stored and no secret is needed:
 * the public API key is the one SmugMug embeds in its own pages.
 */
const SITE = 'https://waileaphoto.smugmug.com';
const API = 'https://www.smugmug.com/api/v2';
const PARENT_NODE = 'tRg5xN';

function json(code, body, cache) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache || 'no-store' },
    body: JSON.stringify(body)
  };
}

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'WaileaPhotoFramePreview/1.0' } });
  if (!r.ok) throw new Error('status ' + r.status);
  return r.text();
}
async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'WaileaPhotoFramePreview/1.0' } });
  if (!r.ok) throw new Error('status ' + r.status);
  return r.json();
}
async function apiKey() {
  const html = await getText(SITE + '/');
  const m = html.match(/APIKey["']?\s*[:=]\s*["']([A-Za-z0-9]+)/i);
  if (!m) throw new Error('no key');
  return m[1];
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Use GET.' });
  const q = event.queryStringParameters || {};
  try {
    const key = await apiKey();
    if (q.list) {
      const out = [];
      let start = 1;
      for (let i = 0; i < 6; i++) {
        const j = await getJson(API + '/node/' + PARENT_NODE + '!children?APIKey=' + key + '&count=100&start=' + start + '&_accept=application%2Fjson&_verbosity=1');
        const nodes = (j.Response && j.Response.Node) || [];
        nodes.forEach(function (n) {
          if (n.Type === 'Album' && n.UrlPath && n.Name && !/password/i.test(String(n.SecurityType || ''))) out.push({ n: n.Name, p: n.UrlPath });
        });
        const next = j.Response && j.Response.Pages && j.Response.Pages.NextPage;
        if (!next) break;
        start += 100;
      }
      return json(200, out, 'public, max-age=600');
    }
    const g = String(q.g || '');
    if (!/^\/[A-Za-z0-9_-]{1,80}$/.test(g)) return json(400, { error: 'Bad gallery.' });
    const html = await getText(SITE + g);
    const ak = (html.match(/AlbumKey["']?\s*[:=]\s*["']([A-Za-z0-9]+)/) || [])[1];
    if (!ak) return json(404, { error: 'Gallery not found.' });
    const photos = [];
    let start = 1;
    for (let i = 0; i < 6; i++) {
      const j = await getJson(API + '/album/' + ak + '!images?APIKey=' + key + '&count=100&start=' + start + '&_accept=application%2Fjson&_verbosity=1');
      const imgs = (j.Response && j.Response.AlbumImage) || [];
      imgs.forEach(function (im) { if (im.ImageKey) photos.push({ id: 'i-' + im.ImageKey, f: im.FileName || '' }); });
      const next = j.Response && j.Response.Pages && j.Response.Pages.NextPage;
      if (!next) break;
      start += 100;
    }
    return json(200, { photos: photos }, 'public, max-age=300');
  } catch (e) {
    return json(502, { error: 'Could not reach the gallery right now.' });
  }
};
