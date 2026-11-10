// Giriş noktası: oturum, veri, dört bölüm (Kurulum, Grimoire, Gece Sırası, Diğer) ve tüm pencereler.
import { loadData, TEAMS, TEAM_TR, TEAM_PL, DIST, GOOD, remTr, parseScript } from './data.js?v=20261110-1517';
import { G, $, esc, rich, role, icon, bigTok, commit, emit, save, load, subscribe, undo, canUndo, uid, toast, noteAlert,
  openModal, closeModal, confirmBox, showFull, scriptIds, boardRoles, inPlay, hooks } from './core.js?v=20261110-1517';
import { arcText, glyphHTML, initBoard, renderBoard, onTap, addRoleToken, ovalSpots, freeSpot, remSpot, colorOf, clockwise, applyHeight, W, H, impairOf, stepNeed, resetZoom } from './board.js?v=20261110-1517';

import { setChatHook, getChat, chatMe, sendChat, enterRoom, leaveToLocal, listRooms, deleteRoom, resumeSession, stopSync, currentRoom, normRoom } from './sync.js?v=20261110-1517';
export const VERSION = '20261110-1517';
const show = id => ['boot', 'login', 'app'].forEach(x => { $(x).hidden = x !== id; });
const RN = id => role(id).name;
const tokById = id => G.S.tokens.find(t => t.id === id);

// ================= açılış =================
// Çevrimdışı kabuk: servis çalışanını kaydet ve şu an yüklü her şeyi (sayfa, kod, yazı tipleri, Firebase betikleri, görseller) kaydet.
async function cacheShell() {
  try {
    const c = await caches.open('tg-grimoire-v1');
    const urls = new Set([location.href.split('#')[0], ...performance.getEntriesByType('resource').map(r => r.name)]);
    const ok = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && (x.origin === location.origin || ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(x.hostname)) && !x.pathname.endsWith('/sw.js'); } catch (e) { return false; } };
    const have = new Set((await c.keys()).map(k => k.url));
    for (const u of urls) {
      if (!ok(u) || have.has(u)) continue;
      try { const res = await fetch(u, { mode: new URL(u).origin === location.origin ? 'same-origin' : 'no-cors' }); if (res.ok || res.type === 'opaque') await c.put(u, res); } catch (e) {}
    }
    // eski sürüm damgalı kopyaları temizle (aynı yol, farklı ?v=)
    const cur = new Set(urls), paths = new Set([...urls].map(u => u.split('?')[0]));
    for (const k of await c.keys()) if (!cur.has(k.url) && paths.has(k.url.split('?')[0])) await c.delete(k);
  } catch (e) {}
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => setTimeout(cacheShell, 3000)).catch(() => {}));
}

const auth = firebase.auth();
auth.onAuthStateChanged(async user => {
  if (user && user.isAnonymous) { auth.signOut(); return; } // quiz sayfasının anonim oturumu grimoire girişi sayılmaz
  if (!user) { stopSync(); show('login'); return; }
  show('boot');
  load();
  G.D = await loadData();
  show('app');
  start();
  resumeSession(); // sayfa yenilenirse oda korunur; uygulama yeniden açılırsa yerel masayla başlar
});
$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('lErr').hidden = true;
  try { await auth.signInWithEmailAndPassword($('lEmail').value.trim(), $('lPass').value); }
  catch (err) { $('lErr').hidden = false; }
};

