// Dikdörtgen masa geometrisi. Kenarlar ekrana göredir (Üst/Sağ/Alt/Sol ekranda gördüğün gibi).
// Koltuklar sol üstten saat yönünde: üst soldan sağa, sağ yukarıdan aşağı, alt sağdan sola, sol aşağıdan yukarı.
// Masanın ortası boş kalmaz: gece adımı / gündüz kontrolleri orada gösterilir, bu yüzden ortaya
// en az CENTER_W genişlik bırakılır.

export function defaultSides(n, portrait = true) {
  if (n <= 4) return { top: Math.ceil(n / 2), right: 0, bottom: Math.floor(n / 2), left: 0 };
  const short = n >= 13 ? 3 : n >= 9 ? 2 : 1;
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

const ROW = 1.62;   // disk + rol şeridi + isim şeridi, S cinsinden
const LBL = 1.36;   // etiket genişliği, S cinsinden
const CENTER_W = 150, CENTER_H = 120;

export function layout(W, H, sides) {
  const { top, right, bottom, left } = sides;
  const horiz = Math.max(top, bottom, 1), vert = Math.max(left, right);
  const cols = (left ? 1 : 0) + (right ? 1 : 0);
  const lim = [112];
  lim.push(W / horiz / LBL * 0.98);                          // üst/alt sıra yan yana sığsın
  if (cols) lim.push((W - CENTER_W - 16) / (cols * LBL));     // orta alan en az CENTER_W
  lim.push((H - 6) / ((2 + vert) * ROW));                     // dikeyde her şey sığsın
  lim.push((H - CENTER_H) / (2 * ROW));                       // orta alan en az CENTER_H
  let S = Math.max(34, Math.min(...lim));
  const rowH = S * ROW, colW = S * LBL;
  const y0 = 4 + S / 2;
  const y1 = H - rowH + S / 2 - 2;
  const spread = (a, b, k) => Array.from({ length: k }, (_, i) => a + ((i + 0.5) * (b - a)) / k);
  const seats = [];
  const xs = k => spread(0, W, k);
  xs(top).forEach(x => seats.push({ x, y: y0 }));
  const sy0 = rowH + 2, sy1 = H - rowH - 2;                  // yan sütunların dikey bandı
  const ys = k => spread(sy0, sy1, k).map(y => y - rowH / 2 + S / 2);
  ys(right).forEach(y => seats.push({ x: W - colW / 2 - 2, y }));
  xs(bottom).reverse().forEach(x => seats.push({ x, y: y1 }));
  ys(left).reverse().forEach(y => seats.push({ x: colW / 2 + 2, y }));
  const tx0 = left ? colW + 6 : 8, tx1 = right ? W - colW - 6 : W - 8;
  const table = { x: tx0, y: sy0 + 2, w: tx1 - tx0, h: sy1 - sy0 - 4 };
  return { S, seats, table };
}

export function nearestSeat(seats, x, y, maxDist) {
  let best = -1, bd = Infinity;
  seats.forEach((s, i) => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
  return bd <= maxDist ? best : -1;
}
