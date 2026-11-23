#!/usr/bin/env python3
"""Biletler Sheet'indeki gelecek etkinlikleri bilet/index.html içine sabit Event JSON-LD olarak yazar (Google için).
Sayfadaki liste yine canlı Sheet'ten çizilir; bu blok sadece arama motorları içindir."""
import json, re, sys, datetime, urllib.request, urllib.parse
SHEET_ID = '1YPP-iufjWHd43YadvrfHkIpvKAFz69_t7sIb_1xt_y8'
URL = f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:json&sheet=' + urllib.parse.quote('Biletler')
PAGE = 'bilet/index.html'
SECTIONS = [(r'blood|botc|clocktower', 'Blood on the Clocktower'), (r'kutu|oyun', 'Kutu Oyunları Gecesi'), (r'quiz', 'Quiz Night')]

def tx(c):
    if not c: return ''
    v = c.get('f') if c.get('f') is not None else c.get('v')
    return '' if v is None else str(v).strip()

def nd(c):
    if not c: return ''
    m = re.match(r'^Date\((\d+),(\d+),(\d+)', str(c.get('v') or ''))
    if m: return f'{int(m[1]):04d}-{int(m[2])+1:02d}-{int(m[3]):02d}'
    x = tx(c)
    m = re.match(r'^(\d{1,2})[./](\d{1,2})[./](\d{4})$', x)
    if m: return f'{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}'
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', x)
    return f'{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}' if m else ''

def nt(c):
    m = re.search(r'(\d{1,2})[:.](\d{2})', tx(c))
    return f'{int(m[1]):02d}:{m[2]}' if m else '20:00'

raw = urllib.request.urlopen(URL, timeout=30).read().decode('utf-8')
j = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
today = (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).date().isoformat()
events = []
for r in j['table']['rows']:
    c = (r.get('c') or []) + [None] * 7
    k, d = tx(c[0]), nd(c[1])
    if not k or not d or d < today: continue
    t, yer, ln, fy, du = nt(c[2]), tx(c[3]), tx(c[4]), tx(c[5]), tx(c[6])
    title = next((n for p, n in SECTIONS if re.search(p, k, re.I)), k)
    ev = {'@type': 'Event', 'name': title + (f' - {yer}' if yer else ''),
          'startDate': f'{d}T{t}:00+03:00',
          'eventStatus': 'https://schema.org/EventScheduled',
          'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
          'location': {'@type': 'Place', 'name': yer or 'Kadıköy, İstanbul',
                       'address': {'@type': 'PostalAddress', 'addressLocality': 'Kadıköy', 'addressRegion': 'İstanbul', 'addressCountry': 'TR'}},
          'image': ['https://taverngames.com.tr/assets/og-botc.jpg' if 'Blood' in title else 'https://taverngames.com.tr/assets/og.jpg'],
          'organizer': {'@type': 'Organization', 'name': 'Tavern Games', 'url': 'https://taverngames.com.tr/'}}
    if re.match(r'^https?://', ln):
        sold = bool(re.search(r'tükendi|dolu', du, re.I))
        o = {'@type': 'Offer', 'url': ln, 'priceCurrency': 'TRY', 'availability': 'https://schema.org/' + ('SoldOut' if sold else 'InStock')}
        p = re.search(r'\d+', fy)
        if p: o['price'] = p[0]
        ev['offers'] = o
    events.append(ev)
events.sort(key=lambda e: e['startDate'])
data = json.dumps(events, ensure_ascii=False).replace('</', '<\\/')
block = f'<!--EVLD--><script type="application/ld+json" id="ev-ld">{data}</script><!--/EVLD-->' if events else '<!--EVLD--><!--/EVLD-->'
s = open(PAGE, encoding='utf-8').read()
s, n = re.subn(r'<!--EVLD-->.*?<!--/EVLD-->', lambda m: block, s, flags=re.S)
if n != 1: sys.exit('EVLD işaretleri bulunamadı')
open(PAGE, 'w', encoding='utf-8').write(s)
print(len(events), 'etkinlik yazıldı')