let started = false;
function start() {
  if (!started) {
    started = true;
    initBoard();
    // Simgeye dokununca açılan pencerenin üstüne, aynı dokunuşun 'click'i düşüp yanlış düğmeye basmasın
    document.addEventListener('click', e => {
      if (Date.now() - (window.__tapAt || 0) < 450 && e.target.closest('#modal, #show')) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    onTap({ tapRole: t => openToken(t.id), tapRem: t => openRem(t.id), holdRole: t => { closeModal(); showFull(bigTok(t.role)); } });
    subscribe(renderAll);
    wire();
  }
  renderAll();
}

function renderAll() {
  renderPhase();
  renderPanes();
  renderSetup();
  renderBoard();
  renderBluffs();
  renderToolbar();
  renderNight();
  renderMore();
  if (!$('stepper').hidden) renderStep();
  $('wrapUndo').disabled = !canUndo();
}

// ================= evre (gece/gün), oylama sayısı, günlük =================
const PH0 = { n: 1, day: false };
const phaseLabel = p => (p.day ? `Gün ${p.n}` : `Gece ${p.n}`);
const curPhase = () => G.S.phase || PH0;
// oyuncular: Efsanevi ve yönetici rolü (t.st: yöneticinin kendine hatırlatma için koyduğu token) sayılmaz
function players() { return boardRoles().filter(t => role(t.role).team !== 'fabled' && !t.st); }
let seenPhase = '';
function renderPhase() {
  const p = curPhase();
  const lbl = phaseLabel(p);
  if (seenPhase && seenPhase !== lbl && !p.day) G.S.night.tab = p.n === 1 ? 'first' : 'other'; // diğer yönetici evreyi ilerlettiyse
  if (seenPhase !== lbl && seenPhase && !$('stepper').hidden && p.day) setTimeout(closeStepper);
  seenPhase = lbl;
  $('phNow').innerHTML = `<span class="ph-i">${p.day ? '☀️' : '🌙'}</span><b>${phaseLabel(p)}</b><small>günlük</small>`;
  $('phaseBar').classList.toggle('day', !!p.day);
  const pl = players(), alive = pl.filter(t => !t.dead).length, ghosts = pl.filter(t => t.dead && !t.voteUsed).length;
  $('phStats').innerHTML = pl.length ? `Yaşayan <b>${alive}</b>/${pl.length}<i>·</i>İnfaz için <b>${Math.ceil(alive / 2)}</b> oy<i>·</i>Ölü oyu <b>${ghosts}</b>` : '';
  $('phPrev').disabled = p.n === 1 && !p.day;
}
function phaseStep(dir) {
  commit(S => {
    const p = { ...curPhase() };
    if (dir > 0) { if (p.day) { p.n++; p.day = false; } else p.day = true; }
    else { if (p.day) p.day = false; else if (p.n > 1) { p.n--; p.day = true; } }
    S.phase = p;
    if (!p.day) { S.night.tab = p.n === 1 ? 'first' : 'other'; if (dir > 0) S.night.done[S.night.tab] = []; }
    if (!Array.isArray(S.log)) S.log = [];
    if (dir > 0) S.log.push({ id: uid(), ph: phaseLabel(p), k: 'phase', t: Date.now() });
  });
  toast(phaseLabel(curPhase()));
}
// her yerel işlemde: ölüm / dirilme otomatik günlüğe
hooks.onLocal = (before, S) => {
  if (!Array.isArray(S.log)) S.log = [];
  const ph = phaseLabel(S.phase || PH0);
  for (const t of S.tokens) {
    if (t.kind !== 'role') continue;
    const b = before['t/' + t.id]; if (!b) continue;
    const o = JSON.parse(b);
    if (!!o.dead !== !!t.dead) S.log.push({ id: uid(), tid: t.id, ph, k: t.dead ? 'death' : 'revive', x: `${RN(t.role)}${t.name ? ' (' + t.name + ')' : ''} ${t.dead ? 'öldü' : 'dirildi'}`, t: Date.now() });
  }
  // hatırlatıcılar: yeni konan, başka oyuncuya taşınan, kaldırılan (toplu silmelerde yazma)
  const remName = x => (x.role ? `${RN(x.role)} – ${remTr(x.text)}` : remTr(x.text));
  const whoOf = id => { const o = S.tokens.find(t => t.id === id); return o ? `${RN(o.role)}${o.name ? ' (' + o.name + ')' : ''}` : ''; };
  const now = new Set(S.tokens.map(t => t.id));
  const goneRoles = Object.keys(before).some(k => k.startsWith('t/') && !now.has(k.slice(2)) && JSON.parse(before[k]).kind === 'role');
  // aynı evrede aynı hatırlatıcı için eski kaydı sil: fikir değişirse sadece son hali kalır
  const dropPrev = rid => { const n = S.log.length; S.log = S.log.filter(e => !(e.rid === rid && e.ph === ph && (e.k === 'rem' || e.k === 'remoff'))); return S.log.length !== n; };
  for (const x of S.tokens) {
    if (x.kind !== 'rem' || !x.owner) continue;
    const b = before['t/' + x.id];
    const moved = b && JSON.parse(b).owner !== x.owner;
    if (b && !moved) continue;
    const had = dropPrev(x.id);
    S.log.push({ id: uid(), rid: x.id, ph, k: 'rem', x: `${remName(x)} → ${whoOf(x.owner)}${moved && !had ? ' (taşındı)' : ''}`, t: Date.now() });
  }
  if (!goneRoles) for (const k of Object.keys(before)) {
    if (!k.startsWith('t/') || now.has(k.slice(2))) continue;
    const x = JSON.parse(before[k]);
    if (x.kind !== 'rem' || !x.owner) continue;
    if (dropPrev(x.id)) continue; // bu evrede konup kaldırıldıysa hiç yazma
    S.log.push({ id: uid(), rid: x.id, ph, k: 'remoff', x: `${remName(x)} kaldırıldı${whoOf(x.owner) ? ' (' + whoOf(x.owner) + ')' : ''}`, t: Date.now() });
  }
  if (S.log.length > 400) S.log.splice(0, S.log.length - 400);
};
const LOGI = { death: '†', revive: '✚', info: 'ℹ', note: '✎', rem: '◉', remoff: '○' };
function openLog() {
  // evreye göre grupla, evre sırasına diz (cihaz saatleri farklı olsa da karışmaz)
  const ord = ph => { const m = /^(Gece|Gün) (\d+)/.exec(ph || ''); return m ? +m[2] * 2 + (m[1] === 'Gün' ? 1 : 0) : 0; };
  const by = new Map();
  for (const e of G.S.log || []) { if (!by.has(e.ph)) by.set(e.ph, { ph: e.ph, items: [] }); if (e.k !== 'phase') by.get(e.ph).items.push(e); }
  const groups = [...by.values()].sort((x, y) => ord(x.ph) - ord(y.ph));
  const hm = t => t ? new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
  openModal('Oyun günlüğü', `
    <div class="row-in"><input id="lgTxt" placeholder="Not ekle (ör. Empat'a 1 dedim)" maxlength="200"><button class="btn small primary" id="lgAdd">Ekle</button></div>
    <div class="log">${groups.length ? groups.slice().reverse().map(g => `<section><h4>${esc(g.ph)}</h4>${g.items.length ? g.items.map(e => `<p class="lg-${e.k}"><span>${LOGI[e.k] || '•'}</span>${esc(e.x)}<small>${hm(e.t)}</small></p>`).join('') : '<p class="muted small">—</p>'}</section>`).join('') : '<p class="muted">Henüz kayıt yok. Ölümler, evre geçişleri ve gece verdiğin bilgiler buraya kendiliğinden yazılır.</p>'}</div>
    <button class="btn ghost small" id="lgClear">Günlüğü temizle</button>`, () => {
    $('lgAdd').onclick = () => { const v = $('lgTxt').value.trim(); if (!v) return; commit(S => { S.log.push({ id: uid(), ph: phaseLabel(curPhase()), k: 'note', x: v, t: Date.now() }); }, true); openLog(); };
    $('lgClear').onclick = () => confirmBox('Günlük silinsin mi?', 'Sil', () => commit(S => { S.log = []; }));
  });
}

// ================= adım adım gece =================
let STEP = { i: 0, key: '' };
function nightSteps() {
  const S = G.S, D = G.D, tab = S.night.tab;
  const list = tab === 'first' ? D.night.firstNight : D.night.otherNight;
  const toks = boardRoles();
  const pc = toks.filter(t => !t.st && !['fabled', 'traveller'].includes(role(t.role).team)).length;
  const steps = [{ k: 'summary' }];
  for (const id of list) {
    if (id === 'dusk') continue;
    if (id === 'dawn') { steps.push({ k: 'dawn' }); continue; }
    if (STRUCT[id]) { if (pc >= 7) steps.push({ k: 'struct', id }); continue; }
    const txt = tab === 'first' ? role(id).first : role(id).other;
    const mine = toks.filter(t => t.role === id);
    if (!txt || !mine.length) continue;
    steps.push({ k: 'role', id, txt, mine });
  }
  if (!steps.some(s => s.k === 'dawn')) steps.push({ k: 'dawn' });
  return steps;
}
let stepFull = false; // adım modu tam ekranı kendisi açtıysa kapanırken geri kapatır
function openStepper() {
  const key = phaseLabel(curPhase()) + '|' + G.S.night.tab;
  if (STEP.key !== key) STEP = { i: 0, key };
  const w = $('boardWrap');
  stepFull = !w.classList.contains('full');
  w.classList.add('stepping'); document.body.classList.add('stepping');
  if (stepFull) toggleFull();
  resetZoom();
  $('stepper').hidden = false; $('stepNav').hidden = false;
  renderStep();
  renderBoard();
}
function closeStepper() {
  $('stepper').hidden = true; $('stepNav').hidden = true;
  const w = $('boardWrap'); w.classList.remove('stepping'); document.body.classList.remove('stepping');
  G.stepMaxK = 1; resetZoom(); setTurn([]); renderBoard();
  if (stepFull && w.classList.contains('full')) toggleFull();
  stepFull = false;
}
// sırası gelen token(lar) tablada yanıp söner
let turnKey = '';
function setTurn(ids) {
  const k = ids.join(',');
  G.turn = ids.length ? new Set(ids) : null;
  $('board').classList.toggle('turning', !!ids.length);
  if (k !== turnKey) { turnKey = k; renderBoard(); }
}
function remChips(mine) {
  const out = [];
  mine.forEach(t => G.S.tokens.filter(x => x.kind === 'rem' && x.owner === t.id).forEach(x => {
    if (/^(poisoned|drunk( \d)?|is the drunk)$/i.test(String(x.text).trim())) return;
    const nm = x.role ? `${RN(x.role)} – ${remTr(x.text)}` : remTr(x.text);
    out.push(`<span class="rw" style="--gc:${colorOf(t.id)}">${esc(nm)}${mine.length > 1 && t.name ? ` <small>(${esc(t.name)})</small>` : ''}</span>`);
  }));
  return out.join('');
}
function impBanner(mine) {
  return mine.flatMap(t => impairOf(t).map(i => `<div class="st-imp"><b>⚠ ${t.name ? esc(t.name) + ' ' : ''}${i.kind.toLocaleUpperCase('tr')}</b>${i.src && i.src !== 'drunk' ? ` <small>(${esc(RN(i.src))} yüzünden)</small>` : ''} <span>Bilgi yanlış olabilir, yeteneği çalışmaz.</span></div>`)).join('');
}
function renderStep() {
  const steps = nightSteps(), S = G.S, tab = S.night.tab;
  STEP.i = Math.max(0, Math.min(STEP.i, steps.length - 1));
  const st = steps[STEP.i], done = new Set(S.night.done[tab] || []);
  const ph = phaseLabel(curPhase());
  const toks = boardRoles();
  let body = '', turn = [], next = '✓ Yapıldı', skip = false;
  if (st.k === 'summary') {
    const imp = toks.filter(t => impairOf(t).length);
    const rems = toks.filter(t => G.S.tokens.some(x => x.kind === 'rem' && x.owner === t.id && !/^(poisoned|drunk( \d)?|is the drunk)$/i.test(String(x.text).trim())));
    const wake = steps.filter(s => s.k === 'role').length;
    turn = imp.map(t => t.id);
    body = `<div class="sp-head"><span class="sp-moon">🌙</span><h2>${tab === 'first' ? 'İlk gece' : esc(ph)}</h2><span class="muted small">${wake} karakter</span></div>
      <div class="sp-scroll">${imp.map(t => `<div class="st-imp"><b>${t.name ? esc(t.name) + ' · ' : ''}${esc(RN(t.role))}</b> ${impairOf(t).map(i => i.kind + (i.src && i.src !== 'drunk' ? ` (${esc(RN(i.src))})` : '')).join(', ')}</div>`).join('')}
      ${rems.length ? `<div class="rws">${rems.map(t => remChips([t])).join('')}</div>` : ''}${!imp.length && !rems.length ? '<p class="muted small">Sarhoş/zehirli ya da hatırlatıcı yok.</p>' : ''}</div>`;
    next = 'Başla ›';
  } else if (st.k === 'struct') {
    const [nm, txt] = STRUCT[st.id];
    turn = toks.filter(t => !t.st && ['minion', 'demon'].includes(role(t.role).team)).map(t => t.id);
    body = `<div class="sp-head"><span class="ne-ic s-${st.id}"></span><h2>${nm}</h2></div><div class="sp-scroll"><p class="st-txt">${esc(txt)}</p></div>`;
    skip = true;
  } else if (st.k === 'dawn') {
    const deaths = (S.log || []).filter(e => e.ph === ph && e.k === 'death');
    turn = deaths.map(e => e.tid).filter(Boolean);
    const dn = e => { const t = G.S.tokens.find(x => x.id === e.tid); return t ? { n: t.name || 'isimsiz', r: RN(t.role) } : { n: e.x.replace(/ öldü$/, ''), r: '' }; };
    body = `<div class="sp-head"><span class="sp-moon">🌅</span><h2>Şafak</h2><span class="muted small">Ölenleri açıkla, nasıl öldüklerini söyleme</span></div>
      <div class="sp-scroll">${deaths.length ? deaths.map(e => { const d = dn(e); return `<p class="st-death">† <b>${esc(d.n)}</b>${d.r ? ` <small>${esc(d.r)}</small>` : ''}</p>`; }).join('') : '<p class="muted small">Bu gece tablada kimse öldü olarak işaretlenmedi.</p>'}</div>`;
    next = `☀️ Güne geç`;
  } else {
    const r = role(st.id), allDead = st.mine.every(t => t.dead);
    turn = st.mine.map(t => t.id);
    const who = st.mine.filter(t => t.name || t.st || st.mine.length > 1).map(t => t.st ? '<span class="st-p me">🎩 Sen (yönetici)</span>' : `<span class="st-p${t.dead ? ' dead' : ''}">${t.name ? esc(t.name) : '?'}${t.dead ? ' †' : ''}</span>`).join('');
    const imp = st.mine.flatMap(t => impairOf(t).map(i => `<span class="st-impb">⚠ ${st.mine.length > 1 && t.name ? esc(t.name) + ' ' : ''}${i.kind.toLocaleUpperCase('tr')}</span>`)).join('');
    body = `<div class="sp-head"><span class="sp-ic">${icon(st.id, 'ic')}</span><h2 class="t-${r.team}${allDead ? ' gone' : ''}">${esc(r.name)}${done.has(st.id) ? ' <i class="ok">✓</i>' : ''}</h2>${who}${allDead ? '<span class="st-dead">ÖLÜ</span>' : ''}${imp}</div>
      <div class="sp-scroll">${imp ? '<p class="st-impl">Zehirli/sarhoş: bilgi yanlış olabilir, yeteneği çalışmaz.</p>' : ''}<p class="st-txt">${rich(st.txt)}</p>
      ${remChips(st.mine) ? `<div class="rws">${remChips(st.mine)}</div>` : ''}
      ${STEP.note ? '<div class="st-inrow"><input class="st-in" id="stInfo" placeholder="Verdiğin bilgi — günlüğe yazılır" maxlength="160" enterkeyhint="done"><button class="st-ok" id="stInOk">Tamam</button></div>' : ''}</div>`;
    skip = true;
  }
  if (STEP.infoAt !== STEP.i) { STEP.infoAt = STEP.i; STEP.info = ''; STEP.note = false; }
  const focused = document.activeElement && document.activeElement.id === 'stInfo';
  $('stepper').innerHTML = `<div class="st-top"><span>${esc(ph)} · ${STEP.i + 1}/${steps.length}</span><div class="st-bar"><i style="width:${(STEP.i + 1) / steps.length * 100}%"></i></div>${st.k === 'role' ? `<button class="st-pen${STEP.info ? ' on' : ''}" id="stPen" aria-label="Not ekle" title="Verdiğin bilgiyi yaz">✎</button>` : ''}<button class="st-end" id="stX">Bitir ✕</button></div>
    <div class="st-body">${body}</div>`;
  $('stepNav').innerHTML = `<button class="btn" id="stUndo" aria-label="Geri al" title="Son işlemi geri al">↶</button><button class="btn" id="stBack" ${STEP.i ? '' : 'disabled'} aria-label="Önceki adım">‹</button>${skip ? '<button class="btn ghost" id="stSkip">Atla</button>' : ''}<button class="btn primary" id="stNext">${next}</button><button class="st-zoom" id="stZoom" hidden>1:1</button>`;
  if ($('stInfo')) {
    const inp = $('stInfo'); inp.value = STEP.info;
    if (focused || STEP.focus) { STEP.focus = false; inp.focus(); }
    inp.oninput = () => { STEP.info = inp.value; };
    const done = () => { STEP.info = inp.value.trim(); STEP.note = false; inp.blur(); renderStep(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(); } };
    $('stInOk').onclick = done;
  }
  if ($('stPen')) $('stPen').onclick = () => { STEP.note = !STEP.note; STEP.focus = STEP.note; renderStep(); };
  $('stUndo').disabled = !canUndo();
  $('stZoom').onclick = resetZoom;
  $('stUndo').onclick = () => $('wrapUndo').click();
  setTurn(turn);
  layoutStep();
  $('stX').onclick = closeStepper;
  $('stBack').onclick = () => { STEP.i--; renderStep(); };
  if ($('stSkip')) $('stSkip').onclick = () => { STEP.i++; renderStep(); };
  $('stNext').onclick = () => {
    if (st.k === 'dawn') { closeStepper(); return phaseStep(1); }
    const info = (($('stInfo') ? $('stInfo').value : STEP.info) || '').trim();
    if (st.id) commit(S => {
      const d = new Set(S.night.done[tab] || []); d.add(st.id); S.night.done[tab] = [...d];
      if (info) S.log.push({ id: uid(), ph, k: 'info', x: `${RN(st.id)}${st.mine && st.mine[0].name ? ' (' + st.mine[0].name + ')' : ''}: ${info}`, t: Date.now() });
    }, true);
    STEP.i++; renderStep();
  };
}

// Tabla ana sayfadaki oranıyla, sola dayalı küçülür. Sağda yeterli boşluk kalırsa düğmeler oraya dikey dizilir,
// kalmazsa altta ince bir sıra olur.
function layoutStep() {
  // düğmeler hep altta, ince; tabla üst panel ile düğmeler arasına orantılı sığar
  const w = $('boardWrap'), nav = $('stepNav');
  const topH = $('stepper').offsetHeight;
  w.style.setProperty('--stT', topH + 'px'); nav.style.setProperty('--stT', topH + 'px');
  G.stepMaxK = 1;
  w.style.setProperty('--stB', nav.offsetHeight + 'px'); nav.style.setProperty('--stB', nav.offsetHeight + 'px');
  renderBoard();
}
window.addEventListener('resize', () => { if (!$('stepper').hidden) layoutStep(); });
document.addEventListener('boardzoom', e => { const z = $('stZoom'); if (z) z.hidden = e.detail === 1; });

// ---- katlanır bölümler ----
function renderPanes() {
  document.querySelectorAll('.pane-h').forEach(b => {
    const shut = !!G.S.open[b.dataset.pane];
    b.parentElement.classList.toggle('shut', shut);
  });
}

// ================= 1. KURULUM =================
function renderSetup() {
  const S = G.S, D = G.D;
  const n = S.script.roles.length;
  $('scriptLine').innerHTML = n
    ? `<span class="lbl">Senaryo</span><b>${esc(S.script.name || 'Özel senaryo')}</b><span class="muted">${n} karakter</span>`
    : `<span class="lbl">Senaryo</span><span class="muted">Seçilmedi</span>`;
  const when = D.at ? new Date(D.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  $('dataLine').innerHTML = D.offline
    ? `<span class="warn-t">Sheet'e ulaşılamadı.</span> ${D.at ? `Kayıtlı kopya kullanılıyor (${when}).` : 'Kayıtlı kopya yok.'}`
    : `Türkçe metinler sheet'ten yüklendi · ${when}`;
}

function openScripts() {
  const S = G.S, D = G.D;
  openModal('Senaryo Seç', `
    <div class="list">${D.scripts.map((s, i) => `<button class="btn list-btn${S.script.name === s.name ? ' on' : ''}" data-i="${i}">${esc(s.name)}<small>${s.roles.length} karakter</small></button>`).join('') || '<p class="muted">Sheet\'te senaryo bulunamadı.</p>'}</div>
    <details class="sub"><summary>Panodan yapıştır</summary>
      <textarea id="scPaste" rows="4" placeholder='["chef","empath",…] ya da resmi script JSON'></textarea>
      <button class="btn primary small" id="scPasteOk">Yükle</button></details>
    <details class="sub"><summary>Dosyadan yükle</summary><input type="file" id="scFile" accept=".json,application/json"></details>`, body => {
    body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => useScript(D.scripts[+b.dataset.i].name, D.scripts[+b.dataset.i].roles));
    $('scPasteOk').onclick = () => fromJSON($('scPaste').value);
    $('scFile').onchange = async e => { const f = e.target.files[0]; if (f) fromJSON(await f.text(), f.name.replace(/\.json$/i, '')); };
  });
}
function fromJSON(text, fname = '') {
  const p = parseScript(text);
  if (!p || !p.roles.length) return toast('Script okunamadı.');
  const unknown = p.roles.filter(id => !G.D.roles[id]);
  p.roles.filter(id => !G.D.roles[id]).forEach(id => { G.D.roles[id] = { id, name: id, team: 'townsfolk', ability: '', first: '', other: '', reminders: [], remindersGlobal: [], english: true }; });
  useScript(p.name || fname || 'Özel senaryo', p.roles);
  if (unknown.length) toast(`Tanınmayan: ${unknown.join(', ')}`, 4000);
}
function useScript(name, roles) {
  commit(S => {
    S.script = { name, roles: [...roles] };
    for (const id of Object.keys(S.setup.pick)) if (!roles.includes(id)) delete S.setup.pick[id];
  });
  closeModal();
  toast(`${name} seçildi`);
}

// ---- karakter seçimi ----
function expected(n) {
  const base = DIST[Math.min(Math.max(n, 5), 15)];
  return { townsfolk: base[0], outsider: base[1], minion: base[2], demon: base[3], traveller: Math.max(0, n - 15) };
}
function openChars() {
  const S = G.S;
  if (!S.script.roles.length) { toast('Önce bir senaryo seç.'); return openScripts(); }
  const render = () => {
    const st = S.setup, n = st.players, exp = expected(n);
    const ids = scriptIds();
    const cnt = {}; TEAMS.forEach(t => cnt[t] = 0);
    Object.entries(st.pick).forEach(([id, c]) => { cnt[role(id).team] = (cnt[role(id).team] || 0) + c; });
    const total = Object.values(st.pick).reduce((a, b) => a + b, 0);
    const cols = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const col = Math.min(Math.max(n, 5), 15);
    const rowT = (t, i) => `<tr class="t-${t}"><th>${TEAM_PL[t]}</th>${cols.map(c => `<td class="${c === col ? 'on' : ''}">${DIST[c][i]}</td>`).join('')}</tr>`;
    openModal('Karakterleri Seç', `
      <div class="dist-wrap"><table class="dist"><tr><th>Oyuncular</th>${cols.map(c => `<td class="${c === col ? 'on' : ''}">${c === 15 ? '15+' : c}</td>`).join('')}</tr>
        ${['townsfolk', 'outsider', 'minion', 'demon'].map(rowT).join('')}</table></div>
      <div class="lbl">Oyuncu sayısı</div>
      <div class="pcount" id="csN">${Array.from({ length: 16 }, (_, i) => i + 5).map(c => `<button data-n="${c}" class="${c === n ? 'on' : ''}">${c}</button>`).join('')}</div>
      <label class="sw"><input type="checkbox" id="csAb" ${st.abilities ? 'checked' : ''}><i></i>Karakter özelliklerini göster</label>
      <label class="sw"><input type="checkbox" id="csDup" ${st.dup ? 'checked' : ''}><i></i>Aynı karakterden birden fazla</label>
      <div class="grid2"><button class="btn" id="csRand">Rastgele öner</button><button class="btn ghost" id="csClear">Seçimi temizle</button></div>
      ${['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map(t => {
        const list = ids.filter(id => role(id).team === t);
        if (!list.length) return '';
        const want = exp[t];
        return `<div class="cgroup t-${t}"><div class="cg-side"><div class="cg-stick"><span>${TEAM_PL[t]}</span><b class="${cnt[t] === want ? 'ok' : 'off'}">${cnt[t]} / ${want}</b></div></div>
          <div class="cg-list">${list.map(id => {
            const c = st.pick[id] || 0;
            return `<button class="cc${c ? ' on' : ''}" data-id="${id}">${icon(id, 'ic big')}<b>${esc(RN(id))}</b>${st.abilities ? `<small>${rich(role(id).ability)}</small>` : ''}${c > 1 ? `<span class="cnt">×${c}</span>` : ''}${c && st.dup ? `<span class="minus" data-minus="${id}">−</span>` : ''}</button>`;
          }).join('')}</div></div>`;
      }).join('')}
      <div class="sticky-foot"><span>${total} seçili${total !== n ? ` · <span class="warn-t">${n} oyuncu</span>` : ''}</span><span class="foot-btns"><button class="btn" id="csDeal" ${total ? '' : 'disabled'}>Oyunculara dağıt</button><button class="btn primary" id="csPlace" ${total ? '' : 'disabled'}>Tablaya diz</button></span></div>`, body => {
      $('csN').onclick = e => { const b = e.target.closest('[data-n]'); if (b) { commit(S => { S.setup.players = +b.dataset.n; }, true); render(); } };
      $('csAb').onchange = e => { commit(S => { S.setup.abilities = e.target.checked; }, true); render(); };
      $('csDup').onchange = e => { commit(S => { S.setup.dup = e.target.checked; if (!S.setup.dup) for (const k in S.setup.pick) S.setup.pick[k] = 1; }, true); render(); };
      $('csClear').onclick = () => { commit(S => { S.setup.pick = {}; }, true); render(); };
      $('csRand').onclick = () => { randomPick(); render(); };
      $('csPlace').onclick = placeChosen;
      $('csDeal').onclick = () => startDeal();
      body.onclick = e => {
        const m = e.target.closest('[data-minus]');
        if (m) { e.stopPropagation(); commit(S => { const k = m.dataset.minus; if (--S.setup.pick[k] <= 0) delete S.setup.pick[k]; }, true); return render(); }
        const b = e.target.closest('.cc'); if (!b) return;
        const id = b.dataset.id;
        commit(S => { const p = S.setup.pick; if (S.setup.dup) p[id] = (p[id] || 0) + 1; else if (p[id]) delete p[id]; else p[id] = 1; }, true);
        render();
      };
    }, { wide: true });
  };
  render();
}
function randomPick() {
  const exp = expected(G.S.setup.players), ids = scriptIds();
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  commit(S => {
    S.setup.pick = {};
    for (const t of ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'])
      shuffle(ids.filter(id => role(id).team === t)).slice(0, exp[t]).forEach(id => { S.setup.pick[id] = 1; });
  }, true);
  toast('Kurulumu değiştiren karakterleri (Baron vb.) kendin ayarla.', 3500);
}
function placeChosen() {
  const order = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'];
  const list = [];
  Object.entries(G.S.setup.pick).forEach(([id, c]) => { for (let i = 0; i < c; i++) list.push(id); });
  list.sort((a, b) => order.indexOf(role(a).team) - order.indexOf(role(b).team));
  const existing = boardRoles().filter(t => role(t.role).team !== 'fabled' && !t.st);
  const replace = () => {
    closeModal();
    commit(S => {
      const gone = new Set(existing.map(t => t.id));
      S.tokens = S.tokens.filter(t => !gone.has(t.id) && !(t.kind === 'rem' && gone.has(t.owner)));
      ovalSpots(list.length).forEach((xy, i) => addRoleToken(list[i], xy)); S.fangguDone = false;
    });
    goBoard();
  };
  const append = () => { closeModal(); commit(() => { list.forEach(id => addRoleToken(id)); }); goBoard(); };
  if (!existing.length) return replace();
  confirmBox(`Tablada ${existing.length} karakter simgesi var. Silinip yerine yenileri dizilsin mi?`, 'Sil ve diz', replace,
    { alt: { text: 'Mevcutlara ekle', cb: append } });
}

// ---- oyunculara rastgele dağıtım: numaralı jetonlar, oyuncu seçer, rolünü görür ----
function startDeal() {
  const list = [];
  Object.entries(G.S.setup.pick).forEach(([id, c]) => { for (let i = 0; i < c; i++) list.push(id); });
  if (!list.length) { toast('Önce karakterleri seç.'); return openChars(); }
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const existing = boardRoles().filter(t => role(t.role).team !== 'fabled' && !t.st);
  const go = () => {
    commit(S => {
      const gone = new Set(existing.map(t => t.id));
      S.tokens = S.tokens.filter(t => !gone.has(t.id) && !(t.kind === 'rem' && gone.has(t.owner)));
      S.deal = { pool: list, taken: {} }; S.fangguDone = false;
    });
    dealGrid();
  };
  if (!existing.length) return go();
  confirmBox(`Tablada ${existing.length} karakter simgesi var. Silinip dağıtım baştan başlasın mı?`, 'Sil ve başlat', go);
}
function openDeal() {
  if (G.S.deal && G.S.deal.pool && G.S.deal.pool.length) return dealGrid();
  startDeal();
}
function dealGrid() {
  const d = G.S.deal; if (!d) return;
  const n = d.pool.length, left = n - Object.keys(d.taken).length;
  openModal('Karakterini Seç', `
    <p class="deal-help">${left ? 'Karakterini seçmek için numaralı jetonlardan birine dokun. Daha koyu olanlar seçilmiştir.' : 'Tüm karakterler dağıtıldı.'}</p>
    <div class="deal-grid">${d.pool.map((_, i) => `<button class="dnum${d.taken[i] ? ' taken' : ''}" data-i="${i}" ${d.taken[i] ? 'disabled' : ''}><span>${i + 1}</span></button>`).join('')}</div>
    <div class="grid2 deal-foot">${left ? '<button class="btn ghost small" id="dealCancel">Dağıtımı bitir</button>' : ''}<button class="btn primary" id="dealDone">${left ? 'Kapat' : 'Tablaya git'}</button></div>`, body => {
    body.querySelector('.deal-grid').onclick = e => { const b = e.target.closest('.dnum'); if (b && !b.disabled) dealReveal(+b.dataset.i); };
    $('dealDone').onclick = () => { closeModal(); if (!left) { commit(S => { S.deal = null; }, true); goBoard(); } };
    const c = $('dealCancel');
    if (c) c.onclick = () => confirmBox(`${left} karakter henüz seçilmedi. Dağıtım bitirilsin mi? (Tablaya gelenler kalır.)`, 'Bitir', () => { commit(S => { S.deal = null; }, true); closeModal(); goBoard(); });
  }, { opaque: true });
}
function dealReveal(i) {
  const d = G.S.deal; if (!d || d.taken[i]) return dealGrid();
  const rid = d.pool[i];
  let tid;
  commit(S => {
    const spots = ovalSpots(S.deal.pool.length);
    const t = addRoleToken(rid, spots[Object.keys(S.deal.taken).length]);
    S.deal.taken[i] = t.id; tid = t.id;
  });
  const r = role(rid);
  openModal('Karakterini Hatırla', `${bigTok(rid)}
    <p class="deal-ab">${rich(r.ability) || ''}</p>
    <label class="deal-name">İsmini gir (opsiyonel)<input id="dealName" autocomplete="off" maxlength="24"></label>
    <button class="btn primary" id="dealBack">Karakter seçimine geri dön</button>`, body => {
    $('dealName').oninput = e => commit(S => { const t = S.tokens.find(x => x.id === tid); if (t) t.name = e.target.value.trim(); }, true);
    $('dealBack').onclick = dealGrid;
  }, { opaque: true });
}
function goBoard() { if (G.S.open.board) commit(S => { S.open.board = false; }, true); $('secBoard').scrollIntoView({ behavior: 'smooth' }); }

// ---- karakter kağıdı (oyunculara) ----
function openSheet() {
  const ids = scriptIds();
  openModal(esc(G.S.script.name || 'Karakterler'), ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map(t => {
    const list = ids.filter(id => role(id).team === t);
    return list.length ? `<h4 class="t-${t}">${TEAM_PL[t]}</h4>${list.map(id => `<div class="sheet-row">${icon(id, 'ic big')}<div><b>${esc(RN(id))}</b><p>${rich(role(id).ability)}</p></div></div>`).join('')}` : '';
  }).join(''), null, { wide: true });
}

// ---- isim girme: saat yönünde sırayla ----
function nameFlow(startId) {
  const order = clockwise();
  if (!order.length) return toast('Tablada karakter simgesi yok.');
  let i = startId ? Math.max(0, order.findIndex(t => t.id === startId)) : Math.max(0, order.findIndex(t => !t.name));
  const render = () => {
    const t = tokById(order[i].id);
    openModal('Oyuncu isimleri', `
      <div class="name-head">${icon(t.role, 'ic big')}<div><b>${esc(RN(t.role))}</b><span class="muted">${i + 1}. sıra / ${order.length} · saat yönünde</span></div></div>
      <input id="nmIn" class="big-in" value="${esc(t.name)}" placeholder="Oyuncunun ismi" enterkeyhint="next" autocomplete="off" autocapitalize="words" spellcheck="false">
      <div class="row-btns"><button class="btn" id="nmPrev" ${i ? '' : 'disabled'}>‹ Önceki</button><button class="btn primary" id="nmNext">${i < order.length - 1 ? 'Sonraki ›' : 'Bitir'}</button></div>
      <button class="btn ghost small" id="nmDone">Kapat</button>`, () => {
      const inp = $('nmIn'); inp.focus(); inp.select();
      const keep = () => setName(t.id, inp.value);
      $('nmNext').onclick = () => { if (!keep()) return; if (i < order.length - 1) { i++; render(); } else closeModal(); };
      $('nmPrev').onclick = () => { if (!keep()) return; i--; render(); };
      $('nmDone').onclick = () => { if (keep()) closeModal(); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('nmNext').click(); } };
    });
  };
  render();
}
function setName(id, v) {
  v = (v || '').trim();
  const t = tokById(id); if (!t || v === t.name) return true;
  if (v) {
    const k = v.toLocaleLowerCase('tr');
    const d = G.S.tokens.find(q => q.kind === 'role' && q.id !== id && (q.name || '').toLocaleLowerCase('tr') === k);
    if (d) { toast(`"${v}" ismi ${RN(d.role)} simgesinde zaten var.`); return false; }
  }
  commit(S => { S.tokens.find(q => q.id === id).name = v; });
  return true;
}

// ================= 2. GRIMOIRE =================
function openToken(id) {
  const t = tokById(id); if (!t) return closeModal();
  const r = role(t.role);
  const rems = G.S.tokens.filter(x => x.kind === 'rem' && x.owner === t.id);
  const trav = r.team === 'traveller', fab = r.team === 'fabled';
  const pills = rems.length ? `<div class="chips rem-pills">${rems.map(x => `<button class="chip" data-rdel="${x.id}" style="--gc:${colorOf(t.id)}">${esc(remTr(x.text))} <span>✕</span></button>`).join('')}</div>` : '';
  openModal(`${esc(r.name)}`, `
    ${fab ? '' : `<div class="tm-who"><span class="${t.name ? 'who' : 'who none'}">${t.name ? esc(t.name) : 'İsim yok'}</span><button class="ib" id="tmEdit" title="İsmi değiştir" aria-label="İsmi değiştir">✎</button></div>
    <div class="row-in" id="tmEditRow" hidden><input id="tmName" value="${esc(t.name)}" placeholder="İsim" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done">
      <button class="btn small primary" id="tmNameOk">Kaydet</button><button class="btn small" id="tmNameNext" title="Kaydet ve saat yönünde sıradakine geç">Sonraki ›</button></div>`}
    <div class="tm-head t-${r.team}">${icon(t.role, 'ic big')}<div>
      <span class="team">${TEAM_TR[r.team] || r.team}${t.flip ? ' · <b>takımı ters</b>' : ''}${t.dead ? ' · <b>ölü</b>' : ''}</span>
      <p>${rich(r.ability) || '<span class="muted">Yetenek metni yok.</span>'}</p></div></div>
    ${pills}
    <div class="grid2">
      <button class="btn" data-a="show">Göster</button>
      ${fab ? '' : `<button class="btn" data-a="dead">${t.dead ? 'Dirilt' : 'Öldür'}</button>
      <button class="btn" data-a="flip">Döndür (takım)</button>`}
      <button class="btn" data-a="rem">Hatırlatıcı</button>
      <button class="btn" data-a="swap">Değiştir</button>
      ${fab ? '' : `<button class="btn" data-a="vote" ${t.dead ? '' : 'disabled'}>${t.dead ? (t.voteUsed ? 'Ölü oyu: kullandı' : 'Ölü oyu: var') : 'Ölü oyu'}</button>`}
    </div>
    ${fab ? '' : `<button class="btn ghost wide st-btn" data-a="st">${t.st ? '👤 Oyuncu olarak say' : '🎩 Yönetici rolü (oyuncu sayılmasın)'}</button>`}
    <button class="btn warn wide" data-a="del">Simgeyi kaldır</button>
    ${trav ? '<p class="muted small">Gezginler idam edilmez, sürgün edilir.</p>' : ''}`, body => {
    const save1 = () => setName(t.id, $('tmName').value);
    if (!fab) {
      $('tmEdit').onclick = () => { $('tmEditRow').hidden = !$('tmEditRow').hidden; if (!$('tmEditRow').hidden) { $('tmName').focus(); $('tmName').select(); } };
      $('tmNameOk').onclick = () => { if (save1()) closeModal(); };
      $('tmNameNext').onclick = () => {
        if (!save1()) return;
        const order = clockwise(); const i = order.findIndex(q => q.id === t.id);
        nameFlow(order[(i + 1) % order.length].id);
      };
      $('tmName').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('tmNameOk').click(); } };
    }
    body.onclick = e => {
      const del = e.target.closest('[data-rdel]');
      if (del) { commit(S => { S.tokens = S.tokens.filter(x => x.id !== del.dataset.rdel); }); return openToken(id); }
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'show') { closeModal(); showFull(bigTok(t.role)); }
      if (a === 'dead') {
        const kill = () => commit(S => { const q = tokById(id); q.dead = !q.dead; if (!q.dead) q.voteUsed = false; });
        const fg = boardRoles().find(x => x.role === 'fanggu' && !x.dead && x.id !== id);
        // Fang Gu uyarısı: ilk Yabancı ölümü onu Fang Gu'ya çevirir (Fang Gu ölür)
        if (!t.dead && r.team === 'outsider' && fg && !G.S.fangguDone) {
          return confirmBox(`FANG GU var ve bu bir YABANCI (${r.name}). Fang Gu'nun öldürdüğü İLK Yabancı ölmez: Fang Gu ölür, bu oyuncu kötü takımdan yeni Fang Gu olur. Ne yapılsın?`,
            'Fang Gu\'ya dönüşsün', () => {
              commit(S => { tokById(id).role = 'fanggu'; tokById(fg.id).dead = true; S.fangguDone = true; });
              closeModal(); toast('Dönüştü: eski Fang Gu öldü. Yeni Fang Gu\'ya "SEN" + Fang Gu tokenı göster, başparmağı aşağı.', 6000);
            }, { danger: false, alt: { text: 'Normal öldür (dönüşüm daha önce oldu)', cb: () => { commit(S => { S.fangguDone = true; }, true); kill(); closeModal(); } } });
        }
        kill(); closeModal();
      }
      if (a === 'flip') { commit(S => { const q = tokById(id); q.flip = !q.flip; }); openToken(id); }
      if (a === 'st') { const on = !t.st; commit(S => { const q = tokById(id); if (on) q.st = true; else delete q.st; }); toast(on ? 'Yönetici rolü: oyuncu sayılarına girmiyor. Geri almak için aynı düğme ya da ↶.' : 'Tekrar oyuncu olarak sayılıyor.', 3500); openToken(id); }
      if (a === 'vote') { commit(S => { const q = tokById(id); q.voteUsed = !q.voteUsed; }); openToken(id); }
      if (a === 'rem') pickReminder(id, () => openToken(id));
      if (a === 'swap') pickRole({ title: 'Yeni karakter' }, rid => { commit(S => { tokById(id).role = rid; }); openToken(id); }, () => openToken(id));
      if (a === 'del') confirmBox(`${r.name} simgesi${rems.length ? ' ve bağlı hatırlatıcıları' : ''} kaldırılsın mı?`, 'Kaldır', () => {
        commit(S => { S.tokens = S.tokens.filter(x => x.id !== id && x.owner !== id); });
      });
    };
  });
}

