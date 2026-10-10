/* Print Shop hero: a real living-room photo with three framed prints hung on the blank wall.
   PSRoom.mount(el, {photo:url}) returns {setImage(i,url)}; the page fills the prints from its own gallery. */
(function(){
  'use strict';
  var uid = 0;
  // frames in photo coordinates (1199 x 675): left, center, right above the sofa
  var FRAMES = [
    {x:390, y:230, w:118, h:92},
    {x:524, y:190, w:204, h:154},
    {x:744, y:230, w:118, h:92}
  ];
  function framed(f, id, i){
    var m = Math.round(Math.min(f.w, f.h) * 0.12), b = 4;
    var px = f.x + b + m, py = f.y + b + m, pw = f.w - 2*(b+m), ph = f.h - 2*(b+m);
    return '<g filter="url(#' + id + 'sh)"><rect x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" fill="#17181a"/>' +
      '<rect x="' + (f.x+b) + '" y="' + (f.y+b) + '" width="' + (f.w-2*b) + '" height="' + (f.h-2*b) + '" fill="#f7f4ee"/></g>' +
      '<clipPath id="' + id + 'c' + i + '"><rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '"/></clipPath>' +
      '<image class="psr-img" x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + id + 'c' + i + ')"/>' +
      '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" fill="none" stroke="rgba(0,0,0,.2)"/>';
  }
  function mount(el, opts){
    opts = opts || {};
    var id = 'psr' + (++uid) + '-';
    el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1199 675" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A bright coastal living room with an ocean view and three framed prints above the sofa">' +
      '<defs><filter id="' + id + 'sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity=".35"/></filter></defs>' +
      '<image href="' + (opts.photo || '/assets/living-room.jpg') + '" x="0" y="0" width="1199" height="675" preserveAspectRatio="xMidYMid slice"/>' +
      FRAMES.map(function(f, i){ return framed(f, id, i); }).join('') + '</svg>';
    var s = el.querySelector('svg');
    var fit = function(){ s.setAttribute('viewBox', innerWidth < 760 ? '300 60 640 575' : '0 0 1199 675'); };
    fit(); addEventListener('resize', fit);
    var imgs = [].slice.call(el.querySelectorAll('.psr-img'));
    return {count: imgs.length, setImage: function(i, url){ if (imgs[i]) imgs[i].setAttribute('href', url); }};
  }
  window.PSRoom = {mount: mount};
})();
