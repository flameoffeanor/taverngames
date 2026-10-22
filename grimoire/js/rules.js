// Kural motoru: gece sırası, rol davranışları, etkiler, ölüm/idam kontrolleri, gündüz yetenekleri, kazanma.
// İlke: sistem hatırlatır, uyarır, hesaplar ve kaydeder; son karar her zaman Hikaye Anlatıcısınındır.
// Kaynak: BotC kural kitabı + Almanac'lar + wiki (bkz. her rolün yanındaki not).

import { phaseIdx, phaseKey } from './store.js?v=20261022-2320';

// ---------------- hatırlatıcı etiketleri ----------------
// Metinler masada ve oyuncu panelinde görünür.
export const TAG_TEXT = {
  poison: 'Zehirli', drunk: 'Sarhoş', protect: 'Korunuyor', safe: 'İdamda ölmez', mad: 'Deli', harpy2: '2. oyuncu',
  grandchild: 'Torun', redherring: 'Kırmızı ringa', moonkill: 'Ölecek', negvote: 'Eksi oy', po3: '3 saldırı',
  noability: 'Yeteneği yok', swdemon: 'İblis oldu', amigo: 'Amigo', vote3: '3 oy', master: 'Efendi', revived: 'Dirildi',
};
// Kaynağı ölünce / sarhoş-zehirli olunca biten (kalıcı) etkiler. Kural kitabı s.?: "Abilities are lost immediately
// on death, poisoning, or drunkenness … any of its persistent effects end."
const EFFECT_TAGS = new Set(['poison', 'drunk', 'protect', 'safe', 'mad', 'harpy2', 'negvote', 'vote3', 'master']);

const LEGACY = [[/^(zehirli|poisoned)$/i, 'poison'], [/^(sarhoş|drunk)$/i, 'drunk'], [/red herring|kırmızı ringa/i, 'redherring']];
export function tagOf(r) {
  if (r.tag) return r.tag;
  const t = String(r.text || '');
  for (const [re, tg] of LEGACY) if (re.test(t)) return tg;
  return null;
}
// Elle eklenen hatırlatıcının etiketi (metinden)
export function tagFromText(text) { return tagOf({ text }); }

// ---------------- rol davranışları ----------------
// targets: [en az, en çok]; alive/dead: hedef durumu; notSelf; info: bilgi rolü (bozuksa yanlış bilgi verilebilir)
// effect: onayda uygulanan etki; kill: İblis saldırısı (öldürme penceresi açılır); pickTeam: gösterilecek rol seçimi
export const CFG = {
  // ---- Tavern'in Spesyali ----
  librarian: { info: 1, targets: [0, 2], pickTeam: 'outsider' },                 // TB: Yabancı + yanlış oyuncu, yoksa 0
  grandmother: { first: { targets: [1, 1], effect: 'grandchild', good: 1, showTarget: 1 },
                 other: { targets: [0, 0], effect: 'gmdie' } },                   // BMR: torun iyi bir oyuncu
  fortuneteller: { info: 1, targets: [2, 2] },                                   // TB: ölü/diri herkes seçilebilir
  empath: { info: 1, targets: [0, 0] },
  monk: { targets: [1, 1], notSelf: 1, effect: 'protect' },                     // TB: sabaha kadar İblis'ten korur
  undertaker: { info: 1, targets: [0, 0] },
  ravenkeeper: { info: 1, targets: [1, 1], showTarget: 1 },                     // TB: ölü oyuncu da seçilebilir
  professor: { targets: [0, 1], dead: 1, effect: 'revive' },                    // BMR: bir kez, ölü oyuncu
  sailor: { targets: [1, 1], alive: 1, effect: 'sailor' },                      // BMR: yaşayan oyuncu
  clockmaker: { info: 1, targets: [0, 0] },
  poisoner: { targets: [1, 1], effect: 'poison' },
  devilsadvocate: { targets: [1, 1], alive: 1, effect: 'safe', notLast: 1 },    // BMR: dün geceki oyuncu olamaz
  scarletwoman: { targets: [0, 0], effect: 'swwake' },                          // sadece İblis olduğu gece
  harpy: { targets: [2, 2], effect: 'harpy' },                                  // wiki: 1. deli, 2. "kötü"
  imp: { targets: [1, 1], kill: 1 },
  po: { kill: 1 },                                                              // hedef sayısı dinamik
  fanggu: { targets: [1, 1], kill: 1 },
  moonchild: { targets: [0, 0], effect: 'moonkill' },
  thief: { targets: [1, 1], notSelf: 1, effect: 'negvote' },                    // TAF: yarın oyu eksi sayılır
  apprentice: { targets: [0, 0], effect: 'gain' },                              // TAF: iyi→Kasabalı, kötü→Minyon yeteneği
  // ---- Bela Kaynıyor ----
  washerwoman: { info: 1, targets: [2, 2], pickTeam: 'townsfolk' },
  investigator: { info: 1, targets: [2, 2], pickTeam: 'minion' },
  chef: { info: 1, targets: [0, 0] },
  butler: { targets: [1, 1], notSelf: 1, effect: 'master' },
  spy: { info: 1, targets: [0, 0] },
  bureaucrat: { targets: [1, 1], notSelf: 1, effect: 'bureaucrat' },
  // ---- Hunovs (ayrıntıları sonra konuşulacak) ----
  innkeeper: { targets: [2, 2], effect: 'protect' },
  preacher: { targets: [1, 1] },
  king: { info: 1, targets: [0, 1] },
  highpriestess: { info: 1, targets: [1, 1] },
  noble: { info: 1, targets: [3, 3] },
  knight: { info: 1, targets: [2, 2] },
  steward: { info: 1, targets: [1, 1] },
  fisherman: { targets: [0, 0] },
  lleech: { targets: [1, 1], kill: 1, first: { targets: [1, 1], effect: 'host', kill: 0 } },
  alhadikhia: { targets: [0, 3] },
  yaggababble: { targets: [0, 4], kill: 1 },
  organgrinder: { targets: [0, 0] },
};
const INFO_TEAM = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' };
const TEAM_WORD = { townsfolk: 'Kasabalı', outsider: 'Yabancı', minion: 'Minyon', demon: 'İblis' };
const tw = t => (TEAM_WORD[t] || t).toLocaleLowerCase('tr');

