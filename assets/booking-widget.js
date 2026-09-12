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
    // Removed Aug 2026 - 'Real film' add-on withdrawn. Backend slug 'film' still
    // exists, so past bookings render correctly; restore this line to re-offer it.
    { slug: 'bw', label: 'Classic Black & White add-on', learnMoreUrl: 'https://waileaphoto.com/black-and-white-upgrade' },
    { slug: 'apo_lens', label: 'Leica APO lens upgrade', learnMoreUrl: 'https://waileaphoto.com/the-apo-difference' },
    {
      slug: 'double-sunset',
      label: 'Special-Double your session time to include Last Half Sunset ($499 value)',
      priceLabel: '$199',
      sessionSlugs: ['first-half-sunset'],
    },
    {
      slug: 'double-sunrise',
      label: 'Special-Double your Sunrise session time (40 minutes total)',
      priceLabel: '$199',
      sessionSlugs: ['sunrise-max'],
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
const DEPOSIT_CENTS_BY_SLUG = { 'sunrise-max': 2000, 'mini-morning': 2000, 'mini-sunset': 2000, 'road-to-hana': 2000 };  
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

  // The booking API is hosted on a plan that sleeps when idle, so the first availability
  // request of a visit can take several seconds or fail outright while the service wakes.
  // These three constants tune how the calendar behaves around that.
  const AVAILABILITY_TIMEOUT_MS = 20000;  // abort a hung request rather than spin forever
  const COLD_START_HINT_MS = 3500;        // after this, tell the client we're still working
  const MAX_LOOKAHEAD_MONTHS = 6;         // how far ahead to hunt for the next opening

  async function apiWithTimeout(method, path, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_BASE + path, { method, signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  // One automatic retry: a cold start typically fails or times out once and then succeeds
  // immediately, and asking the client to press a button for that is a lost booking.
  async function fetchAvailability(slug, year, monthNum) {
    const path = `/api/availability?sessionType=${slug}&month=${year}-${String(monthNum).padStart(2, '0')}`;
    try {
      return await apiWithTimeout('GET', path, AVAILABILITY_TIMEOUT_MS);
    } catch (err) {
      return await apiWithTimeout('GET', path, AVAILABILITY_TIMEOUT_MS);
    }
  }

  function monthHasOpenings(data) {
    return !!(data && Array.isArray(data.days) && data.days.some((d) => !d.past && d.slots.length > 0));
  }

  // First-touch marketing attribution. Reads utm_* + ad click ids from the landing-page
  // URL and remembers them for this browser tab (sessionStorage), so they survive the
  // multi-step booking flow and any in-site navigation before checkout. Sent with the
  // booking so the revenue report can tie it back to the traffic source (Meta ad,
  // organic, direct, etc.). Best-effort: any failure returns null and never blocks a
  // booking. Call captureAttribution() once on load to stamp first-touch.
  const ATTRIBUTION_STORAGE_KEY = 'wbw_attribution';
  function captureAttribution() {
    try {
      const stored = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) { /* sessionStorage unavailable — fall through and read the URL directly */ }

    let params;
    try { params = new URLSearchParams(window.location.search); }
    catch (e) { params = new URLSearchParams(); }
    const pick = (...keys) => {
      for (const k of keys) { const v = params.get(k); if (v) return v; }
      return null;
    };
    let referrerHost = null;
    try { if (document.referrer) referrerHost = new URL(document.referrer).hostname || null; }
    catch (e) { /* opaque or missing referrer */ }

    const attribution = {
      utm_source: pick('utm_source'),
      utm_medium: pick('utm_medium'),
      utm_campaign: pick('utm_campaign'),
      utm_content: pick('utm_content'),
      utm_term: pick('utm_term'),
      click_id: pick('fbclid', 'gclid', 'ttclid', 'msclkid'),
      landing_referrer: referrerHost,
    };
    if (!Object.values(attribution).some(Boolean)) return null;
    try { sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution)); }
    catch (e) { /* can't persist — still return it for this booking */ }
    return attribution;
  }
  // Stamp first-touch as soon as the script runs, before any in-site navigation can drop
  // the query string.
  captureAttribution();

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
      this.prevMonthBtn = el('button', { onclick: () => this.changeMonth(-1) }, ['‹ Prev']);
      this.nextMonthBtn = el('button', { onclick: () => this.changeMonth(1) }, ['Next ›']);
      const nav = el('div', { class: 'wbw-month-nav' }, [
        this.prevMonthBtn,
        this.monthLabel,
        this.nextMonthBtn,
      ]);
      this.dayGrid = el('div', { class: 'wbw-day-grid' });
      // Reassurance line shown while availability loads. The booking API sleeps when
      // idle, so a first request can take several seconds — a silent blank grid on a
      // phone reads as "broken" and is where people leave.
      this.calendarStatus = el('div', { class: 'wbw-calendar-status', hidden: 'hidden' });
      // Shown instead of a dead grid when a month has no openings at all.
      this.calendarEmpty = el('div', { class: 'wbw-calendar-empty', hidden: 'hidden' });
      this.slotsWrap = el('div', { class: 'wbw-slots' });
      this.dateError = el('div', { class: 'wbw-error' });
      const nextBtn = el('button', { class: 'wbw-btn', onclick: () => this.goToDetails() }, ['Continue']);
      step.append(nav, this.dayGrid, this.calendarStatus, this.calendarEmpty, this.slotsWrap, this.dateError, nextBtn);
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
                if (a.learnMoreUrl) {
                            // stopPropagation so tapping this link doesn't also toggle the parent
                            // <label>'s checkbox — it opens in a new tab, so the booking modal the
                            // person is mid-checkout in is never touched or lost.
                            children.push(el('a', {
                                          href: a.learnMoreUrl,
                                          target: '_blank',
                                          rel: 'noopener',
                                          class: 'wbw-addon-learn-more',
                                          onclick: (e) => e.stopPropagation(),
                            }, ['Learn more']));
                }
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
      this.textConfirmCheckbox = el('input', { type: 'checkbox' });
      this.textConfirmRow = el('label', { class: 'wbw-policy-agree' }, [
        this.textConfirmCheckbox,
        ' One of our team will be assigned to you, and your photographer will text you to confirm in case of any last-minute changes. Please have your phone charged and respond to their text — otherwise the photographer will assume you are a no-show.',
      ]);
      this.sunrisePunctualityCheckbox = el('input', { type: 'checkbox' });
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
          el('label', {}, ['Session Policies']),
          this.policyBox,
          el('label', { class: 'wbw-policy-agree' }, [this.policyCheckbox, ' I have read and agree to the session policies above.']),
          this.textConfirmRow,
          this.sunrisePunctualityRow,
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
      this.holdNotice = el('div', { class: 'wbw-quote-note', style: 'margin:12px 0;font-weight:700;' });
      this.holdCountdown = el('div', { class: 'wbw-due-today', style: 'margin-bottom:14px;' });
      this.cardElementWrap = el('div', { id: 'wbw-card-element' });
      this.payError = el('div', { class: 'wbw-error' });
      this.payBtn = el('button', { class: 'wbw-btn', onclick: () => this.submitPayment() }, [`Pay ${fmtDollars(DEFAULT_DEPOSIT_CENTS)} Deposit`]);
      step.append(
        this.paymentSummary,
        this.holdNotice,
        this.holdCountdown,
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

    open(slug, name, preselect = null) {
      const requestedDate = preselect?.date || null;
      const requestedMonth = requestedDate ? new Date(`${requestedDate}T12:00:00`) : new Date();
      this.state = {
        slug, name, month: requestedMonth, selectedDate: null, selectedSlot: null,
        preselect: requestedDate ? { date: requestedDate, startTime: preselect.startTime || null } : null,
        bookingId: null, bookingReference: null, clientSecret: null,
        purchased: false, abandonTracked: false,
      };
      if (!this.overlay) this.buildDom();
      clearInterval(this.holdTimer);
      ADDON_DEFS.forEach((addon) => {
        const applies = !addon.sessionSlugs || addon.sessionSlugs.includes(slug);
        this.addonRows[addon.slug].hidden = !applies;
        this.addonInputs[addon.slug].checked = false;
      });
      this.sunrisePunctualityRow.hidden = slug !== 'sunrise-max';
      this.sunrisePunctualityCheckbox.checked = false;
      this.textConfirmCheckbox.checked = false;
      this.specialRequestsInput.value = '';
      this.floristContactCheckbox.checked = false;
      this.titleEl.textContent = name;
      this.showStep('date');
      this.dateError.textContent = '';
      this.overlay.hidden = false;
      if (typeof window.waileaTrack === 'function') {
        window.waileaTrack('booking_start', { booking_system: 'wailea', session_type: slug });
      }
      this.loadMonth();
    }

    close() {
      this.trackAbandoned('closed_widget');
      clearInterval(this.holdTimer);
      if (this.overlay) this.overlay.hidden = true;
    }

    startHoldCountdown(expiresAt, resumed) {
      clearInterval(this.holdTimer);
      this.state.holdExpiresAt = expiresAt;
      this.state.holdExpired = false;
      this.payBtn.disabled = false;
      this.payError.textContent = '';
      this.holdNotice.textContent = resumed
        ? 'You already started this booking. Continue payment below—your original reservation is still active.'
        : 'This session is reserved for you while you complete payment.';
      const update = () => {
        const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = String(remainingSeconds % 60).padStart(2, '0');
        this.holdCountdown.textContent = remainingSeconds
          ? `Time remaining to complete payment: ${minutes}:${seconds}`
          : 'This payment hold has expired.';
        if (!remainingSeconds) {
          clearInterval(this.holdTimer);
          this.state.holdExpired = true;
          this.payBtn.disabled = true;
          this.payError.textContent = 'Your 15-minute hold expired. Go back and select the session again to start a new booking.';
        }
      };
      update();
      this.holdTimer = setInterval(update, 1000);
    }

    changeMonth(delta) {
      this.state.month = new Date(this.state.month.getFullYear(), this.state.month.getMonth() + delta, 1);
      this.state.selectedDate = null;
      this.state.selectedSlot = null;
      this.loadMonth();
    }

    renderDayHeads() {
      ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d) => this.dayGrid.appendChild(el('div', { class: 'wbw-day-head' }, [d])));
    }

    // Placeholder cells so the calendar has shape the instant the widget opens, instead
    // of an empty box while the availability request is in flight.
    renderCalendarSkeleton() {
      this.dayGrid.innerHTML = '';
      this.renderDayHeads();
      for (let i = 0; i < 35; i++) this.dayGrid.appendChild(el('div', { class: 'wbw-day-skeleton' }));
    }

    setCalendarBusy(busy) {
      if (this.prevMonthBtn) this.prevMonthBtn.disabled = busy;
      if (this.nextMonthBtn) this.nextMonthBtn.disabled = busy;
    }

    async loadMonth() {
      const y = this.state.month.getFullYear();
      const monthNum = this.state.month.getMonth() + 1;
      const m = String(monthNum).padStart(2, '0');
      // Guards against out-of-order responses when someone taps Next twice quickly: only
      // the most recent request is allowed to paint.
      const token = (this.loadToken = (this.loadToken || 0) + 1);

      this.monthLabel.textContent = this.state.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      this.slotsWrap.innerHTML = '';
      this.dateError.textContent = '';
      this.calendarEmpty.hidden = true;
      this.calendarEmpty.innerHTML = '';
      this.renderCalendarSkeleton();
      this.setCalendarBusy(true);
      this.calendarStatus.textContent = 'Checking availability…';
      this.calendarStatus.hidden = false;
      const hintTimer = setTimeout(() => {
        if (this.loadToken === token) {
          this.calendarStatus.textContent = 'Still checking — the calendar is waking up. Just a few more seconds.';
        }
      }, COLD_START_HINT_MS);

      let data;
      try {
        data = await fetchAvailability(this.state.slug, y, monthNum);
      } catch (err) {
        clearTimeout(hintTimer);
        if (this.loadToken !== token) return;
        this.setCalendarBusy(false);
        this.calendarStatus.hidden = true;
        this.showCalendarError();
        return;
      }
      clearTimeout(hintTimer);
      if (this.loadToken !== token) return;
      this.setCalendarBusy(false);
      this.calendarStatus.hidden = true;

      this.dayGrid.innerHTML = '';
      this.renderDayHeads();

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

      if (this.state.preselect && this.state.preselect.date.startsWith(`${y}-${m}`)) {
        const requested = this.state.preselect;
        this.state.preselect = null;
        const day = data.days.find((candidate) => candidate.date === requested.date);
        const dayButton = Array.from(this.dayGrid.querySelectorAll('.wbw-day')).find((button) => Number(button.textContent) === Number(requested.date.slice(-2)));
        const slot = day?.slots?.find((candidate) => !requested.startTime || candidate.startTime === requested.startTime);
        if (day && dayButton && slot) this.selectDate(day, { target: dayButton }, slot.startTime);
        else this.dateError.textContent = 'That opening was just filled. Please choose another available date and time.';
      }

      // A month with nothing open used to render as a grid of greyed-out numbers, which
      // looks broken rather than busy. Say so plainly and offer the next real opening.
      if (!monthHasOpenings(data)) this.showEmptyMonth(token);
    }

    showCalendarError() {
      this.dayGrid.innerHTML = '';
      this.renderDayHeads();
      this.calendarEmpty.innerHTML = '';
      this.calendarEmpty.hidden = false;
      this.calendarEmpty.append(
        el('div', { class: 'wbw-calendar-empty-title' }, ["We couldn't load the calendar."]),
        el('div', { class: 'wbw-calendar-empty-sub' }, ['This is usually a brief hiccup on our end, not your connection.']),
        el('button', { class: 'wbw-btn wbw-btn-secondary wbw-jump-btn', onclick: () => this.loadMonth() }, ['Try again']),
        el('div', { class: 'wbw-calendar-empty-sub' }, ['Still stuck? Email photo@waileaphoto.com and we\'ll book you by hand.']),
      );
    }

    async showEmptyMonth(token) {
      const monthName = this.state.month.toLocaleDateString('en-US', { month: 'long' });
      this.calendarEmpty.innerHTML = '';
      this.calendarEmpty.hidden = false;
      this.calendarEmpty.appendChild(
        el('div', { class: 'wbw-calendar-empty-title' }, [`${monthName} is fully booked.`])
      );
      const searching = el('div', { class: 'wbw-calendar-empty-sub' }, ['Finding the next opening…']);
      this.calendarEmpty.appendChild(searching);

      const next = await this.findNextOpening();
      if (this.loadToken !== token) return; // they navigated on while we were looking

      if (!next) {
        searching.textContent = 'Nothing open in the next six months. Email photo@waileaphoto.com and we\'ll find you a time.';
        return;
      }
      searching.remove();
      const pretty = new Date(`${next.date}T12:00:00`)
        .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      this.calendarEmpty.appendChild(el('button', {
        class: 'wbw-btn wbw-btn-secondary wbw-jump-btn',
        onclick: () => this.jumpToOpening(next),
      }, [`Next opening: ${pretty} →`]));
    }

    // Walks forward a month at a time until it finds a date with slots. Only ever runs
    // when the current month is empty, so the extra requests cost nothing in the normal case.
    async findNextOpening() {
      const y = this.state.month.getFullYear();
      const monthIndex = this.state.month.getMonth();
      for (let i = 1; i <= MAX_LOOKAHEAD_MONTHS; i++) {
        const probe = new Date(y, monthIndex + i, 1);
        let data;
        try {
          data = await fetchAvailability(this.state.slug, probe.getFullYear(), probe.getMonth() + 1);
        } catch (err) {
          continue; // one bad month shouldn't end the search
        }
        const day = (data.days || []).find((d) => !d.past && d.slots.length > 0);
        if (day) return { date: day.date, month: probe };
      }
      return null;
    }

    jumpToOpening(next) {
      this.state.month = next.month;
      this.state.selectedDate = null;
      this.state.selectedSlot = null;
      // Preselect so the client lands on the date with its first time already chosen —
      // one tap from an empty month to a bookable slot.
      this.state.preselect = { date: next.date, startTime: null };
      this.loadMonth();
    }

    selectDate(day, e, preferredStartTime = null) {
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
        }, [`${fmtTime12(slot.startTime)} – ${fmtTime12(slot.endTime)}`]);
        this.slotsWrap.appendChild(btn);
        if (preferredStartTime && slot.startTime === preferredStartTime) btn.click();
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
          startTime: this.state.selectedSlot ? this.state.selectedSlot.startTime : null,
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
      this.quoteBox.appendChild(el('div', { class: 'wbw-quote-note' }, ['Balance due at end of session in Cash or Zelle only. If using Credit Card or Venmo a $30 fee will be added.']));

      function row(label, value, isTotal) {
        return el('div', { class: `wbw-quote-row${isTotal ? ' wbw-total' : ''}` }, [
          el('span', {}, [label]),
          el('span', {}, [value]),
        ]);
      }
    }

    async goToPayment(event) {
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
      if (!this.textConfirmCheckbox.checked) {
        this.detailsError.textContent = "Please confirm you'll respond to your photographer's text to continue.";
        return;
      }
      if (this.state.slug === 'sunrise-max' && !this.sunrisePunctualityCheckbox.checked) {
        this.detailsError.textContent = 'Please acknowledge the Sunrise session arrival-time policy to continue.';
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
          client: { name: this.nameInput.value, email: this.emailInput.value, phone: this.phoneInput.value, smsOptIn: this.smsOptInCheckbox.checked },
          questionnaire: {
            agreedToPolicies: this.policyCheckbox.checked,
            acknowledgedTextConfirmation: this.textConfirmCheckbox.checked,
            acknowledgedSunrisePunctuality: this.state.slug === 'sunrise-max' ? this.sunrisePunctualityCheckbox.checked : undefined,
            hearAboutUs: this.hearAboutInput.value,
            celebrating: this.celebratingInput.value || undefined,
            specialRequests: this.specialRequestsInput.value || undefined,
            floristContactRequested: this.floristContactCheckbox.checked,
          },
          // First-touch traffic source for this booking. The API sanitises and stores it
          // on the booking row, which is what makes revenueBySource in the weekly revenue
          // report meaningful instead of everything landing in "Direct / untagged".
          attribution: captureAttribution() || undefined,
        });
        this.state.bookingId = result.booking.id;
        this.state.bookingReference = result.booking.booking_reference;
        this.state.clientSecret = result.stripe.clientSecret;
        this.state.quote = result.quote;
        this.state.totalPriceCents = result.booking.total_price_cents;
        this.state.depositCents = result.booking.deposit_cents;
        this.startHoldCountdown(result.holdExpiresAt, result.resumed === true);

        if (typeof window.waileaTrack === 'function') {
          window.waileaTrack('begin_checkout', {
            currency: 'USD',
            value: result.booking.total_price_cents / 100,
            booking_system: 'wailea',
            session_type: this.state.slug,
            items: [{ item_id: this.state.slug, item_name: this.state.name, quantity: 1 }],
          });
        }

        this.paymentSummary.innerHTML = '';
        this.paymentSummary.appendChild(el('div', { class: 'wbw-quote-row wbw-total' }, [
          el('span', {}, [`${this.state.name} — ${this.state.selectedDate} ${fmtTime12(this.state.selectedSlot.startTime)}`]),
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
      if (this.state.holdExpired) {
        this.payError.textContent = 'Your 15-minute hold expired. Go back and select the session again.';
        return;
      }
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
          this.trackAbandoned('payment_declined');
          return;
        }
        this.showSuccess(paymentIntent);
      } catch (err) {
        this.payError.textContent = err.message;
        this.trackAbandoned('payment_error');
      } finally {
        this.payBtn.disabled = false;
        this.payBtn.textContent = `Pay ${fmtDollars(depositCentsFor(this.state.slug))} Deposit`;
      }
    }

    showSuccess(paymentIntent) {
      clearInterval(this.holdTimer);
      this.trackPurchase(paymentIntent);
      this.successBody.innerHTML = '';
      this.successBody.append(
        el('div', { class: 'wbw-success-icon' }, ['✓']),
        el('h3', {}, ['You’re booked!']),
        el('p', {}, [`Booking reference: ${this.state.bookingReference}`]),
        el('p', {}, [`${this.state.name} — ${this.state.selectedDate} at ${fmtTime12(this.state.selectedSlot.startTime)} (Hawaii time).`]),
        el('p', { class: 'wbw-quote-note' }, [`Payment status: ${paymentIntent.status}. A confirmation email is on its way once it's fully processed.`]),
        el('a', { class: 'wbw-btn', href: `${API_BASE}/api/bookings/${this.state.bookingId}/ics`, target: '_blank', style: 'display:block;margin-top:16px;text-decoration:none;' }, ['Add to Calendar']),
        el('button', { class: 'wbw-btn wbw-btn-secondary', style: 'margin-top:10px;', onclick: () => this.close() }, ['Done'])
      );
      this.showStep('success');
    }

    // Fires the GA4 purchase event with the booking's real total value, so
    // conversions show accurate revenue instead of $0. Value matches
    // begin_checkout's value (full session price, not just today's deposit)
    // for a consistent funnel. Only fires once per completed Stripe payment
    // (called from showSuccess, which itself only runs after
    // stripe.confirmPayment resolves without an error).
    trackPurchase(paymentIntent) {
      if (typeof window.waileaTrack !== 'function') return;
      if (!paymentIntent || (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing')) return;
      this.state.purchased = true;
      const totalDollars = (this.state.totalPriceCents || 0) / 100;
      window.waileaTrack('purchase', {
        transaction_id: this.state.bookingReference || String(this.state.bookingId || paymentIntent.id || ''),
        value: totalDollars,
        currency: 'USD',
        booking_system: 'wailea',
        session_type: this.state.slug,
        items: [{
          item_id: this.state.slug,
          item_name: this.state.name,
          price: totalDollars,
          quantity: 1,
        }],
      });
    }

    // Fires a GA4 "booking_abandoned" event for a booking that was created on the
    // server (so we know its real dollar value) but never completed payment —
    // either the client backed out of the widget, hit a declined/failed card, or
    // left the tab entirely. Reported alongside `purchase` so revenue reporting can
    // separate real sales from lost/abandoned attempts. Guards against firing:
    //  - before a booking record exists (bookingId not set yet — nothing lost)
    //  - after a successful purchase (trackPurchase sets state.purchased)
    //  - more than once per booking (state.abandonTracked)
    trackAbandoned(reason) {
      if (typeof window.waileaTrack !== 'function') return;
      if (!this.state || !this.state.bookingId) return;
      if (this.state.purchased || this.state.abandonTracked) return;
      this.state.abandonTracked = true;
      const totalDollars = (this.state.totalPriceCents || 0) / 100;
      window.waileaTrack('booking_abandoned', {
        value: totalDollars,
        currency: 'USD',
        booking_system: 'wailea',
        session_type: this.state.slug,
        reason,
        transaction_id: this.state.bookingReference || String(this.state.bookingId || ''),
        items: [{
          item_id: this.state.slug,
          item_name: this.state.name,
          price: totalDollars,
          quantity: 1,
        }],
      });
    }
  }

  const widget = new BookingWidget();
  window.WaileaBookingWidget = widget;

  // Catches abandonment when the client closes the tab / navigates away entirely
  // instead of clicking the widget's own close button (which already calls
  // trackAbandoned via close()). pagehide fires reliably on tab close, unlike
  // beforeunload, and works on mobile Safari where unload doesn't fire.
  window.addEventListener('pagehide', () => {
    if (widget.state) widget.trackAbandoned('left_page');
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-book-session]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        widget.open(btn.getAttribute('data-book-session'), btn.getAttribute('data-session-name') || 'Your Session');
      });
    });

    // Deep-link support for "Calendar" CTAs on the experience landing pages
    // (maui-family-photographer.html etc.) — e.g. pricing.html?openBooking=babymoon
    // opens straight into that session's live calendar instead of making the visitor
    // scroll and pick a card first.
    const deepLink = new URLSearchParams(window.location.search);
    const openSlug = deepLink.get('openBooking');
    if (openSlug) {
      const target = document.querySelector(`[data-book-session="${CSS.escape(openSlug)}"]`);
      if (target) {
        // Optional &date=YYYY-MM-DD&startTime=HH:MM (e.g. from the concierge's
        // booking links) preselects the exact slot instead of just the session.
        const date = deepLink.get('date');
        const startTime = deepLink.get('startTime');
        if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          widget.open(
            target.getAttribute('data-book-session'),
            target.getAttribute('data-session-name') || 'Your Session',
            { date, startTime: startTime && /^\d{2}:\d{2}$/.test(startTime) ? startTime : null }
          );
        } else {
          target.click();
        }
      }
    }
  });
})();
