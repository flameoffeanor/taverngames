// "İlk gece öncesi": gece sırası gibi adım adım akan hazırlık.
// Sarhoş'un sandığı rol, gezgin takımı, kırmızı ringa, ilk gece bilgileri (Almanac: "while preparing the first night"),
// Çırak / Cüce, İblis blöfleri. Oyuncular masada dokunarak seçilir. Her adım tek olay ('pre'): tek geri alma.
import { G, esc, role, rname, icon, roleChip, shuffle, P, seated } from './core.js?v=20261023-0135';
import { TEAM_TR } from './data.js?v=20261023-0135';

// Kendini başka rol sanan roller ve sandıkları rolün takımı
export const BELIEVES = { drunk: 'townsfolk', lunatic: 'demon', marionette: 'townsfolk' };

const PREP = {
  washerwoman: { n: 2, team: 'townsfolk', pick: true, hint: 'Bir Kasabalı + bir yanlış oyuncu. Kasabalının rolü gösterilir.' },
  librarian: { n: 2, team: 'outsider', pick: true, hint: 'Bir Yabancı + bir yanlış oyuncu. Yabancının rolü gösterilir. Sarhoş da Yabancıdır.' },
  investigator: { n: 2, team: 'minion', pick: true, hint: 'Bir Minyon + bir yanlış oyuncu. Minyonun rolü gösterilir.' },
  grandmother: { n: 1, kind: 'good', hint: 'Torun: iyi bir oyuncu. Rolü gösterilir, oyuncu işaret edilir.' },
  steward: { n: 1, kind: 'good', hint: 'İyi bir oyuncu.' },
  noble: { n: 3, kind: 'noble', hint: '3 oyuncu, tam olarak 1\'i kötü.' },
  knight: { n: 2, kind: 'knight', hint: '2 oyuncu, ikisi de İblis değil.' },
};

const team = p => role(p.role).team;
const isEvil = p => team(p) === 'traveller' ? !!p.evil : ['minion', 'demon'].includes(team(p));
const one = arr => arr[Math.floor(Math.random() * arr.length)];

export function owners(players) {
  return players.flatMap(p => [...new Set([p.role, p.believed])].filter(id => id && PREP[id])
    .map(id => ({ id, p, key: id + ':' + p.id, fake: id !== p.role })));
}
export function suggest(o, players) {
  const k = PREP[o.id], others = players.filter(q => q.id !== o.p.id);
  if (k.team) {
    const real = others.filter(q => team(q) === k.team); if (!real.length) return { targets: [], pick: null };
    const x = one(real), y = one(others.filter(q => q !== x));
    return { targets: shuffle([x.id, y.id]), pick: x.role };
  }
  if (k.kind === 'good') return { targets: [one(others.filter(q => !isEvil(q)))?.id].filter(Boolean) };
  if (k.kind === 'noble') { const e = one(others.filter(isEvil)), g = shuffle(others.filter(q => !isEvil(q))).slice(0, 2); return { targets: shuffle([e, ...g].filter(Boolean).map(q => q.id)) }; }
  return { targets: shuffle(others.filter(q => team(q) !== 'demon')).slice(0, 2).map(q => q.id) };
}
const hasFT = players => players.some(p => p.role === 'fortuneteller' || p.believed === 'fortuneteller');
function bluffPool(S) {
  const inPlay = new Set(S.players.filter(p => !p.gone).flatMap(p => [p.role, p.believed]).filter(Boolean));
  return S.scriptRoles.filter(id => ['townsfolk', 'outsider'].includes(role(id).team) && !inPlay.has(id));
}