// Kendini başka rol sanan roller (o rolün sırasında uyanır)
const WAKES_AS = { drunk: 1, lunatic: 1, marionette: 1 };
// Ölüyken de sırası gelen roller (adım içinde ayrıca koşul var)
const DEAD_WAKE = new Set(['ravenkeeper', 'moonchild', 'sage', 'banshee', 'sweetheart', 'plaguedoctor']);

// ---------------- durum yardımcıları ----------------
export function ctx(S, role) {
  const P = id => S.players.find(p => p.id === id);
  const team = p => role(p.role).team;
  const isEvil = p => p.evil != null ? p.evil : ['minion', 'demon'].includes(team(p));
  const seated = () => S.seats.map(P).filter(Boolean);
  const alive = () => seated().filter(p => !p.dead);

  function active(r, holder, depth = 0) {
    const tg = tagOf(r);
    if (!EFFECT_TAGS.has(tg) || !r.src || r.src === holder.id || depth > 6) return true;
    const s = P(r.src);
    if (!s || s.dead || s.gone) return false;
    return broken(s, depth + 1).length === 0;
  }
  function broken(p, depth = 0) {
    const out = [];
    p.reminders.forEach(r => {
      const tg = tagOf(r);
      if ((tg === 'poison' || tg === 'drunk') && active(r, p, depth)) out.push({ kind: tg === 'poison' ? 'Zehirli' : 'Sarhoş', by: r.src, rid: r.id });
    });
    if (p.role === 'drunk') out.push({ kind: 'Gerçekte Sarhoş', by: null });
    if (p.role === 'lunatic') out.push({ kind: 'Gerçekte Deli', by: null });
    return out;
  }
  const has = (p, tag) => p.reminders.some(r => tagOf(r) === tag && active(r, p));
  const sober = p => broken(p).length === 0;
  const neighbors = (p, onlyAlive = true) => {
    const ring = seated(), n = ring.length, i = ring.indexOf(p), out = [];
    if (i < 0) return out;
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = ring[(i + dir * k + n * 2) % n];
        if (q === p) break;
        if (!onlyAlive || !q.dead) { out.push(q); break; }
      }
    }
    return out;
  };
  const demonSafe = p => has(p, 'protect') || (p.role === 'soldier' && sober(p));
  const cantDie = p => p.role === 'sailor' && sober(p);           // BMR Denizci: ayıkken ölemez
  const execSafe = p => has(p, 'safe');                            // BMR Şeytan'ın Avukatı
  const aliveCount = () => alive().filter(p => team(p) !== 'traveller').length;   // gezginler sayılmaz
  return { P, team, isEvil, seated, alive, active, broken, has, sober, neighbors, demonSafe, cantDie, execSafe, aliveCount };
}

const RN = (role, id) => role(id).name;
const regNote = (role, q) => (q.role === 'recluse' ? ` (${RN(role, 'recluse')}: kötü/Minyon/İblis görünebilir)` : q.role === 'spy' ? ` (${RN(role, 'spy')}: iyi görünebilir)` : '');

// Bu gece rolü değişenler (yeni İblis o gece uyanmaz)
function changedTonight(S, nKey) {
  const out = new Set();
  (S.log || []).forEach(x => {
    if (phaseKey(x.phase) !== nKey) return;
    const evs = x.ev.type === 'act' ? (x.ev.effects || []) : [x.ev];
    evs.forEach(e => { if (e.type === 'role') out.add(e.p); });
  });
  return out;
}
// Önceki gün idamla ölen
export function executedDeath(S, dayKey) {
  const e = S.executions?.[dayKey];
  if (e) return e.died ? e.p : null;
  return S.executed?.[dayKey] || null;
}

