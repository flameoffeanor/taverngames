// Panel ekranı: gece adımı ve gündüz akışı. Masa ekranındaki dokunmalar da buradan yönetilir.
import { G, hooks, $, esc, rich, role, P, seated, icon, rname, sheet, closeSheet, confirmBox, toast, act, resetNS, unhtml } from './core.js?v=20261023-0135';
import * as store from './store.js?v=20261023-0135';
import * as rules from './rules.js?v=20261023-0135';
import { describe } from './describe.js?v=20261023-0135';
import * as prep from './prep.js?v=20261023-0135';

const RN = id => role(id).name;
const ctx = () => rules.ctx(G.S, role);
const dayKey = () => store.phaseKey(G.S.phase);

// ======================= GECE =======================
export function curStep() {
  const S = G.S, NS = G.NS;
  if (S.phase.kind !== 'night' || S.pre) return null;
  const steps = rules.nightSteps(S, G.D, role);
  const done = S.done[store.phaseKey(S.phase)] || {};
  if (!NS.cur || !steps.some(s => s.key === NS.cur)) { NS.cur = (steps.find(s => !done[s.key]) || {}).key || null; NS.pre = null; }
  const step = steps.find(s => s.key === NS.cur) || null;
  // İlk gece: kurulumda hazırlanan hedefler / gösterilecek rol kendiliğinden dolar
  if (step && !done[step.key] && !step.special && NS.pre !== step.key) {
    NS.pre = step.key;
    const pp = S.prep?.[step.key];
    if (pp && !NS.targets.length && step.firstLike) { NS.targets = (pp.targets || []).filter(id => P(id) && !P(id).gone); NS.pick = pp.pick || null; }
  }
  return { steps, done, step };
}
// İlk gece öncesi adımı
export function preCur() {
  const S = G.S, NS = G.NS;
  const steps = prep.steps(), done = S.pdone || {};
  if (NS.cur === '__end' && steps.some(s => !done[s.key])) NS.cur = null;
  if (!NS.cur || (NS.cur !== '__end' && !steps.some(s => s.key === NS.cur))) { NS.cur = (steps.find(s => !done[s.key]) || {}).key || '__end'; NS.pre = null; }
  const step = steps.find(s => s.key === NS.cur) || null;
  if (step && NS.pre !== step.key) { NS.pre = step.key; prep.prefill(step, NS); }
  return { steps, done, step };
}
export function targeting() {
  if (G.edit || G.DS.mode) return null;
  if (G.S.pre) { const st = preCur().step; return st?.n ? { step: st, cfg: { targets: [st.n, st.n] }, can: st.can || (() => true), pre: true } : null; }
  const c = curStep(); if (!c?.step || c.done[c.step.key] || c.step.special) return null;
  const cfg = rules.cfgFor(c.step, G.S, role);
  return cfg.targets[1] > 0 ? { step: c.step, cfg } : null;
}
export const actorId = () => (G.S.pre ? preCur().step?.pid : G.S.phase.kind === 'night' ? curStep()?.step?.pid : null) || null;
export const canTap = (tg, p) => tg.can ? tg.can(p) : rules.canTarget(tg.cfg, G.S, role, tg.step, p);

// Masa ve mini masadaki dokunma: hedef / seçim / oyuncu paneli
export function tapSeat(pid, fromMini = false) {
  const m = G.DS.mode;
  if (m?.pick) {
    const p = P(pid); if (m.can && !m.can(p)) return;
    const i = m.sel.indexOf(pid);
    if (i >= 0) m.sel.splice(i, 1);
    else if (m.max === 1) m.sel = [pid];
    else if (m.sel.length < m.max) m.sel.push(pid);
    if (m.auto && m.sel.length >= m.max) return finishPick();
    return hooks.renderAll();
  }
  const tg = targeting();
  if (!tg) return fromMini ? null : hooks.openPlayer(pid);
  const p = P(pid);
  if (!canTap(tg, p)) { toast(`${p.name} seçilemez`); return; }
  const NS = G.NS, i = NS.targets.indexOf(pid);
  if (i >= 0) NS.targets.splice(i, 1);
  else { if (NS.targets.length >= tg.cfg.targets[1]) NS.targets.shift(); NS.targets.push(pid); }
  if (tg.pre) prep.afterTap(tg.step, NS);
  hooks.renderAll();
}
export const selIndex = pid => (G.DS.mode?.pick ? G.DS.mode.sel.indexOf(pid) : G.NS.targets.indexOf(pid));

// Gece metnindeki *İŞARETLER* dokunulabilir
const MARK = {
  'YOU ARE': 'Sen', 'THIS CHARACTER SELECTED YOU': 'Bu karakter seni seçti', 'THESE ARE YOUR MINIONS': 'Bunlar senin Minyonların',
  'THIS IS THE DEMON': 'Bu İblis', 'THESE CHARACTERS ARE NOT IN PLAY': 'Bu karakterler oyunda değil', 'THIS PLAYER IS': 'Bu oyuncu',
};
export const MARKS = MARK;
function fmtText(t) {
  return rich(t).replace(/\*([^*]+)\*/g, (m, w) => {
    const k = MARK[w.toUpperCase()];
    return `<button class="mk" data-mk="${esc(w.toUpperCase())}">${esc(k || w)}</button>`;
  }).replace(/:reminder:/g, '<i class="rmk">🔖</i>');
}

function navHTML(steps, idx) {
  return `<div class="cc-nav"><button class="nb" data-c="prev" ${idx <= 0 ? 'disabled' : ''}>‹</button>
    <button class="prog" data-c="list">${Math.min(idx + 1, steps.length)} / ${steps.length} · sıra</button>
    <button class="nb" data-c="next" ${idx >= steps.length - 1 ? 'disabled' : ''}>›</button></div>`;
}

function nightHTML(c) {
  const { steps, done, step } = c;
  const idx = step ? steps.indexOf(step) : steps.length;
  if (!step) {
    const died = G.S.deaths.filter(d => store.phaseKey(d.phase) === dayKey());
    return `<div class="cc">${steps.length ? navHTML(steps, idx) : ''}${winBanner()}<h3>Şafak</h3>
      ${died.length ? `<p>Bu gece ölenler (sebebini söyleme):</p><div class="dlist">${died.map(d => `<span>☠ ${esc(P(d.p).name)}</span>`).join('')}</div>` : '<p class="muted center">Bu gece kimse ölmedi.</p>'}
      <button class="btn primary big" data-c="toDay">☀ Güne geç (${store.phaseLabel({ kind: 'day', n: G.S.phase.n })})</button></div>`;
  }
  const x = stepHTML(step, done);
  return `<div class="cc fixed"><div class="cc-top">${navHTML(steps, idx)}${x.top}</div><div class="cc-body">${winBanner()}${x.body}</div><div class="cc-foot">${x.foot}</div></div>`;
}

