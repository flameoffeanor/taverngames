// Ortak durum, kayıt, geri alma ve küçük yardımcılar.
import { normId } from './data.js?v=20261102-0451';

const KEY = 'tg-g3-state';
export const G = { D: null, S: null };

export function fresh() {
  return {
    v: 1,
    script: { name: '', roles: [] },
    setup: { players: 8, pick: {}, abilities: true, dup: false },
    tokens: [],
    bluffs: [null, null, null],
    board: { ratio: 0, locked: false, snap: true, tools: true, nums: true, roleScale: 1, remScale: 1, hidden: false },
    night: { tab: 'first', showDead: true, showOut: false, done: { first: [], other: [] } },
    notes: '',
    customInfo: [],
    deal: null,
    open: {},
  };
}

export function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  const f = fresh();
  if (!s || s.v !== 1) return (G.S = f);
  // eksik alanları tamamla
  for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
  s.board = { ...f.board, ...s.board };
  s.setup = { ...f.setup, ...s.setup };
  s.night = { ...f.night, ...s.night, done: { ...f.night.done, ...(s.night || {}).done } };
  return (G.S = s);
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(G.S)); } catch (e) {} }

// ---- ortak (iki yönetici arasında senkron) durum ----
// Ortak: oyunun kendisi. Ayrı kalan: pencereler, sekmeler, perde, simge boyutları, yerel notlar. (Oda sohbeti ayrı düğümde: sync.js)
const JKEYS = ['script', 'setup', 'bluffs', 'customInfo', 'deal', 'fangguDone'];
export function sharedMap(S) {
  const m = {};
  for (const k of JKEYS) m['j/' + k] = JSON.stringify(S[k] === undefined ? null : S[k]);
  m['j/done'] = JSON.stringify(S.night.done);
  for (const t of S.tokens) m['t/' + t.id] = JSON.stringify(t);
  return m;
}
export function applySharedMap(S, m) {
  for (const k of JKEYS) { const v = m['j/' + k]; if (v !== undefined) S[k] = JSON.parse(v); }
  if (m['j/done'] !== undefined) S.night.done = { first: [], other: [], ...JSON.parse(m['j/done']) };
  S.tokens = Object.keys(m).filter(k => k.startsWith('t/')).map(k => k.slice(2)).sort().map(id => JSON.parse(m['t/' + id]));
}
export const hooks = { onCommit: null };
export const syncNow = () => { if (hooks.onCommit) hooks.onCommit(sharedMap(G.S)); };

// ---- değişiklik + geri alma ----
// Geri alma: yalnızca kendi son hamlenin değiştirdiği parçaları eski haline getirir (diğer yöneticinin hamlelerine dokunmaz).
const hist = [];
const subs = new Set();
export const subscribe = fn => subs.add(fn);
export function emit() { save(); subs.forEach(f => f()); }
// fn durumu yerinde değiştirir; quiet=true ise geri alma kaydı tutulmaz (ayar, not vb.)
export function commit(fn, quiet = false) {
  const before = sharedMap(G.S);
  fn(G.S);
  const after = sharedMap(G.S);
  if (!quiet) {
    const patch = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (before[k] !== after[k]) patch[k] = before[k];
    if (Object.keys(patch).length) { hist.push(patch); if (hist.length > 60) hist.shift(); }
  }
  emit();
  if (hooks.onCommit) hooks.onCommit(after);
}
export const canUndo = () => hist.length > 0;
export const clearHistory = () => { hist.length = 0; };
export function undo() {
  if (!hist.length) return false;
  const patch = hist.pop(), cur = sharedMap(G.S);
  for (const k of Object.keys(patch)) { if (patch[k] === undefined) delete cur[k]; else cur[k] = patch[k]; }
  applySharedMap(G.S, cur);
  emit();
  if (hooks.onCommit) hooks.onCommit(cur);
  return true;
}