// ---------------- gece sırası ----------------
export function nightSteps(S, D, role) {
  const first = S.phase.n === 1, c = ctx(S, role);
  const order = first ? D.night.firstNight : D.night.otherNight;
  const nKey = phaseKey(S.phase), prevDay = phaseKey({ kind: 'day', n: S.phase.n - 1 });
  const diedTonight = new Set(S.deaths.filter(d => phaseKey(d.phase) === nKey).map(d => d.p));
  const changed = changedTonight(S, nKey);
  const done = S.done[nKey] || {};
  const seated = c.seated();
  const steps = [];
  const push = (id, p, extra = {}) => {
    const r = role(id), firstLike = extra.firstLike ?? first;
    steps.push({ key: id + ':' + p.id, role: id, pid: p.id, text: (firstLike ? r.first : r.other) || r.other || r.first || '', firstLike, ...extra });
  };

  // Gece ortasında oyuna giren Çırak: ilk gecesinde en başta uyanır
  if (!first) seated.filter(p => p.role === 'apprentice' && !p.dead && (!p.gain || done['apprentice:' + p.id])).forEach(p => push('apprentice', p, { firstLike: true }));

  for (const id of order) {
    if (id === 'dusk' || id === 'dawn') continue;
    if (id === 'minioninfo' || id === 'demoninfo') {
      if (!first) continue;
      const tg = id === 'minioninfo' ? 'minion' : 'demon';
      // 7'den az oyuncuda Minyon/İblis bilgisi yok (gezginler sayılmaz)
      if (seated.filter(p => c.team(p) !== 'traveller').length >= 7 && seated.some(p => c.team(p) === tg))
        steps.push({ key: id, special: id, title: id === 'minioninfo' ? 'Minyon bilgisi' : 'İblis bilgisi' });
      // Kötü gezgin İblis'i öğrenir (kural kitabı: Gezginler)
      if (id === 'demoninfo' && seated.some(p => c.team(p) === 'traveller' && c.isEvil(p)))
        steps.push({ key: 'travellerinfo', special: 'travellerinfo', title: 'Kötü gezgin bilgisi' });
      continue;
    }
    if (id === 'scarletwoman') {   // Kızıl Kadın sadece İblis olduğu gece uyanır
      seated.filter(p => p.reminders.some(r => tagOf(r) === 'swdemon') || done[id + ':' + p.id]).forEach(p => push(id, p));
      continue;
    }
    if (id === 'apprentice' && !first) continue;
    const ps = seated.filter(p => (p.role === id && !WAKES_AS[p.role]) || (WAKES_AS[p.role] && p.believed === id) || p.gain === id);
    for (const p of ps) {
      const key = id + ':' + p.id, isDone = !!done[key];
      if (!isDone) {
        if (id === 'apprentice' && p.gain) continue;
        if (changed.has(p.id) && p.role === id) continue;                       // bu gece bu rol oldu: uyanmaz
        if (p.dead && !DEAD_WAKE.has(id)) continue;                              // ölen yeteneğini kaybeder
        if (id === 'ravenkeeper' && !diedTonight.has(p.id)) continue;            // sadece bu gece öldüyse
        if (id === 'moonchild' && !S.players.some(q => q.reminders.some(r => tagOf(r) === 'moonkill' && r.src === p.id))) continue;
        if (id === 'undertaker' && !executedDeath(S, prevDay)) continue;          // bugün idamla ölen yoksa uyanmaz
        if (id === 'professor' && S.used[p.id + ':professor']) continue;
        if (id === 'grandmother' && !first && !gmTriggered(S, c, p, nKey)) continue;
      }
      const firstLike = first || (p.gain === id && !(S.used[p.id + ':gainfirst']));
      push(id, p, { firstLike, gained: p.gain === id });
    }
  }
  // Çırağın kazandığı yetenek bu gecenin sırasında yoksa (ör. sadece ilk gece çalışan rol), Çırak adımının hemen arkasına ekle
  seated.filter(p => p.gain && !S.used[p.id + ':gainfirst'] && !p.dead && !steps.some(s => s.pid === p.id && s.role === p.gain)).forEach(p => {
    const i = steps.findIndex(s => s.pid === p.id && s.role === 'apprentice');
    const r = role(p.gain);
    if (!r.first) return;   // sadece ilk gece çalışan yetenekler Çırağın ilk gecesinde çalışır (TAF)
    const st = { key: p.gain + ':' + p.id, role: p.gain, pid: p.id, text: r.first, firstLike: true, gained: true };
    steps.splice(i >= 0 ? i + 1 : 0, 0, st);
  });
  return steps;
}
function gmTriggered(S, c, gm, nKey) {
  if (gm.dead) return false;
  return S.players.some(q => q.reminders.some(r => tagOf(r) === 'grandchild' && r.src === gm.id) &&
    S.deaths.some(d => d.p === q.id && phaseKey(d.phase) === nKey && d.cause === 'demon'));
}

export function cfgFor(step, S, role) {
  if (step.special) return { targets: [0, 0] };
  let c = CFG[step.role] || { targets: [0, 3] };
  if (c.first || c.other) c = { ...c, ...((step.firstLike ? c.first : c.other) || {}) };
  if (step.role === 'po') {
    const p = S.players.find(q => q.id === step.pid);
    const three = !!p && p.reminders.some(r => tagOf(r) === 'po3');
    c = { ...c, targets: three ? [3, 3] : [0, 1], three };
  }
  if (!c.targets) c = { ...c, targets: [0, 0] };
  return c;
}

// Hedef olarak seçilebilir mi?
export function canTarget(cfg, S, role, step, q) {
  const c = ctx(S, role);
  if (cfg.alive && q.dead) return false;
  if (cfg.dead && !q.dead) return false;
  if (cfg.notSelf && q.id === step.pid) return false;
  if (cfg.good && c.isEvil(q)) return false;
  if (cfg.notLast && lastTargets(S, step.key).includes(q.id)) return false;
  return true;
}

function lastTargets(S, stepKey) {
  const cur = phaseKey(S.phase);
  for (let i = (S.log || []).length - 1; i >= 0; i--) {
    const x = S.log[i], ev = x.ev;
    if (ev.type === 'act' && ev.step === stepKey && phaseKey(x.phase) !== cur && !ev.skipped) return ev.targets || [];
  }
  return [];
}