function stepHTML(step, done) {
  const S = G.S, NS = G.NS;
  const isDone = !!done[step.key];
  const { notes, info, show } = rules.stepInfo(step, S, role, NS);
  const lines = notes.map(x => `<p class="note">${esc(x)}</p>`).join('') + info.map(x => `<p class="info">${esc(x)}</p>`).join('');
  if (step.special) {
    const mk = step.special === 'minioninfo' ? ['THIS IS THE DEMON'] : step.special === 'demoninfo' ? ['THESE ARE YOUR MINIONS', 'THESE CHARACTERS ARE NOT IN PLAY'] : ['THIS IS THE DEMON'];
    return {
      top: `<div class="who"><span class="sp">${step.special === 'minioninfo' ? 'M' : step.special === 'demoninfo' ? 'İ' : 'G'}</span><div><h3>${esc(step.title)}</h3></div></div>`,
      body: lines + `<div class="mks">${mk.map(k => `<button class="mk big" data-mk="${k}">${esc(MARK[k])}</button>`).join('')}</div>`,
      foot: isDone ? '<p class="ok">✓ Tamamlandı</p><button class="btn small" data-c="redo">Geri al</button>' : '<button class="btn primary big" data-c="ok">✓ Tamam</button>',
    };
  }
  const r = role(step.role), p = P(step.pid), cfg = rules.cfgFor(step, S, role);
  const broken = ctx().broken(p);
  if (NS.apply === null) NS.apply = !broken.length;
  const real = p.role !== step.role ? (step.gained ? ` <em>· ${esc(RN('apprentice'))}</em>` : ` <em>· gerçekte ${esc(RN(p.role))}</em>`) : '';
  const top = `<div class="who t-${r.team}">${icon(step.role)}<div><h3>${esc(r.name)}</h3><div class="pl">${esc(p.name)}${real}${p.dead ? ' <em>· ölü</em>' : ''}</div></div></div>`;
  const textHTML = step.text ? `<details class="ntext"${isDone ? '' : ' open'}><summary>Kural kitabı notu</summary><div>${fmtText(step.text)}</div></details>` : '';
  if (isDone) {
    const ev = S.log.find(x => x.id === done[step.key])?.ev;
    return { top, body: lines + `<p class="ok">✓ ${ev ? describe(ev, S) : 'Tamamlandı'}</p>` + textHTML, foot: '<button class="btn" data-c="redo">↶ Bu adımı geri al</button>' };
  }
  let h = lines;
  // hedef seçimi: küçük masa
  if (cfg.targets[1] > 0) {
    const need = cfg.targets[0], max = cfg.targets[1];
    const sel = NS.targets.map(id => P(id)?.name).filter(Boolean);
    h += `<div class="pick-h"><b>${max === 1 ? 'Hedef' : `Hedefler (${need === max ? max : `${need}–${max}`})`}</b><span>${sel.length ? sel.map((n, i) => `${i + 1}. ${esc(n)}`).join(' · ') : 'Dokunarak seç'}</span>${sel.length ? '<button class="link" data-c="clearT">Temizle</button>' : ''}</div>`;
  }
  // göster / seç
  const ex = [];
  if (cfg.pickTeam) ex.push(`<button class="btn small" data-c="pick">🎭 Gösterilen rol: <b>${NS.pick ? esc(RN(NS.pick)) : 'seç'}</b></button>`);
  if (step.role === 'apprentice') ex.push(`<button class="btn small" data-c="pickGain">✨ Kazandığı yetenek: <b>${NS.pick ? esc(RN(NS.pick)) : 'seç'}</b></button>`);
  if (show?.role) ex.push(`<button class="btn small show-btn" data-c="showRole" data-r="${show.role}" data-t="${esc(show.title || '')}">👁 Göster: ${show.title ? esc(show.title) + ' + ' : ''}${esc(RN(show.role))}</button>`);
  ex.push(`<button class="btn small" data-c="showAny">👁 Başka token göster</button>`);
  if (NS.targets.length) ex.push(`<button class="btn small" data-c="rem">🔖 Hatırlatıcı ekle</button>`);
  if (cfg.effect === 'sailor') ex.push(`<label class="tgl"><input type="checkbox" data-c="sailor" ${NS.sailorSelf ? 'checked' : ''}> Denizci kendisi sarhoş olsun</label>`);
  if ((cfg.effect || cfg.kill) && broken.length) ex.push(`<label class="tgl"><input type="checkbox" data-c="apply" ${NS.apply ? 'checked' : ''}> Yine de uygula (yeteneği bozuk)</label>`);
  h += `<div class="extras">${ex.join('')}</div>` + textHTML;
  const ready = NS.targets.length >= cfg.targets[0] && (!cfg.three || NS.targets.length === 3);
  return { top, body: h, foot: `<div class="acts"><button class="btn" data-c="skip">Atla</button><button class="btn primary" data-c="ok" ${ready ? '' : 'disabled'}>✓ Onayla</button></div>` };
}

function confirmStep(skip) {
  const S = G.S, NS = G.NS;
  const { step } = curStep(); if (!step) return;
  const base = { step: step.key, role: step.role || null, actor: step.pid || null, special: step.special || null };
  if (skip || step.special) {
    resetNS();
    const ev = store.dispatch('act', { ...base, skipped: !!skip, targets: [] });
    toast(skip ? 'Adım atlandı' : 'Tamam', ev.id); return;
  }
  const cfg = rules.cfgFor(step, S, role), p = P(step.pid);
  const broken = ctx().broken(p);
  const targets = [...NS.targets];
  const data = { ...base, targets, pick: NS.pick, broken: broken.map(b => b.kind), applied: NS.apply !== false };
  const effects = rules.buildEffects(step, S, role, NS, store.newId);
  const finish = (extra = [], shows = []) => {
    const before = G.S;
    const all = [...effects, ...extra];
    resetNS();
    const ev = store.dispatch('act', { ...data, effects: all });
    toast(plainDesc(ev, G.S), ev.id);
    const deaths = all.filter(x => x.type === 'die');
    afterEffects(deaths, before, shows);
  };
  if (cfg.kill && NS.apply !== false && targets.length) return resolveKills(p, targets, [], [], finish);
  finish();
}
const plainDesc = (ev, st) => unhtml(describe(ev, st));

// İblis saldırısı: her hedef için seçenekler (öl / atlama / devir / ölmedi)
function resolveKills(demon, targets, acc, shows, done) {
  if (!targets.length) { closeSheet(); return done(acc, shows); }
  const [tid, ...rest] = targets, t = P(tid);
  // aynı gece önceki hedefler ölmüş gibi değerlendirilsin
  const { checks, options } = rules.killOptions(G.S, role, demon, tid);
  sheet(`<h3>${esc(RN(demon.role))} → ${esc(t.name)}</h3>
    ${checks.map(x => `<p class="note">${esc(x)}</p>`).join('') || '<p class="muted">Engel görünmüyor.</p>'}
    <div class="list">${options.map((o, i) => `<button class="row-btn${o.rec ? ' hot' : ''}" data-k="${i}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`);
  $('sheetBody').onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const o = options[+b.dataset.k];
    resolveKills(demon, rest, [...acc, ...o.effects], o.show ? [...shows, o.show] : shows, done);
  };
}

