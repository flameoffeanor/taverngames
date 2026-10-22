// Gece motoru: adım listesi, rol davranışları, etkiler, uyarılar.
// Kural: sistem hatırlatır, uyarır ve kaydeder; son kararı her zaman Hikaye Anlatıcısı verir.

import { phaseIdx, phaseKey } from './store.js';

// ---- rol davranışları ----
// targets: [min, max] hedef sayısı; effect: hedefe uygulanan etki
// alive: sadece yaşayan hedef; notSelf: kendini seçemez; dead: sadece ölü hedef
// info: bilgi rolü (zehirliyse yanlış bilgi verilebilir); once: oyunda bir kez
// firstOnly/otherOnly: sadece ilk / sonraki geceler (metin zaten Sheet'ten gelir, bu ek güvence)
export const CFG = {
  // Tavern'in Spesyali
  librarian: { info: true, targets: [0, 2], pickRole: true },
  grandmother: { targets: [0, 0], first: { targets: [1, 1], effect: 'grandchild' } },   // torunu sadece ilk gece seçer
  fortuneteller: { info: true, targets: [2, 2] },
  empath: { info: true, targets: [0, 0] },
  monk: { targets: [1, 1], notSelf: true, effect: 'protect' },
  undertaker: { info: true, targets: [0, 0] },
  ravenkeeper: { info: true, targets: [1, 1] },
  professor: { targets: [0, 1], dead: true, effect: 'revive', once: true },
  sailor: { targets: [1, 1], alive: true, effect: 'sailor' },
  clockmaker: { info: true, targets: [0, 0] },
  poisoner: { targets: [1, 1], effect: 'poison' },
  devilsadvocate: { targets: [1, 1], alive: true, effect: 'safe' },
  scarletwoman: { targets: [0, 0] },
  harpy: { targets: [2, 2], effect: 'mad' },
  imp: { targets: [1, 1], effect: 'kill', demon: true },
  po: { targets: [0, 3], effect: 'kill', demon: true },
  fanggu: { targets: [1, 1], effect: 'kill', demon: true },
  thief: { targets: [1, 1], effect: 'thief' },
  apprentice: { targets: [0, 0] },
  // Hunovs
  innkeeper: { targets: [2, 2], effect: 'protect' },
  preacher: { targets: [1, 1] },
  king: { info: true, targets: [0, 1] },
  highpriestess: { info: true, targets: [1, 1] },
  noble: { info: true, targets: [3, 3] },
  knight: { info: true, targets: [2, 2] },
  fisherman: { targets: [0, 0] },
  lleech: { targets: [1, 1], effect: 'kill', demon: true, first: { targets: [1, 1], effect: 'host' } },
  alhadikhia: { targets: [0, 3], demon: true },
  yaggababble: { targets: [0, 4], effect: 'kill', demon: true },
  organgrinder: { targets: [0, 0] },
  // Bela Kaynıyor (TB)
  washerwoman: { info: true, targets: [2, 2], pickRole: true },
  investigator: { info: true, targets: [2, 2], pickRole: true },
  chef: { info: true, targets: [0, 0] },
  butler: { targets: [1, 1], notSelf: true, effect: 'master' },
  spy: { info: true, targets: [0, 0] },
  bureaucrat: { targets: [1, 1], effect: 'bureaucrat' },
};

const POISON_WORDS = ['zehirli', 'poisoned'], DRUNK_WORDS = ['sarhoş', 'drunk'];
export function tagOf(text) {
  const t = String(text).toLocaleLowerCase('tr');
  if (POISON_WORDS.includes(t)) return 'poison';
  if (DRUNK_WORDS.includes(t)) return 'drunk';
  return null;
}

