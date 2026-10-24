// Giriş noktası: oturum, veri, dört bölüm (Kurulum, Grimoire, Gece Sırası, Diğer) ve tüm pencereler.
import { loadData, TEAMS, TEAM_TR, TEAM_PL, DIST, GOOD, remTr, parseScript } from './data.js?v=20261024-0714';
import { G, $, esc, rich, role, icon, bigTok, commit, emit, save, load, subscribe, undo, canUndo, uid, toast,
  openModal, closeModal, confirmBox, showFull, scriptIds, boardRoles, inPlay } from './core.js?v=20261024-0714';
import { arcText, glyphHTML, initBoard, renderBoard, onTap, addRoleToken, ovalSpots, freeSpot, remSpot, colorOf, clockwise, applyHeight, W, H } from './board.js?v=20261024-0714';

export const VERSION = '20261024-0714';
const show = id => ['boot', 'login', 'app'].forEach(x => { $(x).hidden = x !== id; });
const RN = id => role(id).name;
const tokById = id => G.S.tokens.find(t => t.id === id);

// ================= açılış =================
const auth = firebase.auth();
auth.onAuthStateChanged(async user => {
  if (!user) { show('login'); return; }
  show('boot');
  load();
  G.D = await loadData();
  show('app');
  start();
});
$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('lErr').hidden = true;
  try { await auth.signInWithEmailAndPassword($('lEmail').value.trim(), $('lPass').value); }
  catch (err) { $('lErr').hidden = false; }
};

