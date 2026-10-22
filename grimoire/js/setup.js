// Oyun kurulumu: Script → Oyuncular → Roller → Dağıtım → Hazırlık → Masa
// Gece başlamadan seçilmesi gereken her şey burada seçilir (kırmızı ringa, ilk gece bilgileri, blöfler, gezginler).
import { G, $, esc, rich, shuffle, role, rname, teamGroups, roleChip, icon } from './core.js?v=20261022-2247';
import { TEAMS, TEAM_TR, DIST } from './data.js?v=20261022-2247';
import * as store from './store.js?v=20261022-2247';
import { defaultSides } from './table.js?v=20261022-2247';

const SKEY = 'tg-grim-setup-v1';
const W = { step: 1, script: null, names: [], picked: [], assign: {}, believed: {}, evil: {}, sides: null, rh: null, bluffs: null, prep: {}, gain: {}, amigo: {} };
const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(W)); } catch (e) {} };

// Kendini başka rol sanan roller ve sandıkları rolün takımı
export const BELIEVES = { drunk: 'townsfolk', lunatic: 'demon', marionette: 'townsfolk' };
// Kurulumu değiştiren roller: [kasabalı, yabancı, minyon, iblis] farkı (Almanac)
const SETUP_MOD = { fanggu: [-1, 1, 0, 0], baron: [-2, 2, 0, 0], vigormortis: [1, -1, 0, 0], balloonist: null, godfather: null, kazali: null, legion: null, atheist: null, lilmonsta: null, riot: null };
const MOD_NOTE = { godfather: '±1 Yabancı', balloonist: '+0 ya da +1 Yabancı', kazali: 'Minyonları İblis seçer', lilmonsta: '+1 Minyon, İblis yok', legion: 'çoğu oyuncu Legion', atheist: 'İblis yok', riot: 'Minyonlar da Riot' };

export function startSetup(fresh = false) {
  let saved = null;
  if (!fresh) { try { saved = JSON.parse(localStorage.getItem(SKEY)); } catch (e) {} }
  Object.assign(W, { step: 1, script: null, picked: [], assign: {}, believed: {}, evil: {}, sides: null, rh: null, bluffs: null, prep: {}, gain: {}, amigo: {} });
  if (saved && saved.script) {
    Object.assign(W, saved);
    if (W.script.custom) Object.assign(G.D.roles, W.script.custom);
  }
  if (!W.names.length) { try { W.names = JSON.parse(localStorage.getItem('tg-grim-names')) || []; } catch (e) { W.names = []; } }
  renderSetup();
}

const travellersPicked = () => W.picked.filter(id => role(id).team === 'traveller');
const teamOf = nm => role(W.assign[nm]).team;
const isEvilNm = nm => teamOf(nm) === 'traveller' ? !!W.evil[nm] : ['minion', 'demon'].includes(teamOf(nm));
const isGoodNm = nm => !isEvilNm(nm);

function targets() {
  const n = W.names.length - travellersPicked().length;
  const base = [...DIST[Math.min(Math.max(n, 5), 15)]];
  const notes = [];
  W.picked.forEach(id => {
    if (!(id in SETUP_MOD)) return;
    const m = SETUP_MOD[id];
    if (m) { m.forEach((d, i) => base[i] += d); notes.push(`${rname(id)}: ${m[1] > 0 ? '+' : ''}${m[1]} Yabancı`); }
    else notes.push(`${rname(id)}: ${MOD_NOTE[id] || 'kurulumu değiştirir'}`);
  });
  return { t: { townsfolk: Math.max(0, base[0]), outsider: Math.max(0, base[1]), minion: base[2], demon: base[3] }, notes };
}

