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
    window.gtag('event', eventName, parameters || {});
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
