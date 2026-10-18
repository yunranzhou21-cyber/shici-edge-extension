"""Fetch pinned upstream data, keep license, generate local alphabet shards. No runtime network."""
import argparse, csv, hashlib, io, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as r:
        return r.read()

parser = argparse.ArgumentParser()
parser.add_argument('--commit', default='bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b')
commit = parser.parse_args().commit
base = f'https://raw.githubusercontent.com/skywind3000/ECDICT/{commit}/'
raw = fetch(base + 'ecdict.csv')
license_text = fetch(base + 'LICENSE')
target = ROOT / 'extension' / 'data'
target.mkdir(parents=True, exist_ok=True)
for old in target.glob('?.json'):
    if old.stem in 'abcdefghijklmnopqrstuvwxyz_':
        old.unlink()
shards = {}
count = 0
for row in csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))):
    word = row['word'].strip().lower()
    meaning = row.get('translation', '').replace('\\n','\n').strip()
    ranks = [int(row[k]) for k in ('bnc','frq') if row.get(k, '').isdigit() and int(row[k]) > 0]
    if not row.get('tag') and row.get('oxford') != '1' and not any(n <= 30000 for n in ranks):
        continue
    if not word or not meaning or len(word) > 200:
        continue
    key = word[0] if word[0] in 'abcdefghijklmnopqrstuvwxyz' else '_'
    shards.setdefault(key, {})[word] = [meaning, row.get('phonetic','')]
for key, records in shards.items():
    (target / f'{key}.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    count += len(records)
(target / 'ECDICT-LICENSE.txt').write_bytes(license_text)
metadata = {'name':'ECDICT common subset','repository':'https://github.com/skywind3000/ECDICT','commit':commit,'sourceFile':'ecdict.csv','filter':'tag present OR oxford=1 OR BNC/FRQ positive rank <= 30000','sha256':hashlib.sha256(raw).hexdigest(),'entries':count,'license':'MIT','shards':sorted(shards)}
(target / 'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(metadata,ensure_ascii=False))
