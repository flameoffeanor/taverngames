// İki yönetici arasında canlı senkron: Firebase Realtime Database, sabit oda.
// Ortak olan: oyunun kendisi (tokenlar, konumlar, ölü/diri, isimler, hatırlatıcılar, blöfler, gece işaretleri).
// Yerel kalan: pencereler, sekmeler, perde, simge boyutları, notlar.
import { G, $, emit, hooks, sharedMap, applySharedMap, toast } from './core.js?v=20261102-0257';
import { isDragging } from './board.js?v=20261102-0257';

const SKEY = 'tg-g3-room', LKEY = 'tg-g3-lastroom';
let ref = null, last = {}, ready = false, latest = null, tm = 0, conn = false, denied = false, room = null, connRef = null;
const sget = (st, k) => { try { return window[st].getItem(k); } catch (e) { return null; } };
const sset = (st, k, v) => { try { v == null ? window[st].removeItem(k) : window[st].setItem(k, v); } catch (e) {} };
export const normRoom = c => String(c || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
export const currentRoom = () => room;
export const lastRoom = () => sget('localStorage', LKEY) || '';
export const savedSessionRoom = () => sget('sessionStorage', SKEY);
export const syncState = () => (!room ? 'local' : denied ? 'denied' : !conn ? 'offline' : !ready ? 'connecting' : 'ok');

const same = (a, b) => { const ka = Object.keys(a); if (ka.length !== Object.keys(b).length) return false; return ka.every(k => a[k] === b[k]); };

function status() {
  const el = $('syncDot'); if (!el) return;
  let cls = 'off', txt = 'Yerel: bu cihaz tek başına çalışıyor';
  if (room) {
    if (denied) { cls = 'bad'; txt = 'Senkron: izin yok (Firebase kuralları)'; }
    else if (!conn) { cls = 'warn'; txt = `Oda ${room}: bağlantı yok, bağlanınca eşitlenecek`; }
    else if (!ready) { cls = 'warn'; txt = `Oda ${room}: bağlanıyor…`; }
    else { cls = 'ok'; txt = `Oda ${room}: bağlı`; }
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

// Odaya bağlan (kod = oda adı). Aynı kodu giren cihazlar aynı oyunu paylaşır; kod girmeyen cihaz yerel kalır.
export function roomExists(code) {
  return firebase.database().ref('grimoire/' + normRoom(code) + '/meta').once('value').then(s => s.exists());
}
export function connectRoom(code) {
  const c = normRoom(code);
  if (!c || !window.firebase || !firebase.database) return false;
  disconnect(true);
  room = c; denied = false;
  sset('sessionStorage', SKEY, c); sset('localStorage', LKEY, c);
  ref = firebase.database().ref('grimoire/' + c);
  hooks.onCommit = push;
  connRef = firebase.database().ref('.info/connected');
  connRef.on('value', s => { conn = !!s.val(); status(); });
  ref.on('value', onSnap, err => fail(err));
  status();
  return true;
}
export function disconnect(silent = false) {
  if (ref) { try { ref.off(); } catch (e) {} }
  if (connRef) { try { connRef.off(); } catch (e) {} }
  ref = null; connRef = null; ready = false; hooks.onCommit = null; room = null;
  if (!silent) sset('sessionStorage', SKEY, null);
  status();
}
export const stopSync = () => disconnect(true);