// Ölümlerden sonra: hatırlatmalar, gösterilecekler, kazanma kontrolü
export function afterEffects(deaths, before, shows = []) {
  const items = [];
  shows.forEach(sh => {
    const q = P(sh.pid);
    items.push({ text: `${q?.name || '?'} uyanır: "Sen" + ${RN(sh.role)}${sh.evil ? ', sonra "Sen" + 👎 (artık kötü)' : ''} göster.`, show: sh, strong: true });
  });
  deaths.forEach(d => rules.deathTriggers(G.S, role, d.p, d.cause, before).forEach(x => items.push(x)));
  const win = rules.winCheck(G.S, role);
  if (win) items.push({ text: `Oyun bitebilir: ${win.winner === 'good' ? 'İyiler' : 'Kötüler'} kazanır (${win.reason}). ${win.note || ''}`, strong: true, end: win });
  if (!items.length) return false;
  sheet(`<h3>Unutma</h3>${items.map((x, i) => `<div class="trig${x.strong ? ' strong' : ''}"><p>${esc(x.text)}</p>
    ${x.action ? `<button class="btn small" data-ta="${i}">${esc(x.action.label)}</button>` : ''}
    ${x.show ? `<button class="btn small" data-ts="${i}">👁 Göster</button>` : ''}
    ${x.end ? `<button class="btn small danger" data-te="${i}">Oyunu bitir</button>` : ''}</div>`).join('')}
    <button class="btn wide" data-act="close">Tamam</button>`);
  $('sheetBody').onclick = e => {
    const a = e.target.closest('[data-ta]'), s = e.target.closest('[data-ts]'), en = e.target.closest('[data-te]');
    if (a) {
      const x = items[+a.dataset.ta], bf = G.S;
      act('act', { step: 'trigger:' + store.newId(), special: 'trigger', text: x.text.slice(0, 80), effects: x.action.effects }, x.action.label);
      a.disabled = true; a.textContent = '✓ ' + a.textContent;
      const nd = x.action.effects.filter(e => e.type === 'die');
      if (nd.length) setTimeout(() => afterEffects(nd, bf), 50);
    }
    if (s) { const sh = items[+s.dataset.ts].show; hooks.showToken(sh.role, { title: 'Sen', evil: sh.evil }); }
    if (en) endGame(items[+en.dataset.te].end);
  };
  return true;
}

export function endGame(win) {
  confirmBox('Oyun bitsin mi?', `<b>${win.winner === 'good' ? 'İyiler' : 'Kötüler'}</b> kazandı. ${esc(win.reason || '')}`, 'Oyunu bitir', () => {
    act('end', { winner: win.winner, reason: win.reason || '' }, 'Oyun bitti'); closeSheet();
  }, true);
}

function winBanner() {
  const S = G.S;
  if (S.result) return `<div class="banner ${S.result.winner}">🏁 Oyun bitti: <b>${S.result.winner === 'good' ? 'İyiler' : 'Kötüler'}</b> kazandı${S.result.reason ? ` · ${esc(S.result.reason)}` : ''}</div>`;
  const w = rules.winCheck(S, role);
  return w ? `<div class="banner warn">⚠ ${w.winner === 'good' ? 'İyiler' : 'Kötüler'} kazanabilir: ${esc(w.reason)} <button class="btn small" data-c="endWin" data-w="${w.winner}" data-r="${esc(w.reason)}">Oyunu bitir</button></div>` : '';
}

// ======================= GÜNDÜZ =======================
// Bugünkü oylamalar (olay kaydından)
export function votesToday() {
  const S = G.S, dk = dayKey();
  return (S.log || []).filter(x => store.phaseKey(x.phase) === dk && x.ev.type === 'act' && x.ev.special === 'vote').map(x => x.ev);
}
// Ölmek üzere olan (en çok oy, yarıdan fazla, beraberlik yok)
export function aboutToDie() {
  let max = 0, leader = null;
  votesToday().forEach(v => {
    if (v.count > max) { max = v.count; leader = v.count >= v.need ? v.nominee : null; }
    else if (v.count === max && v.count >= v.need) leader = null;
  });
  return { leader, max };
}
const aliveAll = () => seated().filter(p => !p.dead);
const needVotes = () => Math.ceil(aliveAll().length / 2);
// Bir oyuncunun oyu kaç sayılır (Hırsız: −1, Bürokrat: ×3)
function voteWeight(p) {
  const c = ctx();
  let w = 1;
  if (c.has(p, 'vote3')) w *= 3;
  if (c.has(p, 'negvote')) w *= -1;
  return w;
}

function dayHTML() {
  const S = G.S, m = G.DS.mode;
  if (m?.pick) return pickHTML(m);
  const c = ctx(), dk = dayKey();
  const alive = aliveAll().length, votes = seated().filter(p => !p.dead || p.ghost).length;
  const execd = S.executions?.[dk] || (S.executed?.[dk] ? { p: S.executed[dk], died: true } : null);
  const vt = votesToday(), atd = aboutToDie();
  const nightDeaths = S.deaths.filter(d => store.phaseKey(d.phase) === store.phaseKey({ kind: 'night', n: S.phase.n }));
  let h = `<div class="cc">${winBanner()}<h3>☀ ${store.phaseLabel(S.phase)}</h3>`;
  if (nightDeaths.length) h += `<div class="dawn"><small>Gece ölenleri açıkla (sebebini söyleme):</small><div class="dlist">${nightDeaths.map(d => `<span>☠ ${esc(P(d.p).name)}</span>`).join('')}</div></div>`;
  else if (S.phase.n > 1 || S.done.N1) h += `<p class="muted center small">Gece kimse ölmedi.</p>`;
  h += `<div class="stats"><div><b>${alive}</b><small>yaşıyor</small></div><div><b>${votes}</b><small>oy hakkı</small></div><div><b>${needVotes()}</b><small>idam için oy</small></div></div>`;
  // bekleyen işler ve uyarılar
  const items = rules.dayItems(S, role);
  items.filter(i => i.text).forEach(i => {
    h += `<div class="item${i.strong ? ' strong' : ''}"><p>${esc(i.text)}</p>${i.btn && ['moonchild', 'klutz'].includes(i.k) ? `<button class="btn small" data-c="day" data-k="${i.k}" data-pid="${i.pid}">${esc(i.btn)}</button>` : ''}
      ${i.k === 'harpy' ? `<div class="row-in"><button class="btn small" data-c="harpyKill" data-pid="${i.pid}">☠ ${esc(P(i.pid).name)}</button>${i.other ? `<button class="btn small" data-c="harpyKill" data-pid="${i.other}">☠ ${esc(P(i.other).name)}</button>` : ''}</div>` : ''}</div>`;
  });
  // aday gösterme / oylama
  h += `<h4>Aday gösterme</h4>`;
  if (vt.length) h += `<ol class="votes">${vt.map(v => `<li class="${atd.leader === v.nominee && v === vt.filter(x => x.nominee === v.nominee).pop() ? 'lead' : ''}"><span>${esc(P(v.nominator)?.name || '?')} → <b>${esc(P(v.nominee)?.name || '?')}</b></span><b>${v.count}</b></li>`).join('')}</ol>`;
  if (execd) {
    h += `<p class="ok">⚖ İdam edildi: <b>${esc(P(execd.p).name)}</b>${execd.died ? '' : ' (ölmedi)'}</p>`;
  } else {
    if (atd.leader) h += `<p class="info">Ölmek üzere: <b>${esc(P(atd.leader).name)}</b> (${atd.max} oy). Gün sonunda idam edilir.</p>`;
    else if (vt.length) h += `<p class="muted small">Şu an ölmek üzere olan yok${atd.max ? ` (en yüksek ${atd.max}; geçmek için ${Math.max(atd.max + 1, needVotes())} oy gerekir)` : ''}.</p>`;
    h += `<div class="grid2"><button class="btn big" data-c="nominate">⚖ Aday göster</button>${atd.leader ? `<button class="btn big danger" data-c="execLeader">☠ ${esc(P(atd.leader).name)} idam</button>` : `<button class="btn big" data-c="execAny">Elle idam</button>`}</div>`;
  }
  // gündüz yetenekleri
  const ab = items.filter(i => i.btn && !['moonchild', 'klutz'].includes(i.k));
  const trav = seated().filter(p => !p.dead && c.team(p) === 'traveller');
  if (ab.length || trav.length) {
    h += `<h4>Gündüz yetenekleri</h4><div class="abil">${ab.map(i => `<button class="btn" data-c="day" data-k="${i.k}" ${i.used ? 'disabled' : ''}>${esc(i.btn)}${i.used ? ' ✓' : ''}</button>`).join('')}
      ${trav.length ? `<button class="btn" data-c="exile">🚶 Sürgün</button>` : ''}</div>`;
  }
  h += `<button class="btn primary big" data-c="toNight">☾ Geceye geç (${store.phaseLabel({ kind: 'night', n: S.phase.n + 1 })})</button></div>`;
  return h;
}

