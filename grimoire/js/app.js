import { loadData, iconUrl, TEAMS, TEAM_TR, DIST } from './data.js';
import * as store from './store.js';
import { layout, nearestSeat, defaultSides } from './table.js';

// ---------- yardımcılar ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const show = id => ['boot', 'login', 'setup', 'game'].forEach(x => { $(x).hidden = x !== id; });

// Resmi hatırlatıcı token adlarının TR karşılıkları. Burada olmayanlar İngilizce görünür.
const REM_TR = {
  Poisoned: 'Zehirli', Drunk: 'Sarhoş', Dead: 'Ölü', Protected: 'Korunuyor', Safe: 'Güvende',
  Used: 'Kullanıldı', 'No ability': 'Yeteneği yok', Mad: 'Deli', Townsfolk: 'Kasabalı',
  Outsider: 'Yabancı', Minion: 'Minyon', Demon: 'İblis', Wrong: 'Yanlış', Grandchild: 'Torun',
  Executed: 'İdam edildi', Once: 'Bir kez',
};
const remTr = t => REM_TR[t] || t;
// Kendini başka rol sanan roller ve sandıkları rolün takımı
const BELIEVES = { drunk: 'townsfolk', lunatic: 'demon', marionette: 'townsfolk' };

let D = null;            // veri
let S = null;            // oyun durumu
let locked = localStorage.getItem('tg-grim-lock') === '1';

const role = id => D.roles[id] || { id, name: id, team: 'townsfolk', ability: '', reminders: [] };
const P = id => S.players.find(p => p.id === id);
const pname = (st, id) => esc(st?.players.find(p => p.id === id)?.name || '?');
const rname = id => esc(role(id).name);

// ---------- açılış ----------
const auth = firebase.auth();
auth.onAuthStateChanged(async user => {
  if (!user) { show('login'); return; }
  show('boot');
  try { D = await loadData(); }
  catch (e) { $('boot').textContent = e.message; return; }
  store.load();
  store.subscribe(onState);
  S = store.state();
  if (S) startGame(); else startSetup();
});
$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('lErr').hidden = true;
  try { await auth.signInWithEmailAndPassword($('lEmail').value.trim(), $('lPass').value); }
  catch (err) { $('lErr').hidden = false; }
};

function onState(st, last) {
  S = st;
  if (!S) { startSetup(); return; }
  if ($('game').hidden) startGame(); else renderGame();
}

// ================= KURULUM =================
const W = { step: 1, script: null, names: [], picked: [], assign: {}, believed: {}, sides: null };

function startSetup() {
  closeSheet();
  Object.assign(W, { step: 1, script: null, picked: [], assign: {}, believed: {}, sides: null });
  try { W.names = JSON.parse(localStorage.getItem('tg-grim-names')) || []; } catch (e) { W.names = []; }
  show('setup'); renderSetup();
}

function teamGroups(ids) {
  const g = {}; TEAMS.forEach(t => g[t] = []);
  ids.forEach(id => { const t = role(id).team; (g[t] || (g[t] = [])).push(id); });
  return g;
}

function roleChip(id, { on = false, attr = '' } = {}) {
  const r = role(id);
  return `<button class="chip t-${r.team}${on ? ' on' : ''}" ${attr}>
    <img src="${iconUrl(id)}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(r.name)}</span>${r.setup ? '<i title="Kurulumu değiştirir">⚙</i>' : ''}</button>`;
}