let started = false;
function start() {
  if (!started) {
    started = true;
    initBoard();
    // Simgeye dokununca açılan pencerenin üstüne, aynı dokunuşun 'click'i düşüp yanlış düğmeye basmasın
    document.addEventListener('click', e => {
      if (Date.now() - (window.__tapAt || 0) < 450 && e.target.closest('#modal, #show')) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    onTap({ tapRole: t => openToken(t.id), tapRem: t => openRem(t.id), holdRole: t => { closeModal(); showFull(bigTok(t.role)); } });
    subscribe(renderAll);
    wire();
  }
  renderAll();
}

function renderAll() {
  renderPanes();
  renderSetup();
  renderBoard();
  renderBluffs();
  renderToolbar();
  renderNight();
  renderMore();
  $('wrapUndo').disabled = !canUndo();
}

// ---- katlanır bölümler ----
function renderPanes() {
  document.querySelectorAll('.pane-h').forEach(b => {
    const shut = !!G.S.open[b.dataset.pane];
    b.parentElement.classList.toggle('shut', shut);
  });
}

// ================= 1. KURULUM =================
function renderSetup() {
  const S = G.S, D = G.D;
  const n = S.script.roles.length;
  $('scriptLine').innerHTML = n
    ? `<span class="lbl">Senaryo</span><b>${esc(S.script.name || 'Özel senaryo')}</b><span class="muted">${n} karakter</span>`
    : `<span class="lbl">Senaryo</span><span class="muted">Seçilmedi</span>`;
  const when = D.at ? new Date(D.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  $('dataLine').innerHTML = D.offline
    ? `<span class="warn-t">Sheet'e ulaşılamadı.</span> ${D.at ? `Kayıtlı kopya kullanılıyor (${when}).` : 'Kayıtlı kopya yok.'}`
    : `Türkçe metinler sheet'ten yüklendi · ${when}`;
}

function openScripts() {
  const S = G.S, D = G.D;
  openModal('Senaryo Seç', `
    <div class="list">${D.scripts.map((s, i) => `<button class="btn list-btn${S.script.name === s.name ? ' on' : ''}" data-i="${i}">${esc(s.name)}<small>${s.roles.length} karakter</small></button>`).join('') || '<p class="muted">Sheet\'te senaryo bulunamadı.</p>'}</div>
    <details class="sub"><summary>Panodan yapıştır</summary>
      <textarea id="scPaste" rows="4" placeholder='["chef","empath",…] ya da resmi script JSON'></textarea>
      <button class="btn primary small" id="scPasteOk">Yükle</button></details>
    <details class="sub"><summary>Dosyadan yükle</summary><input type="file" id="scFile" accept=".json,application/json"></details>`, body => {
    body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => useScript(D.scripts[+b.dataset.i].name, D.scripts[+b.dataset.i].roles));
    $('scPasteOk').onclick = () => fromJSON($('scPaste').value);
    $('scFile').onchange = async e => { const f = e.target.files[0]; if (f) fromJSON(await f.text(), f.name.replace(/\.json$/i, '')); };
  });
}
function fromJSON(text, fname = '') {
  const p = parseScript(text);
  if (!p || !p.roles.length) return toast('Script okunamadı.');
  const unknown = p.roles.filter(id => !G.D.roles[id]);
  p.roles.filter(id => !G.D.roles[id]).forEach(id => { G.D.roles[id] = { id, name: id, team: 'townsfolk', ability: '', first: '', other: '', reminders: [], remindersGlobal: [], english: true }; });
  useScript(p.name || fname || 'Özel senaryo', p.roles);
  if (unknown.length) toast(`Tanınmayan: ${unknown.join(', ')}`, 4000);
}
function useScript(name, roles) {
  commit(S => {
    S.script = { name, roles: [...roles] };
    for (const id of Object.keys(S.setup.pick)) if (!roles.includes(id)) delete S.setup.pick[id];
  });
  closeModal();
  toast(`${name} seçildi`);
}

// ---- karakter seçimi ----
function expected(n) {
  const base = DIST[Math.min(Math.max(n, 5), 15)];
  return { townsfolk: base[0], outsider: base[1], minion: base[2], demon: base[3], traveller: Math.max(0, n - 15) };
}
function openChars() {
  const S = G.S;
  if (!S.script.roles.length) { toast('Önce bir senaryo seç.'); return openScripts(); }
  const render = () => {
    const st = S.setup, n = st.players, exp = expected(n);
    const ids = scriptIds();
    const cnt = {}; TEAMS.forEach(t => cnt[t] = 0);
    Object.entries(st.pick).forEach(([id, c]) => { cnt[role(id).team] = (cnt[role(id).team] || 0) + c; });
    const total = Object.values(st.pick).reduce((a, b) => a + b, 0);
    const cols = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const col = Math.min(Math.max(n, 5), 15);
    const rowT = (t, i) => `<tr class="t-${t}"><th>${TEAM_PL[t]}</th>${cols.map(c => `<td class="${c === col ? 'on' : ''}">${DIST[c][i]}</td>`).join('')}</tr>`;
    openModal('Karakterleri Seç', `
      <div class="dist-wrap"><table class="dist"><tr><th>Oyuncular</th>${cols.map(c => `<td class="${c === col ? 'on' : ''}">${c === 15 ? '15+' : c}</td>`).join('')}</tr>
        ${['townsfolk', 'outsider', 'minion', 'demon'].map(rowT).join('')}</table></div>
      <div class="lbl">Oyuncu sayısı</div>
      <div class="pcount" id="csN">${Array.from({ length: 16 }, (_, i) => i + 5).map(c => `<button data-n="${c}" class="${c === n ? 'on' : ''}">${c}</button>`).join('')}</div>
      <label class="sw"><input type="checkbox" id="csAb" ${st.abilities ? 'checked' : ''}><i></i>Karakter özelliklerini göster</label>
      <label class="sw"><input type="checkbox" id="csDup" ${st.dup ? 'checked' : ''}><i></i>Aynı karakterden birden fazla</label>
      <div class="grid2"><button class="btn" id="csRand">Rastgele öner</button><button class="btn ghost" id="csClear">Seçimi temizle</button></div>
      ${['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map(t => {
        const list = ids.filter(id => role(id).team === t);
        if (!list.length) return '';
        const want = exp[t];
        return `<div class="cgroup t-${t}"><div class="cg-side"><div class="cg-stick"><span>${TEAM_PL[t]}</span><b class="${cnt[t] === want ? 'ok' : 'off'}">${cnt[t]} / ${want}</b></div></div>
          <div class="cg-list">${list.map(id => {
            const c = st.pick[id] || 0;
            return `<button class="cc${c ? ' on' : ''}" data-id="${id}">${icon(id, 'ic big')}<b>${esc(RN(id))}</b>${st.abilities ? `<small>${rich(role(id).ability)}</small>` : ''}${c > 1 ? `<span class="cnt">×${c}</span>` : ''}${c && st.dup ? `<span class="minus" data-minus="${id}">−</span>` : ''}</button>`;
          }).join('')}</div></div>`;
      }).join('')}
      <div class="sticky-foot"><span>${total} seçili${total !== n ? ` · <span class="warn-t">${n} oyuncu</span>` : ''}</span><span class="foot-btns"><button class="btn" id="csDeal" ${total ? '' : 'disabled'}>Oyunculara dağıt</button><button class="btn primary" id="csPlace" ${total ? '' : 'disabled'}>Tablaya diz</button></span></div>`, body => {
      $('csN').onclick = e => { const b = e.target.closest('[data-n]'); if (b) { commit(S => { S.setup.players = +b.dataset.n; }, true); render(); } };
      $('csAb').onchange = e => { commit(S => { S.setup.abilities = e.target.checked; }, true); render(); };
      $('csDup').onchange = e => { commit(S => { S.setup.dup = e.target.checked; if (!S.setup.dup) for (const k in S.setup.pick) S.setup.pick[k] = 1; }, true); render(); };
      $('csClear').onclick = () => { commit(S => { S.setup.pick = {}; }, true); render(); };
      $('csRand').onclick = () => { randomPick(); render(); };
      $('csPlace').onclick = placeChosen;
      $('csDeal').onclick = () => startDeal();
      body.onclick = e => {
        const m = e.target.closest('[data-minus]');
        if (m) { e.stopPropagation(); commit(S => { const k = m.dataset.minus; if (--S.setup.pick[k] <= 0) delete S.setup.pick[k]; }, true); return render(); }
        const b = e.target.closest('.cc'); if (!b) return;
        const id = b.dataset.id;
        commit(S => { const p = S.setup.pick; if (S.setup.dup) p[id] = (p[id] || 0) + 1; else if (p[id]) delete p[id]; else p[id] = 1; }, true);
        render();
      };
    }, { wide: true });
  };
  render();
}
function randomPick() {
  const exp = expected(G.S.setup.players), ids = scriptIds();
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  commit(S => {
    S.setup.pick = {};
    for (const t of ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'])
      shuffle(ids.filter(id => role(id).team === t)).slice(0, exp[t]).forEach(id => { S.setup.pick[id] = 1; });
  }, true);
  toast('Kurulumu değiştiren karakterleri (Baron vb.) kendin ayarla.', 3500);
}
function placeChosen() {
  const order = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'];
  const list = [];
  Object.entries(G.S.setup.pick).forEach(([id, c]) => { for (let i = 0; i < c; i++) list.push(id); });
  list.sort((a, b) => order.indexOf(role(a).team) - order.indexOf(role(b).team));
  const existing = boardRoles().filter(t => role(t.role).team !== 'fabled');
  const replace = () => {
    closeModal();
    commit(S => {
      const gone = new Set(existing.map(t => t.id));
      S.tokens = S.tokens.filter(t => !gone.has(t.id) && !(t.kind === 'rem' && gone.has(t.owner)));
      ovalSpots(list.length).forEach((xy, i) => addRoleToken(list[i], xy)); S.fangguDone = false;
    });
    goBoard();
  };
  const append = () => { closeModal(); commit(() => { list.forEach(id => addRoleToken(id)); }); goBoard(); };
  if (!existing.length) return replace();
  confirmBox(`Tablada ${existing.length} karakter simgesi var. Silinip yerine yenileri dizilsin mi?`, 'Sil ve diz', replace,
    { alt: { text: 'Mevcutlara ekle', cb: append } });
}

// ---- oyunculara rastgele dağıtım: numaralı jetonlar, oyuncu seçer, rolünü görür ----
function startDeal() {
  const list = [];
  Object.entries(G.S.setup.pick).forEach(([id, c]) => { for (let i = 0; i < c; i++) list.push(id); });
  if (!list.length) { toast('Önce karakterleri seç.'); return openChars(); }
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const existing = boardRoles().filter(t => role(t.role).team !== 'fabled');
  const go = () => {
    commit(S => {
      const gone = new Set(existing.map(t => t.id));
      S.tokens = S.tokens.filter(t => !gone.has(t.id) && !(t.kind === 'rem' && gone.has(t.owner)));
      S.deal = { pool: list, taken: {} }; S.fangguDone = false;
    });
    dealGrid();
  };
  if (!existing.length) return go();
  confirmBox(`Tablada ${existing.length} karakter simgesi var. Silinip dağıtım baştan başlasın mı?`, 'Sil ve başlat', go);
}
function openDeal() {
  if (G.S.deal && G.S.deal.pool && G.S.deal.pool.length) return dealGrid();
  startDeal();
}
function dealGrid() {
  const d = G.S.deal; if (!d) return;
  const n = d.pool.length, left = n - Object.keys(d.taken).length;
  openModal('Karakterini Seç', `
    <p class="deal-help">${left ? 'Karakterini seçmek için numaralı jetonlardan birine dokun. Daha koyu olanlar seçilmiştir.' : 'Tüm karakterler dağıtıldı.'}</p>
    <div class="deal-grid">${d.pool.map((_, i) => `<button class="dnum${d.taken[i] ? ' taken' : ''}" data-i="${i}" ${d.taken[i] ? 'disabled' : ''}><span>${i + 1}</span></button>`).join('')}</div>
    <div class="grid2 deal-foot">${left ? '<button class="btn ghost small" id="dealCancel">Dağıtımı bitir</button>' : ''}<button class="btn primary" id="dealDone">${left ? 'Kapat' : 'Tablaya git'}</button></div>`, body => {
    body.querySelector('.deal-grid').onclick = e => { const b = e.target.closest('.dnum'); if (b && !b.disabled) dealReveal(+b.dataset.i); };
    $('dealDone').onclick = () => { closeModal(); if (!left) { commit(S => { S.deal = null; }, true); goBoard(); } };
    const c = $('dealCancel');
    if (c) c.onclick = () => confirmBox(`${left} karakter henüz seçilmedi. Dağıtım bitirilsin mi? (Tablaya gelenler kalır.)`, 'Bitir', () => { commit(S => { S.deal = null; }, true); closeModal(); goBoard(); });
  }, { opaque: true });
}
function dealReveal(i) {
  const d = G.S.deal; if (!d || d.taken[i]) return dealGrid();
  const rid = d.pool[i];
  let tid;
  commit(S => {
    const spots = ovalSpots(S.deal.pool.length);
    const t = addRoleToken(rid, spots[Object.keys(S.deal.taken).length]);
    S.deal.taken[i] = t.id; tid = t.id;
  });
  const r = role(rid);
  openModal('Karakterini Hatırla', `${bigTok(rid)}
    <p class="deal-ab">${rich(r.ability) || ''}</p>
    <label class="deal-name">İsmini gir (opsiyonel)<input id="dealName" autocomplete="off" maxlength="24"></label>
    <button class="btn primary" id="dealBack">Karakter seçimine geri dön</button>`, body => {
    $('dealName').oninput = e => commit(S => { const t = S.tokens.find(x => x.id === tid); if (t) t.name = e.target.value.trim(); }, true);
    $('dealBack').onclick = dealGrid;
  }, { opaque: true });
}
function goBoard() { if (G.S.open.board) commit(S => { S.open.board = false; }, true); $('secBoard').scrollIntoView({ behavior: 'smooth' }); }

// ---- karakter kağıdı (oyunculara) ----
function openSheet() {
  const ids = scriptIds();
  openModal(esc(G.S.script.name || 'Karakterler'), ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map(t => {
    const list = ids.filter(id => role(id).team === t);
    return list.length ? `<h4 class="t-${t}">${TEAM_PL[t]}</h4>${list.map(id => `<div class="sheet-row">${icon(id, 'ic big')}<div><b>${esc(RN(id))}</b><p>${rich(role(id).ability)}</p></div></div>`).join('')}` : '';
  }).join(''), null, { wide: true });
}

// ---- isim girme: saat yönünde sırayla ----
function nameFlow(startId) {
  const order = clockwise();
  if (!order.length) return toast('Tablada karakter simgesi yok.');
  let i = startId ? Math.max(0, order.findIndex(t => t.id === startId)) : Math.max(0, order.findIndex(t => !t.name));
  const render = () => {
    const t = tokById(order[i].id);
    openModal('Oyuncu isimleri', `
      <div class="name-head">${icon(t.role, 'ic big')}<div><b>${esc(RN(t.role))}</b><span class="muted">${i + 1}. sıra / ${order.length} · saat yönünde</span></div></div>
      <input id="nmIn" class="big-in" value="${esc(t.name)}" placeholder="Oyuncunun ismi" enterkeyhint="next" autocomplete="off" autocapitalize="words" spellcheck="false">
      <div class="row-btns"><button class="btn" id="nmPrev" ${i ? '' : 'disabled'}>‹ Önceki</button><button class="btn primary" id="nmNext">${i < order.length - 1 ? 'Sonraki ›' : 'Bitir'}</button></div>
      <button class="btn ghost small" id="nmDone">Kapat</button>`, () => {
      const inp = $('nmIn'); inp.focus(); inp.select();
      const keep = () => setName(t.id, inp.value);
      $('nmNext').onclick = () => { if (!keep()) return; if (i < order.length - 1) { i++; render(); } else closeModal(); };
      $('nmPrev').onclick = () => { if (!keep()) return; i--; render(); };
      $('nmDone').onclick = () => { if (keep()) closeModal(); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('nmNext').click(); } };
    });
  };
  render();
}
function setName(id, v) {
  v = (v || '').trim();
  const t = tokById(id); if (!t || v === t.name) return true;
  if (v) {
    const k = v.toLocaleLowerCase('tr');
    const d = G.S.tokens.find(q => q.kind === 'role' && q.id !== id && (q.name || '').toLocaleLowerCase('tr') === k);
    if (d) { toast(`"${v}" ismi ${RN(d.role)} simgesinde zaten var.`); return false; }
  }
  commit(S => { S.tokens.find(q => q.id === id).name = v; });
  return true;
}

// ================= 2. GRIMOIRE =================
function openToken(id) {
  const t = tokById(id); if (!t) return closeModal();
  const r = role(t.role);
  const rems = G.S.tokens.filter(x => x.kind === 'rem' && x.owner === t.id);
  const trav = r.team === 'traveller', fab = r.team === 'fabled';
  const pills = rems.length ? `<div class="chips rem-pills">${rems.map(x => `<button class="chip" data-rdel="${x.id}" style="--gc:${colorOf(t.id)}">${esc(remTr(x.text))} <span>✕</span></button>`).join('')}</div>` : '';
  openModal(`${esc(r.name)}`, `
    ${fab ? '' : `<div class="tm-who"><span class="${t.name ? 'who' : 'who none'}">${t.name ? esc(t.name) : 'İsim yok'}</span><button class="ib" id="tmEdit" title="İsmi değiştir" aria-label="İsmi değiştir">✎</button></div>
    <div class="row-in" id="tmEditRow" hidden><input id="tmName" value="${esc(t.name)}" placeholder="İsim" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done">
      <button class="btn small primary" id="tmNameOk">Kaydet</button><button class="btn small" id="tmNameNext" title="Kaydet ve saat yönünde sıradakine geç">Sonraki ›</button></div>`}
    <div class="tm-head t-${r.team}">${icon(t.role, 'ic big')}<div>
      <span class="team">${TEAM_TR[r.team] || r.team}${t.flip ? ' · <b>takımı ters</b>' : ''}${t.dead ? ' · <b>ölü</b>' : ''}</span>
      <p>${rich(r.ability) || '<span class="muted">Yetenek metni yok.</span>'}</p></div></div>
    ${pills}
    <div class="grid2">
      <button class="btn" data-a="show">Göster</button>
      ${fab ? '' : `<button class="btn" data-a="dead">${t.dead ? 'Dirilt' : 'Öldür'}</button>
      <button class="btn" data-a="flip">Döndür (takım)</button>`}
      <button class="btn" data-a="rem">Hatırlatıcı</button>
      <button class="btn" data-a="swap">Değiştir</button>
      ${fab ? '' : `<button class="btn" data-a="vote" ${t.dead ? '' : 'disabled'}>${t.dead ? (t.voteUsed ? 'Ölü oyu: kullandı' : 'Ölü oyu: var') : 'Ölü oyu'}</button>`}
    </div>
    <button class="btn warn wide" data-a="del">Simgeyi kaldır</button>
    ${trav ? '<p class="muted small">Gezginler idam edilmez, sürgün edilir.</p>' : ''}`, body => {
    const save1 = () => setName(t.id, $('tmName').value);
    if (!fab) {
      $('tmEdit').onclick = () => { $('tmEditRow').hidden = !$('tmEditRow').hidden; if (!$('tmEditRow').hidden) { $('tmName').focus(); $('tmName').select(); } };
      $('tmNameOk').onclick = () => { if (save1()) closeModal(); };
      $('tmNameNext').onclick = () => {
        if (!save1()) return;
        const order = clockwise(); const i = order.findIndex(q => q.id === t.id);
        nameFlow(order[(i + 1) % order.length].id);
      };
      $('tmName').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('tmNameOk').click(); } };
    }
    body.onclick = e => {
      const del = e.target.closest('[data-rdel]');
      if (del) { commit(S => { S.tokens = S.tokens.filter(x => x.id !== del.dataset.rdel); }); return openToken(id); }
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'show') { closeModal(); showFull(bigTok(t.role)); }
      if (a === 'dead') {
        const kill = () => commit(S => { const q = tokById(id); q.dead = !q.dead; if (!q.dead) q.voteUsed = false; });
        const fg = boardRoles().find(x => x.role === 'fanggu' && !x.dead && x.id !== id);
        // Fang Gu uyarısı: ilk Yabancı ölümü onu Fang Gu'ya çevirir (Fang Gu ölür)
        if (!t.dead && r.team === 'outsider' && fg && !G.S.fangguDone) {
          return confirmBox(`FANG GU var ve bu bir YABANCI (${r.name}). Fang Gu'nun öldürdüğü İLK Yabancı ölmez: Fang Gu ölür, bu oyuncu kötü takımdan yeni Fang Gu olur. Ne yapılsın?`,
            'Fang Gu\'ya dönüşsün', () => {
              commit(S => { tokById(id).role = 'fanggu'; tokById(fg.id).dead = true; S.fangguDone = true; });
              closeModal(); toast('Dönüştü: eski Fang Gu öldü. Yeni Fang Gu\'ya "SEN" + Fang Gu tokenı göster, başparmağı aşağı.', 6000);
            }, { danger: false, alt: { text: 'Normal öldür (dönüşüm daha önce oldu)', cb: () => { commit(S => { S.fangguDone = true; }, true); kill(); closeModal(); } } });
        }
        kill(); closeModal();
      }
      if (a === 'flip') { commit(S => { const q = tokById(id); q.flip = !q.flip; }); openToken(id); }
      if (a === 'vote') { commit(S => { const q = tokById(id); q.voteUsed = !q.voteUsed; }); openToken(id); }
      if (a === 'rem') pickReminder(id, () => openToken(id));
      if (a === 'swap') pickRole({ title: 'Yeni karakter' }, rid => { commit(S => { tokById(id).role = rid; }); openToken(id); }, () => openToken(id));
      if (a === 'del') confirmBox(`${r.name} simgesi${rems.length ? ' ve bağlı hatırlatıcıları' : ''} kaldırılsın mı?`, 'Kaldır', () => {
        commit(S => { S.tokens = S.tokens.filter(x => x.id !== id && x.owner !== id); });
      });
    };
  });
}

