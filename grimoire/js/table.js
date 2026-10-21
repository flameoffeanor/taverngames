// Dikdörtgen masa geometrisi. Koltuklar sol üst köşeden başlayıp saat yönünde dizilir:
// üst kenar soldan sağa, sağ kenar yukarıdan aşağı, alt kenar sağdan sola, sol kenar aşağıdan yukarı.
// Ekran dikeyse (telefon) masa 90° döndürülerek çizilir; uzun kenarlar ekranın uzun eksenine oturur.
// Saat yönü sırası döndürmede korunur.

export function defaultSides(n) {
  if (n <= 4) return { top: Math.ceil(n / 2), right: 0, bottom: Math.floor(n / 2), left: 0 };
  const short = n >= 12 ? 2 : 1;
  const rest = n - short * 2;
  return { top: Math.ceil(rest / 2), right: short, bottom: Math.floor(rest / 2), left: short };
}

// Jetonun etiketi (isim + rol) her zaman diskin altında, ekran koordinatında aşağı doğru durur.
// rot=true iken "mantıksal" düzlem ekrana göre 90° saat yönünde döndürülmüştür:
// mantıksal x → ekran aşağı, mantıksal y → ekran sola.
function core(W, H, sides, rot) {
  const { top, right, bottom, left } = sides;
  const horiz = Math.max(top, bottom, 1), vert = Math.max(left, right, 0);
  const sx = W / (horiz + (left ? 1 : 0) + (right ? 1 : 0) + 0.3);
  const sy = H / (vert + 2 + 0.7);
  let S = Math.min(sx * (rot ? 0.6 : 0.72), sy * (rot ? 0.66 : 0.58), 104);
  S = Math.max(S, 36);
  const label = Math.max(26, S * 0.42);
  const half = S * 0.82; // etiketin yatay yarı genişliği (ekranda)
  let x0, x1, y0, y1;
  if (!rot) { x0 = S / 2 + 6; x1 = W - S / 2 - 6; y0 = S / 2 + 6; y1 = H - S / 2 - label - 4; }
  else { x0 = S / 2 + 6; x1 = W - S / 2 - label - 4; y0 = half; y1 = H - half; }
  if (!rot) { if (left) x0 += S * 0.15; if (right) x1 -= S * 0.15; }
  const gapX = rot ? S * 1.25 : S * 1.05, gapY0 = rot ? S * 1.05 : S * 1.1, gapY1 = rot ? S * 1.05 : S * 0.9;
  const innerX0 = left ? x0 + gapX : x0, innerX1 = right ? x1 - gapX : x1;
  const spread = (a, b, k) => Array.from({ length: k }, (_, i) => a + ((i + 0.5) * (b - a)) / k);
  const seats = [];
  spread(innerX0, innerX1, top).forEach(x => seats.push({ x, y: y0 }));
  spread(y0 + gapY0, y1 - gapY1, right).forEach(y => seats.push({ x: x1, y }));
  spread(innerX0, innerX1, bottom).reverse().forEach(x => seats.push({ x, y: y1 }));
  spread(y0 + gapY0, y1 - gapY1, left).reverse().forEach(y => seats.push({ x: x0, y }));
  let t;
  if (!rot) {
    const tx0 = left ? x0 + S * 0.9 : x0 - S * 0.2, tx1 = right ? x1 - S * 0.9 : x1 + S * 0.2;
    t = { x: tx0, y: y0 + S / 2 + label + 8, w: tx1 - tx0, h: (y1 - S / 2 - 8) - (y0 + S / 2 + label + 8) };
  } else {
    const tx0 = left ? x0 + S / 2 + label + 10 : x0, tx1 = right ? x1 - S / 2 - 10 : x1;
    t = { x: tx0, y: y0 + half + 8, w: tx1 - tx0, h: (y1 - half - 8) - (y0 + half + 8) };
  }
  return { S, label, seats, table: t };
}

export function layout(W, H, sides) {
  if (H <= W * 1.1) return core(W, H, sides, false);
  const L = core(H, W, sides, true);
  return {
    ...L,
    seats: L.seats.map(s => ({ x: W - s.y, y: s.x })),
    table: { x: W - (L.table.y + L.table.h), y: L.table.x, w: L.table.h, h: L.table.w },
  };
}

export function nearestSeat(seats, x, y, maxDist) {
  let best = -1, bd = Infinity;
  seats.forEach((s, i) => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
  return bd <= maxDist ? best : -1;
}
