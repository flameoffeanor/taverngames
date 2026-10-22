import { loadData, iconUrl, TEAMS, TEAM_TR, DIST } from './data.js';
import * as store from './store.js';
import { layout, nearestSeat, defaultSides, sideOfSeat } from './table.js';
import * as night from './night.js';

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
      `<button class="row-btn" data-script="${i}"><b>${esc(s.name)}</b><small>${s.roles.length} rol</small></button>`).join('') + `</div>
      <h3>Kayıtlı olmayan script</h3>
      <p class="muted small">Script Tool'dan alınan JSON'u yapıştır. Ev yapımı rollerin tanımı JSON'da varsa onlar da gelir.</p>
      <textarea id="paste" rows="5" placeholder='[{"id":"_meta","name":"…"},"washerwoman","imp", …]'>${esc(localStorage.getItem('tg-grim-paste') || '')}</textarea>
      <p id="pasteErr" class="warn" hidden></p>
      <div class="nav-row"><button class="btn" data-act="clip">📋 Panodan yapıştır</button><button class="btn primary" data-act="usePaste">Bu script'le devam</button></div>`;
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
    const n = W.names.length; W.sides = W.sides || defaultSides(n, innerHeight >= innerWidth);
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
  if (b.dataset.act === 'clip') {
    navigator.clipboard?.readText().then(t => { $('paste').value = t; }).catch(() => pasteErr('Panoya erişilemedi. Kutuya elle yapıştır.'));
    return;
  }
  if (b.dataset.act === 'usePaste') {
    try {
      const sc = parseScript($('paste').value);
      localStorage.setItem('tg-grim-paste', $('paste').value);
      W.script = sc; W.picked = []; W.step = 2; renderSetup();
    } catch (err) { pasteErr(err.message); }
  }
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

function pasteErr(m) { const e = $('pasteErr'); e.textContent = m; e.hidden = false; }

// Script Tool JSON'u: ["id", {id:"x"}, {id:"_meta", name}] ya da ev yapımı rol tanımları {id, name, team, ability, ...}
const TEAM_ALIAS = { traveler: 'traveller', townsfolk: 'townsfolk', outsider: 'outsider', minion: 'minion', demon: 'demon', fabled: 'fabled', traveller: 'traveller' };
const normId = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
function parseScript(text) {
  let arr;
  try { arr = JSON.parse(text.trim()); } catch (e) { throw new Error('JSON okunamadı. Script Tool çıktısını olduğu gibi yapıştır.'); }
  if (!Array.isArray(arr)) throw new Error('Script bir liste olmalı: [ ... ]');
  let name = 'Özel script'; const ids = [], custom = {}, unknown = [];
  for (const it of arr) {
    const raw = typeof it === 'string' ? it : it && it.id;
    if (!raw) continue;
    if (raw === '_meta') { if (it.name) name = String(it.name); continue; }
    const id = normId(raw);
    if (typeof it === 'object' && it.name && it.team && !D.roles[id]) {
      custom[id] = { id, name: String(it.name), team: TEAM_ALIAS[String(it.team).toLowerCase()] || 'townsfolk',
        ability: String(it.ability || ''), first: String(it.firstNightReminder || ''), other: String(it.otherNightReminder || ''),
        reminders: Array.isArray(it.reminders) ? it.reminders.map(String) : [], remindersGlobal: Array.isArray(it.remindersGlobal) ? it.remindersGlobal.map(String) : [],
        setup: !!it.setup, official: false, custom: true };
    }
    if (D.roles[id] || custom[id]) { if (!ids.includes(id)) ids.push(id); } else unknown.push(raw);
  }
  if (unknown.length) throw new Error('Tanınmayan rol: ' + unknown.join(', '));
  if (ids.length < 5) throw new Error('Script\'te en az 5 rol olmalı.');
  Object.assign(D.roles, custom);
  return { name, roles: ids, custom };
}

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
  const data = { script: W.script.name, scriptRoles: W.script.roles, customRoles: W.script.custom || {}, players, sides: { ...W.sides } };
  edit = true;
  store.reset(true);
  store.dispatch('start', data);
}

// ================= OYUN =================
function startGame() { mergeCustom(); show('game'); renderGame(); }
function mergeCustom() { if (S?.customRoles) for (const [k, v] of Object.entries(S.customRoles)) if (!D.roles[k]) D.roles[k] = v; }

let L = null;                 // son yerleşim
let edit = false;             // oturma düzeni düzenleme modu
const board = $('board');
new ResizeObserver(() => { if (!$('game').hidden && S) renderBoard(); }).observe(board);

// Anlık arayüz durumu (kaydedilmez)
const NS = { phase: '', cur: null, targets: [], pick: null, apply: null, sailorSelf: false };
const DS = { mode: null };    // gündüz: 'exec' = idam/sürgün için oyuncu seçiliyor
const seated = () => S.seats.map(P).filter(Boolean);

// Gece metnindeki *İŞARETLER* dokunulabilir: oyuncuya gösterilecek bilgi kartını açar
const MARK = {
  'YOU ARE': { k: 'youare', t: 'Sen' }, 'THIS CHARACTER SELECTED YOU': { k: 'selected', t: 'Bu karakter seni seçti' },
  'THESE ARE YOUR MINIONS': { k: 'minions', t: 'Bunlar senin Minyonların' }, 'THIS IS THE DEMON': { k: 'demon', t: 'Bu İblis' },
  'THESE CHARACTERS ARE NOT IN PLAY': { k: 'notinplay', t: 'Bu karakterler oyunda değil' }, 'THIS PLAYER IS': { k: 'playeris', t: 'Bu oyuncu' },
};
function fmtText(t) {
  return esc(t).replace(/\*([^*]+)\*/g, (m, w) => {
    const k = MARK[w.toUpperCase()];
    return `<button class="mk" data-mk="${esc(w)}">${esc(k ? k.t : w)}</button>`;
  }).replace(/:reminder:/g, '<i class="rmk">🔖</i>');
}

