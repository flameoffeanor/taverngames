// İki yönetici arasında canlı senkron: Firebase Realtime Database, sabit oda.
// Ortak olan: oyunun kendisi (tokenlar, konumlar, ölü/diri, isimler, hatırlatıcılar, blöfler, gece işaretleri).
// Yerel kalan: pencereler, sekmeler, perde, simge boyutları, notlar.
import { G, $, emit, hooks, sharedMap, applySharedMap, toast } from './core.js?v=20261102-0249';
import { isDragging } from './board.js?v=20261102-0249';

const KEY = 'tg-g3-sync';
let ref = null, last = {}, ready = false, latest = null, tm = 0, conn = false, denied = false, room = 'main';
export const syncEnabled = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };

const same = (a, b) => { const ka = Object.keys(a); if (ka.length !== Object.keys(b).length) return false; return ka.every(k => a[k] === b[k]); };

function status() {
  const el = $('syncDot'); if (!el) return;
  let cls = 'off', txt = 'Senkron kapalı';
  if (syncEnabled()) {
    if (denied) { cls = 'bad'; txt = 'Senkron: izin yok (Firebase kuralları)'; }
    else if (!conn) { cls = 'warn'; txt = 'Senkron: bağlantı yok, bağlanınca eşitlenecek'; }
    else if (!ready) { cls = 'warn'; txt = 'Senkron: bağlanıyor…'; }
    else { cls = 'ok'; txt = 'Senkron: bağlı'; }
  }
  el.className = 'sync ' + cls; el.title = txt; el.dataset.txt = txt;
}

function seed() {
  const cur = sharedMap(G.S), upd = { meta: { created: Date.now() } };
  for (const k of Object.keys(cur)) upd[k] = cur[k];
  last = cur; ready = true; status();
  ref.update(upd).catch(fail);
}
function fail(err) {
  if (err && /PERMISSION_DENIED/i.test(String(err.code || err.message))) { denied = true; ready = false; status(); toast('Senkron için Firebase izni yok. Kuralları kontrol et.', 5000); }
}
function apply(remote) {
  latest = remote;
  if (isDragging()) { clearTimeout(tm); tm = setTimeout(() => apply(latest), 250); return; }
  applySharedMap(G.S, remote);
  emit();
}
function onSnap(snap) {
  denied = false;
  const val = snap.val();
  if (!val || !val.meta) return seed();
  const remote = {};
  for (const [k, v] of Object.entries(val.j || {})) remote['j/' + k] = v;
  for (const [k, v] of Object.entries(val.t || {})) remote['t/' + k] = v;
  last = remote;
  const wasReady = ready; ready = true; status();
  if (!same(sharedMap(G.S), remote)) { apply(remote); if (!wasReady) toast('Ortak oyun yüklendi.'); }
}
function push(cur) {
  if (!ref || !ready) return;
  const upd = {};
  for (const k of Object.keys(cur)) if (cur[k] !== last[k]) upd[k] = cur[k];
  for (const k of Object.keys(last)) if (!(k in cur)) upd[k] = null;
  if (!Object.keys(upd).length) return;
  for (const k of Object.keys(upd)) { if (upd[k] === null) delete last[k]; else last[k] = upd[k]; }
  ref.update(upd).catch(fail);
}

export function startSync(roomId = 'main') {
  room = roomId;
  stopSync();
  if (!syncEnabled() || !window.firebase || !firebase.database) { status(); return; }
  ref = firebase.database().ref('grimoire/' + room);
  hooks.onCommit = push;
  firebase.database().ref('.info/connected').on('value', s => { conn = !!s.val(); status(); });
  ref.on('value', onSnap, err => fail(err));
  status();
}
export function stopSync() {
  if (ref) { try { ref.off(); } catch (e) {} }
  ref = null; ready = false; hooks.onCommit = null; status();
}
export function setSyncEnabled(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  if (on) startSync(room); else stopSync();
}