export function renderSetup() {
  save();
  const D = G.D, el = $('setup');
  const steps = ['Script', 'Oyuncular', 'Roller', 'Dağıtım', 'Hazırlık', 'Masa'];
  let html = `<div class="setup-wrap"><div class="steps">${steps.map((s, i) => `<span class="${i + 1 === W.step ? 'cur' : i + 1 < W.step ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div>`;
  if (D.offline) html += `<p class="warn">İnternet yok: karakterler son kayıtlı kopyadan geldi.</p>`;

  if (W.step === 1) {
    html += `<h2>Script seç</h2><div class="list">` + D.scripts.map((s, i) =>
      `<button class="row-btn" data-script="${i}"><b>${esc(s.name)}</b><small>${s.roles.length} rol</small></button>`).join('') + `</div>
      <h3>Kayıtlı olmayan script</h3>
      <p class="muted small">Script Tool'dan alınan JSON'u yapıştır. Ev yapımı rollerin tanımı JSON'da varsa onlar da gelir.</p>
      <textarea id="paste" rows="5" placeholder='[{"id":"_meta","name":"…"},"washerwoman","imp", …]'>${esc(localStorage.getItem('tg-grim-paste') || '')}</textarea>
      <p id="pasteErr" class="warn" hidden></p>
      <div class="nav-row"><button class="btn" data-act="clip">📋 Panodan yapıştır</button><button class="btn primary" data-act="usePaste">Bu script'le devam</button></div>`;
  }

  if (W.step === 2) {
    html += `<h2>Oyuncular</h2><p class="muted">Her satıra bir isim, masadaki oturma sırasıyla (sol üstten saat yönünde). Sırayı sonra masada sürükleyerek de düzeltebilirsin.</p>
      <textarea id="names" rows="12" placeholder="Ayşe&#10;Serhat&#10;…">${esc(W.names.join('\n'))}</textarea>
      <p class="muted" id="nameCount"></p>
      <div class="nav-row"><button class="btn" data-go="1">Geri</button><button class="btn primary" data-go="3" id="namesNext">Devam</button></div>`;
  }

  if (W.step === 3) {
    const n = W.names.length, pickedT = teamGroups(W.picked), { t: target, notes } = targets();
    const g = teamGroups(W.script.roles);
    const ok = W.picked.length === n;
    html += `<h2>Roller <small class="muted">${W.picked.length}/${n}</small></h2>
      <div class="dist">${['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map(t => {
        const have = pickedT[t].length, want = target[t];
        return `<span class="t-${t}${want != null && have !== want ? ' off' : ''}">${TEAM_TR[t]} <b>${have}${want != null ? '/' + want : ''}</b></span>`; }).join('')}</div>
      ${notes.length ? `<p class="warn">⚙ ${notes.join(' · ')}</p>` : ''}
      <p class="muted small">Gezgin seçersen o oyuncu gezgin olur; sayılar gezginler hariç hesaplanır.</p>`;
    html += TEAMS.filter(t => g[t].length).map(t => `<h3 class="t-${t}">${TEAM_TR[t]}</h3><div class="chips">${g[t].map(id => roleChip(id, { on: W.picked.includes(id), attr: `data-pick="${id}"` })).join('')}</div>`).join('');
    html += `<div class="nav-row"><button class="btn" data-go="2">Geri</button><button class="btn" data-act="randRoles">🎲 Rastgele öner</button>
      <button class="btn primary" data-go="4" ${ok ? '' : 'disabled'}>Devam</button></div>`;
  }

  if (W.step === 4) {
    html += `<h2>Dağıtım</h2><p class="muted">Rolü değiştirmek için seç. Aynı rolü başka oyuncuya verirsen ikisi yer değiştirir.</p><div class="assign">`;
    W.names.forEach(nm => {
      const rid = W.assign[nm], r = role(rid), bt = BELIEVES[rid];
      html += `<div class="as-row t-${r.team}"><span class="as-name">${esc(nm)}</span>
        <select data-assign="${esc(nm)}">${W.picked.map(id => `<option value="${id}" ${id === rid ? 'selected' : ''}>${esc(role(id).name)}</option>`).join('')}</select>`;
      if (bt) {
        const inPlay = new Set(W.picked);
        const opts = W.script.roles.filter(id => role(id).team === bt && !inPlay.has(id) && !Object.values(W.believed).some((b, i) => b === id && Object.keys(W.believed)[i] !== nm));
        html += `<label class="believe">Kendini sanıyor: <select data-believe="${esc(nm)}"><option value="">—</option>${opts.map(id => `<option value="${id}" ${W.believed[nm] === id ? 'selected' : ''}>${esc(role(id).name)}</option>`).join('')}</select></label>`;
      }
      if (r.team === 'traveller') {
        html += `<label class="believe">Takımı: <select data-evil="${esc(nm)}"><option value="0" ${W.evil[nm] ? '' : 'selected'}>İyi</option><option value="1" ${W.evil[nm] ? 'selected' : ''}>Kötü</option></select></label>`;
      }
      html += `</div>`;
    });
    const missing = W.names.filter(nm => BELIEVES[W.assign[nm]] && !W.believed[nm]);
    html += `</div>${missing.length ? `<p class="warn">${missing.map(esc).join(', ')} için "kendini sanıyor" rolü seçilmedi.</p>` : ''}
      <div class="nav-row"><button class="btn" data-go="3">Geri</button><button class="btn" data-act="shuffle">🔀 Karıştır</button><button class="btn primary" data-go="5" ${missing.length ? 'disabled' : ''}>Devam</button></div>`;
  }

  if (W.step === 5) html += prepStep();

  if (W.step === 6) {
    const n = W.names.length; W.sides = W.sides || defaultSides(n, innerHeight >= innerWidth);
    const sum = Object.values(W.sides).reduce((a, b) => a + b, 0);
    html += `<h2>Masa</h2><p class="muted">Her kenarda kaç kişi oturuyor? Toplam ${n} olmalı.</p>${sidesEditor(W.sides)}
      <p class="${sum === n ? 'muted' : 'warn'}">Toplam: ${sum}/${n}</p>
      <div class="nav-row"><button class="btn" data-go="5">Geri</button><button class="btn primary" data-act="begin" ${sum === n ? '' : 'disabled'}>Oyunu başlat</button></div>`;
  }
  el.innerHTML = html + '</div>';

  if (W.step === 2) {
    const ta = $('names');
    const upd = () => {
      W.names = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      const dup = W.names.filter((x, i) => W.names.indexOf(x) !== i);
      $('nameCount').textContent = `${W.names.length} oyuncu` + (dup.length ? ` · Tekrar eden isim: ${dup.join(', ')}` : '');
      $('namesNext').disabled = W.names.length < 5 || W.names.length > 20 || dup.length > 0;
      save();
    };
    ta.oninput = upd; upd();
  }
}

