(function(){
  'use strict';
  var $=function(s){return document.querySelector(s)};
  var SAMPLES=['Maluaka-beach-family-photos.jpg','Family-photographer-wailea.jpg','Engagement-morning-Maluaka.jpg'];
  var PX_IN=6, SCENE_W=1199, U=PX_IN/SCENE_W*100; // cqw per inch of real size
  var frame=$('#fpFrame'), print=$('#fpPrint'), cap=$('#fpCaption'), file=$('#fpFile');
  var S={size:'11x14',finish:'black',mat:'mat',url:'',w:3,h:2,objUrl:'',wall:null,wallFt:10,px:50,py:42,wallObj:''};
  var FRAME_IN=1.1, MAT_IN=2;

  function layout(){
    var p=S.size.split('x').map(Number), short=p[0], long=p[1];
    var land=S.w>=S.h; var pw=land?long:short, ph=land?short:long;
    var m=S.mat==='mat'?MAT_IN:0, f=FRAME_IN;
    var W=(pw+2*m+2*f), H=(ph+2*m+2*f);
    var u=S.wall?100/(S.wallFt*12):U, sh=S.wall?100*S.wall.h/S.wall.w:675/SCENE_W*100;
    var wc=W*u, hc=H*u, left, top;
    if(S.wall){left=S.px/100*100-wc/2; top=S.py/100*sh-hc/2;}
    else{var cx=626/SCENE_W*100, bottom=335/SCENE_W*100, cy=235/SCENE_W*100;left=cx-wc/2;top=cy-hc/2;if(top+hc>bottom)top=bottom-hc;}
    frame.style.width=wc+'cqw'; frame.style.height=hc+'cqw';
    frame.style.left=left+'cqw'; frame.style.top=top+'cqw';
    frame.style.setProperty('--fw',f*u+'cqw'); frame.style.setProperty('--mw',m*u+'cqw');
    frame.setAttribute('data-finish',S.finish); frame.setAttribute('data-mat',S.mat);
    print.style.backgroundImage=S.url?'url("'+S.url+'")':'none';
    cap.textContent=pw+' × '+ph+' in print'+(m?' with white mat':'')+', '+(S.wall?'shown at the size set by your wall width. Drag the frame to move it.':'shown at true scale above a typical sofa.');;
  }
  function setPhoto(url,obj){
    var im=new Image();
    im.onload=function(){S.w=im.naturalWidth;S.h=im.naturalHeight;S.url=url;layout();};
    im.onerror=function(){};
    if(S.objUrl&&S.objUrl!==url){try{URL.revokeObjectURL(S.objUrl)}catch(e){}}
    S.objUrl=obj?url:'';
    im.src=url;
  }
  function group(id,key){
    var g=$(id);
    g.addEventListener('click',function(e){
      var b=e.target.closest('button'); if(!b)return;
      [].forEach.call(g.querySelectorAll('button'),function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});
      S[key]=b.getAttribute('data-v'); layout();
    });
  }
  group('#fpSize','size'); group('#fpFinish','finish'); group('#fpMatOpt','mat');

  var box=$('#fpSamples');
  SAMPLES.forEach(function(n,i){
    var b=document.createElement('button'); b.type='button'; b.setAttribute('aria-label','Sample photo '+(i+1));
    b.style.backgroundImage='url("/assets/'+n+'")'; b.setAttribute('aria-pressed',i===0?'true':'false');
    b.addEventListener('click',function(){
      [].forEach.call(box.children,function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});
      setPhoto('/assets/'+n,false);
    });
    box.appendChild(b);
  });
  file.addEventListener('change',function(){
    var f=file.files&&file.files[0]; if(!f)return;
    [].forEach.call(box.children,function(x){x.setAttribute('aria-pressed','false')});
    setPhoto(URL.createObjectURL(f),true);
  });

  var scene=$('#fpScene'), wallIn=$('#fpWall'), ctl=$('#fpWallCtl'), rng=$('#fpWallRange');
  function setWall(url){
    var im=new Image();
    im.onload=function(){
      S.wall={w:im.naturalWidth,h:im.naturalHeight}; S.px=50; S.py=42;
      scene.style.backgroundImage='url("'+url+'")'; scene.style.aspectRatio=im.naturalWidth+'/'+im.naturalHeight;
      scene.classList.add('is-wall'); ctl.hidden=false; layout();
    };
    im.src=url;
  }
  wallIn.addEventListener('change',function(){
    var f=wallIn.files&&wallIn.files[0]; if(!f)return;
    if(S.wallObj){try{URL.revokeObjectURL(S.wallObj)}catch(e){}}
    S.wallObj=URL.createObjectURL(f); setWall(S.wallObj);
  });
  rng.addEventListener('input',function(){S.wallFt=+rng.value;$('#fpWallFt').textContent=rng.value;layout();});
  $('#fpWallReset').addEventListener('click',function(){
    S.wall=null; scene.classList.remove('is-wall'); scene.style.backgroundImage=''; scene.style.aspectRatio=''; ctl.hidden=true; wallIn.value=''; layout();
  });
  var drag=null;
  frame.addEventListener('pointerdown',function(e){if(!S.wall)return;drag=true;try{frame.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();});
  frame.addEventListener('pointermove',function(e){
    if(!drag||!S.wall)return; var r=scene.getBoundingClientRect();
    S.px=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)); S.py=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100)); layout();
  });
  frame.addEventListener('pointerup',function(){drag=null;});
  frame.addEventListener('pointercancel',function(){drag=null;});

  // ---------- gallery picker: type your name, pick your gallery, tap a photo ----------
  var SITE='https://waileaphoto.smugmug.com', FN='/.netlify/functions/gallery-photos';
  var gBtn=$('#fpGalleryBtn'), gBox=$('#fpGalleryBox'), gQ=$('#fpGalleryQ'), gList=$('#fpGalleryList'), gGrid=$('#fpGalleryGrid'), gMsg=$('#fpGalleryMsg'), order=$('#fpOrder');
  var galleries=null, curGallery='';
  function clearSamples(){[].forEach.call(box.children,function(x){x.setAttribute('aria-pressed','false')});}
  function thumb(id,sz){return 'https://photos.smugmug.com/photos/'+id+'/0/'+sz+'/'+id+'-'+sz+'.jpg';}
  function usePhoto(id,gal){
    clearSamples(); setPhoto(thumb(id,'X2'),false);
    if(gal){ order.href=SITE+gal+'/'+id+'/buy'; order.textContent='Order this photo on SmugMug'; }
  }
  function renderList(){
    var v=(gQ.value||'').trim().toLowerCase(); gList.innerHTML=''; gGrid.innerHTML='';
    if(!galleries){gMsg.textContent='Loading galleries...';return;}
    if(v.length<2){gMsg.textContent='Type at least two letters of your name.';return;}
    var hits=galleries.filter(function(g){return g.n.toLowerCase().indexOf(v)>-1}).slice(0,8);
    gMsg.textContent=hits.length?'':'No gallery found. Try your first or last name, or use "Choose a photo from your device" below.';
    hits.forEach(function(g){var li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=g.n;b.addEventListener('click',function(){openGallery(g.p,g.n)});li.appendChild(b);gList.appendChild(li);});
  }
  function openGallery(path,name){
    curGallery=path; gList.innerHTML=''; gGrid.innerHTML=''; gMsg.textContent='Loading your photos...';
    order.href=SITE+path; order.textContent='Open my gallery on SmugMug';
    fetch(FN+'?g='+encodeURIComponent(path)).then(function(r){return r.json()}).then(function(d){
      var ph=(d&&d.photos)||[]; if(!ph.length){gMsg.textContent='We could not load that gallery. Please use a photo from your device instead.';return;}
      gMsg.innerHTML='<strong>'+(name||'Your gallery')+'</strong>: tap a photo to see it framed. <a href="#" id="fpGalleryBack">Pick a different gallery</a>';
      $('#fpGalleryBack').addEventListener('click',function(e){e.preventDefault();gQ.value='';renderList();gQ.focus();});
      ph.forEach(function(p){var b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Use '+p.f);b.style.backgroundImage='url("'+thumb(p.id,'S')+'")';b.addEventListener('click',function(){
        [].forEach.call(gGrid.children,function(x){x.setAttribute('aria-pressed','false')});b.setAttribute('aria-pressed','true');usePhoto(p.id,path);});gGrid.appendChild(b);});
    }).catch(function(){gMsg.textContent='We could not load that gallery right now. Please use a photo from your device instead.';});
  }
  gBtn.addEventListener('click',function(){
    gBox.hidden=!gBox.hidden; gBtn.setAttribute('aria-expanded',gBox.hidden?'false':'true');
    if(!gBox.hidden){ gQ.focus(); if(!galleries){ renderList();
      fetch(FN+'?list=1').then(function(r){return r.json()}).then(function(d){galleries=Array.isArray(d)?d:[];renderList();}).catch(function(){galleries=[];gMsg.textContent='We could not load the gallery list right now. Please use a photo from your device instead.';}); } else renderList(); }
  });
  gQ.addEventListener('input',renderList);

  // ?img=<url>, ?photo=i-xxxx&gallery=/Name, ?size=11x14 are optional direct links
  try{
    var q=new URLSearchParams(location.search), img=q.get('img');
    var pid=(q.get('photo')||'').match(/^i-[A-Za-z0-9]+$/), gal=(q.get('gallery')||'').match(/^\/[A-Za-z0-9_-]{1,80}$/);
    if(img&&/^https?:\/\//i.test(img)){setPhoto(img,false);clearSamples();}
    else if(pid){usePhoto(pid[0],gal?gal[0]:'');}
    else setPhoto('/assets/'+SAMPLES[0],false);
    var sz=q.get('size'); if(sz&&/^(8x10|11x14|20x24|24x36)$/.test(sz)){S.size=sz;[].forEach.call($('#fpSize').children,function(x){x.setAttribute('aria-pressed',x.getAttribute('data-v')===sz?'true':'false')});}
  }catch(e){setPhoto('/assets/'+SAMPLES[0],false);}
  layout();
})();