// Kurulumda öneriler (oyun başlarken): roller belli, isimler yok
export function initial(players, scriptRoles) {
  const prep = {};
  owners(players).forEach(o => { prep[o.key] = suggest(o, players); });
  const good = players.filter(p => !isEvil(p) && team(p) !== 'traveller');
  const rh = hasFT(players) && good.length ? one(good).id : null;
  const inPlay = new Set(players.map(p => p.role));
  const pool = scriptRoles.filter(id => ['townsfolk', 'outsider'].includes(role(id).team) && !inPlay.has(id));
  const bluffs = players.some(p => team(p) === 'demon') ? shuffle(pool).slice(0, 3) : [];
  return { prep, rh, bluffs };
}

// ---------------- adımlar ----------------
// step: {key, kind, role (ikon), title, sub, hint, n (masadan seçilecek oyuncu), can(p), pickTeam}
export function steps() {
  const S = G.S, players = seated(), out = [];
  players.filter(p => BELIEVES[p.role]).forEach(p => out.push({ key: 'bel:' + p.id, kind: 'bel', pid: p.id, role: p.role, title: rname(p.role), sub: 'Sandığı rol',
    hint: `Kendini hangi ${TEAM_TR[BELIEVES[p.role]].toLocaleLowerCase('tr')} sanıyor? Torbadan bu rolün tokenını çeker. Oyunda olmayan bir rol olmalı.`, n: 0, pickTeam: BELIEVES[p.role] }));
  players.filter(p => team(p) === 'traveller').forEach(p => out.push({ key: 'aln:' + p.id, kind: 'aln', pid: p.id, role: p.role, title: rname(p.role), sub: 'Takımı', hint: 'Gezginin takımını sen seçersin.', n: 0 }));
  if (hasFT(players)) out.push({ key: 'rh', kind: 'rh', role: 'fortuneteller', title: rname('fortuneteller'), sub: 'Kırmızı ringa', n: 1, can: p => !isEvil(p),
    hint: 'Herhangi bir iyi oyuncu (Falcı\'nın kendisi de olabilir). Ona bakınca "Evet" görür.' });
  owners(players).forEach(o => {
    const k = PREP[o.id], noRole = k.team && !players.some(q => q.id !== o.p.id && team(q) === k.team);
    out.push({ key: 'prep:' + o.key, kind: 'prep', o, pid: o.p.id, role: o.id, title: rname(o.id), sub: 'İlk gece bilgisi',
      hint: k.hint + (o.fake ? ` (Aslında ${rname(o.p.role)}: yanlış bilgi serbest.)` : ''), n: noRole ? 0 : k.n, noRole, pickTeam: k.pick && !noRole ? k.team : null, can: p => p.id !== o.p.id });
  });
  players.filter(p => p.role === 'apprentice').forEach(p => out.push({ key: 'gain:' + p.id, kind: 'gain', pid: p.id, role: 'apprentice', title: rname('apprentice'), sub: 'Kazandığı yetenek',
    hint: `${p.evil ? 'Bir Minyon' : 'Bir Kasabalı'} yeteneği kazanır. Tercihen oyunda olmayan bir rol. Boş bırakırsan gece seçersin.`, n: 0, pickTeam: p.evil ? 'minion' : 'townsfolk' }));
  players.filter(p => p.role === 'gnome').forEach(p => out.push({ key: 'amigo:' + p.id, kind: 'amigo', pid: p.id, role: 'gnome', title: rname('gnome'), sub: 'Amigo', n: 1,
    can: q => q.id !== p.id && isEvil(q) === isEvil(p), hint: 'Cüce ile aynı takımdan bir oyuncu. Herkese açıkla.' }));
  if (players.some(p => team(p) === 'demon')) out.push({ key: 'bluffs', kind: 'bluffs', title: 'İblis blöfleri', sub: '3 iyi rol', n: 0,
    hint: 'Oyunda olmayan 3 iyi rol (Sarhoş\'un sandığı rol hariç). İlk gece İblis\'e gösterilir.' });
  return out;
}

