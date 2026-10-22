// Dikdörtgen masa geometrisi. Kenarlar ekrana göredir (Üst/Sağ/Alt/Sol ekranda gördüğün gibi).
// Koltuklar sol üstten saat yönünde: üst soldan sağa, sağ yukarıdan aşağı, alt sağdan sola, sol aşağıdan yukarı.
//
// Her koltuk bir "hücre":
//   [disk + altında oyuncu adı] [bilgi kutusu: rol adı + hatırlatıcı satırları]
//  - Yan sütunlarda disk dış kenarda, bilgi kutusu masanın içine bakar (yatay hücre).
//  - Üst/alt sırada yer varsa yatay hücre, yoksa disk üstte, yazılar altta (dikey hücre).
// Ortadaki masa önemsiz: ne kalırsa o. Amaç disk, yazı ve hatırlatıcıların olabildiğince büyük olması.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function defaultSides(n, portrait = true) {
  if (n <= 4) return { top: Math.ceil(n / 2), right: 0, bottom: Math.floor(n / 2), left: 0 };
  // Dik ekranda yan sütunlar kalabalık, üst/alt kısa; yatayda tersi
  const short = n >= 9 ? 2 : 1;
  const rest = n - short * 2;
  const a = Math.ceil(rest / 2), b = Math.floor(rest / 2);
  return portrait ? { top: short, right: a, bottom: short, left: b } : { top: a, right: short, bottom: b, left: short };
}

export function sideOfSeat(i, sides) {
  const order = ['top', 'right', 'bottom', 'left'];
  let acc = 0;
  for (const k of order) { acc += sides[k]; if (i < acc) return k; }
  return 'left';
}

// Boyutlar. S = disk çapı.
export function dims(S, mini, rows) {
  const f = mini ? clamp(S * 0.3, 10.5, 14) : clamp(S * 0.2, 11, 16);   // yazı boyu
  const lab = Math.round(f * 1.3);                                     // tek satır yazı yüksekliği
  const pf = mini ? f : clamp(f * 0.88, 10.5, 14);                     // hatırlatıcı yazı boyu
  const pill = Math.round(pf * 1.5 + 4);                               // bir hatırlatıcı satırı (boşluk dahil)
  const minInfo = mini ? f * 4.4 : f * 5.6;   // mini: rol adı; masa: hatırlatıcılar                            // rol adını okutacak en dar kutu
  const maxInfo = mini ? f * 8.5 : f * 12;
  const discCol = S + lab;                                             // disk + altındaki isim
  const infoH = mini ? lab : rows * pill + (rows ? 2 : 0);             // mini: rol adı; masa: hatırlatıcılar (rol adı diskin içinde)
  return { f, lab, pf, pill, rows, minInfo, maxInfo, discCol, infoH };
}

/**
 * @param W,H  alan boyutu
 * @param sides {top,right,bottom,left}
 * @param opt  {mini:boolean, rows:number}
 * @returns {S, f, pf, pill, rows, lab, seats:[{x,y,w,h,cx,cy,orient,flip,side,infoW,infoH}], table:{x,y,w,h}}
 *   x,y,w,h: hücre kutusu; cx,cy: disk merkezi
 */
export function layout(W, H, sides, opt = {}) {
  if (opt.mini) return layoutOnce(W, H, sides, { mini: true, rows: 0 });
  // Önce 3 hatırlatıcı satırı ayır; disk çok küçülüyorsa 2'ye, 1'e düş.
  const tries = opt.rows != null ? [opt.rows] : [3, 2, 1, 0];
  let best = null;
  for (const rows of tries) {
    const r = layoutOnce(W, H, sides, { rows });
    if (!r.forced && r.S >= 54) return r;
    if (!best || (!r.forced && (best.forced || r.S > best.S))) best = r;
  }
  return best;
}

