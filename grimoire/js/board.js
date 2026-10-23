// Grimoire tablası: simgelerin çizimi, sürükleme, ızgaraya yapışma, kilit.
// Konumlar tabla genişliğine oranla saklanır (x, y = merkez / genişlik), böylece ekran boyu değişince düzen korunur.
import { G, $, esc, role, icon, commit, save, uid } from './core.js?v=20261023-1626';
import { remTr } from './data.js?v=20261023-1626';

// Simge boyu tabla genişliğine göre ölçeklenir (telefon ≈ 60px, tablet ≈ 90px), ayar kaydırıcısı bunu çarpar
const base = () => Math.min(92, Math.max(56, W() * 0.16));
export const roleSize = () => Math.round(base() * G.S.board.roleScale);
export const remSize = () => Math.round(base() * 0.68 * G.S.board.remScale);
const sizeOf = t => (t.kind === 'rem' ? remSize() : roleSize());

let handlers = { tapRole: () => {}, tapRem: () => {} };
export const onTap = h => { handlers = { ...handlers, ...h }; };

const board = () => $('board');
export const W = () => board().clientWidth || 320;
export const H = () => board().clientHeight || 400;
export const defaultRatio = () => (window.innerHeight > window.innerWidth ? 1.25 : 0.72);
export function applyHeight() {
  const b = board(), wrap = $('boardWrap');
  if (wrap.classList.contains('full')) { b.style.height = ''; return; }
  const r = G.S.board.ratio || defaultRatio();
  b.style.height = Math.round(b.clientWidth * r) + 'px';
}

// ---- gece sırası numaraları ----
export function nightNumbers() {
  const play = new Set(G.S.tokens.filter(t => t.kind === 'role').map(t => t.role));
  const out = { first: {}, other: {} };
  for (const [k, list] of [['first', G.D.night.firstNight], ['other', G.D.night.otherNight]]) {
    let n = 0;
    for (const id of list) {
      if (!play.has(id)) continue;
      const txt = k === 'first' ? role(id).first : role(id).other;
      if (!txt) continue;
      out[k][id] = ++n;
    }
  }
  return out;
}

const THUMB = 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z';
export function glyphHTML(g) {
  if (g === '👍') return `<svg class="thumb up" viewBox="0 0 24 24"><path d="${THUMB}"/></svg>`;
  if (g === '👎') return `<svg class="thumb down" viewBox="0 0 24 24"><path d="${THUMB}" transform="rotate(180 12 12)"/></svg>`;
  return esc(g || '');
}
export function arcText(txt, path, base) {
  const s = String(txt || '');
  const long = s.length > 11;
  return `<text class="arc" font-size="${long ? Math.max(6.5, base * 11 / s.length) : base}"><textPath href="#${path}" startOffset="50%" text-anchor="middle">${esc(s)}</textPath></text>`;
}

function roleHTML(t, nums) {
  const r = role(t.role), s = roleSize(), w = W();
  const f = G.S.board.nums && nums.first[t.role], o = G.S.board.nums && nums.other[t.role];
  const linked = G.S.tokens.some(q => q.kind === 'rem' && q.owner === t.id);
  return `<div class="tok role t-${r.team}${t.dead ? ' dead' : ''}${t.flip ? ' flip' : ''}${linked ? ' linked' : ''}" data-id="${t.id}"
      style="--s:${s}px;${linked ? `--gc:${colorOf(t.id)};` : ''}left:${t.x * w - s / 2}px;top:${t.y * w - s / 2}px">
    <div class="disc">${icon(t.role, 'ic')}<svg viewBox="0 0 100 100" aria-hidden="true">${arcText(r.name, 'arcB', 12.5)}</svg></div>
    ${f ? `<span class="nb nf">${f}</span>` : ''}${o ? `<span class="nb no">${o}</span>` : ''}
    ${t.dead ? `<span class="shroud"></span>${t.voteUsed ? '' : '<span class="vt" title="Ölü oyu var"></span>'}` : ''}
    ${t.name ? `<span class="pname">${esc(t.name)}</span>` : ''}
  </div>`;
}
function remHTML(t) {
  const s = remSize(), w = W();
  const top = t.role ? role(t.role).name : '';
  const gc = t.owner && colorOf(t.owner);
  return `<div class="tok rem${t.tone ? ' ' + t.tone : ''}${gc ? ' linked' : ''}" data-id="${t.id}" style="--s:${s}px;${gc ? `--gc:${gc};` : ''}left:${t.x * w - s / 2}px;top:${t.y * w - s / 2}px">
    <div class="disc">${t.role ? icon(t.role, 'ic') : `<span class="rtxt">${glyphHTML(t.glyph)}</span>`}
    <svg viewBox="0 0 100 100" aria-hidden="true">${top ? arcText(top, 'arcT', 13) : ''}${arcText(remTr(t.text), 'arcB', 13.5)}</svg></div>
  </div>`;
}

