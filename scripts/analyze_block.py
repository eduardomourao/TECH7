import re

sample = open(r'baterias\apple\bateria-iph-11-3110mah\index.html', 'r', encoding='utf-8', errors='ignore').read()

# Mostra todas ocorrencias de display-e-lcd com contexto amplo
positions = [m.start() for m in re.finditer('display-e-lcd', sample)]
print(f'Total ocorrencias display-e-lcd: {len(positions)}')

for i, pos in enumerate(positions):
    ctx = sample[max(0,pos-100):pos+250]
    print(f'\n=== OCORRENCIA {i+1} (pos {pos}) ===')
    print(ctx)
    print()
