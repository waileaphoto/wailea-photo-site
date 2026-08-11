// Wailea Photo Concierge — visitor-facing chat for the booking agent.
// Vanilla JS, no build step, mirrors booking-widget.js conventions.
// Talks to POST {apiBase}/api/concierge/chat. Conversation survives page
// navigation via localStorage. If the concierge is offline (503), visitors
// get a clear path: book directly, or email.
//
// The ask gesture: tapping any "By Request" price pill opens the concierge
// already asking about that session.

(function () {
  const CONFIG = window.WBW_CONFIG || {};
  const API_BASE = CONFIG.apiBase || '';
  const LS_KEY = 'wpc_visitor_key';
  const LS_CONVO = 'wpc_conversation_id';
  const LS_LOG = 'wpc_log_v1';
  const OWNER_EMAIL = 'photo@waileaphoto.com';

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

  function store(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
  function read(key) { try { return localStorage.getItem(key); } catch { return null; } }

  function visitorKey() {
    let key = read(LS_KEY);
    if (!key) {
      key = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      store(LS_KEY, key);
    }
    return key;
  }

  function loadLog() { try { return JSON.parse(read(LS_LOG) || '[]'); } catch { return []; } }
  function saveLog(log) { store(LS_LOG, JSON.stringify(log.slice(-40))); }

  class Concierge {
    constructor() {
      this.pending = false;
      this.log = loadLog();
      this.buildDom();
      this.renderLog();
      if (!this.log.length) {
        this.pushMessage('assistant', "Aloha! I'm the Wailea Photo concierge. Ask me anything — open dates, sunrise or sunset, what your session would cost. What are you celebrating?");
      }
    }

    buildDom() {
      this.launcher = el('button', { class: 'wpc-launcher', type: 'button', 'aria-label': 'Open the concierge chat', onclick: () => this.open() }, [
        el('span', { class: 'wpc-dot' }), 'Concierge',
      ]);

      this.logEl = el('div', { class: 'wpc-log', role: 'log', 'aria-live': 'polite' });
      this.inputEl = el('textarea', { rows: '1', placeholder: 'Ask about dates, sessions, pricing…', 'aria-label': 'Message the concierge', onkeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
      } });
      this.sendBtn = el('button', { class: 'wpc-send', type: 'button', onclick: () => this.send() }, ['Send']);

      this.panel = el('div', { class: 'wpc-panel', role: 'dialog', 'aria-label': 'Wailea Photo concierge chat' }, [
        el('div', { class: 'wpc-head' }, [
          el('div', {}, [
            el('p', { class: 'wpc-head-eyebrow' }, ['Wailea Photo']),
            el('h3', {}, ['The Concierge']),
          ]),
          el('button', { class: 'wpc-close', type: 'button', 'aria-label': 'Close chat', onclick: () => this.close() }, ['\u00d7']),
        ]),
        this.logEl,
        el('div', { class: 'wpc-input' }, [this.inputEl, this.sendBtn]),
      ]);

      document.body.append(this.launcher, this.panel);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    }

    open(prefillQuestion) {
      this.panel.classList.add('wpc-open');
      this.launcher.hidden = true;
      if (prefillQuestion) {
        this.inputEl.value = prefillQuestion;
        this.send();
      } else {
        this.inputEl.focus();
      }
      this.scrollToEnd();
      if (typeof window.waileaTrack === 'function') window.waileaTrack('concierge_open', { booking_system: 'wailea' });
    }

    close() {
      this.panel.classList.remove('wpc-open');
      this.launcher.hidden = false;
    }

    pushMessage(role, text, links) {
      this.log.push({ role, text, links: links && links.length ? links : undefined });
      saveLog(this.log);
      this.renderMessage(this.log[this.log.length - 1]);
      this.scrollToEnd();
    }

    renderLog() {
      this.logEl.innerHTML = '';
      this.log.forEach((m) => this.renderMessage(m));
      this.scrollToEnd();
    }

    renderMessage(m) {
      this.logEl.appendChild(el('div', { class: `wpc-msg wpc-msg-${m.role}` }, [m.text]));
      (m.links || []).forEach((url) => {
        this.logEl.appendChild(el('a', { class: 'wpc-book', href: url }, ['Book this session']));
      });
    }

    scrollToEnd() { this.logEl.scrollTop = this.logEl.scrollHeight; }

    setTyping(on) {
      if (on) {
        this.typingEl = el('div', { class: 'wpc-typing', 'aria-label': 'Concierge is typing' }, [el('span'), el('span'), el('span')]);
        this.logEl.appendChild(this.typingEl);
        this.scrollToEnd();
      } else if (this.typingEl) {
        this.typingEl.remove();
        this.typingEl = null;
      }
    }

    async send() {
      const text = this.inputEl.value.trim();
      if (!text || this.pending) return;
      this.inputEl.value = '';
      this.pending = true;
      this.sendBtn.disabled = true;
      this.pushMessage('user', text);
      this.setTyping(true);
      try {
        const res = await fetch(`${API_BASE}/api/concierge/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            visitorKey: visitorKey(),
            conversationId: read(LS_CONVO) ? Number(read(LS_CONVO)) : undefined,
          }),
        });
        const json = await res.json();
        this.setTyping(false);
        if (res.status === 503) {
          this.pushMessage('assistant', `The concierge is away from the desk right now. You can book directly on this page — your exact price appears when you choose a date and time — or email us at ${OWNER_EMAIL} and we'll reply personally.`);
          return;
        }
        if (!res.ok) {
          this.pushMessage('assistant', json.error || `That didn't go through. Try once more, or email ${OWNER_EMAIL}.`);
          return;
        }
        store(LS_CONVO, String(json.conversationId));
        this.pushMessage('assistant', json.reply, json.bookingLinks);
        if (typeof window.waileaTrack === 'function') window.waileaTrack('concierge_reply', { booking_system: 'wailea', links: (json.bookingLinks || []).length });
      } catch {
        this.setTyping(false);
        this.pushMessage('assistant', `The connection dropped before I could answer. Try again, or email ${OWNER_EMAIL}.`);
      } finally {
        this.pending = false;
        this.sendBtn.disabled = false;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const concierge = new Concierge();
    window.WaileaConcierge = concierge;

    // "You have to ask": every By Request pill opens the concierge pre-asked.
    document.addEventListener('click', (e) => {
      const pill = e.target.closest('.session-card-price');
      if (!pill) return;
      const card = pill.closest('.session-card, .session-card-image') || pill.parentElement;
      const named = card && card.querySelector('[data-session-name]');
      const heading = pill.closest('.session-card') && pill.closest('.session-card').querySelector('h4');
      const sessionName = (named && named.getAttribute('data-session-name')) || (heading && heading.textContent.trim()) || 'this session';
      concierge.open(`What does the ${sessionName} session cost?`);
    });
  });
})();
