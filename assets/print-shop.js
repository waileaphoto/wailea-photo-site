/* Print Shop (illustrative). Pictures are read live from the pricing page's session tiles,
   so whatever is in those tiles is what the Print Shop shows. */
(function(){
  'use strict';
  var PAGE = 24;
  var all = [], groups = [], current = 'all', shown = PAGE;
  var $ = function(s, r){ return (r||document).querySelector(s); };
  var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };

  function abs(src){ return new URL(src, location.origin + '/').pathname; }

  function load(){
    return fetch('/pricing', {credentials:'same-origin'}).then(function(r){ return r.text(); }).then(function(html){
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var seen = {};
      doc.querySelectorAll('.session-card').forEach(function(card){
        var btn = card.querySelector('[data-session-name]');
        var name = btn ? btn.getAttribute('data-session-name') : '';
        var id = card.id.replace('session-card-', '');
        if (!name) return;
        var g = {id:id, name:name, items:[]};
        card.querySelectorAll('.tile-slider img').forEach(function(im){
          var src = abs(im.getAttribute('src') || '');
          if (!src || seen[src]) return;
          seen[src] = 1;
          var it = {src:src, alt:im.getAttribute('alt') || name, group:id, session:name};
          g.items.push(it); all.push(it);
        });
        if (g.items.length) groups.push(g);
      });
    });
  }

  function items(){
    if (current === 'all') return all;
    return all.filter(function(p){ return p.group === current; });
  }

  function card(p){
    var d = document.createElement('div');
    d.className = 'ps-card';
    d.innerHTML =
      '<div class="ps-tile"><span class="ps-tag">Illustrative</span>' +
      '<span class="ps-frame"><img class="ps-pic" loading="lazy" decoding="async" alt="' + esc(p.alt) + '" src="' + esc(encodeURI(p.src)) + '"></span></div>' +
      '<div class="ps-meta"><h3>' + esc(p.session) + '</h3><p>From a Wailea Photo session</p></div>';
    var im = $('.ps-pic', d);
    im.addEventListener('load', function(){
      if (im.naturalWidth && im.naturalHeight) $('.ps-frame', d).style.setProperty('--r', (im.naturalWidth / im.naturalHeight).toFixed(3));
    });
    im.addEventListener('error', function(){ d.remove(); });
    return d;
  }

  function paint(){
    var list = items();
    var g = groups.filter(function(x){ return x.id === current; })[0];
    $('#psTitle').textContent = g ? g.name : 'All sessions';
    $('#psCount').textContent = list.length + (list.length === 1 ? ' image' : ' images');
    var grid = $('#psGrid'); grid.innerHTML = '';
    list.slice(0, shown).forEach(function(p){ grid.appendChild(card(p)); });
    $('#psMore').hidden = shown >= list.length;
    document.querySelectorAll('.ps-coll').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.id === current)); });
  }

  function sidebar(){
    var ul = $('#psColl'); ul.innerHTML = '';
    var defs = [{id:'all', name:'All sessions', n:all.length}].concat(groups.map(function(g){ return {id:g.id, name:g.name, n:g.items.length}; }));
    defs.forEach(function(c){
      var li = document.createElement('li');
      li.innerHTML = '<button type="button" class="ps-coll" data-id="' + esc(c.id) + '" aria-pressed="false">' + esc(c.name) + '<em>' + c.n + '</em></button>';
      li.firstChild.addEventListener('click', function(){
        current = c.id; shown = PAGE; paint();
        if (innerWidth < 860) $('#psHead').scrollIntoView({behavior:'smooth', block:'start'});
      });
      ul.appendChild(li);
    });
  }

  function finish(){
    var root = $('#psBody');
    var btns = document.querySelectorAll('.ps-finish button');
    btns.forEach(function(b){
      b.addEventListener('click', function(){
        root.className = root.className.replace(/\bps-(black|white|oak|none)\b/g, '').trim() + ' ps-' + b.dataset.finish;
        btns.forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    $('.ps-finish button[data-finish="black"]').click();
  }

  load().then(function(){
    sidebar(); finish(); paint();
    $('#psMore').addEventListener('click', function(){ shown += PAGE; paint(); });
  }).catch(function(){
    $('#psGrid').innerHTML = '<p class="ps-small">The Print Shop could not load. Please refresh the page.</p>';
  });
})();
