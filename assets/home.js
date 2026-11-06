/* Wailea Photo — editorial home page behaviour (Nov 2026).
   All content is in the HTML; this only animates it. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var clamp = function (v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.min(b, Math.max(a, v)); };
  var body = document.body;

  /* ---- loader: brief counter (max ~1.6s), never waits on the video ---- */
  (function () {
    body.classList.add('lit');
    var pct = $('#pct'), shown = 0, target = 60, t0 = performance.now(), done = false;
    var im = new Image(); im.onload = im.onerror = function () { done = true; }; im.src = 'assets/home/tile-first-half-sm.webp';
    (function tick() {
      var el = performance.now() - t0;
      target = done ? 100 : Math.min(100, 60 + el / 30); if (el > 1600) target = 100;
      shown += Math.max(1.2, (target - shown) * 0.12); if (shown > target) shown = target;
      if (pct) pct.textContent = Math.floor(shown) + '%';
      if (shown >= 100) { var l = $('#loader'); if (l) l.classList.add('done'); body.classList.remove('loading'); body.classList.add('ready'); }
      else requestAnimationFrame(tick);
    })();
  })();

  /* hero video starts after the page has loaded, so it never competes with first paint */
  addEventListener('load', function () {
    var v = $('#heroVid'); if (!v) return;
    v.preload = 'auto'; v.load(); var p = v.play(); if (p && p.catch) p.catch(function () {});
  });

  /* ---- overlays ---- */
  function openO(el) { el.classList.add('open'); body.style.overflow = 'hidden'; body.classList.add('overlay'); }
  function closeO(el) { el.classList.remove('open'); body.style.overflow = ''; body.classList.remove('overlay'); }

  var modal = $('#modal');
  document.querySelectorAll('.card .q button').forEach(function (b) {
    b.addEventListener('click', function () {
      $('#mq').textContent = '“' + b.getAttribute('data-full') + '”';
      $('#mc').textContent = b.getAttribute('data-who');
      var v = $('#mv'), u = b.getAttribute('data-v');
      if (u) { v.href = u; v.hidden = false; } else { v.hidden = true; }
      openO(modal);
    });
  });
  modal.addEventListener('click', function (e) { if (e.target === modal || e.target.classList.contains('x')) closeO(modal); });

  /* proposal film plays with its own score; the background music steps aside */
  var film = $('#film'), filmVid = $('#filmVid'), filmAudio = $('#filmAudio');
  function stopFilm() {
    var was = film.classList.contains('open');
    filmVid.pause(); filmAudio.pause(); filmAudio.currentTime = 0;
    if (was) { closeO(film); if (window.edMusic) window.edMusic.duck(false); }
  }
  $('#filmBtn').addEventListener('click', function () {
    if (window.edMusic) window.edMusic.duck(true);
    openO(film); filmVid.currentTime = 0; filmAudio.currentTime = 0; filmAudio.volume = 1;
    filmVid.play().catch(function () {}); filmAudio.play().catch(function () {});
  });
  filmVid.addEventListener('pause', function () { if (!filmVid.ended) filmAudio.pause(); });
  filmVid.addEventListener('play', function () { if (film.classList.contains('open')) filmAudio.play().catch(function () {}); });
  filmVid.addEventListener('seeked', function () { filmAudio.currentTime = Math.min(filmVid.currentTime, filmAudio.duration || 1e9); });
  filmVid.addEventListener('ended', function () {
    var v = 1, t = setInterval(function () { v -= 0.1; if (v <= 0) { clearInterval(t); stopFilm(); } else filmAudio.volume = v; }, 80);
  });
  film.addEventListener('click', function (e) { if (e.target.tagName !== 'VIDEO') stopFilm(); });
  ['wheel', 'touchmove', 'scroll'].forEach(function (ev) {
    addEventListener(ev, function () { if (film.classList.contains('open')) stopFilm(); }, { passive: true });
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopFilm(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { stopFilm(); if (modal.classList.contains('open')) closeO(modal); }
    if (film.classList.contains('open') && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].indexOf(e.key) > -1) { e.preventDefault(); stopFilm(); }
  });

  /* ---- scroll choreography ---- */
  var hero = $('#editable-hero'), heroFog = $('#heroFog'), heroCopy = $('#heroCopy'), cue = $('#cue'), heroVid = $('#heroVid');
  var sess = $('#sessions'), sessFog = $('#sessFog'), counter = $('#counter');
  var slides = [].slice.call(document.querySelectorAll('#slides .slide')), lis = [].slice.call(document.querySelectorAll('#wheel li'));
  var N = slides.length;
  sess.style.height = ((N + 1) * 90 + 60) + 'vh';
  var rev = $('#reviews'), track = $('#track'), cards = [].slice.call(track.querySelectorAll('.card'));
  var exploreBg = $('#exploreBg');
  var mobile = matchMedia('(max-width:820px)').matches;
  addEventListener('resize', function () { mobile = matchMedia('(max-width:820px)').matches; });

  function frame() {
    var vh = innerHeight;
    var hr = hero.getBoundingClientRect(), hp = clamp(-hr.top / (hr.height - vh));
    heroCopy.style.opacity = 1 - clamp(hp * 2.2); heroCopy.style.transform = 'translateY(' + (-hp * 80) + 'px)';
    cue.style.opacity = 1 - clamp(hp * 5);
    heroFog.style.opacity = clamp((hp - 0.45) / 0.5);
    var b = clamp((hp - 0.3) / 0.6);
    heroVid.style.filter = 'blur(' + (b * 14) + 'px) brightness(' + (1 + b * 0.35) + ')';

    var sr = sess.getBoundingClientRect(), sp = clamp(-sr.top / (sr.height - vh)), f = sp * N;
    sessFog.style.opacity = 1 - clamp(f / 0.4);
    slides.forEach(function (s, i) {
      var o = i === 0 ? 1 : clamp((f - (i - 0.55)) / 0.42), life = clamp((f - (i - 0.38)) / 1.4);
      s.style.opacity = o; s.style.transform = 'scale(' + (1.08 - 0.08 * life) + ')';
    });
    var step = mobile ? 7 : 9;
    lis.forEach(function (li, i) {
      var d = i - f, ad = Math.abs(d);
      li.style.transform = 'rotate(' + (d * step) + 'deg)';
      li.style.opacity = ad > 4.5 ? 0 : (ad < 0.5 ? 1 : clamp(0.42 - ad * 0.06, 0.08, 0.42));
      li.style.filter = ad < 0.5 ? 'none' : 'blur(' + Math.min(ad * 1.1, 4) + 'px)';
      li.classList.toggle('is-on', ad < 0.5); li.style.pointerEvents = ad < 0.5 ? 'auto' : 'none';
    });
    var cur = Math.min(N, Math.round(f));
    counter.innerHTML = cur < N ? '<b>' + String(cur + 1).padStart(2, '0') + '</b> / ' + String(N).padStart(2, '0') : '';

    if (!mobile) {
      var rr = rev.getBoundingClientRect(), rp = clamp(-rr.top / (rr.height - vh));
      var tw = track.scrollWidth - innerWidth * 0.98;
      track.style.transform = 'translateX(' + (-rp * tw) + 'px)';
      cards.forEach(function (c) { var d = +c.getAttribute('data-depth'); c.style.transform = 'translate(' + ((1 - d) * rp * innerWidth * 0.6) + 'px,' + ((d - 1) * rp * -120) + 'px)'; });
    }
    var er = exploreBg.parentElement.getBoundingClientRect();
    exploreBg.style.transform = 'translateY(' + ((er.top / vh) * -6) + '%)';
  }
  var ticking = false;
  var kick = function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; frame(); }); } };
  addEventListener('scroll', kick, { passive: true }); addEventListener('resize', kick); frame();

  /* reveal + lazy footer image */
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.h-rv').forEach(function (el) { io.observe(el); });
  new IntersectionObserver(function (es, o) {
    if (es[0].isIntersecting) { exploreBg.style.backgroundImage = 'url(assets/home/golf-wedding.webp)'; o.disconnect(); }
  }, { rootMargin: '150% 0px' }).observe(exploreBg);
})();