// Her karakter simgesinin kendi rengi var; ona bağlı hatırlatıcılar da aynı renkle çerçevelenir
const PALETTE = ['#e8a838', '#4fc3a1', '#e56fa5', '#6fa8ff', '#b58cf0', '#9ccc4a', '#ff8a5c', '#38c9d8',
  '#d8c13a', '#c46fe0', '#7fd6a0', '#d89b6a', '#8aa0ff', '#f0a0c8', '#6fd0ff', '#b8d86a'];
export function colorOf(roleTokId) {
  const i = G.S.tokens.filter(t => t.kind === 'role').findIndex(t => t.id === roleTokId);
  return i < 0 ? null : PALETTE[i % PALETTE.length];
}

export function renderBoard() {
  const S = G.S, b = board();
  applyHeight();
  const nums = nightNumbers();
  const roles = S.tokens.filter(t => t.kind === 'role').map(t => roleHTML(t, nums)).join('');
  const rems = S.tokens.filter(t => t.kind === 'rem').map(t => remHTML(t)).join('');
  $('tokens').innerHTML = roles + rems;
  b.classList.toggle('locked', !!S.board.locked);
  $('wrapLock').classList.toggle('on', !!S.board.locked);
  $('wrapLock').innerHTML = S.board.locked ? '🔒' : '🔓';
  $('boardWrap').classList.toggle('veiled', !!S.board.hidden);
  $('emptyHint').hidden = S.tokens.length > 0;
}

// ---- yerleştirme ----
const clampXY = (x, y, s) => {
  const w = W(), h = H(), m = s / 2 / w;
  return [Math.min(Math.max(x, m), 1 - m), Math.min(Math.max(y, m), h / w - m)];
};

// Sürüklenen hatırlatıcının kenarı, bir karakter simgesinin ya da ona bağlı başka bir hatırlatıcının kenarına
// TOL px'ten yakınsa (üst üste binmek dahil) o karaktere bağlanır. Yapışma/hizalama yok, yer olduğu gibi kalır.
const TOL = 3;
function nearestOwner(x, y, selfId) {
  const w = W(), rs = remSize() / 2;
  let best = null, bg = Infinity;
  for (const o of G.S.tokens) {
    if (o.id === selfId) continue;
    let owner, r;
    if (o.kind === 'role') { owner = o.id; r = roleSize() / 2; }
    else if (o.owner) { owner = o.owner; r = remSize() / 2; }
    else continue;
    const gap = Math.hypot((o.x - x) * w, (o.y - y) * w) - r - rs;
    if (gap <= TOL && gap < bg) { best = owner; bg = gap; }
  }
  return best ? G.S.tokens.find(t => t.id === best) : null;
}

// Yeni simge için tablada boş yer bul (ortadan başlayıp spiral)
export function freeSpot(kind = 'role') {
  const w = W(), h = H(), s = kind === 'rem' ? remSize() : roleSize();
  const cx = 0.5, cy = h / w / 2;
  const taken = G.S.tokens.map(t => [t.x, t.y]);
  const min = (s * 0.95) / w;
  for (let i = 0; i < 400; i++) {
    const a = i * 0.9, r = (i * s * 0.08) / w;
    let x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    [x, y] = clampXY(x, y, s);
    if (taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) > min)) return [x, y];
  }
  return [cx, cy];
}

// Karakterleri tabla kenarına oval diz (saat 12'den başlayıp saat yönünde)
export function ovalSpots(n) {
  const w = W(), h = H(), s = roleSize(), m = (s * 0.62) / w;
  const rx = 0.5 - m, ry = h / w / 2 - m, cy = h / w / 2;
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    let x = 0.5 + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    return clampXY(x, y, s);
  });
}

// Bir karakter simgesine bağlı hatırlatıcı için konum: simgeden tabla merkezine doğru, sıraya göre yelpaze
export function remSpot(owner, exceptId) {
  const w = W(), h = H(), rs = roleSize(), ms = remSize();
  const cx = 0.5, cy = h / w / 2;
  const base = Math.atan2(cy - owner.y, cx - owner.x);
  const k = G.S.tokens.filter(t => t.kind === 'rem' && t.owner === owner.id && t.id !== exceptId).length;
  const steps = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  const a = base + (steps[k % steps.length] * Math.PI) / 4.2;
  const d = (rs / 2 + ms / 2 + 3 + Math.floor(k / steps.length) * ms) / w;
  return clampXY(owner.x + Math.cos(a) * d, owner.y + Math.sin(a) * d, ms);
}

// Saat yönünde oturma sırası (tabla merkezine göre açı, saat 12'den başlayarak)
export function clockwise() {
  const w = W(), cy = H() / w / 2;
  const ang = t => { let a = Math.atan2(t.y - cy, t.x - 0.5) + Math.PI / 2; if (a < 0) a += 2 * Math.PI; return a; };
  return G.S.tokens.filter(t => t.kind === 'role' && role(t.role).team !== 'fabled').sort((a, b) => ang(a) - ang(b));
}

