(()=>{const L=[['/bilet','Bilet'],['/botc','BotC'],['/kutu-oyunlari','Oyunlar'],['/quiz','Quiz']],p=location.pathname,n=document.createElement('nav');n.className='nav';
n.innerHTML='<div class="wrap"><a class="brand" href="/"><img src="/assets/logo_beyaz_kenar_yazisiz.webp" alt=""><span>Tavern Games</span></a><div class="links">'+L.map(([h,t])=>'<a href="'+h+'"'+(p.startsWith(h)?' aria-current="page"':'')+'>'+t+'</a>').join('')+'</div></div>';
document.body.prepend(n);if(p.startsWith('/botc'))document.body.dataset.theme='botc'})();
