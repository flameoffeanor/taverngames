// Veri katmanı: Sheet'ten Türkçe karakterler + scriptler, repo içindeki resmi rol/gece sırası verisi.
// Sheet okunamazsa (mekanda internet yoksa) son başarılı yükleme kullanılır.

const SHEET_ID = '1CvS4Fa1Aht6-KG1EVdSeCiT3nUsBqZ2arLMqKSxxviY';
const CHAR_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const SCRIPT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=1395107313`;
const CACHE_KEY = 'tg-g3-data';

export const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled'];
export const TEAM_TR = {
  townsfolk: 'Kasabalı', outsider: 'Yabancı', minion: 'Minyon', demon: 'İblis', traveller: 'Gezgin', fabled: 'Efsanevi',
};
export const TEAM_PL = {
  townsfolk: 'Kasabalılar', outsider: 'Yabancılar', minion: 'Minyonlar', demon: 'İblisler', traveller: 'Gezginler', fabled: 'Efsaneviler',
};
export const GOOD = new Set(['townsfolk', 'outsider']);

// Oyuncu sayısına göre temel dağılım [kasabalı, yabancı, minyon, iblis]
export const DIST = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
  10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
};

// Resmi hatırlatıcı adlarının Türkçesi (listede olmayan olduğu gibi gösterilir)
const REM_TR = {
  Poisoned: 'Zehirli', Drunk: 'Sarhoş', Dead: 'Ölü', Protected: 'Korunuyor', Safe: 'Güvende', 'No Ability': 'Yeteneği yok',
  Mad: 'Takıntılı', '2nd': '2. oyuncu', Townsfolk: 'Kasabalı', Outsider: 'Yabancı', Minion: 'Minyon', Demon: 'İblis',
  Wrong: 'Yanlış', Grandchild: 'Torun', 'Died Today': 'Bugün öldü', Once: 'Bir kez', 'Red Herring': 'Yanlış alarm',
  'Survives Execution': 'İdamda ölmez', 'Is The Demon': 'İblis oldu', 'Is The Drunk': 'Sarhoş olan', '3 Attacks': '3 saldırı',
  'Negative Vote': 'Eksi oy', 'Is The Apprentice': 'Çırak', Alive: 'Dirildi', Know: 'Biliyor', 'Has Ability': 'Yeteneği var',
  Master: 'Efendi', '3 Votes': '3 oy', Cursed: 'Lanetli', Lunch: 'Öğle yemeği', Visitor: 'Ziyaretçi', 'False Info': 'Yanlış bilgi',
  Attack: 'Saldırı', 'Not Protected': 'Korunmuyor', Abnormal: 'Anormal', Correct: 'Doğru', Twin: 'İkiz', Executed: 'İdam edildi',
  'Used': 'Kullandı', 'Day 1': '1. gün', 'Day 2': '2. gün', 'Day 3': '3. gün', 'Day 4': '4. gün', 'Day 5+': '5+. gün',
  'Guess Used': 'Tahmin yaptı', 'Is The Philosopher': 'Filozof', 'Is The Marionette': 'Kukla', 'Chosen': 'Seçildi',
};
export const remTr = t => REM_TR[t] || t;

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

const normTeam = t => {
  t = (t || '').toLowerCase();
  if (t.startsWith('traveler')) return 'traveller';
  if (t.startsWith('hatirlat')) return 'note';
  return t;
};
export const normId = x => String(x || '').toLowerCase().replace(/[^a-z]/g, '');

async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

export async function loadData(force = false) {
  const official = await (await fetch('data/official.json?v=20261023-1332')).json();
  let sheet, offline = false;
  try {
    const [c, s] = await Promise.all([fetchText(CHAR_URL), fetchText(SCRIPT_URL)]);
    sheet = { chars: parseCSV(c), scripts: parseCSV(s), at: Date.now() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(sheet)); } catch (e) {}
  } catch (e) {
    try { sheet = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e2) {}
    if (!sheet) sheet = { chars: [], scripts: [], at: 0 };
    offline = true;
  }
  return build(official, sheet, offline);
}

function build(official, sheet, offline) {
  const roles = {};
  for (const row of sheet.chars) {
    const id = normId(row.id);
    if (!id) continue;
    const o = official.roles[id] || {};
    const team = normTeam(row.team) || o.team || 'townsfolk';
    if (team === 'note') continue;
    roles[id] = {
      id, team,
      name: row.name || o.name || id,
      ability: row.ability || '',
      first: row.first_night || '',
      other: row.other_night || '',
      reminders: o.reminders || [],
      remindersGlobal: o.remindersGlobal || [],
    };
  }
  // Sheet'te olmayan resmi rolleri de tanı (yapıştırılan özel script'te çıkarsa diye)
  for (const [id, o] of Object.entries(official.roles)) {
    if (roles[id]) continue;
    roles[id] = { id, name: o.name, team: o.team, ability: '', first: '', other: '',
      reminders: o.reminders || [], remindersGlobal: o.remindersGlobal || [], english: true };
  }
  const scripts = [];
  for (const row of sheet.scripts) {
    const name = row.script_name;
    const parsed = parseScript(row.id);
    if (name && parsed && parsed.roles.length) scripts.push({ name, roles: parsed.roles.filter(x => roles[x]) });
  }
  return { roles, scripts, night: official.night, offline, at: sheet.at };
}

// Script JSON'u: ["id", {"id": "..."}, {"id":"_meta","name":"..."}]
export function parseScript(text) {
  let arr;
  try { arr = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;
  let name = '';
  const roles = [];
  for (const x of arr) {
    const id = typeof x === 'string' ? x : x && x.id;
    if (!id) continue;
    if (id === '_meta') { name = (x && x.name) || ''; continue; }
    const n = normId(id);
    if (n && !roles.includes(n)) roles.push(n);
  }
  return { name, roles };
}
