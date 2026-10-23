// Veri katmanı: Sheet'ten TR karakterler + script'ler, repo içindeki resmi rol/gece verisi.
// Sheet okunamazsa (mekanda internet yoksa) son başarılı yükleme kullanılır.

const SHEET_ID = '1CvS4Fa1Aht6-KG1EVdSeCiT3nUsBqZ2arLMqKSxxviY';
const CHAR_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const SCRIPT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=1395107313`;
const CACHE_KEY = 'tg-grim-data-v1';

export const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled'];
export const TEAM_TR = {
  townsfolk: 'Kasabalı', outsider: 'Yabancı', minion: 'Minyon', demon: 'İblis',
  traveller: 'Gezgin', fabled: 'Efsanevi',
};
export const GOOD = new Set(['townsfolk', 'outsider']);

// Oyuncu sayısına göre temel dağılım [kasabalı, yabancı, minyon, iblis]
export const DIST = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
  10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
};

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
  if (t.startsWith('hatirlat')) return 'reminder';
  return t;
};

async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

export async function loadData() {
  const official = await (await fetch('data/official.json?v=20261023-0435')).json();
  let sheet, offline = false;
  try {
    const [c, s] = await Promise.all([fetchText(CHAR_URL), fetchText(SCRIPT_URL)]);
    sheet = { chars: parseCSV(c), scripts: parseCSV(s), at: Date.now() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(sheet)); } catch (e) {}
  } catch (e) {
    try { sheet = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e2) {}
    if (!sheet) throw new Error('Karakter listesi yüklenemedi ve kayıtlı kopya yok.');
    offline = true;
  }
  return build(official, sheet, offline);
}

function build(official, sheet, offline) {
  const roles = {};
  for (const row of sheet.chars) {
    const id = (row.id || '').toLowerCase();
    if (!id) continue;
    const o = official.roles[id] || {};
    roles[id] = {
      id,
      name: row.name || o.name || id,
      team: normTeam(row.team) || o.team || 'townsfolk',
      ability: row.ability || '',
      first: row.first_night || '',
      other: row.other_night || '',
      reminders: o.reminders || [],
      remindersGlobal: o.remindersGlobal || [],
      setup: !!o.setup,
      official: !!official.roles[id],
    };
  }
  // Sheet'te olmayan resmi rolleri de tanı (custom script'te çıkarsa diye)
  for (const [id, o] of Object.entries(official.roles)) {
    if (roles[id]) continue;
    roles[id] = { id, name: o.name, team: o.team, ability: '', first: '', other: '',
      reminders: o.reminders || [], remindersGlobal: o.remindersGlobal || [], setup: !!o.setup, official: true };
  }
  const scripts = [];
  for (const row of sheet.scripts) {
    const name = row.script_name; let ids = [];
    try {
      ids = JSON.parse(row.id).map(x => (typeof x === 'string' ? x : x.id)).filter(x => x && x !== '_meta');
    } catch (e) { continue; }
    if (name && ids.length) scripts.push({ name, roles: ids.map(x => x.toLowerCase().replace(/[^a-z]/g, '')).filter(x => roles[x]) });
  }
  return { roles, scripts, night: official.night, offline, at: sheet.at };
}

export function iconUrl(id) { return `/botc/${id}.png`; }
