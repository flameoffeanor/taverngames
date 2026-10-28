#!/usr/bin/env python3
"""Google Sheet'teki oyun listesini kutu/index.html içine sabit HTML olarak yazar (SEO için).
Sayfadaki JS açılışta aynı listeyi canlı Sheet'ten yeniden çizer; bu blok arama motorları içindir."""
import csv, io, re, sys, html, urllib.request
SHEET_ID = '1eeInnp4_jk19FtBo7oozfdvBzg_jNhiUkEBp8gOP_Tw'
URL = f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&headers=1'
PAGE = 'kutu/index.html'

def norm(s): return re.sub(r'[^a-z0-9ğüşıöç]+', '', (s or '').lower())

raw = urllib.request.urlopen(URL, timeout=30).read().decode('utf-8')
rows = list(csv.reader(io.StringIO(raw)))
seen, games = set(), []
for c in rows:
    c += [''] * 4
    n = c[0].strip()
    if not n or re.fullmatch(r'(?i)oyun|oyunlar', n) or norm(n) in seen: continue
    seen.add(norm(n))
    try: r = float(c[1].replace(',', '.'))
    except ValueError: r = 0
    img = c[2].strip() if re.match(r'https?://', c[2].strip()) else ''
    games.append((n, r, img))
if len(games) < 20: sys.exit('Çok az oyun okundu, yazılmadı.')
games.sort(key=lambda g: re.sub(r'(?i)^the ', '', g[0]).lower())

def card(n, r, img):
    e = html.escape
    im = f'<img src="{e(img)}" alt="{e(n)}" loading="lazy" referrerpolicy="no-referrer">' if img else ''
    rt = f'<div class="gr">★ {r:.1f}</div>' if r else ''
    return f'<div class="gc"><div class="gi">{im}</div><div class="gn">{e(n)}</div>{rt}</div>'

block = '<!--GAMES-->' + ''.join(card(*g) for g in games) + '<!--/GAMES-->'
s = open(PAGE, encoding='utf-8').read()
s, k = re.subn(r'<!--GAMES-->.*?<!--/GAMES-->', lambda m: block, s, flags=re.S)
assert k == 1, 'GAMES işaretleri bulunamadı'
s = re.sub(r'<b id="cnt">\d+</b>', f'<b id="cnt">{len(games)}</b>', s)
open(PAGE, 'w', encoding='utf-8').write(s)
print(len(games), 'oyun yazıldı')