// Adıma girince seçimler önceki değer ya da öneriyle dolar
export function prefill(st, NS) {
  const S = G.S, p = st.pid ? P(st.pid) : null;
  NS.targets = []; NS.pick = null; NS.bl = null;
  if (st.kind === 'bel') NS.pick = p.believed || null;
  if (st.kind === 'aln') NS.pick = p.evil ? 'evil' : 'good';
  if (st.kind === 'rh') { const x = seated().find(q => q.reminders.some(r => r.tag === 'redherring')); if (x) NS.targets = [x.id]; }
  if (st.kind === 'prep') { const v = S.prep[st.o.key] || suggest(st.o, seated()); NS.targets = (v.targets || []).filter(id => id && P(id) && !P(id).gone); NS.pick = v.pick || null; }
  if (st.kind === 'gain') NS.pick = S.prep['apprentice:' + st.pid]?.pick || null;
  if (st.kind === 'amigo') { const x = seated().find(q => q.reminders.some(r => r.tag === 'amigo' && r.src === st.pid)); if (x) NS.targets = [x.id]; }
  if (st.kind === 'bluffs') {
    const pool = bluffPool(S); NS.bl = S.bluffs.filter(id => pool.includes(id));
    // Sarhoş'un sandığı rol blöflerden düştüyse eksikleri tamamla (onaylanmamışsa)
    if (!S.pdone?.bluffs && NS.bl.length < 3) NS.bl.push(...shuffle(pool.filter(id => !NS.bl.includes(id))).slice(0, 3 - NS.bl.length));
  }
}

export function ready(st, NS) {
  if (st.kind === 'bel') return !!NS.pick;
  if (st.kind === 'bluffs') return (NS.bl || []).length > 0;
  if (st.n) return NS.targets.length === st.n;
  return true;
}

export function ops(st, NS) {
  if (st.kind === 'bel') return [{ type: 'believed', p: st.pid, role: NS.pick }];
  if (st.kind === 'aln') return [{ type: 'align', p: st.pid, evil: NS.pick === 'evil' }];
  if (st.kind === 'rh') return [{ type: 'redherring', p: NS.targets[0] }];
  if (st.kind === 'prep') return [{ type: 'prep', key: st.o.key, value: { targets: [...NS.targets], pick: NS.pick || null } }];
  if (st.kind === 'gain') return [{ type: 'prep', key: 'apprentice:' + st.pid, value: NS.pick ? { targets: [], pick: NS.pick } : null }];
  if (st.kind === 'amigo') return [{ type: 'amigo', g: st.pid, p: NS.targets[0] }];
  if (st.kind === 'bluffs') return [{ type: 'bluffs', bluffs: [...NS.bl] }];
  return [];
}

// Kural dışı seçim uyarısı (engellemez)
export function warn(st, NS) {
  if (st.kind === 'bluffs') return (NS.bl || []).length < 3 ? `${(NS.bl || []).length}/3 blöf seçildi.` : '';
  if (st.kind !== 'prep' || st.noRole) return '';
  const o = st.o, k = PREP[o.id];
  if (o.fake || ['drunk', 'lunatic', 'marionette'].includes(o.p.role)) return '';
  const t = NS.targets.map(P).filter(Boolean);
  if (k.team) {
    if (t.length < 2) return '';
    if (!t.some(q => team(q) === k.team)) return `Seçilenlerden biri ${TEAM_TR[k.team].toLocaleLowerCase('tr')} olmalı.`;
    if (NS.pick && !t.some(q => q.role === NS.pick)) return 'Gösterilen rol seçilen oyunculardan birinin rolü olmalı.';
    return '';
  }
  if (t.length < k.n) return '';
  if (k.kind === 'good' && isEvil(t[0])) return 'İyi bir oyuncu olmalı.';
  if (k.kind === 'noble' && t.filter(isEvil).length !== 1) return 'Tam olarak 1 kötü olmalı.';
  if (k.kind === 'knight' && t.some(q => team(q) === 'demon')) return 'İblis olamaz.';
  return '';
}

