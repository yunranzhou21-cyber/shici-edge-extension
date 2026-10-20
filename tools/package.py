"""Package only deliverables, excluding browser profiles and test credentials."""
import json, pathlib, zipfile
root = pathlib.Path(__file__).resolve().parents[1]
version = json.loads((root / 'extension' / 'manifest.json').read_text(encoding='utf-8'))['version']
output = root / f'拾词-Edge-v{version}.zip'
files = []
for directory in ('extension', 'docs', 'tools', 'tests'):
    files.extend(p for p in (root / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
files.extend(root / p for p in ('.gitignore', '.gitattributes', 'README.md', 'THIRD_PARTY_NOTICES.md', 'package.json'))
files.extend(root / 'artifacts' / p for p in ('manager.png', 'lookup.png', 'settings.png', 'widget-favorites.png', 'widget-settings.png', 'widget-lookup.png', 'widget-lookup-results.json', 'microsoft-settings.png', 'microsoft-lookup.png', 'pdf-reader.png', 'pdf-page.png', 'documents-results.json', 'browser-results.json'))
files.extend((root / 'artifacts').glob('theme-*.png'))
files.append(root / 'artifacts' / 'theme-review.json')
files.extend(root / 'artifacts' / p for p in ('manual-results.json','manual-completion.png','manual-chinese-english.png','widget-chinese-english.png'))
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(files):
        archive.write(file, file.relative_to(root).as_posix())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'extension/manifest.json' in archive.namelist()
    assert not any('edge-test-profile' in p for p in archive.namelist())
print(f'Package created: {len(files)} files, {output.stat().st_size:,} bytes, integrity OK')