function renderSetup() {
  const el = $('setup');
  const steps = ['Script', 'Oyuncular', 'Roller', 'Dağıtım', 'Masa'];
  let html = `<div class="setup-wrap"><div class="steps">${steps.map((s, i) => `<span class="${i + 1 === W.step ? 'cur' : i + 1 < W.step ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div>`;
  if (D.offline) html += `<p class="warn">İnternet yok: karakterler son kayıtlı kopyadan geldi.</p>`;

  if (W.step === 1) {
    html += `<h2>Script seç</h2><div class="list">` + D.scripts.map((s, i) =>
      `<button class="row-btn" data-script="${i}"><b>${esc(s.name)}</b><small>${s.roles.length} rol</small></button>`).join('') + `</div>`;
  }

  if (W.step === 2) {
    html += `<h2>Oyuncular</h2><p class="muted">Her satıra bir isim, masadaki oturma sırasıyla (sol üstten saat yönünde). Sırayı sonra masada sürükleyerek de düzeltebilirsin.</p>
      <textarea id="names" rows="12" placeholder="Ayşe&#10;Serhat&#10;…">${esc(W.names.join('\n'))}</textarea>
      <p class="muted" id="nameCount"></p>
      <div class="nav-row"><button class="btn" data-go="1">Geri</button><button class="btn primary" data-go="3" id="namesNext">Devam</button></div>`;
  }

  if (W.step === 3) {
    const n = W.names.length, pickedT = teamGroups(W.picked);
    const base = DIST[Math.min(Math.max(n - pickedT.traveller.length, 5), 15)];
    const target = { townsfolk: base[0], outsider: base[1], minion: base[2], demon: base[3] };
    const g = teamGroups(W.script.roles);
    html += `<h2>Roller <small class="muted">${W.picked.length}/${n}</small></h2>
      <div class="dist">${['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map(t =>
        `<span class="t-${t}">${TEAM_TR[t]} <b>${pickedT[t].length}${target[t] != null ? '/' + target[t] : ''}</b></span>`).join('')}</div>`;
    const setupRoles = W.picked.filter(id => role(id).setup);
    if (setupRoles.length) html += `<p class="warn">⚙ ${setupRoles.map(rname).join(', ')} kurulumu değiştirir. Sayıları ona göre ayarla.</p>`;
    html += TEAMS.filter(t => g[t].length).map(t => `<h3 class="t-${t}">${TEAM_TR[t]}</h3><div class="chips">${g[t].map(id => roleChip(id, { on: W.picked.includes(id), attr: `data-pick="${id}"` })).join('')}</div>`).join('');
    html += `<div class="nav-row"><button class="btn" data-go="2">Geri</button><button class="btn" data-act="randRoles">🎲 Rastgele öner</button>
      <button class="btn primary" data-go="4" ${W.picked.length === n ? '' : 'disabled'}>Devam</button></div>`;
  }

  if (W.step === 4) {
    html += `<h2>Dağıtım</h2><p class="muted">Rolü değiştirmek için seç. Aynı rolü başka oyuncuya verirsen ikisi yer değiştirir.</p><div class="assign">`;
    W.names.forEach(nm => {
      const rid = W.assign[nm], r = role(rid), bt = BELIEVES[rid];
      html += `<div class="as-row t-${r.team}"><span class="as-name">${esc(nm)}</span>
        <select data-assign="${esc(nm)}">${W.picked.map(id => `<option value="${id}" ${id === rid ? 'selected' : ''}>${esc(role(id).name)}</option>`).join('')}</select>`;
      if (bt) {
        const opts = W.script.roles.filter(id => role(id).team === bt && !W.picked.includes(id));
        html += `<label class="believe">Kendini sanıyor: <select data-believe="${esc(nm)}"><option value="">—</option>${opts.map(id => `<option value="${id}" ${W.believed[nm] === id ? 'selected' : ''}>${esc(role(id).name)}</option>`).join('')}</select></label>`;
      }
      html += `</div>`;
    });
    const missing = W.names.filter(nm => BELIEVES[W.assign[nm]] && !W.believed[nm]);
    html += `</div>${missing.length ? `<p class="warn">${missing.map(esc).join(', ')} için "kendini sanıyor" rolü seçilmedi.</p>` : ''}
      <div class="nav-row"><button class="btn" data-go="3">Geri</button><button class="btn" data-act="shuffle">🔀 Karıştır</button><button class="btn primary" data-go="5">Devam</button></div>`;
  }

  if (W.step === 5) {
    const n = W.names.length; W.sides = W.sides || defaultSides(n);
    const sum = Object.values(W.sides).reduce((a, b) => a + b, 0);
    html += `<h2>Masa</h2><p class="muted">Her kenarda kaç kişi oturuyor? Toplam ${n} olmalı.</p>${sidesEditor(W.sides)}
      <p class="${sum === n ? 'muted' : 'warn'}">Toplam: ${sum}/${n}</p>
      <div class="nav-row"><button class="btn" data-go="4">Geri</button><button class="btn primary" data-act="begin" ${sum === n ? '' : 'disabled'}>Oyunu başlat</button></div>`;
  }
  el.innerHTML = html + '</div>';

  if (W.step === 2) {
    const ta = $('names');
    const upd = () => {
      W.names = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      const dup = W.names.filter((x, i) => W.names.indexOf(x) !== i);
      $('nameCount').textContent = `${W.names.length} oyuncu` + (dup.length ? ` · Tekrar eden isim: ${dup.join(', ')}` : '');
      $('namesNext').disabled = W.names.length < 5 || W.names.length > 20 || dup.length > 0;
    };
    ta.oninput = upd; upd();
  }
}