function openRem(id) {
  const t = tokById(id); if (!t) return;
  const owner = t.owner && tokById(t.owner);
  openModal('Hatırlatıcı', `
    <div class="tm-head">${t.role ? icon(t.role, 'ic big') : ''}<div><b>${esc(remTr(t.text))}</b>
      ${t.role ? `<span class="muted">${esc(RN(t.role))}</span>` : ''}
      ${owner ? `<p class="muted small">Bağlı olduğu simge: ${esc(RN(owner.role))}${owner.name ? ` (${esc(owner.name)})` : ''}</p>` : ''}</div></div>
    <div class="grid2"><button class="btn warn" id="rmDel">Kaldır</button><button class="btn" id="rmOk">Kapat</button></div>
    ${owner ? '<button class="btn ghost small" id="rmFree">Simgeden ayır (onunla birlikte taşınmasın)</button>' : ''}`, () => {
    $('rmDel').onclick = () => { commit(S => { S.tokens = S.tokens.filter(x => x.id !== id); }); closeModal(); };
    $('rmOk').onclick = closeModal;
    if (owner) $('rmFree').onclick = () => { commit(S => { tokById(id).owner = null; }); closeModal(); };
  });
}

// ---- rol seçici ----
// o: {title, ids (Tümü kapalıyken liste), team, allowNone, noneText, startAll}
function pickRole(o, cb, back) {
  let all = !!o.startAll, q = '';
  const render = () => {
    const D = G.D;
    let ids = all ? Object.keys(D.roles) : (o.ids || [...new Set([...scriptIds(), ...boardRoles().map(t => t.role)])]);
    if (o.team) ids = ids.filter(id => role(id).team === o.team);
    else ids = ids.filter(id => role(id).team !== 'fabled' || !all);
    if (q) ids = ids.filter(id => RN(id).toLocaleLowerCase('tr').includes(q) || id.includes(q));
    const play = inPlay();
    const groups = TEAMS.map(t => [t, ids.filter(id => role(id).team === t)]).filter(([, l]) => l.length);
    openModal(esc(o.title || 'Karakter seç'), `
      <div class="pick-bar"><input id="pkQ" placeholder="Ara" value="${esc(q)}" autocomplete="off">
        <label class="sw"><input type="checkbox" id="pkAll" ${all ? 'checked' : ''}><i></i>Tümü</label></div>
      ${o.allowNone ? `<button class="btn ghost small" data-rid="">${esc(o.noneText || 'Boş bırak')}</button>` : ''}
      ${groups.map(([t, l]) => `<h4 class="t-${t}">${TEAM_PL[t]}</h4><div class="tok-grid">${l.map(id => `<button class="pk t-${role(id).team}${play.has(id) ? ' inplay' : ''}" data-rid="${id}">${icon(id, 'ic big')}<span>${esc(RN(id))}</span></button>`).join('')}</div>`).join('') || '<p class="muted">Sonuç yok.</p>'}
      <p class="muted small">Çerçeveli olanlar tablada.</p>`, body => {
      const qi = $('pkQ');
      qi.oninput = () => { q = qi.value.toLocaleLowerCase('tr').trim(); const p = qi.selectionStart; render(); const n = $('pkQ'); n.focus(); n.setSelectionRange(p, p); };
      $('pkAll').onchange = e => { all = e.target.checked; render(); };
      body.onclick = e => { const b = e.target.closest('[data-rid]'); if (b) cb(b.dataset.rid); };
    }, { back });
  };
  render();
}


