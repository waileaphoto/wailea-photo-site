// Lightweight "Request This Session" inquiry form for manual/inquiry session types
// (Family Legacy and A Poetic Wedding in Maui — no calendar, no payment).
// Reuses the same CSS classes as booking-widget.js (wbw-overlay, wbw-modal, wbw-field, etc.)
// so it looks consistent without duplicating styles.
//
// Usage: `<button data-inquire-session="family-legacy" data-session-name="The Family Legacy">Request This Session</button>`

(function () {
const CONFIG = window.WBW_CONFIG || {};
const API_BASE = CONFIG.apiBase || 'http://localhost:4242';

// Translation — see the note in booking-widget.js. T() returns English on English pages.
const I18N = window.WP_I18N || {};
const LANG = I18N.lang || 'en';
function T(s) { return (I18N.s && I18N.s[s]) || s; }

function track(eventName, parameters) {
if (typeof window.waileaTrack === 'function') window.waileaTrack(eventName, parameters);
}

function el(tag, attrs, children) {
const node = document.createElement(tag);
if (attrs) for (const [k, v] of Object.entries(attrs)) {
if (v === undefined || v === null) continue;
if (k === 'class') node.className = v;
else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
else node.setAttribute(k, v);
}
(children || []).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
return node;
}

class InquiryWidget {
open(slug, name) {
if (!this.overlay) this.buildDom();
this.slug = slug;
this.titleEl.textContent = name;
this.formStep.hidden = false;
this.successStep.hidden = true;
this.errorEl.textContent = '';
[this.nameInput, this.emailInput, this.phoneInput, this.datesInput, this.notesInput].forEach((i) => (i.value = ''));
this.overlay.hidden = false;
track('inquiry_start', { session_type: slug });
}

close() {
this.overlay.hidden = true;
}

buildDom() {
this.titleEl = el('h1', { class: 'wbw-title' }, ['']);
this.nameInput = el('input', { type: 'text', placeholder: T('Full name') });
this.emailInput = el('input', { type: 'email', placeholder: 'you@example.com' });
this.phoneInput = el('input', { type: 'tel', placeholder: '(808) 555-1234' });
this.datesInput = el('input', { type: 'text', placeholder: T('e.g. Second week of December') });
this.notesInput = el('input', { type: 'text', placeholder: T('Party size, occasion, anything else') });
this.errorEl = el('div', { class: 'wbw-error' });

this.formStep = el('div', { class: 'wbw-step' }, [
el('div', { class: 'wbw-field' }, [el('label', {}, [T('Name')]), this.nameInput]),
el('div', { class: 'wbw-field' }, [el('label', {}, [T('Email')]), this.emailInput]),
el('div', { class: 'wbw-field' }, [el('label', {}, [T('Phone')]), this.phoneInput]),
el('div', { class: 'wbw-field' }, [el('label', {}, [T('Preferred dates')]), this.datesInput]),
el('div', { class: 'wbw-field' }, [el('label', {}, [T('Notes')]), this.notesInput]),
this.errorEl,
el('button', { class: 'wbw-btn', onclick: () => this.submit() }, [T('Send Request')]),
]);

this.successStep = el('div', { class: 'wbw-step', hidden: 'hidden' }, [
el('div', { class: 'wbw-success' }, [
el('div', { class: 'wbw-success-icon' }, ['✓']),
el('h3', {}, [T('Request sent!')]),
el('p', {}, [T("We'll be in touch shortly to work out the details.")]),
el('button', { class: 'wbw-btn wbw-btn-secondary', onclick: () => this.close() }, [T('Done')]),
]),
]);

this.overlay = el('div', { class: 'wbw-overlay', hidden: 'hidden' }, [
el('div', { class: 'wbw-modal' }, [
el('button', { class: 'wbw-close', 'aria-label': T('Close'), onclick: () => this.close() }, ['×']),
el('div', { class: 'wbw-eyebrow' }, [T('REQUEST THIS SESSION')]),
this.titleEl,
this.formStep,
this.successStep,
]),
]);
document.body.appendChild(this.overlay);
this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
}

async submit() {
this.errorEl.textContent = '';
if (!this.nameInput.value || !this.emailInput.value) {
this.errorEl.textContent = T('Name and email are required.');
return;
}
try {
const res = await fetch(`${API_BASE}/api/inquiries`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
sessionTypeSlug: this.slug,
name: this.nameInput.value,
email: this.emailInput.value,
phone: this.phoneInput.value,
preferredDates: this.datesInput.value,
notes: LANG === 'en' ? this.notesInput.value : `[${LANG}] ${this.notesInput.value}`,
}),
});
const json = await res.json();
if (!res.ok) throw new Error(json.error || 'Request failed');
track('contact_us', { session_type: this.slug, lead_source: 'website_inquiry' });
this.formStep.hidden = true;
this.successStep.hidden = false;
} catch (err) {
this.errorEl.textContent = err.message;
}
}
}

const widget = new InquiryWidget();
window.WaileaInquiryWidget = widget;

document.addEventListener('DOMContentLoaded', () => {
document.querySelectorAll('[data-inquire-session]').forEach((btn) => {
btn.addEventListener('click', (e) => {
e.preventDefault();
widget.open(btn.getAttribute('data-inquire-session'), btn.getAttribute('data-session-name') || T('Your Session'));
});
});

// Deep-link support for direct-text/SMS booking links, mirroring booking-widget.js's
// ?openBooking= param — e.g. pricing.html?openInquiry=family-legacy opens straight
// into the request form instead of making the visitor scroll and find the card.
const openSlug = new URLSearchParams(window.location.search).get('openInquiry');
if (openSlug) {
const target = document.querySelector(`[data-inquire-session="${CSS.escape(openSlug)}"]`);
if (target) target.click();
}
});
})();
