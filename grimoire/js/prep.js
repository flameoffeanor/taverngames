// "İlk gece öncesi" hazırlık ekranı (oyun kurulduktan sonra, Gece 1 başlamadan).
// Sarhoş'un sandığı rol, gezgin takımları, kırmızı ringa, ilk gece bilgileri (Almanac: "while preparing the first night"),
// Çırak / Cüce, İblis blöfleri. Her seçim bir olaydır: geri alınabilir.
import { G, hooks, $, esc, role, rname, icon, roleChip, shuffle, P, seated, act, confirmBox, closeSheet } from './core.js?v=20261023-0042';
import { TEAM_TR } from './data.js?v=20261023-0042';

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
const nm = p => p.name;

// Hazırlık gerektiren roller: gerçek rol ya da sandığı rol (Sarhoş Kütüphaneci sanıyorsa ona da bilgi hazırlanır)
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
function warn(o, v, players) {
  const k = PREP[o.id];
  if (o.fake || ['drunk', 'lunatic', 'marionette'].includes(o.p.role)) return '';   // yanlış bilgi serbest
  const t = (v?.targets || []).map(id => players.find(q => q.id === id)).filter(Boolean);
  if (k.team) {
    if (!players.some(q => q.id !== o.p.id && team(q) === k.team)) return '';
    if (t.length < 2) return 'İki oyuncu seç.';
    if (!t.some(q => team(q) === k.team)) return `Seçilenlerden biri ${TEAM_TR[k.team].toLocaleLowerCase('tr')} olmalı.`;
    if (v.pick && !t.some(q => q.role === v.pick)) return 'Gösterilen rol seçilen oyunculardan birinin rolü olmalı.';
    return '';
  }
  if (t.length < k.n) return k.n + ' oyuncu seç.';
  if (t.includes(o.p)) return 'Kendini seçemez.';
  if (k.kind === 'good' && isEvil(t[0])) return 'İyi bir oyuncu olmalı.';
  if (k.kind === 'noble' && t.filter(isEvil).length !== 1) return 'Tam olarak 1 kötü olmalı.';
  if (k.kind === 'knight' && t.some(q => team(q) === 'demon')) return 'İblis olamaz.';
  return '';
}
const hasFT = players => players.some(p => p.role === 'fortuneteller' || p.believed === 'fortuneteller');
function bluffPool(S) {
  const inPlay = new Set(S.players.flatMap(p => [p.role, p.believed]).filter(Boolean));
  return S.scriptRoles.filter(id => ['townsfolk', 'outsider'].includes(role(id).team) && !inPlay.has(id));
}

// Kurulumda öneriler (oyun başlarken): isimler henüz yok, roller belli
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

