// Alt sayfalar: oyuncu paneli, rol seçici, hatırlatıcı ekleme, menü, gezgin ekleme, masa düzeni, blöfler, kayıt,
// oyuncuya gösterilen tam ekran kartlar.
import { G, hooks, $, esc, rich, role, P, seated, rname, icon, remTr, teamGroups, roleChip, sheet, closeSheet, confirmBox, toast, act } from './core.js?v=20261023-0147';
import { TEAMS, TEAM_TR } from './data.js?v=20261023-0147';
import * as store from './store.js?v=20261023-0147';
import * as rules from './rules.js?v=20261023-0147';
import { sideOfSeat } from './table.js?v=20261023-0147';
import { sidesEditor } from './setup.js?v=20261023-0147';
import { describe } from './describe.js?v=20261023-0147';

const RN = id => role(id).name;
const ctx = () => rules.ctx(G.S, role);

// ---------------- oyuncuya gösterilen tam ekran ----------------
// Sadece token (ve istenirse üstte "Sen" gibi kısa başlık). Dokununca kapanır.
export function showToken(id, { title = '', evil = false } = {}) {
  const el = $('show'), r = role(id);
  el.innerHTML = `<div class="tokonly t-${r.team}">${title ? `<h2>${esc(title)}</h2>` : ''}<div class="bigtok">${icon(id)}<span>${esc(r.name)}</span></div>${evil ? '<div class="thumb">👎</div>' : ''}</div>`;
  el.hidden = false;
}
export function showCard(title, roles = [], sub = '') {
  const el = $('show');
  el.innerHTML = `<div class="show-in"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}
    <div class="show-roles">${roles.map(id => `<div class="bigtok sm t-${role(id).team}">${icon(id)}<span>${esc(RN(id))}</span></div>`).join('')}</div></div>`;
  el.hidden = false;
}
$('show').addEventListener('click', () => { $('show').hidden = true; });