// ---- masalar / odalar paneli ----
async function openRoomPanel() {
  const cur = currentRoom();
  let rooms = [], offline = false;
  openModal('Masalar', '<p class="muted">Yükleniyor…</p>');
  try { ({ rooms, offline } = await listRooms()); } catch (e) { toast('Oda listesi alınamadı: ' + (e && (e.code || e.message) || e), 6000); }
  const fmt = n => n === 1 ? '1 cihaz bağlı' : `${n} cihaz bağlı`;
  const sub = r => offline ? (r.cached ? 'Bu cihazda kayıtlı' : 'Kayıt yok, internet gerekli') + (r.pending ? ' · gönderilmemiş değişiklik var' : '')
    : fmt(r.n) + (r.pending ? ' · gönderilmemiş değişiklik var' : '');
  openModal('Masalar', `
    <p class="lead">Şu an: <b class="room-code">${cur ? esc(cur) : 'Yerel masa'}</b></p>
    ${offline ? '<p class="offline-note">İnternet yok. Bu cihazda kayıtlı odalar arasında geçebilirsin; değişiklikler internet gelince gönderilir. Oda açma ve silme internet ister.</p>' : ''}
    <div class="rooms">
      <div class="room${cur ? '' : ' here'}"><div><b>Yerel masa</b><small>Sadece bu cihazda</small></div>
        ${cur ? '<button class="btn small" data-go="">Dön</button>' : '<span class="here-t">Buradasın</span>'}</div>
      ${rooms.map(r => `<div class="room${r.code === cur ? ' here' : ''}"><div><b>${esc(r.code)}</b><small>${sub(r)}</small></div>
        ${r.code === cur ? '<span class="here-t">Buradasın</span>' : (offline && !r.cached ? '' : `<button class="btn small" data-go="${esc(r.code)}">Gir</button>`)}
        ${offline ? '' : `<button class="ib" data-del="${esc(r.code)}" title="Odayı sil" aria-label="Odayı sil">🗑</button>`}</div>`).join('')}
      ${rooms.length ? '' : `<p class="muted small">${offline ? 'Bu cihazda kayıtlı oda yok.' : 'Henüz oda yok.'}</p>`}
    </div>
    ${offline ? '' : `<label class="lbl">Yeni oda</label>
    <div class="row-in"><input id="rmName" placeholder="örn. masa1" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20">
      <button class="btn small primary" id="rmNew">Oluştur ve gir</button></div>
    <label class="sw"><input type="checkbox" id="rmCopy" ${G.S.tokens.length ? 'checked' : ''}><i></i>Şu an ekrandaki oyunu odaya kopyala</label>`}
    <p class="muted small">Aynı odaya giren cihazlar aynı oyunu paylaşır. Yerel masan ve diğer odalar birbirinden bağımsızdır; istediğin zaman geçiş yapabilirsin. Girdiğin odalar bu cihazda saklanır, internet giderse de açılır.</p>
    <button class="btn ghost small" id="rmRefresh">Listeyi yenile</button>`, body => {
    $('rmRefresh').onclick = openRoomPanel;
    if ($('rmNew')) $('rmNew').onclick = async () => {
      const c = normRoom($('rmName').value); if (!c) return toast('Oda adı yaz (harf, rakam, tire).');
      try { await enterRoom(c, { create: true, copy: $('rmCopy').checked }); closeModal(); toast(`Oda ${c}`); }
      catch (e) { toast(e === 'exists' ? 'Bu isimde bir oda zaten var, listeden gir.' : e === 'offline' ? 'İnternet yok, oda açılamadı.' : 'Oda açılamadı: ' + (e && (e.code || e.message) || e), 6000); }
    };
    body.onclick = async e => {
      const go = e.target.closest('[data-go]'), del = e.target.closest('[data-del]');
      if (go) {
        const c = go.dataset.go;
        try { if (c) await enterRoom(c); else leaveToLocal(); closeModal(); toast(c ? `Oda ${c}` : 'Yerel masa'); }
        catch (er) { toast(er === 'missing' ? 'Bu oda artık yok.' : er === 'offline' ? 'İnternet yok ve bu oda bu cihazda kayıtlı değil.' : 'Odaya girilemedi: ' + (er && (er.code || er.message) || er), 6000); openRoomPanel(); }
      }
      if (del) confirmRoomDelete(del.dataset.del);
    };
  });
}
function confirmRoomDelete(code) {
  openModal('Odayı sil', `
    <p class="lead"><b>${esc(code)}</b> odası ve içindeki oyun <b>herkes için kalıcı olarak silinecek</b>. Odadaki cihazlar yerel masalarına döner. Bu geri alınamaz.</p>
    <label class="sw"><input type="checkbox" id="rdOk"><i></i>Onaylıyorum, odayı silmek istiyorum</label>
    <div class="row-btns"><button class="btn warn" id="rdGo" disabled>Odayı sil</button><button class="btn ghost" id="rdNo">Vazgeç</button></div>`, () => {
    $('rdOk').onchange = e => { $('rdGo').disabled = !e.target.checked; };
    $('rdNo').onclick = openRoomPanel;
    $('rdGo').onclick = async () => {
      try { await deleteRoom(code); toast(`${code} silindi`); } catch (e) { toast(e === 'offline' ? 'İnternet yok, oda silinemedi.' : 'Silinemedi: ' + (e && (e.code || e.message) || e), 5000); }
      openRoomPanel();
    };
  });
}

