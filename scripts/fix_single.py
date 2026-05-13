import re

path = r'C:\Users\Admin\Downloads\central\centralselling oficial\site\pecas-e-componentes\apple\botao-externo-lateral-iphone-1414-plus\index.html'

with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

original_len = len(content)

# Remove item desktop dentro de <li>
pattern_desktop = r'<li[^>]*>\s*<a[^>]*href="[^"]*display-e-lcd[^"]*"[^>]*>.*?DISPLAY E LCD.*?</a>\s*</li>'
content = re.sub(pattern_desktop, '', content, flags=re.DOTALL)

# Remove item mobile icon-show
pattern_mobile = r'<a[^>]*class="[^"]*icon-show sub vertical-icon[^"]*"[^>]*href="[^"]*display-e-lcd[^"]*"[^>]*>.*?</a>'
content = re.sub(pattern_mobile, '', content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Concluido. Caracteres antes: {original_len} | depois: {len(content)}")
