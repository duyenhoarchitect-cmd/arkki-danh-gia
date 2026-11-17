"""Build the sample lesson library (thu-vien-mau.json) from Arkki's own Excel files.

  python scripts/make_library_seed.py <folder with the Excel files> [out.json]

Reads:
  02-Arkki-Các tiêu chí nhận xét.xlsx           -> modules and lessons (sheet "Tiêu chí nhận xét theo từng dự án")
  Thuviennhanxetmamnon_Clover hk2_level*.xlsx   -> daily comments per lesson, end-of-term comments, suggestions, quick lines
Lessons of the sample data (du-lieu-khoi-phuc.json) that have no library entry yet are added as empty lessons.

Library shape (stored in settings/library):
  { modules:  [{id, name, order}],
    lessons:  [{id, moduleId, order, code, name, classes:[...], goal}],
    comments: [{id, kind: daily|final|suggest|quick, lessonId?, comp?, level, text}] }
"""
import glob, hashlib, json, os, re, sys, unicodedata
import openpyxl

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'thu-vien-mau.json')
COMPS = {'C01': 'Chú tâm vào mục tiêu', 'C02': 'Hợp tác', 'C03': 'Kiên định', 'C04': 'Tò mò', 'C05': 'Tưởng tượng'}


def fold(s):
    s = unicodedata.normalize('NFD', str(s or '')).replace('đ', 'd').replace('Đ', 'D')
    return re.sub(r'\s+', ' ', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).lower().strip()


def hid(*parts):
    return hashlib.sha1('|'.join(map(str, parts)).encode('utf-8')).hexdigest()[:10]


def clean(s):
    return re.sub(r'\s*/\s*$', '', re.sub(r'\s+', ' ', str(s or '').replace('\n', ' / '))).strip(' /')


lib = {'modules': [], 'lessons': [], 'comments': []}
seen = set()


def module(name, order):
    m = {'id': 'm' + hid(name), 'name': name, 'order': order}
    lib['modules'].append(m)
    return m


def lesson(mod, order, name, classes, code='', goal=''):
    for l in lib['lessons']:
        if fold(l['name']) == fold(name) and l['moduleId'] == mod['id']:
            return l
    l = {'id': 'l' + hid(mod['id'], name), 'moduleId': mod['id'], 'order': order, 'code': code, 'name': name, 'classes': classes, 'goal': goal}
    lib['lessons'].append(l)
    return l


def comment(kind, level, text, lessonId='', comp=''):
    text = re.sub(r'\s+', ' ', str(text or '')).strip()
    key = (kind, lessonId, comp, level, fold(text))
    if not text or key in seen:
        return
    seen.add(key)
    c = {'id': 'c' + hid(*key), 'kind': kind, 'level': level, 'text': text}
    if lessonId: c['lessonId'] = lessonId
    if comp: c['comp'] = comp
    lib['comments'].append(c)


def level_of(v):
    m = re.search(r'\d', str(v or ''))
    return int(m.group()) if m else None


def comp_of(v):
    f = fold(v)
    for code, name in COMPS.items():
        if f and (fold(name) in f or f in fold(name)):
            return code
    return ''


# 1. Khối 6 modules and lessons (goals from the criteria file).
crit = glob.glob(os.path.join(SRC, '02-Arkki*.xlsx'))
order = 0
if crit:
    ws = openpyxl.load_workbook(crit[0], read_only=True, data_only=True).worksheets[2]
    head, mod = '', None
    for row in ws.iter_rows(values_only=True):
        a, b, c = (row + (None, None, None))[:3]
        a = clean(a)
        if re.match(r'^KHỐI', a, re.I): head = a.title().replace('Khối', 'Khối'); continue
        if a in ('HKI', 'HKII'):
            order += 1; mod = module(head.replace('- ', '– ') + ' · ' + a, order); n = 0; continue
        if mod and re.match(r'^P\d+', a):
            n += 1; lesson(mod, n, clean(b), ['6'], code=a, goal=str(c or '').strip())

# 2. Kindergarten libraries (one module per file / level).
for f in sorted(glob.glob(os.path.join(SRC, 'Thuviennhanxet*Clover*.xlsx'))):
    lv = re.search(r'level\s*(\d)', f, re.I)
    order += 1
    mod = module('Mầm non Clover · HK2 · Level ' + (lv.group(1) if lv else '?'), order)
    wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        hdr = next((i for i, r in enumerate(rows[:6]) if r and any(fold(x) in ('cap do',) for x in r if x)), None)
        if hdr is None: continue
        H = [fold(x) for x in rows[hdr]]
        col = lambda *names: next((i for i, h in enumerate(H) if any(h.startswith(n) for n in names)), None)
        cK, cL, cLv, cC = col('loai'), col('bai hoc'), col('cap do'), col('nang luc')
        cT = max(i for i, h in enumerate(H) if h)  # sentence = last titled column
        for r in rows[hdr + 1:]:
            r = list(r) + [None] * 6
            text, level = r[cT], level_of(r[cLv])
            if not text or not level: continue
            k = fold(r[cK]) if cK is not None else ''
            if cK is None and cL is not None: kind = 'daily'
            elif cK is None and cC is not None: kind = 'quick'
            elif 'hang ngay' in k: kind = 'daily'
            elif 'de xuat' in k: kind = 'suggest'
            elif 'cuoi ky' in k or 'rieng' in k: kind = 'final'
            elif 'nhanh' in k or 'nang luc' in k: kind = 'quick'
            else: continue
            if kind == 'daily':
                name = clean(r[cL]); l = lesson(mod, sum(1 for x in lib['lessons'] if x['moduleId'] == mod['id']) + 1, name, ['Arkki'])
                comment('daily', level, text, lessonId=l['id'])
            else:
                comment(kind, level, text, comp=comp_of(r[cC]) if cC is not None else '')

# 3. Lessons already used in the sample classes but not in any library file.
seed = json.load(open(os.path.join(ROOT, 'du-lieu-khoi-phuc.json'), encoding='utf-8'))
known = {fold(l['name']) for l in lib['lessons']}
paren = lambda s: (re.search(r'\(([^)]+)\)', s) or [None, ''])[1]
known |= {fold(paren(l['name'])) for l in lib['lessons'] if paren(l['name'])}
extra = []
for l in sorted(seed['lessons'].values(), key=lambda x: (x['classId'], x['order'])):
    p = l['project'].strip()
    if p and fold(p) not in known and fold(paren(p) or p) not in known and p not in extra: extra.append(p)
if extra:
    order += 1
    mod = module('Mầm non Clover · HK I 2026-2027 (từ lịch học, chưa có câu nhận xét)', order)
    for i, p in enumerate(extra): lesson(mod, i + 1, p.title() if p.isupper() else p, ['Arkki'])

# 4. "Số buổi thường dạy": how many sessions a lesson took in the sample classes (largest count over classes).
counts = {}
for l in seed['lessons'].values():
    k = (l['classId'], fold(l['project'])); counts[k] = counts.get(k, 0) + 1
for les in lib['lessons']:
    names = {fold(les['name']), fold(paren(les['name']))} - {''}
    n = max([v for (cid, p), v in counts.items() if p in names or fold(paren(p) or p) in names] or [0])
    if n > 1: les['sessions'] = n

json.dump(lib, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
by = {}
for c in lib['comments']: by[c['kind']] = by.get(c['kind'], 0) + 1
print('modules', len(lib['modules']), 'lessons', len(lib['lessons']), 'comments', by, '->', OUT)
for m in lib['modules']:
    print(' ', m['name'], [l['name'] for l in lib['lessons'] if l['moduleId'] == m['id']][:12])
