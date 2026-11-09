// Masalar ve odalar. Her cihazın kendi "Yerel masa"sı var; isteyen bir odaya girer (aynı odadakiler aynı oyunu paylaşır),
// istediğinde yerel masasına döner. Oda silinirse içindekiler yerel masaya düşer.
// Ortak olan: oyunun kendisi (tokenlar, konumlar, ölü/diri, isimler, hatırlatıcılar, blöfler, gece işaretleri).
// Yerel kalan: pencereler, sekmeler, perde, simge boyutları, notlar.
//
// İnternetsiz çalışma: cihaz, girdiği her odanın son halini ve henüz sunucuya ulaştığı onaylanmamış
// değişiklikleri ("dirty" anahtarlar) localStorage'da tutar. İnternet yokken kayıtlı odalar arasında geçilebilir.
// Bağlantı gelince: sunucudaki hal alınır, üstüne bu cihazın onaylanmamış değişiklikleri yazılır ve gönderilir.
import { G, $, emit, hooks, sharedMap, applySharedMap, toast, uid, clearHistory, subscribe } from './core.js?v=20261109-0330';
import { isDragging } from './board.js?v=20261109-0330';

const SKEY = 'tg-g3-room', LOCAL = 'tg-g3-local', CPRE = 'tg-g3-rc:';
const CID = uid();
let ref = null, connRef = null, presRef = null, room = null;
let ready = false;      // bu odanın geçerli bir hali elimizde mi (önbellekten ya da sunucudan)
let conn = false, denied = false;
let shown = {};         // ekrandaki ortak halin son eşitlendiği hal (yerel değişiklikleri bulmak için taban)
let remoteMap = null;   // sunucudan gelen son hal
let dirty = {};         // sunucuya ulaştığı henüz onaylanmamış anahtarlar
let tm = 0, ct = 0;
const sget = (st, k) => { try { return window[st].getItem(k); } catch (e) { return null; } };
const sset = (st, k, v) => { try { v == null ? window[st].removeItem(k) : window[st].setItem(k, v); } catch (e) {} };
const db = () => firebase.database();
const same = (a, b) => { const ka = Object.keys(a); if (ka.length !== Object.keys(b).length) return false; return ka.every(k => a[k] === b[k]); };
const nv = v => (v === undefined ? null : v);
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej('offline'), ms))]);
export const normRoom = c => String(c || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
export const currentRoom = () => room;
export const isOnline = () => conn;

// ---- oda önbelleği (localStorage: tg-g3-rc:<oda> = {map, dirty, chat, ts}) ----
function readCache(c) { try { const e = JSON.parse(localStorage.getItem(CPRE + c)); return e && e.map ? e : null; } catch (e) { return null; } }
function writeCache(c, e) { try { localStorage.setItem(CPRE + c, JSON.stringify(e)); } catch (er) {} }
function dropCache(c) { sset('localStorage', CPRE + c, null); }
function cachedCodes() { try { return Object.keys(localStorage).filter(k => k.startsWith(CPRE)).map(k => k.slice(CPRE.length)); } catch (e) { return []; } }
function saveRoomCache() {
  clearTimeout(ct);
  if (room && ready) writeCache(room, { map: sharedMap(G.S), dirty, chat: chat.slice(-150), ts: Date.now() });
}
subscribe(() => { if (room && ready) { clearTimeout(ct); ct = setTimeout(saveRoomCache, 400); } });

// ---- oda sohbeti (grimoire/<oda>/chat/<id>) ----
let chat = [], chatHook = null;
const myUid = () => { try { return firebase.auth().currentUser.uid; } catch (e) { return ''; } };
export const setChatHook = f => { chatHook = f; };
export const getChat = () => chat;
export const chatMe = myUid;
// Sonuç: true | 'offline' | false
export function sendChat(text) {
  text = String(text || '').trim().slice(0, 600); if (!text || !ref || !ready) return Promise.resolve(false);
  if (!conn) return Promise.resolve('offline');
  let n = ''; try { n = (firebase.auth().currentUser.email || '').split('@')[0]; } catch (e) {}
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const upd = { ['chat/' + id]: { u: myUid(), n: n || 'anlatıcı', x: text, ts: Date.now() } };
  chat.slice(0, Math.max(0, chat.length + 1 - 150)).forEach(m => { upd['chat/' + m.id] = null; });
  return ref.update(upd).then(() => true).catch(e => { fail(e); return false; });
}

function status() {
  const el = $('syncDot'); if (!el) return;
  let cls = 'off', txt = 'Yerel masa', tip = 'Yerel masa: bu cihaz tek başına çalışıyor';
  if (room) {
    txt = room;
    const n = Object.keys(dirty).length;
    if (denied) { cls = 'bad'; tip = 'Oda: izin yok (Firebase kuralları)'; }
    else if (!conn) { cls = 'warn'; txt = room + ' · çevrimdışı'; tip = `Oda ${room}: internet yok. Değişiklikler bu cihazda saklanıyor${n ? ` (${n} bekleyen)` : ''}, internet gelince gönderilecek.`; }
    else if (!ready) { cls = 'warn'; tip = `Oda ${room}: bağlanıyor…`; }
    else { cls = 'ok'; tip = `Oda ${room}: bağlı`; }
  }
  el.className = 'sync ' + cls; el.title = tip;
  el.innerHTML = `<i></i><span>${txt.replace(/</g, '&lt;')}</span>`;
}

function fail(err) {
  if (err && /PERMISSION_DENIED/i.test(String(err.code || err.message))) { denied = true; status(); toast('Oda için Firebase izni yok. Kuralları kontrol et.', 5000); }
}

// Gönder ve sunucu onaylayınca o anahtarları "bekleyen" listesinden düş (değer hâlâ aynıysa).
function send(c, upd) {
  if (!conn) return; // internet yokken gönderme: bekleyenlerde kalır, bağlantı gelince oda hâlâ varsa gönderilir
  db().ref('grimoire/' + c).update(upd).then(() => confirmSent(c, upd)).catch(fail);
}
function confirmSent(c, upd) {
  if (c === room) {
    const cur = sharedMap(G.S);
    for (const k of Object.keys(upd)) if (nv(cur[k]) === upd[k]) delete dirty[k];
    saveRoomCache(); status();
  } else {
    const e = readCache(c); if (!e) return;
    for (const k of Object.keys(upd)) if (nv(e.map[k]) === upd[k]) delete e.dirty[k];
    writeCache(c, e);
  }
}

// Sunucu hali + bu cihazın bekleyen değişiklikleri = ekranda olması gereken hal
function reconcile() {
  if (!remoteMap) return;
  if (isDragging()) { clearTimeout(tm); tm = setTimeout(reconcile, 250); return; }
  const cur = sharedMap(G.S);
  const merged = { ...remoteMap };
  for (const k of Object.keys(dirty)) { if (k in cur) merged[k] = cur[k]; else delete merged[k]; }
  if (!same(cur, merged)) { applySharedMap(G.S, merged); emit(); }
  shown = merged;
}
function onSnap(snap) {
  denied = false;
  const val = snap.val();
  if (!val || !val.meta) {
    if (!conn) return; // internet yokken boş görünmesi silindiği anlamına gelmez
    return roomGone();
  }
  const remote = {};
  for (const [k, v] of Object.entries(val.j || {})) remote['j/' + k] = v;
  for (const [k, v] of Object.entries(val.t || {})) remote['t/' + k] = v;
  for (const [k, v] of Object.entries(val.l || {})) remote['l/' + k] = v;
  remoteMap = remote;
  const was = ready;
  ready = true;
  // sunucuda olmayan bekleyen değişiklikleri (ör. sayfa internetsizken yenilendiyse) yeniden gönder
  const cur = sharedMap(G.S), upd = {};
  for (const k of Object.keys(dirty)) { const v = nv(cur[k]); if (nv(remote[k]) !== v) upd[k] = v; }
  reconcile();
  if (Object.keys(upd).length) send(room, upd);
  const old = new Set(chat.map(m => m.id));
  chat = Object.entries(val.chat || {}).map(([id, m]) => ({ id, ...m })).sort((a, b) => a.ts - b.ts);
  if (chatHook) chatHook(chat, was ? chat.filter(m => !old.has(m.id) && m.u !== myUid()) : []);
  saveRoomCache(); status();
}
// Her işlemden sonra (commit): yerel değişiklikleri bul, bekleyenlere ekle, gönder.
function push(cur) {
  if (!ref || !ready) return;
  const upd = {};
  for (const k of Object.keys(cur)) if (cur[k] !== shown[k]) upd[k] = cur[k];
  for (const k of Object.keys(shown)) if (!(k in cur)) upd[k] = null;
  if (!Object.keys(upd).length) return;
  for (const k of Object.keys(upd)) dirty[k] = 1;
  shown = { ...cur };
  saveRoomCache(); status();
  send(room, upd);
}
function roomGone() {
  const c = room;
  dirty = {}; dropCache(c);
  toast(ready ? 'Bu oda silindi. Yerel masana döndün.' : 'Oda bulunamadı. Yerel masaya dönüldü.', 4500);
  leave(false);
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

// ---- internet durumu (oturum boyunca tek dinleyici) ----
function watchConn() {
  if (connRef || !(window.firebase && firebase.database)) return;
  connRef = db().ref('.info/connected');
  connRef.on('value', s => {
    const was = conn; conn = !!s.val();
    if (conn && presRef) { presRef.set(true); presRef.onDisconnect().remove(); }
    status();
    if (conn && !was) onReconnect();
  });
}
function onReconnect() {
  // içinde olduğumuz oda bu arada silinmiş mi?
  if (room) {
    const c = room;
    roomExists(c).then(ex => {
      if (room !== c) return;
      if (!ex) return roomGone();
      const cur = sharedMap(G.S), upd = {};
      for (const k of Object.keys(dirty)) upd[k] = nv(cur[k]);
      if (Object.keys(upd).length) send(c, upd);
    }).catch(() => {});
  }
  // diğer kayıtlı odalarda bekleyen değişiklikleri gönder
  for (const c of cachedCodes()) {
    if (c === room) continue;
    const e = readCache(c); if (!e || !Object.keys(e.dirty || {}).length) continue;
    roomExists(c).then(ex => {
      if (!ex) return dropCache(c);
      const upd = {}; for (const k of Object.keys(e.dirty)) upd[k] = nv(e.map[k]);
      send(c, upd);
    }).catch(() => {});
  }
}

// ---- bağlantı ----
function detach() {
  if (ref) { try { ref.off(); } catch (e) {} }
  if (presRef) { try { presRef.remove(); } catch (e) {} }
  clearTimeout(tm); clearTimeout(ct);
  ref = presRef = null; ready = false; remoteMap = null; shown = {}; dirty = {};
  hooks.onCommit = null; chat = []; if (chatHook) chatHook([], []);
}
function attach(c, cache) {
  detach();
  room = c; denied = false;
  sset('sessionStorage', SKEY, c);
  if (cache) { // kayıtlı hal: internet olmasa da hemen oynanabilir
    dirty = { ...(cache.dirty || {}) }; chat = cache.chat || [];
    applySharedMap(G.S, cache.map); shown = sharedMap(G.S); ready = true;
    emit();
  }
  ref = db().ref('grimoire/' + c);
  presRef = db().ref(`grimoirePresence/${c}/${CID}`);
  if (conn) { presRef.set(true); presRef.onDisconnect().remove(); }
  hooks.onCommit = push;
  ref.on('value', onSnap, err => fail(err));
  clearHistory(); status();
  if (chatHook) chatHook(chat, []);
}
function leave(save) {
  if (save && room) saveRoomCache();
  detach(); room = null; sset('sessionStorage', SKEY, null);
  restoreLocal(); status();
}
export const leaveToLocal = () => leave(true);
// get(): bağlıyken sunucudan taze okur (once() dinlenen yerlerde eski önbelleği döndürebilir)
const fetchVal = r => (r.get ? r.get() : r.once('value'));
export const roomExists = c => fetchVal(db().ref('grimoire/' + normRoom(c) + '/meta')).then(s => s.exists());

// Odaya gir. create=true: yeni oda aç (copy: şu an ekrandaki oyunu odaya kopyala).
// Hata: 'empty' | 'exists' | 'missing' | 'offline'
export async function enterRoom(code, { create = false, copy = false } = {}) {
  const c = normRoom(code); if (!c) throw 'empty';
  if (c === room) return;
  let cache = create ? null : readCache(c);
  if (create) {
    if (!conn) throw 'offline';
    if (await timeout(roomExists(c), 8000)) throw 'exists';
    const upd = { meta: { created: Date.now() } };
    if (copy) { const cur = sharedMap(G.S); for (const k of Object.keys(cur)) upd[k] = cur[k]; }
    await timeout(db().ref('grimoire/' + c).update(upd), 8000);
    await timeout(db().ref('grimoireRooms/' + c).set({ created: Date.now() }), 8000);
    if (copy) cache = { map: sharedMap(G.S), dirty: {}, chat: [] };
  } else if (!cache) {
    if (!conn) throw 'offline';
    if (!(await timeout(roomExists(c), 8000))) throw 'missing';
  }
  if (!room) saveLocal(); else saveRoomCache();
  attach(c, cache);
}
// {rooms: [{code, created, n, cached, pending}], offline}
export async function listRooms() {
  const codes = cachedCodes();
  const info = c => { const e = readCache(c); return { cached: !!e, pending: !!(e && Object.keys(e.dirty || {}).length), ts: e ? e.ts || 0 : 0 }; };
  if (conn) {
    try {
      const [r, p] = await timeout(Promise.all([fetchVal(db().ref('grimoireRooms')), fetchVal(db().ref('grimoirePresence'))]), 6000);
      const rooms = r.val() || {}, pres = p.val() || {};
      codes.filter(c => !(c in rooms) && c !== room).forEach(dropCache); // silinmiş odaların kaydını at
      return { offline: false, rooms: Object.keys(rooms).map(code => ({ code, created: (rooms[code] || {}).created || 0, n: Object.keys(pres[code] || {}).length, ...info(code) }))
        .sort((a, b) => a.created - b.created) };
    } catch (e) { /* bağlantı zayıf: kayıtlılara düş */ }
  }
  const list = new Set(codes); if (room) list.add(room);
  return { offline: true, rooms: [...list].map(code => ({ code, created: 0, n: null, ...info(code) })).sort((a, b) => a.code.localeCompare(b.code)) };
}
export async function deleteRoom(code) {
  const c = normRoom(code);
  if (!conn) throw 'offline';
  if (room === c) { dirty = {}; leave(false); }
  dropCache(c);
  await db().ref('grimoire/' + c).remove();
  await db().ref('grimoireRooms/' + c).remove();
  await db().ref('grimoirePresence/' + c).remove();
}
// Açılışta: sayfa yenilendiyse odaya geri bağlan (kayıtlı haliyle, internet olmasa da); uygulama yeniden açıldıysa yerel masayı geri koy.
export function resumeSession() {
  watchConn();
  const c = sget('sessionStorage', SKEY);
  if (window.firebase && firebase.database && c) {
    // kayıt yoksa (eski sürümden geçiş) ekrandaki hal odanın hali sayılır
    attach(c, readCache(c) || { map: sharedMap(G.S), dirty: {}, chat: [] });
    return;
  }
  restoreLocal(); status();
}
export const stopSync = () => {
  detach(); room = null;
  if (connRef) { try { connRef.off(); } catch (e) {} connRef = null; conn = false; }
  status();
};