function renderGame() {
  $('phaseTxt').textContent = (S.phase.kind === 'night' ? '☾ ' : '☀ ') + store.phaseLabel(S.phase);
  $('phaseSub').textContent = S.script;
  $('undoBtn').disabled = store.getEvents().length <= 1;
  const pk = store.phaseKey(S.phase);
  if (NS.phase !== pk) { Object.assign(NS, { phase: pk, cur: null, targets: [], pick: null, apply: null, sailorSelf: false }); DS.mode = null; }
  renderBoard();
  if (openPanel) openPanel();
}

function curStep() {
  if (S.phase.kind !== 'night') return null;
  const steps = night.nightSteps(S, D, role);
  const done = S.done[store.phaseKey(S.phase)] || {};
  if (!NS.cur || !steps.some(s => s.key === NS.cur)) NS.cur = (steps.find(s => !done[s.key]) || {}).key || null;
  return { steps, done, step: steps.find(s => s.key === NS.cur) || null };
}
function targeting() {
  if (edit) return null;
  const c = curStep(); if (!c?.step || c.done[c.step.key] || c.step.special) return null;
  const cfg = night.cfgFor(c.step.role, S);
  return cfg.targets[1] > 0 ? { step: c.step, cfg } : null;
}

// ---------- masa ----------
const BADGE_ANG = [-58, 58, -102, 102, -146, 146];
function badges(p, sz) {
  const items = [];
  if (p.believed) items.push({ role: p.believed, cls: 'b-bel', title: 'Kendini ' + role(p.believed).name + ' sanıyor' });
  p.reminders.forEach(r => items.push({ role: r.role, text: remTr(r.text), cls: r.tag ? 'b-' + r.tag : '', title: remTr(r.text) }));
  const max = 4, out = [];
  items.slice(0, items.length > max ? max - 1 : max).forEach((it, i) => out.push({ ...it, a: BADGE_ANG[i] }));
  if (items.length > max) out.push({ text: '+' + (items.length - max + 1), cls: 'b-more', a: BADGE_ANG[max - 1] });
  return out.map(b => {
    const r = sz * 0.6, x = Math.sin(b.a * Math.PI / 180) * r, y = -Math.cos(b.a * Math.PI / 180) * r;
    const inner = b.role ? `<img src="${iconUrl(b.role)}" alt="" onerror="this.replaceWith(document.createTextNode(${JSON.stringify((b.text || '').slice(0, 3))}))">` : esc((b.text || '').slice(0, 3));
    return `<i class="bdg ${b.cls}" style="transform:translate(calc(-50% + ${x}px),calc(-50% + ${y}px))" title="${esc(b.title || b.text || '')}">${inner}${b.role && b.text ? `<b>${esc(b.text)}</b>` : ''}</i>`;
  }).join('');
}

function renderBoard() {
  const W0 = board.clientWidth, H0 = board.clientHeight;
  if (!W0 || !H0) return;
  L = layout(W0, H0, S.sides);
  const { S: sz, table: t } = L;
  const c = S.phase.kind === 'night' ? curStep() : null;
  const tg = targeting();
  const actor = c?.step?.pid;
  const cx = night.ctx(S, role);
  const fs = Math.max(14, Math.min(21, t.w / 21, t.h / 26));
  let html = `<div class="tbl${edit ? ' editing' : ''}" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px;--fs:${fs}px"><div class="stage" id="stage">${centerHTML(c)}</div></div>`;
  S.seats.forEach((pid, i) => {
    const p = P(pid), seat = L.seats[i]; if (!seat || !p) return;
    const r = role(p.role);
    const ti = NS.targets.indexOf(pid);
    let dim = false;
    if (tg) { if (tg.cfg.alive && p.dead) dim = true; if (tg.cfg.dead && !p.dead) dim = true; if (tg.cfg.notSelf && pid === actor) dim = true; }
    if (DS.mode === 'exec' && p.dead) dim = true;
    const evilGood = cx.isEvil(p) && !['minion', 'demon'].includes(r.team);
    html += `<div class="tok t-${r.team}${p.dead ? ' dead' : ''}${pid === actor ? ' actor' : ''}${ti >= 0 ? ' target' : ''}${dim ? ' dim' : ''}${tg || DS.mode ? ' pickable' : ''}" data-pid="${pid}" data-seat="${i}"
      style="left:${seat.x}px;top:${seat.y}px;--s:${sz}px">
      <div class="disc"><img class="ic" src="${iconUrl(p.role)}" alt="" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ini',textContent:${JSON.stringify(r.name.slice(0, 2))}}))">
        ${p.dead ? `<i class="shroud"></i>${p.ghost ? '<i class="ghost" title="Ölü oyu var"></i>' : ''}` : ''}
        ${badges(p, sz)}
        ${ti >= 0 ? `<i class="tnum">${ti + 1}</i>` : ''}
      </div>
      <div class="rn">${esc(r.name)}${evilGood ? ' ☠' : ''}</div>
      <div class="pn">${esc(p.name)}</div></div>`;
  });
  board.innerHTML = html;
  document.documentElement.style.setProperty('--toast-y', (board.getBoundingClientRect().top + t.y + 6) + 'px');
}

// ---------- orta alan ----------
function centerHTML(c) {
  if (edit) return `<div class="cc"><h3>Yerleri düzenle</h3>
    <p class="muted">Oyuncuları sürükleyip başka bir koltuğa bırak; ikisi yer değiştirir. Yan yana oturanlar komşu sayılır.</p>
    <button class="btn primary big" data-c="editDone">✓ Bitti</button></div>`;
  if (S.phase.kind === 'day') return dayHTML();
  const { steps, done, step } = c;
  const idx = step ? steps.indexOf(step) : steps.length;
  const nav = `<div class="cc-nav"><button class="nb" data-c="prev" ${idx <= 0 ? 'disabled' : ''}>‹</button>
    <button class="prog" data-c="list">${Math.min(idx + 1, steps.length)} / ${steps.length}</button>
    <button class="nb" data-c="next" ${idx >= steps.length - 1 ? 'disabled' : ''}>›</button></div>`;
  if (!step) {
    const died = S.deaths.filter(d => store.phaseKey(d.phase) === store.phaseKey(S.phase));
    return `<div class="cc">${steps.length ? nav : ''}<h3>Şafak</h3>
      ${died.length ? `<p>Bu gece ölenler:</p><div class="dlist">${died.map(d => `<span>☠ ${esc(P(d.p).name)}</span>`).join('')}</div>` : '<p class="muted">Bu gece kimse ölmedi.</p>'}
      <button class="btn primary big" data-c="toDay">☀ ${store.phaseLabel({ kind: 'day', n: S.phase.n })}'e geç</button></div>`;
  }
  const x = stepHTML(step, done);
  return `<div class="cc fixed"><div class="cc-top">${nav}${x.top}</div><div class="cc-body">${x.body}</div><div class="cc-foot">${x.foot}</div></div>`;
}

