(function(){
  'use strict';
  var $=function(s){return document.querySelector(s)};
  var SAMPLES=['Maluaka-beach-family-photos.jpg','Family-photographer-wailea.jpg','Engagement-morning-Maluaka.jpg'];
  var PX_IN=6, SCENE_W=1199, U=PX_IN/SCENE_W*100; // cqw per inch of real size
  var frame=$('#fpFrame'), print=$('#fpPrint'), cap=$('#fpCaption'), file=$('#fpFile');
  var S={size:'11x14',finish:'black',mat:'mat',url:'',w:3,h:2,objUrl:''};
  var FRAME_IN=1.1, MAT_IN=2;

  function layout(){
    var p=S.size.split('x').map(Number), short=p[0], long=p[1];
    var land=S.w>=S.h; var pw=land?long:short, ph=land?short:long;
    var m=S.mat==='mat'?MAT_IN:0, f=FRAME_IN;
    var W=(pw+2*m+2*f), H=(ph+2*m+2*f);
    var cx=626/SCENE_W*100, bottom=335/SCENE_W*100;
    var wc=W*U, hc=H*U, cy=235/SCENE_W*100;
    var top=cy-hc/2; if(top+hc>bottom) top=bottom-hc;
    frame.style.width=wc+'cqw'; frame.style.height=hc+'cqw';
    frame.style.left=(cx-wc/2)+'cqw'; frame.style.top=top+'cqw';
    frame.style.setProperty('--fw',f*U+'cqw'); frame.style.setProperty('--mw',m*U+'cqw');
    frame.setAttribute('data-finish',S.finish); frame.setAttribute('data-mat',S.mat);
    print.style.backgroundImage=S.url?'url("'+S.url+'")':'none';
    cap.textContent=pw+' × '+ph+' in print'+(m?' with white mat':'')+', shown at true scale above a typical sofa.';
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
