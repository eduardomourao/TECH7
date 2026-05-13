from bs4 import BeautifulSoup
import glob
import sys

def clean_duplicate_tab():
    files = glob.glob('**/*.html', recursive=True)
    count_modified = 0
    
    for filepath in files:
        with open(filepath, 'r', encoding='utf-8') as f:
            html = f.read()
            
        soup = BeautifulSoup(html, 'html.parser')
        
        # Encontrar todas as tags `a` que tenham o href="...pecas-e-componentes/index.html" e texto contendo "PEÇAS E COMPONENTES"
        # Precisamos remover o <li> pai desses <a>
        links = soup.find_all('a', href=lambda x: x and 'pecas-e-componentes/index.html' in x)
        
        pecas_links = []
        for link in links:
            if 'PEÇAS E COMPONENTES' in link.get_text():
                # Encontrar o pai <li>
                li_parent = link.find_parent('li', attrs={'data-id': True})
                if li_parent:
                    pecas_links.append(li_parent)
        
        # Remover duplicatas da lista de links encontrados (podem ter o mesmo li_parent)
        unique_lis = []
        for li in pecas_links:
            if li not in unique_lis:
                unique_lis.append(li)
                
        if len(unique_lis) > 1:
            print(f"File {filepath} tem {len(unique_lis)} abas PEÇAS E COMPONENTES. Removendo a partir da segunda...")
            for li in unique_lis[1:]:
                li.decompose() # Remove a tag inteira
            
            # Salva
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(str(soup))
            count_modified += 1
            
    print(f"Processo concluido. {count_modified} arquivos modificados.")

if __name__ == '__main__':
    clean_duplicate_tab()
