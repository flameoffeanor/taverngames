firebase.initializeApp({apiKey:"AIzaSyDtHAhzYNDf7PHrj-48EelC6OQtp3pkv4E",authDomain:"tavern-quiz.firebaseapp.com",databaseURL:"https://tavern-quiz-default-rtdb.europe-west1.firebasedatabase.app",projectId:"tavern-quiz",appId:"1:280835700622:web:043d61c02d689de87056df"});
const db=firebase.database(),$=id=>document.getElementById(id),L=['A','B','C','D'];
let off=0;db.ref('.info/serverTimeOffset').on('value',s=>off=s.val()||0);
const now=()=>Date.now()+off;
function h(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function left(s){return s&&s.endsAt>0?Math.ceil((s.endsAt-now())/1000):null}
function board(box,teams,sc,me,max){box.replaceChildren();Object.keys(teams).sort((a,b)=>(sc[b]||0)-(sc[a]||0)).slice(0,max||999).forEach((u,i)=>{const r=h('div','flex justify-between py-1 border-b border-slate-700/50 '+(u==me?'text-amber-400 font-bold':'text-slate-200'));r.append(h('span','truncate',(i+1)+'. '+teams[u].name),h('span','font-bold',(sc[u]||0)+' P'));box.append(r)})}
