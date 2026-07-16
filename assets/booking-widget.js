// Wailea Photo booking widget — vanilla JS, no build step, no npm dependency.
// Loads Stripe.js from Stripe's own CDN at runtime (a normal <script> include,
// same as any other third-party embed — not an npm package).
//
// Usage: put `<button data-book-session="last-half-sunset" data-session-name="Last Half of Sunset">Book Now</button>`
// anywhere on the page, include this file + booking-widget.css, and set window.WBW_CONFIG
// before this script runs:
//   window.WBW_CONFIG = { apiBase: 'http://localhost:4242', stripePublishableKey: 'pk_test_...' };

(function () {
  const CONFIG = window.WBW_CONFIG || {};
  const API_BASE = CONFIG.apiBase || 'http://localhost:4242';
  const STRIPE_PK = CONFIG.stripePublishableKey || '';

  const ADDON_DEFS = [
    { slug: 'film', label: 'Real film (Kodak/FujiFilm)' },
    { slug: 'bw', label: 'Classic Black & White add-on' },
    { slug: 'apo_lens', label: 'Leica APO lens upgrade' },
  ];

  const HEAR_ABOUT_OPTIONS = [
    'Baggage Claim Video', 'Maui Visitors Guide Magazine', 'Google Search', 'Google Ad',
    'Facebook Group', 'Facebook Ad', 'Instagram Post', 'Instagram Ad', 'TikTok', 'Pinterest', 'Other',
  ];

  const POLICY_LINES = [
    "No refunds for wind/hair, wardrobe issues, squinting, or arriving under the influence — and once your session begins, there are no refunds. You're welcome to reschedule anytime beforehand, or at the initial meeting, if the weather isn't cooperating.",
    "You're responsible for your own wardrobe, and for any sand or lens damage caused by your party.",
    "Edit requests beyond color/brightness (skin, blemishes, wardrobe, sky, etc.) are $25/image through a professional editor. We provide only the final edited gallery — RAW images aren't available.",
    "Staying in Kaanapali, Lahaina, or Kapalua? Plan to leave about 2 hours early.",
  ];

  const DEFAULT_DEPOSIT_CENTS = 4900;
  // Keep in sync with DEPOSIT_CENTS_BY_SLUG in booking-engine/src/routes/bookings.js.
  const DEPOSIT_CENTS_BY_SLUG = { 'sunrise-max': 1000 };
  function depositCentsFor(slug) {
    return DEPOSIT_CENTS_BY_SLUG[slug] ?? DEFAULT_DEPOSIT_CENTS;
  }

  let stripePromise = null;
  function loadStripeJs() {
    if (stripePromise) return stripePromise;
    stripePromise = new Promise((resolve, reject) => {
      if (window.Stripe) return resolve(window.Stripe);
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = () => resolve(window.Stripe);
      script.onerror = () => reject(new Error('Could not load Stripe.js'));
      document.head.appendChild(script);
    });
    return stripePromise;
  }

  async function api(method, path, body) {
    const res = await fetch(API_BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue; // e.g. disabled: undefined must mean "not disabled", not attribute="undefined"
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    (children || []).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  function fmtDollars(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  class BookingWidget {
    constructor() {
      this.overlay = null;
      this.state = null;
    }

    buildDom() {
      this.overlay = el('div', { class: 'wbw-overlay', hidden: 'hidden' }, [
        el('div', { class: 'wbw-modal' }, [
          el('button', { class: 'wbw-close', 'aria-label': 'Close', onclick: () => this.close() }, ['×']),
          this.header = el('div', {}, [
            el('div', { class: 'wbw-eyebrow' }, ['BOOK YOUR SESSION']),
            this.titleEl = el('h1', { class: 'wbw-title' }, ['']),
          ]),
          this.stepDate = this.buildDateStep(),
          this.stepDetails = this.buildDetailsStep(),
          this.stepPayment = this.buildPaymentStep(),
          this.stepSuccess = this.buildSuccessStep(),
        ]),
      ]);
      document.body.appendChild(this.overlay);
      this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    }

    buildDateStep() {
      const step = el('div', { class: 'wbw-step' });
      this.monthLabel = el('span', { class: 'wbw-month-label' }, ['']);
      const nav = el('div', { class: 'wbw-month-nav' }, [
        el('button', { onclick: () => this.changeMonth(-1) }, ['‹ Prev']),
        this.monthLabel,
        el('button', { onclick: () => this.changeMonth(1) }, ['Next ›']),
      ]);
      this.dayGrid = el('div', { class: 'wbw-day-grid' });
      this.slotsWrap = el('div', { class: 'wbw-slots' });
      this.dateError = el('div', { class: 'wbw-error' });
      const nextBtn = el('button', { class: 'wbw-btn', onclick: () => this.goToDetails() }, ['Continue']);
      step.append(nav, this.dayGrid, this.slotsWrap, this.dateError, nextBtn);
      return step;
    }

    buildDetailsStep() {
      const step = el('div', { class: 'wbw-step', hidden: 'hidden' });
      this.partySizeInput = el('input', { type: 'number', min: '1', max: '20', value: '2', oninput: () => this.refreshQuote() });
      const partyField = el('div', { class: 'wbw-field' }, [el('label', {}, ['Party size']), this.partySizeInput]);

      this.addonInputs = {};
      const addonsWrap = el('div', { class: 'wbw-addons' });
      ADDON_DEFS.forEach((a) => {
        const input = el('input', { type: 'checkbox', onchange: () => this.refreshQuote() });
        this.addonInputs[a.slug] = input;
        addonsWrap.appendChild(el('label', { class: 'wbw-addon' }, [input, a.label]));
      });

      this.nameInput = el('input', { type: 'text', placeholder: 'Full name' });
      this.emailInput = el('input', { type: 'email', placeholder: 'you@example.com' });
      this.phoneInput = el('input', { type: 'tel', placeholder: '(808) 555-1234' });

      this.hearAboutInput = el('select', {}, [
        el('option', { value: '' }, ['Select one']),
        ...HEAR_ABOUT_OPTIONS.map((o) => el('option', { value: o }, [o])),
      ]);
      this.celebratingInput = el('input', { type: 'text', placeholder: 'Anniversary, birthday, reunion… (optional)' });
      this.styleNotesInput = el('textarea', { rows: '3', placeholder: 'Describe a look, pose, or style you have in mind (optional)' });

      this.policyBox = el('div', { class: 'wbw-policy-box' }, POLICY_LINES.map((t) => el('p', {}, [t])));
      this.policyCheckbox = el('input', { type: 'checkbox' });

      this.quoteBox = el('div', { class: 'wbw-quote' });
      this.detailsError = el('div', { class: 'wbw-error' });

      step.append(
        partyField,
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Add-ons']), addonsWrap]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Name']), this.nameInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Email']), this.emailInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Phone']), this.phoneInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['How did you hear about us?']), this.hearAboutInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['What are you celebrating?']), this.celebratingInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Style / pose notes']), this.styleNotesInput]),
        el('div', { class: 'wbw-field' }, [
          el('label', {}, ['Session Policies']),
          this.policyBox,
          el('label', { class: 'wbw-policy-agree' }, [this.policyCheckbox, ' I have read and agree to the session policies above.']),
        ]),
        this.quoteBox,
        this.detailsError,
        el('div', { style: 'display:flex;gap:10px;' }, [
          el('button', { class: 'wbw-btn wbw-btn-secondary', onclick: () => this.showStep('date') }, ['Back']),
          el('button', { class: 'wbw-btn', onclick: (e) => this.goToPayment(e) }, ['Continue to Payment']),
        ])
      );
      return step;
    }

    buildPaymentStep() {
      const step = el('div', { class: 'wbw-step', hidden: 'hidden' });
      this.paymentSummary = el('div', { class: 'wbw-quote' });
      this.cardElementWrap = el('div', { id: 'wbw-card-element' });
      this.payError = el('div', { class: 'wbw-error' });
      this.payBtn = el('button', { class: 'wbw-btn', onclick: () => this.submitPayment() }, [`Pay ${fmtDollars(DEFAULT_DEPOSIT_CENTS)} Deposit`]);
      step.append(
        this.paymentSummary,
        this.cardElementWrap,
        this.payError,
        el('div', { style: 'display:flex;gap:10px;' }, [
          el('button', { class: 'wbw-btn wbw-btn-secondary', onclick: () => this.showStep('details') }, ['Back']),
          this.payBtn,
        ])
      );
      return step;
    }

    buildSuccessStep() {
      const step = el('div', { class: 'wbw-step', hidden: 'hidden' });
      this.successBody = el('div', { class: 'wbw-success' });
      step.appendChild(this.successBody);
      return step;
    }

    showStep(name) {
      for (const s of ['date', 'details', 'payment', 'success']) {
        this[`step${s[0].toUpperCase()}${s.slice(1)}`].hidden = s !== name;
      }
    }

    open(slug, name) {
      if (!this.overlay) this.buildDom();
      this.state = { slug, name, month: new Date(), selectedDate: null, selectedSlot: null, bookingId: null, clientSecret: null };
      this.titleEl.textContent = name;
      this.showStep('date');
      this.dateError.textContent = '';
      this.overlay.hidden = false;
      this.loadMonth();
    }

    close() {
      if (this.overlay) this.overlay.hidden = true;
    }

    changeMonth(delta) {
      this.state.month = new Date(this.state.month.getFullYear(), this.state.month.getMonth() + delta, 1);
      this.state.selectedDate = null;
      this.state.selectedSlot = null;
      this.loadMonth();
    }

    async loadMonth() {
      const y = this.state.month.getFullYear();
      const m = String(this.state.month.getMonth() + 1).padStart(2, '0');
      this.monthLabel.textContent = this.state.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      this.dayGrid.innerHTML = '';
      this.slotsWrap.innerHTML = '';
      this.dateError.textContent = '';
      ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d) => this.dayGrid.appendChild(el('div', { class: 'wbw-day-head' }, [d])));

      let data;
      try {
        data = await api('GET', `/api/availability?sessionType=${this.state.slug}&month=${y}-${m}`);
      } catch (err) {
        this.dateError.textContent = `Couldn't load availability: ${err.message}`;
        return;
      }
      if (data.bookingMode === 'manual') {
        this.dateError.textContent = data.message;
        return;
      }

      const firstDay = new Date(y, this.state.month.getMonth(), 1).getDay();
      for (let i = 0; i < firstDay; i++) this.dayGrid.appendChild(el('div', { class: 'wbw-day-empty' }));

      data.days.forEach((day) => {
        const isPast = !!day.past;
        const hasSlots = day.slots.length > 0;
        const dayNum = Number(day.date.split('-')[2]);
        const btn = el('button', {
          class: `wbw-day${hasSlots && !isPast ? ' wbw-available' : ''}${isPast ? ' wbw-day-past' : ''}`,
          disabled: (hasSlots && !isPast) ? undefined : 'disabled',
          title: isPast ? 'This date has passed' : (hasSlots ? undefined : 'Sold out'),
          onclick: (e) => this.selectDate(day, e),
        }, [String(dayNum)]);
        if (isPast || !hasSlots) btn.disabled = true;
        this.dayGrid.appendChild(btn);
      });
    }

    selectDate(day, e) {
      this.state.selectedDate = day.date;
      this.state.selectedSlot = null;
      Array.from(this.dayGrid.children).forEach((c) => c.classList.remove('wbw-selected'));
      e?.target?.classList.add('wbw-selected');
      this.slotsWrap.innerHTML = '';
      day.slots.forEach((slot) => {
        const btn = el('button', {
          class: 'wbw-slot-btn',
          onclick: (e) => {
            this.state.selectedSlot = slot;
            Array.from(this.slotsWrap.children).forEach((c) => c.classList.remove('wbw-selected'));
            e.target.classList.add('wbw-selected');
          },
        }, [`${slot.startTime} – ${slot.endTime}`]);
        this.slotsWrap.appendChild(btn);
      });
    }

    goToDetails() {
      if (!this.state.selectedDate || !this.state.selectedSlot) {
        this.dateError.textContent = 'Please pick a date and time first.';
        return;
      }
      this.showStep('details');
      this.refreshQuote();
    }

    selectedAddonSlugs() {
      return Object.entries(this.addonInputs).filter(([, input]) => input.checked).map(([slug]) => slug);
    }

    async refreshQuote() {
      const partySize = Number(this.partySizeInput.value) || 1;
      let quote;
      try {
        quote = await api('POST', '/api/quote', {
          sessionType: this.state.slug,
          date: this.state.selectedDate,
          partySize,
          addonSlugs: this.selectedAddonSlugs(),
        });
      } catch (err) {
        this.detailsError.textContent = err.message;
        return;
      }
      this.state.lastQuote = quote;
      this.quoteBox.innerHTML = '';
      this.quoteBox.appendChild(row('Base price', fmtDollars(quote.basePriceCents)));
      quote.adjustments.forEach((a) => this.quoteBox.appendChild(row(a.label, fmtDollars(a.amountCents))));
      quote.addons.forEach((a) => this.quoteBox.appendChild(row(a.label, fmtDollars(a.amountCents))));
      this.quoteBox.appendChild(row('Total', quote.totalFormatted));
      this.quoteBox.appendChild(el('div', { class: 'wbw-due-today' }, [
        el('div', { class: 'wbw-due-today-label' }, ['Due Today:']),
        el('div', { class: 'wbw-due-today-amount' }, [fmtDollars(depositCentsFor(this.state.slug))]),
      ]));
      this.quoteBox.appendChild(el('div', { class: 'wbw-quote-note' }, ['Remainder due at your session.']));

      function row(label, value, isTotal) {
        return el('div', { class: `wbw-quote-row${isTotal ? ' wbw-total' : ''}` }, [
          el('span', {}, [label]),
          el('span', {}, [value]),
        ]);
      }
    }

    async goToPayment() {
      this.detailsError.textContent = '';
      if (!this.nameInput.value || !this.emailInput.value) {
        this.detailsError.textContent = 'Name and email are required.';
        return;
      }
      if (!this.hearAboutInput.value) {
        this.detailsError.textContent = 'Please let us know how you heard about us.';
        return;
      }
      if (!this.policyCheckbox.checked) {
        this.detailsError.textContent = 'Please agree to the session policies to continue.';
        return;
      }
      const btn = event?.target;
      const originalLabel = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }
      try {
        const result = await api('POST', '/api/bookings', {
          sessionType: this.state.slug,
          date: this.state.selectedDate,
          startTime: this.state.selectedSlot.startTime,
          partySize: Number(this.partySizeInput.value) || 1,
          addonSlugs: this.selectedAddonSlugs(),
          client: { name: this.nameInput.value, email: this.emailInput.value, phone: this.phoneInput.value },
          questionnaire: {
            agreedToPolicies: this.policyCheckbox.checked,
            hearAboutUs: this.hearAboutInput.value,
            celebrating: this.celebratingInput.value || undefined,
            styleNotes: this.styleNotesInput.value || undefined,
          },
        });
        this.state.bookingId = result.booking.id;
        this.state.clientSecret = result.stripe.clientSecret;
        this.state.quote = result.quote;

        this.paymentSummary.innerHTML = '';
        this.paymentSummary.appendChild(el('div', { class: 'wbw-quote-row wbw-total' }, [
          el('span', {}, [`${this.state.name} — ${this.state.selectedDate} ${this.state.selectedSlot.startTime}`]),
          el('span', {}, [fmtDollars(result.booking.total_price_cents)]),
        ]));
        this.payBtn.textContent = `Pay ${fmtDollars(result.booking.deposit_cents)} Deposit`;

        this.showStep('payment');
        await this.mountStripeElement();
      } catch (err) {
        this.detailsError.textContent = err.message;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
      }
    }

    async mountStripeElement() {
      if (!STRIPE_PK) {
        this.payError.textContent = 'Stripe publishable key not configured (window.WBW_CONFIG.stripePublishableKey).';
        return;
      }
      const Stripe = await loadStripeJs();
      this.stripe = Stripe(STRIPE_PK);
      this.elements = this.stripe.elements({ clientSecret: this.state.clientSecret });
      this.paymentElement = this.elements.create('payment');
      this.cardElementWrap.innerHTML = '';
      this.paymentElement.mount(this.cardElementWrap);
    }

    async submitPayment() {
      this.payError.textContent = '';
      this.payBtn.disabled = true;
      this.payBtn.innerHTML = '<span class="wbw-spinner"></span> Processing…';
      try {
        const { error, paymentIntent } = await this.stripe.confirmPayment({
          elements: this.elements,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });
        if (error) {
          this.payError.textContent = error.message;
          return;
        }
        this.showSuccess(paymentIntent);
      } catch (err) {
        this.payError.textContent = err.message;
      } finally {
        this.payBtn.disabled = false;
        this.payBtn.textContent = `Pay ${fmtDollars(depositCentsFor(this.state.slug))} Deposit`;
      }
    }

    showSuccess(paymentIntent) {
      this.successBody.innerHTML = '';
      this.successBody.append(
        el('div', { class: 'wbw-success-icon' }, ['✓']),
        el('h3', {}, ['You’re booked!']),
        el('p', {}, [`${this.state.name} — ${this.state.selectedDate} at ${this.state.selectedSlot.startTime} (Hawaii time).`]),
        el('p', { class: 'wbw-quote-note' }, [`Payment status: ${paymentIntent.status}. A confirmation email is on its way once it's fully processed.`]),
        el('a', { class: 'wbw-btn', href: `${API_BASE}/api/bookings/${this.state.bookingId}/ics`, target: '_blank', style: 'display:block;margin-top:16px;text-decoration:none;' }, ['Add to Calendar']),
        el('button', { class: 'wbw-btn wbw-btn-secondary', style: 'margin-top:10px;', onclick: () => this.close() }, ['Done'])
      );
      this.showStep('success');
    }
  }

  const widget = new BookingWidget();
  window.WaileaBookingWidget = widget;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-book-session]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        widget.open(btn.getAttribute('data-book-session'), btn.getAttribute('data-session-name') || 'Your Session');
      });
    });
  });
})();