function sidesEditor(sd) {
  const lbl = { top: 'Üst', right: 'Sağ', bottom: 'Alt', left: 'Sol' };
  return `<div class="sides"><div class="sides-box">${['top', 'right', 'bottom', 'left'].map(k =>
    `<div class="side side-${k}"><span>${lbl[k]}</span><div class="stepper"><button data-side="${k}" data-d="-1">−</button><b>${sd[k]}</b><button data-side="${k}" data-d="1">+</button></div></div>`).join('')}
    <div class="side-table">Masa</div></div></div>`;
}

$('setup').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.script != null) { W.script = D.scripts[+b.dataset.script]; W.picked = []; W.step = 2; return renderSetup(); }
  if (b.dataset.go) {
    const to = +b.dataset.go;
    if (to === 3 && W.step === 2) { localStorage.setItem('tg-grim-names', JSON.stringify(W.names)); W.picked = W.picked.filter(id => W.script.roles.includes(id)); }
    if (to === 4 && W.step === 3) assignRandom();
    W.step = to; return renderSetup();
  }
  if (b.dataset.pick) {
    const id = b.dataset.pick, i = W.picked.indexOf(id);
    if (i >= 0) W.picked.splice(i, 1); else W.picked.push(id);
    return renderSetup();
  }
  if (b.dataset.side) { W.sides[b.dataset.side] = Math.max(0, W.sides[b.dataset.side] + +b.dataset.d); return renderSetup(); }
  if (b.dataset.act === 'randRoles') { randomRoles(); return renderSetup(); }
  if (b.dataset.act === 'shuffle') { assignRandom(); return renderSetup(); }
  if (b.dataset.act === 'begin') return beginGame();
});
$('setup').addEventListener('change', e => {
  const s = e.target;
  if (s.dataset.assign) {
    const nm = s.dataset.assign, nr = s.value, other = W.names.find(x => W.assign[x] === nr);
    if (other && other !== nm) { W.assign[other] = W.assign[nm]; delete W.believed[other]; }
    W.assign[nm] = nr; delete W.believed[nm];
    renderSetup();
  }
  if (s.dataset.believe) { W.believed[s.dataset.believe] = s.value || undefined; renderSetup(); }
});

function randomRoles() {
  const n = W.names.length, g = teamGroups(W.script.roles);
  const base = DIST[Math.min(Math.max(n, 5), 15)];
  W.picked = [];
  ['townsfolk', 'outsider', 'minion', 'demon'].forEach((t, i) => W.picked.push(...shuffle(g[t]).slice(0, base[i])));
}
function assignRandom() {
  const roles = shuffle(W.picked); W.assign = {}; W.believed = {};
  W.names.forEach((nm, i) => { W.assign[nm] = roles[i]; });
}

function beginGame() {
  const players = W.names.map((nm, i) => ({ id: 'p' + i, name: nm, role: W.assign[nm], believed: W.believed[nm] || null }));
  const data = { script: W.script.name, scriptRoles: W.script.roles, players, sides: { ...W.sides } };
  locked = false; localStorage.setItem('tg-grim-lock', '0');
  store.reset(true);
  store.dispatch('start', data);
}

// ================= OYUN =================
function startGame() { show('game'); renderGame(); }

let L = null; // son yerleşim
const board = $('board');
new ResizeObserver(() => { if (!$('game').hidden && S) renderBoard(); }).observe(board);

function renderGame() {
  $('phaseTxt').textContent = store.phaseLabel(S.phase);
  $('phaseSub').textContent = S.script;
  $('lockBtn').textContent = locked ? '🔒' : '🔓';
  $('lockBtn').classList.toggle('on', locked);
  $('undoBtn').disabled = store.getEvents().length <= 1;
  const h = $('hint');
  h.hidden = locked;
  h.textContent = 'Oyuncuları sürükleyip yerleştir. Bitince 🔓 ile kilitle.';
  renderBoard();
  if (openPanel) openPanel();
}