function stepHTML(step, done) {
  const isDone = !!done[step.key];
  const { notes, info } = night.stepNotes(step, S, role, NS.targets);
  if (step.special) {
    return { top: `<div class="who"><span class="sp">${step.special === 'minioninfo' ? 'M' : 'İ'}</span><div><h3>${esc(step.title)}</h3></div></div>`,
      body: `${info.map(x => `<p class="info">${esc(x)}</p>`).join('')}
      <div class="mks"><button class="mk" data-mk="${step.special === 'minioninfo' ? 'THIS IS THE DEMON' : 'THESE ARE YOUR MINIONS'}">${step.special === 'minioninfo' ? 'Bu İblis' : 'Bunlar senin Minyonların'}</button>
      ${step.special === 'demoninfo' ? '<button class="mk" data-mk="THESE CHARACTERS ARE NOT IN PLAY">Bu karakterler oyunda değil</button>' : ''}</div>`,
      foot: isDone ? '<p class="ok">✓ Tamamlandı</p><button class="btn small" data-c="redo">Geri al</button>' : '<button class="btn primary big" data-c="ok">✓ Tamam</button>' };
  }
  const r = role(step.role), p = P(step.pid), cfg = night.cfgFor(step.role, S);
  const broken = night.ctx(S, role).broken(p);
  if (NS.apply === null) NS.apply = !broken.length;
  const top = `<div class="who t-${r.team}"><img src="${iconUrl(step.role)}" alt="" onerror="this.style.visibility='hidden'">
    <div><h3>${esc(r.name)}</h3><div class="pl">${esc(p.name)}${p.role !== step.role ? ` <em>· gerçekte ${esc(role(p.role).name)}</em>` : ''}</div></div></div>`;
  let h = notes.map(x => `<p class="note">${esc(x)}</p>`).join('') + info.map(x => `<p class="info">${esc(x)}</p>`).join('');
  const textHTML = `<div class="ntext">${fmtText(step.text)}</div>`;
  if (isDone) {
    h += textHTML;
    const ev = S.log.find(x => x.id === done[step.key])?.ev;
    return { top, body: h + `<p class="ok">✓ ${ev ? describe(ev, S) : 'Tamamlandı'}</p>`, foot: '<button class="btn small" data-c="redo">Bu adımı geri al</button>' };
  }
  if (cfg.targets[1] > 0) {
    const slots = Array.from({ length: Math.max(cfg.targets[1], NS.targets.length) }, (_, i) => {
      const t = NS.targets[i];
      return t ? `<button class="slot on" data-c="untarget" data-t="${t}">${i + 1}. ${esc(P(t).name)} ✕</button>` : (i < Math.max(cfg.targets[0], 1) || i === NS.targets.length ? `<span class="slot">${i + 1}. ?</span>` : '');
    }).join('');
    h += `<div class="slots">${slots}</div>${NS.targets.length ? '' : '<p class="hint2">Hedefe masadan dokun</p>'}`;
  }
  const ex = [];
  if (cfg.pickRole) ex.push(`<button class="btn small" data-c="pick">${NS.pick ? '🎭 ' + esc(role(NS.pick).name) : '🎭 Gösterilen rol'}</button>`);
  if (NS.targets.length) ex.push(`<button class="btn small" data-c="rem">🔖 Not ekle</button>`);
  if (cfg.effect === 'sailor') ex.push(`<label class="tgl"><input type="checkbox" data-c="sailor" ${NS.sailorSelf ? 'checked' : ''}> Denizci kendisi sarhoş</label>`);
  if ((cfg.effect || cfg.demon) && broken.length) ex.push(`<label class="tgl"><input type="checkbox" data-c="apply" ${NS.apply ? 'checked' : ''}> Yine de uygula</label>`);
  if (ex.length) h += `<div class="extras">${ex.join('')}</div>`;
  h += textHTML;
  const ready = NS.targets.length >= cfg.targets[0];
  return { top, body: h, foot: `<div class="acts"><button class="btn" data-c="skip">Atla</button><button class="btn primary" data-c="ok" ${ready ? '' : 'disabled'}>✓ Onayla</button></div>` };
}

function dayHTML() {
  const alive = seated().filter(p => !p.dead).length;
  const votes = seated().filter(p => !p.dead || p.ghost).length;
  const ex = S.executed[store.phaseKey(S.phase)];
  if (DS.mode === 'exec') {
    const list = seated().slice().sort((x, y) => (x.dead - y.dead)).map(p => `<button class="row-btn${p.dead ? ' skip' : ''}" data-c="execp" data-pid="${p.id}"><b>${esc(p.name)}</b><small>${esc(role(p.role).name)}${p.dead ? ' · ölü' : ''}</small></button>`).join('');
    return `<div class="cc fixed"><div class="cc-top"><h3>İdam / sürgün</h3><p class="muted">Masadan dokun ya da listeden seç</p></div><div class="cc-body"><div class="list">${list}</div></div><div class="cc-foot"><button class="btn" data-c="cancel">Vazgeç</button></div></div>`;
  }
  return `<div class="cc"><h3>☀ ${store.phaseLabel(S.phase)}</h3>
    <div class="stats"><div><b>${alive}</b><small>yaşıyor</small></div><div><b>${votes}</b><small>oy</small></div><div><b>${Math.ceil(alive / 2)}</b><small>idam için</small></div></div>
    ${ex ? `<p class="ok">⚖ İdam edildi: ${esc(P(ex).name)}</p>` : `<button class="btn big danger" data-c="exec">⚖ İdam / sürgün</button>`}
    <button class="btn primary big" data-c="toNight">☾ ${store.phaseLabel({ kind: 'night', n: S.phase.n + 1 })}'e geç</button></div>`;
}

