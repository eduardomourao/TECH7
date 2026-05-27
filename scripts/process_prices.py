import os
import json
import re
from pathlib import Path

def main():
    site_dir = Path(r"c:\Users\Admin\Downloads\central\centralselling oficial\site")
    precos_file = site_dir / "precos.json"
    
    precos = {}
    if precos_file.exists():
        try:
            with open(precos_file, 'r', encoding='utf-8') as f:
                precos = json.load(f)
        except json.JSONDecodeError:
            precos = {}
            
    # Compile regexes for price extraction
    # 1. priceSell no dataLayer: "priceSell":"85.00" or 'priceSell':'85.00' or "priceSell": 85.00
    rx_pricesell = re.compile(r'["\']priceSell["\']\s*:\s*["\']?([\d\.]+)["\']?')
    # 2. JSON-LD Offer.price: "price": "85.00"
    rx_jsonld = re.compile(r'["\']price["\']\s*:\s*["\']?([\d\.]+)["\']?')
    # 3. .price-off
    rx_priceoff = re.compile(r'class=["\'][^"\']*price-off[^"\']*["\'][^>]*>\s*(?:R\$)?\s*([\d\.,]+)')
    
    # Excluded folders
    excluded_folders = {'_assets', 'mvc', 'empresa', 'contato', 'css', 'js', 'images', 'fonts', 'img'}
    
    changed_precos = False
    
    # Create / update preco-loader.js
    loader_path = site_dir / "preco-loader.js"
    loader_code = """(function() {
  // Detecta a seção e slug do produto pela URL
  const path = window.location.pathname; // ex: /display/samsung/lcd-sam-a51-a515-oled
  const parts = path.replace(/\\/+$/, '').split('/').filter(Boolean);
  if (parts.length < 3) return;

  const secao = parts[0];
  const marca = parts[1];
  const slug = parts[2];

  fetch('/precos.json')
    .then(r => r.json())
    .then(data => {
      if (data && data[secao] && data[secao][marca] && typeof data[secao][marca][slug] !== 'undefined') {
        let preco = data[secao][marca][slug];
        if (preco === 0) return; // if price is 0, keep fallback
        
        let formatado = Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        // Atualiza elementos visuais
        const elPreco = document.querySelector('#preco_atual, .price-off, .current-price, .woocommerce-Price-amount');
        if (elPreco) {
            elPreco.innerText = formatado;
        }

        // Atualiza gtag / dataLayer dinamicamente se necessário
        if (typeof dataLayer !== 'undefined') {
            for (let i = 0; i < dataLayer.length; i++) {
                if (dataLayer[i].priceSell) dataLayer[i].priceSell = preco.toString();
                if (dataLayer[i].price) dataLayer[i].price = preco.toString();
            }
        }
      }
    })
    .catch(err => console.error('Erro ao carregar precos:', err));
})();"""
    with open(loader_path, 'w', encoding='utf-8') as f:
        f.write(loader_code)
    
    # Process all index.html files
    for root, dirs, files in os.walk(site_dir):
        # Skip excluded folders
        dirs[:] = [d for d in dirs if d not in excluded_folders and not d.startswith('.')]
        
        if 'index.html' in files:
            rel_path = Path(root).relative_to(site_dir)
            parts = rel_path.parts
            
            # We only care about products (secao/marca/slug)
            if len(parts) >= 3:
                secao, marca, slug = parts[0], parts[1], parts[2]
                
                # Make sure dicts exist
                if secao not in precos: precos[secao] = {}
                if marca not in precos[secao]: precos[secao][marca] = {}
                
                index_html_path = Path(root) / 'index.html'
                with open(index_html_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Extract price if not exists
                if slug not in precos[secao][marca]:
                    price_val = 0
                    
                    # Try priceSell
                    m1 = rx_pricesell.search(content)
                    if m1:
                        price_val = float(m1.group(1))
                    else:
                        m2 = rx_jsonld.search(content)
                        if m2:
                            price_val = float(m2.group(1))
                        else:
                            m3 = rx_priceoff.search(content)
                            if m3:
                                p_str = m3.group(1).replace('.', '').replace(',', '.')
                                try:
                                    price_val = float(p_str)
                                except:
                                    pass
                    
                    precos[secao][marca][slug] = price_val if price_val > 0 else 0
                    changed_precos = True
                
                # Inject loader if not present
                if 'preco-loader.js' not in content:
                    script_tag = '<script src="/preco-loader.js"></script>'
                    # Put it before </body> or at the end
                    if '</body>' in content:
                        content = content.replace('</body>', f'{script_tag}\\n</body>')
                    else:
                        content += f'\\n{script_tag}'
                        
                    with open(index_html_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                        
    # Save precos.json if changed
    if changed_precos or not precos_file.exists():
        with open(precos_file, 'w', encoding='utf-8') as f:
            json.dump(precos, f, indent=2, ensure_ascii=False)
            
    print("Done. Generated precos.json, wrote preco-loader.js, and injected script in index.html files.")

if __name__ == '__main__':
    main()
