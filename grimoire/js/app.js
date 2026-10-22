// Giriş noktası: oturum, veri, ekranlar, Masa/Panel sayfalama, üst bar.
import { loadData } from './data.js?v=20261022-2247';
import * as store from './store.js?v=20261022-2247';
import { G, hooks, $, closeSheet, refreshSheet, resetNS, toast } from './core.js?v=20261022-2247';
import { describe } from './describe.js?v=20261022-2247';
import { startSetup } from './setup.js?v=20261022-2247';
import { renderBoard, clickBlocked } from './board.js?v=20261022-2247';
import * as panel from './panel.js?v=20261022-2247';
import * as sheets from './sheets.js?v=20261022-2247';

export const VERSION = '20261022-2247';
const show = id => ['boot', 'login', 'setup', 'game'].forEach(x => { $(x).hidden = x !== id; });

// ---------------- açılış ----------------
const auth = firebase.auth();
auth.onAuthStateChanged(async user => {
  if (!user) { show('login'); return; }
  show('boot');
  try { G.D = await loadData(); }
  catch (e) { $('boot').textContent = e.message; return; }
  store.load();
  store.subscribe(onState);
  G.S = store.state();
  if (G.S) startGame(); else { show('setup'); startSetup(); }
});
$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('lErr').hidden = true;
  try { await auth.signInWithEmailAndPassword($('lEmail').value.trim(), $('lPass').value); }
  catch (err) { $('lErr').hidden = false; }
};

let lastPhase = '';
function onState(st) {
  G.S = st;
  if (!st) { closeSheet(); G.DS.mode = null; resetNS(); show('setup'); startSetup(true); return; }
  if ($('game').hidden) startGame(); else renderAll();
}

function mergeCustom() { const S = G.S; if (S?.customRoles) for (const [k, v] of Object.entries(S.customRoles)) if (!G.D.roles[k]) G.D.roles[k] = v; }
function startGame() {
  mergeCustom(); show('game'); closeSheet();
  curPane = 0; pager.scrollTop = 0;
  renderAll();
}

// ---------------- Masa / Panel ----------------
const pager = $('pager');
const splitPref = () => { try { return localStorage.getItem('tg-grim-split'); } catch (e) { return null; } };
const splitOn = () => { const p = splitPref(); return p === 'on' || (p !== 'off' && innerWidth > innerHeight && innerWidth >= 900); };
let curPane = 0;
function applyLayout() {
  const sp = splitOn();
  if (pager.classList.contains('split') !== sp) pager.classList.toggle('split', sp);
  pager.classList.toggle('editing', !!G.edit);
  updSeg();
}
function updSeg() { document.querySelectorAll('#seg [data-pg]').forEach(b => b.classList.toggle('on', +b.dataset.pg === curPane)); }
function goPane(i) { if (splitOn()) return; curPane = i; updSeg(); pager.scrollTo({ top: i * pager.clientHeight, behavior: 'smooth' }); }
pager.addEventListener('scroll', () => { if (splitOn()) return; const i = pager.scrollTop > pager.clientHeight / 2 ? 1 : 0; if (i !== curPane) { curPane = i; updSeg(); } }, { passive: true });
addEventListener('resize', () => { if (!G.S || $('game').hidden) return; applyLayout(); if (!splitOn()) pager.scrollTop = curPane * pager.clientHeight; });
new ResizeObserver(() => { if (!$('game').hidden && G.S) renderAll(); }).observe($('board'));
$('seg').addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (b) goPane(+b.dataset.pg); });

// ---------------- çizim ----------------
let rendering = false;
function renderAll() {
  const S = G.S; if (!S || rendering) return;
  rendering = true;
  try {
    const pk = store.phaseKey(S.phase);
    if (lastPhase !== pk) { lastPhase = pk; resetNS(); G.DS.mode = null; }
    mergeCustom();
    const sm = panel.summary();
    $('phaseTxt').textContent = (S.phase.kind === 'night' ? '☾ ' : '☀ ') + store.phaseLabel(S.phase);
    $('phaseSub').textContent = S.phase.kind === 'night' ? sm.sub : (S.result ? 'Oyun bitti' : S.script);
    $('undoBtn').disabled = store.getEvents().length <= 1;
    $('editDoneBtn').hidden = !G.edit; $('seg').hidden = !!G.edit;
    if (G.edit) $('phaseSub').textContent = 'Yerleri düzenle: sürükle-bırak';
    applyLayout();
    renderBoard(panel.centerHTML());
    panel.renderPanel();
    refreshSheet();
  } finally { rendering = false; }
}

// Masadaki koltuğa dokunma
$('board').addEventListener('click', e => {
  const seat = e.target.closest('.seat'); if (!seat || e.target.closest('[data-c]')) return;
  if (clickBlocked()) return;
  if (G.edit) return sheets.openPlayer(seat.dataset.pid);
  panel.tapSeat(seat.dataset.pid);
});

// ---------------- üst bar ----------------
$('game').querySelector('.bar').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'undo') doUndo();
  if (a === 'menu') sheets.openMenu();
  if (a === 'steps') panel.openSteps();
  if (a === 'editDone') { G.edit = false; renderAll(); goPane(1); }
});
function doUndo() {
  const evs = store.getEvents(); if (evs.length <= 1) return;
  const before = G.S, last = evs[evs.length - 1];
  let txt = last.type;
  try { txt = describe(last, before).replace(/<[^>]+>/g, ''); } catch (e) {}
  store.undo();
  toast('Geri alındı: ' + txt);
}

// ---------------- yeni sürüm uyarısı ----------------
async function checkVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (v && v !== VERSION && VERSION !== '__V__') {
      const el = $('update');
      el.innerHTML = `<span>Yeni sürüm hazır</span><button id="updBtn">Yenile</button>`;
      el.hidden = false;
      $('updBtn').onclick = () => location.reload();
    }
  } catch (e) {}
}
checkVersion();
setInterval(checkVersion, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

// ---------------- kancalar ----------------
Object.assign(hooks, {
  renderAll, goPanel: () => goPane(1), goTable: () => goPane(0), splitPref, version: () => VERSION,
  targeting: panel.targeting, actor: panel.actorId, selIndex: panel.selIndex, pickMode: () => (G.DS.mode?.pick ? G.DS.mode : null),
  openPlayer: sheets.openPlayer, pickRole: sheets.pickRole, pickReminder: sheets.pickReminder, showToken: sheets.showToken, showCard: sheets.showCard,
  openLog: sheets.openLog, openSteps: panel.openSteps, execute: panel.execute, afterEffects: panel.afterEffects, marks: () => panel.MARKS,
});