function openRem(id) {
  const t = tokById(id); if (!t) return;
  const owner = t.owner && tokById(t.owner);
  openModal('Hatırlatıcı', `
    <div class="tm-head">${t.role ? icon(t.role, 'ic big') : ''}<div><b>${esc(remTr(t.text))}</b>
      ${t.role ? `<span class="muted">${esc(RN(t.role))}</span>` : ''}
      ${owner ? `<p class="muted small">Bağlı olduğu simge: ${esc(RN(owner.role))}${owner.name ? ` (${esc(owner.name)})` : ''}</p>` : ''}</div></div>
    <div class="grid2"><button class="btn warn" id="rmDel">Kaldır</button><button class="btn" id="rmOk">Kapat</button></div>
    ${owner ? '<button class="btn ghost small" id="rmFree">Simgeden ayır (onunla birlikte taşınmasın)</button>' : ''}`, () => {
    $('rmDel').onclick = () => { commit(S => { S.tokens = S.tokens.filter(x => x.id !== id); }); closeModal(); };
    $('rmOk').onclick = closeModal;
    if (owner) $('rmFree').onclick = () => { commit(S => { tokById(id).owner = null; }); closeModal(); };
  });
}

// ---- rol seçici ----
// o: {title, ids (Tümü kapalıyken liste), team, allowNone, noneText, startAll}
function pickRole(o, cb, back) {
  let all = !!o.startAll, q = '';
  const render = () => {
    const D = G.D;
    let ids = all ? Object.keys(D.roles) : (o.ids || [...new Set([...scriptIds(), ...boardRoles().map(t => t.role)])]);
    if (o.team) ids = ids.filter(id => role(id).team === o.team);
    else ids = ids.filter(id => role(id).team !== 'fabled' || !all);
    if (q) ids = ids.filter(id => RN(id).toLocaleLowerCase('tr').includes(q) || id.includes(q));
    const play = inPlay();
    const groups = TEAMS.map(t => [t, ids.filter(id => role(id).team === t)]).filter(([, l]) => l.length);
    openModal(esc(o.title || 'Karakter seç'), `
      <div class="pick-bar"><input id="pkQ" placeholder="Ara" value="${esc(q)}" autocomplete="off">
        <label class="sw"><input type="checkbox" id="pkAll" ${all ? 'checked' : ''}><i></i>Tümü</label></div>
      ${o.allowNone ? `<button class="btn ghost small" data-rid="">${esc(o.noneText || 'Boş bırak')}</button>` : ''}
      ${groups.map(([t, l]) => `<h4 class="t-${t}">${TEAM_PL[t]}</h4><div class="tok-grid">${l.map(id => `<button class="pk t-${role(id).team}${play.has(id) ? ' inplay' : ''}" data-rid="${id}">${icon(id, 'ic big')}<span>${esc(RN(id))}</span></button>`).join('')}</div>`).join('') || '<p class="muted">Sonuç yok.</p>'}
      <p class="muted small">Çerçeveli olanlar tablada.</p>`, body => {
      const qi = $('pkQ');
      qi.oninput = () => { q = qi.value.toLocaleLowerCase('tr').trim(); const p = qi.selectionStart; render(); const n = $('pkQ'); n.focus(); n.setSelectionRange(p, p); };
      $('pkAll').onchange = e => { all = e.target.checked; render(); };
      body.onclick = e => { const b = e.target.closest('[data-rid]'); if (b) cb(b.dataset.rid); };
    }, { back });
  };
  render();
}