function renderBoard() {
  const W0 = board.clientWidth, H0 = board.clientHeight;
  if (!W0 || !H0) return;
  L = layout(W0, H0, S.sides);
  const { S: sz, table: t } = L;
  const alive = S.players.filter(p => !p.dead).length;
  const votes = S.players.filter(p => !p.dead || p.ghost).length;
  const next = S.phase.kind === 'night' ? { kind: 'day', n: S.phase.n } : { kind: 'night', n: S.phase.n + 1 };
  let html = `<div class="tbl" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${Math.max(t.h, 40)}px">
    <div class="tbl-in"><div><b>${alive}</b> yaşıyor · <b>${votes}</b> oy · idam için <b>${Math.ceil(alive / 2)}</b></div>
    <button class="btn small" data-act="nextPhase">${S.phase.kind === 'night' ? '☀' : '☾'} ${store.phaseLabel(next)}'e geç</button></div></div>`;
  S.seats.forEach((pid, i) => {
    const p = P(pid), seat = L.seats[i]; if (!seat || !p) return;
    const r = role(p.role);
    const rem = p.reminders.slice(0, 4).map(x => `<span class="rem" title="${esc(x.text)}">${esc(remTr(x.text))}</span>`).join('') +
      (p.reminders.length > 4 ? `<span class="rem more">+${p.reminders.length - 4}</span>` : '');
    html += `<div class="tok t-${r.team}${p.dead ? ' dead' : ''}${locked ? ' locked' : ''}" data-pid="${pid}" data-seat="${i}"
      style="left:${seat.x}px;top:${seat.y}px;--s:${sz}px">
      <div class="disc"><img src="${iconUrl(p.role)}" alt="" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ini',textContent:'${esc(r.name).slice(0, 2)}'}))">
        ${p.dead ? `<i class="shroud"></i>${p.ghost ? '<i class="ghost" title="Ölü oyu var"></i>' : ''}` : ''}
        ${p.believed ? `<i class="bel" title="Kendini ${esc(role(p.believed).name)} sanıyor"><img src="${iconUrl(p.believed)}" alt="" onerror="this.remove()"></i>` : ''}
      </div>
      <div class="nm">${esc(p.name)}</div><div class="rl">${esc(r.name)}${p.believed ? ` <em>(${esc(role(p.believed).name)})</em>` : ''}</div>
      ${rem ? `<div class="rems">${rem}</div>` : ''}</div>`;
  });
  board.innerHTML = html;
  document.documentElement.style.setProperty('--toast-y', (board.getBoundingClientRect().top + t.y + 10) + 'px');
}

// ---- sürükle / dokun ----
let drag = null;
board.addEventListener('pointerdown', e => {
  const tok = e.target.closest('.tok'); if (!tok) return;
  drag = { tok, pid: tok.dataset.pid, seat: +tok.dataset.seat, x: e.clientX, y: e.clientY, moved: false };
  tok.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 8) {
    if (locked) { flashHint('Masa kilitli. Yer değiştirmek için 🔒 kilidi aç.'); drag = null; return; }
    drag.moved = true; drag.tok.classList.add('dragging');
  }
  if (drag.moved) drag.tok.style.transform = `translate(calc(-50% + ${dx}px), calc(var(--s) / -2 + ${dy}px))`;
});
board.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.moved) { openPlayer(d.pid); return; }
  const rect = board.getBoundingClientRect(), seat = L.seats[d.seat];
  const x = seat.x + (e.clientX - d.x), y = seat.y + (e.clientY - d.y);
  const to = nearestSeat(L.seats, x, y, L.S * 1.1);
  if (to >= 0 && to !== d.seat) store.dispatch('swap', { a: d.pid, b: S.seats[to] });
  else renderBoard();
});
board.addEventListener('pointercancel', () => { drag = null; renderBoard(); });
board.addEventListener('click', e => {
  const b = e.target.closest('[data-act="nextPhase"]'); if (b) nextPhase();
});