// ---- hatırlatıcı seçici ----
let remAll = false, remMulti = true;
// Tablada olanların hatırlatıcıları ekrana kaydırmadan sığsın (sütun sayısı artar, simge küçülür; en az 54px).
// "Tümünü göster" açıkken makul boyutta kalır ve kaydırılır.
function fitRemGrid(g) {
  if (!g) return;
  g.style.gridTemplateColumns = '';
  if (g.classList.contains('all')) return;
  const n = g.children.length, w = g.clientWidth, gap = 8;
  const avail = Math.max(160, window.innerHeight - 300);
  for (let c = 3; c <= 8; c++) {
    const s = (w - gap * (c - 1)) / c;
    if (s < 54) break;
    g.style.gridTemplateColumns = `repeat(${c}, 1fr)`;
    if (Math.ceil(n / c) * (s + gap) <= avail) break;
  }
}
function pickReminder(ownerId, back) {
  const render = () => {
    const play = [...inPlay()];
    const src = remAll ? [...new Set([...play, ...scriptIds()])] : play;
    const items = [];
    const seen = new Set();
    const push = (rid, text) => { const k = rid + '|' + text; if (!seen.has(k)) { seen.add(k); items.push({ rid, text }); } };
    src.forEach(rid => role(rid).reminders.forEach(t => push(rid, t)));
    scriptIds().forEach(rid => role(rid).remindersGlobal.forEach(t => push(rid, t)));
    const owner = ownerId && tokById(ownerId);
    openModal(owner ? `Hatırlatıcı · ${esc(RN(owner.role))}` : 'Hatırlatıcı Seç', `
      <div class="rem-scroll${remAll ? ' all' : ''}"><div class="rem-grid${remAll ? ' all' : ''}">
        <button class="rpk good" data-t="İyi takım" data-g="👍" data-tone="good"><span class="rtxt">${glyphHTML('👍')}</span><svg viewBox="0 0 100 100" aria-hidden="true">${arcText('İyi takım', 'arcB', 13.5)}</svg></button>
        <button class="rpk evil" data-t="Kötü takım" data-g="👎" data-tone="evil"><span class="rtxt">${glyphHTML('👎')}</span><svg viewBox="0 0 100 100" aria-hidden="true">${arcText('Kötü takım', 'arcB', 13.5)}</svg></button>
        ${items.map(x => `<button class="rpk" data-t="${esc(x.text)}" data-r="${x.rid}">${icon(x.rid, 'ic')}<svg viewBox="0 0 100 100" aria-hidden="true">${arcText(RN(x.rid), 'arcT', 13)}${arcText(remTr(x.text), 'arcB', 13.5)}</svg></button>`).join('')}
      </div></div>
      ${items.length ? '' : '<p class="muted small">Tablada hatırlatıcısı olan karakter yok. "Tüm hatırlatıcıları göster"i aç.</p>'}
      <div class="row-in"><input id="rmCustom" placeholder="Kendi hatırlatıcını yaz"><button class="btn small" id="rmCustomOk">Ekle</button></div>
      <label class="sw"><input type="checkbox" id="rmAll" ${remAll ? 'checked' : ''}><i></i>Tüm hatırlatıcıları göster</label>
      <label class="sw"><input type="checkbox" id="rmMulti" ${remMulti ? 'checked' : ''}><i></i>Birden fazla ekle</label>`, body => {
      $('rmAll').onchange = e => { remAll = e.target.checked; render(); };
      fitRemGrid(body.querySelector('.rem-grid'));
      $('rmMulti').onchange = e => { remMulti = e.target.checked; };
      const add = (text, rid, glyph, tone) => {
        commit(S => {
          const o = ownerId && S.tokens.find(x => x.id === ownerId);
          const [x, y] = o ? remSpot(o) : freeSpot('rem');
          S.tokens.push({ id: uid(), kind: 'rem', role: rid || null, text, owner: o ? o.id : null, x, y, glyph: glyph || '', tone: tone || '' });
        });
        if (remMulti) toast(`${remTr(text)} eklendi`); else closeModal();
      };
      $('rmCustomOk').onclick = () => { const v = $('rmCustom').value.trim(); if (v) add(v, null, '✎'); };
      body.querySelector('.rem-grid').onclick = e => { const b = e.target.closest('[data-t]'); if (b) add(b.dataset.t, b.dataset.r, b.dataset.g, b.dataset.tone); };
    }, { back });
  };
  render();
}

