/* Wailea Photo — home page behaviour, quiet-luxury edition (Nov 2026). Content lives in the HTML. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var body = document.body;

  /* reveal on scroll */
  var els = [].slice.call(document.querySelectorAll('.lx-rv,.lx-dip'));
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  } else els.forEach(function (el) { el.classList.add('in'); });

  /* gentle parallax on prints and full-bleed photographs */
  var px = [].slice.call(document.querySelectorAll('[data-px]'));
  if (!reduce && px.length) {
    var ticking = false;
    var run = function () {
      var vh = innerHeight;
      px.forEach(function (el) {
        var r = el.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var c = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = 'translate3d(0,' + (c * parseFloat(el.dataset.px) * -100).toFixed(1) + 'px,0)' + (el.dataset.rot ? ' rotate(' + el.dataset.rot + 'deg)' : '');
      });
      ticking = false;
    };
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(run); } }, { passive: true });
    run();
  }

  /* hero slideshow: 2s cross-fades. Computers open on the first full-frame photograph
     (holiday family) and also show the diptych; phones skip the wide group shots
     ("wide"), which cannot fill a tall frame, and open on the first portrait. */
  var dip = $('.lx-dip'), all = [].slice.call(document.querySelectorAll('.lx-slides .sl'));
  if (dip && all.length) {
    var phone = matchMedia('(max-width:700px)').matches;
    // phones skip "wide" slides, computers skip "tall" (phone-only) slides
    var sl = all.filter(function (el) { return !el.classList.contains(phone ? 'wide' : 'tall'); });
    if (phone) { all.forEach(function (el) { el.classList.remove('on'); }); if (sl[0]) sl[0].classList.add('on'); }
    if (!reduce) {
      var HOLD = 5000, lead = phone ? 2 : 1;
      var cur = sl[0] && sl[0].classList.contains('on') ? sl[0] : null;
      var step = cur ? lead : 0, states = lead + sl.length;
      var show = function (i) {
        var next = i >= lead ? sl[i - lead] : null;
        if (i === 0) dip.classList.remove('m2');
        if (i === 1 && lead === 2) dip.classList.add('m2');
        if (next) next.classList.add('on');
        if (cur && cur !== next) { var prev = cur; setTimeout(function () { prev.classList.remove('on'); }, next ? 2000 : 0); }
        cur = next;
        dip.classList.toggle('full', !!next);
      };
      setInterval(function () { if (document.hidden) return; step = (step + 1) % states; show(step); }, HOLD + 2000);
    }
  }

  /* review counts: mirror the live totals (filled by the reviews widget) into the review section */
  var mirror = function () {
    var total = $('#combinedReviewCount');
    document.querySelectorAll('[data-mirror]').forEach(function (m) {
      var k = m.getAttribute('data-mirror');
      var src = k === 'total' ? total : document.querySelector('#combinedReviewsBreakdown li[data-platform="' + k + '"] .crb-count');
      if (src && src.textContent) m.textContent = src.textContent;
    });
  };
  if (window.MutationObserver && $('#trust')) new MutationObserver(mirror).observe($('#trust'), { childList: true, subtree: true, characterData: true });

  /* review carousel arrows */
  var track = $('.lx-rtrack');
  document.querySelectorAll('.lx-rnav button').forEach(function (b) {
    b.addEventListener('click', function () {
      var card = track.querySelector('.lx-rcard');
      var step = card ? card.getBoundingClientRect().width + 24 : 320;
      track.scrollBy({ left: b.dataset.dir === 'prev' ? -step : step, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  /* overlays */
  function openO(el) { el.classList.add('open'); body.style.overflow = 'hidden'; }
  function closeO(el) { el.classList.remove('open'); body.style.overflow = ''; }
  var modal = $('#modal');
  if (modal) {
    document.querySelectorAll('.lx-rcard .more').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#mq').textContent = '“' + b.getAttribute('data-full') + '”';
        $('#mc').textContent = b.getAttribute('data-who');
        var v = $('#mv'), u = b.getAttribute('data-v');
        if (u) { v.href = u; v.hidden = false; } else { v.hidden = true; }
        openO(modal); modal.querySelector('.x').focus();
      });
    });
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.classList.contains('x')) closeO(modal); });
  }

  /* proposal film plays with its own score; the background music steps aside */
  var film = $('#film'), filmVid = $('#filmVid'), filmAudio = $('#filmAudio'), filmBtn = $('#filmBtn');
  if (film && filmVid && filmBtn) {
    var stopFilm = function () {
      var was = film.classList.contains('open');
      filmVid.pause(); if (filmAudio) { filmAudio.pause(); filmAudio.currentTime = 0; }
      if (was) { closeO(film); if (window.edMusic) window.edMusic.duck(false); }
    };
    filmBtn.addEventListener('click', function () {
      if (window.edMusic) window.edMusic.duck(true);
      openO(film); filmVid.currentTime = 0;
      if (filmAudio) { filmAudio.currentTime = 0; filmAudio.volume = 1; filmAudio.play().catch(function () {}); }
      filmVid.play().catch(function () {});
    });
    if (filmAudio) {
      filmVid.addEventListener('pause', function () { if (!filmVid.ended) filmAudio.pause(); });
      filmVid.addEventListener('play', function () { if (film.classList.contains('open')) filmAudio.play().catch(function () {}); });
      filmVid.addEventListener('seeked', function () { filmAudio.currentTime = Math.min(filmVid.currentTime, filmAudio.duration || 1e9); });
    }
    filmVid.addEventListener('ended', stopFilm);
    film.addEventListener('click', function (e) { if (e.target === film || e.target.classList.contains('x')) stopFilm(); });
  }
  addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (modal && modal.classList.contains('open')) closeO(modal);
    if (film && film.classList.contains('open')) film.querySelector('.x').click();
  });
})();