// ---------- dokunma / sürükleme ----------
let drag = null;
board.addEventListener('pointerdown', e => {
  const tok = e.target.closest('.tok'); if (!tok) return;
  drag = { tok, pid: tok.dataset.pid, seat: +tok.dataset.seat, x: e.clientX, y: e.clientY, moved: false, long: false };
  drag.timer = setTimeout(() => { if (drag && !drag.moved) { drag.long = true; navigator.vibrate?.(15); openPlayer(drag.pid); } }, 500);
  tok.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && edit && Math.hypot(dx, dy) > 12) { drag.moved = true; clearTimeout(drag.timer); drag.tok.classList.add('dragging'); }
  if (drag.moved) drag.tok.style.transform = `translate(calc(-50% + ${dx}px), calc(var(--s) / -2 + ${dy}px))`;
  else if (Math.hypot(dx, dy) > 30) clearTimeout(drag.timer);
});
board.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; clearTimeout(d.timer);
  if (d.long) return;
  if (!d.moved) return tapToken(d.pid);
  const seat = L.seats[d.seat];
  const to = nearestSeat(L.seats, seat.x + (e.clientX - d.x), seat.y + (e.clientY - d.y), L.S * 1.2);
  if (to >= 0 && to !== d.seat) store.dispatch('swap', { a: d.pid, b: S.seats[to] }); else renderBoard();
});
board.addEventListener('pointercancel', () => { if (drag) clearTimeout(drag.timer); drag = null; renderBoard(); });

function tapToken(pid) {
  if (DS.mode === 'exec') return execute(pid);
  const tg = targeting();
  if (!tg) return openPlayer(pid);
  const i = NS.targets.indexOf(pid);
  if (i >= 0) NS.targets.splice(i, 1);
  else { if (NS.targets.length >= tg.cfg.targets[1]) NS.targets.shift(); NS.targets.push(pid); }
  renderBoard();
}

// ---------- orta alan tıklamaları ----------
board.addEventListener('click', e => {
  const m = e.target.closest('[data-mk]'); if (m) return showMarker(m.dataset.mk);
  const b = e.target.closest('[data-c]'); if (!b || b.tagName === 'INPUT') return;
  const a = b.dataset.c, c = curStep();
  const go = k => { NS.cur = k; Object.assign(NS, { targets: [], pick: null, apply: null, sailorSelf: false }); renderBoard(); };
  if (a === 'editDone') { edit = false; renderBoard(); return; }
  if (a === 'prev' || a === 'next') { const i = c.steps.indexOf(c.step) + (a === 'prev' ? -1 : 1); if (i < 0) return; return go(c.steps[Math.min(i, c.steps.length - 1)]?.key || null); }
  if (a === 'list') return openSteps();
  if (a === 'toDay' || a === 'toNight') return nextPhase();
  if (a === 'exec') { DS.mode = 'exec'; renderBoard(); return; }
  if (a === 'cancel') { DS.mode = null; renderBoard(); return; }
  if (a === 'execp') return execute(b.dataset.pid);
  if (a === 'skip') return confirmStep(true);
  if (a === 'ok') return confirmStep(false);
  if (a === 'redo') { const k = c.done[NS.cur]; if (k) store.undoTo(k); return; }
  if (a === 'untarget') { NS.targets = NS.targets.filter(t => t !== b.dataset.t); renderBoard(); return; }
  if (a === 'pick') return pickRole('Gösterilen rol', id => { NS.pick = id; closeSheet(); renderBoard(); }, closeSheet);
  if (a === 'rem') return pickReminder(NS.targets[0], closeSheet);
});
board.addEventListener('change', e => {
  const a = e.target.dataset.c;
  if (a === 'apply') NS.apply = e.target.checked;
  if (a === 'sailor') NS.sailorSelf = e.target.checked;
});

function nextPhase() {
  const next = S.phase.kind === 'night' ? { kind: 'day', n: S.phase.n } : { kind: 'night', n: S.phase.n + 1 };
  if (S.phase.kind === 'night') {
    const c = curStep(), left = c.steps.filter(s => !c.done[s.key] && !s.skipDead).length;
    if (left) return confirmBox('Gece bitmedi', `<b>${left}</b> adım onaylanmadı. Yine de güne geçilsin mi?`, 'Güne geç', () => { closeSheet(); act('phase', { phase: next }, `${store.phaseLabel(next)} başladı`); });
  }
  act('phase', { phase: next }, `${store.phaseLabel(next)} başladı`);
}

function execute(pid) {
  const p = P(pid), r = role(p.role), trav = r.team === 'traveller';
  DS.mode = null;
  confirmBox(trav ? 'Sürgün edilsin mi?' : 'İdam edilsin mi?', `<b>${esc(p.name)}</b> (${esc(r.name)}) ${trav ? 'sürgün' : 'idam'} edilecek.`, trav ? 'Sürgün et' : '⚖ İdam et', () => {
    act('die', { p: pid, cause: trav ? 'exile' : 'execution' }, `${p.name} ${trav ? 'sürgün' : 'idam'} edildi`);
    if (!showTriggers([{ p: pid, cause: trav ? 'exile' : 'execution' }])) closeSheet();
  }, true);
  renderBoard();
}

// ---------- adım listesi ----------
function openSteps() {
  if (S.phase.kind !== 'night') return openLog();
  const render = () => {
    const { steps, done } = curStep();
    sheet(`<div class="sh-head"><h3>☾ ${store.phaseLabel(S.phase)} sırası</h3><button class="ib" data-act="close">✕</button></div>
      <div class="list">${steps.map((s, i) => `<button class="row-btn st-row${s.key === NS.cur ? ' cur' : ''}${done[s.key] ? ' done' : ''}${s.skipDead ? ' skip' : ''}" data-k="${s.key}">
        <span class="sti">${s.role ? `<img src="${iconUrl(s.role)}" alt="" onerror="this.remove()">` : (s.special === 'minioninfo' ? 'M' : 'İ')}</span>
        <b>${i + 1}. ${esc(s.role ? role(s.role).name : s.title)}</b><small>${s.pid ? esc(P(s.pid).name) : ''}${done[s.key] ? ' ✓' : s.skipDead ? ' · ölü' : ''}</small></button>`).join('')}</div>`, render);
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; NS.cur = b.dataset.k; Object.assign(NS, { targets: [], pick: null, apply: null, sailorSelf: false }); closeSheet(); renderBoard(); };
  };
  render();
}