// Hedef seçerken gösterilen rol kendiliğinden dolsun (Kütüphaneci vb.)
export function afterTap(st, NS) {
  if (st.kind !== 'prep' || !st.pickTeam) return;
  if (!NS.targets.some(id => P(id)?.role === NS.pick)) { const x = NS.targets.map(P).find(q => q && team(q) === st.pickTeam); NS.pick = x ? x.role : NS.pick; }
}

// Çekmecedeki gövde
export function bodyHTML(st, NS) {
  const S = G.S, p = st.pid ? P(st.pid) : null;
  let h = `<p class="muted">${esc(st.hint)}</p>`;
  if (st.noRole) h += `<p class="info">Oyunda ${TEAM_TR[PREP[st.o.id].team].toLocaleLowerCase('tr')} yok: gece "0" göstereceksin.</p>`;
  if (st.n) {
    const sel = NS.targets.map(id => P(id)?.name).filter(Boolean);
    h += `<div class="pick-h"><b>${st.n === 1 ? 'Oyuncu' : `Oyuncular (${st.n})`}</b><span>${sel.length ? sel.map((n, i) => `${i + 1}. ${esc(n)}`).join(' · ') : 'Masada dokunarak seç'}</span>${sel.length ? '<button class="link" data-c="clearT">Temizle</button>' : ''}</div>`;
  }
  if (st.kind === 'aln') h += `<div class="grid2"><button class="btn ${NS.pick === 'good' ? 'on-sel' : ''}" data-c="preAln" data-v="good">İyi</button><button class="btn ${NS.pick === 'evil' ? 'on-sel' : ''}" data-c="preAln" data-v="evil">Kötü</button></div>`;
  if (st.pickTeam) {
    const lbl = st.kind === 'bel' ? 'Sandığı rol' : st.kind === 'gain' ? 'Kazandığı yetenek' : 'Gösterilen rol';
    h += `<button class="btn small" data-c="prePick">🎭 ${lbl}: <b>${NS.pick ? esc(rname(NS.pick)) : 'seç'}</b></button>`;
  }
  if (st.kind === 'bluffs') {
    const pool = bluffPool(S), bl = NS.bl || [];
    h += `<div class="chips">${pool.map(id => roleChip(id, { on: bl.includes(id), attr: `data-c="preBluff" data-r="${id}"` })).join('')}</div>`;
  }
  if (['rh', 'prep', 'amigo', 'bluffs'].includes(st.kind)) h += `<button class="btn small" data-c="preRand">🎲 Öneri</button>`;
  const w = warn(st, NS); if (w) h += `<p class="warn">${esc(w)}</p>`;
  if (st.kind === 'aln' && NS.pick === 'evil') h += `<p class="info">Kötü gezgin ilk gece İblis'in kim olduğunu öğrenir, Minyonları öğrenmez.</p>`;
  return h;
}

// Seçim listesi kısıtları (rol seçici için)
export function pickOptions(st) {
  const S = G.S, players = seated();
  if (st.kind === 'bel') { const used = new Set(players.flatMap(q => q.id === st.pid ? [q.role] : [q.role, q.believed]).filter(Boolean)); return { only: st.pickTeam, exclude: used }; }
  return { only: st.pickTeam };
}

export function randomize(st, NS) {
  const players = seated();
  if (st.kind === 'rh') { const g = players.filter(p => !isEvil(p)); NS.targets = g.length ? [one(g).id] : []; }
  if (st.kind === 'prep') { const v = suggest(st.o, players); NS.targets = v.targets; NS.pick = v.pick || null; }
  if (st.kind === 'amigo') { const g = players.filter(st.can); NS.targets = g.length ? [one(g).id] : []; }
  if (st.kind === 'bluffs') NS.bl = shuffle(bluffPool(G.S)).slice(0, 3);
}
export function toggleBluff(NS, id) {
  const bl = NS.bl || (NS.bl = []), i = bl.indexOf(id);
  if (i >= 0) bl.splice(i, 1); else if (bl.length < 3) bl.push(id);
}
