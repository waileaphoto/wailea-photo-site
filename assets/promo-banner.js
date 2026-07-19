// promo-banner.js — "Free 24-Pack of Holiday Cards" booking incentive.
//
// Honest-urgency design: the 30-minute window starts on a visitor's first page load
// and is stored in localStorage (not sessionStorage), so it does NOT reset every time
// they reload the page or click between index.html and pricing.html — closing the tab
// and coming back 5 minutes later still shows the real remaining time. It only resets
// to a fresh 30 minutes after a 24-hour cooldown, so the offer doesn't stay permanently
// "expired" for someone who looks today and comes back to book next week. This avoids
// the fake-countdown-that-secretly-resets pattern regulators (FTC vs. Fashion Nova, etc.)
// have gone after — the clock shown is always the real clock.
//
// Dismissing the banner (the × button) only hides the UI for that browser session — it
// does NOT cancel the offer. If someone closes the banner but books within the real
// window, they still get the discount tag, since punishing an accidental dismiss would
// undercut the trust this promo is meant to build.
(function () {
  const DURATION_MS = 30 * 60 * 1000; // the real offer window: 30 minutes
  const COOLDOWN_MS = 24 * 60 * 60 * 1000; // how long an expired window stays expired before a fresh one starts
  const START_KEY = 'wp_promo_holidaycards_start';
  const DISMISS_KEY = 'wp_promo_holidaycards_dismissed';
  const PROMO_CODE = 'HOLIDAYCARDS';

  function getWindowStart() {
    const now = Date.now();
    const raw = localStorage.getItem(START_KEY);
    if (raw) {
      const start = Number(raw);
      if (Number.isFinite(start) && now - start <= DURATION_MS + COOLDOWN_MS) {
        return start;
      }
    }
    localStorage.setItem(START_KEY, String(now));
    return now;
  }

  const windowStart = getWindowStart();
  const expiresAt = windowStart + DURATION_MS;
  function remainingMs() {
    return expiresAt - Date.now();
  }

  // Exposed globally so booking-widget.js can check, at the moment someone actually
  // books, whether they're still inside the real window — independent of whether the
  // banner UI is currently showing or was dismissed.
  window.WP_PROMO_HOLIDAYCARDS_ACTIVE = function () {
    return remainingMs() > 0;
  };
  window.WP_PROMO_HOLIDAYCARDS_CODE = PROMO_CODE;

  document.addEventListener('DOMContentLoaded', () => {
    if (remainingMs() <= 0) return; // real window has passed — nothing to show
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return; // they already closed it this session

    const bar = document.createElement('div');
    bar.className = 'promo-banner';
    bar.innerHTML = [
      '<span class="promo-banner-copy">',
      '<strong>Free 24-Pack of Holiday Cards</strong> — book your session in the next ',
      '<span class="promo-banner-timer">30:00</span> and we’ll include them, on us. Code <strong>' + PROMO_CODE + '</strong>.',
      '</span>',
      '<button type="button" class="promo-banner-close" aria-label="Dismiss offer">×</button>',
    ].join('');
    document.body.prepend(bar);
    document.body.classList.add('promo-active');
    document.documentElement.style.setProperty('--promo-h', bar.offsetHeight + 'px');

    if (typeof window.waileaTrack === 'function') {
      window.waileaTrack('promo_shown', { promo: 'holidaycards', link_location: window.location.pathname });
    }

    const timerEl = bar.querySelector('.promo-banner-timer');
    const closeBtn = bar.querySelector('.promo-banner-close');
    let intervalId = null;

    function render() {
      const ms = remainingMs();
      if (ms <= 0) {
        teardown();
        return;
      }
      const totalSec = Math.ceil(ms / 1000);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      timerEl.textContent = `${mm}:${ss}`;
    }

    function teardown() {
      if (intervalId) clearInterval(intervalId);
      bar.remove();
      document.body.classList.remove('promo-active');
    }

    render();
    intervalId = setInterval(render, 1000);

    closeBtn.addEventListener('click', () => {
      sessionStorage.setItem(DISMISS_KEY, '1');
      teardown();
      if (typeof window.waileaTrack === 'function') {
        window.waileaTrack('promo_dismissed', { promo: 'holidaycards', link_location: window.location.pathname });
      }
    });

    // Resize can change wrapped-text banner height (e.g. rotating a phone) — keep the
    // fixed header offset in sync so it never overlaps the banner text.
    window.addEventListener('resize', () => {
      if (document.body.contains(bar)) {
        document.documentElement.style.setProperty('--promo-h', bar.offsetHeight + 'px');
      }
    });
  });
})();
