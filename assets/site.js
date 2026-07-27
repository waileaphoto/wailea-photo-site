/* Wailea Photo — shared site behavior (menu, reveal animation, counters, sliders) */
(function(){
  const menu = document.querySelector('.menu');
  const openBtn = document.querySelector('.menu-open-btn');
  const closeBtn = document.querySelector('.menu-close');
  if (menu && openBtn && closeBtn) {
    const menuLinks = menu.querySelectorAll('a');
    function setMenu(open){
      menu.classList.toggle('open', open);
      menu.setAttribute('aria-hidden', String(!open));
      openBtn.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('menu-open', open);
    }
    openBtn.addEventListener('click', () => setMenu(true));
    closeBtn.addEventListener('click', () => setMenu(false));
    menuLinks.forEach(link => link.addEventListener('click', () => setMenu(false)));
  }

  // Fix: on a fresh page load that lands with a URL hash (e.g. clicking a menu
  // link like index.html#story-paths from another page), html{scroll-behavior:
  // smooth} can start an animated scroll that gets interrupted by images/fonts
  // still loading and shifting the page height, leaving the browser stuck near
  // the top instead of at the target section. Force an instant, header-offset-
  // aware jump once everything has finished loading.
  function jumpToHash(){
    if (!location.hash) return;
    let target;
    try { target = document.querySelector(location.hash); } catch (e) { return; }
    if (!target) return;
    const header = document.querySelector('.site-header');
    const offset = (header ? header.offsetHeight : 0) + 16;
    const prevBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    const y = target.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo(0, Math.max(y, 0));
    document.documentElement.style.scrollBehavior = prevBehavior;
  }
  if (document.readyState === 'complete') {
    setTimeout(jumpToHash, 60);
  } else {
    window.addEventListener('load', () => setTimeout(jumpToHash, 60));
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: .15 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  const trustNumber = document.querySelector('[data-count-target]');
  if (trustNumber) {
    const target = Number(trustNumber.dataset.countTarget || 1000);
    const duration = 1200;
    let hasCounted = false;
    const renderCount = value => {
      trustNumber.textContent = `${Math.round(value).toLocaleString('en-US')}+`;
    };
    const startCounter = () => {
      if (hasCounted) return;
      hasCounted = true;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        renderCount(target);
        return;
      }
      const start = performance.now();
      const animate = now => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        renderCount(target * eased);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    };
    const counterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          startCounter();
          counterObserver.disconnect();
        }
      });
    }, { threshold: 0.35 });
    counterObserver.observe(trustNumber);
  }

  function createCrossfadeSlider(config){
    const root = document.querySelector(config.root);
    const dotsRoot = document.querySelector(config.dots);
    const prev = document.querySelector(config.prev);
    const next = document.querySelector(config.next);
    if (!root) return null;
    let index = 0;
    const slides = () => [...root.querySelectorAll(config.slideSelector)];
    function buildDots(){
      if (!dotsRoot) return;
      dotsRoot.innerHTML = '';
      slides().forEach((_, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = config.dotClass; b.setAttribute('aria-label', `View image ${i + 1}`);
        b.addEventListener('click', () => show(i)); dotsRoot.appendChild(b);
      });
    }
    function show(i){
      const list = slides(); if (!list.length) return;
      index = (i + list.length) % list.length;
      list.forEach((el, j) => el.classList.toggle('active', j === index));
      [...(dotsRoot?.children || [])].forEach((el, j) => el.classList.toggle('active', j === index));
    }
    prev?.addEventListener('click', () => show(index - 1));
    next?.addEventListener('click', () => show(index + 1));
    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    });
    let touch = 0;
    root.addEventListener('touchstart', e => touch = e.changedTouches[0].screenX, { passive: true });
    root.addEventListener('touchend', e => {
      const d = e.changedTouches[0].screenX - touch;
      if (Math.abs(d) > 45) show(index + (d < 0 ? 1 : -1));
    }, { passive: true });
    buildDots(); show(0);
    return { root, slides, buildDots, show, getIndex: () => index };
  }

  window.createCrossfadeSlider = createCrossfadeSlider;

  function createAutoCrossfade(rootSelector, slideSelector, intervalMs, initialDelayMs){
    const root = document.querySelector(rootSelector);
    if (!root) return null;
    const slides = () => [...root.querySelectorAll(slideSelector)];
    let index = 0;
    let timer = null;
    let started = false;
    function show(i){
      const list = slides(); if (!list.length) return;
      index = (i + list.length) % list.length;
      list.forEach((el, j) => el.classList.toggle('active', j === index));
    }
    function play(){
      clearInterval(timer);
      timer = setInterval(() => show(index + 1), intervalMs);
    }
    root.addEventListener('mouseenter', () => clearInterval(timer));
    root.addEventListener('mouseleave', () => { if (started) play(); });
    const visibilityObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !started) {
          started = true;
          show(0);
          clearTimeout(timer);
          timer = setTimeout(() => { show(1); play(); }, initialDelayMs != null ? initialDelayMs : 350);
          visibilityObserver.disconnect();
        }
      });
    }, { threshold: .1 });
    visibilityObserver.observe(root);
    return { root, slides, show };
  }

  window.createAutoCrossfade = createAutoCrossfade;

  function initVideoFacades(){
    document.querySelectorAll('.video-facade').forEach(facade => {
      function play(){
        const videoId = facade.getAttribute('data-video-id');
        if (!videoId || facade.classList.contains('is-playing')) return;
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
        iframe.title = facade.getAttribute('data-video-title') || 'Video';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.allowFullscreen = true;
        facade.appendChild(iframe);
        facade.classList.add('is-playing');
      }
      facade.addEventListener('click', play);
      facade.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); }
      });
    });
  }

  function initLightbox(selector){
    const figures = [...document.querySelectorAll(selector)];
    if (!figures.length) return;
    let overlay = document.querySelector('.lightbox');
    let imgEl;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'lightbox';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Enlarged image');
      overlay.innerHTML = '<button type="button" class="lightbox-close" aria-label="Close enlarged image">&times;</button><img alt="">';
      document.body.appendChild(overlay);
      imgEl = overlay.querySelector('img');
      function close(){
        overlay.classList.remove('is-open');
        imgEl.src = '';
      }
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
      overlay.querySelector('.lightbox-close').addEventListener('click', close);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    } else {
      imgEl = overlay.querySelector('img');
    }
    figures.forEach(fig => {
      const src = fig.querySelector('img')?.src;
      const alt = fig.querySelector('img')?.alt || '';
      if (!src) return;
      fig.setAttribute('role', 'button');
      fig.setAttribute('tabindex', '0');
      fig.setAttribute('aria-label', `View enlarged: ${alt}`);
      function open(){
        imgEl.src = src;
        imgEl.alt = alt;
        overlay.classList.add('is-open');
      }
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  window.initLightbox = initLightbox;

  function initTideTool(){
    const dateInput = document.getElementById('tideDate');
    if (!dateInput) return;
    const sunEl = document.getElementById('tideSunResults');
    const tideEl = document.getElementById('tideTableResults');
    const statusEl = document.getElementById('tideStatus');

    const LAT = 20.6837, LNG = -156.4460; // Wailea, Maui

    function fmtHST(isoUtc){
      try {
        return new Date(isoUtc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Honolulu' });
      } catch (e) { return '—'; }
    }
    function fmt12(hhmm){
      let [h, m] = hhmm.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12; if (h === 0) h = 12;
      return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
    }
    async function fetchWithTimeout(url, ms){
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      try {
        const res = await fetch(url, { signal: controller.signal });
        return res;
      } finally {
        clearTimeout(timer);
      }
    }

    // Sun and tide come from two independent, unrelated services — fetched and
    // rendered independently so a slow/retrying tide lookup never holds up the
    // (usually much faster) sunrise/sunset numbers from showing.
    async function loadSun(dateStr){
      sunEl.innerHTML = '<p class="tide-empty">Loading…</p>';
      const sunUrl = `https://api.sunrise-sunset.org/json?lat=${LAT}&lng=${LNG}&date=${dateStr}&formatted=0`;
      const sunRes = await fetch(sunUrl).then(r => r.json()).catch(() => null);
      if (sunRes && sunRes.status === 'OK') {
        const r = sunRes.results;
        sunEl.innerHTML =
          `<div class="tide-stat"><div class="tide-stat-label">SUNRISE</div><div class="tide-stat-value">${fmtHST(r.sunrise)}</div></div>` +
          `<div class="tide-stat"><div class="tide-stat-label">SUNSET</div><div class="tide-stat-value">${fmtHST(r.sunset)}</div></div>`;
      } else {
        sunEl.innerHTML = '<p class="tide-empty">Sunrise/sunset data isn’t available right now — please try again in a moment.</p>';
      }
    }

    async function loadTide(dateStr){
      tideEl.innerHTML = '<p class="tide-empty">Loading…</p>';
      const tideUrl = `/.netlify/functions/tide?date=${encodeURIComponent(dateStr)}`;
      const tideRes = await fetchWithTimeout(tideUrl, 10000)
        .then(res => res.ok ? res.json() : null)
        .catch(() => null);
      const preds = (tideRes && tideRes.predictions) || [];
      if (preds.length) {
        tideEl.innerHTML = preds.map(p => {
          const label = p.type === 'H' ? 'HIGH TIDE' : 'LOW TIDE';
          const timePart = (p.t || '').split(' ')[1] || '';
          const timeStr = timePart ? fmt12(timePart) : '—';
          const height = isNaN(parseFloat(p.v)) ? '' : `${parseFloat(p.v).toFixed(1)} ft`;
          return `<div class="tide-row"><span class="tide-row-label">${label}</span><span class="tide-row-time">${timeStr}</span><span class="tide-row-height">${height}</span></div>`;
        }).join('');
      } else {
        tideEl.innerHTML = '<p class="tide-empty">Tide data isn’t available right now — check <a href="https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=1615680" target="_blank" rel="noopener" style="color:var(--red)">NOAA directly</a>.</p>';
      }
    }

    function load(dateStr){
      if (!dateStr) return;
      statusEl.textContent = '';
      loadSun(dateStr);
      loadTide(dateStr);
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    dateInput.min = todayStr;
    dateInput.value = todayStr;
    dateInput.addEventListener('change', () => load(dateInput.value));
    load(todayStr);
  }

  window.initTideTool = initTideTool;

  document.addEventListener('DOMContentLoaded', () => {
    createCrossfadeSlider({ root:'#archiveSlider', dots:'.archive-dots', prev:'.archive-prev', next:'.archive-next', slideSelector:'figure', dotClass:'archive-dot' });
    createCrossfadeSlider({ root:'#artSlider', dots:'.art-dots', prev:'.art-prev', next:'.art-next', slideSelector:'.art-slide', dotClass:'art-dot' });
    createAutoCrossfade('#moodSlider1', '.mood-slide', 3000);
    createAutoCrossfade('#moodSlider2', '.mood-slide', 4200, 2000);
    initVideoFacades();
    initLightbox('.apo-gallery figure');
    initLightbox('.landscape-gallery figure');
    initLightbox('.experience-gallery figure');
    initTideTool();
  });
})();
fetch('footer.html')
  .then(response => response.text())
  .then(data => {
    document.getElementById('footer-placeholder').innerHTML = data;
    document.getElementById('year').textContent = new Date().getFullYear();
  });

/* ---------- session-finder: "Find Your Session" recommender (pricing.html only) ---------- */
document.addEventListener('DOMContentLoaded', function(){
  var form = document.querySelector('.session-finder-form');
  if(!form) return; // section only exists on pricing.html — safe no-op elsewhere

  var groupSel = document.getElementById('session-finder-group');
  var styleSel = document.getElementById('session-finder-style');
  var timingSel = document.getElementById('session-finder-timing');
  var resultEl = document.getElementById('session-finder-result');
  var nameEl = document.getElementById('session-finder-result-name');
  var copyEl = document.getElementById('session-finder-result-copy');
  var factsEl = document.getElementById('session-finder-result-facts');
  var socialProofEl = document.getElementById('session-finder-social-proof');
  var viewBtn = document.getElementById('session-finder-view');
  var bookBtn = document.getElementById('session-finder-book');
  var resetBtn = document.getElementById('session-finder-reset');
  if(!groupSel || !styleSel || !timingSel || !resultEl) return;

  // Maps each outcome to the matching, already-existing session card (by the
  // stable id added to that card) and its exact current display name and
  // facts (duration / image count / starting price), copied verbatim from
  // that card's own meta line and price pill. No new products, prices or
  // booking links are introduced — this only points to real cards already
  // on the page.
  var SESSIONS = {
    'family-legacy': {
      cardId: 'session-card-family-legacy',
      displayName: 'The Large Family Legacy',
      explanation: 'Large and multigenerational families need more time for the full group, individual households, grandparents, couples and children without feeling rushed.',
      facts: '100+ images · Starting at $995'
    },
    'poetic-wedding': {
      cardId: 'session-card-poetic-wedding',
      displayName: 'A Poetic Wedding in Maui',
      explanation: 'This experience allows the ceremony, family groupings and couple’s portraits to unfold together in beautiful Maui light.',
      facts: 'Starts at $995'
    },
    'turquoise-water': {
      cardId: 'session-card-turquoise-water',
      displayName: 'Turquoise + Water Experience',
      explanation: 'This longer session prioritizes vivid water, open coastal scenery and greater separation from Wailea’s resort beaches.',
      facts: '45 minutes · 50+ images · From $499'
    },
    'last-half-sunset': {
      cardId: 'session-card-last-half-sunset',
      displayName: 'Last Half of Sunset',
      explanation: 'The final light of the day creates richer color, deeper contrast and the most cinematic sunset atmosphere.',
      facts: 'Half hour · 50+ images · From $499'
    },
    'first-half-sunset': {
      cardId: 'session-card-first-half-sunset',
      displayName: 'First Half of Sunset — “Light & Bright”',
      explanation: 'This is the best fit for families who want bright, natural color and a relaxed session during the softer opening portion of golden hour.',
      facts: 'Half hour · 50+ images · From $399'
    },
    'sunrise-max': {
      cardId: 'session-card-sunrise-max',
      displayName: 'Sunrise with Max',
      explanation: 'A short sunrise session gives young children a comfortable, low-pressure start while Maui’s beaches are quieter and the light is soft.',
      facts: '20 minutes · 50+ images · From $299'
    }
  };

  // Maternity/babymoon copy depends on which real timing-driven outcome was
  // chosen (see recommend()) so the explanation always matches the session
  // actually being recommended.
  var MATERNITY_SUNRISE_EXPLANATION = 'Sunrise offers soft, flattering light, cooler temperatures and a quieter beach for an unhurried maternity experience.';
  var MATERNITY_SUNSET_EXPLANATION = 'The warm, gentle light at the end of the day is equally flattering for an unhurried maternity session, without an early wake-up call.';

  // "Plenty of time for a large family" points to First Half of Sunset's own
  // real, documented full-hour upgrade into Last Half of Sunset, rather than
  // a half-hour session that would contradict the priority selected.
  var LARGE_FAMILY_TIME_EXPLANATION = 'For a fuller group without feeling rushed, we recommend First Half of Sunset with its full-hour upgrade into Last Half of Sunset — giving everyone unhurried time for the whole group, individual households and separate portraits.';

  // When a chosen timing overrides a conflicting style preference, we say so
  // plainly instead of silently picking one. Each entry's "key" must match
  // the outcome recommend() actually produces for that exact combination, so
  var LARGE_FAMILY_TIME_FACTS = 'Half hour from $399 · Add the Last Half Sunset—a $499 value—for $199';
  // this can never override an unrelated group-level result (family/wedding).
  var TRADEOFFS = {
    'bright-natural|final-light': {
      key: 'last-half-sunset',
      note: 'You chose bright, natural color, but the final light before sunset leans warmer and more dramatic by nature. We recommend Last Half of Sunset for that golden, cinematic feel — First Half of Sunset is the closer match if brighter daylight color matters most.'
    },
    'short-easy|final-light': {
      key: 'last-half-sunset',
      note: 'Because you chose the final light before sunset, we recommend Last Half of Sunset. It’s still a concise half-hour session, just timed for richer sunset color instead of sunrise.'
    },
    'short-easy|early-golden-hour': {
      key: 'first-half-sunset',
      note: 'Because early golden hour was your priority, we recommend First Half of Sunset. It’s still a concise half-hour session, just timed for that brighter early light instead of sunrise.'
    }
  };

  // Priority order: occasion/group size first, then requested visual style,
  // then timing. NOTE: the site's earlier standalone maternity/babymoon
  // session has since been retired (maternity portraits are now offered
  // within Sunrise with Max or Last Half of Sunset), so the "maternity or
  // babymoon" answer is routed to whichever of those two real sessions
  // matches the requested timing rather than a now-nonexistent product.
  // "Plenty of time for a large family" is checked ahead of the timing rules
  // so an explicit request for more time is never silently overridden by a
  // shorter-session timing choice.
  function recommend(group, style, timing){
    if(group === 'family-10-plus') return 'family-legacy';
    if(group === 'wedding' || style === 'ceremony-portraits') return 'poetic-wedding';
    if(group === 'maternity'){
      return timing === 'sunrise' ? 'sunrise-max' : 'last-half-sunset';
    }
    if(style === 'large-family-time') return 'first-half-sunset';
    if(style === 'turquoise-water') return 'turquoise-water';
    if(style === 'dramatic-sunset' || timing === 'final-light') return 'last-half-sunset';
    if(style === 'bright-natural' || timing === 'early-golden-hour') return 'first-half-sunset';
    if(style === 'short-easy' || timing === 'sunrise') return 'sunrise-max';
    return 'first-half-sunset';
  }

  function explanationFor(group, style, timing, key, s){
    if(group === 'maternity'){
      return key === 'sunrise-max' ? MATERNITY_SUNRISE_EXPLANATION : MATERNITY_SUNSET_EXPLANATION;
    }
    if(style === 'large-family-time' && key === 'first-half-sunset'){
      return LARGE_FAMILY_TIME_EXPLANATION;
    }
    var tradeoff = TRADEOFFS[style + '|' + timing];
    if(tradeoff && tradeoff.key === key){
      return tradeoff.note;
    }
    return s.explanation;
  }

  function factsFor(style, key, s){
    if(style === 'large-family-time' && key === 'first-half-sunset'){
      return LARGE_FAMILY_TIME_FACTS;
    }
    return s.facts || '';
  }

  function showResult(){
    var group = groupSel.value, style = styleSel.value, timing = timingSel.value;
    if(!group || !style || !timing){ resultEl.hidden = true; return; }

    var key = recommend(group, style, timing);
    var s = SESSIONS[key];
    if(!s) return;

    nameEl.textContent = s.displayName;
    copyEl.textContent = explanationFor(group, style, timing, key, s);
    if(factsEl){ factsEl.textContent = factsFor(style, key, s); }

    if(socialProofEl){ socialProofEl.hidden = !(key === 'first-half-sunset' && style !== 'large-family-time'); }

    resultEl.dataset.sessionKey = key;
    resultEl.hidden = false;
  }

  [groupSel, styleSel, timingSel].forEach(function(sel){
    sel.addEventListener('change', showResult);
  });

  function scrollToCard(card, behavior){
    var header = document.querySelector('.site-header');
    var offset = (header ? header.offsetHeight : 0) + 16;
    var y = card.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(y, 0), behavior: behavior });
  }

  if(viewBtn){
    viewBtn.addEventListener('click', function(){
      var key = resultEl.dataset.sessionKey;
      if(!key || !SESSIONS[key]) return;
      var card = document.getElementById(SESSIONS[key].cardId);
      if(!card) return;
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollToCard(card, reduceMotion ? 'auto' : 'smooth');
      // Images that haven't finished lazy-loading above the target can shift
      // the page height after the initial scroll; re-correct once things
      // settle so the card doesn't end up short of where it should land.
      setTimeout(function(){ scrollToCard(card, 'auto'); }, 500);
      card.classList.add('session-finder-target');
      setTimeout(function(){ card.classList.remove('session-finder-target'); }, 2200);
    });
  }

  if(bookBtn){
    bookBtn.addEventListener('click', function(){
      var key = resultEl.dataset.sessionKey;
      if(!key || !SESSIONS[key]) return;
      var card = document.getElementById(SESSIONS[key].cardId);
      if(!card) return;
      // Reuse whatever booking action already exists on the real session card
      // (the widget-driven data-book-session button, or the wedding mailto
      // link) instead of duplicating any booking logic here.
      var bookLink = card.querySelector('.session-card-actions a.book');
      if(bookLink) bookLink.click();
    });
  }

  if(resetBtn){
    resetBtn.addEventListener('click', function(){
      groupSel.value = '';
      styleSel.value = '';
      timingSel.value = '';
      resultEl.hidden = true;
      delete resultEl.dataset.sessionKey;
      groupSel.focus();
    });
  }
});
