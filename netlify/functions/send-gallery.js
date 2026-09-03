/**
 * Wailea Photo & Portrait — gallery delivery sender
 * Netlify Function.  Path when deployed: /.netlify/functions/send-gallery
 *
 * Sends the client delivery email as photo@waileaphoto.com via Resend.
 *
 * The Resend API key lives only in Netlify's environment variables. It is
 * never sent to the browser, so nobody can read it from the page source.
 *
 * REQUIRED environment variables (Netlify → Site settings → Environment):
 *   RESEND_API_KEY   your Resend key, starts with re_
 *   FROM_ADDRESS     e.g.  Wailea Photo & Portrait <photo@waileaphoto.com>
 *   BCC_ADDRESS      optional, e.g. photo@waileaphoto.com  (keeps a record)
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Simple in-memory rate limit. Resets whenever the function goes cold, which
// is fine — it exists to blunt a runaway loop or someone hammering the page,
// not to be a hardened quota.
const recent = [];
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 12;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function looksLikeEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use POST.' });
  }

  const API_KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.FROM_ADDRESS;
  const BCC = process.env.BCC_ADDRESS || '';

  if (!API_KEY || !FROM) {
    return json(500, {
      error: 'Server is not configured. RESEND_API_KEY and FROM_ADDRESS must all be set in Netlify.'
    });
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Could not read the request.' });
  }

  // --- rate limit -----------------------------------------------------
  const now = Date.now();
  while (recent.length && now - recent[0] > WINDOW_MS) recent.shift();
  if (recent.length >= MAX_PER_WINDOW) {
    return json(429, { error: 'Too many sends in the last minute. Wait a moment and try again.' });
  }

  // --- validate -------------------------------------------------------
  const to = String(data.to || '').trim();
  const subject = String(data.subject || '').trim();
  const html = String(data.html || '');
  const text = String(data.text || '');
  const replyTo = String(data.replyTo || '').trim();

  if (!looksLikeEmail(to)) return json(400, { error: 'That client email address does not look valid.' });
  if (!subject) return json(400, { error: 'The subject line is empty.' });
  if (!html && !text) return json(400, { error: 'The message body is empty.' });
  if (replyTo && !looksLikeEmail(replyTo)) {
    return json(400, { error: 'The reply-to address does not look valid.' });
  }

  // --- send -----------------------------------------------------------
  const payload = { from: FROM, to: [to], subject: subject };
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (replyTo) payload.replyTo = replyTo;
  if (BCC) payload.bcc = [BCC];

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json().catch(function () { return {}; });

    if (!res.ok) {
      // Surface Resend's own wording — it is usually specific and useful
      // (unverified domain, invalid address, quota).
      console.error('Resend rejected the send:', res.status, result);
      return json(502, {
        error: (result && result.message) ? result.message : 'The email service rejected the message.'
      });
    }

    recent.push(now);
    console.log('Sent gallery delivery to', to, 'id', result && result.id);
    return json(200, { ok: true, id: result && result.id });

  } catch (err) {
    console.error('Send failed:', err);
    return json(502, { error: 'Could not reach the email service. Try again in a moment.' });
  }
};