// ---- durum yardımcıları ----
export function ctx(S, role) {
  const P = id => S.players.find(p => p.id === id);
  const team = p => role(p.role).team;
  const isEvil = p => p.evil != null ? p.evil : ['minion', 'demon'].includes(team(p));
  // Yeteneği çalışmıyor mu? (zehirli, sarhoş ya da gerçekte Sarhoş)
  const broken = p => {
    const out = [];
    p.reminders.forEach(r => {
      const tg = r.tag || tagOf(r.text);
      if (tg === 'poison') out.push({ kind: 'Zehirli', by: r.src, at: r.at });
      if (tg === 'drunk') out.push({ kind: 'Sarhoş', by: r.src, at: r.at });
    });
    if (p.role === 'drunk') out.push({ kind: 'Gerçekte Sarhoş', by: null });
    if (p.role === 'lunatic') out.push({ kind: 'Gerçekte Deli (Lunatic)', by: null });
    return out;
  };
  const seatsAlive = () => S.seats.map(P).filter(Boolean);
  const neighbors = (p, onlyAlive = true) => {
    const ring = S.seats.map(P), n = ring.length, i = ring.indexOf(p), out = [];
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = ring[(i + dir * k + n * 2) % n];
        if (q === p) break;
        if (!onlyAlive || !q.dead) { out.push(q); break; }
      }
    }
    return out;
  };
  return { P, team, isEvil, broken, neighbors, seatsAlive };
}

const RN = (role, id) => role(id).name;

// ---- gece adımları ----
// Sarhoş/Deli kendini sandığı rolün sırasında uyanır.
const WAKES_AS = { drunk: true, lunatic: true, marionette: true };
const DEAD_WAKE = new Set(['ravenkeeper', 'sage', 'moonchild', 'klutz', 'banshee', 'barber', 'sweetheart', 'plaguedoctor', 'scarletwoman']);

export function nightSteps(S, D, role) {
  const first = S.phase.n === 1;
  const order = first ? D.night.firstNight : D.night.otherNight;
  const c = ctx(S, role);
  const steps = [];
  const nKey = phaseKey(S.phase);
  const diedTonight = new Set(S.deaths.filter(d => phaseKey(d.phase) === nKey).map(d => d.p));
  const changed = new Set();
  (S.log || []).forEach(x => { if (phaseKey(x.phase) !== nKey) return;
    const evs = x.ev.type === 'act' ? (x.ev.effects || []) : [x.ev];
    evs.forEach(e => { if (e.type === 'role') changed.add(e.p); }); });
  for (const id of order) {
    if (id === 'dusk' || id === 'dawn') continue;
    if (id === 'minioninfo' || id === 'demoninfo') {
      if (!first) continue;
      if (S.players.filter(p => !p.gone && c.team(p) !== 'traveller').length < 7) continue;
      const tg = id === 'minioninfo' ? 'minion' : 'demon';
      if (!S.players.some(p => !p.gone && c.team(p) === tg)) continue;
      steps.push({ key: id, special: id, title: id === 'minioninfo' ? 'Minyon bilgisi' : 'İblis bilgisi' });
      continue;
    }
    // bu rolde uyanacak oyuncular
    const ps = S.players.filter(p => !p.gone && (p.role === id && !WAKES_AS[p.role] || (WAKES_AS[p.role] && p.believed === id)));
    for (const p of ps) {
      const r = role(id);
      const text = first ? r.first : r.other;
      if (!text) continue;
      if (changed.has(p.id) && p.role === id && !(S.done[nKey] || {})[id + ':' + p.id]) continue;
      const deadBefore = p.dead && !diedTonight.has(p.id);
      if (deadBefore && !DEAD_WAKE.has(id)) continue;   // ölü oyuncu uyanmaz: sıradan tamamen çıkar
      steps.push({ key: id + ':' + p.id, role: id, pid: p.id, text });
    }
  }
  return steps;
}

export function cfgFor(id, S) {
  const c = CFG[id] || { targets: [0, 3] };
  if (S.phase.n === 1 && c.first && typeof c.first === 'object') return { ...c, ...c.first };
  return c;
}

