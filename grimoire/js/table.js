// Dikdörtgen masa geometrisi. Kenarlar ekrana göredir (Üst/Sağ/Alt/Sol ekranda gördüğün gibi).
// Koltuklar sol üstten saat yönünde: üst soldan sağa, sağ yukarıdan aşağı, alt sağdan sola, sol aşağıdan yukarı.
// Üst ve alt sıralar ekranın tüm genişliğini kullanır; yan sütunlar bu iki sıranın arasında kalır.

export function defaultSides(n, portrait = true) {
  if (n <= 4) return { top: Math.ceil(n / 2), right: 0, bottom: Math.floor(n / 2), left: 0 };
  // Dikeyde uzun kenarlar sol/sağ, yatayda üst/alt
  const short = n >= 13 ? 3 : n >= 9 ? 2 : 1;
  const rest = n - short * 2;
  const a = Math.ceil(rest / 2), b = Math.floor(rest / 2);
  return portrait ? { top: short, right: a, bottom: short, left: b } : { top: a, right: short, bottom: b, left: short };
}

export function layout(W, H, sides) {
  const { top, right, bottom, left } = sides;
  const horiz = Math.max(top, bottom, 1), vert = Math.max(left, right);
  const hasSide = left > 0 || right > 0;
  // Bir jetonun dikey yer ihtiyacı: disk + rol + isim + hatırlatıcı satırı ≈ 1.75 S
  const ROW = 1.75;
  const byW = W / horiz * 0.8;
  const byH = (H - 8) / ((2 + vert) * ROW);
  // Yan sütunlar varken masa için en az ~%30 genişlik kalsın
  const bySide = hasSide ? W / 4.4 : Infinity;
  let S = Math.min(byW, byH, bySide, 112);
  S = Math.max(S, 40);
  const rowH = S * ROW;
  const y0 = S / 2 + 6;                 // üst sıra disk merkezi
  const y1 = H - rowH + S / 2 - 4;       // alt sıra disk merkezi
  const colX = S * 0.95;                 // yan sütun disk merkezi (kenardan)
  const spread = (a, b, k) => Array.from({ length: k }, (_, i) => a + ((i + 0.5) * (b - a)) / k);
  const seats = [];
  spread(0, W, top).forEach(x => seats.push({ x, y: y0 }));
  const sy0 = y0 - S / 2 + rowH, sy1 = y1 - S / 2;      // yan sütunun kullanılabilir dikey aralığı
  const sideYs = k => spread(sy0, sy1, k).map(y => y - S * 0.35); // diskin altında etiket payı
  sideYs(right).forEach(y => seats.push({ x: W - colX, y }));
  spread(0, W, bottom).reverse().forEach(x => seats.push({ x, y: y1 }));
  sideYs(left).reverse().forEach(y => seats.push({ x: colX, y }));
  const tx0 = left ? colX * 2 + 4 : 10, tx1 = right ? W - colX * 2 - 4 : W - 10;
  const table = { x: tx0, y: sy0 + 4, w: tx1 - tx0, h: Math.max(sy1 - sy0 - 8, 40) };
  return { S, seats, table };
}

export function nearestSeat(seats, x, y, maxDist) {
  let best = -1, bd = Infinity;
  seats.forEach((s, i) => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
  return bd <= maxDist ? best : -1;
}
