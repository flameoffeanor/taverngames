// Grimoire tablası: simgelerin çizimi, sürükleme, ızgaraya yapışma, kilit.
// Konumlar tabla genişliğine oranla saklanır (x, y = merkez / genişlik), böylece ekran boyu değişince düzen korunur.
import { G, $, esc, role, icon, commit, save, uid } from './core.js?v=20261023-1332';
import { remTr } from './data.js?v=20261023-1332';

const GRID = 14; // tabla genişliğinde 14 sütun: telefonda ≈25px, gözle görülür adım
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

function arcText(txt, path, base) {
  const s = String(txt || '');
  const long = s.length > 11;
  return `<text class="arc" font-size="${long ? Math.max(8.5, base * 11 / s.length) : base}"><textPath href="#${path}" startOffset="50%" text-anchor="middle">${esc(s)}</textPath></text>`;
}

function roleHTML(t, nums) {
  const r = role(t.role), s = roleSize(), w = W();
  const f = G.S.board.nums && nums.first[t.role], o = G.S.board.nums && nums.other[t.role];
  return `<div class="tok role t-${r.team}${t.dead ? ' dead' : ''}${t.flip ? ' flip' : ''}" data-id="${t.id}"
      style="--s:${s}px;left:${t.x * w - s / 2}px;top:${t.y * w - s / 2}px">
    <div class="disc">${icon(t.role, 'ic')}<svg viewBox="0 0 100 100" aria-hidden="true">${arcText(r.name, 'arcB', 12.5)}</svg></div>
    ${f ? `<span class="nb nf">${f}</span>` : ''}${o ? `<span class="nb no">${o}</span>` : ''}
    ${t.dead ? `<span class="shroud"></span>${t.voteUsed ? '' : '<span class="vt" title="Ölü oyu var"></span>'}` : ''}
    ${t.name ? `<span class="pname">${esc(t.name)}</span>` : ''}
  </div>`;
}
function remHTML(t) {
  const s = remSize(), w = W();
  const top = t.role ? role(t.role).name : '';
  return `<div class="tok rem${t.tone ? ' ' + t.tone : ''}" data-id="${t.id}" style="--s:${s}px;left:${t.x * w - s / 2}px;top:${t.y * w - s / 2}px">
    <div class="disc">${t.role ? icon(t.role, 'ic') : `<span class="rtxt">${esc(t.glyph || '')}</span>`}
    <svg viewBox="0 0 100 100" aria-hidden="true">${top ? arcText(top, 'arcT', 13) : ''}${arcText(remTr(t.text), 'arcB', 13.5)}</svg></div>
  </div>`;
}

// Bir karaktere yapışık hatırlatıcılar: etraflarına çerçeve çiz
function groupsHTML() {
  const w = W(), out = [];
  for (const o of G.S.tokens) {
    if (o.kind !== 'role') continue;
    const kids = G.S.tokens.filter(t => t.kind === 'rem' && t.owner === o.id);
    if (!kids.length) continue;
    const rs = roleSize(), ms = remSize();
    let x1 = o.x * w - rs / 2, x2 = o.x * w + rs / 2, y1 = o.y * w - rs / 2, y2 = o.y * w + rs / 2;
    for (const k of kids) {
      x1 = Math.min(x1, k.x * w - ms / 2); x2 = Math.max(x2, k.x * w + ms / 2);
      y1 = Math.min(y1, k.y * w - ms / 2); y2 = Math.max(y2, k.y * w + ms / 2);
    }
    const pad = 5;
    out.push(`<div class="grp" data-g="${o.id}" style="left:${x1 - pad}px;top:${y1 - pad}px;width:${x2 - x1 + pad * 2}px;height:${y2 - y1 + pad * 2}px"></div>`);
  }
  return out.join('');
}

export function renderBoard() {
  const S = G.S, b = board();
  applyHeight();
  const nums = nightNumbers();
  const roles = S.tokens.filter(t => t.kind === 'role').map(t => roleHTML(t, nums)).join('');
  const rems = S.tokens.filter(t => t.kind === 'rem').map(t => remHTML(t)).join('');
  $('tokens').innerHTML = groupsHTML() + roles + rems;
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
const snapV = v => Math.round(v * GRID) / GRID;
const snapXY = (x, y, s) => clampXY(snapV(x), snapV(y), s);

// Hatırlatıcı bir karakter simgesine yeterince yakınsa onun hedefi olur
function nearestRole(x, y, exceptId) {
  const w = W(), lim = roleSize() / 2 + remSize() * 0.55;
  let best = null, bd = Infinity;
  for (const r of G.S.tokens) {
    if (r.kind !== 'role') continue;
    const d = Math.hypot((r.x - x) * w, (r.y - y) * w);
    if (d < lim && d < bd) { best = r; bd = d; }
  }
  return best;
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
    if (G.S.board.snap) { x = snapV(x); y = snapV(y); }
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
function clearTarget() { document.querySelectorAll('#tokens .tok.target').forEach(n => n.classList.remove('target')); }
function move(e) {
  if (!drag || e.pointerId !== drag.pid || !drag.movable) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  if (!drag.moved) {
    drag.moved = true; drag.el.classList.add('drag'); board().classList.add('dragging');
    // sürüklenen karakterin ya da hatırlatıcının çerçevesini geçici gizle
    const gid = drag.t.kind === 'role' ? drag.t.id : drag.t.owner;
    if (gid) document.querySelector(`#tokens .grp[data-g="${gid}"]`)?.classList.add('off');
  }
  const w = W(), s = sizeOf(drag.t);
  let [x, y] = clampXY(drag.ox + dx / w, drag.oy + dy / w, s);
  clearTarget(); drag.target = null;
  if (drag.t.kind === 'role' && G.S.board.snap) [x, y] = snapXY(x, y, s);
  else if (drag.t.kind === 'rem') {
    const r = nearestRole(x, y);
    if (r) { drag.target = r; [x, y] = remSpot(r, drag.t.id); document.querySelector(`#tokens .tok[data-id="${r.id}"]`)?.classList.add('target'); }
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
  d.el.classList.remove('drag'); board().classList.remove('dragging'); clearTarget();
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
