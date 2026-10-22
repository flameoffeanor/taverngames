// Masa (Masa ekranı) ve paneldeki küçük masa.
// Koltuk = [disk + altında oyuncu adı] [rol adı + hatırlatıcılar]
import { G, hooks, $, esc, role, P, icon, remTr, guardSheet } from './core.js?v=20261023-0147';
import * as store from './store.js?v=20261023-0147';
import { layout, nearestSeat } from './table.js?v=20261023-0147';
import * as rules from './rules.js?v=20261023-0147';

let L = null;   // son masa yerleşimi
export const lastLayout = () => L;

// ---------------- metin ölçümü (hatırlatıcıları satırlara dizmek için) ----------------
const cv = document.createElement('canvas').getContext('2d');
function textW(text, px, weight = 700) {
  cv.font = `${weight} ${px}px Inter, system-ui, sans-serif`;
  return cv.measureText(text).width;
}
// Uzun yazı kutuya sığsın diye küçülür (en fazla %28)
function fitPx(text, width, px, weight = 700, min = 0.72) {
  const w = textW(text, px, weight);
  return w <= width ? px : Math.max(px * min, px * width / w);
}

// ---------------- hatırlatıcı hapları ----------------
function pillItems(p, c) {
  const its = [];
  if (p.believed) its.push({ role: p.believed, text: 'Sanıyor: ' + role(p.believed).name, cls: 'b-bel' });
  if (p.gain) its.push({ role: p.gain, text: 'Yetenek: ' + role(p.gain).name, cls: 'b-gain' });
  p.reminders.forEach(r => {
    const tg = rules.tagOf(r);
    its.push({ role: r.role, text: remTr(r.text), cls: (tg ? 'b-' + tg : '') + (c.active(r, p) ? '' : ' off') });
  });
  return its;
}
// Hapları satırlara diz; sığmayanların yerine "+N"
function packPills(items, width, rows, pf, withIcon) {
  if (!items.length || !rows) return { shown: [], more: items.length };
  const pw = it => Math.min(width, textW(it.text, pf) + pf * 1.25 + (withIcon && it.role ? pf * 1.8 : 0) + 5);
  const moreW = n => textW('+' + n, pf) + pf * 1.25 + 5;
  const gapX = 4;
  let row = 0, x = 0;
  const placed = [];
  for (const it of items) {
    const w = pw(it);
    if (x > 0 && x + w > width + 0.5) { row++; x = 0; }
    if (row >= rows) break;
    placed.push({ it, row, x, w }); x += w + gapX;
  }
  let more = items.length - placed.length;
  // "+N" son satıra sığsın: gerekirse sondan hap çıkar
  while (more > 0 && placed.length) {
    const last = placed[placed.length - 1];
    const endX = last.row === rows - 1 ? last.x + last.w + gapX : 0;
    if (last.row < rows - 1 || endX + moreW(more) <= width + 0.5) break;
    placed.pop(); more++;
  }
  return { shown: placed.map(p => p.it), more };
}
function pillsHTML(p, seat, Lx, c) {
  const items = pillItems(p, c);
  if (!items.length || !Lx.rows) return '';
  const withIcon = seat.infoW >= 150;
  const { shown, more } = packPills(items, seat.infoW, Lx.rows, Lx.pf, withIcon);
  return `<span class="pills">${shown.map(it => `<span class="rp ${it.cls}">${withIcon && it.role ? icon(it.role) : ''}<span>${esc(it.text)}</span></span>`).join('')}${more > 0 ? `<span class="rp b-more">+${more}</span>` : ''}</span>`;
}

// Rol adı tokenın içinde, altta yay şeklinde (gerçek BotC tokenları gibi). Yol index.html'deki #tokArc.
function arcText(name, S) {
  const base = Math.min(21, Math.max(15, 900 / S)); // küçük diskte en az ~9px
  const w = textW(name, base, 800);                 // 100 birimlik disk içinde
  const fs = Math.max(base * 0.6, Math.min(base, base * 116 / Math.max(w, 1)));
  return `<svg class="arct" viewBox="0 0 100 100" aria-hidden="true"><text style="font-size:${fs.toFixed(1)}px"><textPath href="#tokArc" startOffset="50%" text-anchor="middle">${esc(name)}</textPath></text></svg>`;
}

