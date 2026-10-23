#!/usr/bin/env python3
"""Sürüm damgası: tüm modül içe aktarımlarına, CSS'e ve veri dosyasına ?v=SÜRÜM ekler.
Tarayıcı eski dosyaları önbellekten çalıştırmasın diye her yayından önce çalıştır:
    python3 grimoire/tools/stamp.py
"""
import re, json, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d-%H%M')
imp = re.compile(r"""(from\s+['"]\./[\w-]+\.js)(\?v=[^'"]*)?(['"])""")
for f in (root / 'js').glob('*.js'):
    s = f.read_text(encoding='utf-8')
    s2 = imp.sub(lambda m: f"{m.group(1)}?v={v}{m.group(3)}", s)
    s2 = re.sub(r"export const VERSION = '[^']*';", f"export const VERSION = '{v}';", s2)
    s2 = re.sub(r"data/official\.json(\?v=[^'\"]*)?", f"data/official.json?v={v}", s2)
    if s2 != s: f.write_text(s2, encoding='utf-8')
idx = root / 'index.html'
s = idx.read_text(encoding='utf-8')
s = re.sub(r'grim\.css(\?v=[^"]*)?"', f'grim.css?v={v}"', s)
s = re.sub(r'js/app\.js(\?v=[^"]*)?"', f'js/app.js?v={v}"', s)
idx.write_text(s, encoding='utf-8')
(root / 'version.json').write_text(json.dumps({'v': v}), encoding='utf-8')
print('sürüm', v)