// ---------------- rol seçici ----------------
// opts: {allowNone, only: takım}
export function pickRole(title, cb, back, opts = {}) {
  const S = G.S;
  let all = false, q = '';
  const render = () => {
    const D = G.D;
    let ids = all ? Object.keys(D.roles).filter(id => D.roles[id].team !== 'reminder') : (S?.scriptRoles || Object.keys(D.roles));
    if (opts.only) ids = (all ? Object.keys(D.roles) : [...new Set([...(S?.scriptRoles || []), ...seated().map(p => p.role)])]).filter(id => role(id).team === opts.only);
    ids = ids.filter(id => !q || role(id).name.toLocaleLowerCase('tr').includes(q));
    if (opts.exclude) ids = ids.filter(id => !opts.exclude.has(id));
    const g = teamGroups(ids);
    const inPlay = new Set(S ? seated().map(p => p.role) : []);
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>${esc(title)}</h3></div>
      <div class="tabs"><button class="${all ? '' : 'on'}" id="tS">Script</button><button class="${all ? 'on' : ''}" id="tA">Tümü</button>
      <input id="q" placeholder="Ara" value="${esc(q)}"></div>
      ${opts.allowNone ? '<button class="btn small" data-rid="">Hiçbiri</button>' : ''}
      ${TEAMS.filter(t => g[t]?.length).map(t => `<h4 class="t-${t}">${TEAM_TR[t]}</h4><div class="chips">${g[t].map(id => roleChip(id, { attr: `data-rid="${id}"`, on: inPlay.has(id) })).join('')}</div>`).join('')}
      <p class="muted small">Çerçeveli olanlar oyunda.</p>`, render);
    $('bk').onclick = back || closeSheet;
    $('tS').onclick = () => { all = false; render(); };
    $('tA').onclick = () => { all = true; render(); };
    const qi = $('q'); qi.oninput = () => { q = qi.value.toLocaleLowerCase('tr'); const pos = qi.selectionStart; render(); const n = $('q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-rid]'); if (b) cb(b.dataset.rid); };
  };
  render();
}

// ---------------- hatırlatıcı ekle ----------------
// Resmi hatırlatıcı adı → motor etiketi
const OFFICIAL_TAG = { Poisoned: 'poison', Drunk: 'drunk', Safe: 'protect', 'Survives Execution': 'safe', Mad: 'mad', '2nd': 'harpy2',
  'Red Herring': 'redherring', Grandchild: 'grandchild', 'No Ability': 'noability', 'Negative Vote': 'negvote', '3 Attacks': 'po3',
  'Is The Demon': 'swdemon', Amigo: 'amigo', '3 Votes': 'vote3', Master: 'master', Alive: 'revived' };
export function pickReminder(pid, back) {
  const S = G.S, p = P(pid);
  const playing = new Set(seated().map(q => q.role));
  const ids = [...new Set([...seated().map(q => q.role), ...seated().map(q => q.believed).filter(Boolean), ...S.scriptRoles])];
  const rows = [];
  ids.forEach(id => [...(role(id).reminders || []), ...(role(id).remindersGlobal || [])].forEach(t => { if (!rows.some(r => r.role === id && r.text === t)) rows.push({ role: id, text: t }); }));
  rows.sort((a, b) => playing.has(b.role) - playing.has(a.role));
  const common = [['poison', 'Zehirli'], ['drunk', 'Sarhoş'], ['protect', 'Korunuyor'], ['safe', 'İdamda ölmez'], ['mad', 'Deli'], ['noability', 'Yeteneği yok']];
  sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Hatırlatıcı: ${esc(p.name)}</h3></div>
    <div class="row-in"><input id="cr" placeholder="Kendi notun"><button class="btn small" id="crOk">Ekle</button></div>
    <h4>Sık kullanılan</h4><div class="rem-list">${common.map(([tg, t]) => `<button class="rem big tg-${tg}" data-t="${t}" data-tag="${tg}" data-r="">${t}</button>`).join('')}</div>
    <h4>Rollerin hatırlatıcıları</h4>
    <div class="rem-list">${rows.map(x => `<button class="rem big${playing.has(x.role) ? '' : ' dim'}" data-t="${esc(remTr(x.text))}" data-tag="${OFFICIAL_TAG[x.text] || ''}" data-r="${x.role}">${icon(x.role)}${esc(RN(x.role))}: ${esc(remTr(x.text))}</button>`).join('')}</div>`, null);
  $('bk').onclick = back;
  const add = (text, r, tag) => {
    // kaynak: o role sahip tek oyuncu (zehirci ölünce zehrin düşmesi için)
    const owners = r ? seated().filter(q => q.role === r) : [];
    act('remAdd', { p: pid, rid: store.newId(), role: r || null, text, tag: tag || rules.tagFromText(text), src: owners.length === 1 ? owners[0].id : null }, `${p.name}: ${text}`);
    back();
  };
  $('crOk').onclick = () => { const v = $('cr').value.trim(); if (v) add(v, null, null); };
  $('sheetBody').onclick = e => { const b = e.target.closest('[data-t]'); if (b) add(b.dataset.t, b.dataset.r, b.dataset.tag); };
}