// ---- yardımcılar ----
export const $ = id => document.getElementById(id);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Sheet metni: <b> etiketlerine izin ver, *METİN* kalın, :reminder: küçük işaret
export function rich(s) {
  return esc(s)
    .replace(/&lt;(\/?)b&gt;/gi, '<$1b>')
    .replace(/\*([^*]+)\*/g, '<b>$1</b>')
    .replace(/:reminder:/g, '<i class="rm-g" title="hatırlatıcı"></i>');
}
export const role = id => (G.D && G.D.roles[id]) || { id, name: id || '?', team: 'townsfolk', ability: '', first: '', other: '', reminders: [], remindersGlobal: [] };

const initials = n => esc(String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr'));
export const icon = (id, cls = 'ic') =>
  `<span class="${cls} ini" data-i="${initials(role(id).name)}"><img src="/botc_assets/${esc(id)}.png" alt="" draggable="false" onerror="this.remove()"></span>`;

export function noteAlert(label, onClick) {
  const b = $('noteAlert'); if (!b) return;
  b.textContent = label; b.hidden = false; b.onclick = () => { b.hidden = true; onClick && onClick(); };
  clearTimeout(noteAlert.t); noteAlert.t = setTimeout(() => { b.hidden = true; }, 6000);
}
export function toast(msg, ms = 2200) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}

// ---- modal ----
let modalBack = null;
export function openModal(title, html, mount, { wide = false, back = null, opaque = false } = {}) {
  const m = $('modal');
  m.querySelector('.m-card').classList.toggle('wide', wide);
  m.classList.toggle('opaque', opaque);
  $('mTitle').innerHTML = title;
  $('mBack').hidden = !back;
  modalBack = back;
  const body = $('mBody');
  const keep = m.hidden ? 0 : body.scrollTop;
  body.innerHTML = html;
  m.hidden = false;
  document.body.classList.add('noscroll');
  if (mount) mount(body);
  if (keep && openModal.same === title) body.scrollTop = keep;
  openModal.same = title;
}
export function closeModal() {
  $('modal').hidden = true; $('mBody').innerHTML = ''; openModal.same = null;
  document.body.classList.remove('noscroll');
}
$('mClose').onclick = closeModal;
$('mBack').onclick = () => modalBack && modalBack();
$('modal').querySelector('.m-bg').onclick = closeModal;

export function confirmBox(text, okText, cb, { danger = true, alt = null } = {}) {
  openModal('Emin misin?', `<p class="lead">${esc(text)}</p>
    <div class="row-btns">${alt ? `<button class="btn" id="cAlt">${esc(alt.text)}</button>` : ''}
    <button class="btn ${danger ? 'warn' : 'primary'}" id="cOk">${esc(okText)}</button>
    <button class="btn ghost" id="cNo">Vazgeç</button></div>`, () => {
    $('cOk').onclick = () => { closeModal(); cb(); };
    $('cNo').onclick = closeModal;
    if (alt) $('cAlt').onclick = () => { closeModal(); alt.cb(); };
  });
}

// ---- oyuncuya gösterilen tam ekran ----
export function showFull(html, cls = '') {
  const el = $('show');
  el.className = 'show ' + cls;
  el.innerHTML = `<div class="show-in">${html}</div><p class="show-hint">Kapatmak için dokun</p>`;
  el.hidden = false;
}
$('show').addEventListener('click', () => { $('show').hidden = true; });
$('show').addEventListener('contextmenu', e => e.preventDefault());

export const bigTok = id => `<div class="bigtok t-${role(id).team}"><div class="disc">${icon(id, 'ic')}</div><span>${esc(role(id).name)}</span></div>`;

// Script'teki roller (yoksa tüm Türkçe roller)
export function scriptIds() {
  const S = G.S, D = G.D;
  // Sıra: sitedeki gibi Sheet'in Karakterler sekmesindeki satır sırası (script'teki sıra değil)
  if (S.script.roles.length) {
    const rank = Object.fromEntries(Object.keys(D.roles).map((id, i) => [id, i]));
    return S.script.roles.filter(id => D.roles[id]).sort((x, y) => rank[x] - rank[y]);
  }
  return Object.keys(D.roles).filter(id => !D.roles[id].english);
}
export const boardRoles = () => G.S.tokens.filter(t => t.kind === 'role');
export const inPlay = () => new Set(boardRoles().map(t => t.role));
export { normId };
