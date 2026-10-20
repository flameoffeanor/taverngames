(()=>{const L=[['/bilet','Bilet'],['/botc','BotC'],['/kutu-oyunlari','Oyunlar'],['/quiz','Quiz']],p=location.pathname,n=document.createElement('nav');n.className='nav';
n.innerHTML='<div class="wrap"><a class="brand" href="/"><img src="/assets/logo_beyaz_kenar_yazisiz.webp" alt=""><span>Tavern Games</span></a><div class="links">'+L.map(([h,t])=>'<a href="'+h+'"'+(p.startsWith(h)?' aria-current="page"':'')+'>'+t+'</a>').join('')+'</div></div>';
document.body.prepend(n);
const old=document.querySelector('.social-card');
if(old)old.outerHTML='<div class="soc"><a class="pill" style="--d:#e1306c" href="https://www.instagram.com/taverngamesclub/" target="_blank" rel="noopener"><i></i>Instagram</a><a class="pill" style="--d:#25d366" href="https://chat.whatsapp.com/LxsUKB5amFS5B3QGOR2k5r" target="_blank" rel="noopener"><i></i>WhatsApp Topluluğu</a></div>';
if(!p.startsWith('/botc'))return;
document.body.dataset.theme='botc';
const s=document.getElementById('inputSection'),li=document.getElementById('linkInput');
if(s){const t=document.createElement('button'),a='＋ Kendi script’ini yapıştır';t.className='paste-toggle';t.textContent=a;t.onclick=()=>{const k=s.classList.toggle('open');t.textContent=k?'− Kapat':a;if(k&&li)li.value=''};s.append(t)}
let go=/characters=/.test(location.search)?1:0;
document.addEventListener('click',e=>{const b=e.target.closest('.btn-script');if(!b)return;document.querySelectorAll('.btn-script').forEach(x=>x.classList.toggle('active',x===b));go=1});
const c=document.getElementById('content');
if(c)new MutationObserver(()=>{const t=document.getElementById('distribution-container');if(go&&t&&c.children.length){go=0;setTimeout(()=>t.scrollIntoView({behavior:'smooth',block:'start'}),60)}}).observe(c,{childList:true})})();