// ================= HAZIRLIK =================
// İlk gece bilgisi gece başlamadan hazırlanabilen roller (Almanac "How to run: while preparing the first night")
const PREP = {
  washerwoman: { n: 2, team: 'townsfolk', pick: true, hint: 'Bir Kasabalı + bir yanlış oyuncu. Kasabalının rolü gösterilir.' },
  librarian: { n: 2, team: 'outsider', pick: true, hint: 'Bir Yabancı + bir yanlış oyuncu. Yabancının rolü gösterilir. Sarhoş da Yabancıdır.' },
  investigator: { n: 2, team: 'minion', pick: true, hint: 'Bir Minyon + bir yanlış oyuncu. Minyonun rolü gösterilir.' },
  grandmother: { n: 1, kind: 'good', hint: 'Torun: iyi bir oyuncu. Rolü gösterilir, oyuncu işaret edilir.' },
  steward: { n: 1, kind: 'good', hint: 'İyi bir oyuncu.' },
  noble: { n: 3, kind: 'noble', hint: '3 oyuncu, tam olarak 1\'i kötü.' },
  knight: { n: 2, kind: 'knight', hint: '2 oyuncu, ikisi de İblis değil.' },
};
const prepOwners = () => W.names.flatMap(nm => [...new Set([W.assign[nm], W.believed[nm]])].filter(id => id && PREP[id])
  .map(id => ({ id, nm, key: id + ':p' + W.names.indexOf(nm), fake: id !== W.assign[nm] })));