// ---------------- ekran ----------------
const sel = (attrs, opts, cur, none = '—') => `<select ${attrs}>${none != null ? `<option value="">${none}</option>` : ''}${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
const pOpt = q => [q.id, `${nm(q)} · ${role(q.role).name}`];

export function preHTML() {
  const S = G.S, players = seated();
  const unnamed = players.filter(p => p.unnamed).length;
  let h = `<div class="cc"><h3>İlk gece öncesi</h3>
    <div class="item${unnamed ? ' strong' : ''}"><p>${unnamed ? `İsim girilmeyen: <b>${unnamed}</b>/${players.length}. Masada tokena basılı tut, ismi yaz, ✓ ile saat yönünde sıradakine geç.` : `Tüm isimler girildi (${players.length}).`} Yerleri değiştirmek için masada tokenı sürükle.</p>
    <button class="btn small" data-c="names">✎ ${unnamed ? 'İsimleri gir' : 'İsimleri düzelt'}</button></div>`;
  const warns = [];

  // Sarhoş / Deli / Kukla: sandığı rol
  players.filter(p => BELIEVES[p.role]).forEach(p => {
    const bt = BELIEVES[p.role], used = new Set(players.flatMap(q => q.id === p.id ? [q.role] : [q.role, q.believed]).filter(Boolean));
    const opts = S.scriptRoles.filter(id => role(id).team === bt && !used.has(id)).map(id => [id, role(id).name]);
    if (!p.believed) warns.push(`${nm(p)}: sandığı rol seçilmedi`);
    h += `<div class="prep t-${team(p)}"><div class="prep-h">${icon(p.role)}<b>${esc(rname(p.role))}</b><span>${esc(nm(p))}</span></div>
      <p class="muted small">Kendini hangi ${TEAM_TR[bt].toLocaleLowerCase('tr')} sanıyor? Torbadan bu rolün tokenını çeker.</p>
      <div class="prep-sel">${sel(`data-pre="believed" data-p="${p.id}"`, opts, p.believed)}</div></div>`;
  });
  // Gezginler: takım
  players.filter(p => team(p) === 'traveller').forEach(p => {
    h += `<div class="prep t-traveller"><div class="prep-h">${icon(p.role)}<b>${esc(rname(p.role))}</b><span>${esc(nm(p))}</span></div>
      <div class="prep-sel">${sel(`data-pre="align" data-p="${p.id}"`, [['0', 'İyi'], ['1', 'Kötü']], p.evil ? '1' : '0', null)}</div></div>`;
  });
  // Falcı: kırmızı ringa
  if (hasFT(players)) {
    const rh = players.find(p => p.reminders.some(r => r.tag === 'redherring'));
    if (!rh) warns.push('Kırmızı ringa seçilmedi');
    h += `<div class="prep t-townsfolk"><div class="prep-h">${icon('fortuneteller')}<b>${esc(rname('fortuneteller'))}</b><span>Kırmızı ringa</span><button class="btn small" data-c="preRand" data-k="rh">🎲</button></div>
      <p class="muted small">Herhangi bir iyi oyuncu (Falcı'nın kendisi de olabilir). Ona bakınca "Evet" görür.</p>
      <div class="prep-sel">${sel('data-pre="rh"', players.filter(p => !isEvil(p)).map(pOpt), rh?.id)}</div></div>`;
  }
  // İlk gece bilgileri
  owners(players).forEach(o => {
    const k = PREP[o.id], v = S.prep[o.key] || { targets: [], pick: null }, r = role(o.id), others = players.filter(q => q.id !== o.p.id);
    const noRole = k.team && !others.some(q => team(q) === k.team);
    const w = warn(o, v, players); if (w) warns.push(`${r.name}: ${w}`);
    const selT = noRole ? `<p class="info">Oyunda ${TEAM_TR[k.team].toLocaleLowerCase('tr')} yok: gece "0" göstereceksin.</p>`
      : Array.from({ length: k.n }, (_, i) => sel(`data-pre="t" data-k="${o.key}" data-i="${i}"`, others.map(pOpt), v.targets?.[i])).join('');
    const pick = k.pick && !noRole ? sel(`data-pre="pick" data-k="${o.key}"`, [...new Set([...(v.targets || []).map(id => P(id)?.role).filter(Boolean), ...S.scriptRoles.filter(id => role(id).team === k.team)])].map(id => [id, role(id).name]), v.pick, 'Gösterilen rol…') : '';
    h += `<div class="prep t-${r.team}"><div class="prep-h">${icon(o.id)}<b>${esc(r.name)}</b><span>${esc(nm(o.p))}${o.fake ? ` <em>(aslında ${esc(rname(o.p.role))}: yanlış bilgi serbest)</em>` : ''}</span><button class="btn small" data-c="preRand" data-k="${o.key}">🎲</button></div>
      <p class="muted small">${esc(k.hint)}</p><div class="prep-sel">${selT}${pick}</div>${w ? `<p class="warn">${esc(w)}</p>` : ''}</div>`;
  });
  // Çırak: kazandığı yetenek
  players.filter(p => p.role === 'apprentice').forEach(p => {
    const tm = p.evil ? 'minion' : 'townsfolk', inPlay = new Set(players.map(q => q.role)), key = 'apprentice:' + p.id;
    h += `<div class="prep t-traveller"><div class="prep-h">${icon('apprentice')}<b>${esc(rname('apprentice'))}</b><span>${esc(nm(p))} · ${p.evil ? 'kötü' : 'iyi'}</span></div>
      <p class="muted small">${p.evil ? 'Bir Minyon' : 'Bir Kasabalı'} yeteneği kazanır. Tercihen oyunda olmayan bir rol.</p>
      <div class="prep-sel">${sel(`data-pre="gain" data-k="${key}"`, S.scriptRoles.filter(id => role(id).team === tm).map(id => [id, role(id).name + (inPlay.has(id) ? ' (oyunda)' : '')]), S.prep[key]?.pick, 'Gece seçerim')}</div></div>`;
  });
  // Cüce: amigo
  players.filter(p => p.role === 'gnome').forEach(p => {
    const cur = players.find(q => q.reminders.some(r => r.tag === 'amigo' && r.src === p.id));
    h += `<div class="prep t-traveller"><div class="prep-h">${icon('gnome')}<b>${esc(rname('gnome'))}</b><span>${esc(nm(p))}</span></div>
      <p class="muted small">Herkes Cüce ile aynı takımdan bir oyuncuyu (amigo) öğrenir. Herkese açıkla.</p>
      <div class="prep-sel">${sel(`data-pre="amigo" data-p="${p.id}"`, players.filter(q => q.id !== p.id && isEvil(q) === isEvil(p)).map(pOpt), cur?.id)}</div></div>`;
  });
  const evT = players.filter(p => team(p) === 'traveller' && p.evil);
  if (evT.length) h += `<p class="info">Kötü gezgin (${evT.map(p => esc(nm(p))).join(', ')}): ilk gece İblis'in kim olduğunu öğrenir, Minyonları öğrenmez.</p>`;
  // İblis blöfleri
  if (players.some(p => team(p) === 'demon')) {
    const pool = bluffPool(S), bl = S.bluffs.filter(id => pool.includes(id));
    if (bl.length < 3) warns.push(`İblis blöfleri ${bl.length}/3`);
    h += `<div class="prep t-demon"><div class="prep-h"><span class="sp">🎭</span><b>İblis blöfleri</b><span>${bl.length}/3</span><button class="btn small" data-c="preRand" data-k="bluffs">🎲</button></div>
      <p class="muted small">Oyunda olmayan 3 iyi rol (Sarhoş'un sandığı rol hariç). İlk gece İblis'e gösterilir.</p>
      <div class="chips">${pool.map(id => roleChip(id, { on: bl.includes(id), attr: `data-c="bluff" data-r="${id}"` })).join('')}</div></div>`;
  }
  if (warns.length) h += `<div class="warn small">${warns.map(esc).join('<br>')}</div>`;
  h += `<button class="btn primary big" data-c="ready">☾ İlk geceyi başlat</button></div>`;
  return h;
}