// ======================= İLK GECE ÖNCESİ =======================
function preHTML() {
  const { steps, done, step } = preCur(), NS = G.NS;
  const idx = step ? steps.indexOf(step) : steps.length;
  const nav = steps.length ? `<div class="cc-nav"><button class="nb" data-c="prev" ${idx <= 0 ? 'disabled' : ''}>‹</button>
    <button class="prog" data-c="list">${Math.min(idx + 1, steps.length)} / ${steps.length} · hazırlık</button>
    <button class="nb" data-c="next" ${idx >= steps.length ? 'disabled' : ''}>›</button></div>` : '';
  if (!step) return `<div class="cc">${nav}<h3>Hazırlık tamam</h3><p class="muted center">Her adımı sonra da ‹ › ile açıp değiştirebilirsin. Oyuncu ekleyip çıkarmak için Menü.</p>
    <button class="btn primary big" data-c="ready">☾ İlk geceyi başlat</button></div>`;
  const p = step.pid ? P(step.pid) : null, r = step.role ? role(step.role) : null;
  const who = `<div class="who${r ? ' t-' + r.team : ''}">${step.role ? icon(step.role) : '<span class="sp">🎭</span>'}<div><h3>${esc(step.title)}</h3><div class="pl">${esc(step.sub)}${p ? ' · ' + esc(p.name) : ''}${done[step.key] ? ' <em>· ✓</em>' : ''}</div></div></div>`;
  return `<div class="cc fixed"><div class="cc-top">${nav}${who}</div><div class="cc-body">${prep.bodyHTML(step, NS)}</div>
    <div class="cc-foot"><div class="acts"><button class="btn" data-c="skip">Atla</button><button class="btn primary" data-c="ok" ${prep.ready(step, NS) ? '' : 'disabled'}>✓ ${done[step.key] ? 'Güncelle' : 'Onayla'}</button></div></div></div>`;
}
function preClick(a, b) {
  const S = G.S, NS = G.NS, { steps, done, step } = preCur();
  const go = k => { resetNS({ cur: k }); hooks.renderAll(); };
  switch (a) {
    case 'prev': case 'next': { const i = (step ? steps.indexOf(step) : steps.length) + (a === 'prev' ? -1 : 1); if (i < 0) return true; return go(steps[i]?.key || '__end'), true; }
    case 'list': return openSteps(), true;
    case 'skip': if (step) { resetNS(); act('pre', { key: step.key, ops: [] }); } return true;
    case 'ok': if (step && prep.ready(step, NS)) { const o = prep.ops(step, NS); resetNS(); act('pre', { key: step.key, ops: o }, `${step.title}: ${step.sub} ✓`); } return true;
    case 'clearT': NS.targets = []; hooks.renderAll(); return true;
    case 'preAln': NS.pick = b.dataset.v; hooks.renderAll(); return true;
    case 'preBluff': prep.toggleBluff(NS, b.dataset.r); hooks.renderAll(); return true;
    case 'preRand': prep.randomize(step, NS); hooks.renderAll(); return true;
    case 'prePick': { const o = prep.pickOptions(step); return hooks.pickRole(step.title + ': rol seç', id => { NS.pick = id; closeSheet(); hooks.renderAll(); }, closeSheet, o), true; }
    case 'ready': act('ready', {}, 'Gece 1 başladı'); return true;
  }
  return false;
}

// ---------- genel seçim ekranı (gündüz) ----------
// opt: {k, title, hint, min, max, can(p), ok(sel), okLabel, info(sel)→html, auto}
export function startPick(opt) {
  G.DS.mode = { pick: true, sel: [], min: 1, max: 1, okLabel: 'Tamam', ...opt };
  hooks.renderAll();
}
function pickHTML(m) {
  const info = m.info ? m.info(m.sel) : '';
  const ready = m.sel.length >= (m.min ?? 1);
  return `<div class="cc fixed"><div class="cc-top"><h3>${esc(m.title)}</h3>${m.hint ? `<p class="muted center small">${esc(m.hint)}</p>` : ''}</div>
    <div class="cc-body">${info}<p class="muted small">${m.sel.length ? 'Seçili: ' + m.sel.map(id => esc(P(id)?.name || '')).join(', ') : 'Masada dokunarak seç.'}</p></div>
    <div class="cc-foot"><div class="acts"><button class="btn" data-c="pickCancel">Vazgeç</button><button class="btn primary" data-c="pickOk" ${ready ? '' : 'disabled'}>${esc(m.okLabel)}</button></div></div></div>`;
}
function finishPick() {
  const m = G.DS.mode; if (!m) return;
  const sel = [...m.sel];
  G.DS.mode = null;
  m.ok(sel);
  hooks.renderAll();
}