// ---- blöfler ----
function renderBluffs() {
  $('bluffs').innerHTML = G.S.bluffs.map((id, i) => id
    ? `<button class="bslot t-${role(id).team}" data-b="${i}">${icon(id, 'ic big')}<span>${esc(RN(id))}</span></button>`
    : `<button class="bslot empty" data-b="${i}"><span class="plus">+</span></button>`).join('');
}
function pickBluff(i) {
  const play = inPlay();
  const used = new Set(G.S.bluffs.filter((x, j) => x && j !== i));
  const ids = scriptIds().filter(id => GOOD.has(role(id).team) && !play.has(id) && !used.has(id));
  pickRole({ title: `${i + 1}. blöf`, ids, allowNone: true, noneText: i > 2 ? 'Bu yuvayı kaldır' : 'Boş bırak' }, rid => {
    commit(S => { if (!rid && i > 2) S.bluffs.splice(i, 1); else S.bluffs[i] = rid || null; });
    closeModal();
  });
}

// ---- tabla araçları ----
function renderToolbar() {
  const b = G.S.board;
  $('boardTools').hidden = !b.tools;
  $('bTools').textContent = b.tools ? '▴ Blöfler ve araçları gizle' : '▾ Blöfler ve araçları göster';
  $('bHide').textContent = b.hidden ? "Grimoire'ı göster" : "Grimoire'ı gizle";
  $('optNums').checked = b.nums;
  $('optRole').value = b.roleScale; $('oRole').textContent = (+b.roleScale).toFixed(2);
  $('optRem').value = b.remScale; $('oRem').textContent = (+b.remScale).toFixed(2);
}
function toggleFull() {
  const w = $('boardWrap'), on = !w.classList.contains('full');
  if (!on && w.classList.contains('stepping')) { stepFull = false; closeStepper(); }
  w.classList.toggle('full', on);
  document.body.classList.toggle('noscroll', on);
  $('wrapFull').textContent = on ? '✕' : '⛶';
  renderBoard();
}

