// Ortak durum ve yardımcılar. Modüller birbirini doğrudan çağırmak yerine `hooks` üzerinden çağırır.
import * as store from './store.js?v=20261023-0506';
import { iconUrl, TEAMS } from './data.js?v=20261023-0506';

export const G = {
  D: null,          // karakter + script verisi
  S: null,          // oyun durumu (store'dan türetilir)
  edit: false,      // oturma düzenleme modu
  // gece adımı için geçici seçimler (kaydedilmez)
  NS: { phase: '', cur: null, targets: [], pick: null, apply: null, sailorSelf: false, pre: null },
  // gündüz modu: null | {k:'exec'|'slayer'|..., ...}
  DS: { mode: null },
};
export const hooks = {};   // renderAll, openPlayer, goPane …

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Sheet'teki <b>, <i>, <u>, <br> etiketlerine izin ver; geri kalanı kaçışlı
export const rich = s => esc(s).replace(/&lt;(\/?)(b|i|u|em|strong)&gt;/gi, '<$1$2>').replace(/&lt;br\s*\/?&gt;/gi, '<br>');
export const plain = s => String(s ?? '').replace(/<[^>]+>/g, '');
// HTML → düz metin (etiketleri at, &#39; gibi kaçışları çöz)
export const unhtml = s => { const d = document.createElement('div'); d.innerHTML = String(s ?? ''); return d.textContent; };
export const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const role = id => G.D.roles[id] || { id, name: id || '?', team: 'townsfolk', ability: '', reminders: [], first: '', other: '' };
export const P = id => G.S.players.find(p => p.id === id);
export const seated = () => G.S.seats.map(P).filter(Boolean);
export const rname = id => esc(role(id).name);
export const icon = (id, cls = '') => `<img class="${cls}" src="${iconUrl(id)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`;

// Resmi hatırlatıcı token adlarının TR karşılıkları
const REM_TR = {
  Poisoned: 'Zehirli', Drunk: 'Sarhoş', Dead: 'Ölü', Protected: 'Korunuyor', Safe: 'Korunuyor',
  'No Ability': 'Yeteneği yok', Mad: 'Deli', '2nd': '2. oyuncu', Townsfolk: 'Kasabalı', Outsider: 'Yabancı', Minion: 'Minyon',
  Demon: 'İblis', Wrong: 'Yanlış', Grandchild: 'Torun', 'Died Today': 'Bugün öldü', Once: 'Bir kez', 'Red Herring': 'Kırmızı ringa',
  'Survives Execution': 'İdamda ölmez', 'Is The Demon': 'İblis oldu', 'Is The Drunk': 'Sarhoş', '3 Attacks': '3 saldırı',
  'Negative Vote': 'Eksi oy', 'Is The Apprentice': 'Çırak', Amigo: 'Amigo', Alive: 'Dirildi',
};
export const remTr = t => REM_TR[t] || t;

export function teamGroups(ids) {
  const g = {}; TEAMS.forEach(t => g[t] = []);
  ids.forEach(id => { const t = role(id).team; (g[t] || (g[t] = [])).push(id); });
  return g;
}
export function roleChip(id, { on = false, attr = '', dim = false } = {}) {
  const r = role(id);
  return `<button class="chip t-${r.team}${on ? ' on' : ''}${dim ? ' dim' : ''}" ${attr}>${icon(id)}<span>${esc(r.name)}</span>${r.setup ? '<i title="Kurulumu değiştirir">⚙</i>' : ''}</button>`;
}

// ---------------- alt sayfa (sheet) ----------------
export let openPanel = null;
export function sheet(html, refresh = null) {
  $('sheetBody').innerHTML = html; $('sheet').hidden = false; openPanel = refresh;
}
export function closeSheet() { $('sheet').hidden = true; openPanel = null; }
export const refreshSheet = () => { if (openPanel) openPanel(); };
// Uzun basmayla açılınca parmak kalkarken yanlışlıkla bir şeye basılmasın
let guardUntil = 0;
export const guardSheet = (ms = 450) => { guardUntil = Date.now() + ms; };
$('sheet').addEventListener('click', e => { if (Date.now() < guardUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
$('sheet').addEventListener('click', e => { if (e.target.closest('[data-act="close"]')) closeSheet(); });

export function confirmBox(title, text, okLabel, onOk, danger = false) {
  const prev = openPanel;
  sheet(`<h3>${title}</h3><p>${text}</p><div class="nav-row"><button class="btn" id="cNo">Vazgeç</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cYes">${okLabel}</button></div>`);
  $('cNo').onclick = () => (prev ? prev() : closeSheet());
  $('cYes').onclick = () => onOk();
}

// ---------------- bildirim + eylem ----------------
let toastT;
export function toast(msg, evId) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${evId ? `<button data-undo="${evId}">Geri al</button>` : ''}`;
  t.hidden = false; clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 3000);
}
$('toast').addEventListener('click', e => {
  const b = e.target.closest('[data-undo]'); if (!b) return;
  const evs = store.getEvents();
  if (evs[evs.length - 1]?.id === b.dataset.undo) store.undo(); else store.undoTo(b.dataset.undo);
  $('toast').hidden = true;
});
export function act(type, data, msg) {
  const ev = store.dispatch(type, data);
  if (msg) toast(msg, ev.id);
  return ev;
}

// Gece adımı geçici durumunu sıfırla
export function resetNS(extra = {}) { Object.assign(G.NS, { cur: null, targets: [], pick: null, apply: null, sailorSelf: false, pre: null }, extra); }