// ---------- aday gösterme + oylama ----------
function nominate() {
  const vt = votesToday();
  const nominated = new Set(vt.map(v => v.nominator)), nominees = new Set(vt.map(v => v.nominee));
  startPick({ k: 'nom1', title: 'Kim aday gösteriyor?', hint: 'Sadece yaşayanlar, günde bir kez.', can: p => !p.dead && !nominated.has(p.id), auto: true,
    ok: ([a]) => startPick({ k: 'nom2', title: `${P(a).name} kimi aday gösteriyor?`, hint: 'Herkes günde bir kez aday olabilir (ölüler de).', can: p => !nominees.has(p.id), auto: true,
      ok: ([b]) => startVote(a, b) }) });
}
function startVote(nominator, nominee) {
  const S = G.S, c = ctx();
  const nom = P(nominee), by = P(nominator);
  const pre = [];
  // Cüce: amigosu aday gösterilirse aday göstereni öldürebilir (wiki)
  const gnome = seated().find(p => p.role === 'gnome' && !p.dead);
  if (gnome && nom.reminders.some(r => rules.tagOf(r) === 'amigo')) pre.push(`<div class="item strong"><p>🍄 ${esc(nom.name)}, ${esc(RN('gnome'))} (${esc(gnome.name)}) için amigo. ${esc(RN('gnome'))} isterse oylamadan önce aday göstereni (${esc(by.name)}) öldürebilir; kendisi söylemeli.</p><button class="btn small" data-c="gnomeKill" data-pid="${nominator}" data-g="${gnome.id}">☠ ${esc(by.name)} ölsün</button></div>`);
  if (nom.role === 'virgin' && !S.used[nom.id + ':virgin']) pre.push(`<div class="item strong"><p>${esc(RN('virgin'))}: ilk kez aday gösterildi. Aday gösteren Kasabalıysa hemen idam edilir.</p></div>`);
  startPick({ k: 'vote', title: `Oylama: ${by.name} → ${nom.name}`, hint: 'Oy verenlere dokun. Ölüler sadece bir kez oy verebilir.', min: 0, max: 99, okLabel: 'Oyu kaydet',
    can: p => !p.dead || p.ghost,
    info: sel => {
      const count = sel.reduce((a, id) => a + voteWeight(P(id)), 0), need = needVotes(), atd = aboutToDie();
      const pass = count >= need && count > atd.max;
      const tie = count >= need && count === atd.max && atd.max > 0;
      const special = sel.map(P).filter(p => voteWeight(p) !== 1).map(p => `${p.name} ${voteWeight(p) > 0 ? '×3' : voteWeight(p) === -1 ? '−1' : '−3'}`);
      return pre.join('') + `<div class="vote-sum ${pass ? 'pass' : ''}"><b>${count}</b><span>oy · gereken ${need}${atd.max ? ` · bugünün en yükseği ${atd.max}` : ''}</span><em>${pass ? 'Ölmek üzere olur' : tie ? 'Beraberlik: kimse ölmek üzere değil' : 'Yetmez'}</em></div>${special.length ? `<p class="muted small">Özel oylar: ${esc(special.join(', '))}</p>` : ''}`;
    },
    ok: sel => {
      const count = sel.reduce((a, id) => a + voteWeight(P(id)), 0);
      const effects = sel.map(P).filter(p => p.dead).map(p => ({ type: 'ghost', p: p.id, value: false }));
      if (nom.role === 'virgin') effects.push({ type: 'use', key: nom.id + ':virgin' });
      act('act', { step: 'vote:' + store.newId(), special: 'vote', nominator, nominee, voters: sel, count, need: needVotes(), effects }, `${nom.name}: ${count} oy`);
    } });
}

// İdam: Şeytan'ın Avukatı / Denizci korumasını, Aziz ve İblis sonuçlarını gösterir
export function execute(pid) {
  const S = G.S, p = P(pid), info = rules.execInfo(S, role, pid);
  const trav = info.trav;
  if (p.dead) {
    return confirmBox(`${p.name} zaten ölü`, `İdam edilir ama tekrar ölmez (bugünün idamı sayılır).`, '⚖ İdam edildi', () => { act('execSurvive', { p: pid }, `${p.name} idam edildi (zaten ölüydü)`); closeSheet(); });
  }
  const title = trav ? `${p.name} sürgün edilsin mi?` : `${p.name} idam edilsin mi?`;
  sheet(`<h3>${esc(title)}</h3><p class="muted">${esc(RN(p.role))}</p>${info.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
    <div class="list">
      ${!trav && info.survives ? `<button class="row-btn hot" data-k="survive"><b>İdam edildi, ölmedi</b><small>Sebebini söyleme</small></button>` : ''}
      <button class="row-btn${info.survives ? '' : ' hot'}" data-k="die"><b>☠ ${trav ? 'Sürgün edildi, öldü' : 'İdam edildi, öldü'}</b></button>
      <button class="row-btn" data-k="cancel"><b>Vazgeç</b></button></div>`);
  $('sheetBody').onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    if (b.dataset.k === 'cancel') return closeSheet();
    const before = G.S;
    if (b.dataset.k === 'survive') { act('execSurvive', { p: pid }, `${p.name} idam edildi, ölmedi`); closeSheet(); return; }
    act('die', { p: pid, cause: trav ? 'exile' : 'execution' }, `${p.name} ${trav ? 'sürgün' : 'idam'} edildi`);
    closeSheet();
    const extra = [];
    if (!trav && p.role === 'saint' && ctx().sober(p)) extra.push({ text: `${p.name} ${RN('saint')} idamla öldü: kötüler kazanır.`, strong: true, end: { winner: 'evil', reason: `${RN('saint')} idam edildi` } });
    if (!afterEffects([{ p: pid, cause: trav ? 'exile' : 'execution' }], before) && extra.length) showItems(extra);
    else if (extra.length) setTimeout(() => showItems(extra), 60);
  };
}
function showItems(items) {
  sheet(`<h3>Unutma</h3>${items.map((x, i) => `<div class="trig strong"><p>${esc(x.text)}</p>${x.end ? `<button class="btn small danger" data-te="${i}">Oyunu bitir</button>` : ''}</div>`).join('')}<button class="btn wide" data-act="close">Tamam</button>`);
  $('sheetBody').onclick = e => { const en = e.target.closest('[data-te]'); if (en) endGame(items[+en.dataset.te].end); };
}

