// Olay kaydının okunur metinleri
import { esc, role, rname, remTr } from './core.js?v=20261023-0042';
import * as store from './store.js?v=20261023-0042';

const RN = id => role(id).name;
const CAUSES = {
  demon: () => 'İblis tarafından öldürüldü', execution: () => 'idam edildi', exile: () => 'sürgün edildi',
  fanggu: () => `${RN('fanggu')} atlamasıyla öldü`, starpass: () => 'İblis devri için öldü', grandmother: () => 'torunu öldüğü için öldü',
  moonchild: () => `${RN('moonchild')} yüzünden öldü`, slayer: () => `${RN('slayer')} tarafından vuruldu`, gunslinger: () => `${RN('gunslinger')} tarafından vuruldu`,
  gnome: () => `${RN('gnome')} tarafından öldürüldü`, harpy: () => `${RN('harpy')} deliliğini bozduğu için öldü`, manual: () => 'öldü',
};
export const CAUSE = new Proxy({}, { get: (_, k) => CAUSES[k]?.() });

export function describe(ev, st) {
  const n = id => esc(st?.players.find(p => p.id === id)?.name || '?');
  const pr = id => { const p = st?.players.find(q => q.id === id); return p ? `${esc(p.name)} (${rname(p.role)})` : '?'; };
  const eff = e => e.type === 'die' ? `${n(e.p)} ${CAUSE[e.cause] || 'öldü'}` : e.type === 'role' ? `${n(e.p)} → ${rname(e.role)}`
    : e.type === 'revive' ? `${n(e.p)} dirildi` : e.type === 'execSurvive' ? `${n(e.p)} idam edildi ama ölmedi` : e.type === 'end' ? `Oyun bitti: ${e.winner === 'good' ? 'İyiler' : 'Kötüler'} kazandı` : '';
  switch (ev.type) {
    case 'start': return `Oyun başladı: <b>${esc(ev.script)}</b>, ${ev.players.length} oyuncu`;
    case 'phase': return `<b>${store.phaseLabel(ev.phase)}</b> başladı`;
    case 'die': return `${pr(ev.p)} ${CAUSE[ev.cause] || 'öldü'}`;
    case 'execSurvive': return `${pr(ev.p)} idam edildi ama ölmedi`;
    case 'revive': return `${n(ev.p)} dirildi`;
    case 'ghost': return ev.value ? `${n(ev.p)} ölü oyunu geri aldı` : `${n(ev.p)} ölü oyunu kullandı`;
    case 'rename': return ev.old ? `${esc(ev.old)} → ${esc(ev.name)} (isim)` : `İsim: ${esc(ev.name)}`;
    case 'role': return `${n(ev.p)}: ${rname(ev.old)} → <b>${rname(ev.role)}</b>`;
    case 'align': return `${n(ev.p)} artık ${ev.evil ? 'kötü' : 'iyi'}`;
    case 'believed': return ev.role ? `${n(ev.p)} kendini ${rname(ev.role)} sanıyor` : `${n(ev.p)}: sandığı rol kaldırıldı`;
    case 'gain': return `${n(ev.p)} ${rname(ev.role)} yeteneğini kazandı`;
    case 'remAdd': return `${n(ev.p)}: <i>${esc(remTr(ev.text))}</i> eklendi${ev.role ? ` (${rname(ev.role)})` : ''}`;
    case 'remDel': return `${n(ev.p)}: <i>${esc(remTr(ev.text))}</i> kaldırıldı`;
    case 'swap': return `${n(ev.a)} ↔ ${n(ev.b)} yer değiştirdi`;
    case 'sides': return 'Masa düzeni değişti';
    case 'ready': return '<b>İlk gece öncesi hazırlık bitti</b>';
    case 'prep': { const [rid, pid] = ev.key.split(':'); return `Hazırlık: ${rname(rid)} ${n(pid)}${ev.value?.targets?.length ? ' → ' + ev.value.targets.filter(Boolean).map(n).join(', ') : ''}${ev.value?.pick ? ` · ${rname(ev.value.pick)}` : ''}`; }
    case 'redherring': return ev.p ? `Kırmızı ringa: ${n(ev.p)}` : 'Kırmızı ringa kaldırıldı';
    case 'amigo': return ev.p ? `${rname('gnome')} amigosu: ${n(ev.p)}` : `${rname('gnome')} amigosu kaldırıldı`;
    case 'bluffs': return `Blöfler: ${ev.bluffs.map(rname).join(', ') || '—'}`;
    case 'addPlayer': return `${esc(ev.p.name)} (${rname(ev.p.role)}, ${ev.p.evil ? 'kötü' : 'iyi'}) masaya katıldı`;
    case 'removePlayer': return `${n(ev.p)} masadan çıktı`;
    case 'end': return `<b>Oyun bitti: ${ev.winner === 'good' ? 'İyiler' : 'Kötüler'} kazandı</b>${ev.reason ? ' · ' + esc(ev.reason) : ''}`;
    case 'act': {
      if (ev.special === 'minioninfo') return 'Minyonlar birbirini ve İblis\'i gördü';
      if (ev.special === 'demoninfo') return 'İblis Minyonlarını ve blöfleri gördü';
      if (ev.special === 'travellerinfo') return 'Kötü gezgin İblis\'i öğrendi';
      const extra = (ev.effects || []).map(eff).filter(Boolean);
      if (ev.special === 'trigger' || ev.special === 'day') return (ev.text ? esc(ev.text) + (extra.length ? ' · ' : '') : '') + extra.join(' · ');
      const who = `<b>${rname(ev.role)}</b> ${n(ev.actor)}`;
      if (ev.skipped) return `${who}: atlandı`;
      let t = who + (ev.targets?.length ? ' → ' + ev.targets.map(n).join(', ') : '');
      if (ev.pick) t += ` · gösterilen: ${rname(ev.pick)}`;
      if (ev.note) t += ` · ${esc(ev.note)}`;
      if (ev.broken?.length) t += ` <span class="bad">(${esc(ev.broken.join(', ').toLocaleLowerCase('tr'))}${ev.applied ? '' : ', etkisiz'})</span>`;
      if (extra.length) t += ' · ' + extra.join(' · ');
      return t;
    }
    default: return esc(ev.type);
  }
}
