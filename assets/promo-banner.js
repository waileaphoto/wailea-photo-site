// promo-banner.js — "Free 24-Pack of Holiday Cards" booking incentive.
//
// Quantity-based scarcity, not a countdown clock: the offer is framed as reserved for
// the next PROMO_LIMIT bookings this month, with no visible timer or "X spots left"
// ticker. That's a deliberate choice — a live countdown (or a fake "3 left!" counter)
// reads as pressure-selling and risks the same trust problem as a discount banner. A
// calm, quietly-worded scarcity statement fits a premium brand better and doesn't
// require broadcasting booking volume to every visitor.
//
// Enforcement is manual by design: PROMO_ENABLED below is the on/off switch. Once the
// 10th qualifying booking comes in (visible in the internal alert emails, which already
// carry the HOLIDAYCARDS tag from booking-widget.js), flip PROMO_ENABLED to false and
// push — the banner disappears everywhere on next deploy. No server-side cap is enforced
// automatically; at this booking volume a manual toggle is simpler and just as reliable.
(function () {
  const PROMO_ENABLED = true;
  const PROMO_CODE = 'HOLIDAYCARDS';
  const DISMISS_KEY = 'wp_promo_holidaycards_dismissed';

  // Exposed globally so booking-widget.js can tag a booking at the moment someone
  // actually books, independent of whether the banner is currently visible or was
  // dismissed earlier in the visit.
  window.WP_PROMO_HOLIDAYCARDS_ACTIVE = function () {
    return PROMO_ENABLED;
  };
  window.WP_PROMO_HOLIDAYCARDS_CODE = PROMO_CODE;

  if (!PROMO_ENABLED) return;

  document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return; // they already closed it this session

    const bar = document.createElement('div');
    bar.className = 'promo-banner';
    bar.innerHTML = [
      '<span class="promo-banner-copy">',
      'Bookings for August and September include a complimentary <strong>24-Pack of Holiday Cards</strong> with your favorite photo, reserved only for the next 10 client bookings.',
      '</span>',
      '<button type="button" class="promo-banner-close" aria-label="Dismiss offer">×</button>',
    ].join('');
    document.body.prepend(bar);
    document.body.classList.add('promo-active');
    document.documentElement.style.setProperty('--promo-h', bar.offsetHeight + 'px');

    if (typeof window.waileaTrack === 'function') {
      window.waileaTrack('promo_shown', { promo: 'holidaycards', link_location: window.location.pathname });
    }

    const closeBtn = bar.querySelector('.promo-banner-close');
    function teardown() {
      bar.remove();
      document.body.classList.remove('promo-active');
    }

    closeBtn.addEventListener('click', () => {
      sessionStorage.setItem(DISMISS_KEY, '1');
      teardown();
      if (typeof window.waileaTrack === 'function') {
        window.waileaTrack('promo_dismissed', { promo: 'holidaycards', link_location: window.location.pathname });
      }
    });

    window.addEventListener('resize', () => {
      if (document.body.contains(bar)) {
        document.documentElement.style.setProperty('--promo-h', bar.offsetHeight + 'px');
      }
    });
  });
})();