// ---------- bilgi kartı (oyuncuya göster) ----------
function showCard(title, roles = [], sub = '') {
  const el = $('show');
  el.innerHTML = `<div class="show-in"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}
    <div class="show-roles">${roles.map(id => `<div><img src="${iconUrl(id)}" alt="" onerror="this.remove()"><span>${esc(role(id).name)}</span></div>`).join('')}</div>
    <small>Kapatmak için dokun</small></div>`;
  el.hidden = false;
}
$('show').addEventListener('click', () => { $('show').hidden = true; });
function showMarker(w) {
  const m = MARK[w.toUpperCase()], c = S.phase.kind === 'night' ? curStep() : null, st = c?.step;
  const t = m ? m.t : w;
  if (!m) return showCard(t);
  if (m.k === 'selected') return showCard(t, st?.role ? [st.role] : []);
  if (m.k === 'notinplay') return showCard(t, S.bluffs);
  if (m.k === 'minions' || m.k === 'demon') return showCard(t);
  // Sen … / Bu oyuncu … : gösterilecek rolü seç
  pickRole(t + ': hangi rol?', id => { closeSheet(); showCard(t, [id]); }, closeSheet);
}

// ---------- üst bar ----------
$('game').querySelector('.bar').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'undo') doUndo();
  if (a === 'log') openLog();
  if (a === 'menu') openMenu();
  if (a === 'steps') openSteps();
});

// ---------- eylem + geri al ----------
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
  toastT = setTimeout(() => { t.hidden = true; }, 4000);
}
$('toast').addEventListener('click', e => {
  const b = e.target.closest('[data-undo]'); if (!b) return;
  const evs = store.getEvents();
  if (evs[evs.length - 1]?.id === b.dataset.undo) store.undo(); else store.undoTo(b.dataset.undo);
  $('toast').hidden = true;
});
function doUndo() {
  const before = S;
  const ev = store.undo();
  if (ev) toast('Geri alındı: ' + describe(ev, before).replace(/<[^>]+>/g, ''));
}

function advance() { Object.assign(NS, { cur: null, targets: [], pick: null, apply: null, sailorSelf: false }); }

function confirmStep(skip) {
  const { step } = curStep(); if (!step) return;
  const base = { step: step.key, role: step.role || null, actor: step.pid || null, special: step.special || null };
  if (skip || step.special) {
    const ev = store.dispatch('act', { ...base, skipped: !!skip, targets: [] });
    advance(); toast(skip ? 'Adım atlandı' : 'Tamam', ev.id); renderGame(); return;
  }
  const cfg = night.cfgFor(step.role, S), p = P(step.pid);
  const broken = night.ctx(S, role).broken(p);
  const targets = [...NS.targets];
  const data = { ...base, targets, pick: NS.pick, broken: broken.map(b => b.kind), applied: !!NS.apply };
  const effects = night.buildEffects(step, S, role, targets, { apply: NS.apply, sailorSelf: NS.sailorSelf }, store.newId);
  const finish = (extra = []) => {
    const ev = store.dispatch('act', { ...data, effects: [...effects, ...extra] });
    advance(); renderGame();
    toast(describe(ev, S).replace(/<[^>]+>/g, ''), ev.id);
    const deaths = [...effects, ...extra].filter(x => x.type === 'die');
    if (deaths.length) showTriggers(deaths);
  };
  if (cfg.demon && NS.apply && targets.length) return resolveKills(p, targets, [], finish);
  finish();
}

function resolveKills(demon, targets, acc, done) {
  if (!targets.length) { closeSheet(); return done(acc); }
  const [tid, ...rest] = targets, t = P(tid);
  const checks = night.killChecks(S, role, tid, demon);
  const jump = demon.role === 'fanggu' && role(t.role).team === 'outsider' && !S.used[demon.id + ':fanggu'];
  const starPass = demon.role === 'imp' && tid === demon.id;
  const minions = starPass ? seated().filter(q => !q.dead && role(q.role).team === 'minion') : [];
  sheet(`<h3>${esc(role(demon.role).name)} → ${esc(t.name)}</h3>
    ${checks.map(x => `<p class="note">${esc(x)}</p>`).join('') || '<p class="muted">Engel görünmüyor.</p>'}
    <div class="list">
      ${jump ? `<button class="row-btn hot" data-k="jump"><b>Fang Gu atlaması</b><small>${esc(t.name)} kötü Fang Gu olur, ${esc(demon.name)} ölür</small></button>` : ''}
      ${minions.map(m => `<button class="row-btn hot" data-k="star" data-m="${m.id}"><b>${esc(m.name)} ${esc(role('imp').name)} olsun</b><small>${esc(role(m.role).name)} → ${esc(role('imp').name)}, ${esc(demon.name)} ölür</small></button>`).join('')}
      ${!starPass ? `<button class="row-btn" data-k="kill"><b>☠ ${esc(t.name)} ölsün</b></button>` : ''}
      <button class="row-btn" data-k="none"><b>Ölmedi</b><small>Korundu, engellendi ya da sen öyle karar verdin</small></button>
    </div>`);
  $('sheetBody').onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if (k === 'kill') acc.push({ type: 'die', p: tid, cause: 'demon', by: demon.id });
    if (k === 'jump') acc.push({ type: 'role', p: tid, role: 'fanggu', evil: true, old: t.role }, { type: 'use', key: demon.id + ':fanggu' }, { type: 'die', p: demon.id, cause: 'fanggu', by: demon.id });
    if (k === 'star') acc.push({ type: 'die', p: demon.id, cause: 'starpass', by: demon.id }, { type: 'role', p: b.dataset.m, role: 'imp', old: P(b.dataset.m).role });
    resolveKills(demon, rest, acc, done);
  };
}

