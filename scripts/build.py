#!/usr/bin/env python3
"""Build the single-page app.

  python3 scripts/build.py web       -> dist/index.html (+ vendor/, config.js) for GitHub Pages
  python3 scripts/build.py artifact  -> dist/artifact.html (libraries from cdnjs, no Supabase)
"""
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
target = sys.argv[1] if len(sys.argv) > 1 else 'web'
src = open(os.path.join(ROOT, 'src', 'app.html'), encoding='utf-8').read()
src = src.replace('/*EXPORT_JS*/', open(os.path.join(ROOT, 'src', 'export.js'), encoding='utf-8').read())
for i in (1, 2, 3):
    src = src.replace('%%IMG' + str(i) + '%%', open(os.path.join(ROOT, 'src', 'img%d.b64' % i)).read().strip())

dist = os.path.join(ROOT, 'dist')
os.makedirs(dist, exist_ok=True)
if target == 'web':
    libs = ('<script src="vendor/exceljs.min.js"></script>\n<script src="vendor/jszip.min.js"></script>\n'
            '<script src="vendor/supabase.js"></script>\n<script src="config.js"></script>')
    page = ('<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<link rel="icon" href="data:image/png;base64,' + open(os.path.join(ROOT, 'src', 'img1.b64')).read().strip() + '">\n'
            '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'
            + src.replace('<!--LIBS-->', libs) + '\n</body>\n</html>\n')
    open(os.path.join(dist, 'index.html'), 'w', encoding='utf-8').write(page)
    shutil.copytree(os.path.join(ROOT, 'vendor'), os.path.join(dist, 'vendor'), dirs_exist_ok=True)
    shutil.copy(os.path.join(ROOT, 'config.js'), os.path.join(dist, 'config.js'))
    open(os.path.join(dist, '.nojekyll'), 'w').close()
else:
    libs = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>\n'
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>')
    open(os.path.join(dist, 'artifact.html'), 'w', encoding='utf-8').write(src.replace('<!--LIBS-->', libs))
print('built', target)