function nextPhase() {
  const next = S.phase.kind === 'night' ? { kind: 'day', n: S.phase.n } : { kind: 'night', n: S.phase.n + 1 };
  act('phase', { phase: next }, `${store.phaseLabel(next)} başladı`);
}

let hintT;
function flashHint(t) { const h = $('hint'); h.textContent = t; h.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => { if (locked) h.hidden = true; }, 2200); }

// ---- üst bar ----
$('game').querySelector('.bar').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'undo') doUndo();
  if (a === 'lock') { locked = !locked; localStorage.setItem('tg-grim-lock', locked ? '1' : '0'); renderGame(); }
  if (a === 'log') openLog();
  if (a === 'menu') openMenu();
  if (a === 'phase') openPhase();
});

// ---- eylem + geri al toast'ı ----
let toastT;
function act(type, data, msg) {
  const ev = store.dispatch(type, data);
  toast(msg, ev.id);
  return ev;
}
function toast(msg, evId) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${evId ? `<button data-undo="${evId}">Geri al</button>` : ''}`;
  t.hidden = false; clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 5000);
}
$('toast').addEventListener('click', e => {
  const b = e.target.closest('[data-undo]'); if (!b) return;
  const evs = store.getEvents();
  if (evs[evs.length - 1]?.id === b.dataset.undo) store.undo();
  else store.undoTo(b.dataset.undo); // arada başka olay olduysa onları da geri alır
  $('toast').hidden = true;
});
function doUndo() {
  const ev = store.undo();
  if (ev) toast('Geri alındı: ' + describe(ev, stateBefore(ev)).replace(/<[^>]+>/g, ''));
}
function stateBefore(ev) {
  // geri alınan olayın açıklaması için güncel durum yeterli (isimler değişmez)
  return S;
}

// ================= ALT PANEL =================
let openPanel = null;
function sheet(html, refresh = null) {
  $('sheetBody').innerHTML = html; $('sheet').hidden = false; openPanel = refresh;
}
function closeSheet() { $('sheet').hidden = true; openPanel = null; }
$('sheet').addEventListener('click', e => { if (e.target.closest('[data-act="close"]')) closeSheet(); });

function confirmBox(title, text, okLabel, onOk, danger = false) {
  const prev = openPanel;
  sheet(`<h3>${title}</h3><p>${text}</p><div class="nav-row"><button class="btn" id="cNo">Vazgeç</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cYes">${okLabel}</button></div>`);
  $('cNo').onclick = () => (prev ? prev() : closeSheet());
  $('cYes').onclick = () => { onOk(); if (openPanel === null || openPanel === prev) {} };
}

