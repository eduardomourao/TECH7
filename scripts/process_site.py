import os
import json
import re

root = r'c:\Users\Admin\Downloads\central\centralselling oficial\site'
precos_file = os.path.join(root, 'precos.json')
loader_file = os.path.join(root, 'preco-loader.js')

loader_code = r"""(function() {
  const scriptTag = document.currentScript;
  const baseUrl = scriptTag ? scriptTag.src.split('?')[0].replace(/\/preco-loader\.js$/, '') : '../../..';

  const path = window.location.pathname;
  const parts = path.replace(/\\/g, '/').replace(/\/index\.html$/, '').replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length < 3) return;

  const slug  = parts[parts.length - 1];
  const marca = parts[parts.length - 2];
  const secao = parts[parts.length - 3];

  fetch(baseUrl + '/precos.json')
    .then(r => r.json())
    .then(data => {
      const preco = data?.[secao]?.[marca]?.[slug];
      if (!preco) return;

      document.querySelectorAll('.price-off').forEach(el => {
        el.textContent = 'R$ ' + preco.toFixed(2).replace('.', ',');
      });

      const campoPreco = document.getElementById('preco_atual');
      if (campoPreco) campoPreco.value = preco.toFixed(2);

      if (typeof gtag === 'function') {
        gtag('event', 'view_item', {
          "currency": "BRL",
          "value": preco,
          "items": [{ "price": preco }]
        });
      }
    })
    .catch(console.warn);
})();
"""

with open(loader_file, 'w', encoding='utf-8') as f:
    f.write(loader_code)

ignore_dirs = {
    '_assets', '_custom', 'skills', 'empresa', 'contato', 'cadastro', 
    'central-do-cliente', 'como-comprar', 'cupons-de-desconto', 
    'depoimentos-de-clientes', 'duvidas-alerta-de-fraude', 
    'duvidas-aviso-de-prazo-de-entrega', 'duvidas-curso-tecnico-presencial', 
    'duvidas-descontos-vigentes', 'duvidas-informacoes-sobre-o-frete', 
    'duvidas-politica-de-privacidade', 'duvidas-qualidade-dos-produtos', 
    'duvidas-servico-de-instalacao', 'duvidas-tipos-de-baterias', 
    'duvidas-tipos-de-telas', 'duvidas-troca-de-pecas-de-celular', 
    'duvidas-trocas-e-devolucoes', 'envio', 'garantias-e-trocas', 'loja', 
    'mapa-do-site', 'my-account', 'pagamento', 'privacidade', 'seguranca', 
    'sem-resultados-na-busca', '.git', '.github'
}

try:
    with open(precos_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
except Exception as e:
    data = {}

def set_nested(d, keys, val):
    for key in keys[:-1]:
        if key not in d or not isinstance(d[key], dict):
            d[key] = {}
        d = d[key]
    d[keys[-1]] = val

def get_nested(d, keys):
    for key in keys:
        if key not in d or not isinstance(d, dict):
            return None
        d = d[key]
    return d

total_encontrados = 0
total_adicionados = 0
total_htmls_alterados = 0
total_pendencias = 0

html_paths = set()

for root_dir, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ignore_dirs]
    
    if 'index.html' in files:
        rel_dir = os.path.relpath(root_dir, root)
        if rel_dir == '.':
            continue
            
        parts = rel_dir.replace('\\', '/').split('/')
        if len(parts) < 3:
            continue
            
        secao = parts[0]
        marca = parts[1]
        slug = parts[2]
        html_paths.add((secao, marca, slug))
        
        path = os.path.join(root_dir, 'index.html')
        total_encontrados += 1
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            modified = False
            
            price = get_nested(data, [secao, marca, slug])
            if price is None:
                match_sell = re.search(r'["\']?priceSell["\']?\s*:\s*["\']?([\d\.]+)["\']?', content)
                match_offer = re.search(r'"@type"\s*:\s*"Offer"[^>]+?"price"\s*:\s*["\']?([\d\.]+)["\']?', content, re.DOTALL)
                match_class = re.search(r'class=["\'][^"\']*price-off[^"\']*["\'][^>]*>\s*(?:R\$\s*)?([\d\.,]+)', content)
                
                extracted_price = None
                if match_sell:
                    extracted_price = match_sell.group(1)
                elif match_offer:
                    extracted_price = match_offer.group(1)
                elif match_class:
                    val = match_class.group(1).replace('.', '').replace(',', '.')
                    extracted_price = val
                
                if extracted_price is not None:
                    try:
                        p = float(extracted_price)
                        if p.is_integer(): p = int(p)
                        set_nested(data, [secao, marca, slug], p)
                        total_adicionados += 1
                    except:
                        total_pendencias += 1
                else:
                    total_pendencias += 1

            depth = len(parts)
            script_src = "/".join([".."] * depth) + "/preco-loader.js"
            script_tag = f'<script src="{script_src}"></script>'
            
            if 'preco-loader.js' not in content:
                if '</body>' in content:
                    content = content.replace('</body>', script_tag + '\n</body>')
                    modified = True
                else:
                    content += '\n' + script_tag
                    modified = True
            
            if modified:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                total_htmls_alterados += 1
                
        except Exception as e:
            total_pendencias += 1

# Valida JSON sem HTML correspondente
for sec, marcas in list(data.items()):
    if isinstance(marcas, dict):
        for mar, slugs in list(marcas.items()):
            if isinstance(slugs, dict):
                for slg in list(slugs.keys()):
                    if (sec, mar, slg) not in html_paths:
                        total_pendencias += 1

with open(precos_file, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"TOTAL_ENCONTRADOS:{total_encontrados}")
print(f"TOTAL_ADICIONADOS:{total_adicionados}")
print(f"TOTAL_HTMLS_ALTERADOS:{total_htmls_alterados}")
print(f"TOTAL_PENDENCIAS:{total_pendencias}")