// ---------------- oyuncu paneli (uzun basma) ----------------
// İsim: yaz, ✓ ile saat yönünde sıradaki oyuncuya geç (kurulumda isimler masada girilir)
// Aynı isim başka oyuncuda varsa kaydetmez, o oyuncuyu döndürür
function dupOf(pid, v) { const k = v.toLocaleLowerCase('tr'); return G.S.players.find(q => q.id !== pid && !q.unnamed && !q.gone && q.name.trim().toLocaleLowerCase('tr') === k); }
function saveName(pid, v) {
  const q = P(pid); v = (v || '').trim();
  if (!q || !v || (v === q.name && !q.unnamed)) return true;
  const d = dupOf(pid, v);
  if (d) { toast(`"${v}" ismi zaten var (${G.S.seats.indexOf(d.id) + 1}. koltuk). Farklı yaz.`); return false; }
  act('rename', { p: pid, name: v, old: q.unnamed ? '' : q.name });
  return true;
}
export function openPlayer(pid, opt = {}) {
  let editing = !!opt.name;
  const render = () => {
    const S = G.S, p = P(pid); if (!p) return closeSheet();
    const seatNo = S.seats.indexOf(pid) + 1;
    const old = $('pName'), keep = old && old.dataset.pid === pid && document.activeElement === old ? old.value : null;
    const c = ctx(), r = role(p.role), day = S.phase.kind === 'day', trav = r.team === 'traveller' || p.traveller;
    const br = c.broken(p), evil = c.isEvil(p);
    const nameHTML = editing
      ? `<span class="name-row"><input id="pName" data-pid="${pid}" value="${p.unnamed ? '' : esc(p.name)}" placeholder="${seatNo}. oyuncunun ismi" enterkeyhint="done" autocomplete="off" autocapitalize="words" spellcheck="false"><button class="btn primary small" data-p="nameOk">✓</button></span>`
      : `<span class="pname${p.unnamed ? ' unnamed' : ''}">${p.unnamed ? `${seatNo}. koltuk` : esc(p.name)}</span><button class="pen" data-p="nameEdit" aria-label="İsmi değiştir">✎</button>`;
    sheet(`<div class="pp-head t-${r.team}">${icon(p.role)}
        <div><h3>${esc(r.name)}</h3>
        <div class="nm-line">${nameHTML}</div>
        <div class="team">${TEAM_TR[r.team] || r.team} · ${evil ? 'Kötü' : 'İyi'}${p.dead ? ' · <b>Ölü</b>' : ''}${p.dead && p.ghost ? ' · ölü oyu var' : ''}</div>
        ${p.believed ? `<div class="bel-line">Kendini <b>${esc(RN(p.believed))}</b> sanıyor</div>` : ''}
        ${p.gain ? `<div class="bel-line">Yeteneği: <b>${esc(RN(p.gain))}</b></div>` : ''}
        ${br.map(b => `<div class="note">⚠ ${esc(b.kind)}${b.by ? ` (${esc(P(b.by)?.name || '')})` : ''}</div>`).join('')}</div>
        <button class="ib" data-act="close">✕</button></div>
      <div class="ability">${rich(r.ability) || '<span class="muted">Yetenek metni yok.</span>'}</div>
      ${p.believed ? `<div class="ability bel"><b>${esc(RN(p.believed))}:</b> ${rich(role(p.believed).ability)}</div>` : ''}
      <h4>Hatırlatıcılar</h4>
      ${p.reminders.length ? `<div class="rem-rows">${p.reminders.map(x => {
        const on = c.active(x, p), tg = rules.tagOf(x);
        return `<div class="rem-row${tg ? ' tg-' + tg : ''}${on ? '' : ' off'}">${x.role ? icon(x.role) : ''}<span>${esc(remTr(x.text))}${x.src && x.src !== p.id ? ` <small>(${esc(P(x.src)?.name || '')})</small>` : ''}${on ? '' : ' <small>· etkisiz</small>'}</span><button class="btn small danger" data-rdel="${x.id}">✕ Kaldır</button></div>`; }).join('')}</div>` : '<p class="muted small">Yok.</p>'}
      <button class="btn wide" data-p="remAdd">🔖 Hatırlatıcı ekle</button>
      <div class="grid2">
        <button class="btn" data-p="showown">👁 Tokenini göster</button>
        <button class="btn" data-p="showany">👁 Başka token göster</button>
        ${p.dead ? `<button class="btn" data-p="revive">Dirilt</button><button class="btn" data-p="ghost">${p.ghost ? 'Ölü oyunu kullandı' : 'Ölü oyu geri ver'}</button>`
          : `${day ? `<button class="btn danger" data-p="exec">${trav ? '🚶 Sürgün et' : '⚖ İdam et'}</button>` : ''}<button class="btn danger" data-p="die">☠ Öldü</button>`}
        <button class="btn" data-p="role">Rolü değiştir</button>
        <button class="btn" data-p="believed">Sandığı rol${p.believed ? ' ✓' : ''}</button>
        <button class="btn" data-p="align">${evil ? 'İyi yap' : 'Kötü yap'}</button>
        ${trav || S.pre ? '<button class="btn" data-p="leave">Masadan çıkar</button>' : ''}
      </div>`, render);
    const inp = $('pName');
    // ✓: kaydet; ismi girilmemiş oyuncu kaldıysa saat yönünde sıradakine geç
    const nameOk = () => {
      if (!saveName(pid, inp.value)) { inp.focus(); inp.select(); return; }
      if (G.S.players.some(q => !q.gone && q.unnamed)) {
        const seats = G.S.seats, nx = seats[(seats.indexOf(pid) + 1) % seats.length];
        return openPlayer(nx, { name: true });
      }
      editing = false; render();
    };
    if (inp) {
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); nameOk(); } };
      if (keep != null) inp.value = keep;
      inp.focus();
    }
    $('sheetBody').onclick = e => {
      const b = e.target.closest('[data-p],[data-rdel]'); if (!b) return;
      const k = b.dataset.p;
      if (k === 'nameOk') return nameOk();
      if (k === 'nameEdit') { editing = true; return render(); }
      if (b.dataset.rdel) { const x = p.reminders.find(r => r.id === b.dataset.rdel); if (x) act('remDel', { p: pid, rid: x.id, text: x.text }, `${p.name}: ${remTr(x.text)} kaldırıldı`); return; }
      if (k === 'showown') { closeSheet(); return showToken(p.believed || p.role); }
      if (k === 'showany') return pickRole('Hangi token gösterilsin?', id => { closeSheet(); showToken(id); }, render);
      if (k === 'exec') { closeSheet(); return hooks.execute(pid); }
      if (k === 'die') return confirmBox('Öldü mü?', `<b>${esc(p.name)}</b> (${esc(r.name)}) ölü olarak işaretlenecek.`, '☠ Öldü', () => {
        const before = G.S; act('die', { p: pid, cause: 'manual' }, `${p.name} öldü`); closeSheet(); hooks.afterEffects([{ p: pid, cause: 'manual' }], before); }, true);
      if (k === 'revive') return confirmBox('Diriltilsin mi?', `<b>${esc(p.name)}</b> yeniden canlanacak.`, 'Dirilt', () => { act('revive', { p: pid }, `${p.name} dirildi`); render(); });
      if (k === 'ghost') return act('ghost', { p: pid, value: !p.ghost }, p.ghost ? `${p.name} ölü oyunu kullandı` : `${p.name}: ölü oyu geri verildi`);
      if (k === 'align') return act('align', { p: pid, evil: !evil }, `${p.name} artık ${evil ? 'iyi' : 'kötü'}`);
      if (k === 'leave') return confirmBox('Masadan çıksın mı?', `<b>${esc(p.name)}</b> masadan kalkacak. Kayıtta kalır.`, 'Çıkar', () => { act('removePlayer', { p: pid, side: sideOfSeat(G.S.seats.indexOf(pid), G.S.sides) }, `${p.name} masadan çıktı`); closeSheet(); }, true);
      if (k === 'rename') return askText('Yeni isim', p.name, n => { if (n && n !== p.name) act('rename', { p: pid, name: n, old: p.name }, 'İsim değişti'); render(); }, render);
      if (k === 'role') return pickRole('Yeni rol', id => confirmBox('Rol değişsin mi?', `<b>${esc(p.name)}</b>: ${esc(r.name)} → <b>${esc(RN(id))}</b>`, 'Değiştir', () => { act('role', { p: pid, role: id, old: p.role }, `${p.name} artık ${RN(id)}`); render(); }), render);
      if (k === 'believed') return pickRole('Kendini hangi rol sanıyor?', id => { act('believed', { p: pid, role: id }, id ? `${p.name} kendini ${RN(id)} sanıyor` : `${p.name}: sandığı rol kaldırıldı`); render(); }, render, { allowNone: true });
      if (k === 'remAdd') return pickReminder(pid, render);
    };
  };
  render();
}

