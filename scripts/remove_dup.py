import re
import os
import sys

root = os.path.dirname(os.path.abspath(__file__))
count = 0

# Match any <li class="relative" data-id="9" ...> containing PEÇAS E COMPONENTES
pattern = re.compile(
    r'<li[^>]*?class="relative"[^>]*?data-id="9"[^>]*?data-level="1"[^>]*?>'
    r'.*?PEÇAS\s*E\s*COMPONENTES.*?</li>',
    re.DOTALL | re.IGNORECASE
)

for dirpath, dirnames, filenames in os.walk(root):
    skip_dirs = {'node_modules', '.git', 'backend', 'server', '_assets', '.github'}
    for skip in skip_dirs:
        if skip in dirnames:
            dirnames.remove(skip)
    for f in filenames:
        if not f.endswith('.html'):
            continue
        fpath = os.path.join(dirpath, f)
        with open(fpath, 'r', encoding='utf-8') as fh:
            orig = fh.read()

        modified, n = pattern.subn('', orig)
        if n:
            with open(fpath, 'w', encoding='utf-8') as fh:
                fh.write(modified)
            count += 1
            if count <= 3:
                print(f"Removed from {os.path.relpath(fpath, root)}")

print(f"\nDone: {count} files modified")