// ---- hatırlatıcı seçici ----
let remAll = false, remMulti = false;
function pickReminder(ownerId, back) {
  const render = () => {
    const play = [...inPlay()];
    const src = remAll ? [...new Set([...play, ...scriptIds()])] : play;
    const items = [];
    const seen = new Set();
    const push = (rid, text) => { const k = rid + '|' + text; if (!seen.has(k)) { seen.add(k); items.push({ rid, text }); } };
    src.forEach(rid => role(rid).reminders.forEach(t => push(rid, t)));
    scriptIds().forEach(rid => role(rid).remindersGlobal.forEach(t => push(rid, t)));
    const owner = ownerId && tokById(ownerId);
    openModal(owner ? `Hatırlatıcı · ${esc(RN(owner.role))}` : 'Hatırlatıcı Seç', `
      <div class="rem-grid">
        <button class="rpk good" data-t="İyi takım" data-g="👍" data-tone="good"><span class="rtxt">${glyphHTML('👍')}</span><svg viewBox="0 0 100 100" aria-hidden="true">${arcText('İyi takım', 'arcB', 13.5)}</svg></button>
        <button class="rpk evil" data-t="Kötü takım" data-g="👎" data-tone="evil"><span class="rtxt">${glyphHTML('👎')}</span><svg viewBox="0 0 100 100" aria-hidden="true">${arcText('Kötü takım', 'arcB', 13.5)}</svg></button>
        ${items.map(x => `<button class="rpk" data-t="${esc(x.text)}" data-r="${x.rid}">${icon(x.rid, 'ic')}<svg viewBox="0 0 100 100" aria-hidden="true">${arcText(RN(x.rid), 'arcT', 13)}${arcText(remTr(x.text), 'arcB', 13.5)}</svg></button>`).join('')}
      </div>
      ${items.length ? '' : '<p class="muted small">Tablada hatırlatıcısı olan karakter yok. "Tüm hatırlatıcıları göster"i aç.</p>'}
      <div class="row-in"><input id="rmCustom" placeholder="Kendi hatırlatıcını yaz"><button class="btn small" id="rmCustomOk">Ekle</button></div>
      <label class="sw"><input type="checkbox" id="rmAll" ${remAll ? 'checked' : ''}><i></i>Tüm hatırlatıcıları göster</label>
      <label class="sw"><input type="checkbox" id="rmMulti" ${remMulti ? 'checked' : ''}><i></i>Birden fazla ekle</label>`, body => {
      $('rmAll').onchange = e => { remAll = e.target.checked; render(); };
      $('rmMulti').onchange = e => { remMulti = e.target.checked; };
      const add = (text, rid, glyph, tone) => {
        commit(S => {
          const o = ownerId && S.tokens.find(x => x.id === ownerId);
          const [x, y] = o ? remSpot(o) : freeSpot('rem');
          S.tokens.push({ id: uid(), kind: 'rem', role: rid || null, text, owner: o ? o.id : null, x, y, glyph: glyph || '', tone: tone || '' });
        });
        if (remMulti) toast(`${remTr(text)} eklendi`); else closeModal();
      };
      $('rmCustomOk').onclick = () => { const v = $('rmCustom').value.trim(); if (v) add(v, null, '✎'); };
      body.querySelector('.rem-grid').onclick = e => { const b = e.target.closest('[data-t]'); if (b) add(b.dataset.t, b.dataset.r, b.dataset.g, b.dataset.tone); };
    }, { back });
  };
  render();
}