// Basit yazı girişi (prompt yerine)
function askText(title, value, ok, back) {
  sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>${esc(title)}</h3></div>
    <input id="askIn" value="${esc(value || '')}" autocomplete="off"><div class="nav-row"><button class="btn primary" id="askOk">Tamam</button></div>`);
  const i = $('askIn'); setTimeout(() => i.focus(), 50);
  $('bk').onclick = back || closeSheet;
  $('askOk').onclick = () => ok(i.value.trim());
  i.onkeydown = e => { if (e.key === 'Enter') ok(i.value.trim()); };
}

// ---------------- menü ----------------
export function openMenu() {
  const S = G.S;
  const render = () => sheet(`<div class="sh-head"><h3>Menü</h3><button class="ib" data-act="close">✕</button></div>
    <div class="list">
      <button class="row-btn" id="mLog"><b>Kayıt</b><small>Olay geçmişi, geri alma</small></button>
      <button class="row-btn" id="mSteps"><b>Gece sırası</b><small>Bu gecenin adımları</small></button>
      <button class="row-btn" id="mTrav"><b>${G.S.pre ? 'Oyuncu ekle' : 'Gezgin ekle'}</b><small>${G.S.pre ? 'Son dakika gelen: rolünü seç, masaya eklenir. Çıkarmak için tokena basılı tut → Masadan çıkar' : 'Sonradan gelen oyuncu'}</small></button>
      <button class="row-btn" id="mShow"><b>Oyuncuya göster</b><small>Token ya da bilgi kartı</small></button>
      <button class="row-btn" id="mBluffs"><b>Blöfler</b><small>${S.bluffs.length ? S.bluffs.map(rname).join(', ') : 'İblis\'e gösterilen 3 rol'}</small></button>
      <button class="row-btn" id="mEdit"><b>Yerleri düzenle</b><small>Oyuncuları sürükleyerek yerleştir</small></button>
      <button class="row-btn" id="mSides"><b>Masa düzeni</b><small>Kenar başına koltuk sayısı</small></button>
      <button class="row-btn" id="mEnd"><b>Oyunu bitir</b><small>${S.result ? 'Bitti: ' + (S.result.winner === 'good' ? 'İyiler' : 'Kötüler') : 'Kazananı işaretle'}</small></button>
      <button class="row-btn" id="mNew"><b>Yeni oyun</b><small>Bu oyun arşive alınır</small></button>
      <button class="row-btn" id="mOut"><b>Çıkış yap</b><small>${esc(firebase.auth().currentUser?.email || '')}</small></button>
    </div><p class="muted small">Sürüm ${esc(hooks.version())} · Karakter verisi: ${new Date(G.D.at).toLocaleString('tr-TR')}${G.D.offline ? ' (kayıtlı kopya)' : ''}</p>`, render);
  render();
  $('mLog').onclick = openLog;
  $('mSteps').onclick = () => hooks.openSteps();
  $('mEdit').onclick = () => { G.edit = true; closeSheet(); hooks.closeDrawer?.(); hooks.renderAll(); };
  $('mTrav').onclick = () => (G.S.pre ? addPrePlayer() : addTraveller());
  $('mShow').onclick = openShowMenu;
  $('mSides').onclick = openSides;
  $('mBluffs').onclick = openBluffs;
  $('mEnd').onclick = () => {
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Kim kazandı?</h3></div><div class="grid2"><button class="btn" data-w="good">İyiler</button><button class="btn danger" data-w="evil">Kötüler</button></div>`);
    $('bk').onclick = openMenu;
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-w]'); if (b) { act('end', { winner: b.dataset.w, reason: 'Hikaye Anlatıcısı bitirdi' }, 'Oyun bitti'); closeSheet(); } };
  };
  $('mNew').onclick = () => confirmBox('Yeni oyun?', 'Mevcut oyun kapanır ve arşive alınır.', 'Yeni oyun', () => { closeSheet(); store.reset(); }, true);
  $('mOut').onclick = () => confirmBox('Çıkış yapılsın mı?', 'Oyun bu cihazda kayıtlı kalır.', 'Çıkış', () => { closeSheet(); firebase.auth().signOut(); });
}