function suggestPrep(o) {
  const k = PREP[o.id], others = W.names.filter(n => n !== o.nm), one = arr => arr[Math.floor(Math.random() * arr.length)];
  if (k.team) {
    const real = others.filter(n => teamOf(n) === k.team); if (!real.length) return { t: [], pick: null };
    const x = one(real), y = one(others.filter(n => n !== x));
    return { t: shuffle([x, y]), pick: W.assign[x] };
  }
  if (k.kind === 'good') return { t: [one(others.filter(isGoodNm))] };
  if (k.kind === 'noble') { const e = one(others.filter(isEvilNm)), g = shuffle(others.filter(isGoodNm)).slice(0, 2); return { t: shuffle([e, ...g].filter(Boolean)) }; }
  return { t: shuffle(others.filter(n => teamOf(n) !== 'demon')).slice(0, 2) };
}
function prepWarn(o, v) {
  const k = PREP[o.id]; if (o.fake || ['drunk', 'lunatic'].includes(W.assign[o.nm])) return '';
  const t = v.t.filter(Boolean);
  if (k.team) {
    if (!W.names.some(n => n !== o.nm && teamOf(n) === k.team)) return '';
    if (t.length < 2) return 'İki oyuncu seç.';
    if (!t.some(n => teamOf(n) === k.team)) return `Seçilenlerden biri ${TEAM_TR[k.team].toLocaleLowerCase('tr')} olmalı.`;
    if (v.pick && !t.some(n => W.assign[n] === v.pick)) return 'Gösterilen rol seçilen oyunculardan birinin rolü olmalı.';
    return '';
  }
  if (t.length < k.n) return k.n + ' oyuncu seç.';
  if (t.includes(o.nm)) return 'Kendini seçemez.';
  if (k.kind === 'good' && !isGoodNm(t[0])) return 'İyi bir oyuncu olmalı.';
  if (k.kind === 'noble' && t.filter(isEvilNm).length !== 1) return 'Tam olarak 1 kötü olmalı.';
  if (k.kind === 'knight' && t.some(n => teamOf(n) === 'demon')) return 'İblis olamaz.';
  return '';
}