// ---- oyuncu paneli ----
function openPlayer(pid) {
  const render = () => {
    const p = P(pid); if (!p) return closeSheet();
    const r = role(p.role);
    sheet(`<div class="pp-head t-${r.team}">
        <img src="${iconUrl(p.role)}" alt="" onerror="this.style.visibility='hidden'">
        <div><h3>${esc(p.name)} <button class="link" data-p="rename">✎</button></h3>
        <div class="team">${esc(r.name)} · ${TEAM_TR[r.team] || r.team}${p.dead ? ' · <b>Ölü</b>' : ''}</div>
        ${p.believed ? `<div class="bel-line">Kendini <b>${esc(role(p.believed).name)}</b> sanıyor</div>` : ''}</div>
        <button class="ib" data-act="close">✕</button></div>
      <p class="ability">${esc(r.ability)}</p>
      <div class="grid2">
        ${p.dead ? `<button class="btn" data-p="revive">Dirilt</button>` : `<button class="btn danger" data-p="die">☠ Öldü</button>`}
        ${p.dead ? `<button class="btn ${p.ghost ? '' : 'off'}" data-p="ghost">${p.ghost ? 'Ölü oyunu kullandı' : 'Ölü oyunu geri ver'}</button>` : ''}
        <button class="btn" data-p="role">Rolü değiştir</button>
        <button class="btn" data-p="believed">Sandığı rol${p.believed ? ' ✓' : ''}</button>
        <button class="btn" data-p="remAdd">＋ Hatırlatıcı</button>
      </div>
      ${p.reminders.length ? `<h4>Hatırlatıcılar</h4><div class="rem-list">${p.reminders.map(x =>
        `<button class="rem big" data-rdel="${x.id}">${x.role ? `<img src="${iconUrl(x.role)}" alt="" onerror="this.remove()">` : ''}${esc(remTr(x.text))} ✕</button>`).join('')}</div>` : ''}`, render);
    $('sheetBody').onclick = e => {
      const b = e.target.closest('[data-p],[data-rdel]'); if (!b) return;
      const k = b.dataset.p;
      if (b.dataset.rdel) { const x = p.reminders.find(r => r.id === b.dataset.rdel); return act('remDel', { p: pid, rid: x.id, text: x.text }, `${p.name}: ${remTr(x.text)} kaldırıldı`); }
      if (k === 'die') return confirmBox('Öldü mü?', `<b>${esc(p.name)}</b> (${esc(r.name)}) ölü olarak işaretlenecek.`, '☠ Öldü', () => { act('die', { p: pid }, `${p.name} öldü`); render(); }, true);
      if (k === 'revive') return confirmBox('Diriltilsin mi?', `<b>${esc(p.name)}</b> yeniden canlanacak.`, 'Dirilt', () => { act('revive', { p: pid }, `${p.name} dirildi`); render(); });
      if (k === 'ghost') return act('ghost', { p: pid, value: !p.ghost }, p.ghost ? `${p.name} ölü oyunu kullandı` : `${p.name} ölü oyu geri verildi`);
      if (k === 'rename') { const n = prompt('Yeni isim', p.name); if (n && n.trim() && n.trim() !== p.name) act('rename', { p: pid, name: n.trim(), old: p.name }, 'İsim değişti'); return; }
      if (k === 'role') return pickRole('Yeni rol', id => confirmBox('Rol değişsin mi?', `<b>${esc(p.name)}</b>: ${esc(r.name)} → <b>${esc(role(id).name)}</b>`, 'Değiştir', () => { act('role', { p: pid, role: id, old: p.role }, `${p.name} artık ${role(id).name}`); render(); }), render);
      if (k === 'believed') return pickRole('Kendini hangi rol sanıyor?', id => { act('believed', { p: pid, role: id }, id ? `${p.name} kendini ${role(id).name} sanıyor` : `${p.name}: sandığı rol kaldırıldı`); render(); }, render, true);
      if (k === 'remAdd') return pickReminder(pid, render);
    };
  };
  render();
}

function pickRole(title, cb, back, allowNone = false) {
  let all = false, q = '';
  const render = () => {
    const ids = (all ? Object.keys(D.roles).filter(id => D.roles[id].team !== 'reminder') : S.scriptRoles)
      .filter(id => !q || role(id).name.toLocaleLowerCase('tr').includes(q));
    const g = teamGroups(ids);
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>${title}</h3></div>
      <div class="tabs"><button class="${all ? '' : 'on'}" id="tS">Script</button><button class="${all ? 'on' : ''}" id="tA">Tümü</button>
      <input id="q" placeholder="Ara" value="${esc(q)}"></div>
      ${allowNone ? '<button class="btn small" data-rid="">Hiçbiri</button>' : ''}
      ${TEAMS.filter(t => g[t]?.length).map(t => `<h4 class="t-${t}">${TEAM_TR[t]}</h4><div class="chips">${g[t].map(id => roleChip(id, { attr: `data-rid="${id}"` })).join('')}</div>`).join('')}`, render);
    $('bk').onclick = back; $('tS').onclick = () => { all = false; render(); }; $('tA').onclick = () => { all = true; render(); };
    const qi = $('q'); qi.oninput = () => { q = qi.value.toLocaleLowerCase('tr'); const pos = qi.selectionStart; render(); const n = $('q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-rid]'); if (b) cb(b.dataset.rid); };
  };
  render();
}

function pickReminder(pid, back) {
  const inPlay = [...new Set([...S.players.map(p => p.role), ...S.players.map(p => p.believed).filter(Boolean), ...S.scriptRoles])];
  const rows = [];
  inPlay.forEach(id => [...(role(id).reminders || []), ...(role(id).remindersGlobal || [])].forEach(t => rows.push({ role: id, text: t })));
  const playing = new Set(S.players.map(p => p.role));
  rows.sort((a, b) => (playing.has(b.role) - playing.has(a.role)));
  sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Hatırlatıcı ekle</h3></div>
    <div class="row-in"><input id="cr" placeholder="Özel not (ör. Zehirli)"><button class="btn small" id="crOk">Ekle</button></div>
    <div class="rem-list">${['Zehirli', 'Sarhoş'].map(t => `<button class="rem big" data-t="${t}" data-r="">${t}</button>`).join('')}
    ${rows.map(x => `<button class="rem big${playing.has(x.role) ? '' : ' dim'}" data-t="${esc(x.text)}" data-r="${x.role}"><img src="${iconUrl(x.role)}" alt="" onerror="this.remove()">${esc(role(x.role).name)}: ${esc(remTr(x.text))}</button>`).join('')}</div>`, null);
  $('bk').onclick = back;
  const add = (text, r) => { const p = P(pid); act('remAdd', { p: pid, rid: store.newId(), role: r || null, text }, `${p.name}: ${remTr(text)}`); back(); };
  $('crOk').onclick = () => { const v = $('cr').value.trim(); if (v) add(v, null); };
  $('sheetBody').onclick = e => { const b = e.target.closest('[data-t]'); if (b) add(b.dataset.t, b.dataset.r); };
}

