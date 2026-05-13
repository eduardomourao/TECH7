"""
Remove a aba/menu duplicada "DISPLAY E LCD" (data-id="5") em todos os HTML do site.
Existem 2 blocos distintos em cada arquivo:
  1) Menu desktop: <li><a class="space sub" href="...display-e-lcd/index.html">...</li>  (com submenu)
  2) Menu mobile vertical: <li class="relative" data-id="5" data-level="1">...</li>
"""
import os, re

ROOT = r'C:\Users\Admin\Downloads\central\centralselling oficial\site'

# ===== PADROES =====
# Bloco desktop: <li><a class="space sub" href="[../]+display-e-lcd/index.html">...</li>
# O </li> fecha APOS o </ul> do submenu - precisa de regex que captura o li inteiro
# Estrategia: capturar o <li> que contem "space sub" + "display-e-lcd/index.html" ate o seu </li> de fechamento

# Bloco mobile: <li class="relative" data-id="5" data-level="1">...</li>
# Este li tem subconteudo aninhado, buscamos pelo data-id="5"

removed_files = []
errors = []
skipped = 0

def remove_desktop_block(html):
    """Remove <li><a class="space sub" href="...display-e-lcd/index.html">...</ul></li>"""
    # Pattern: <li> seguido de <a class="space sub" href="...display-e-lcd/index.html"
    # O bloco termina com </ul></li> (fechamento do submenu dentro do li)
    pattern = re.compile(
        r'<li><a class="space sub" href="[^"]*display-e-lcd/index\.html".*?</ul></li>',
        re.DOTALL
    )
    new_html, n = pattern.subn('', html)
    return new_html, n

def remove_mobile_block(html):
    """Remove <li class="relative" data-id="5" data-level="1">...</li>"""
    pattern = re.compile(
        r'<li class="relative" data-id="5" data-level="1">.*?</div></div></li>',
        re.DOTALL
    )
    new_html, n = pattern.subn('', html)
    return new_html, n

total_files = 0
total_modified = 0

for dirpath, dirs, files in os.walk(ROOT):
    # Ignora pastas de assets e display-e-lcd (essas paginas podem ter o item legitimo)
    dirs[:] = [d for d in dirs if d not in ['_assets', 'node_modules', '.git', 'display-e-lcd']]
    
    for fname in files:
        if not fname.endswith('.html'):
            continue
        
        fp = os.path.join(dirpath, fname)
        total_files += 1
        
        try:
            with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
                original = f.read()
        except Exception as e:
            errors.append(f"READ {fp}: {e}")
            continue
        
        if 'display-e-lcd/index.html' not in original:
            skipped += 1
            continue
        
        modified = original
        n_desktop = 0
        n_mobile = 0
        
        # Remove bloco desktop
        modified, n_desktop = remove_desktop_block(modified)
        
        # Remove bloco mobile
        modified, n_mobile = remove_mobile_block(modified)
        
        if modified != original:
            try:
                with open(fp, 'w', encoding='utf-8') as f:
                    f.write(modified)
                rel = fp.replace(ROOT + os.sep, '')
                removed_files.append(f"{rel} [desktop={n_desktop}, mobile={n_mobile}]")
                total_modified += 1
            except Exception as e:
                errors.append(f"WRITE {fp}: {e}")

print(f"Total arquivos verificados: {total_files}")
print(f"Arquivos sem ocorrencia: {skipped}")
print(f"Arquivos modificados: {total_modified}")
print(f"Erros: {len(errors)}")

if errors:
    print("\n=== ERROS ===")
    for e in errors[:10]:
        print(e)

print("\n=== PRIMEIROS 20 ARQUIVOS MODIFICADOS ===")
for f in removed_files[:20]:
    print(f)