// Adım kartında gösterilecek uyarılar ve otomatik bilgi
export function stepNotes(step, S, role, targets) {
  const c = ctx(S, role), notes = [], info = [];
  if (step.special === 'minioninfo') {
    const dem = S.players.filter(p => c.team(p) === 'demon'), mins = S.players.filter(p => c.team(p) === 'minion');
    info.push(`Minyonlar: ${mins.map(p => `${p.name} (${RN(role, p.role)})`).join(', ')}`);
    info.push(`İblis: ${dem.map(p => p.name).join(', ')}`);
    return { notes, info };
  }
  if (step.special === 'demoninfo') {
    const mins = S.players.filter(p => c.team(p) === 'minion');
    info.push(`Minyonların: ${mins.map(p => `${p.name} (${RN(role, p.role)})`).join(', ')}`);
    info.push(S.bluffs.length ? `Blöfler: ${S.bluffs.map(b => RN(role, b)).join(', ')}` : 'Blöf seçilmedi: Menü → Blöfler');
    return { notes, info };
  }
  const p = c.P(step.pid);
  if (!p) return { notes, info };
  const br = c.broken(p);
  br.forEach(b => notes.push(`⚠ ${p.name} ${b.kind.toLocaleLowerCase('tr')}${b.by ? ` (${c.P(b.by)?.name || '?'})` : ''}: yeteneği çalışmaz${CFG[step.role]?.info ? ', yanlış bilgi verebilirsin' : ''}.`));
  if (step.skipDead) notes.push(`${p.name} ölü. Bu rol ölüyken uyanmaz; atlayabilirsin.`);
  const ev = q => c.isEvil(q);
  const sp = q => (q.role === 'recluse' || q.role === 'spy') ? ` (${RN(role, q.role)} farklı görünebilir)` : '';
  switch (step.role) {
    case 'empath': {
      const nb = c.neighbors(p);
      info.push(`Doğru cevap: ${nb.filter(ev).length} · Komşular: ${nb.map(q => q.name + sp(q)).join(', ')}`);
      break;
    }
    case 'clockmaker': {
      const ring = S.seats.map(c.P), n = ring.length;
      const di = ring.findIndex(q => c.team(q) === 'demon');
      let best = null;
      ring.forEach((q, i) => { if (c.team(q) === 'minion') { const d = Math.min(Math.abs(i - di), n - Math.abs(i - di)); best = best == null ? d : Math.min(best, d); } });
      if (di >= 0 && best != null) info.push(`Doğru cevap: ${best}`);
      break;
    }
    case 'chef': {
      const ring = S.seats.map(c.P), n = ring.length; let k = 0;
      ring.forEach((q, i) => { if (ev(q) && ev(ring[(i + 1) % n])) k++; });
      info.push(`Doğru cevap: ${k}`);
      break;
    }
    case 'fortuneteller': {
      if (targets.length) {
        const ts = targets.map(c.P);
        const yes = ts.some(q => c.team(q) === 'demon' || q.reminders.some(r => /red herring|kırmızı ringa/i.test(r.text)));
        info.push(`Doğru cevap: ${yes ? 'EVET' : 'HAYIR'}${ts.some(q => q.role === 'recluse') ? ` (${RN(role,'recluse')} İblis görünebilir)` : ''}`);
      }
      if (S.phase.n === 1 && !S.players.some(q => q.reminders.some(r => /red herring|kırmızı ringa/i.test(r.text))))
        notes.push('Kırmızı ringa henüz seçilmedi: iyi bir oyuncuya "Red herring" hatırlatıcısı ekle.');
      break;
    }
    case 'undertaker': {
      const prevDay = phaseKey({ kind: 'day', n: S.phase.n - 1 });
      const ex = S.executed[prevDay];
      info.push(ex ? `Bugün idam edilen: ${c.P(ex).name} → ${RN(role, c.P(ex).role)}` : 'Bugün idam yok; uyandırma.');
      break;
    }
    case 'ravenkeeper': {
      const died = S.deaths.some(d => d.p === p.id && phaseKey(d.phase) === phaseKey(S.phase));
      if (!died) notes.push(`${RN(role,'ravenkeeper')} bu gece ölmedi; uyandırma.`);
      if (targets.length) info.push(`Göster: ${RN(role, c.P(targets[0]).role)}`);
      break;
    }
    case 'monk': if (targets.includes(p.id)) notes.push(`${RN(role,'monk')} kendini seçemez.`); break;
    case 'devilsadvocate': {
      const last = lastTargets(S, step.key);
      if (targets.some(t => last.includes(t))) notes.push(`${RN(role,'devilsadvocate')} aynı oyuncuyu üst üste iki gece seçemez.`);
      break;
    }
    case 'scarletwoman':
      if (!S.players.some(q => q.role === 'scarletwoman' && q.reminders.some(r => /iblis|demon/i.test(r.text))) && p.role === 'scarletwoman')
        notes.push(`${RN(role,'scarletwoman')} bugün İblis olmadıysa uyandırma.`);
      break;
    case 'professor': if (S.used[p.id + ':professor']) notes.push(`${RN(role,'professor')} yeteneğini kullandı.`); break;
  }
  if (CFG[step.role]?.demon) {
    targets.forEach(t => killChecks(S, role, t, p).forEach(x => notes.push(x)));
  }
  return { notes, info };
}

