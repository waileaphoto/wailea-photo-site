/* Imaginary living room at golden hour: a sofa below a gallery wall of framed prints, with an ocean view.
   PSRoom.mount(el, {frames:'trio'|'hero', onReady}) draws the scene and returns {setImages([url,...])}.
   The prints are filled in by the page, so they always come from the page's own gallery. */
(function(){
  'use strict';
  var uid = 0;

  function frameSet(kind){
    // Furniture is drawn around x = 800, then the whole group is nudged right (see DX) to leave room for the headline.
    if (kind === 'hero') {
      return [
        {x:418, y:266, w:200, h:150},
        {x:652, y:218, w:296, h:222},
        {x:982, y:266, w:200, h:150}
      ];
    }
    return [
      {x:404, y:236, w:240, h:180},
      {x:680, y:236, w:240, h:180},
      {x:956, y:236, w:240, h:180}
    ];
  }

  function framed(f, id){
    var m = Math.round(Math.min(f.w, f.h) * 0.13);
    var px = f.x + 8 + m, py = f.y + 8 + m, pw = f.w - 16 - 2 * m, ph = f.h - 16 - 2 * m;
    return '' +
      '<g filter="url(#' + id + 'sh)">' +
        '<rect x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" fill="#15171a"/>' +
        '<rect x="' + (f.x + 8) + '" y="' + (f.y + 8) + '" width="' + (f.w - 16) + '" height="' + (f.h - 16) + '" fill="#f6f2ea"/>' +
      '</g>' +
      '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" fill="#d9d2c4"/>' +
      '<image class="psr-img" x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + id + 'c' + (f.i) + ')"/>' +
      '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" fill="none" stroke="rgba(0,0,0,.18)"/>' +
      '<clipPath id="' + id + 'c' + f.i + '"><rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '"/></clipPath>';
  }

  function svg(kind, id){
    var frames = frameSet(kind).map(function(f, i){ f.i = i; return f; });
    var DX = 190;
    return '' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 120 1600 720" preserveAspectRatio="xMidYMid slice" role="img" aria-label="An illustrative living room with an ocean view and three framed prints above the sofa">' +
    '<defs>' +
      '<linearGradient id="' + id + 'wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2c32"/><stop offset="1" stop-color="#2e3f45"/></linearGradient>' +
      '<radialGradient id="' + id + 'glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffcf8e" stop-opacity=".30"/><stop offset="1" stop-color="#ffcf8e" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34506b"/><stop offset=".38" stop-color="#8a85a8"/><stop offset=".62" stop-color="#ee9a7e"/><stop offset=".78" stop-color="#f8c27a"/><stop offset="1" stop-color="#fbd79a"/></linearGradient>' +
      '<linearGradient id="' + id + 'sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9a56f"/><stop offset=".14" stop-color="#5d7f90"/><stop offset=".55" stop-color="#2c5266"/><stop offset="1" stop-color="#1c3a4b"/></linearGradient>' +
      '<linearGradient id="' + id + 'sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a8" stop-opacity=".95"/><stop offset="1" stop-color="#ffe2a8" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + id + 'floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2b23"/><stop offset="1" stop-color="#241812"/></linearGradient>' +
      '<linearGradient id="' + id + 'sofa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8c9ae"/><stop offset="1" stop-color="#bfae92"/></linearGradient>' +
      '<linearGradient id="' + id + 'seat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdbd9f"/><stop offset="1" stop-color="#b3a183"/></linearGradient>' +
      '<linearGradient id="' + id + 'cur" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfc3ad"/><stop offset=".25" stop-color="#b9ac95"/><stop offset=".5" stop-color="#d6cbb5"/><stop offset=".75" stop-color="#b6a992"/><stop offset="1" stop-color="#cdc1aa"/></linearGradient>' +
      '<linearGradient id="' + id + 'spill" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc98a" stop-opacity=".35"/><stop offset="1" stop-color="#ffc98a" stop-opacity="0"/></linearGradient>' +
      '<filter id="' + id + 'sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="#000" flood-opacity=".5"/></filter>' +
      '<filter id="' + id + 'soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>' +
    '</defs>' +

    /* wall + floor */
    '<rect width="1600" height="900" fill="url(#' + id + 'wall)"/>' +
    '<rect y="706" width="1600" height="194" fill="url(#' + id + 'floor)"/>' +
    '<rect y="696" width="1600" height="12" fill="#161f23"/>' +
    '<g stroke="rgba(0,0,0,.28)" stroke-width="2"><path d="M0 760H1600M0 818H1600M0 880H1600"/><path d="M190 708V760M610 760V818M1010 708V760M1390 818V880M310 818V880"/></g>' +

    /* window with sunset ocean view */
    '<g transform="translate(-110,0)">' +
      '<rect x="1400" y="70" width="260" height="640" fill="#0f171a"/>' +
      '<rect x="1412" y="82" width="236" height="616" fill="url(#' + id + 'sky)"/>' +
      '<path d="M1412 442 C1480 430 1500 438 1540 440 C1580 442 1610 436 1648 440 V450 H1412Z" fill="#4b4660" opacity=".75"/>' +
      '<path d="M1540 443 L1566 410 L1594 436 L1626 424 L1648 444Z" fill="#3a3a52" opacity=".9"/>' +
      '<rect x="1412" y="446" width="236" height="252" fill="url(#' + id + 'sea)"/>' +
      '<rect x="1488" y="446" width="64" height="252" fill="url(#' + id + 'sun)" opacity=".85"/>' +
      '<g stroke="#ffe7bd" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"><path d="M1502 470h40M1494 490h56M1506 512h30M1498 540h46M1508 574h26"/></g>' +
      '<g stroke="#9bb8c6" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"><path d="M1424 520h50M1566 500h60M1430 600h70M1560 640h66"/></g>' +
      '<rect x="1526" y="82" width="10" height="616" fill="#0f171a"/>' +
      '<rect x="1412" y="318" width="236" height="9" fill="#0f171a"/>' +
      '<rect x="1388" y="704" width="270" height="14" fill="#1a2327"/>' +
    '</g>' +
    /* curtain */
    '<g transform="translate(-110,0)"><rect x="1348" y="56" width="62" height="660" fill="url(#' + id + 'cur)"/><rect x="1340" y="50" width="330" height="9" fill="#161d20"/>' +
    '<path d="M1366 60V712M1384 60V712M1400 60V712" stroke="rgba(0,0,0,.14)" stroke-width="3"/></g>' +

    /* warm light spilling onto the floor */
    '<polygon points="1220,720 1510,720 1100,900 830,900" fill="url(#' + id + 'spill)"/>' +

    /* furniture group (nudged right to leave room for the headline) */
    '<g transform="translate(' + DX + ',0)">' +
      /* wall wash behind the prints */
      '<ellipse cx="800" cy="340" rx="560" ry="230" fill="url(#' + id + 'glow)"/>' +
      frames.map(function(f){ return framed(f, id); }).join('') +

      /* rug */
      '<rect x="330" y="768" width="940" height="116" rx="14" fill="#a89677" opacity=".92"/>' +
      '<rect x="346" y="780" width="908" height="92" rx="8" fill="none" stroke="#e5d8bd" stroke-opacity=".55" stroke-width="3"/>' +

      /* sofa */
      '<ellipse cx="800" cy="740" rx="470" ry="26" fill="#000" opacity=".38" filter="url(#' + id + 'soft)"/>' +
      '<rect x="428" y="510" width="744" height="170" rx="34" fill="url(#' + id + 'sofa)"/>' +
      '<rect x="392" y="548" width="88" height="164" rx="30" fill="#c2b296"/>' +
      '<rect x="1120" y="548" width="88" height="164" rx="30" fill="#c2b296"/>' +
      '<rect x="468" y="612" width="302" height="84" rx="18" fill="url(#' + id + 'seat)"/>' +
      '<rect x="830" y="612" width="302" height="84" rx="18" fill="url(#' + id + 'seat)"/>' +
      '<rect x="470" y="690" width="660" height="26" rx="8" fill="#a99a80"/>' +
      '<path d="M770 616v76M830 616v76" stroke="rgba(60,45,30,.22)" stroke-width="3"/>' +
      '<rect x="420" y="716" width="14" height="24" fill="#2a1d15"/><rect x="1166" y="716" width="14" height="24" fill="#2a1d15"/>' +
      /* pillows */
      '<rect x="500" y="548" width="132" height="116" rx="24" fill="#315f69" transform="rotate(-6 566 606)"/>' +
      '<rect x="628" y="560" width="120" height="104" rx="22" fill="#b4693f" transform="rotate(4 688 612)"/>' +
      '<rect x="1000" y="552" width="128" height="112" rx="24" fill="#efe6d4" transform="rotate(5 1064 608)"/>' +
      /* throw */
      '<path d="M1040 640 q50 14 86 70 l-100 4 z" fill="#8b5e3c" opacity=".92"/>' +

      /* plant */
      '<rect x="1226" y="640" width="52" height="68" rx="8" fill="#1c1512"/>' +
      '<g fill="#3f6b4d"><path d="M1252 646C1214 610 1210 560 1232 520C1256 560 1262 610 1252 646Z"/><path d="M1252 646C1290 600 1308 560 1296 520C1262 556 1250 606 1252 646Z"/><path d="M1252 646C1242 600 1262 540 1262 500C1228 540 1228 606 1252 646Z" fill="#4d7d58"/></g>' +
    '</g>' +
    '</svg>';
  }

  function mount(el, opts){
    opts = opts || {};
    var id = 'psr' + (++uid) + '-';
    el.innerHTML = svg(opts.frames === 'hero' ? 'hero' : 'trio', id);
    var s = el.querySelector('svg');
    // Phones: crop to the sofa and prints so they are not sliced off.
    var narrow = function(){ s.setAttribute('viewBox', innerWidth < 760 ? '520 120 900 720' : '0 120 1600 720'); };
    narrow(); addEventListener('resize', narrow);
    var imgs = [].slice.call(el.querySelectorAll('.psr-img'));
    return {
      count: imgs.length,
      setImage: function(i, url){ if (imgs[i]) imgs[i].setAttribute('href', url); }
    };
  }

  window.PSRoom = {mount: mount};
})();
