import os
import json
import re

root = r'c:\Users\Admin\Downloads\central\centralselling oficial\site'
out_file = os.path.join(root, 'precos.json')

# Pastas para ignorar
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
    'sem-resultados-na-busca'
}

data = {}

def set_nested(d, keys, val):
    for key in keys[:-1]:
        if key not in d or not isinstance(d[key], dict):
            d[key] = {}
        d = d[key]
    d[keys[-1]] = val

count_processed = 0

for root_dir, dirs, files in os.walk(root):
    # Ignora diretórios ocultos e pastas da lista de ignore
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ignore_dirs]
    
    if 'index.html' in files:
        path = os.path.join(root_dir, 'index.html')
        rel_dir = os.path.relpath(root_dir, root)
        
        # Pula a raiz
        if rel_dir == '.':
            continue
            
        parts = rel_dir.replace('\\', '/').split('/')
        
        # O preco-loader usa parts[0], parts[1], parts[2].
        # Ignoramos pastas rasas (categorias/marcas sem slug).
        if len(parts) < 3:
            continue
            
        # Pega apenas os 3 primeiros níveis para compatibilidade com o preco-loader.js
        secao = parts[0]
        marca = parts[1]
        slug = parts[2]
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            match = re.search(r'["\']?priceSell["\']?\s*:\s*["\']?([\d\.]+)["\']?', content)
            
            if match:
                price_str = match.group(1)
                price = float(price_str)
                if price.is_integer():
                    price = int(price)
            else:
                price = 0
                
            set_nested(data, [secao, marca, slug], price)
            count_processed += 1
                
        except Exception as e:
            print(f"Erro ao processar {path}: {e}")

with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Gerado {out_file} com sucesso! Produtos extraídos: {count_processed}")
