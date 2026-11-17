import os, json, sys
R = '/mnt/project-files/app-danh-gia/web-repo'
S = os.path.join(R, 'src')
rd = lambda p: open(p, encoding='utf-8').read()
src = rd(os.path.join(S, 'app.html'))
src = src.replace('/*EXPORT_JS*/', rd(os.path.join(S, 'export.js')))
for i in (1, 2, 3):
    src = src.replace('%%IMG' + str(i) + '%%', rd(os.path.join(S, 'img%d.b64' % i)).strip())

old_fs = "const fileSafe = s => String(s || '').normalize('NFC').replace(/[\\\\/:*?\"<>|]+/g, '').replace(/\\s+/g, '_');"
assert old_fs in src, 'fileSafe not found'
src = src.replace(old_fs, "const fileSafe = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[\\\\/:*?\"<>|,]+/g, '').replace(/\\s+/g, '_');")

# Extra button: reload sample data
old = '<span class="small muted" id="backupMsg"></span></div>'
assert old in src
src = src.replace(old, '<button class="btn" data-act="reset-seed">Nạp lại dữ liệu mẫu</button>' + old)

seed = json.load(open('/mnt/project-files/app-danh-gia/du-lieu-khoi-phuc.json', encoding='utf-8'))
seed_db = {k: seed[k] for k in ('semesters', 'schools', 'classes', 'students', 'lessons', 'records', 'settings') if k in seed}
seed_json = json.dumps(seed_db, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')

libs = ('<script>' + rd(os.path.join(R, 'vendor', 'exceljs.min.js')) + '</script>\n'
        '<script>' + rd(os.path.join(R, 'vendor', 'jszip.min.js')) + '</script>\n'
        '<script id="arkki-seed" type="application/json">' + seed_json + '</script>\n'
        '<script>\n(function(){\n'
        '  window.ARKKI_CONFIG = {};\n'
        '  var KEY = "arkki-local-db";\n'
        '  function seed(){ try { localStorage.setItem(KEY, document.getElementById("arkki-seed").textContent); localStorage.removeItem("arkki-sel"); } catch(e){} }\n'
        '  try { var cur = localStorage.getItem(KEY); if (!cur || cur === "{}") seed(); } catch(e){}\n'
        '  document.addEventListener("click", function(e){ var b = e.target.closest && e.target.closest("[data-act=\\"reset-seed\\"]"); if (!b) return;\n'
        '    if (confirm("Xóa toàn bộ dữ liệu đang có trên máy này và nạp lại dữ liệu mẫu?")) { seed(); location.reload(); } });\n'
        '})();\n</script>')
assert '<!--LIBS-->' in src
page = ('<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<link rel="icon" href="data:image/png;base64,' + rd(os.path.join(S, 'img1.b64')).strip() + '">\n'
        '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'
        + src.replace('<!--LIBS-->', libs) + '\n</body>\n</html>\n')
out = sys.argv[1]
open(out, 'w', encoding='utf-8').write(page)
print('wrote', out, len(page))