// ---------------- koltuk ----------------
export function seatHTML(p, i, seat, Lx, o = {}) {
  const r = role(p.role), c = o.c;
  const evilGood = c && c.isEvil(p) && !['minion', 'demon'].includes(r.team);
  const goodEvil = c && !c.isEvil(p) && ['minion', 'demon'].includes(r.team);
  const trav = p.traveller || r.team === 'traveller';
  const cls = ['seat', 'o-' + seat.orient, seat.flip ? 'flip' : '', 't-' + r.team, p.dead ? 'dead' : '', o.actor ? 'actor' : '',
    o.ti >= 0 ? 'target' : '', o.dim ? 'dim' : '', o.mini ? 'mini' : '', o.pick ? 'pickable' : '', evilGood ? 'turned' : '', goodEvil ? 'turned-g' : ''].filter(Boolean).join(' ');
  const iw = seat.infoW, S = Lx.S;
  const nameW = seat.orient === 'v' ? seat.w : Math.max(S + Lx.gap, S * 1.15);
  const pnPx = fitPx(p.name, nameW - 4, Lx.f, 600, 0.7);
  const tag = o.mini ? 'button' : 'div';
  return `<${tag} class="${cls}" data-pid="${p.id}" data-seat="${i}"${o.mini ? ' data-c="tgt"' : ''} style="left:${seat.x}px;top:${seat.y}px;width:${seat.w}px;height:${seat.h}px;--s:${S}px;--f:${Lx.f}px;--pf:${Lx.pf}px;--lab:${Lx.lab}px">
    <span class="dcol"><span class="disc arc">${icon(p.role, 'ic')}${arcText(r.name, S)}${p.dead ? `<i class="shroud"></i>${p.ghost ? '<i class="ghost" title="Ölü oyu var"></i>' : ''}` : ''}${o.ti >= 0 ? `<i class="tnum">${o.ti + 1}</i>` : ''}${trav ? '<i class="trv" title="Gezgin"></i>' : ''}</span><span class="pn${p.unnamed ? ' unnamed' : ''}" style="font-size:${pnPx}px">${esc(p.name)}</span></span>
    <span class="sinfo" style="width:${iw}px">${pillsHTML(p, seat, Lx, c)}</span></${tag}>`;
}

// ---------------- Masa ekranı ----------------
export function renderBoard(centerHTML) {
  const board = $('board'), S = G.S;
  const W0 = board.clientWidth, H0 = board.clientHeight;
  if (!W0 || !H0) return;
  L = layout(W0, H0, S.sides);
  const cx = rules.ctx(S, role);
  const tg = hooks.targeting();
  const actor = hooks.actor();
  const t = L.table;
  let html = '';
  if (t.w >= 120 && t.h >= 80) html += `<div class="tbl${G.edit ? ' editing' : ''}" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px">${centerHTML}</div>`;
  const pickMode = hooks.pickMode();
  S.seats.forEach((pid, i) => {
    const p = P(pid), seat = L.seats[i]; if (!seat || !p) return;
    const ti = hooks.selIndex(pid);
    let dim = false;
    if (tg) dim = !(tg.can ? tg.can(p) : rules.canTarget(tg.cfg, S, role, tg.step, p));
    if (pickMode && pickMode.can && !pickMode.can(p)) dim = true;
    html += seatHTML(p, i, seat, L, { c: cx, actor: pid === actor, ti, dim, pick: !!tg || !!pickMode });
  });
  board.innerHTML = html;
  board.classList.toggle('editing', canDrag());
}

// ---------------- paneldeki küçük masa ----------------
// sel: seçili oyuncular (sıralı), can(p): seçilebilir mi, actor: uyanan oyuncu
export function miniMapHTML(width, height, { sel = [], can = () => true, actor = null, mark = () => '' } = {}) {
  const S = G.S, Lm = layout(width, height, S.sides, { mini: true });
  const cx = rules.ctx(S, role);
  let h = `<div class="minimap" style="width:${width}px;height:${height}px">`;
  S.seats.forEach((pid, i) => {
    const p = P(pid), seat = Lm.seats[i]; if (!p || !seat) return;
    h += seatHTML(p, i, seat, Lm, { c: cx, mini: true, ti: sel.indexOf(pid), dim: !can(p), actor: pid === actor, pick: true });
  });
  return h + '</div>';
}

// ---------------- dokunma / sürükleme (Masa ekranı) ----------------
const board = $('board');
const canDrag = () => G.edit || !!G.S?.pre;   // ilk gece öncesinde yerler sürüklenebilir
let drag = null, noClick = false;
const blockClick = () => { noClick = true; setTimeout(() => { noClick = false; }, 450); };
export const clickBlocked = () => noClick;
board.addEventListener('contextmenu', e => e.preventDefault());
board.addEventListener('pointerdown', e => {
  // sadece tokenın kendisi (disk) dokunmaya açık
  const el = e.target.closest('.seat'); if (!el || !e.target.closest('.disc') || e.target.closest('[data-c]')) return;
  drag = { el, pid: el.dataset.pid, seat: +el.dataset.seat, x: e.clientX, y: e.clientY, moved: false, long: false };
  if (canDrag()) { try { e.target.closest('.disc').setPointerCapture(e.pointerId); } catch (_) {} }   // disk yakalar: click hedefi disk kalır
  drag.timer = setTimeout(() => {
    if (drag && !drag.moved) {
      drag.long = true; blockClick(); guardSheet(); navigator.vibrate?.(15);
      window.getSelection?.().removeAllRanges?.();
      hooks.openPlayer(drag.pid);
    }
  }, 520);
});
board.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, d = Math.hypot(dx, dy);
  if (d > 10) clearTimeout(drag.timer);
  if (!drag.moved && canDrag() && d > 12) { drag.moved = true; drag.el.classList.add('dragging'); }
  if (drag.moved) drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
});
board.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; clearTimeout(d.timer);
  if (d.moved) {
    blockClick();
    const s = L.seats[d.seat];
    const to = nearestSeat(L.seats, s.cx + (e.clientX - d.x), s.cy + (e.clientY - d.y), L.S * 1.4);
    if (to >= 0 && to !== d.seat) store.dispatch('swap', { a: d.pid, b: G.S.seats[to] }); else hooks.renderAll();
  }
});
board.addEventListener('pointercancel', () => { if (drag) { clearTimeout(drag.timer); const m = drag.moved; drag = null; if (m) hooks.renderAll(); } });
