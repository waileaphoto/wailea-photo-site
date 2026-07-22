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