// ---------------- adım kartı: uyarı, bilgi, gösterilecek token ----------------
// returns { notes:[], info:[], show:{role,title}|null }
export function stepInfo(step, S, role, NS) {
  const c = ctx(S, role), notes = [], info = [], targets = NS.targets || [];
  let show = null;
  if (step.special === 'minioninfo') {
    const dem = c.seated().filter(p => c.team(p) === 'demon'), mins = c.seated().filter(p => c.team(p) === 'minion');
    info.push(`Minyonlar: ${mins.map(p => `${p.name} (${RN(role, p.role)})`).join(', ')}`);
    info.push(`İblis: ${dem.map(p => p.name).join(', ')}`);
    info.push('Minyonları uyandır, birbirlerini ve İblis\'i göster.');
    return { notes, info, show };
  }
  if (step.special === 'demoninfo') {
    const mins = c.seated().filter(p => c.team(p) === 'minion');
    info.push(`Minyonların: ${mins.map(p => `${p.name} (${RN(role, p.role)})`).join(', ')}`);
    if (S.bluffs.length) info.push(`Blöfler: ${S.bluffs.map(b => RN(role, b)).join(', ')}`);
    else notes.push('Blöf seçilmedi: Menü → Blöfler');
    return { notes, info, show };
  }
  if (step.special === 'travellerinfo') {
    const ev = c.seated().filter(p => c.team(p) === 'traveller' && c.isEvil(p)), dem = c.seated().filter(p => c.team(p) === 'demon');
    info.push(`Kötü gezgin: ${ev.map(p => p.name).join(', ')} → İblis'i öğrenir: ${dem.map(p => p.name).join(', ')}`);
    info.push('Minyonları öğrenmez. (Kural kitabı: Gezginler)');
    return { notes, info, show };
  }
  const p = c.P(step.pid);
  if (!p) return { notes, info, show };
  const cfg = cfgFor(step, S, role);
  const br = c.broken(p);
  br.forEach(b => notes.push(`⚠ ${p.name} ${b.kind.toLocaleLowerCase('tr')}${b.by ? ` (${c.P(b.by)?.name || '?'})` : ''}: yeteneği çalışmaz${cfg.info ? ', yanlış bilgi verebilirsin' : ''}.`));
  if (step.gained) info.push(`${p.name} ${RN(role, 'apprentice')}: bu yetenek ona ait.`);
  const ev = q => c.isEvil(q);
  const ts = targets.map(c.P).filter(Boolean);
  switch (step.role) {
    case 'empath': {
      const nb = c.neighbors(p);
      info.push(`Doğru cevap: ${nb.filter(ev).length} · Yaşayan komşular: ${nb.map(q => q.name + regNote(role, q)).join(', ')}`);
      break;
    }
    case 'clockmaker': {
      const ring = c.seated(), n = ring.length;
      const dis = ring.map((q, i) => c.team(q) === 'demon' ? i : -1).filter(i => i >= 0);
      let best = null;
      dis.forEach(di => ring.forEach((q, i) => { if (c.team(q) === 'minion') { const d = Math.min(Math.abs(i - di), n - Math.abs(i - di)); best = best == null ? d : Math.min(best, d); } }));
      if (best != null) info.push(`Doğru cevap: ${best}` + (ring.some(q => q.role === 'recluse') ? ` (${RN(role, 'recluse')} Minyon sayılabilir)` : ''));
      break;
    }
    case 'chef': {
      const ring = c.seated(), n = ring.length; let k = 0;
      ring.forEach((q, i) => { if (ev(q) && ev(ring[(i + 1) % n])) k++; });
      info.push(`Doğru cevap: ${k}`);
      break;
    }
    case 'fortuneteller': {
      if (ts.length) {
        const yes = ts.some(q => c.team(q) === 'demon' || q.reminders.some(r => tagOf(r) === 'redherring'));
        info.push(`Doğru cevap: ${yes ? 'EVET' : 'HAYIR'}${ts.some(q => q.role === 'recluse') ? ` (${RN(role, 'recluse')} İblis görünebilir)` : ''}`);
      }
      if (!S.players.some(q => q.reminders.some(r => tagOf(r) === 'redherring')))
        notes.push('Kırmızı ringa yok: iyi bir oyuncuya ekle (oyuncu paneli → Hatırlatıcı ekle → Kırmızı ringa).');
      break;
    }
    case 'washerwoman': case 'librarian': case 'investigator': {
      const tm = INFO_TEAM[step.role];
      const real = c.seated().filter(q => q.id !== p.id && c.team(q) === tm);
      info.push(real.length ? `Oyundaki ${tw(tm)}lar: ${real.map(q => `${q.name} (${RN(role, q.role)})`).join(', ')}` : `Oyunda ${tw(tm)} yok: "0" göster.`);
      if (!br.length && ts.length) {
        if (!ts.some(q => c.team(q) === tm) && !ts.some(q => q.role === 'recluse' || q.role === 'spy')) notes.push(`Seçtiğin oyuncular arasında ${tw(tm)} yok. Biri ${tw(tm)} olmalı.`);
        else if (NS.pick && !ts.some(q => q.role === NS.pick)) notes.push(`Gösterilen rol (${RN(role, NS.pick)}) seçtiğin oyunculardan birinin rolü olmalı.`);
      }
      if (!br.length && NS.pick && role(NS.pick).team !== tm) notes.push(`${RN(role, NS.pick)} bir ${tw(tm)} değil.`);
      if (NS.pick) show = { role: NS.pick, title: '' };
      break;
    }
    case 'grandmother': {
      if (step.firstLike) {
        if (ts[0]) { show = { role: ts[0].role, title: '' }; info.push(`Torunun rolünü göster (${RN(role, ts[0].role)}), sonra torunu işaret et.`); }
        if (ts[0] && ev(ts[0])) notes.push('Torun iyi bir oyuncu olmalı.');
      } else {
        const gc = S.players.find(q => q.reminders.some(r => tagOf(r) === 'grandchild' && r.src === p.id));
        info.push(`Torunu ${gc ? gc.name : '?'} bu gece İblis tarafından öldürüldü: ${p.name} de ölür.`);
      }
      break;
    }
    case 'undertaker': {
      const ex = executedDeath(S, phaseKey({ kind: 'day', n: S.phase.n - 1 }));
      if (ex) { const q = c.P(ex); info.push(`Bugün idamla ölen: ${q.name} → ${RN(role, q.role)}${regNote(role, q)}`); show = { role: q.role, title: '' }; }
      break;
    }
    case 'ravenkeeper': {
      if (ts[0]) { info.push(`Göster: ${RN(role, ts[0].role)}${regNote(role, ts[0])}`); show = { role: ts[0].role, title: '' }; }
      break;
    }
    case 'monk': if (targets.includes(p.id)) notes.push(`${RN(role, 'monk')} kendini seçemez.`); break;
    case 'devilsadvocate': {
      const last = lastTargets(S, step.key);
      if (last.length) info.push(`Dün gece seçtiği: ${last.map(id => c.P(id)?.name).join(', ')} (bu gece seçemez)`);
      break;
    }
    case 'sailor': {
      if (ts[0]) {
        const t = c.team(ts[0]);
        info.push(t === 'townsfolk' ? `Genelde seçilen Kasabalı sarhoş olur.` : `Seçilen ${tw(t)}: genelde Denizci'nin kendisi sarhoş olur.`);
      }
      info.push('Ayıkken ölemez (İblis, idam, her şey).');
      break;
    }
    case 'professor': {
      if (ts[0]) info.push(c.team(ts[0]) === 'townsfolk' ? `${ts[0].name} Kasabalı: dirilir. İlk gece yeteneği varsa hemen uyandır.` : `${ts[0].name} Kasabalı değil: hiçbir şey olmaz, yetenek gider.`);
      else info.push('Kimseyi seçmezse yetenek durur. Seçerse bir daha kullanamaz.');
      break;
    }
    case 'harpy': {
      if (ts[0]) info.push(`${ts[0].name} deli: "${ts[1] ? ts[1].name : '2. oyuncu'} kötü" demeli. Yarın bozarsa birini ya da ikisini öldürebilirsin.`);
      info.push(`Sonra deli olanı uyandır: "Bu karakter seni seçti" + ${RN(role, 'harpy')} tokenı, 2. oyuncuyu işaret et.`);
      show = { role: 'harpy', title: 'Bu karakter seni seçti' };
      break;
    }
    case 'scarletwoman': {
      show = { role: p.role, title: 'Sen' };
      info.push(`${p.name} bugün İblis oldu: uyandır, "Sen" ve ${RN(role, p.role)} tokenını göster.`);
      break;
    }
    case 'po': {
      if (cfg.three) info.push('Son seçimi "kimse" idi: bu gece 3 oyuncu seçmeli.');
      else info.push('Kimseyi seçmezse sonraki gece 3 kişi seçer.');
      break;
    }
    case 'fanggu': {
      if (!fangUsed(S)) info.push(`İlk öldürdüğü Yabancı kötü Fang Gu olur, ${p.name} ölür.`);
      break;
    }
    case 'moonchild': {
      S.players.forEach(q => q.reminders.filter(r => tagOf(r) === 'moonkill' && r.src === p.id).forEach(() => {
        if (br.length) notes.push(`⚠ Kural: durum GECE bakılır. ${p.name} şu an ${br[0].kind.toLocaleLowerCase('tr')}: hedef ölmez.`);
        info.push(q.dead ? `Hedef ${q.name} zaten ölü.` : c.cantDie(q) ? `Hedef ${q.name} ölemez (ayık ${RN(role, 'sailor')}).` : `Hedef ${q.name} (seçildiğinde iyiydi): bu gece ölür.`);
      }));
      break;
    }
    case 'thief': if (ts[0]) info.push(`${ts[0].name} yarın oy verdiğinde oyu −1 sayılır.`); break;
    case 'apprentice': {
      info.push(ev(p) ? 'Kötü Çırak: bir Minyon yeteneği kazanır (tercihen oyunda olmayan).' : 'İyi Çırak: bir Kasabalı yeteneği kazanır (tercihen oyunda olmayan).');
      if (NS.pick) show = { role: NS.pick, title: 'Sen' };
      break;
    }
  }
  if (cfg.kill) targets.forEach(t => killOptions(S, role, p, t).checks.forEach(x => notes.push(x)));
  return { notes, info, show };
}