function prepStep() {
  const good = W.names.filter(isGoodNm);
  const hasFT = W.picked.includes('fortuneteller') || Object.values(W.believed).includes('fortuneteller');
  const hasDemon = W.picked.some(id => role(id).team === 'demon');
  let h = `<h2>Hazırlık</h2><p class="muted">Gece başlamadan seçilmesi gerekenler. Burada seçtiklerin gece adımlarında hazır gelir.</p>`;
  let any = false;

  if (hasFT) {
    any = true;
    if (!good.includes(W.rh)) W.rh = good.length ? good[Math.floor(Math.random() * good.length)] : null;
    h += `<div class="prep t-townsfolk"><div class="prep-h">${icon('fortuneteller')}<b>${rname('fortuneteller')}</b><span>Kırmızı ringa</span><button class="btn small" data-act="rhRand">🎲</button></div>
      <p class="muted small">Herhangi bir iyi oyuncu (Falcı'nın kendisi de olabilir). Ona bakınca "Evet" görür.</p>
      <div class="prep-sel"><select id="rhSel">${good.map(nm => `<option ${nm === W.rh ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select></div></div>`;
  }

  const owners = prepOwners();
  owners.forEach(o => { if (!W.prep[o.key]) W.prep[o.key] = suggestPrep(o); });
  if (owners.length) any = true;
  h += owners.map(o => {
    const k = PREP[o.id], v = W.prep[o.key], r = role(o.id), others = W.names.filter(n => n !== o.nm), w = prepWarn(o, v);
    const noRole = k.team && !others.some(n => teamOf(n) === k.team);
    const sel = noRole ? `<p class="info">Oyunda ${TEAM_TR[k.team].toLocaleLowerCase('tr')} yok: gece "0" göstereceksin.</p>` : Array.from({ length: k.n }, (_, i) => `<select data-prep="${o.key}" data-i="${i}"><option value="">—</option>${others.map(n => `<option value="${esc(n)}" ${v.t[i] === n ? 'selected' : ''}>${esc(n)} · ${esc(role(W.assign[n]).name)}</option>`).join('')}</select>`).join('');
    const pk = k.pick && !noRole ? `<select data-prepick="${o.key}"><option value="">Gösterilen rol…</option>${[...new Set([...v.t.filter(Boolean).map(n => W.assign[n]), ...W.script.roles.filter(id => role(id).team === k.team)])].map(id => `<option value="${id}" ${v.pick === id ? 'selected' : ''}>${esc(role(id).name)}</option>`).join('')}</select>` : '';
    return `<div class="prep t-${r.team}"><div class="prep-h">${icon(o.id)}<b>${esc(r.name)}</b><span>${esc(o.nm)}${o.fake ? ` <em>(aslında ${esc(role(W.assign[o.nm]).name)}: yanlış bilgi serbest)</em>` : ''}</span><button class="btn small" data-act="prepRand" data-k="${o.key}">🎲</button></div>
      <p class="muted small">${esc(k.hint)}</p><div class="prep-sel">${sel}${pk}</div>${w ? `<p class="warn">${esc(w)}</p>` : ''}</div>`;
  }).join('');

  // Gezginler: Çırak'ın kazandığı yetenek, Cüce'nin amigosu
  W.names.filter(nm => W.assign[nm] === 'apprentice').forEach(nm => {
    any = true;
    const ev = !!W.evil[nm], tm = ev ? 'minion' : 'townsfolk';
    const opts = W.script.roles.filter(id => role(id).team === tm);
    const inPlay = new Set(W.picked);
    h += `<div class="prep t-traveller"><div class="prep-h">${icon('apprentice')}<b>${rname('apprentice')}</b><span>${esc(nm)} · ${ev ? 'kötü' : 'iyi'}</span></div>
      <p class="muted small">${ev ? 'Bir Minyon' : 'Bir Kasabalı'} yeteneği kazanır. Tercihen oyunda olmayan bir rol.</p>
      <div class="prep-sel"><select data-gain="${esc(nm)}"><option value="">Gece seçerim</option>${opts.map(id => `<option value="${id}" ${W.gain[nm] === id ? 'selected' : ''}>${esc(role(id).name)}${inPlay.has(id) ? ' (oyunda)' : ''}</option>`).join('')}</select></div></div>`;
  });
  W.names.filter(nm => W.assign[nm] === 'gnome').forEach(nm => {
    any = true;
    const same = W.names.filter(n => n !== nm && isEvilNm(n) === isEvilNm(nm));
    h += `<div class="prep t-traveller"><div class="prep-h">${icon('gnome')}<b>${rname('gnome')}</b><span>${esc(nm)}</span></div>
      <p class="muted small">Herkes Cüce ile aynı takımdan bir oyuncuyu (amigo) öğrenir. Herkese açıkla.</p>
      <div class="prep-sel"><select data-amigo="${esc(nm)}"><option value="">—</option>${same.map(n => `<option ${W.amigo[nm] === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div>`;
  });
  const evT = W.names.filter(nm => teamOf(nm) === 'traveller' && W.evil[nm]);
  if (evT.length) { any = true; h += `<p class="info">Kötü gezgin (${evT.map(esc).join(', ')}): ilk gece İblis'in kim olduğunu öğrenir, Minyonları öğrenmez.</p>`; }

  if (hasDemon) {
    any = true;
    const inPlay = new Set([...W.picked, ...Object.values(W.believed).filter(Boolean)]);
    const pool = W.script.roles.filter(id => ['townsfolk', 'outsider'].includes(role(id).team) && !inPlay.has(id));
    if (W.bluffs == null) W.bluffs = shuffle(pool).slice(0, 3);
    W.bluffs = W.bluffs.filter(id => pool.includes(id));
    h += `<div class="prep t-demon"><div class="prep-h"><span class="sp">🎭</span><b>İblis blöfleri</b><span>${W.bluffs.length}/3</span><button class="btn small" data-act="bluffRand">🎲</button></div>
      <p class="muted small">Oyunda olmayan 3 iyi rol (Sarhoş'un sandığı rol hariç). İlk gece İblis'e gösterilir.</p>
      <div class="chips">${pool.map(id => roleChip(id, { on: W.bluffs.includes(id), attr: `data-bluff="${id}"` })).join('')}</div></div>`;
  }
  if (!any) h += `<p class="muted">Bu rollerde ön hazırlık gerekmiyor.</p>`;
  const warns = prepOwners().map(o => prepWarn(o, W.prep[o.key])).filter(Boolean).length;
  h += `${warns ? `<p class="warn">${warns} hazırlıkta kural dışı seçim var. Yine de devam edebilirsin.</p>` : ''}
    <div class="nav-row"><button class="btn" data-go="4">Geri</button><button class="btn primary" data-go="6">Devam</button></div>`;
  return h;
}

export function sidesEditor(sd) {
  const lbl = { top: 'Üst', right: 'Sağ', bottom: 'Alt', left: 'Sol' };
  return `<div class="sides"><div class="sides-box">${['top', 'right', 'bottom', 'left'].map(k =>
    `<div class="side side-${k}"><span>${lbl[k]}</span><div class="stepper"><button data-side="${k}" data-d="-1">−</button><b>${sd[k]}</b><button data-side="${k}" data-d="1">+</button></div></div>`).join('')}
    <div class="side-table">Masa</div></div></div>`;
}

// ---------------- olaylar ----------------
$('setup').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.script != null) { W.script = G.D.scripts[+b.dataset.script]; W.picked = []; W.prep = {}; W.bluffs = null; W.step = 2; return renderSetup(); }
  if (b.dataset.go) {
    const to = +b.dataset.go;
    if (to === 3 && W.step === 2) { localStorage.setItem('tg-grim-names', JSON.stringify(W.names)); W.picked = W.picked.filter(id => W.script.roles.includes(id)); }
    if (to === 4 && W.step === 3) assignRandom();
    if (to === 5 && W.step === 4) { W.prep = {}; W.bluffs = null; W.gain = {}; W.amigo = {}; }
    W.step = to; window.scrollTo(0, 0); return renderSetup();
  }
  if (b.dataset.pick) {
    const id = b.dataset.pick, i = W.picked.indexOf(id);
    if (i >= 0) W.picked.splice(i, 1); else W.picked.push(id);
    return renderSetup();
  }
  if (b.dataset.bluff) {
    const id = b.dataset.bluff, i = W.bluffs.indexOf(id);
    if (i >= 0) W.bluffs.splice(i, 1); else if (W.bluffs.length < 3) W.bluffs.push(id);
    return renderSetup();
  }
  if (b.dataset.side) { W.sides[b.dataset.side] = Math.max(0, W.sides[b.dataset.side] + +b.dataset.d); return renderSetup(); }
  const a = b.dataset.act;
  if (a === 'bluffRand') { W.bluffs = null; return renderSetup(); }
  if (a === 'prepRand') { const o = prepOwners().find(x => x.key === b.dataset.k); if (o) W.prep[o.key] = suggestPrep(o); return renderSetup(); }
  if (a === 'rhRand') { W.rh = null; return renderSetup(); }
  if (a === 'randRoles') { randomRoles(); return renderSetup(); }
  if (a === 'shuffle') { assignRandom(); W.prep = {}; return renderSetup(); }
  if (a === 'begin') return beginGame();
  if (a === 'clip') {
    navigator.clipboard?.readText().then(t => { $('paste').value = t; }).catch(() => pasteErr('Panoya erişilemedi. Kutuya elle yapıştır.'));
    return;
  }
  if (a === 'usePaste') {
    try {
      const sc = parseScript($('paste').value);
      localStorage.setItem('tg-grim-paste', $('paste').value);
      W.script = sc; W.picked = []; W.step = 2; renderSetup();
    } catch (err) { pasteErr(err.message); }
  }
});
$('setup').addEventListener('change', e => {
  const s = e.target;
  if (s.dataset.assign) {
    const nm = s.dataset.assign, nr = s.value, other = W.names.find(x => W.assign[x] === nr);
    if (other && other !== nm) { W.assign[other] = W.assign[nm]; delete W.believed[other]; }
    W.assign[nm] = nr; delete W.believed[nm];
    return renderSetup();
  }
  if (s.id === 'rhSel') { W.rh = s.value; return save(); }
  if (s.dataset.prep) {
    const key = s.dataset.prep, o = prepOwners().find(x => x.key === key), v = W.prep[key];
    v.t[+s.dataset.i] = s.value || '';
    if (PREP[o.id].pick && !v.t.some(n => n && W.assign[n] === v.pick)) { const x = v.t.find(n => n && teamOf(n) === PREP[o.id].team); v.pick = x ? W.assign[x] : null; }
    return renderSetup();
  }
  if (s.dataset.prepick) { W.prep[s.dataset.prepick].pick = s.value || null; return renderSetup(); }
  if (s.dataset.believe) { W.believed[s.dataset.believe] = s.value || undefined; return renderSetup(); }
  if (s.dataset.evil) { W.evil[s.dataset.evil] = s.value === '1'; return renderSetup(); }
  if (s.dataset.gain) { W.gain[s.dataset.gain] = s.value || null; return save(); }
  if (s.dataset.amigo) { W.amigo[s.dataset.amigo] = s.value || null; return save(); }
});