// ---- faz ----
function openPhase() {
  const next = S.phase.kind === 'night' ? { kind: 'day', n: S.phase.n } : { kind: 'night', n: S.phase.n + 1 };
  sheet(`<div class="sh-head"><h3>${store.phaseLabel(S.phase)}</h3><button class="ib" data-act="close">✕</button></div>
    <button class="btn primary wide" id="np">${next.kind === 'day' ? '☀' : '☾'} ${store.phaseLabel(next)}'e geç</button>`);
  $('np').onclick = () => { closeSheet(); nextPhase(); };
}

// ---- menü ----
function openMenu() {
  const render = () => sheet(`<div class="sh-head"><h3>Menü</h3><button class="ib" data-act="close">✕</button></div>
    <div class="list">
      <button class="row-btn" id="mSides"><b>Masa düzeni</b><small>Kenar başına koltuk sayısı</small></button>
      <button class="row-btn" id="mBluffs"><b>Blöfler</b><small>${S.bluffs.length ? S.bluffs.map(rname).join(', ') : 'İblise gösterilen 3 rol'}</small></button>
      <button class="row-btn" id="mNew"><b>Yeni oyun</b><small>Bu oyun arşive alınır</small></button>
      <button class="row-btn" id="mOut"><b>Çıkış yap</b><small>${esc(auth.currentUser?.email || '')}</small></button>
    </div><p class="muted small">Karakter verisi: ${new Date(D.at).toLocaleString('tr-TR')}${D.offline ? ' (kayıtlı kopya)' : ''}</p>`, render);
  render();
  $('mSides').onclick = openSides;
  $('mBluffs').onclick = openBluffs;
  $('mNew').onclick = () => confirmBox('Yeni oyun?', 'Mevcut oyun kapanır ve arşive alınır.', 'Yeni oyun', () => { store.reset(); }, true);
  $('mOut').onclick = () => confirmBox('Çıkış yapılsın mı?', 'Oyun bu cihazda kayıtlı kalır.', 'Çıkış', () => { closeSheet(); auth.signOut(); });
}

function openSides() {
  const sd = { ...S.sides }, n = S.players.length;
  const render = () => {
    const sum = Object.values(sd).reduce((a, b) => a + b, 0);
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Masa düzeni</h3></div>${sidesEditor(sd)}
      <p class="${sum === n ? 'muted' : 'warn'}">Toplam: ${sum}/${n}</p>
      <button class="btn primary wide" id="sOk" ${sum === n ? '' : 'disabled'}>Uygula</button>`, null);
    $('bk').onclick = openMenu;
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-side]'); if (b) { sd[b.dataset.side] = Math.max(0, sd[b.dataset.side] + +b.dataset.d); render(); } };
    $('sOk').onclick = () => { act('sides', { sides: { ...sd } }, 'Masa düzeni değişti'); closeSheet(); };
  };
  render();
}

function openBluffs() {
  const sel = [...S.bluffs];
  const render = () => {
    const inPlay = new Set(S.players.map(p => p.role));
    const opts = S.scriptRoles.filter(id => ['townsfolk', 'outsider'].includes(role(id).team) && !inPlay.has(id));
    const g = teamGroups(opts);
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Blöfler <small class="muted">${sel.length}/3</small></h3></div>
      ${['townsfolk', 'outsider'].filter(t => g[t].length).map(t => `<h4 class="t-${t}">${TEAM_TR[t]}</h4><div class="chips">${g[t].map(id => roleChip(id, { on: sel.includes(id), attr: `data-b="${id}"` })).join('')}</div>`).join('')}
      <button class="btn primary wide" id="bOk">Kaydet</button>`, null);
    $('bk').onclick = openMenu;
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-b]'); if (!b) return; const i = sel.indexOf(b.dataset.b); if (i >= 0) sel.splice(i, 1); else if (sel.length < 3) sel.push(b.dataset.b); render(); };
    $('bOk').onclick = () => { act('bluffs', { bluffs: [...sel] }, 'Blöfler kaydedildi'); closeSheet(); };
  };
  render();
}