function lastTargets(S, stepKey) {
  for (let i = S.log.length - 1; i >= 0; i--) {
    const ev = S.log[i].ev;
    if (ev.type === 'act' && ev.step === stepKey && phaseKey(S.log[i].phase) !== phaseKey(S.phase)) return ev.targets || [];
  }
  return [];
}

// İblis öldürmesine karşı uyarılar
export function killChecks(S, role, tid, demon) {
  const c = ctx(S, role), t = c.P(tid), out = [];
  if (!t) return out;
  if (t.dead) out.push(`${t.name} zaten ölü.`);
  if (t.reminders.some(r => r.tag === 'protect')) out.push(`🛡 ${t.name} korunuyor (${t.reminders.filter(r => r.tag === 'protect').map(r => c.P(r.src)?.name || '?').join(', ')}): ölmez.`);
  if (t.role === 'soldier' && !c.broken(t).length) out.push(`🛡 ${t.name} ${RN(role,'soldier')}: İblis öldüremez.`);
  if (demon && demon.role === 'fanggu' && c.team(t) === 'outsider' && !S.used[demon.id + ':fanggu']) {
    out.push(`🔥 ${t.name} Yabancı (${RN(role, t.role)})! Fang Gu atlaması: ${t.name} kötü Fang Gu olur, ${demon.name} ölür.`);
  }
  if (demon && t.id === demon.id && demon.role === 'imp') out.push(`${RN(role,'imp')} kendini seçti: bir Minyon ${RN(role,'imp')} olur.`);
  return out;
}

