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
    {
      slug: 'double-sunset',
      label: 'Special-Double your session time to include Last Half Sunset ($499 value)',
      priceLabel: '$199',
      sessionSlugs: ['first-half-sunset'],
    },
  ];

  const HEAR_ABOUT_OPTIONS = [
    'AI referral', 'Google Search', 'Google Ad',
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

  function fmtTime12(value) {
    const [hourText, minute = '00'] = String(value || '').split(':');
    const hour = Number(hourText);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return value || '';
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute} ${suffix}`;
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
      this.addonRows = {};
      const addonsWrap = el('div', { class: 'wbw-addons' });
      ADDON_DEFS.forEach((a) => {
        const input = el('input', { type: 'checkbox', onchange: () => this.refreshQuote() });
        this.addonInputs[a.slug] = input;
        const children = [input, a.label];
        if (a.priceLabel) children.push(el('span', { class: 'wbw-addon-price' }, [a.priceLabel]));
        const addonRow = el('label', { class: 'wbw-addon' }, children);
        this.addonRows[a.slug] = addonRow;
        addonsWrap.appendChild(addonRow);
      });

      this.nameInput = el('input', { type: 'text', placeholder: 'Full name' });
      this.emailInput = el('input', { type: 'email', placeholder: 'you@example.com' });
      this.phoneInput = el('input', { type: 'tel', placeholder: '(808) 555-1234' });
      // Defaults checked — this is a day-of logistics reminder (location, map link), not
      // marketing, but it's still opt-in and easy to uncheck for anyone who'd rather not.
      this.smsOptInCheckbox = el('input', { type: 'checkbox', checked: true });

      this.hearAboutInput = el('select', {}, [
        el('option', { value: '' }, ['Select one']),
        ...HEAR_ABOUT_OPTIONS.map((o) => el('option', { value: o }, [o])),
      ]);
      this.celebratingInput = el('input', { type: 'text', placeholder: 'Anniversary, Honeymoon, Maternity, Graduation… (optional)' });
      this.specialRequestsInput = el('textarea', {
        rows: '3',
        maxlength: '2000',
        placeholder: 'Anything you would like us to know before your session (optional)',
      });
      this.floristContactCheckbox = el('input', { type: 'checkbox' });

      this.policyBox = el('div', { class: 'wbw-policy-box' }, POLICY_LINES.map((t) => el('p', {}, [t])));
      this.policyCheckbox = el('input', { type: 'checkbox' });
      this.sunrisePunctualityCheckbox = el('input', { type: 'checkbox', required: true });
      this.sunrisePunctualityRow = el('label', { class: 'wbw-policy-agree' }, [
        this.sunrisePunctualityCheckbox,
        ' I acknowledge that I must arrive on time. Sessions are not extended due to tardiness, late sleeping teenagers or slow valet service.',
      ]);

      this.quoteBox = el('div', { class: 'wbw-quote' });
      this.detailsError = el('div', { class: 'wbw-error' });

      step.append(
        partyField,
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Add-ons']), addonsWrap]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Name']), this.nameInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Email']), this.emailInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['Phone']), this.phoneInput]),
        el('label', { class: 'wbw-policy-agree' }, [this.smsOptInCheckbox, ' Text me a reminder with directions a few hours before my session.']),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['How did you hear about us?']), this.hearAboutInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['What are you celebrating?']), this.celebratingInput]),
        el('div', { class: 'wbw-field' }, [el('label', {}, ['NOTES / SPECIAL REQUESTS']), this.specialRequestsInput]),
        el('label', { class: 'wbw-policy-agree' }, [
          this.floristContactCheckbox,
          ' Have Mya our florist contact you for flowers? (48 hr min lead time required)',
        ]),
        el('div', { class: 'wbw-field' }, [