// Bir oyuncunun yeni sandığı rolü hazırlık gerektiriyorsa öneriyi doldur
function fillMissing() {
  const players = seated();
  const good = players.filter(p => !isEvil(p) && team(p) !== 'traveller');
  if (hasFT(players) && good.length && !players.some(p => p.reminders.some(r => r.tag === 'redherring'))) act('redherring', { p: one(good).id });
  owners(players).forEach(o => { if (!G.S.prep[o.key]) act('prep', { key: o.key, value: suggest(o, players) }); });
}

export function preClick(b) {
  const S = G.S, a = b.dataset.c, players = seated();
  if (a === 'names') { const p = players.find(q => q.unnamed) || players[0]; return hooks.openPlayer(p.id, { name: true }), true; }
  if (a === 'bluff') {
    const pool = bluffPool(S), bl = S.bluffs.filter(id => pool.includes(id)), id = b.dataset.r, i = bl.indexOf(id);
    if (i >= 0) bl.splice(i, 1); else if (bl.length < 3) bl.push(id); else return true;
    act('bluffs', { bluffs: bl }); return true;
  }
  if (a === 'preRand') {
    const k = b.dataset.k;
    if (k === 'bluffs') act('bluffs', { bluffs: shuffle(bluffPool(S)).slice(0, 3) });
    else if (k === 'rh') { const g = players.filter(p => !isEvil(p)); if (g.length) act('redherring', { p: one(g).id }); }
    else { const o = owners(players).find(x => x.key === k); if (o) act('prep', { key: k, value: suggest(o, players) }); }
    return true;
  }
  if (a === 'ready') {
    const go = () => { closeSheet(); act('ready', {}, 'Gece 1 başladı'); };
    const un = players.filter(p => p.unnamed).length;
    if (un) return confirmBox('İsimler eksik', `<b>${un}</b> oyuncunun ismi girilmedi. Yine de gece başlasın mı?`, 'Başlat', go), true;
    go(); return true;
  }
  return false;
}

$('panel').addEventListener('change', e => {
  const s = e.target, k = s.dataset.pre; if (!k || !G.S?.pre) return;
  const S = G.S, v = s.value || null;
  if (k === 'believed') { act('believed', { p: s.dataset.p, role: v }); fillMissing(); }
  if (k === 'align') act('align', { p: s.dataset.p, evil: v === '1' });
  if (k === 'rh') act('redherring', { p: v });
  if (k === 'amigo') act('amigo', { g: s.dataset.p, p: v });
  if (k === 'gain') act('prep', { key: s.dataset.k, value: v ? { targets: [], pick: v } : null });
  if (k === 't' || k === 'pick') {
    const key = s.dataset.k, cur = S.prep[key] || { targets: [], pick: null };
    const val = { targets: [...(cur.targets || [])], pick: cur.pick || null };
    if (k === 't') {
      val.targets[+s.dataset.i] = v; val.targets = Array.from({ length: Math.max(val.targets.length, +s.dataset.i + 1) }, (_, i) => val.targets[i] || null);
      const o = owners(seated()).find(x => x.key === key), kk = PREP[o.id];
      if (kk.pick && !val.targets.some(id => id && P(id)?.role === val.pick)) { const x = val.targets.find(id => id && team(P(id)) === kk.team); val.pick = x ? P(x).role : null; }
    } else val.pick = v;
    act('prep', { key, value: val });
  }
});