// ---- sürükleme ----
let drag = null;
function down(e) {
  const el = e.target.closest('.tok');
  if (!el || e.button > 0) return;
  const t = G.S.tokens.find(x => x.id === el.dataset.id);
  if (!t) return;
  const movable = t.kind === 'rem' || !G.S.board.locked;
  drag = { el, t, sx: e.clientX, sy: e.clientY, moved: false, movable, pid: e.pointerId, ox: t.x, oy: t.y,
    kids: t.kind === 'role' ? [...document.querySelectorAll('#tokens .tok.rem')].filter(r => G.S.tokens.find(x => x.id === r.dataset.id)?.owner === t.id) : [] };
  if (movable) { el.setPointerCapture(e.pointerId); e.preventDefault(); }
}
function setPreview(o, on) {
  const el = document.querySelector(`#tokens .tok[data-id="${o.id}"]`); if (!el) return;
  el.classList.toggle('linked', on || G.S.tokens.some(q => q.kind === 'rem' && q.owner === o.id && q.id !== drag?.t.id));
  if (on) el.style.setProperty('--gc', colorOf(o.id));
}
function move(e) {
  if (!drag || e.pointerId !== drag.pid || !drag.movable) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  if (!drag.moved) { drag.moved = true; drag.el.classList.add('drag'); }
  const w = W(), s = sizeOf(drag.t);
  let [x, y] = clampXY(drag.ox + dx / w, drag.oy + dy / w, s);
  if (drag.t.kind === 'rem') {
    // canlı önizleme: yaklaşınca renk değişir, uzaklaşınca eski haline döner
    const o = nearestOwner(x, y, drag.t.id), prev = drag.target;
    drag.target = o;
    if ((o && o.id) !== (prev && prev.id)) {
      if (prev) setPreview(prev, false);
      if (o) setPreview(o, true);
      const c = o && colorOf(o.id);
      drag.el.classList.toggle('linked', !!c);
      c ? drag.el.style.setProperty('--gc', c) : drag.el.style.removeProperty('--gc');
    }
  }
  drag.nx = x; drag.ny = y;
  drag.el.style.left = x * w - s / 2 + 'px';
  drag.el.style.top = y * w - s / 2 + 'px';
  const ddx = (x - drag.ox) * w, ddy = (y - drag.oy) * w;
  drag.kids.forEach(k => { k.style.transform = `translate(${ddx}px,${ddy}px)`; });
}
function up(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag; drag = null;
  d.el.classList.remove('drag');
  if (!d.moved) {
    if (e.type === 'pointercancel') return;
    return d.t.kind === 'rem' ? handlers.tapRem(d.t) : handlers.tapRole(d.t);
  }
  const x = d.nx, y = d.ny;
  commit(S => {
    const t = S.tokens.find(q => q.id === d.t.id); if (!t) return;
    const ddx = x - t.x, ddy = y - t.y;
    t.x = x; t.y = y;
    // hatırlatıcı: yakına bırakıldıysa yapış, uzağa bırakıldıysa ayrıl
    if (t.kind === 'rem') t.owner = d.target ? d.target.id : null;
    if (t.kind === 'role') S.tokens.forEach(r => {
      if (r.kind === 'rem' && r.owner === t.id) [r.x, r.y] = clampXY(r.x + ddx, r.y + ddy, remSize());
    });
  });
}

// ---- tabla yüksekliği tutamacı ----
let rz = null;
function rzDown(e) { rz = { y: e.clientY, h: H(), pid: e.pointerId }; e.target.setPointerCapture(e.pointerId); e.preventDefault(); }
function rzMove(e) {
  if (!rz || e.pointerId !== rz.pid) return;
  const h = Math.max(220, rz.h + e.clientY - rz.y);
  board().style.height = h + 'px';
}
function rzUp(e) {
  if (!rz || e.pointerId !== rz.pid) return;
  rz = null;
  G.S.board.ratio = H() / W(); save();
  renderBoard();
}

export function initBoard() {
  const t = $('tokens');
  t.addEventListener('pointerdown', down);
  t.addEventListener('pointermove', move);
  t.addEventListener('pointerup', up);
  t.addEventListener('pointercancel', up);
  const g = $('boardGrip');
  g.addEventListener('pointerdown', rzDown);
  g.addEventListener('pointermove', rzMove);
  g.addEventListener('pointerup', rzUp);
  g.addEventListener('pointercancel', rzUp);
  let lastW = 0;
  new ResizeObserver(() => { const w = W(); if (w !== lastW) { lastW = w; renderBoard(); } }).observe(board());
}

export function addRoleToken(roleId, at) {
  const [x, y] = at || freeSpot('role');
  const t = { id: uid(), kind: 'role', role: roleId, x, y, dead: false, flip: false, voteUsed: false, name: '' };
  G.S.tokens.push(t);
  return t;
}
