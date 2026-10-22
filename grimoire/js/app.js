// Giriş noktası: oturum, veri, ekranlar, Masa/Panel sayfalama, üst bar.
import { loadData } from './data.js?v=20261023-0135';
import * as store from './store.js?v=20261023-0135';
import { G, hooks, $, closeSheet, refreshSheet, resetNS, toast, unhtml } from './core.js?v=20261023-0135';
import { describe } from './describe.js?v=20261023-0135';
import { startSetup } from './setup.js?v=20261023-0135';
import { renderBoard, clickBlocked } from './board.js?v=20261023-0135';
import * as panel from './panel.js?v=20261023-0135';
import * as sheets from './sheets.js?v=20261023-0135';

export const VERSION = '20261023-0135';
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
  setDrawer(true);
  renderAll();
}

// ---------------- çekmece (panel üstten açılır) ----------------
const drawer = $('drawer');
function setDrawer(open) { G.drawer = !!open; drawer.hidden = !G.drawer; $('strip').classList.toggle('open', G.drawer); if (G.drawer) drawer.scrollTop = 0; }
G.drawer = true;
new ResizeObserver(() => { if (!$('game').hidden && G.S) renderAll(); }).observe($('board'));

// ---------------- çizim ----------------
let rendering = false;
function renderAll() {
  const S = G.S; if (!S || rendering) return;
  rendering = true;
  try {
    const pk = store.phaseKey(S.phase) + (S.pre ? ':pre' : '');
    if (lastPhase !== pk) { lastPhase = pk; resetNS(); G.DS.mode = null; }
    mergeCustom();
    const sm = panel.summary();
    $('phaseTxt').textContent = S.pre ? 'İlk gece öncesi' : (S.phase.kind === 'night' ? '☾ ' : '☀ ') + store.phaseLabel(S.phase);
    $('phaseSub').textContent = S.result ? 'Oyun bitti' : S.script;
    $('undoBtn').disabled = store.getEvents().length <= 1;
    $('editDoneBtn').hidden = !G.edit;
    if (G.edit) $('phaseSub').textContent = 'Yerleri düzenle: sürükle-bırak';
    $('strip').innerHTML = panel.stripHTML();
    drawer.hidden = !G.drawer;
    renderBoard(panel.centerHTML());
    panel.renderPanel();
    refreshSheet();
  } finally { rendering = false; }
}

// Masadaki koltuğa dokunma
$('board').addEventListener('click', e => {
  const seat = e.target.closest('.seat'); if (!seat || !e.target.closest('.disc') || e.target.closest('[data-c]')) return;
  if (clickBlocked()) return;
  if (G.edit || G.S.pre) return sheets.openPlayer(seat.dataset.pid);
  panel.tapSeat(seat.dataset.pid);
});

// ---------------- üst bar ----------------
// Şerit: düğmeleri panel işler, geri kalanı çekmeceyi aç/kapat
$('strip').addEventListener('click', e => { if (e.target.closest('[data-c]')) return; setDrawer(!G.drawer); });
drawer.addEventListener('click', e => { if (e.target.closest('.drawer-grip')) setDrawer(false); });
$('game').querySelector('.bar').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'undo') doUndo();
  if (a === 'menu') sheets.openMenu();
  if (a === 'steps') panel.openSteps();
  if (a === 'editDone') { G.edit = false; renderAll(); }
});
function doUndo() {
  const evs = store.getEvents(); if (evs.length <= 1) return;
  const before = G.S, last = evs[evs.length - 1];
  let txt = last.type;
  try { txt = unhtml(describe(last, before)); } catch (e) {}
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
  renderAll, openDrawer: () => setDrawer(true), closeDrawer: () => setDrawer(false), version: () => VERSION,
  targeting: panel.targeting, actor: panel.actorId, selIndex: panel.selIndex, pickMode: () => (G.DS.mode?.pick ? G.DS.mode : null),
  openPlayer: sheets.openPlayer, pickRole: sheets.pickRole, pickReminder: sheets.pickReminder, showToken: sheets.showToken, showCard: sheets.showCard,
  openLog: sheets.openLog, openSteps: panel.openSteps, execute: panel.execute, afterEffects: panel.afterEffects, marks: () => panel.MARKS,
});
