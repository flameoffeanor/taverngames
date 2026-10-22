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
// Fazları sıralamak için: Gece 1 = 1, Gün 1 = 2, Gece 2 = 3 …
export const phaseIdx = p => p.n * 2 - (p.kind === 'night' ? 1 : 0);
export const phaseKey = p => (p.kind === 'night' ? 'N' : 'D') + p.n;

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
      script: ev.script, scriptRoles: ev.scriptRoles, customRoles: ev.customRoles || {},
      players: ev.players.map(p => ({ id: p.id, name: p.name, role: p.role, believed: p.believed || null,
        dead: false, ghost: true, evil: p.evil ?? null, gain: p.gain || null,
        reminders: (p.rem || []).map((r, i) => ({ id: 's' + p.id + i, role: r.role || null, text: r.text, tag: r.tag || null, src: r.src || null, exp: null, at: { kind: 'night', n: 1 } })) })),
      seats: ev.players.map(p => p.id),
      sides: ev.sides,
      bluffs: ev.bluffs || [],
      prep: ev.prep || {},   // ilk gece bilgileri (adım anahtarı → hedefler, gösterilecek rol)
      phase: { kind: 'night', n: 1 },
      done: {},      // faz anahtarı → { adımAnahtarı: olayId }
      used: {},      // "pid:etiket" → true (bir kez kullanılan yetenekler)
      deaths: [],    // { p, phase, cause, by }
      executed: {},  // gün anahtarı → pid (idamla ölen; eski kayıtlar için)
      executions: {},// gün anahtarı → { p, died }
      result: null,  // { winner: 'good'|'evil', reason }
    };
  }
  s = clone(s);
  one(s, ev);
  return s;
}

function one(s, ev) {
  const P = id => s.players.find(p => p.id === id);
  switch (ev.type) {
    case 'swap': {
      const a = s.seats.indexOf(ev.a), b = s.seats.indexOf(ev.b);
      if (a >= 0 && b >= 0) [s.seats[a], s.seats[b]] = [s.seats[b], s.seats[a]];
      break;
    }
    case 'sides': s.sides = ev.sides; break;
    case 'phase': {
      s.phase = ev.phase;
      const idx = phaseIdx(ev.phase);
      // Süresi dolan hatırlatıcılar (zehir, koruma …) kendiliğinden düşer
      s.players.forEach(p => { p.reminders = p.reminders.filter(r => !(r.exp && idx >= r.exp)); });
      break;
    }
    case 'die': {
      const p = P(ev.p); if (!p || p.dead) break;
      p.dead = true;
      s.deaths.push({ p: ev.p, phase: { ...s.phase }, cause: ev.cause || 'manual', by: ev.by || null });
      if (ev.cause === 'execution') { s.executed[phaseKey(s.phase)] = ev.p; (s.executions = s.executions || {})[phaseKey(s.phase)] = { p: ev.p, died: true }; }
      break;
    }
    case 'execSurvive': (s.executions = s.executions || {})[phaseKey(s.phase)] = { p: ev.p, died: false }; break;
    case 'gain': { const p = P(ev.p); if (p) p.gain = ev.role || null; break; }
    case 'end': s.result = { winner: ev.winner, reason: ev.reason || '' }; break;
    case 'revive': { const p = P(ev.p); if (p) p.dead = false; break; }
    case 'ghost': { const p = P(ev.p); if (p) p.ghost = ev.value; break; }
    case 'rename': P(ev.p).name = ev.name; break;
    case 'role': { const p = P(ev.p); p.role = ev.role; if (ev.evil != null) p.evil = ev.evil; if (!['drunk', 'lunatic', 'marionette'].includes(ev.role)) p.believed = null; break; }
    case 'align': P(ev.p).evil = ev.evil; break;
    case 'believed': P(ev.p).believed = ev.role || null; break;
    case 'remAdd': P(ev.p)?.reminders.push({ id: ev.rid, role: ev.role || null, text: ev.text, tag: ev.tag || null, src: ev.src || null, exp: ev.exp || null, at: { ...s.phase } }); break;
    case 'remDel': { const p = P(ev.p); p.reminders = p.reminders.filter(r => r.id !== ev.rid); break; }
    case 'bluffs': s.bluffs = ev.bluffs; break;
    case 'use': s.used[ev.key] = true; break;
    case 'act': {
      // Gece/gün adımı: kayıt + içindeki etkiler tek olay olarak uygulanır (tek geri alma hepsini geri alır)
      const k = phaseKey(s.phase);
      (s.done[k] = s.done[k] || {})[ev.step] = ev.id;
      (ev.effects || []).forEach(e => one(s, { ...e, id: ev.id }));
      break;
    }
    case 'addPlayer': {
      s.players.push({ id: ev.p.id, name: ev.p.name, role: ev.p.role, believed: null, dead: false, ghost: true, reminders: [], evil: ev.p.evil ?? null, traveller: true, gain: null, joined: { ...s.phase } });
      const i = s.seats.indexOf(ev.after);
      s.seats.splice(i >= 0 ? i + 1 : s.seats.length, 0, ev.p.id);
      s.sides = { ...s.sides, [ev.side]: (s.sides[ev.side] || 0) + 1 };
      break;
    }
    case 'removePlayer': {
      const p = P(ev.p); if (!p) break;
      p.gone = true;
      s.seats = s.seats.filter(x => x !== ev.p);
      s.sides = { ...s.sides, [ev.side]: Math.max(0, (s.sides[ev.side] || 0) - 1) };
      break;
    }
    case 'note': break;
  }
}

export { newId };
