"""Rebuild the single-file GitHub Pages app from editable source in src/."""
from pathlib import Path
root = Path(__file__).resolve().parent
source = root / 'src'
html = (source / 'index.html').read_text(encoding='utf-8')
css = (source / 'style.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
for name in ('engine-loader.js', 'core.js', 'app.js'):
    html = html.replace(f'<script src="{name}"></script>', f'<script>\n{(source / name).read_text(encoding="utf-8")}\n</script>')
(root / 'index.html').write_text(html, encoding='utf-8')
print('Built index.html:', len(html.encode('utf-8')), 'bytes')