function pasteErr(m) { const e = $('pasteErr'); e.textContent = m; e.hidden = false; }

// Script Tool JSON'u: ["id", {id:"x"}, {id:"_meta", name}] ya da ev yapımı rol tanımları {id, name, team, ability, ...}
const TEAM_ALIAS = { traveler: 'traveller', townsfolk: 'townsfolk', outsider: 'outsider', minion: 'minion', demon: 'demon', fabled: 'fabled', traveller: 'traveller' };
const normId = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
export function parseScript(text) {
  const D = G.D;
  let arr;
  try { arr = JSON.parse(text.trim()); } catch (e) { throw new Error('JSON okunamadı. Script Tool çıktısını olduğu gibi yapıştır.'); }
  if (!Array.isArray(arr)) throw new Error('Script bir liste olmalı: [ ... ]');
  let name = 'Özel script'; const ids = [], custom = {}, unknown = [];
  for (const it of arr) {
    const raw = typeof it === 'string' ? it : it && it.id;
    if (!raw) continue;
    if (raw === '_meta') { if (it.name) name = String(it.name); continue; }
    const id = normId(raw);
    if (typeof it === 'object' && it.name && it.team && !D.roles[id]) {
      custom[id] = { id, name: String(it.name), team: TEAM_ALIAS[String(it.team).toLowerCase()] || 'townsfolk',
        ability: String(it.ability || ''), first: String(it.firstNightReminder || ''), other: String(it.otherNightReminder || ''),
        reminders: Array.isArray(it.reminders) ? it.reminders.map(String) : [], remindersGlobal: Array.isArray(it.remindersGlobal) ? it.remindersGlobal.map(String) : [],
        setup: !!it.setup, official: false, custom: true };
    }
    if (D.roles[id] || custom[id]) { if (!ids.includes(id)) ids.push(id); } else unknown.push(raw);
  }
  if (unknown.length) throw new Error('Tanınmayan rol: ' + unknown.join(', '));
  if (ids.length < 5) throw new Error('Script\'te en az 5 rol olmalı.');
  Object.assign(D.roles, custom);
  return { name, roles: ids, custom };
}