const fangUsed = S => !!(S.used['fanggu:once'] || Object.keys(S.used).some(k => k.endsWith(':fanggu')));

// ---------------- etkiler ----------------
// Onaylanınca uygulanacak olaylar. apply=false: yetenek bozuk → sadece kayıt + kaçınılmaz işaretler.
export function buildEffects(step, S, role, NS, newId) {
  const c = ctx(S, role), p = c.P(step.pid), cfg = cfgFor(step, S, role), effs = [], targets = NS.targets || [];
  const n = S.phase.n;
  const nextNight = phaseIdx({ kind: 'night', n: n + 1 }), dawn = phaseIdx({ kind: 'day', n });
  const rem = (pid, tag, exp, text) => effs.push({ type: 'remAdd', p: pid, rid: newId(), role: step.role, text: text || TAG_TEXT[tag] || tag, tag, src: p.id, exp: exp ?? null });
  const delTag = (tag, filter = () => true) => S.players.forEach(q => q.reminders.filter(r => tagOf(r) === tag && filter(r, q)).forEach(r => effs.push({ type: 'remDel', p: q.id, rid: r.id, text: r.text })));
  const apply = NS.apply !== false;

  // yetenek bozuk olsa da olan şeyler
  if (step.role === 'professor' && targets[0]) effs.push({ type: 'use', key: p.id + ':professor' });   // bir kez: harcanır
  if (step.role === 'po') { if (!targets.length) rem(p.id, 'po3', null); else if (cfg.three) delTag('po3', r => r.src === p.id); }
  if (step.role === 'moonchild') delTag('moonkill', r => r.src === p.id);
  if (step.role === 'scarletwoman') delTag('swdemon', (r, q) => q.id === p.id);
  if (step.role === 'harpy') { delTag('mad', r => r.src === p.id); delTag('harpy2', r => r.src === p.id); }
  if (step.gained && step.firstLike) effs.push({ type: 'use', key: p.id + ':gainfirst' });
  if (step.role === 'apprentice' && NS.pick) effs.push({ type: 'gain', p: p.id, role: NS.pick });
  if (!apply) return effs;

  switch (cfg.effect) {
    case 'poison': targets.forEach(t => rem(t, 'poison', nextNight)); break;            // yarın akşama kadar
    case 'protect': targets.forEach(t => rem(t, 'protect', dawn)); break;                // sabaha kadar
    case 'safe': targets.forEach(t => rem(t, 'safe', nextNight)); break;                 // yarınki idamda
    case 'negvote': targets.forEach(t => rem(t, 'negvote', nextNight)); break;
    case 'bureaucrat': targets.forEach(t => rem(t, 'vote3', nextNight)); break;
    case 'sailor': { const who = NS.sailorSelf ? p.id : targets[0]; if (who) rem(who, 'drunk', nextNight); break; }
    case 'harpy': if (targets[0]) rem(targets[0], 'mad', null); if (targets[1]) rem(targets[1], 'harpy2', null); break;
    case 'grandchild': targets.forEach(t => rem(t, 'grandchild', null)); break;
    case 'gmdie': effs.push({ type: 'die', p: p.id, cause: 'grandmother', by: p.id }); break;
    case 'master': targets.forEach(t => rem(t, 'master', nextNight)); break;
    case 'host': targets.forEach(t => rem(t, null, null, 'Konak')); break;
    case 'revive': {
      const t = targets[0] && c.P(targets[0]);
      if (t && t.dead && c.team(t) === 'townsfolk') effs.push({ type: 'revive', p: t.id, by: p.id });
      break;
    }
    case 'moonkill': S.players.forEach(q => q.reminders.filter(r => tagOf(r) === 'moonkill' && r.src === p.id).forEach(() => {
      if (!q.dead && !c.cantDie(q)) effs.push({ type: 'die', p: q.id, cause: 'moonchild', by: p.id });
    })); break;
  }
  return effs;
}

