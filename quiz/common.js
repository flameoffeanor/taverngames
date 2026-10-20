window.tailwind&&(tailwind.config={theme:{extend:{colors:{slate:{50:'#f4effa',100:'#e8def5',200:'#d3c3e8',300:'#b9a3d6',400:'#9a82bd',500:'#7a649c',600:'#5b4878',700:'#3f3157',800:'#2a2040',900:'#1a1329',950:'#0f0a1a'},amber:{200:'#e4d3ff',300:'#d3b8ff',400:'#b794f4',500:'#9f6ff0',600:'#8a52d9'}}}}});
function floaters(n,k){k=k||1;const S=['?','✦','★','A','?','B','✦','C','★','D'],f=document.createElement('div');f.className='fx';
for(let i=0;i<n;i++){const s=document.createElement('span'),r=Math.random;s.textContent=S[i%S.length];
s.style.cssText='left:'+r()*96+'%;font-size:'+(26+r()*50)*k+'px;opacity:'+(.07+r()*.1)+';animation-duration:'+(24+r()*28)+'s;animation-delay:-'+r()*50+'s;--a:'+(r()*40-20)+'deg;--s:'+(r()*80-40)+'px';f.append(s)}
document.body.prepend(f)}
firebase.initializeApp({apiKey:"AIzaSyDtHAhzYNDf7PHrj-48EelC6OQtp3pkv4E",authDomain:"tavern-quiz.firebaseapp.com",databaseURL:"https://tavern-quiz-default-rtdb.europe-west1.firebasedatabase.app",projectId:"tavern-quiz",appId:"1:280835700622:web:043d61c02d689de87056df"});
const db=firebase.database(),$=id=>document.getElementById(id),L=['A','B','C','D'];
let off=0;db.ref('.info/serverTimeOffset').on('value',s=>off=s.val()||0);
const now=()=>Date.now()+off;
function h(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function left(s){return s&&s.endsAt>0?Math.ceil((s.endsAt-now())/1000):null}
function board(box,teams,sc,me,max){box.replaceChildren();Object.keys(teams).sort((a,b)=>(sc[b]||0)-(sc[a]||0)).slice(0,max||999).forEach((u,i)=>{const r=h('div','flex justify-between py-1 border-b border-slate-700/50 '+(u==me?'text-amber-400 font-bold':'text-slate-200'));r.append(h('span','truncate',(i+1)+'. '+teams[u].name),h('span','font-bold',(sc[u]||0)+' P'));box.append(r)})}