// ---- blöfler ----
function renderBluffs() {
  $('bluffs').innerHTML = G.S.bluffs.map((id, i) => id
    ? `<button class="bslot t-${role(id).team}" data-b="${i}">${icon(id, 'ic big')}<span>${esc(RN(id))}</span></button>`
    : `<button class="bslot empty" data-b="${i}"><span class="plus">+</span></button>`).join('');
}
function pickBluff(i) {
  const play = inPlay();
  const used = new Set(G.S.bluffs.filter((x, j) => x && j !== i));
  const ids = scriptIds().filter(id => GOOD.has(role(id).team) && !play.has(id) && !used.has(id));
  pickRole({ title: `${i + 1}. blöf`, ids, allowNone: true, noneText: i > 2 ? 'Bu yuvayı kaldır' : 'Boş bırak' }, rid => {
    commit(S => { if (!rid && i > 2) S.bluffs.splice(i, 1); else S.bluffs[i] = rid || null; });
    closeModal();
  });
}

// ---- tabla araçları ----
function renderToolbar() {
  const b = G.S.board;
  $('boardTools').hidden = !b.tools;
  $('bTools').textContent = b.tools ? '▴ Blöfler ve araçları gizle' : '▾ Blöfler ve araçları göster';
  $('bHide').textContent = b.hidden ? "Grimoire'ı göster" : "Grimoire'ı gizle";
  $('optNums').checked = b.nums;
  $('optRole').value = b.roleScale; $('oRole').textContent = (+b.roleScale).toFixed(2);
  $('optRem').value = b.remScale; $('oRem').textContent = (+b.remScale).toFixed(2);
}
function toggleFull() {
  const w = $('boardWrap'), on = !w.classList.contains('full');
  w.classList.toggle('full', on);
  document.body.classList.toggle('noscroll', on);
  $('wrapFull').textContent = on ? '✕' : '⛶';
  renderBoard();
}

