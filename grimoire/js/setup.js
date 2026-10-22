// Oyun kurulumu: Script → Roller → Masa. Tokenlar masaya gelir; isimler masada, hazırlık "İlk gece öncesi" ekranında.
import { G, $, esc, shuffle, role, rname, teamGroups, roleChip } from './core.js?v=20261023-0042';
import { TEAMS, TEAM_TR, DIST } from './data.js?v=20261023-0042';
import * as store from './store.js?v=20261023-0042';
import { defaultSides } from './table.js?v=20261023-0042';
import * as prep from './prep.js?v=20261023-0042';

const SKEY = 'tg-grim-setup-v2';
const W = { step: 1, script: null, n: 10, picked: [], sides: null };
const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(W)); } catch (e) {} };

// Kurulumu değiştiren roller: [kasabalı, yabancı, minyon, iblis] farkı (Almanac)
const SETUP_MOD = { fanggu: [-1, 1, 0, 0], baron: [-2, 2, 0, 0], vigormortis: [1, -1, 0, 0], balloonist: null, godfather: null, kazali: null, legion: null, atheist: null, lilmonsta: null, riot: null };
const MOD_NOTE = { godfather: '±1 Yabancı', balloonist: '+0 ya da +1 Yabancı', kazali: 'Minyonları İblis seçer', lilmonsta: '+1 Minyon, İblis yok', legion: 'çoğu oyuncu Legion', atheist: 'İblis yok', riot: 'Minyonlar da Riot' };

export function startSetup(fresh = false) {
  let saved = null;
  if (!fresh) { try { saved = JSON.parse(localStorage.getItem(SKEY)); } catch (e) {} }
  let n = W.n; try { n = +localStorage.getItem('tg-grim-n') || n; } catch (e) {}
  Object.assign(W, { step: 1, script: null, n, picked: [], sides: null });
  if (saved && saved.script) {
    Object.assign(W, saved);
    if (W.script.custom) Object.assign(G.D.roles, W.script.custom);
  }
  renderSetup();
}

const travellersPicked = () => W.picked.filter(id => role(id).team === 'traveller');

function targets() {
  const n = W.n - travellersPicked().length;
  const base = [...DIST[Math.min(Math.max(n, 5), 15)]];
  const notes = [];
  W.picked.forEach(id => {
    if (!(id in SETUP_MOD)) return;
    const m = SETUP_MOD[id];
    if (m) { m.forEach((d, i) => base[i] += d); notes.push(`${rname(id)}: ${m[1] > 0 ? '+' : ''}${m[1]} Yabancı`); }
    else notes.push(`${rname(id)}: ${MOD_NOTE[id] || 'kurulumu değiştirir'}`);
  });
  return { t: { townsfolk: Math.max(0, base[0]), outsider: Math.max(0, base[1]), minion: base[2], demon: base[3] }, notes };
}

export function renderSetup() {
  save();
  const D = G.D, el = $('setup');
  const steps = ['Script', 'Roller', 'Masa'];
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
    const n = W.n, pickedT = teamGroups(W.picked), { t: target, notes } = targets();
    const g = teamGroups(W.script.roles);
    const ok = W.picked.length === n;
    html += `<h2>Roller <small class="muted">${W.picked.length}/${n}</small></h2>
      <div class="cnt-row"><span>Oyuncu sayısı</span><div class="stepper"><button data-n="-1">−</button><b>${n}</b><button data-n="1">+</button></div></div>
      <div class="dist">${['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map(t => {
        const have = pickedT[t].length, want = target[t];
        return `<span class="t-${t}${want != null && have !== want ? ' off' : ''}">${TEAM_TR[t]} <b>${have}${want != null ? '/' + want : ''}</b></span>`; }).join('')}</div>
      ${notes.length ? `<p class="warn">⚙ ${notes.join(' · ')}</p>` : ''}
      <p class="muted small">Gezgin de bir oyuncudur; sayılar gezginler hariç hesaplanır. Sarhoş seçersen torbaya onun yerine bir Kasabalı tokenı koy: hangisi olduğunu "İlk gece öncesi"nde seçeceksin.</p>`;
    html += TEAMS.filter(t => g[t].length).map(t => `<h3 class="t-${t}">${TEAM_TR[t]}</h3><div class="chips">${g[t].map(id => roleChip(id, { on: W.picked.includes(id), attr: `data-pick="${id}"` })).join('')}</div>`).join('');
    html += `<div class="nav-row"><button class="btn" data-go="1">Geri</button><button class="btn" data-act="randRoles">🎲 Rastgele öner</button>
      <button class="btn primary" data-go="3" ${ok ? '' : 'disabled'}>Devam</button></div>`;
  }

  if (W.step === 3) {
    const n = W.n; W.sides = W.sides && Object.values(W.sides).reduce((a, b) => a + b, 0) === n ? W.sides : defaultSides(n, innerHeight >= innerWidth);
    const sum = Object.values(W.sides).reduce((a, b) => a + b, 0);
    html += `<h2>Masa</h2><p class="muted">Her kenarda kaç kişi oturuyor? Toplam ${n} olmalı. Tokenlar masaya karışık gelir: oyunculara göre sürükleyip yerleştir, isimleri tokena basılı tutarak yaz.</p>${sidesEditor(W.sides)}
      <p class="${sum === n ? 'muted' : 'warn'}">Toplam: ${sum}/${n}</p>
      <div class="nav-row"><button class="btn" data-go="2">Geri</button><button class="btn primary" data-act="begin" ${sum === n ? '' : 'disabled'}>Masaya geç</button></div>`;
  }
  el.innerHTML = html + '</div>';
}