// ---------- gündüz yetenekleri ----------
function dayAbility(k, pid) {
  const S = G.S, c = ctx(), dk = dayKey();
  const record = (text, effects = [], msg) => { const before = G.S; act('act', { step: k + ':' + store.newId(), special: 'day', text, effects }, msg || text); const d = effects.filter(e => e.type === 'die'); if (d.length) afterEffects(d, before); };
  const realOf = id => seated().find(p => p.role === id);
  if (k === 'moonchild') {
    const m = P(pid);
    return startPick({ k, title: `${RN('moonchild')} ${m.name}: kimi seçti?`, hint: 'Yaşayan bir oyuncu. İyiyse bu gece ölür (durum gece bakılır).', can: p => !p.dead && p.id !== pid, auto: true,
      ok: ([t]) => {
        const q = P(t), good = !c.isEvil(q);
        const eff = [{ type: 'use', key: pid + ':moonchild' }];
        if (good) eff.push({ type: 'remAdd', p: t, rid: store.newId(), role: 'moonchild', text: rules.TAG_TEXT.moonkill, tag: 'moonkill', src: pid });
        record(`${RN('moonchild')} ${m.name} → ${q.name}${good ? ' (iyi: bu gece ölecek)' : ' (kötü: bir şey olmaz)'}`, eff);
      } });
  }
  if (k === 'klutz') {
    const kl = P(pid);
    return startPick({ k, title: `${RN('klutz')} ${kl.name}: kimi seçti?`, hint: 'Yaşayan bir oyuncu. Kötüyse kendi takımı kaybeder.', can: p => !p.dead && p.id !== pid, auto: true,
      ok: ([t]) => {
        const q = P(t), works = c.sober(kl), evilPick = c.isEvil(q), klEvil = c.isEvil(kl);
        record(`${RN('klutz')} ${kl.name} → ${q.name}`, [{ type: 'use', key: pid + ':klutz' }]);
        if (works && evilPick) showItems([{ text: `${q.name} kötü: ${klEvil ? 'İyiler' : 'Kötüler'} kazanır.`, end: { winner: klEvil ? 'good' : 'evil', reason: `${RN('klutz')} kötü bir oyuncu seçti` } }]);
        else showItems([{ text: works ? `${q.name} iyi: oyun devam eder.` : `${kl.name} zehirli/sarhoş: hiçbir şey olmaz.` }]);
      } });
  }
  if (k === 'slayer') {
    const real = realOf('slayer');
    return startPick({ k, title: `${RN('slayer')}: yeteneği kim kullanıyor?`, hint: 'Herkesin önünde söyleyen oyuncu (blöf da olabilir).', can: p => !p.dead, auto: true,
      ok: ([sh]) => startPick({ k: 'slayer2', title: `${P(sh).name} kimi seçti?`, can: () => true, auto: true,
        ok: ([t]) => {
          const shooter = P(sh), q = P(t);
          const isReal = shooter.role === 'slayer' && !S.used[sh + ':slayer'];
          const works = isReal && c.sober(shooter);
          const eff = isReal ? [{ type: 'use', key: sh + ':slayer' }, { type: 'remAdd', p: sh, rid: store.newId(), role: 'slayer', text: rules.TAG_TEXT.noability, tag: 'noability', src: sh }] : [];
          if (works && !q.dead && c.team(q) === 'demon') return record(`${RN('slayer')} ${shooter.name} → ${q.name}: İblis öldü`, [...eff, { type: 'die', p: t, cause: 'slayer', by: sh }]);
          if (works && !q.dead && q.role === 'recluse') {
            return sheet(`<h3>${esc(q.name)} ${esc(RN('recluse'))}</h3><p>İblis olarak sayılsın mı? (Senin kararın)</p><div class="list"><button class="row-btn hot" data-k="y"><b>Evet: ${esc(q.name)} ölür</b></button><button class="row-btn" data-k="n"><b>Hayır: hiçbir şey olmaz</b></button></div>`),
              ($('sheetBody').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; closeSheet(); record(`${RN('slayer')} ${shooter.name} → ${q.name}`, b.dataset.k === 'y' ? [...eff, { type: 'die', p: t, cause: 'slayer', by: sh }] : eff); });
          }
          record(`${RN('slayer')} ${shooter.name} → ${q.name}: hiçbir şey olmaz${isReal ? '' : ' (gerçek Şeytan Avcısı değil ya da yeteneği kullanılmış)'}`, eff, 'Hiçbir şey olmaz');
          if (!real && !isReal) {} // blöf: sadece kayıt
        } }) });
  }
  if (k === 'artist') {
    return startPick({ k, title: `${RN('artist')}: kim soru sordu?`, hint: 'Gizlice evet/hayır sorusu sorar. "Evet", "Hayır" ya da "Bilmiyorum" de.', can: p => !p.dead, auto: true,
      ok: ([a]) => {
        const ar = P(a), isReal = ar.role === 'artist' && !S.used[a + ':artist'];
        const eff = isReal ? [{ type: 'use', key: a + ':artist' }, { type: 'remAdd', p: a, rid: store.newId(), role: 'artist', text: rules.TAG_TEXT.noability, tag: 'noability', src: a }] : [];
        record(`${RN('artist')} ${ar.name} soru sordu${isReal ? (c.sober(ar) ? '' : ' (zehirli/sarhoş: istersen yanlış cevap)') : ' (gerçek Sanatçı değil)'}`, eff);
      } });
  }
  if (k === 'alsaahir') {
    return startPick({ k, title: `${RN('alsaahir')}: kim tahmin ediyor?`, can: p => !p.dead, auto: true,
      ok: ([a]) => startPick({ k: 'alsaahir2', title: `${P(a).name}: Minyon ve İblis dediği oyuncular`, hint: 'Hepsi doğru olmalı: tüm Minyonlar ve İblisler (ölüler dahil). Kötü gezginler gerekmez.', min: 1, max: 20, okLabel: 'Tahmini kaydet',
        ok: sel => {
          const al = P(a), evilSet = seated().filter(p => ['minion', 'demon'].includes(c.team(p))).map(p => p.id).sort();
          const guess = [...sel].sort(), right = guess.length === evilSet.length && guess.every((x, i) => x === evilSet[i]);
          const isReal = al.role === 'alsaahir' && c.sober(al);
          record(`${RN('alsaahir')} ${al.name} tahmin: ${sel.map(id => P(id).name).join(', ')} → ${right ? 'doğru' : 'yanlış'}`, al.role === 'alsaahir' ? [{ type: 'use', key: 'alsaahir:' + dk }] : []);
          if (right && isReal) showItems([{ text: 'Tahmin doğru: iyiler kazanır.', end: { winner: 'good', reason: `${RN('alsaahir')} doğru tahmin etti` } }]);
          else showItems([{ text: right ? (al.role === 'alsaahir' ? `Tahmin doğru ama ${al.name} zehirli/sarhoş: hiçbir şey olmaz.` : 'Tahmin doğru ama gerçek Alsaahir değil: hiçbir şey olmaz.') : 'Tahmin yanlış: hiçbir şey olmaz. Oyun devam eder.' }]);
        } }) });
  }
  if (k === 'gunslinger') {
    const gs = seated().find(p => p.role === 'gunslinger' && !p.dead), first = votesToday()[0];
    if (!first) return toast('Bugün henüz oylama yok: Silahşör ilk oylamadan sonra kullanır.');
    const voters = new Set(first.voters || []);
    return startPick({ k, title: `${RN('gunslinger')}: kimi vuruyor?`, hint: 'Sadece bugünkü ilk oylamada oy verenler.', can: p => voters.has(p.id) && !p.dead, auto: true,
      ok: ([t]) => {
        const works = gs && c.sober(gs);
        record(`${RN('gunslinger')} ${gs?.name || '?'} → ${P(t).name}`, [{ type: 'use', key: 'gunslinger:' + dk }, ...(works ? [{ type: 'die', p: t, cause: 'gunslinger', by: gs.id }] : [])]);
      } });
  }
  if (k === 'gnome') {
    const g = seated().find(p => p.role === 'gnome' && !p.dead);
    return startPick({ k, title: `${RN('gnome')}: amigosunu aday göstereni öldürür`, hint: 'Aday göstereni seç.', can: p => !p.dead, auto: true,
      ok: ([t]) => record(`${RN('gnome')} ${g?.name || ''} → ${P(t).name}`, g && c.sober(g) ? [{ type: 'die', p: t, cause: 'gnome', by: g.id }] : []) });
  }
}

// ======================= PANEL ÇİZİMİ =======================
let panelKey = '';
export function renderPanel() {
  const panel = $('panel'), S = G.S;
  let html;
  if (G.edit) html = `<div class="cc"><h3>Yerleri düzenle</h3><p class="muted center">Masa ekranında jetonu sürükleyip başka koltuğa bırak; ikisi yer değiştirir. Yan yana oturanlar komşu sayılır.</p>
    <button class="btn primary big" data-c="editDone">✓ Bitti</button></div>`;
  else if (S.pre) html = preHTML();
  else if (S.phase.kind === 'day') html = dayHTML();
  else html = nightHTML(curStep());
  const key = [store.phaseKey(S.phase), S.pre, G.NS.cur, G.DS.mode?.k, G.edit].join('|');
  const old = panel.querySelector('.cc-body') || panel.querySelector('.cc');
  const keep = old && key === panelKey ? old.scrollTop : 0;
  panel.innerHTML = html;
  panelKey = key;
  const nb = panel.querySelector('.cc-body') || panel.querySelector('.cc'); if (nb && keep) nb.scrollTop = keep;
}