// ---- etkiler ----
// Adım onaylanınca uygulanacak olay listesi. broken=true ise etki uygulanmaz (sadece kayıt).
export function buildEffects(step, S, role, targets, opts, newId) {
  const c = ctx(S, role), p = c.P(step.pid), cfg = cfgFor(step.role, S), effs = [];
  const n = S.phase.n, nextNight = phaseIdx({ kind: 'night', n: n + 1 }), thisDay = phaseIdx({ kind: 'day', n });
  const rem = (pid, text, tag, exp) => effs.push({ type: 'remAdd', p: pid, rid: newId(), role: step.role, text, tag, src: p.id, exp });
  if (opts.apply === false) return effs;
  switch (cfg.effect) {
    case 'poison': targets.forEach(t => rem(t, 'Zehirli', 'poison', nextNight)); break;
    case 'protect': targets.forEach(t => rem(t, 'Korunuyor', 'protect', thisDay)); break;
    case 'safe': targets.forEach(t => rem(t, 'Güvende', 'safe', nextNight)); break;
    case 'mad': if (targets[0]) rem(targets[0], 'Deli', 'mad', nextNight); if (targets[1]) rem(targets[1], '2. oyuncu', null, nextNight); break;
    case 'grandchild': targets.forEach(t => rem(t, 'Torun', 'grandchild', null)); break;
    case 'master': targets.forEach(t => rem(t, 'Efendi', null, nextNight)); break;
    case 'sailor': rem(opts.sailorSelf ? p.id : targets[0], 'Sarhoş', 'drunk', nextNight); break;
    case 'host': targets.forEach(t => rem(t, 'Konak', 'host', null)); break;
    case 'revive': if (targets[0]) { effs.push({ type: 'use', key: p.id + ':professor' }); if (role(c.P(targets[0]).role).team === 'townsfolk') effs.push({ type: 'revive', p: targets[0] }); } break;
  }
  return effs;
}

// ---- ölüm tetikleyicileri ----
// Bir ölümden sonra Hikaye Anlatıcısına hatırlatılacaklar
export function deathTriggers(S, role, pid, cause) {
  const c = ctx(S, role), p = c.P(pid), out = [];
  if (!p) return out;
  const r = p.role, night = S.phase.kind === 'night';
  const alive = S.players.filter(q => !q.dead).length;
  if (r === 'ravenkeeper' && night) out.push({ text: `${p.name} ${RN(role,'ravenkeeper')}: bu gece uyanıp bir oyuncu seçecek.` });
  if (r === 'moonchild') out.push({ text: `${p.name} ${RN(role,'moonchild')}: bir oyuncu seçecek; iyi ise o oyuncu bu gece ölür.` });
  if (r === 'klutz') out.push({ text: `${p.name} ${RN(role,'klutz')}: hemen yaşayan bir oyuncu seçmeli; kötü seçerse kendi takımı kaybeder.` });
  if (r === 'saint' && cause === 'execution') out.push({ text: `${p.name} ${RN(role,'saint')} idam edildi: iyi takım kaybeder (zehirli/sarhoş değilse).`, strong: true });
  if (role(r).team === 'demon' && cause !== 'fanggu' && cause !== 'starpass') {
    const sw = S.players.find(q => q.role === 'scarletwoman' && !q.dead);
    if (sw && alive >= 4) out.push({ text: `${sw.name} ${RN(role,'scarletwoman')}: İblis öldüğünde ${alive + 1} oyuncu yaşıyordu (5+), İblis olur.`, action: { label: `${sw.name} İblis olsun`, type: 'role', p: sw.id, role: r } });
    else if (!S.players.some(q => !q.dead && role(q.role).team === 'demon')) out.push({ text: 'Yaşayan İblis kalmadı: iyi takım kazanabilir.', strong: true });
  }
  if (cause === 'demon') {
    const gm = S.players.find(q => q.role === 'grandmother' && !q.dead && q.reminders.length >= 0 && p.reminders.some(x => x.tag === 'grandchild' && x.src === q.id));
    if (gm) out.push({ text: `${p.name}, ${RN(role,'grandmother')} ${gm.name} oyuncusunun torunuydu: ${gm.name} de ölür.`, action: { label: `${gm.name} ölsün`, type: 'die', p: gm.id, cause: 'grandmother' } });
  }
  // ölen kişi birini zehirliyor/koruyorduysa
  S.players.forEach(q => q.reminders.forEach(x => { if (x.src === pid && (x.tag === 'poison' || x.tag === 'drunk')) out.push({ text: `${q.name} üzerindeki ${x.text} (${p.name}) ölümle birlikte düşebilir. Kontrol et.` }); }));
  return out;
}