function openShowMenu() {
  const marks = hooks.marks();
  sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Oyuncuya göster</h3></div><div class="list">
    <button class="row-btn" id="sTok"><b>👁 Bir token</b><small>Sadece token</small></button>
    ${Object.entries(marks).map(([k, v]) => `<button class="row-btn" data-mk2="${k}"><b>${esc(v)}</b></button>`).join('')}
    <button class="row-btn" id="custom"><b>Özel metin…</b></button></div>`);
  $('bk').onclick = openMenu;
  $('sTok').onclick = () => pickRole('Hangi token?', id => { closeSheet(); showToken(id); }, openShowMenu);
  $('custom').onclick = () => askText('Gösterilecek metin', '', t => { if (t) { closeSheet(); showCard(t); } }, openShowMenu);
  $('sheetBody').onclick = e => {
    const b = e.target.closest('[data-mk2]'); if (!b) return;
    const k = b.dataset.mk2, t = marks[k];
    if (k === 'THESE CHARACTERS ARE NOT IN PLAY') { closeSheet(); return showCard(t, G.S.bluffs); }
    if (k === 'YOU ARE' || k === 'THIS PLAYER IS' || k === 'THIS CHARACTER SELECTED YOU') return pickRole(t + ': hangi rol?', id => { closeSheet(); k === 'THIS CHARACTER SELECTED YOU' ? showCard(t, [id]) : showToken(id, { title: t }); }, openShowMenu);
    closeSheet(); showCard(t);
  };
}

// ---------------- gezgin ekle ----------------
// İlk gece öncesi: herhangi bir rolle oyuncu ekle (isim sonra tokena basılı tutarak)
function addPrePlayer() {
  pickRole('Yeni oyuncunun rolü', id => {
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>${esc(RN(id))} · kimin solunda oturuyor?</h3></div>
      <p class="muted small">Saat yönünde ondan sonra eklenir. Sonra sürükleyerek de yerini değiştirebilirsin.</p>
      <div class="list">${seated().map(p => `<button class="row-btn" data-af="${p.id}"><b>${esc(p.name)}</b><small>${esc(RN(p.role))}</small></button>`).join('')}</div>`);
    $('bk').onclick = () => addPrePlayer();
    $('sheetBody').onclick = e => {
      const b = e.target.closest('[data-af]'); if (!b) return;
      const side = sideOfSeat(G.S.seats.indexOf(b.dataset.af), G.S.sides), nid = 'n' + store.newId();
      const trav = role(id).team === 'traveller';
      act('addPlayer', { p: { id: nid, name: String(G.S.players.length + 1), unnamed: true, role: id, evil: trav ? false : null, traveller: trav }, after: b.dataset.af, side }, `${RN(id)} masaya eklendi`);
      closeSheet();
    };
  }, openMenu);
}