// Masa ortası ve üst bar için kısa özet
export function summary() {
  const S = G.S;
  if (G.edit) return { title: 'Yerleri düzenle', sub: 'Sürükle-bırak' };
  if (G.DS.mode?.pick) return { title: G.DS.mode.title, sub: G.DS.mode.sel.map(id => P(id)?.name).join(', ') || 'Seç' };
  if (S.pre) { const st = preCur().step; return { title: 'İlk gece öncesi', sub: st ? `${st.title} · ${st.sub}` : 'Hazırlık tamam', role: st?.role }; }
  if (S.phase.kind === 'day') {
    const atd = aboutToDie();
    return { title: '☀ ' + store.phaseLabel(S.phase), sub: atd.leader ? `Ölmek üzere: ${P(atd.leader).name}` : `${aliveAll().length} yaşıyor` };
  }
  const c = curStep(), st = c?.step;
  if (!st) return { title: '☾ ' + store.phaseLabel(S.phase), sub: 'Şafak: güne geç' };
  const i = c.steps.indexOf(st) + 1;
  return { title: '☾ ' + store.phaseLabel(S.phase), sub: `${i}/${c.steps.length} · ${st.role ? RN(st.role) : st.title}${st.pid ? ' · ' + P(st.pid).name : ''}`, role: st.role };
}
// Üst şerit: çekmece kapalıyken de sıradaki iş + önemli uyarı + onay düğmesi
export function stripHTML() {
  const S = G.S, car = '<span class="st-car">▾</span>';
  const row = (ic, t, sub, btns = '', warn = false) => `<span class="st-ic">${ic}</span><span class="st-t"><b>${t}</b>${sub ? `<small${warn ? ' class="warn"' : ''}>${sub}</small>` : ''}</span>${btns}${car}`;
  if (G.edit) return row('✥', 'Yerleri düzenle', 'Tokenı sürükle, başka koltuğa bırak');
  const m = G.DS.mode;
  if (m?.pick) {
    const ready = m.sel.length >= (m.min ?? 1);
    return row('☝', esc(m.title), m.sel.length ? esc(m.sel.map(id => P(id)?.name).join(', ')) : 'Masada dokunarak seç',
      `<button class="st-btn" data-c="pickCancel">✕</button>${m.auto ? '' : `<button class="st-btn primary" data-c="pickOk" ${ready ? '' : 'disabled'}>${esc(m.okLabel)}</button>`}`);
  }
  if (S.result) return row('🏁', `Oyun bitti: ${S.result.winner === 'good' ? 'İyiler' : 'Kötüler'} kazandı`, esc(S.result.reason || ''));
  if (S.pre) {
    const { steps, done, step: st } = preCur();
    if (!st) return row('☾', 'Hazırlık tamam', 'İlk gece başlayabilir', `<button class="st-btn primary" data-c="ready">☾ Başlat</button>`);
    const i = steps.indexOf(st) + 1, NS = G.NS, w = prep.warn(st, NS);
    const val = st.n ? NS.targets.map(id => P(id)?.name).filter(Boolean).join(', ') : st.kind === 'bluffs' ? (NS.bl || []).map(rname).join(', ') : st.kind === 'aln' ? (NS.pick === 'evil' ? 'Kötü' : 'İyi') : NS.pick ? rname(NS.pick) : '';
    const sub = w || (val ? '→ ' + val : st.n ? 'Masada seç' : 'Seç');
    return row(st.role ? icon(st.role) : '🎭', `${i}/${steps.length} · ${esc(st.title)}${st.pid ? ' · ' + esc(P(st.pid)?.name || '') : ''}`, esc(sub),
      `<button class="st-btn primary" data-c="ok" ${prep.ready(st, NS) ? '' : 'disabled'}>✓</button>`, !!w);
  }
  if (S.phase.kind === 'day') {
    const atd = aboutToDie(), it = rules.dayItems(S, role).find(i => i.strong);
    const sub = it ? it.text : atd.leader ? `Ölmek üzere: ${P(atd.leader).name} (${atd.max} oy)` : `${aliveAll().length} yaşıyor · idam için ${needVotes()} oy`;
    return row('☀', `${store.phaseLabel(S.phase)}`, esc(sub), `<button class="st-btn" data-c="nominate">⚖ Aday</button>`, !!it);
  }
  const c = curStep(), st = c?.step;
  if (!st) return row('☾', 'Şafak', 'Gece sırası bitti', `<button class="st-btn primary" data-c="toDay">☀ Güne geç</button>`);
  const i = c.steps.indexOf(st) + 1, done = !!c.done[st.key];
  const { notes } = rules.stepInfo(st, S, role, G.NS);
  if (st.special) return row(st.special === 'minioninfo' ? 'M' : st.special === 'demoninfo' ? 'İ' : 'G', `${i}/${c.steps.length} · ${esc(st.title)}`, notes[0] ? esc(notes[0]) : '', done ? '<span class="ok">✓</span>' : `<button class="st-btn primary" data-c="ok">✓</button>`, !!notes[0]);
  const p = P(st.pid), cfg = rules.cfgFor(st, S, role);
  const tg = G.NS.targets.map(id => P(id)?.name).filter(Boolean);
  const ready = G.NS.targets.length >= cfg.targets[0] && (!cfg.three || G.NS.targets.length === 3);
  const sub = notes[0] ? esc(notes[0]) : tg.length ? '→ ' + esc(tg.join(', ')) : cfg.targets[1] > 0 ? 'Masada hedef seç' : '';
  return row(icon(st.role), `${i}/${c.steps.length} · ${esc(RN(st.role))} · ${esc(p?.name || '')}`, sub,
    done ? '<span class="ok">✓</span>' : `<button class="st-btn primary" data-c="ok" ${ready ? '' : 'disabled'}>✓</button>`, !!notes[0]);
}

export function centerHTML() {
  const s = summary();
  return `<button class="mini" data-c="topanel">${s.role ? icon(s.role) : ''}<b>${esc(s.title)}</b><small>${esc(s.sub)}</small><small class="go">Panel ▸</small></button>`;
}

