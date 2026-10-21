// Event-sourced oyun deposu. Ekrandaki her şey olay listesinden türetilir.
// Geri alma = son olayı (ya da bir noktadan sonrasını) silmek.

const KEY = 'tg-grim-game-v1';
const ARCHIVE_KEY = 'tg-grim-archive-v1';

let events = [];
const subs = new Set();

export function load() {
  try { events = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { events = []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(events)); } catch (e) {}
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(last) { save(); const s = state(); subs.forEach(f => f(s, last)); }

let uid = 0;
const newId = () => Date.now().toString(36) + (uid++).toString(36);

export function dispatch(type, data = {}) {
  const ev = { id: newId(), ts: Date.now(), type, ...data };
  events.push(ev);
  emit(ev);
  return ev;
}
export function undo() {
  // "start" olayı geri alınmaz; oyunu silmek için reset() kullanılır
  if (events.length <= 1) return null;
  const ev = events.pop();
  emit(null);
  return ev;
}
export function undoTo(id) {
  const i = events.findIndex(e => e.id === id);
  if (i < 1) return;
  events = events.slice(0, i);
  emit(null);
}
export function reset(silent = false) {
  if (events.length) {
    try {
      const a = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
      a.unshift({ at: Date.now(), events });
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(a.slice(0, 20)));
    } catch (e) {}
  }
  events = [];
  if (silent) save(); else emit(null);
}
export function getEvents() { return events; }

// ---------- Reducer ----------
export function phaseLabel(p) {
  if (!p) return '';
  return (p.kind === 'night' ? 'Gece ' : 'Gün ') + p.n;
}

export function state() {
  if (!events.length || events[0].type !== 'start') return null;
  let s = null;
  const log = [];
  for (const ev of events) {
    const before = s;
    s = apply(s, ev);
    log.push({ id: ev.id, phase: s.phase, ev, before });
  }
  s.log = log;
  return s;
}

const clone = o => JSON.parse(JSON.stringify(o));

function apply(s, ev) {
  if (ev.type === 'start') {
    return {
      script: ev.script, scriptRoles: ev.scriptRoles,
      players: ev.players.map(p => ({ id: p.id, name: p.name, role: p.role, believed: p.believed || null,
        dead: false, ghost: true, reminders: [] })),
      seats: ev.players.map(p => p.id),
      sides: ev.sides,
      bluffs: ev.bluffs || [],
      phase: { kind: 'night', n: 1 },
    };
  }
  s = clone(s);
  const P = id => s.players.find(p => p.id === id);
  switch (ev.type) {
    case 'swap': {
      const a = s.seats.indexOf(ev.a), b = s.seats.indexOf(ev.b);
      if (a >= 0 && b >= 0) [s.seats[a], s.seats[b]] = [s.seats[b], s.seats[a]];
      break;
    }
    case 'sides': s.sides = ev.sides; break;
    case 'phase': s.phase = ev.phase; break;
    case 'die': P(ev.p).dead = true; break;
    case 'revive': P(ev.p).dead = false; break;
    case 'ghost': P(ev.p).ghost = ev.value; break;
    case 'rename': P(ev.p).name = ev.name; break;
    case 'role': P(ev.p).role = ev.role; break;
    case 'believed': P(ev.p).believed = ev.role || null; break;
    case 'remAdd': P(ev.p).reminders.push({ id: ev.rid, role: ev.role, text: ev.text }); break;
    case 'remDel': { const p = P(ev.p); p.reminders = p.reminders.filter(r => r.id !== ev.rid); break; }
    case 'bluffs': s.bluffs = ev.bluffs; break;
    case 'note': break;
  }
  return s;
}

export { newId };