function showTriggers(deaths) {
  const items = deaths.flatMap(d => night.deathTriggers(S, role, d.p, d.cause));
  if (!items.length) return false;
  sheet(`<h3>Unutma</h3>${items.map((x, i) => `<div class="trig${x.strong ? ' strong' : ''}"><p>${esc(x.text)}</p>
    ${x.action ? `<button class="btn small" data-ta="${i}">${esc(x.action.label)}</button>` : ''}</div>`).join('')}
    <button class="btn wide" data-act="close">Tamam</button>`);
  $('sheetBody').onclick = e => {
    const b = e.target.closest('[data-ta]'); if (!b) return;
    const a = items[+b.dataset.ta].action;
    if (a.type === 'role') act('role', { p: a.p, role: a.role, old: P(a.p).role }, `${P(a.p).name} artık ${role(a.role).name}`);
    if (a.type === 'die') act('die', { p: a.p, cause: a.cause }, `${P(a.p).name} öldü`);
    b.disabled = true; b.textContent = '✓ ' + b.textContent;
  };
  return true;
}

// ================= ALT PANEL (sheet) =================
let openPanel = null;
function sheet(html, refresh = null) { $('sheetBody').innerHTML = html; $('sheet').hidden = false; openPanel = refresh; }
function closeSheet() { $('sheet').hidden = true; openPanel = null; }
$('sheet').addEventListener('click', e => { if (e.target.closest('[data-act="close"]')) closeSheet(); });

function confirmBox(title, text, okLabel, onOk, danger = false) {
  const prev = openPanel;
  sheet(`<h3>${title}</h3><p>${text}</p><div class="nav-row"><button class="btn" id="cNo">Vazgeç</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cYes">${okLabel}</button></div>`);
  $('cNo').onclick = () => (prev ? prev() : closeSheet());
  $('cYes').onclick = () => onOk();
}

// ---- oyuncu paneli ----
function openPlayer(pid) {
  const render = () => {
    const p = P(pid); if (!p) return closeSheet();
    const r = role(p.role), day = S.phase.kind === 'day', trav = r.team === 'traveller' || p.traveller;
    const br = night.ctx(S, role).broken(p);
    const evil = night.ctx(S, role).isEvil(p);
    sheet(`<div class="pp-head t-${r.team}">
        <img src="${iconUrl(p.role)}" alt="" onerror="this.style.visibility='hidden'">
        <div><h3>${esc(r.name)}</h3>
        <div class="team">${esc(p.name)} <button class="link" data-p="rename">✎</button> · ${TEAM_TR[r.team] || r.team} · ${evil ? 'Kötü' : 'İyi'}${p.dead ? ' · <b>Ölü</b>' : ''}</div>
        ${p.believed ? `<div class="bel-line">Kendini <b>${esc(role(p.believed).name)}</b> sanıyor</div>` : ''}
        ${br.map(b => `<div class="note">⚠ ${esc(b.kind)}</div>`).join('')}</div>
        <button class="ib" data-act="close">✕</button></div>
      <p class="ability">${esc(r.ability) || '<span class="muted">Yetenek metni yok.</span>'}</p>
      ${p.reminders.length ? `<div class="rem-list">${p.reminders.map(x =>
        `<button class="rem big${x.tag ? ' tg-' + x.tag : ''}" data-rdel="${x.id}">${x.role ? `<img src="${iconUrl(x.role)}" alt="" onerror="this.remove()">` : ''}${esc(remTr(x.text))}${x.src ? ` <small>(${esc(P(x.src)?.name || '')})</small>` : ''} ✕</button>`).join('')}</div>` : ''}
      <div class="grid2">
        ${p.dead ? `<button class="btn" data-p="revive">Dirilt</button><button class="btn ${p.ghost ? '' : 'off'}" data-p="ghost">${p.ghost ? 'Ölü oyunu kullandı' : 'Ölü oyunu geri ver'}</button>`
          : `${day ? `<button class="btn danger" data-p="exec">${trav ? 'Sürgün et' : '⚖ İdam et'}</button>` : ''}<button class="btn danger" data-p="die">☠ Öldü</button>`}
        <button class="btn" data-p="remAdd">🔖 Hatırlatıcı</button>
        <button class="btn" data-p="role">Rolü değiştir</button>
        <button class="btn" data-p="believed">Sandığı rol${p.believed ? ' ✓' : ''}</button>
        <button class="btn" data-p="align">${evil ? 'İyi yap' : 'Kötü yap'}</button>
        ${trav ? '<button class="btn" data-p="leave">Masadan çıkar</button>' : ''}
      </div>`, render);
    $('sheetBody').onclick = e => {
      const b = e.target.closest('[data-p],[data-rdel]'); if (!b) return;
      const k = b.dataset.p;
      if (b.dataset.rdel) { const x = p.reminders.find(r => r.id === b.dataset.rdel); return act('remDel', { p: pid, rid: x.id, text: x.text }, `${p.name}: ${remTr(x.text)} kaldırıldı`); }
      if (k === 'exec') return execute(pid);
      if (k === 'die') return confirmBox('Öldü mü?', `<b>${esc(p.name)}</b> (${esc(r.name)}) ölü olarak işaretlenecek.`, '☠ Öldü', () => { act('die', { p: pid, cause: 'manual' }, `${p.name} öldü`); if (!showTriggers([{ p: pid, cause: 'manual' }])) render(); }, true);
      if (k === 'revive') return confirmBox('Diriltilsin mi?', `<b>${esc(p.name)}</b> yeniden canlanacak.`, 'Dirilt', () => { act('revive', { p: pid }, `${p.name} dirildi`); render(); });
      if (k === 'ghost') return act('ghost', { p: pid, value: !p.ghost }, p.ghost ? `${p.name} ölü oyunu kullandı` : `${p.name} ölü oyu geri verildi`);
      if (k === 'align') return act('align', { p: pid, evil: !evil }, `${p.name} artık ${evil ? 'iyi' : 'kötü'}`);
      if (k === 'leave') return confirmBox('Masadan çıksın mı?', `<b>${esc(p.name)}</b> masadan kalkacak. Kayıtta kalır.`, 'Çıkar', () => { act('removePlayer', { p: pid, side: sideOfSeat(S.seats.indexOf(pid), S.sides) }, `${p.name} masadan çıktı`); closeSheet(); }, true);
      if (k === 'rename') { const n = prompt('Yeni isim', p.name); if (n && n.trim() && n.trim() !== p.name) act('rename', { p: pid, name: n.trim(), old: p.name }, 'İsim değişti'); return; }
      if (k === 'role') return pickRole('Yeni rol', id => confirmBox('Rol değişsin mi?', `<b>${esc(p.name)}</b>: ${esc(r.name)} → <b>${esc(role(id).name)}</b>`, 'Değiştir', () => { act('role', { p: pid, role: id, old: p.role }, `${p.name} artık ${role(id).name}`); render(); }), render);
      if (k === 'believed') return pickRole('Kendini hangi rol sanıyor?', id => { act('believed', { p: pid, role: id }, id ? `${p.name} kendini ${role(id).name} sanıyor` : `${p.name}: sandığı rol kaldırıldı`); render(); }, render, true);
      if (k === 'remAdd') return pickReminder(pid, render);
    };
  };
  render();
}

