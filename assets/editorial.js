/* Wailea Photo — editorial chrome behaviour (Nov 2026).
   Concierge pill, background-music toggle. Loaded on every page after site.js. */
(function () {
  /* ---- Concierge pill: opens the same AI concierge as the pricing page ---- */
  function openConcierge() {
    var c = window.WaileaConcierge;
    if (c && c.open) { c.open(undefined, 'header_pill'); document.body.classList.add('ed-chat'); }
    else { location.href = 'pricing.html#session-finder'; }
  }
  document.querySelectorAll('[data-ed-concierge]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); openConcierge(); });
  });
  // Hide the pills while the chat panel is open.
  new MutationObserver(function () {
    var p = document.querySelector('.wpc-panel');
    document.body.classList.toggle('ed-chat', !!(p && p.classList.contains('wpc-open')));
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

  /* ---- Background music ("Cresting Waves", low volume) ----
     Never starts on its own here: someone arriving on a guide from search should get
     silence. It plays when the visitor turns it on, and if it was playing on the page
     they came from, it picks up where it left off on their first tap or click.
     Browsers only allow sound after a user gesture, so that tap is required. */
  var btn = document.querySelector('.ed-snd');
  if (!btn) return;
  var VOL = 0.16, KEY_ON = 'wp-music-on', KEY_T = 'wp-music-t', fadeT;
  var amb = new Audio();
  amb.loop = true; amb.preload = 'none';
  var src = btn.getAttribute('data-src');
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} }
  function ui() {
    var on = !amb.paused;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Turn music off' : 'Turn music on');
  }
  function fade(to, ms, done) {
    clearInterval(fadeT); var from = amb.volume, t0 = performance.now();
    fadeT = setInterval(function () {
      var k = Math.min(1, (performance.now() - t0) / ms); amb.volume = from + (to - from) * k;
      if (k >= 1) { clearInterval(fadeT); if (done) done(); }
    }, 40);
  }
  function play() {
    if (ducked) return;
    if (!amb.src) amb.src = src;
    var t = parseFloat(ss(KEY_T) || '0');
    if (t && !amb.currentTime) { try { amb.currentTime = t; } catch (e) {} }
    amb.volume = 0;
    amb.play().then(function () { fade(VOL, 2000); ss(KEY_ON, '1'); ui(); }).catch(ui);
  }
  function stop() { ss(KEY_ON, '0'); fade(0, 400, function () { amb.pause(); ui(); }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} }
  var ducked = false;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (amb.paused) { ls('wp-music', 'on'); play(); } else { ls('wp-music', 'off'); stop(); }
  });
  // Pages with their own soundtrack (the proposal film) duck the music while it plays.
  window.edMusic = {
    duck: function (d) {
      ducked = d;
      if (d) { if (!amb.paused) { amb.dataset.duck = '1'; fade(0, 400, function () { amb.pause(); ui(); }); } }
      else if (amb.dataset.duck) { delete amb.dataset.duck; play(); }
    }
  };
  // The home page invites music on the first tap (data-autostart), unless the visitor
  // turned it off before; every other page only resumes music that was already playing.
  // Phones and tablets never start music on their own (a swipe counts as a tap, and surprise
  // sound in public makes people leave); they get a one-time glow on the music button instead.
  var touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  var auto = btn.hasAttribute('data-autostart') && ls('wp-music') !== 'off' && !touch;
  if (touch && btn.hasAttribute('data-autostart') && ss(KEY_ON) !== '1' && ss('wp-music-hint') !== '1') {
    ss('wp-music-hint', '1');
    setTimeout(function () { btn.classList.add('hint'); setTimeout(function () { btn.classList.remove('hint'); }, 5200); }, 2500);
  }
  if (auto || ss(KEY_ON) === '1') {
    var first = function (e) {
      if (e.target.closest && e.target.closest('.ed-snd, [data-own-audio]')) return;
      ['pointerdown', 'keydown', 'touchend'].forEach(function (t) { removeEventListener(t, first, true); });
      play();
    };
    ['pointerdown', 'keydown', 'touchend'].forEach(function (t) { addEventListener(t, first, true); });
  }
  setInterval(function () { if (!amb.paused) ss(KEY_T, String(amb.currentTime)); }, 1000);
  addEventListener('pagehide', function () { if (!amb.paused) ss(KEY_T, String(amb.currentTime)); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && !amb.paused) { amb.pause(); amb.dataset.r = '1'; ui(); }
    else if (!document.hidden && amb.dataset.r && !ducked) { delete amb.dataset.r; play(); }
  });
  ui();
})();

/* ---- Smooth scrolling with a touch of momentum (computers only) ----
   Mouse wheels move the page in hard steps; Lenis eases each step out so the page glides.
   Phones keep their native scrolling, and Reduce Motion turns it off. Scroll panels
   (concierge, booking calendar, menu) scroll natively. */
(function () {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var s = document.createElement('script');
  s.src = '/assets/vendor/lenis-1.3.27.min.js'; s.async = true;
  s.onload = function () {
    if (!window.Lenis) return;
    var lenis = new window.Lenis({
      lerp: 0.09, wheelMultiplier: 0.9, smoothWheel: true, autoRaf: true,
      prevent: function (node) {
        return !!(node.closest && node.closest('.wpc-panel, .wbw-overlay, nav.menu, .lang-switch, [data-lenis-prevent], textarea, select'));
      }
    });
    window.edLenis = lenis;
    // Same-page links (e.g. the pricing list) glide instead of jumping.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href*="#"]');
      if (!a || e.defaultPrevented || document.body.classList.contains('menu-open')) return;
      var u = new URL(a.href, location.href);
      if (u.pathname !== location.pathname || !u.hash || u.hash.length < 2) return;
      var t; try { t = document.querySelector(decodeURIComponent(u.hash)); } catch (err) { return; }
      if (!t) return;
      e.preventDefault();
      var h = document.querySelector('.site-header'), sm = parseFloat(getComputedStyle(t).scrollMarginTop) || 0, off = sm ? 0 : -((h ? h.offsetHeight : 0) + 16), want = sm || -off, tries = 0;
      // Photos above can finish loading mid-glide and push the target down; re-aim until it lands.
      var go = function (dur) {
        lenis.scrollTo(t, { offset: off, duration: dur, onComplete: function () {
          if (Math.abs(t.getBoundingClientRect().top - want) > 6 && ++tries < 8) go(0.5);
        } });
      };
      go(1.2);
      history.pushState(null, '', u.hash);
    });
    // Pause while the menu, concierge or booking calendar is open.
    var sync = function () {
      var b = document.body, ov = document.querySelector('.wbw-overlay');
      var hold = b.classList.contains('menu-open') || b.classList.contains('ed-chat') || (ov && !ov.hidden);
      if (hold) lenis.stop(); else lenis.start();
    };
    new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  };
  document.head.appendChild(s);
})();
