// Wailea Photo analytics — keeps the existing GA4 property and avoids sending PII.
(function () {
  const MEASUREMENT_ID = 'G-SLQVD34D32';

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID);

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(tag);

  window.waileaTrack = function (eventName, parameters) {
    const params = parameters || {};
    window.gtag('event', eventName, params);

    // Mirror key funnel events to the Meta/Facebook Pixel (fb-pixel.js) using
    // Meta's standard event names, so Ads Manager can build conversion
    // campaigns off the same funnel GA4 tracks.
    if (typeof window.fbq === 'function') {
      if (eventName === 'booking_start') {
        window.fbq('track', 'Lead', { content_name: params.session_type || 'session', content_category: 'booking_start' });
      } else if (eventName === 'begin_checkout') {
        window.fbq('track', 'InitiateCheckout', {
          value: params.value,
          currency: params.currency || 'USD',
          content_ids: [params.session_type],
          content_type: 'product',
        });
      } else if (eventName === 'purchase') {
        window.fbq('track', 'Purchase', {
          value: params.value,
          currency: params.currency || 'USD',
          content_ids: [params.session_type],
          content_type: 'product',
        });
      } else if (eventName === 'promo_redeemed') {
        window.fbq('trackCustom', 'PromoRedeemed', {
          promo: params.promo,
          value: params.value,
          currency: params.currency || 'USD',
        });
      }
    }
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const experience = link.getAttribute('data-analytics-content');
    if (experience) {
      window.waileaTrack('select_content', {
        content_type: 'photo_experience',
        item_id: experience,
        link_location: window.location.pathname,
      });
    }
    let url;
    try { url = new URL(link.href, window.location.href); } catch (_) { return; }
    if (url.hostname === 'waileaportrait.as.me') {
      window.waileaTrack('booking_start', {
        booking_system: 'acuity',
        link_location: window.location.pathname,
      });
    }
  });
})();
