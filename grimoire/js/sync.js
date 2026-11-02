// Masalar ve odalar. Her cihazın kendi "Yerel masa"sı var; isteyen bir odaya girer (aynı odadakiler aynı oyunu paylaşır),
// istediğinde yerel masasına döner. Oda silinirse içindekiler yerel masaya düşer.
// Ortak olan: oyunun kendisi (tokenlar, konumlar, ölü/diri, isimler, hatırlatıcılar, blöfler, gece işaretleri).
// Yerel kalan: pencereler, sekmeler, perde, simge boyutları, notlar.
import { G, $, emit, hooks, sharedMap, applySharedMap, toast, uid, clearHistory } from './core.js?v=20261102-0410';
import { isDragging } from './board.js?v=20261102-0410';

const SKEY = 'tg-g3-room', LOCAL = 'tg-g3-local';
const CID = uid();
let ref = null, connRef = null, presRef = null, last = {}, ready = false, latest = null, tm = 0, conn = false, denied = false, room = null;
const sget = (st, k) => { try { return window[st].getItem(k); } catch (e) { return null; } };
const sset = (st, k, v) => { try { v == null ? window[st].removeItem(k) : window[st].setItem(k, v); } catch (e) {} };
const db = () => firebase.database();
export const normRoom = c => String(c || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
export const currentRoom = () => room;
export const syncState = () => (!room ? 'local' : denied ? 'denied' : !conn ? 'offline' : !ready ? 'connecting' : 'ok');
const same = (a, b) => { const ka = Object.keys(a); if (ka.length !== Object.keys(b).length) return false; return ka.every(k => a[k] === b[k]); };

function status() {
  const el = $('syncDot'); if (!el) return;
  let cls = 'off', txt = 'Yerel masa', tip = 'Yerel masa: bu cihaz tek başına çalışıyor';
  if (room) {
    txt = room;
    if (denied) { cls = 'bad'; tip = 'Oda: izin yok (Firebase kuralları)'; }
    else if (!conn) { cls = 'warn'; tip = `Oda ${room}: bağlantı yok, bağlanınca eşitlenecek`; }
    else if (!ready) { cls = 'warn'; tip = `Oda ${room}: bağlanıyor…`; }
    else { cls = 'ok'; tip = `Oda ${room}: bağlı`; }
  }
  el.className = 'sync ' + cls; el.title = tip;
  el.innerHTML = `<i></i><span>${txt.replace(/</g, '&lt;')}</span>`;
}

function fail(err) {
  if (err && /PERMISSION_DENIED/i.test(String(err.code || err.message))) { denied = true; ready = false; status(); toast('Oda için Firebase izni yok. Kuralları kontrol et.', 5000); }
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
  if (!val || !val.meta) { // oda silinmiş ya da yok: yerel masaya dön
    toast(ready ? 'Bu oda silindi. Yerel masana döndün.' : 'Oda bulunamadı. Yerel masaya dönüldü.', 4500);
    return leaveToLocal();
  }
  const remote = {};
  for (const [k, v] of Object.entries(val.j || {})) remote['j/' + k] = v;
  for (const [k, v] of Object.entries(val.t || {})) remote['t/' + k] = v;
  last = remote;
  ready = true; status();
  if (!same(sharedMap(G.S), remote)) apply(remote);
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

// ---- yerel masa anlık görüntüsü ----
function saveLocal() { try { localStorage.setItem(LOCAL, JSON.stringify(G.S)); } catch (e) {} }
function restoreLocal() {
  let s = null; try { s = JSON.parse(localStorage.getItem(LOCAL)); } catch (e) {}
  if (!s || s.v !== 1) return false;
  Object.keys(G.S).forEach(k => delete G.S[k]); Object.assign(G.S, s);
  sset('localStorage', LOCAL, null);
  clearHistory(); emit();
  return true;
}

// ---- bağlantı ----
function detach() {
  if (ref) { try { ref.off(); } catch (e) {} }
  if (connRef) { try { connRef.off(); } catch (e) {} }
  if (presRef) { try { presRef.remove(); } catch (e) {} }
  ref = connRef = presRef = null; ready = false; hooks.onCommit = null;
}
function attach(c) {
  detach();
  room = c; denied = false; last = {};
  sset('sessionStorage', SKEY, c);
  ref = db().ref('grimoire/' + c);
  presRef = db().ref(`grimoirePresence/${c}/${CID}`);
  hooks.onCommit = push;
  connRef = db().ref('.info/connected');
  connRef.on('value', s => {
    conn = !!s.val();
    if (conn && presRef) { presRef.set(true); presRef.onDisconnect().remove(); }
    status();
  });
  ref.on('value', onSnap, err => fail(err));
  clearHistory(); status();
}
export function leaveToLocal() {
  detach(); room = null; sset('sessionStorage', SKEY, null);
  restoreLocal(); status();
}
export const roomExists = c => db().ref('grimoire/' + normRoom(c) + '/meta').once('value').then(s => s.exists());

// Odaya gir. create=true: yeni oda aç (copy: şu an ekranda olan oyunu odaya kopyala). Hata: 'exists' | 'missing'
export async function enterRoom(code, { create = false, copy = false } = {}) {
  const c = normRoom(code); if (!c) throw 'empty';
  const exists = await roomExists(c);
  if (create && exists) throw 'exists';
  if (!create && !exists) throw 'missing';
  if (create) {
    const upd = { meta: { created: Date.now() } };
    if (copy) { const cur = sharedMap(G.S); for (const k of Object.keys(cur)) upd[k] = cur[k]; }
    await db().ref('grimoire/' + c).update(upd);
    await db().ref('grimoireRooms/' + c).set({ created: Date.now() });
  }
  if (!room) saveLocal(); // yerel masayı sakla
  attach(c);
}
export async function listRooms() {
  const [r, p] = await Promise.all([db().ref('grimoireRooms').once('value'), db().ref('grimoirePresence').once('value')]);
  const rooms = r.val() || {}, pres = p.val() || {};
  return Object.keys(rooms).map(code => ({ code, created: (rooms[code] || {}).created || 0, n: Object.keys(pres[code] || {}).length }))
    .sort((a, b) => a.created - b.created);
}
export async function deleteRoom(code) {
  const c = normRoom(code);
  if (room === c) leaveToLocal();
  await db().ref('grimoire/' + c).remove();
  await db().ref('grimoireRooms/' + c).remove();
  await db().ref('grimoirePresence/' + c).remove();
}
// Açılışta: sayfa yenilendiyse odaya geri bağlan; uygulama yeniden açıldıysa yerel masayı geri koy.
export function resumeSession() {
  const c = sget('sessionStorage', SKEY);
  if (window.firebase && firebase.database && c) { room = c; attach(c); return; }
  restoreLocal(); status();
}
export const stopSync = () => { detach(); room = null; status(); };