// ---------------- İblis saldırısı ----------------
// Bir hedef için uyarılar ve seçenekler. Her seçenek: {k, label, sub, effects, rec}
export function killOptions(S, role, demon, tid) {
  const c = ctx(S, role), t = c.P(tid), checks = [], options = [];
  if (!t || !demon) return { checks, options };
  const die = (pid, cause) => ({ type: 'die', p: pid, cause, by: demon.id });
  // İmp kendini seçti: yıldız devri
  if (demon.role === 'imp' && t.id === demon.id) {
    if (c.demonSafe(demon)) {
      checks.push(`🛡 ${demon.name} korunuyor: kendini öldüremez, hiçbir şey olmaz.`);
      options.push({ k: 'none', label: 'Hiçbir şey olmaz', rec: 1, effects: [] });
      return { checks, options };
    }
    const mins = c.alive().filter(q => c.team(q) === 'minion' && q.id !== demon.id);
    const sw = mins.find(q => q.role === 'scarletwoman' && c.sober(q));
    const swMust = sw && c.aliveCount() >= 5;
    checks.push(`${RN(role, 'imp')} kendini seçti: ${demon.name} ölür, yaşayan bir Minyon ${RN(role, 'imp')} olur.` + (swMust ? ` 5+ oyuncu yaşıyor: ${RN(role, 'scarletwoman')} olmak zorunda.` : ''));
    (swMust ? [sw] : mins).forEach(m => options.push({ k: 'star', m: m.id, rec: swMust || mins.length === 1, label: `${m.name} ${RN(role, 'imp')} olsun`, sub: `${RN(role, m.role)} → ${RN(role, 'imp')} · ${demon.name} ölür`,
      effects: [die(demon.id, 'starpass'), { type: 'role', p: m.id, role: 'imp', old: m.role }], show: { pid: m.id, role: 'imp' } }));
    if (!mins.length) { checks.push('Yaşayan Minyon yok: İmp ölür, iyiler kazanır.'); options.push({ k: 'kill', label: `☠ ${demon.name} ölsün`, rec: 1, effects: [die(demon.id, 'demon')] }); }
    options.push({ k: 'none', label: 'Ölmedi', sub: 'Sen öyle karar verdin', effects: [] });
    return { checks, options };
  }
  let blocked = false;
  if (t.dead) { checks.push(`${t.name} zaten ölü: tekrar ölmez.`); blocked = true; }
  else if (c.demonSafe(t)) { checks.push(`🛡 ${t.name} korunuyor${t.role === 'soldier' ? ` (${RN(role, 'soldier')})` : ''}: ölmez.`); blocked = true; }
  else if (c.cantDie(t)) { checks.push(`⚓ ${t.name} ayık ${RN(role, 'sailor')}: ölemez.`); blocked = true; }
  const outsider = c.team(t) === 'outsider';
  if (demon.role === 'fanggu' && outsider && !fangUsed(S)) {
    if (blocked) checks.push('Yabancı ölmediği için Fang Gu atlaması olmaz.');
    else {
      checks.push(`🔥 ${t.name} Yabancı (${RN(role, t.role)}): Fang Gu atlaması! ${t.name} kötü Fang Gu olur, ${demon.name} ölür.`);
      options.push({ k: 'jump', rec: 1, label: 'Fang Gu atlaması', sub: `${t.name} kötü Fang Gu olur · ${demon.name} ölür`,
        effects: [{ type: 'role', p: t.id, role: 'fanggu', evil: true, old: t.role }, { type: 'use', key: 'fanggu:once' }, die(demon.id, 'fanggu')],
        show: { pid: t.id, role: 'fanggu', evil: true } });
    }
  }
  if (!options.some(o => o.k === 'jump')) options.push({ k: 'kill', rec: !blocked, label: `☠ ${t.name} ölsün`, effects: [die(t.id, 'demon')] });
  options.push({ k: 'none', rec: blocked, label: 'Ölmedi', sub: blocked ? 'Korundu / zaten ölü' : 'Sen öyle karar verdin', effects: [] });
  return { checks, options };
}

