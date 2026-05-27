const fs = require('fs');
const path = require('path');

const siteDir = process.cwd();
const precosPath = path.join(siteDir, 'precos.json');

// 1. Validar precos.json
let precosData = {};
if (fs.existsSync(precosPath)) {
    try {
        precosData = JSON.parse(fs.readFileSync(precosPath, 'utf8'));
        console.log('precos.json carregado com sucesso.');
    } catch (e) {
        console.error('Erro ao fazer parse de precos.json:', e.message);
        process.exit(1);
    }
} else {
    console.log('precos.json não existe. Será criado um novo.');
}

// Pastas ignoradas
const ignoreFolders = ['_assets', 'mvc', 'empresa', 'contato', 'skills', ' Apple', ' Asus', ' Motorola', ' LG', ' Realme', ' Samsung', ' Xiaomi', 'cadastro', 'central-do-cliente', 'como-comprar', 'cupons-de-desconto', 'depoimentos-de-clientes', 'duvidas-alerta-de-fraude', 'duvidas-aviso-de-prazo-de-entrega', 'duvidas-curso-tecnico-presencial', 'duvidas-descontos-vigentes', 'duvidas-informacoes-sobre-o-frete', 'duvidas-politica-de-privacidade', 'duvidas-qualidade-dos-produtos', 'duvidas-servico-de-instalacao', 'duvidas-tipos-de-baterias', 'duvidas-tipos-de-telas', 'duvidas-troca-de-pecas-de-celular', 'duvidas-trocas-e-devolucoes', 'envio', 'garantias-e-trocas', 'loja', 'mapa-do-site', 'my-account', 'pagamento', 'privacidade', 'seguranca', 'sem-resultados-na-busca'];

// Função para varrer diretórios procurando index.html no nível 3
function getProductFiles(dir, depth = 0, currentPath = []) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('_') || ignoreFolders.includes(entry.name)) {
            continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (depth < 3) {
                results = results.concat(getProductFiles(fullPath, depth + 1, [...currentPath, entry.name]));
            }
        } else if (entry.isFile() && entry.name === 'index.html' && depth === 3) {
            results.push({
                file: fullPath,
                secao: currentPath[0],
                marca: currentPath[1],
                slug: currentPath[2]
            });
        }
    }
    return results;
}

const products = getProductFiles(siteDir);
console.log(`Encontrados ${products.length} produtos em potencial.`);

let modifiedCount = 0;
let updatedPrecos = false;

for (const p of products) {
    const { file, secao, marca, slug } = p;
    let html = fs.readFileSync(file, 'utf8');
    let hasPriceInJson = false;

    if (precosData[secao] && precosData[secao][marca] && precosData[secao][marca][slug] !== undefined) {
        hasPriceInJson = true;
    }

    if (!hasPriceInJson) {
        // Extrair preço
        let extractedPrice = 0;

        // 1. dataLayer priceSell
        const priceSellMatch = html.match(/"priceSell"\s*:\s*"([\d.]+)"/);
        if (priceSellMatch) {
            extractedPrice = parseFloat(priceSellMatch[1]);
        } else {
            // 2. JSON-LD Offer.price
            const offerPriceMatch = html.match(/"price"\s*:\s*"([\d.]+)"/);
            if (offerPriceMatch) {
                extractedPrice = parseFloat(offerPriceMatch[1]);
            } else {
                // 3. .price-off ou similar
                const priceOffMatch = html.match(/class="price-off"[^>]*>R\$\s*([\d,.]+)/);
                if (priceOffMatch) {
                    extractedPrice = parseFloat(priceOffMatch[1].replace(/\./g, '').replace(',', '.'));
                }
            }
        }

        if (isNaN(extractedPrice) || extractedPrice < 0) extractedPrice = 0;

        if (!precosData[secao]) precosData[secao] = {};
        if (!precosData[secao][marca]) precosData[secao][marca] = {};
        precosData[secao][marca][slug] = extractedPrice;
        updatedPrecos = true;
    }

    // Injetar script
    const scriptTag = '<script src="/preco-loader.js"></script>';
    if (!html.includes('preco-loader.js')) {
        if (html.includes('</body>')) {
            html = html.replace('</body>', `    ${scriptTag}\n</body>`);
        } else if (html.includes('</html>')) {
            html = html.replace('</html>', `${scriptTag}\n</html>`);
        } else {
            html += `\n${scriptTag}`;
        }
        fs.writeFileSync(file, html, 'utf8');
        modifiedCount++;
    }
}

if (updatedPrecos) {
    fs.writeFileSync(precosPath, JSON.stringify(precosData, null, 2), 'utf8');
    console.log('precos.json atualizado.');
}

console.log(`Script injetado em ${modifiedCount} arquivos HTML.`);