export function sidesEditor(sd) {
  const lbl = { top: 'Üst', right: 'Sağ', bottom: 'Alt', left: 'Sol' };
  return `<div class="sides"><div class="sides-box">${['top', 'right', 'bottom', 'left'].map(k =>
    `<div class="side side-${k}"><span>${lbl[k]}</span><div class="stepper"><button data-side="${k}" data-d="-1">−</button><b>${sd[k]}</b><button data-side="${k}" data-d="1">+</button></div></div>`).join('')}
    <div class="side-table">Masa</div></div></div>`;
}

// ---------------- olaylar ----------------
$('setup').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.script != null) { W.script = G.D.scripts[+b.dataset.script]; W.picked = []; W.step = 2; return renderSetup(); }
  if (b.dataset.go) { W.step = +b.dataset.go; window.scrollTo(0, 0); return renderSetup(); }
  if (b.dataset.n) { W.n = Math.min(20, Math.max(5, W.n + +b.dataset.n)); W.sides = null; try { localStorage.setItem('tg-grim-n', W.n); } catch (e) {} return renderSetup(); }
  if (b.dataset.pick) {
    const id = b.dataset.pick, i = W.picked.indexOf(id);
    if (i >= 0) W.picked.splice(i, 1); else W.picked.push(id);
    return renderSetup();
  }
  if (b.dataset.side) { W.sides[b.dataset.side] = Math.max(0, W.sides[b.dataset.side] + +b.dataset.d); return renderSetup(); }
  const a = b.dataset.act;
  if (a === 'randRoles') { randomRoles(); return renderSetup(); }
  if (a === 'begin') return beginGame();
  if (a === 'clip') {
    navigator.clipboard?.readText().then(t => { $('paste').value = t; }).catch(() => pasteErr('Panoya erişilemedi. Kutuya elle yapıştır.'));
    return;
  }
  if (a === 'usePaste') {
    try {
      const sc = parseScript($('paste').value);
      localStorage.setItem('tg-grim-paste', $('paste').value);
      W.script = sc; W.picked = []; W.step = 2; renderSetup();
    } catch (err) { pasteErr(err.message); }
  }
});
function pasteErr(m) { const e = $('pasteErr'); e.textContent = m; e.hidden = false; }

// Script Tool JSON'u: ["id", {id:"x"}, {id:"_meta", name}] ya da ev yapımı rol tanımları {id, name, team, ability, ...}
const TEAM_ALIAS = { traveler: 'traveller', townsfolk: 'townsfolk', outsider: 'outsider', minion: 'minion', demon: 'demon', fabled: 'fabled', traveller: 'traveller' };
const normId = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
export function parseScript(text) {
  const D = G.D;
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
  const g = teamGroups(W.script.roles);
  W.picked = [...travellersPicked()];
  // Kurulumu değiştiren roller sayıları etkiler: önce İblis, sonra Minyon, sonra iyiler
  W.picked.push(...shuffle(g.demon).slice(0, targets().t.demon));
  W.picked.push(...shuffle(g.minion).slice(0, targets().t.minion));
  const t = targets().t;
  W.picked.push(...shuffle(g.outsider).slice(0, t.outsider), ...shuffle(g.townsfolk).slice(0, t.townsfolk));
}

// Tokenlar masaya karışık gelir (torbadan çekilmiş gibi). İsimler sonra masada yazılır.
function beginGame() {
  const roles = shuffle(W.picked);
  const players = roles.map((rid, i) => ({ id: 'p' + i, name: String(i + 1), unnamed: true, role: rid, believed: null, rem: [],
    evil: role(rid).team === 'traveller' ? false : null, reminders: [] }));
  const ini = prep.initial(players, W.script.roles);
  if (ini.rh) players.find(p => p.id === ini.rh).rem.push({ role: 'fortuneteller', text: 'Kırmızı ringa', tag: 'redherring' });
  players.forEach(p => { delete p.reminders; });
  const data = { script: W.script.name, scriptRoles: W.script.roles, customRoles: W.script.custom || {}, players, sides: { ...W.sides }, bluffs: ini.bluffs, prep: ini.prep, pre: true };
  G.edit = false;
  store.reset(true);
  try { localStorage.removeItem(SKEY); } catch (e) {}
  store.dispatch('start', data);
}