// ---- kayıt (log) ----
function describe(ev, st) {
  const n = id => pname(st, id);
  switch (ev.type) {
    case 'start': return `Oyun başladı: <b>${esc(ev.script)}</b>, ${ev.players.length} oyuncu`;
    case 'phase': return `<b>${store.phaseLabel(ev.phase)}</b> başladı`;
    case 'die': return `${n(ev.p)} (${rname(st.players.find(p => p.id === ev.p)?.role)}) öldü`;
    case 'revive': return `${n(ev.p)} dirildi`;
    case 'ghost': return ev.value ? `${n(ev.p)} ölü oyunu geri aldı` : `${n(ev.p)} ölü oyunu kullandı`;
    case 'rename': return `${esc(ev.old)} → ${esc(ev.name)} (isim)`;
    case 'role': return `${n(ev.p)}: ${rname(ev.old)} → <b>${rname(ev.role)}</b>`;
    case 'believed': return ev.role ? `${n(ev.p)} kendini ${rname(ev.role)} sanıyor` : `${n(ev.p)}: sandığı rol kaldırıldı`;
    case 'remAdd': return `${n(ev.p)}: <i>${esc(remTr(ev.text))}</i> eklendi${ev.role ? ` (${rname(ev.role)})` : ''}`;
    case 'remDel': return `${n(ev.p)}: <i>${esc(remTr(ev.text))}</i> kaldırıldı`;
    case 'swap': return `${n(ev.a)} ↔ ${n(ev.b)} yer değiştirdi`;
    case 'sides': return 'Masa düzeni değişti';
    case 'bluffs': return `Blöfler: ${ev.bluffs.map(rname).join(', ') || '—'}`;
    default: return ev.type;
  }
}

function openLog() {
  let showSeat = false;
  const render = () => {
    const groups = [];
    S.log.forEach((x, i) => {
      if (!showSeat && (x.ev.type === 'swap' || x.ev.type === 'sides')) return;
      const st = x.before || S, label = store.phaseLabel(x.phase);
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
      groups[groups.length - 1].items.push({ ...x, i, html: describe(x.ev, x.ev.type === 'start' ? S : st) });
    });
    sheet(`<div class="sh-head"><h3>Oyun kaydı</h3><button class="ib" data-act="close">✕</button></div>
      <label class="tgl"><input type="checkbox" id="lSeat" ${showSeat ? 'checked' : ''}> Yer değişikliklerini göster</label>
      ${groups.map(g => `<h4>${g.label}</h4><ol class="log">${g.items.map(x => `<li><span>${x.html}</span>${x.i > 0 ? `<button class="link" data-back="${x.id}" title="Bu adımı ve sonrasını geri al">↶</button>` : ''}</li>`).join('')}</ol>`).join('')}`, render);
    $('lSeat').onchange = e => { showSeat = e.target.checked; render(); };
    $('sheetBody').onclick = e => {
      const b = e.target.closest('[data-back]'); if (!b) return;
      const idx = S.log.findIndex(x => x.id === b.dataset.back), cnt = S.log.length - idx;
      confirmBox('Geri alınsın mı?', `Bu adım ve sonrasındaki <b>${cnt}</b> kayıt silinecek.`, 'Geri al', () => { store.undoTo(b.dataset.back); render(); }, true);
    };
    const sb = $('sheetBody'); sb.scrollTop = sb.scrollHeight;
  };
  render();
}