// ======================= OLAYLAR =======================
function onClick(e) {
  const S = G.S;
  const mk = e.target.closest('[data-mk]');
  if (mk && e.currentTarget.contains(mk)) return markerCard(mk.dataset.mk);
  const b = e.target.closest('[data-c]');
  if (!b || b.tagName === 'INPUT') return;
  const a = b.dataset.c;
  if (S.pre && !G.DS.mode && preClick(a, b)) return;
  const c = S.phase.kind === 'night' ? curStep() : null;
  const go = k => { resetNS({ cur: k }); hooks.renderAll(); };
  switch (a) {
    case 'tgt': return tapSeat(b.dataset.pid, true);
    case 'topanel': return hooks.openDrawer?.();
    case 'editDone': G.edit = false; return hooks.renderAll();
    case 'prev': case 'next': { const i = c.steps.indexOf(c.step) + (a === 'prev' ? -1 : 1); if (i < 0) return; return go(c.steps[Math.min(i, c.steps.length - 1)]?.key || null); }
    case 'list': return openSteps();
    case 'toDay': case 'toNight': return nextPhase();
    case 'skip': return confirmStep(true);
    case 'ok': return confirmStep(false);
    case 'redo': { const k = c.done[G.NS.cur]; if (k) confirmBox('Adım geri alınsın mı?', 'Bu adım ve sonrasında yapılanlar silinir.', 'Geri al', () => { closeSheet(); store.undoTo(k); }, true); return; }
    case 'clearT': G.NS.targets = []; return hooks.renderAll();
    case 'pick': { const cfg = rules.cfgFor(c.step, S, role); return hooks.pickRole('Gösterilen rol', id => { G.NS.pick = id; closeSheet(); hooks.renderAll(); }, closeSheet, { only: cfg.pickTeam }); }
    case 'pickGain': { const p = P(c.step.pid), ev = ctx().isEvil(p); return hooks.pickRole(ev ? 'Hangi Minyon yeteneği?' : 'Hangi Kasabalı yeteneği?', id => { G.NS.pick = id; closeSheet(); hooks.renderAll(); }, closeSheet, { only: ev ? 'minion' : 'townsfolk' }); }
    case 'showRole': return hooks.showToken(b.dataset.r, { title: b.dataset.t || '' });
    case 'showAny': return hooks.pickRole('Hangi token gösterilsin?', id => { closeSheet(); hooks.showToken(id); }, closeSheet);
    case 'rem': return hooks.pickReminder(G.NS.targets[0], closeSheet);
    case 'endWin': return endGame({ winner: b.dataset.w, reason: b.dataset.r });
    // gündüz
    case 'nominate': return nominate();
    case 'execLeader': return execute(aboutToDie().leader);
    case 'execAny': return startPick({ k: 'exec', title: 'Kim idam ediliyor?', can: p => true, auto: true, ok: ([p]) => execute(p) });
    case 'exile': return startPick({ k: 'exile', title: 'Hangi gezgin sürgün ediliyor?', hint: 'Oyuncuların en az yarısı (ölüler dahil) desteklemeli. Yetenekler etkilemez.', can: p => !p.dead && ctx().team(p) === 'traveller', auto: true, ok: ([p]) => execute(p) });
    case 'day': return dayAbility(b.dataset.k, b.dataset.pid);
    case 'pickOk': return finishPick();
    case 'pickCancel': G.DS.mode = null; return hooks.renderAll();
    case 'gnomeKill': {
      const g = P(b.dataset.g), t = P(b.dataset.pid), before = G.S;
      act('act', { step: 'gnome:' + store.newId(), special: 'day', text: `${RN('gnome')} ${g.name} → ${t.name}`, effects: ctx().sober(g) ? [{ type: 'die', p: t.id, cause: 'gnome', by: g.id }] : [] }, `${t.name} öldü`);
      afterEffects([{ p: t.id, cause: 'gnome' }], before); return;
    }
    case 'harpyKill': {
      const t = P(b.dataset.pid), before = G.S;
      return confirmBox(`${t.name} ölsün mü?`, `${RN('harpy')} deliliğini bozdu.`, '☠ Öldür', () => { closeSheet(); act('die', { p: t.id, cause: 'harpy' }, `${t.name} öldü`); afterEffects([{ p: t.id, cause: 'harpy' }], before); }, true);
    }
  }
}
$('panel').addEventListener('click', onClick);
$('strip').addEventListener('click', e => { if (e.target.closest('[data-c]')) onClick(e); });
$('board').addEventListener('click', e => {
  if (e.target.closest('.seat')) return;   // koltuk dokunmaları app.js'de
  onClick(e);
});
$('panel').addEventListener('change', e => {
  const a = e.target.dataset.c;
  if (a === 'apply') G.NS.apply = e.target.checked;
  if (a === 'sailor') G.NS.sailorSelf = e.target.checked;
});

function markerCard(k) {
  const S = G.S, c = S.phase.kind === 'night' ? curStep() : null, st = c?.step;
  const t = MARK[k] || k;
  if (k === 'THIS CHARACTER SELECTED YOU') return hooks.showCard(t, st?.role ? [st.role] : []);
  if (k === 'THESE CHARACTERS ARE NOT IN PLAY') return hooks.showCard(t, S.bluffs);
  if (k === 'THESE ARE YOUR MINIONS' || k === 'THIS IS THE DEMON') return hooks.showCard(t);
  // Sen … / Bu oyuncu … : gösterilecek rol
  const info = st ? rules.stepInfo(st, S, role, G.NS) : null;
  if (k === 'YOU ARE' && info?.show?.role) return hooks.showToken(info.show.role, { title: 'Sen' });
  hooks.pickRole(t + ': hangi rol?', id => { closeSheet(); hooks.showToken(id, { title: t }); }, closeSheet);
}

function openSteps() {
  const S = G.S;
  if (S.pre) {
    const { steps, done } = preCur();
    sheet(`<div class="sh-head"><h3>İlk gece öncesi</h3><button class="ib" data-act="close">✕</button></div>
      <div class="list">${steps.map((s, i) => `<button class="row-btn st-row${s.key === G.NS.cur ? ' cur' : ''}${done[s.key] ? ' done' : ''}" data-k="${s.key}">
        <span class="sti">${s.role ? icon(s.role) : '🎭'}</span><b>${i + 1}. ${esc(s.title)}</b><small>${esc(s.sub)}${s.pid ? ' · ' + esc(P(s.pid).name) : ''}${done[s.key] ? ' ✓' : ''}</small></button>`).join('') || '<p class="muted">Hazırlık gerekmiyor.</p>'}</div>`);
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; resetNS({ cur: b.dataset.k }); closeSheet(); hooks.renderAll(); hooks.openDrawer?.(); };
    return;
  }
  if (S.phase.kind !== 'night') return hooks.openLog();
  const render = () => {
    const { steps, done } = curStep();
    sheet(`<div class="sh-head"><h3>☾ ${store.phaseLabel(S.phase)} sırası</h3><button class="ib" data-act="close">✕</button></div>
      <div class="list">${steps.map((s, i) => `<button class="row-btn st-row${s.key === G.NS.cur ? ' cur' : ''}${done[s.key] ? ' done' : ''}" data-k="${s.key}">
        <span class="sti">${s.role ? icon(s.role) : (s.special === 'minioninfo' ? 'M' : 'İ')}</span>
        <b>${i + 1}. ${esc(s.role ? RN(s.role) : s.title)}</b><small>${s.pid ? esc(P(s.pid).name) : ''}${done[s.key] ? ' ✓' : ''}</small></button>`).join('') || '<p class="muted">Bu gece uyanan yok.</p>'}</div>`, render);
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; resetNS({ cur: b.dataset.k }); closeSheet(); hooks.renderAll(); hooks.openDrawer?.(); };
  };
  render();
}
export { openSteps };

function nextPhase() {
  const S = G.S;
  const next = S.phase.kind === 'night' ? { kind: 'day', n: S.phase.n } : { kind: 'night', n: S.phase.n + 1 };
  const go = () => { closeSheet(); G.DS.mode = null; act('phase', { phase: next }, `${store.phaseLabel(next)} başladı`); };
  if (S.phase.kind === 'night') {
    const c = curStep(), left = c.steps.filter(s => !c.done[s.key]).length;
    if (left) return confirmBox('Gece bitmedi', `<b>${left}</b> adım onaylanmadı. Yine de güne geçilsin mi?`, 'Güne geç', go);
  } else {
    const atd = aboutToDie(), dk = dayKey();
    if (atd.leader && !(S.executions?.[dk] || S.executed?.[dk])) return confirmBox('İdam yapılmadı', `<b>${esc(P(atd.leader).name)}</b> ölmek üzereydi ama idam edilmedi. Yine de geceye geçilsin mi?`, 'Geceye geç', go);
  }
  go();
}