export function addTraveller() {
  pickRole('Gezgin rolü', id => {
    askText('Oyuncunun adı', '', name => {
      if (!name) return closeSheet();
      let evil = false, amigo = null;
      const render = () => {
        sheet(`<div class="sh-head"><h3>${esc(name)} · ${esc(RN(id))}</h3></div>
          <h4>Takımı (sen seçersin; çoğunlukla iyi)</h4><div class="grid2"><button class="btn ${evil ? '' : 'on-sel'}" data-al="0">İyi</button><button class="btn ${evil ? 'on-sel' : ''}" data-al="1">Kötü</button></div>
          ${evil ? `<p class="info">Kötü gezgin İblis'i öğrenir: ${esc(seated().filter(p => ctx().team(p) === 'demon').map(p => p.name).join(', ') || '?')} (Minyonları öğrenmez).</p>` : ''}
          <h4>Kimin solunda oturuyor? (saat yönünde ondan sonra)</h4>
          <div class="list">${seated().map(p => `<button class="row-btn" data-af="${p.id}"><b>${esc(p.name)}</b><small>${esc(RN(p.role))}</small></button>`).join('')}</div>`);
        $('sheetBody').onclick = e => {
          const a = e.target.closest('[data-al]');
          if (a) { evil = a.dataset.al === '1'; return render(); }
          const b = e.target.closest('[data-af]'); if (!b) return;
          const side = sideOfSeat(G.S.seats.indexOf(b.dataset.af), G.S.sides), nid = 't' + store.newId();
          act('addPlayer', { p: { id: nid, name, role: id, evil }, after: b.dataset.af, side }, `${name} masaya katıldı`);
          closeSheet();
          const notes = [`Herkese duyur: ${name} gezgin olarak katıldı, rolü ${RN(id)}. (Takımını söyleme.)`];
          if (evil) notes.push(`Kötü gezgin: ${name} gizlice İblis'i öğrenir (Minyonları öğrenmez).`);
          if (id === 'apprentice') notes.push(`${RN('apprentice')}: ilk gecesinde yetenek kazanır (gece sırasında en başta uyanır).`);
          if (id === 'gnome') notes.push(`${RN('gnome')}: bir amigo seç ve herkese duyur (oyuncu paneli → Hatırlatıcı ekle → Amigo).`);
          sheet(`<h3>${esc(name)} katıldı</h3>${notes.map(n => `<p class="info">${esc(n)}</p>`).join('')}<button class="btn wide" data-act="close">Tamam</button>`);
        };
      };
      render();
    }, () => addTraveller());
  }, openMenu, { only: 'traveller' });
}