function randomRoles() {
  const g = teamGroups(W.script.roles);
  W.picked = [...travellersPicked()];
  // Kurulumu değiştiren roller sayıları etkiler: önce İblis, sonra Minyon, sonra iyiler
  W.picked.push(...shuffle(g.demon).slice(0, targets().t.demon));
  W.picked.push(...shuffle(g.minion).slice(0, targets().t.minion));
  const t = targets().t;
  W.picked.push(...shuffle(g.outsider).slice(0, t.outsider), ...shuffle(g.townsfolk).slice(0, t.townsfolk));
}
function assignRandom() {
  const roles = shuffle(W.picked); W.assign = {}; W.believed = {};
  W.names.forEach((nm, i) => { W.assign[nm] = roles[i]; });
}

function beginGame() {
  const idOf = nm => 'p' + W.names.indexOf(nm);
  const players = W.names.map((nm, i) => {
    const rid = W.assign[nm], rem = [];
    if ((W.picked.includes('fortuneteller') || Object.values(W.believed).includes('fortuneteller')) && nm === W.rh) rem.push({ role: 'fortuneteller', text: 'Kırmızı ringa', tag: 'redherring' });
    Object.entries(W.amigo).forEach(([g, a]) => { if (a === nm) rem.push({ role: 'gnome', text: 'Amigo', tag: 'amigo', src: idOf(g) }); });
    return { id: 'p' + i, name: nm, role: rid, believed: W.believed[nm] || null, rem,
      evil: role(rid).team === 'traveller' ? !!W.evil[nm] : null };
  });
  const prep = {};
  prepOwners().forEach(o => { const v = W.prep[o.key]; if (v) prep[o.key] = { targets: (v.t || []).filter(Boolean).map(idOf), pick: v.pick || null }; });
  // Çırak: önceden seçilen yetenek, ilk gece adımında hazır gelir
  W.names.forEach(nm => { if (W.assign[nm] === 'apprentice' && W.gain[nm]) prep['apprentice:' + idOf(nm)] = { targets: [], pick: W.gain[nm] }; });
  const data = { script: W.script.name, scriptRoles: W.script.roles, customRoles: W.script.custom || {}, players, sides: { ...W.sides }, bluffs: W.bluffs || [], prep };
  G.edit = true;
  store.reset(true);
  try { localStorage.removeItem(SKEY); } catch (e) {}
  store.dispatch('start', data);
}