// ---------------- ölüm sonrası hatırlatmalar ----------------
// before: ölümden önceki durum (Kızıl Kadın sayımı için)
export function deathTriggers(S, role, pid, cause, before) {
  const c = ctx(S, role), p = c.P(pid), out = [];
  if (!p) return out;
  const r = p.role, isNight = S.phase.kind === 'night';
  if (r === 'ravenkeeper' && isNight && cause !== 'execution') out.push({ text: `${p.name} ${RN(role, 'ravenkeeper')}: sırası gelince uyanıp bir oyuncu seçer.` });
  if (r === 'moonchild') out.push({ text: `${p.name} ${RN(role, 'moonchild')}: ölümünü öğrenince (gündüz) herkesin önünde bir oyuncu seçer → Gündüz panelinde "Hedefi seç".` });
  if (r === 'klutz') out.push({ text: `${p.name} ${RN(role, 'klutz')}: ölümünü öğrenince yaşayan bir oyuncu seçer; kötüyse iyiler kaybeder → Gündüz panelinde "Seçimi gir".`, strong: true });
  if (cause === 'demon') {
    const gm = c.alive().find(q => q.role === 'grandmother' && p.reminders.some(x => tagOf(x) === 'grandchild' && x.src === q.id));
    if (gm) out.push({ text: `${p.name} ${RN(role, 'grandmother')} (${gm.name}) için torundu ve İblis öldürdü: ${gm.name} kendi sırasında ölür.` });
  }
  if (role(r).team === 'demon' && cause !== 'fanggu') {
    const bc = before ? ctx(before, role) : c;
    const aliveBefore = bc.aliveCount();
    const sw = c.alive().find(q => q.role === 'scarletwoman');
    if (sw && cause !== 'starpass' && aliveBefore >= 5) {
      if (c.sober(sw)) out.push({ text: `${sw.name} ${RN(role, 'scarletwoman')}: İblis öldüğünde ${aliveBefore} oyuncu yaşıyordu (5+): ${RN(role, r)} olur. Bu gece uyanıp öğrenir.`, strong: true,
        action: { label: `${sw.name} ${RN(role, r)} olsun`, effects: [{ type: 'role', p: sw.id, role: r, old: sw.role }, { type: 'remAdd', p: sw.id, rid: 'sw' + Date.now().toString(36), role: 'scarletwoman', text: TAG_TEXT.swdemon, tag: 'swdemon', src: sw.id }] } });
      else out.push({ text: `${sw.name} ${RN(role, 'scarletwoman')} zehirli/sarhoş: İblis olmaz.` });
    }
  }
  // ölenin kalıcı etkileri biter (kural kitabı: yetenek ölünce kaybolur)
  const ended = [];
  S.players.forEach(q => q.reminders.forEach(x => { if (x.src === pid && EFFECT_TAGS.has(tagOf(x)) && q.id !== pid) ended.push({ q, x }); }));
  if (ended.length) out.push({ text: `${p.name} öldü: etkileri biter (${ended.map(e => `${e.q.name}: ${e.x.text}`).join(', ')}).`,
    action: { label: 'Hatırlatıcıları kaldır', effects: ended.map(e => ({ type: 'remDel', p: e.q.id, rid: e.x.id, text: e.x.text })) } });
  return out;
}