function openSides() {
  const sd = { ...G.S.sides }, n = G.S.seats.length;
  const render = () => {
    const sum = Object.values(sd).reduce((a, b) => a + b, 0);
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Masa düzeni</h3></div>${sidesEditor(sd)}
      <p class="${sum === n ? 'muted' : 'warn'}">Toplam: ${sum}/${n}</p>
      <button class="btn primary wide" id="sOk" ${sum === n ? '' : 'disabled'}>Uygula</button>`, null);
    $('bk').onclick = openMenu;
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-side]'); if (b) { sd[b.dataset.side] = Math.max(0, sd[b.dataset.side] + +b.dataset.d); render(); } };
    $('sOk').onclick = () => { act('sides', { sides: { ...sd } }, 'Masa düzeni değişti'); closeSheet(); };
  };
  render();
}

function openBluffs() {
  const sel = [...G.S.bluffs];
  const render = () => {
    const inPlay = new Set([...seated().map(p => p.role), ...seated().map(p => p.believed).filter(Boolean)]);
    const opts = G.S.scriptRoles.filter(id => ['townsfolk', 'outsider'].includes(role(id).team) && !inPlay.has(id));
    const g = teamGroups(opts);
    sheet(`<div class="sh-head"><button class="ib" id="bk">‹</button><h3>Blöfler <small class="muted">${sel.length}/3</small></h3></div>
      ${['townsfolk', 'outsider'].filter(t => g[t].length).map(t => `<h4 class="t-${t}">${TEAM_TR[t]}</h4><div class="chips">${g[t].map(id => roleChip(id, { on: sel.includes(id), attr: `data-b="${id}"` })).join('')}</div>`).join('')}
      <button class="btn primary wide" id="bOk">Kaydet</button>`, null);
    $('bk').onclick = openMenu;
    $('sheetBody').onclick = e => { const b = e.target.closest('[data-b]'); if (!b) return; const i = sel.indexOf(b.dataset.b); if (i >= 0) sel.splice(i, 1); else if (sel.length < 3) sel.push(b.dataset.b); render(); };
    $('bOk').onclick = () => { act('bluffs', { bluffs: [...sel] }, 'Blöfler kaydedildi'); closeSheet(); };
  };
  render();
}

// ---------------- kayıt ----------------
export function openLog() {
  let showSeat = false;
  const render = () => {
    const S = G.S, groups = [];
    S.log.forEach((x, i) => {
      if (!showSeat && (x.ev.type === 'swap' || x.ev.type === 'sides')) return;
      const st = x.before || S, label = store.phaseLabel(x.phase);
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
      groups[groups.length - 1].items.push({ ...x, i, html: describe(x.ev, x.ev.type === 'start' ? S : st) });
    });
    sheet(`<div class="sh-head"><h3>Oyun kaydı</h3><button class="ib" data-act="close">✕</button></div>
      <label class="tgl"><input type="checkbox" id="lSeat" ${showSeat ? 'checked' : ''}> Yer değişikliklerini göster</label>
      ${groups.map(g => `<h4>${g.label}</h4><ol class="log">${g.items.map(x => `<li><span>${x.html}</span>${x.i > 0 ? `<button class="link" data-back="${x.id}" title="Bu adımı ve sonrasını geri al">↶</button>` : ''}</li>`).join('')}</ol>`).join('')}`, render);
    $('lSeat').onchange = e => { showSeat = e.target.checked; render(); };
    $('sheetBody').onclick = e => {
      const b = e.target.closest('[data-back]'); if (!b) return;
      const idx = G.S.log.findIndex(x => x.id === b.dataset.back), cnt = G.S.log.length - idx;
      confirmBox('Geri alınsın mı?', `Bu adım ve sonrasındaki <b>${cnt}</b> kayıt silinecek.`, 'Geri al', () => { store.undoTo(b.dataset.back); render(); }, true);
    };
    const sb = $('sheetBody'); sb.scrollTop = sb.scrollHeight;
  };
  render();
}