function pickRole(title, cb, back, allowNone = false, only = null) {
  let all = false, q = '';
  const render = () => {
    let ids = all ? Object.keys(D.roles).filter(id => D.roles[id].team !== 'reminder') : S.scriptRoles;
    if (only) ids = (all ? Object.keys(D.roles) : [...new Set([...S.scriptRoles, ...Object.keys(D.roles)])]).filter(id => role(id).team === only);
    ids = ids.filter(id => !q || role(id).name.toLocaleLowerCase('tr').includes(q));
    const g = teamGroups(ids);
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>${title}</h3></div>
      <div class="tabs">${only ? '' : `<button class="${all ? '' : 'on'}" id="tS">Script</button><button class="${all ? 'on' : ''}" id="tA">Tümü</button>`}
      <input id="q" placeholder="Ara" value="${esc(q)}"></div>
      ${allowNone ? '<button class="btn small" data-rid="">Hiçbiri</button>' : ''}
      ${TEAMS.filter(t => g[t]?.length).map(t => `<h4 class="t-${t}">${TEAM_TR[t]}</h4><div class="chips">${g[t].map(id => roleChip(id, { attr: `data-rid="${id}"` })).join('')}</div>`).join('')}`, render);
    $('bk').onclick = back;
    if (!only) { $('tS').onclick = () => { all = false; render(); }; $('tA').onclick = () => { all = true; render(); }; }
    const qi = $('q'); qi.oninput = () => { q = qi.value.toLocaleLowerCase('tr'); const pos = qi.selectionStart; render(); const n = $('q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-rid]'); if (b) cb(b.dataset.rid); };
  };
  render();
}

function pickReminder(pid, back) {
  const inPlay = [...new Set([...seated().map(p => p.role), ...seated().map(p => p.believed).filter(Boolean), ...S.scriptRoles])];
  const rows = [];
  inPlay.forEach(id => [...(role(id).reminders || []), ...(role(id).remindersGlobal || [])].forEach(t => rows.push({ role: id, text: t })));
  const playing = new Set(seated().map(p => p.role));
  rows.sort((a, b) => (playing.has(b.role) - playing.has(a.role)));
  sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Hatırlatıcı: ${esc(P(pid).name)}</h3></div>
    <div class="row-in"><input id="cr" placeholder="Özel not"><button class="btn small" id="crOk">Ekle</button></div>
    <div class="rem-list">${['Zehirli', 'Sarhoş'].map(t => `<button class="rem big" data-t="${t}" data-r="">${t}</button>`).join('')}
    ${rows.map(x => `<button class="rem big${playing.has(x.role) ? '' : ' dim'}" data-t="${esc(x.text)}" data-r="${x.role}"><img src="${iconUrl(x.role)}" alt="" onerror="this.remove()">${esc(role(x.role).name)}: ${esc(remTr(x.text))}</button>`).join('')}</div>`, null);
  $('bk').onclick = back;
  const add = (text, r) => { const p = P(pid); act('remAdd', { p: pid, rid: store.newId(), role: r || null, text, tag: night.tagOf(text) }, `${p.name}: ${remTr(text)}`); back(); };
  $('crOk').onclick = () => { const v = $('cr').value.trim(); if (v) add(v, null); };
  $('sheetBody').onclick = e => { const b = e.target.closest('[data-t]'); if (b) add(b.dataset.t, b.dataset.r); };
}

// ---- menü ----
function openMenu() {
  const render = () => sheet(`<div class="sh-head"><h3>Menü</h3><button class="ib" data-act="close">✕</button></div>
    <div class="list">
      <button class="row-btn" id="mEdit"><b>Yerleri düzenle</b><small>Oyuncuları sürükleyerek yerleştir</small></button>
      <button class="row-btn" id="mTrav"><b>Gezgin ekle</b><small>Sonradan gelen oyuncu</small></button>
      <button class="row-btn" id="mShow"><b>Bilgi kartı göster</b><small>Oyuncuya ekranı göster</small></button>
      <button class="row-btn" id="mBluffs"><b>Blöfler</b><small>${S.bluffs.length ? S.bluffs.map(rname).join(', ') : 'İblise gösterilen 3 rol'}</small></button>
      <button class="row-btn" id="mSides"><b>Masa düzeni</b><small>Kenar başına koltuk sayısı</small></button>
      <button class="row-btn" id="mNew"><b>Yeni oyun</b><small>Bu oyun arşive alınır</small></button>
      <button class="row-btn" id="mOut"><b>Çıkış yap</b><small>${esc(auth.currentUser?.email || '')}</small></button>
    </div><p class="muted small">Karakter verisi: ${new Date(D.at).toLocaleString('tr-TR')}${D.offline ? ' (kayıtlı kopya)' : ''}</p>`, render);
  render();
  $('mEdit').onclick = () => { edit = true; closeSheet(); renderBoard(); };
  $('mTrav').onclick = addTraveller;
  $('mShow').onclick = openShowMenu;
  $('mSides').onclick = openSides;
  $('mBluffs').onclick = openBluffs;
  $('mNew').onclick = () => confirmBox('Yeni oyun?', 'Mevcut oyun kapanır ve arşive alınır.', 'Yeni oyun', () => { store.reset(); }, true);
  $('mOut').onclick = () => confirmBox('Çıkış yapılsın mı?', 'Oyun bu cihazda kayıtlı kalır.', 'Çıkış', () => { closeSheet(); auth.signOut(); });
}

