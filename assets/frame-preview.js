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

  // ?img=<url> support (same-origin or any CORS-free image URL) and "back to my gallery" link from the referrer
  try{
    var q=new URLSearchParams(location.search), img=q.get('img');
    if(img&&/^https?:\/\//i.test(img)){setPhoto(img,false);[].forEach.call(box.children,function(x){x.setAttribute('aria-pressed','false')});}
    else setPhoto('/assets/'+SAMPLES[0],false);
    var ref=document.referrer||'';
    if(/^https:\/\/waileaphoto\.smugmug\.com\//.test(ref)){ $('#fpOrder').href=ref.split('#')[0]; $('#fpOrder').textContent='Back to my gallery to order'; }
    var sz=q.get('size'); if(sz&&/^(8x10|11x14|20x24|24x36)$/.test(sz)){S.size=sz;[].forEach.call($('#fpSize').children,function(x){x.setAttribute('aria-pressed',x.getAttribute('data-v')===sz?'true':'false')});}
  }catch(e){setPhoto('/assets/'+SAMPLES[0],false);}
  layout();
})();
