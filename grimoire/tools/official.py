"""Resmi BotC verisini (gece sırası, roller, İngilizce gece metinleri) günceller.
Kaynak: https://github.com/ThePandemoniumInstitute/botc-release  (resources/data/)
Kullanım: python3 grimoire/tools/official.py /yol/botc-release
Yeni rol eklenirse adı, takımı ve hatırlatıcıları da eklenir; mevcut alanlar korunur."""
import json, re, sys, os
src = os.path.join(sys.argv[1], 'resources', 'data')
p = os.path.join(os.path.dirname(__file__), '..', 'data', 'official.json')
o = json.load(open(p, encoding='utf-8'))
roles = json.load(open(os.path.join(src, 'roles.json'), encoding='utf-8'))
night = json.load(open(os.path.join(src, 'nightsheet.json'), encoding='utf-8'))
cl = lambda s: re.sub(r'\s*:reminder:', '', s or '').strip()
new = []
for x in roles:
    v = o['roles'].get(x['id'])
    if v is None:
        v = o['roles'][x['id']] = {'remindersGlobal': []}; new.append(x['id'])
    v.update(team=x['team'], name=x['name'], reminders=x.get('reminders', []), setup=x.get('setup', False), edition=x.get('edition', ''))
    if x.get('remindersGlobal'): v['remindersGlobal'] = x['remindersGlobal']
    for k, s in (('fn', 'firstNightReminder'), ('on', 'otherNightReminder'), ('ab', 'ability')):
        if x.get(s): v[k] = cl(x[s]) if k != 'ab' else x[s]
        else: v.pop(k, None)
o['night'] = {'firstNight': night['firstNight'], 'otherNight': night['otherNight']}
json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('roller:', len(o['roles']), '| yeni:', new or 'yok')