// ================= 3. GECE SIRASI =================
const STRUCT = {
  dusk: ['Alacakaranlık', 'Gece başlar: tüm oyuncular gözlerini kapatır. Varsa önce Gezgin ve Efsanevi etkileri.'],
  minioninfo: ['Minyon bilgisi', '7 ve üzeri oyuncuda: Minyonları uyandır, birbirlerini görsünler. "Bu İblis" kartını göster ve İblis\'i işaret et.'],
  demoninfo: ['İblis bilgisi', '7 ve üzeri oyuncuda: İblis\'i uyandır, "Bunlar Minyonların" kartıyla Minyonları işaret et. Sonra "Bu karakterler oyunda yok" kartıyla 3 blöfü göster.'],
  dawn: ['Şafak', 'Birkaç saniye bekle, herkesi uyandır ve gece ölenleri açıkla (nasıl öldüklerini söyleme).'],
};
function renderNight() {
  const S = G.S, D = G.D, tab = S.night.tab;
  $('secNight').dataset.tab = tab;
  document.querySelectorAll('#nightTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('optDead').checked = S.night.showDead; $('optOut').checked = S.night.showOut;
  const list = tab === 'first' ? D.night.firstNight : D.night.otherNight;
  const toks = boardRoles();
  const script = new Set(scriptIds());
  const done = new Set(S.night.done[tab] || []);
  const players = toks.filter(t => role(t.role).team !== 'fabled' && role(t.role).team !== 'traveller').length;
  let n = 0;
  const rows = [];
  for (const id of list) {
    if (id === 'dusk' || id === 'dawn') continue; // Alacakaranlık / Şafak satırları gösterilmez
    if (STRUCT[id]) {
      const [nm, txt] = STRUCT[id];
      const dim = (id === 'minioninfo' || id === 'demoninfo') && players < 7;
      rows.push(`<div class="ne struct${done.has(id) ? ' done' : ''}${dim ? ' dim' : ''}" data-k="${id}"><span class="ne-ic s-${id}"></span><div><b class="ne-t">${nm}</b><p>${esc(txt)}</p></div></div>`);
      continue;
    }
    const txt = tab === 'first' ? role(id).first : role(id).other;
    if (!txt) continue;
    const mine = toks.filter(t => t.role === id);
    const playing = mine.length > 0;
    if (!playing && !(S.night.showOut && script.has(id))) continue;
    const allDead = playing && mine.every(t => t.dead);
    if (allDead && !S.night.showDead) { n++; continue; }
    const num = playing ? ++n : '';
    const warn = [];
    mine.forEach(t => G.S.tokens.filter(x => x.kind === 'rem' && x.owner === t.id).forEach(x => {
      const nm = x.role ? `${RN(x.role)} – ${remTr(x.text)}` : remTr(x.text);
      warn.push(`<span class="rw" style="--gc:${colorOf(t.id)}">⚠ ${esc(nm)}${mine.length > 1 && t.name ? ` <small>(${esc(t.name)})</small>` : ''}</span>`);
    }));
    if (id === 'fanggu' && playing && !allDead) {
      const outs = toks.filter(t => role(t.role).team === 'outsider' && !t.dead).map(t => `${esc(RN(t.role))}${t.name ? ` (${esc(t.name)})` : ''}`);
      warn.push(S.fangguDone
        ? '<span class="rw fg">✔ Dönüşüm yapıldı: Yabancılar artık normal ölür</span>'
        : `<span class="rw fg">⚠ Yabancı seçerse (ilk kez): Fang Gu ölür, o oyuncu Fang Gu olur!${outs.length ? ' Yabancılar: <b>' + outs.join(', ') + '</b>' : ''}</span>`);
    }
    const who = mine.map(t => `${t.name ? esc(t.name) : '—'}${t.dead ? ' †' : ''}`).join(', ');
    rows.push(`<div class="ne t-${role(id).team}${done.has(id) ? ' done' : ''}${playing ? '' : ' out'}${allDead ? ' dead' : ''}" data-k="${id}">
      ${icon(id, 'ic')}<div><b class="ne-t">${num ? `<span class="nn">${num}</span>` : ''}${esc(RN(id))}${playing && who !== '—' ? ` <small>· ${who}</small>` : ''}</b><p>${rich(txt)}</p>${warn.length ? `<div class="rws">${warn.join('')}</div>` : ''}</div></div>`);
  }
  // Yanında hatırlatıcı token'ı olan tüm roller: en üstte "Hatırlatmalar"
  const rem = [];
  const seenR = new Set();
  toks.forEach(t => {
    if (seenR.has(t.role)) return;
    const mine = toks.filter(x => x.role === t.role);
    const rts = [];
    mine.forEach(m => G.S.tokens.filter(x => x.kind === 'rem' && x.owner === m.id).forEach(x => rts.push({ m, x })));
    if (!rts.length) return;
    seenR.add(t.role);
    const allDead = mine.every(m => m.dead);
    if (allDead && !S.night.showDead) return;
    const chips = rts.map(({ m, x }) => {
      const nm = x.role ? `${RN(x.role)} – ${remTr(x.text)}` : remTr(x.text);
      return `<span class="rw" style="--gc:${colorOf(m.id)}">⚠ ${esc(nm)}${mine.length > 1 && m.name ? ` <small>(${esc(m.name)})</small>` : ''}</span>`;
    }).join('');
    const who = mine.map(m => `${m.name ? esc(m.name) : '—'}${m.dead ? ' †' : ''}`).join(', ');
    rem.push(`<div class="ne t-${role(t.role).team}${done.has(t.role) ? ' done' : ''}${allDead ? ' dead' : ''}" data-k="${t.role}">
      ${icon(t.role, 'ic')}<div><b class="ne-t">${esc(RN(t.role))}${who !== '—' ? ` <small>· ${who}</small>` : ''}</b><div class="rws">${chips}</div></div></div>`);
  });
  if (rem.length) rows.unshift(`<section class="ne-rems"><h4 class="ne-h">Hatırlatmalar <small>· gece sırası değil</small></h4>${rem.join('')}</section>`);
  $('nightList').innerHTML = rows.join('') || '<p class="muted pad">Bu gece uyanan karakter yok.</p>';
}

// Gece sırasında rol açıklaması: herhangi bir yere dokununca kapanır
function rolePop(id) {
  let el = $('rolePop');
  if (!el) {
    el = document.createElement('div'); el.id = 'rolePop'; el.className = 'rpop'; el.hidden = true;
    el.addEventListener('click', () => { el.hidden = true; });
    document.body.appendChild(el);
  }
  const r = role(id);
  el.innerHTML = `<div class="rpop-c t-${r.team}">${icon(id, 'ic big')}<b>${esc(r.name)}</b><span class="team">${TEAM_TR[r.team] || r.team}</span>
    <p>${rich(r.ability) || '<span class="muted">Yetenek metni yok.</span>'}</p><small>Kapatmak için dokun</small></div>`;
  el.hidden = false;
}

// ================= 4. DİĞER =================
const INFOS = [
  ['demon', 'Bu İblis', 'c-evil'], ['minions', 'Bunlar Minyonlarınız', 'c-evil'],
  ['bluffs', 'Bu karakterler oyunda yok', 'c-blue'], ['selected', 'Bu karakter seni seçti', 'c-green'],
  ['player', 'Bu oyuncu şudur', 'c-pink'], ['youare', 'Sen şusun', 'c-purple'],
  ['use', 'Yeteneğini kullanmak istiyor musun?', 'c-brown'], ['choose', 'Bir seçim yap', 'c-brown'],
  ['nom', 'Bugün aday gösterdin mi?', 'c-sand'], ['voted', 'Bugün oy verdin mi?', 'c-sand'],
];
function renderMore() {
  $('infoGrid').innerHTML = INFOS.map(([k, t, c]) => `<button class="btn info ${c}" data-info="${k}">${esc(t)}</button>`).join('')
    + G.S.customInfo.map((t, i) => `<span class="info-c"><button class="btn info c-teal" data-ci="${i}">${esc(t)}</button><button class="ib sm" data-cdel="${i}" aria-label="Sil">✕</button></span>`).join('');
  if (document.activeElement !== $('notes')) $('notes').value = G.S.notes || '';
}
function showInfo(k) {
  const text = INFOS.find(x => x[0] === k)[1];
  const card = (roles = []) => showFull(`<h1>${esc(text)}</h1>${roles.length ? `<div class="show-roles">${roles.map(bigTok).join('')}</div>` : ''}`, 'info-show');
  if (k === 'bluffs') return card(G.S.bluffs.filter(Boolean));
  if (['selected', 'player', 'youare'].includes(k)) return pickRole({ title: text }, rid => { closeModal(); card([rid]); });
  card();
}

// ================= bağlantılar =================
function wire() {
  document.querySelectorAll('.pane-h').forEach(b => b.onclick = () => commit(S => { S.open[b.dataset.pane] = !S.open[b.dataset.pane]; }, true));
  // kurulum
  $('bScript').onclick = openScripts;
  $('bChars').onclick = openChars;
  $('bDeal').onclick = openDeal;
  $('bSheet').onclick = openSheet;
  $('bNames').onclick = () => nameFlow();
  $('bNames2').onclick = () => nameFlow();
  // tabla
  $('wrapLock').onclick = () => { commit(S => { S.board.locked = !S.board.locked; }, true); toast(G.S.board.locked ? 'Karakter simgeleri kilitlendi' : 'Kilit açıldı'); };
  $('wrapUndo').onclick = () => { if (!undo()) toast('Geri alınacak bir şey yok.'); };
  $('wrapFull').onclick = toggleFull;
  $('veil').onclick = () => commit(S => { S.board.hidden = false; }, true);
  $('bTools').onclick = () => commit(S => { S.board.tools = !S.board.tools; }, true);
  $('bHide').onclick = () => commit(S => { S.board.hidden = !S.board.hidden; }, true);
  $('bHeight').onclick = () => commit(S => { S.board.ratio = 0; }, true);
  $('bClear').onclick = () => confirmBox('Tabladaki tüm simgeler, hatırlatıcılar, isimler ve blöfler silinsin mi? (Senaryo ve ayarlar kalır.)', 'Temizle', () => {
    commit(S => { S.tokens = []; S.fangguDone = false; S.bluffs = [null, null, null]; S.night.done = { first: [], other: [] }; });
  });
  $('bAddTok').onclick = () => pickRole({ title: 'Simge ekle' }, rid => { commit(() => { addRoleToken(rid); }); closeModal(); });
  $('bAddTrav').onclick = () => pickRole({ title: 'Gezgin ekle', team: 'traveller' }, rid => { commit(() => { addRoleToken(rid); }); closeModal(); });
  $('bAddFab').onclick = () => pickRole({ title: 'Efsanevi ekle', team: 'fabled', startAll: true }, rid => { commit(() => { addRoleToken(rid); }); closeModal(); });
  $('bAddRem').onclick = () => pickReminder(null);
  $('bluffs').onclick = e => { const b = e.target.closest('[data-b]'); if (b) pickBluff(+b.dataset.b); };
  $('bBluffAdd').onclick = () => commit(S => { S.bluffs.push(null); });
  $('bBluffShow').onclick = () => showInfo('bluffs');
  $('optNums').onchange = e => commit(S => { S.board.nums = e.target.checked; }, true);
  $('optRole').oninput = e => commit(S => { S.board.roleScale = +e.target.value; }, true);
  $('optRem').oninput = e => commit(S => { S.board.remScale = +e.target.value; }, true);
  window.addEventListener('resize', () => { if ($('boardWrap').classList.contains('full')) renderBoard(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('modal').hidden) closeModal(); else if ($('boardWrap').classList.contains('full')) toggleFull(); } });
  // gece
  $('nightTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) commit(S => { S.night.tab = b.dataset.tab; }, true); };
  $('optDead').onchange = e => commit(S => { S.night.showDead = e.target.checked; }, true);
  $('optOut').onchange = e => commit(S => { S.night.showOut = e.target.checked; }, true);
  $('bNightReset').onclick = () => commit(S => { S.night.done[S.night.tab] = []; }, true);
  $('nightList').onclick = e => {
    const row = e.target.closest('[data-k]'); if (!row) return;
    const k = row.dataset.k;
    // sembole dokununca rolün açıklaması (yapıldı işareti değişmez)
    if (!row.classList.contains('struct') && e.target.closest('.ic')) return rolePop(k);
    commit(S => { const d = S.night.done[S.night.tab]; const i = d.indexOf(k); if (i < 0) d.push(k); else d.splice(i, 1); }, true);
  };
  // diğer
  $('infoGrid').onclick = e => {
    const del = e.target.closest('[data-cdel]');
    if (del) return commit(S => { S.customInfo.splice(+del.dataset.cdel, 1); }, true);
    const c = e.target.closest('[data-ci]');
    if (c) return showFull(`<h1>${esc(G.S.customInfo[+c.dataset.ci])}</h1>`, 'info-show');
    const b = e.target.closest('[data-info]'); if (b) showInfo(b.dataset.info);
  };
  $('bInfoAdd').onclick = () => { const v = $('infoNew').value.trim(); if (!v) return; commit(S => { S.customInfo.push(v); }, true); $('infoNew').value = ''; };
  let nt;
  $('notes').oninput = e => { clearTimeout(nt); const v = e.target.value; nt = setTimeout(() => { G.S.notes = v; save(); }, 300); };
  $('bNotesClear').onclick = () => confirmBox('Notlar silinsin mi?', 'Sil', () => commit(S => { S.notes = ''; }));
  $('bExport').onclick = () => {
    const blob = new Blob([JSON.stringify(G.S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `grimoire-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('bImport').onclick = () => $('fImport').click();
  $('fImport').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!s || s.v !== 1 || !Array.isArray(s.tokens)) throw 0;
      confirmBox('Mevcut oyun içe aktarılan dosyayla değiştirilsin mi?', 'Değiştir', () => {
        commit(S => { Object.keys(S).forEach(k => delete S[k]); Object.assign(S, s); });
        load(); emit();
      });
    } catch (err) { toast('Dosya okunamadı.'); }
    e.target.value = '';
  };
  $('bReload').onclick = async () => { toast('Yenileniyor…'); G.D = await loadData(); renderAll(); toast(G.D.offline ? "Sheet'e ulaşılamadı." : 'Güncellendi.'); };
  $('bLogout').onclick = () => confirmBox('Çıkış yapılsın mı? (Oyun bu cihazda kayıtlı kalır.)', 'Çıkış yap', () => auth.signOut(), { danger: false });
}