function openShowMenu() {
  sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Bilgi kartı</h3></div><div class="list">
    ${Object.entries(MARK).map(([k, v]) => `<button class="row-btn" data-mk="${k}"><b>${esc(v.t)}</b></button>`).join('')}
    <button class="row-btn" id="custom"><b>Özel metin…</b></button></div>`);
  $('bk').onclick = openMenu;
  $('custom').onclick = () => { const t = prompt('Gösterilecek metin'); if (t) { closeSheet(); showCard(t); } };
  $('sheetBody').onclick = e => { const b = e.target.closest('[data-mk]'); if (b) { const m = MARK[b.dataset.mk]; if (['youare', 'playeris'].includes(m.k)) showMarker(b.dataset.mk); else { closeSheet(); showMarker(b.dataset.mk); } } };
}

function addTraveller() {
  pickRole('Gezgin rolü', id => {
    const name = (prompt('Oyuncunun adı') || '').trim();
    if (!name) return closeSheet();
    sheet(`<div class="sh-head"><h3>${esc(name)} · ${esc(role(id).name)}</h3></div>
      <h4>Takımı</h4><div class="grid2"><button class="btn on-sel" data-al="0">İyi</button><button class="btn" data-al="1">Kötü</button></div>
      <h4>Kimin solunda oturuyor? (saat yönünde ondan sonra)</h4>
      <div class="list">${seated().map(p => `<button class="row-btn" data-af="${p.id}"><b>${esc(p.name)}</b><small>${esc(role(p.role).name)}</small></button>`).join('')}</div>`);
    let evil = false;
    $('sheetBody').onclick = e => {
      const a = e.target.closest('[data-al]');
      if (a) { evil = a.dataset.al === '1'; $('sheetBody').querySelectorAll('[data-al]').forEach(x => x.classList.toggle('on-sel', x === a)); return; }
      const b = e.target.closest('[data-af]'); if (!b) return;
      const side = sideOfSeat(S.seats.indexOf(b.dataset.af), S.sides);
      act('addPlayer', { p: { id: 't' + store.newId(), name, role: id, evil }, after: b.dataset.af, side }, `${name} masaya katıldı`);
      closeSheet();
    };
  }, openMenu, false, 'traveller');
}

function openSides() {
  const sd = { ...S.sides }, n = S.seats.length;
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
    const inPlay = new Set(seated().map(p => p.role));
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
const CAUSE = { demon: 'İblis tarafından öldürüldü', execution: 'idam edildi', exile: 'sürgün edildi', fanggu: 'Fang Gu atlamasıyla öldü', starpass: 'İblis devri için öldü', grandmother: 'torunu öldüğü için öldü', manual: 'öldü' };
function describe(ev, st) {
  const n = id => pname(st, id);
  const pr = id => { const p = st?.players.find(q => q.id === id); return p ? `${esc(p.name)} (${rname(p.role)})` : '?'; };
  switch (ev.type) {
    case 'start': return `Oyun başladı: <b>${esc(ev.script)}</b>, ${ev.players.length} oyuncu`;
    case 'phase': return `<b>${store.phaseLabel(ev.phase)}</b> başladı`;
    case 'die': return `${pr(ev.p)} ${CAUSE[ev.cause] || 'öldü'}`;
    case 'revive': return `${n(ev.p)} dirildi`;
    case 'ghost': return ev.value ? `${n(ev.p)} ölü oyunu geri aldı` : `${n(ev.p)} ölü oyunu kullandı`;
    case 'rename': return `${esc(ev.old)} → ${esc(ev.name)} (isim)`;
    case 'role': return `${n(ev.p)}: ${rname(ev.old)} → <b>${rname(ev.role)}</b>`;
    case 'align': return `${n(ev.p)} artık ${ev.evil ? 'kötü' : 'iyi'}`;
    case 'believed': return ev.role ? `${n(ev.p)} kendini ${rname(ev.role)} sanıyor` : `${n(ev.p)}: sandığı rol kaldırıldı`;
    case 'remAdd': return `${n(ev.p)}: <i>${esc(remTr(ev.text))}</i> eklendi${ev.role ? ` (${rname(ev.role)})` : ''}`;
    case 'remDel': return `${n(ev.p)}: <i>${esc(remTr(ev.text))}</i> kaldırıldı`;
    case 'swap': return `${n(ev.a)} ↔ ${n(ev.b)} yer değiştirdi`;
    case 'sides': return 'Masa düzeni değişti';
    case 'bluffs': return `Blöfler: ${ev.bluffs.map(rname).join(', ') || '—'}`;
    case 'addPlayer': return `${esc(ev.p.name)} (${rname(ev.p.role)}, ${ev.p.evil ? 'kötü' : 'iyi'}) masaya katıldı`;
    case 'removePlayer': return `${n(ev.p)} masadan çıktı`;
    case 'act': {
      if (ev.special) return ev.special === 'minioninfo' ? 'Minyonlar birbirini ve İblisi gördü' : 'İblis minyonlarını ve blöfleri gördü';
      const who = `<b>${rname(ev.role)}</b> ${n(ev.actor)}`;
      if (ev.skipped) return `${who}: atlandı`;
      let t = who + (ev.targets?.length ? ' → ' + ev.targets.map(n).join(', ') : '');
      if (ev.pick) t += ` · gösterilen: ${rname(ev.pick)}`;
      if (ev.broken?.length) t += ` <span class="bad">(${esc(ev.broken.join(', ').toLocaleLowerCase('tr'))}${ev.applied ? '' : ', etkisiz'})</span>`;
      const extra = (ev.effects || []).filter(e => e.type === 'die' || e.type === 'role').map(e => e.type === 'die' ? `${n(e.p)} ${CAUSE[e.cause] || 'öldü'}` : `${n(e.p)} → ${rname(e.role)}`);
      if (extra.length) t += ' · ' + extra.join(' · ');
      return t;
    }
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