// ================= 3. GECE SIRASI =================
const STRUCT = {
  dusk: ['Alacakaranlık', 'Gece başlar: tüm oyuncular gözlerini kapatır. Varsa önce Gezgin ve Efsanevi etkileri.'],
  minioninfo: ['Minyon bilgisi', '7 ve üzeri oyuncuda: Minyonları uyandır, birbirlerini görsünler. "Bu İblis" kartını göster ve İblis\'i işaret et.'],
  demoninfo: ['İblis bilgisi', '7 ve üzeri oyuncuda: İblis\'i uyandır, "Bunlar Minyonların" kartıyla Minyonları işaret et. Sonra "Bu karakterler oyunda yok" kartıyla 3 blöfü göster.'],
  dawn: ['Şafak', 'Birkaç saniye bekle, herkesi uyandır ve gece ölenleri açıkla (nasıl öldüklerini söyleme).'],
};
function renderNight() {
  const S = G.S, D = G.D, tab = S.night.tab;
  $('secNight').dataset.tab = tab;
  document.querySelectorAll('#nightTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('optDead').checked = S.night.showDead; $('optOut').checked = S.night.showOut;
  const list = tab === 'first' ? D.night.firstNight : D.night.otherNight;
  const toks = boardRoles();
  const script = new Set(scriptIds());
  const done = new Set(S.night.done[tab] || []);
  const players = toks.filter(t => !t.st && role(t.role).team !== 'fabled' && role(t.role).team !== 'traveller').length;
  let n = 0;
  const rows = [];
  for (const id of list) {
    if (id === 'dusk' || id === 'dawn') continue; // Alacakaranlık / Şafak satırları gösterilmez
    if (STRUCT[id]) {
      const [nm, txt] = STRUCT[id];
      const dim = (id === 'minioninfo' || id === 'demoninfo') && players < 7;
      rows.push(`<div class="ne struct${done.has(id) ? ' done' : ''}${dim ? ' dim' : ''}" data-k="${id}"><span class="ne-ic s-${id}"></span><div><b class="ne-t">${nm}</b><p>${esc(txt)}</p></div></div>`);
      continue;
    }
    const txt = tab === 'first' ? role(id).first : role(id).other;
    if (!txt) continue;
    const mine = toks.filter(t => t.role === id);
    const playing = mine.length > 0;
    if (!playing && !(S.night.showOut && script.has(id))) continue;
    const allDead = playing && mine.every(t => t.dead);
    if (allDead && !S.night.showDead) { n++; continue; }
    const num = playing ? ++n : '';
    const warn = [];
    mine.forEach(t => impairOf(t).forEach(i => warn.push(`<span class="rw imp">⚠ ${i.kind.toLocaleUpperCase('tr')}${t.name ? ' · ' + esc(t.name) : ''}${i.src && i.src !== 'drunk' ? ` <small>(${esc(RN(i.src))})</small>` : ''} — bilgi yanlış olabilir, yeteneği çalışmaz</span>`)));
    mine.forEach(t => G.S.tokens.filter(x => x.kind === 'rem' && x.owner === t.id).forEach(x => {
      if (/^(poisoned|drunk( \d)?|is the drunk)$/i.test(String(x.text).trim())) return; // üstte mor uyarı olarak var
      const nm = x.role ? `${RN(x.role)} – ${remTr(x.text)}` : remTr(x.text);
      warn.push(`<span class="rw" style="--gc:${colorOf(t.id)}">⚠ ${esc(nm)}${mine.length > 1 && t.name ? ` <small>(${esc(t.name)})</small>` : ''}</span>`);
    }));
    if (id === 'fanggu' && playing && !allDead) {
      const outs = toks.filter(t => role(t.role).team === 'outsider' && !t.dead).map(t => `${esc(RN(t.role))}${t.name ? ` (${esc(t.name)})` : ''}`);
      warn.push(S.fangguDone
        ? '<span class="rw fg">✔ Dönüşüm yapıldı: Yabancılar artık normal ölür</span>'
        : `<span class="rw fg">⚠ Yabancı seçerse (ilk kez): Fang Gu ölür, o oyuncu Fang Gu olur!${outs.length ? ' Yabancılar: <b>' + outs.join(', ') + '</b>' : ''}</span>`);
    }
    const who = mine.map(t => t.st ? '🎩 Sen' : `${t.name ? esc(t.name) : '—'}${t.dead ? ' †' : ''}`).join(', ');
    rows.push(`<div class="ne t-${role(id).team}${done.has(id) ? ' done' : ''}${playing ? '' : ' out'}${allDead ? ' dead' : ''}" data-k="${id}">
      ${icon(id, 'ic')}<div><b class="ne-t">${num && S.board.nums ? `<span class="nn">${num}</span>` : ''}${esc(RN(id))}${playing && who !== '—' ? ` <small>· ${who}</small>` : ''}</b><p>${rich(txt)}</p>${warn.length ? `<div class="rws">${warn.join('')}</div>` : ''}</div></div>`);
  }
  // Yanında hatırlatıcı token'ı olan tüm roller: en üstte "Hatırlatmalar"
  const rem = [];
  const seenR = new Set();
  toks.forEach(t => {
    if (seenR.has(t.role)) return;
    const mine = toks.filter(x => x.role === t.role);
    const rts = [];
    mine.forEach(m => G.S.tokens.filter(x => x.kind === 'rem' && x.owner === m.id).forEach(x => rts.push({ m, x })));
    if (!rts.length) return;
    seenR.add(t.role);
    const allDead = mine.every(m => m.dead);
    if (allDead && !S.night.showDead) return;
    const chips = rts.map(({ m, x }) => {
      const nm = x.role ? `${RN(x.role)} – ${remTr(x.text)}` : remTr(x.text);
      return `<span class="rw" style="--gc:${colorOf(m.id)}">⚠ ${esc(nm)}${mine.length > 1 && m.name ? ` <small>(${esc(m.name)})</small>` : ''}</span>`;
    }).join('');
    const who = mine.map(m => `${m.name ? esc(m.name) : '—'}${m.dead ? ' †' : ''}`).join(', ');
    rem.push(`<div class="ne t-${role(t.role).team}${done.has(t.role) ? ' done' : ''}${allDead ? ' dead' : ''}" data-k="${t.role}">
      ${icon(t.role, 'ic')}<div><b class="ne-t">${esc(RN(t.role))}${who !== '—' ? ` <small>· ${who}</small>` : ''}</b><div class="rws">${chips}</div></div></div>`);
  });
  $('nightList').innerHTML = rows.join('') || '<p class="muted pad">Bu gece uyanan karakter yok.</p>';
}

// Gece sırasında rol açıklaması: herhangi bir yere dokununca kapanır
function rolePop(id) {
  let el = $('rolePop');
  if (!el) {
    el = document.createElement('div'); el.id = 'rolePop'; el.className = 'rpop'; el.hidden = true;
    el.addEventListener('click', () => { el.hidden = true; });
    document.body.appendChild(el);
  }
  const r = role(id);
  el.innerHTML = `<div class="rpop-c t-${r.team}">${icon(id, 'ic big')}<b>${esc(r.name)}</b><span class="team">${TEAM_TR[r.team] || r.team}</span>
    <p>${rich(r.ability) || '<span class="muted">Yetenek metni yok.</span>'}</p><small>Kapatmak için dokun</small></div>`;
  el.hidden = false;
}

// ================= 4. DİĞER =================
const INFOS = [
  ['demon', 'Bu İblis', 'c-evil'], ['minions', 'Bunlar Minyonlarınız', 'c-evil'],
  ['bluffs', 'Bu karakterler oyunda yok', 'c-blue'], ['selected', 'Bu karakter seni seçti', 'c-green'],
  ['player', 'Bu oyuncu şudur', 'c-pink'], ['youare', 'Sen şusun', 'c-purple'],
  ['use', 'Yeteneğini kullanmak istiyor musun?', 'c-brown'], ['choose', 'Bir seçim yap', 'c-brown'],
  ['nom', 'Bugün aday gösterdin mi?', 'c-sand'], ['voted', 'Bugün oy verdin mi?', 'c-sand'],
];
const hhmm = ts => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
function renderChat() {
  const inRoom = !!currentRoom();
  $('chatBox').hidden = !inRoom; $('notesBox').hidden = inRoom; $('jChat').hidden = !inRoom;
  if (!inRoom) return;
  $('chatRoom').textContent = '· ' + currentRoom();
  const log = $('chatLog'), me = chatMe(), msgs = getChat();
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.innerHTML = msgs.length ? msgs.map(m => `<div class="cm ${m.u === me ? 'me' : 'ot'}">${m.u === me ? '' : `<b>${esc(m.n)}</b>`}<span>${esc(m.x)}</span><small>${hhmm(m.ts)}</small></div>`).join('')
    : '<p class="muted small chat-empty">Henüz mesaj yok. Yazdıkların sadece bu odadakilere gider.</p>';
  if (stick) log.scrollTop = log.scrollHeight;
}
// Sohbet bildirimi: üstte kalır, dokunana kadar kapanmaz; birden fazlaysa alt alta dizilir
function chatAlert(m) {
  let box = $('chatAlerts');
  if (!box) { box = document.createElement('div'); box.id = 'chatAlerts'; box.className = 'chat-alerts'; document.body.appendChild(box); }
  const b = document.createElement('button');
  b.className = 'chat-alert';
  b.innerHTML = `<b>${esc(m.n)}</b><span>${esc(m.x)}</span><small>dokun, kapat</small>`;
  b.onclick = () => b.remove();
  box.appendChild(b);
  while (box.children.length > 4) box.firstChild.remove();
}
function startChat() {
  setChatHook((all, fresh) => {
    renderChat();
    fresh.forEach(m => chatAlert(m));
  });
  $('chatForm').onsubmit = async e => { e.preventDefault(); const v = $('chatText').value; if (!v.trim()) return; $('chatText').value = ''; const r = await sendChat(v); if (r !== true) { $('chatText').value = v; toast(r === 'offline' ? 'İnternet yok, mesaj gönderilemedi.' : 'Mesaj gönderilemedi.'); } const l = $('chatLog'); l.scrollTop = l.scrollHeight; };
}
function renderMore() {
  $('infoGrid').innerHTML = INFOS.map(([k, t, c]) => `<button class="btn info ${c}" data-info="${k}">${esc(t)}</button>`).join('')
    + G.S.customInfo.map((t, i) => `<span class="info-c"><button class="btn info c-teal" data-ci="${i}">${esc(t)}</button><button class="ib sm" data-cdel="${i}" aria-label="Sil">✕</button></span>`).join('');
  if (document.activeElement !== $('notes')) $('notes').value = G.S.notes || '';
  renderChat();
}
function showInfo(k) {
  const text = INFOS.find(x => x[0] === k)[1];
  const card = (roles = []) => showFull(`<h1>${esc(text)}</h1>${roles.length ? `<div class="show-roles">${roles.map(bigTok).join('')}</div>` : ''}`, roles.length ? 'info-show' : 'info-show big-text');
  if (k === 'bluffs') return card(G.S.bluffs.filter(Boolean));
  if (['selected', 'player', 'youare'].includes(k)) return pickRole({ title: text }, rid => { closeModal(); card([rid]); });
  card();
}

// ================= bağlantılar =================
function wire() {
  document.querySelectorAll('.pane-h').forEach(b => b.onclick = () => commit(S => { S.open[b.dataset.pane] = !S.open[b.dataset.pane]; }, true));
  // kurulum
  $('bScript').onclick = openScripts;
  $('bChars').onclick = openChars;
  $('bDeal').onclick = openDeal;
  $('bSheet').onclick = openSheet;
  $('bNames').onclick = () => nameFlow();
  $('bNames2').onclick = () => nameFlow();
  // tabla
  $('wrapLock').onclick = () => { commit(S => { S.board.locked = !S.board.locked; }, true); toast(G.S.board.locked ? 'Karakter simgeleri kilitlendi' : 'Kilit açıldı'); };
  $('wrapUndo').onclick = () => { if (!undo()) toast('Geri alınacak bir şey yok.'); };
  $('wrapFull').onclick = toggleFull;
  $('veil').onclick = () => commit(S => { S.board.hidden = false; }, true);
  $('bTools').onclick = () => commit(S => { S.board.tools = !S.board.tools; }, true);
  $('bHide').onclick = () => commit(S => { S.board.hidden = !S.board.hidden; }, true);
  $('bHeight').onclick = () => commit(S => { S.board.ratio = 0; }, true);
  $('bClear').onclick = () => confirmBox('Tabladaki tüm simgeler, hatırlatıcılar, isimler, blöfler ve oyun günlüğü silinsin, evre Gece 1\'e dönsün mü? (Senaryo ve ayarlar kalır.)' + (currentRoom() ? ' DİKKAT: ortak oda bağlı, diğer cihazda da silinir.' : ''), 'Temizle', () => {
    commit(S => { S.tokens = []; S.fangguDone = false; S.bluffs = [null, null, null]; S.night.done = { first: [], other: [] }; S.phase = { n: 1, day: false }; S.log = []; S.night.tab = 'first'; });
  });
  $('bAddTok').onclick = () => pickRole({ title: 'Simge ekle' }, rid => { commit(() => { addRoleToken(rid); }); closeModal(); });
  $('bAddTrav').onclick = () => pickRole({ title: 'Gezgin ekle', team: 'traveller' }, rid => { commit(() => { addRoleToken(rid); }); closeModal(); });
  $('bAddFab').onclick = () => pickRole({ title: 'Efsanevi ekle', team: 'fabled', startAll: true }, rid => { commit(() => { addRoleToken(rid); }); closeModal(); });
  $('bAddRem').onclick = () => pickReminder(null);
  $('bluffs').onclick = e => { const b = e.target.closest('[data-b]'); if (b) pickBluff(+b.dataset.b); };
  $('bBluffAdd').onclick = () => commit(S => { S.bluffs.push(null); });
  $('bBluffShow').onclick = () => showInfo('bluffs');
  $('syncDot').onclick = openRoomPanel;
  $('bSync').onclick = openRoomPanel;
  $('optNums').onchange = e => commit(S => { S.board.nums = e.target.checked; }, true);
  $('optRole').oninput = e => commit(S => { S.board.roleScale = +e.target.value; }, true);
  $('optRem').oninput = e => commit(S => { S.board.remScale = +e.target.value; }, true);
  window.addEventListener('resize', () => { if ($('boardWrap').classList.contains('full')) renderBoard(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('modal').hidden) closeModal(); else if ($('boardWrap').classList.contains('full')) toggleFull(); } });
  // gece
  $('nightTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) commit(S => { S.night.tab = b.dataset.tab; }, true); };
  $('optDead').onchange = e => commit(S => { S.night.showDead = e.target.checked; }, true);
  $('optOut').onchange = e => commit(S => { S.night.showOut = e.target.checked; }, true);
  $('bStep').onclick = () => {
    if (curPhase().day) phaseStep(1); // gündüzden: sonraki geceye geç (sonraki geceler sırası, işaretler sıfır)
    else { const t = curPhase().n === 1 ? 'first' : 'other'; if (G.S.night.tab !== t) commit(S => { S.night.tab = t; }, true); }
    openStepper();
  };
  // alt çubuk: sayfa aynı kalır, düğmeler ilgili bölüme kaydırır (kapalıysa açar)
  document.querySelectorAll('#botbar [data-go]').forEach(b => b.onclick = () => {
    const [pane, el] = b.dataset.go.split('|');
    if (G.S.open[pane]) commit(S => { S.open[pane] = false; }, true);
    setTimeout(() => { const t = $(el); const y = t.getBoundingClientRect().top + window.scrollY - $('top').offsetHeight - 8; window.scrollTo({ top: y, behavior: 'smooth' }); }, 30);
  });
  $('phNext').onclick = () => phaseStep(1);
  $('phPrev').onclick = () => phaseStep(-1);
  $('phNow').onclick = openLog;
  $('bNightReset').onclick = () => commit(S => { S.night.done[S.night.tab] = []; }, true);
  $('nightList').onclick = e => {
    const row = e.target.closest('[data-k]'); if (!row) return;
    const k = row.dataset.k;
    // sembole dokununca rolün açıklaması (yapıldı işareti değişmez)
    if (!row.classList.contains('struct') && e.target.closest('.ic')) return rolePop(k);
    commit(S => { const d = S.night.done[S.night.tab]; const i = d.indexOf(k); if (i < 0) d.push(k); else d.splice(i, 1); }, true);
  };
  // diğer
  $('infoGrid').onclick = e => {
    const del = e.target.closest('[data-cdel]');
    if (del) return commit(S => { S.customInfo.splice(+del.dataset.cdel, 1); }, true);
    const c = e.target.closest('[data-ci]');
    if (c) return showFull(`<h1>${esc(G.S.customInfo[+c.dataset.ci])}</h1>`, 'info-show');
    const b = e.target.closest('[data-info]'); if (b) showInfo(b.dataset.info);
  };
  $('bInfoAdd').onclick = () => { const v = $('infoNew').value.trim(); if (!v) return; commit(S => { S.customInfo.push(v); }, true); $('infoNew').value = ''; };
  let nt;
  $('notes').oninput = e => { clearTimeout(nt); const v = e.target.value; nt = setTimeout(() => { G.S.notes = v; save(); }, 300); };
  startChat();
  $('jChat').onclick = e => { e.preventDefault(); if (G.S.open.more) commit(S => { S.open.more = false; }, true); $('chatBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  $('bNotesClear').onclick = () => confirmBox('Notlar silinsin mi?', 'Sil', () => commit(S => { S.notes = ''; }, true));
  $('bExport').onclick = () => {
    const blob = new Blob([JSON.stringify(G.S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `grimoire-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('bImport').onclick = () => $('fImport').click();
  $('fImport').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!s || s.v !== 1 || !Array.isArray(s.tokens)) throw 0;
      confirmBox('Mevcut oyun içe aktarılan dosyayla değiştirilsin mi?', 'Değiştir', () => {
        commit(S => { Object.keys(S).forEach(k => delete S[k]); Object.assign(S, s); });
        load(); emit();
      });
    } catch (err) { toast('Dosya okunamadı.'); }
    e.target.value = '';
  };
  $('bReload').onclick = async () => { toast('Yenileniyor…'); G.D = await loadData(); renderAll(); toast(G.D.offline ? "Sheet'e ulaşılamadı." : 'Güncellendi.'); };
  $('bLogout').onclick = () => confirmBox('Çıkış yapılsın mı? (Oyun bu cihazda kayıtlı kalır.)', 'Çıkış yap', () => auth.signOut(), { danger: false });
}
