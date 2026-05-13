import re, json

# Analisa o HTML da pagina do produto PLUS
with open(r'display-e-lcd\apple\tela-display-lcd-iphone-16-plus-jk-troca-ci\index.html', 'r', encoding='utf-8', errors='replace') as f:
    c = f.read()

# 1. JSON embutido com dados dos produtos (dataLayer / productListJSON)
print('=== DADOS JSON EMBUTIDOS ===')
for name in ['productListJSON', 'dataLayer', 'ecommerce', 'products']:
    m = re.search(name + r'\s*[=:]\s*(\[.{0,2000}?\]);', c, re.DOTALL)
    if m:
        print(f'{name}: {m.group(1)[:400]}')
        print()

# 2. Verificar o card-price-loader e preco-loader-cards
print('=== SCRIPTS SRC (locais) ===')
for m in re.finditer(r'<script[^>]+src="([^"]+)"', c):
    src = m.group(1)
    if 'tcdn' not in src and 'google' not in src and 'facebook' not in src and 'tiktok' not in src and 'doubleclick' not in src:
        print(f'  {src}')

# 3. Verifica elementos de preco nos cards
print()
print('=== ELEMENTOS COM PRICE/PRECO (primeiros 5) ===')
for m in re.finditer(r'class="[^"]*(?:price|preco)[^"]*"[^>]*>([^<]{1,60})', c):
    print(f'  classe contendo price/preco: {m.group(1).strip()!r}')