function layoutOnce(W, H, sides, opt) {
  const mini = !!opt.mini, rows = opt.rows || 0;
  const gap = mini ? 3 : 5, pad = mini ? 2 : 3;
  const L = sides.left || 0, R = sides.right || 0, T = sides.top || 0, B = sides.bottom || 0;
  const cols = (L ? 1 : 0) + (R ? 1 : 0), vert = Math.max(L, R);

  // Disk çapı S ile yerleşim dener; sığmazsa null
  function attempt(S) {
    const d = dims(S, mini, rows);
    // yan sütun hücresi (yatay): [disk sütunu][bilgi]
    let sideInfo = 0;
    if (cols) {
      sideInfo = (W - 2 * pad - cols * (S + gap) - 4) / cols;
      sideInfo = Math.min(sideInfo, d.maxInfo);
      if (sideInfo < d.minInfo) return null;
    }
    const sideH = Math.max(d.discCol, d.infoH);
    // üst/alt sıra
    const row = n => {
      if (!n) return { h: 0 };
      const slot = (W - 2 * pad) / n;
      const hInfo = slot - S - gap - 6;
      if (hInfo >= d.minInfo) return { orient: 'h', slot, h: Math.max(d.discCol, d.infoH), infoW: Math.min(hInfo, d.maxInfo) };
      // dikey hücre: disk + isim üstte, rol ve hatırlatıcılar altta
      const vW = slot - 4;
      if (vW < Math.max(S, d.minInfo * 0.85)) return null;
      return { orient: 'v', slot, h: d.discCol + d.infoH, infoW: Math.min(vW, d.maxInfo) };
    };
    const top = row(T), bot = row(B);
    if (!top || !bot) return null;
    const band = H - 2 * pad - top.h - bot.h - (T ? gap : 0) - (B ? gap : 0);
    if (vert && band < vert * sideH + (vert - 1) * 2) return null;
    if (!vert && band < 0) return null;
    return { S, d, sideH, sideInfo, top, bot };
  }

  let lo = mini ? 16 : 30, hi = mini ? 60 : 124, best = null;
  for (let it = 0; it < 22; it++) {
    const mid = (lo + hi) / 2, r = attempt(mid);
    if (r) { best = r; lo = mid; } else hi = mid;
  }
  let forced = false;
  if (!best) { best = attempt(lo) || forceFit(lo); forced = true; }
  function forceFit(S) { // hiçbir şey sığmıyorsa en küçük boyutla yine de diz
    const d = dims(S, mini, rows);
    const v = n => ({ orient: 'v', slot: (W - 2 * pad) / Math.max(n, 1), h: n ? d.discCol + d.infoH : 0, infoW: d.minInfo });
    return { S, d, sideH: Math.max(d.discCol, d.infoH), sideInfo: d.minInfo, top: v(T), bot: v(B) };
  }

  const { S, d, sideH, sideInfo, top, bot } = best;
  const seats = [];
  const discY = (y, h) => y + (h - d.discCol) / 2 + S / 2;   // disk sütunu hücrede dikey ortalı
  const rowCells = (n, r, y, side) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const cxSlot = pad + r.slot * (i + 0.5);
      if (r.orient === 'h') {
        const w = S + gap + r.infoW, x = cxSlot - w / 2;
        // sıranın sağ yarısı aynalanır (disk dışta, hatırlatıcılar içte): simetrik görünüm
        const flip = !mini && (i + 0.5) > n / 2 + 0.01;
        const xx = flip ? cxSlot + w / 2 - w : x;
        out.push({ x: xx, y, w, h: r.h, cx: flip ? xx + w - S / 2 : x + S / 2, cy: discY(y, r.h), orient: 'h', flip, side, infoW: r.infoW, infoH: r.h });
      } else {
        const w = Math.max(S, r.infoW), x = cxSlot - w / 2;
        // alt sırada hatırlatıcılar diskin üstünde (masanın ortasına doğru): simetri
        const cy = side === 'bottom' && !mini ? y + r.h - d.discCol + S / 2 : y + S / 2;
        out.push({ x, y, w, h: r.h, cx: cxSlot, cy, orient: 'v', flip: side === 'bottom' && !mini, side, infoW: w, infoH: d.infoH });
      }
    }
    return out;
  };
  const yTop = pad, yBot = H - pad - bot.h;
  const bandTop = pad + top.h + (T ? gap : 0), bandBot = H - pad - bot.h - (B ? gap : 0);
  const colCells = (n, side) => {
    const out = [], slot = (bandBot - bandTop) / Math.max(n, 1);
    for (let i = 0; i < n; i++) {
      const mid = bandTop + slot * (i + 0.5), y = mid - sideH / 2, w = S + gap + sideInfo;
      if (side === 'left') out.push({ x: pad, y, w, h: sideH, cx: pad + S / 2, cy: discY(y, sideH), orient: 'h', flip: false, side, infoW: sideInfo, infoH: sideH });
      else out.push({ x: W - pad - w, y, w, h: sideH, cx: W - pad - S / 2, cy: discY(y, sideH), orient: 'h', flip: true, side, infoW: sideInfo, infoH: sideH });
    }
    return out;
  };
  seats.push(...rowCells(T, top, yTop, 'top'));
  seats.push(...colCells(R, 'right'));
  seats.push(...rowCells(B, bot, yBot, 'bottom').reverse());
  seats.push(...colCells(L, 'left').reverse());

  const sideW = S + gap + sideInfo;
  const tx0 = L ? pad + sideW + 6 : pad + 4, tx1 = R ? W - pad - sideW - 6 : W - pad - 4;
  const table = { x: tx0, y: bandTop + 2, w: Math.max(0, tx1 - tx0), h: Math.max(0, bandBot - bandTop - 4) };
  return { S, f: d.f, pf: d.pf, pill: d.pill, lab: d.lab, rows: d.rows, gap, seats, table, forced };
}

export function nearestSeat(seats, x, y, maxDist) {
  let best = -1, bd = Infinity;
  seats.forEach((s, i) => { const dd = Math.hypot(s.cx - x, s.cy - y); if (dd < bd) { bd = dd; best = i; } });
  return bd <= maxDist ? best : -1;
}