// ---------------- idam / sürgün ----------------
export function execInfo(S, role, pid) {
  const c = ctx(S, role), p = c.P(pid), notes = [];
  const trav = c.team(p) === 'traveller';
  if (trav) {
    const total = c.seated().length;
    notes.push(`Sürgün için oyuncuların en az yarısı destek vermeli: ${Math.ceil(total / 2)} / ${total} (ölüler dahil, yetenekler etkilemez).`);
    return { trav, survives: false, notes };
  }
  let survives = false;
  if (c.execSafe(p)) { survives = true; const src = p.reminders.find(r => tagOf(r) === 'safe'); notes.push(`🛡 ${RN(role, 'devilsadvocate')} korumasında${src ? ` (${c.P(src.src)?.name})` : ''}: idam edilir ama ölmez. Sebebini söyleme.`); }
  if (c.cantDie(p)) { survives = true; notes.push(`⚓ Ayık ${RN(role, 'sailor')}: idam edilir ama ölmez.`); }
  if (p.role === 'saint' && c.sober(p) && !survives) notes.push(`${RN(role, 'saint')} idamla ölürse kötüler kazanır.`);
  if (c.team(p) === 'demon' && !survives) {
    const sw = c.alive().find(q => q.role === 'scarletwoman' && c.sober(q));
    notes.push(sw && c.aliveCount() >= 5 ? `İblis ölürse ${sw.name} (${RN(role, 'scarletwoman')}) İblis olur.` : 'İblis ölürse iyiler kazanır.');
  }
  return { trav, survives, notes };
}

// ---------------- gündüz ----------------
// Gündüz panelinde gösterilecek bekleyen işler ve yetenekler
export function dayItems(S, role) {
  const c = ctx(S, role), items = [], dk = phaseKey(S.phase);
  const inScript = id => S.scriptRoles.includes(id) || c.seated().some(p => p.role === id);
  // Ay Çocuğu / Sakar: ölümü öğrenince seçer
  c.seated().filter(p => p.dead && p.role === 'moonchild' && !S.used[p.id + ':moonchild'])
    .forEach(p => items.push({ k: 'moonchild', pid: p.id, strong: 1, text: `☾ ${p.name} (${RN(role, 'moonchild')}) öldü: herkesin önünde yaşayan bir oyuncu seçer. İyiyse bu gece ölür.`, btn: 'Seçimi gir' }));
  c.seated().filter(p => p.dead && p.role === 'klutz' && !S.used[p.id + ':klutz'])
    .forEach(p => items.push({ k: 'klutz', pid: p.id, strong: 1, text: `${p.name} (${RN(role, 'klutz')}) öldü: yaşayan bir oyuncu seçer. Kötüyse iyiler kaybeder.`, btn: 'Seçimi gir' }));
  // Harpya deliliği
  c.seated().forEach(q => q.reminders.filter(r => tagOf(r) === 'mad' && r.role === 'harpy' && c.active(r, q)).forEach(r => {
    const second = c.seated().find(x => x.reminders.some(y => tagOf(y) === 'harpy2' && y.src === r.src));
    items.push({ k: 'harpy', pid: q.id, other: second?.id, text: `${q.name} deli: "${second ? second.name : '?'} kötü" demeli. Bozarsa birini ya da ikisini öldürebilirsin.` });
  }));
  // oy etkileri
  const neg = c.seated().filter(q => q.reminders.some(r => tagOf(r) === 'negvote' && c.active(r, q)));
  if (neg.length) items.push({ k: 'info', text: `➖ Eksi oy (${RN(role, 'thief')}): ${neg.map(q => q.name).join(', ')}` });
  // yetenekler (blöf eden de kullanabilir: hikaye anlatıcısı oynar)
  if (inScript('slayer')) items.push({ k: 'slayer', btn: `🏹 ${RN(role, 'slayer')}` });
  if (inScript('artist')) items.push({ k: 'artist', btn: `🎨 ${RN(role, 'artist')}` });
  if (inScript('alsaahir')) items.push({ k: 'alsaahir', btn: `🔮 ${RN(role, 'alsaahir')}`, used: !!S.used['alsaahir:' + dk] });
  if (c.seated().some(p => p.role === 'gunslinger' && !p.dead)) items.push({ k: 'gunslinger', btn: `🔫 ${RN(role, 'gunslinger')}`, used: !!S.used['gunslinger:' + dk] });
  if (c.seated().some(p => p.role === 'gnome' && !p.dead)) items.push({ k: 'gnome', btn: `🍄 ${RN(role, 'gnome')}` });
  return items;
}

// ---------------- kazanma ----------------
export function winCheck(S, role) {
  if (S.result) return null;
  const c = ctx(S, role);
  const demons = c.seated().filter(p => c.team(p) === 'demon');
  const aliveDem = demons.filter(p => !p.dead);
  if (demons.length && !aliveDem.length) {
    // Kızıl Kadın: İblis öldüğünde 5+ (gezginler hariç) yaşıyorduysa İblis olur → oyun bitmez
    const sw = c.alive().find(q => q.role === 'scarletwoman' && c.sober(q));
    if (sw && c.aliveCount() + 1 >= 5) return null;
    return { winner: 'good', reason: 'İblis öldü' };
  }
  if (aliveDem.length && c.aliveCount() <= 2) return { winner: 'evil', reason: 'Sadece 2 oyuncu kaldı (gezginler sayılmaz)' };
  return null;
}
