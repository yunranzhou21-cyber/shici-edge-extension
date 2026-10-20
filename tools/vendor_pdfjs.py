"""Vendor an official PDF.js release with its license; no runtime CDN downloads."""
import base64, hashlib, io, json, pathlib, tarfile, urllib.request
root=pathlib.Path(__file__).resolve().parents[1]
def fetch(url):
    with urllib.request.urlopen(url,timeout=90) as response:return response.read()
info=json.loads(fetch('https://registry.npmjs.org/pdfjs-dist/6.4.299'))
archive=fetch(info['dist']['tarball'])
algorithm,expected=info['dist']['integrity'].split('-',1)
assert algorithm=='sha512' and base64.b64encode(hashlib.sha512(archive).digest()).decode()==expected
target=root/'extension'/'vendor'/'pdfjs'
target.mkdir(parents=True,exist_ok=True)
kept=[]
with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as package:
    for member in package.getmembers():
        name=member.name.removeprefix('package/')
        keep=name in ['build/pdf.mjs','build/pdf.worker.mjs','web/pdf_viewer.css','LICENSE'] or name.startswith(('cmaps/','standard_fonts/','wasm/'))
        if not keep or not member.isfile() or '..' in pathlib.PurePosixPath(name).parts:continue
        destination=target/name;destination.parent.mkdir(parents=True,exist_ok=True)
        destination.write_bytes(package.extractfile(member).read());kept.append(name)
metadata={'name':'pdfjs-dist','version':info['version'],'source':info['dist']['tarball'],'integrity':info['dist']['integrity'],'license':info['license'],'files':sorted(kept)}
(target/'metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
print(json.dumps({'version':info['version'],'files':len(kept),'bytes':sum(p.stat().st_size for p in target.rglob('*') if p.is_file())}))
