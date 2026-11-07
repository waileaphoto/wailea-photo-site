/* Wailea Photo — editorial pricing page behaviour (Nov 2026). Content is static HTML; this animates it. */
(function(){
const $=s=>document.querySelector(s);
/* galleries: crossfade, arrows, keys, swipe; slow autoplay while in view; images load as you approach */
document.querySelectorAll('.stage').forEach(st=>{
  const imgs=[...st.querySelectorAll('.g')],cnt=st.querySelector('.cnt b');let i=0,timer=null,loaded=false,inView=false,hover=false;
  const pad=n=>String(n).padStart(2,'0');
  const load=k=>{const im=imgs[k];if(im&&im.dataset.src){im.srcset=im.dataset.srcset;im.src=im.dataset.src;delete im.dataset.src}};
  const show=k=>{i=(k+imgs.length)%imgs.length;load(i);load((i+1)%imgs.length);imgs.forEach((im,j)=>im.classList.toggle('is-on',j===i));cnt.textContent=pad(i+1)};
  const tick=()=>{clearInterval(timer);timer=setInterval(()=>{if(inView&&!hover&&!document.hidden)show(i+1)},5200)};
  if(!imgs.length||!cnt)return; // a stage without controls must never stop the rest of the page
  const nx=st.querySelector('.next'),pv=st.querySelector('.prev');
  if(nx)nx.onclick=()=>{show(i+1);tick()};
  if(pv)pv.onclick=()=>{show(i-1);tick()};
  st.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){show(i+1);tick()}if(e.key==='ArrowLeft'){show(i-1);tick()}});
  st.addEventListener('mouseenter',()=>hover=true);st.addEventListener('mouseleave',()=>hover=false);
  let x0=null;st.addEventListener('touchstart',e=>{x0=e.touches[0].clientX},{passive:true});
  st.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40){show(i+(dx<0?1:-1));tick()}x0=null});
  new IntersectionObserver(es=>{inView=es[0].isIntersecting;if(inView&&!loaded){loaded=true;load(1);tick()}},{rootMargin:'20% 0px'}).observe(st);
});


(function(){const f=document.getElementById('mkt');if(!f)return;const tip=f.querySelector('.tip');
  const show=c=>{const svg=c.ownerSVGElement,r=svg.getBoundingClientRect(),fr=f.getBoundingClientRect(),vb=svg.viewBox.baseVal,k=r.width/vb.width;
    tip.innerHTML=c.dataset.tip;tip.style.left=(r.left-fr.left+c.cx.baseVal.value*k)+'px';tip.style.top=(r.top-fr.top+(c.cy.baseVal.value-c.r.baseVal.value+8)*k)+'px';tip.classList.add('on')};
  const hide=()=>tip.classList.remove('on');
  f.querySelectorAll('.hit').forEach(c=>{c.addEventListener('mouseenter',()=>show(c));c.addEventListener('focus',()=>show(c));c.addEventListener('mouseleave',hide);c.addEventListener('blur',hide);
    c.addEventListener('click',e=>{e.stopPropagation();show(c)})});
  document.addEventListener('click',hide);
})();

/* reveal + lazy footer bg */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.p-rv').forEach(el=>io.observe(el));
new IntersectionObserver((es,o)=>{if(es[0].isIntersecting){$('#exploreBg').style.backgroundImage='url(assets/home/golf-wedding.webp)';o.disconnect()}},{rootMargin:'150% 0px'}).observe($('#exploreBg'));


(function(){const f=document.getElementById('mkt');if(!f)return;const tip=f.querySelector('.tip');
  const show=c=>{const svg=c.ownerSVGElement,r=svg.getBoundingClientRect(),fr=f.getBoundingClientRect(),vb=svg.viewBox.baseVal,k=r.width/vb.width;
    tip.innerHTML=c.dataset.tip;tip.style.left=(r.left-fr.left+c.cx.baseVal.value*k)+'px';tip.style.top=(r.top-fr.top+(c.cy.baseVal.value-c.r.baseVal.value+8)*k)+'px';tip.classList.add('on')};
  const hide=()=>tip.classList.remove('on');
  f.querySelectorAll('.hit').forEach(c=>{c.addEventListener('mouseenter',()=>show(c));c.addEventListener('focus',()=>show(c));c.addEventListener('mouseleave',hide);c.addEventListener('blur',hide);
    c.addEventListener('click',e=>{e.stopPropagation();show(c)})});
  document.addEventListener('click',hide);
})();
/* per-session "Ask the Concierge" opens the chat already asking about that session */
document.querySelectorAll('.ask[data-q]').forEach(b=>b.addEventListener('click',()=>{const c=window.WaileaConcierge;if(c&&c.open){c.open(b.dataset.q,'pricing_session')}}));
})();
