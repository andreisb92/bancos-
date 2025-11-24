import fs from 'fs';
import path from 'path';

const jsonlDir = path.join(process.cwd(), 'data', 'jsonl');
const outputFile = path.join(process.cwd(), 'data', 'descuentos_all.jsonl');
const outputJsonFile = path.join(process.cwd(), 'data', 'descuentos_all.json');

console.log('📦 Consolidando todos los JSONL...\n');

if (!fs.existsSync(jsonlDir)) {
  console.log('❌ No existe el directorio data/jsonl');
  process.exit(1);
}

const files = fs.readdirSync(jsonlDir).filter(f => f.endsWith('.jsonl'));

if (files.length === 0) {
  console.log('⚠️  No se encontraron archivos JSONL');
  process.exit(0);
}

console.log(`📁 Encontrados ${files.length} archivos JSONL:`);
files.forEach(f => console.log(`   - ${f}`));

const allOffers = [];
const bankStats = {};

for (const file of files) {
  const filePath = path.join(jsonlDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(l => l.trim());
  
  const bankSlug = file.replace('.jsonl', '');
  let count = 0;
  
  for (const line of lines) {
    try {
      const offer = JSON.parse(line);
      allOffers.push(offer);
      count++;
    } catch (e) {
      console.log(`   ⚠️  Error parseando línea en ${file}: ${e.message}`);
    }
  }
  
  bankStats[bankSlug] = count;
  console.log(`   ✅ ${bankSlug}: ${count} ofertas`);
}

// Guardar JSONL consolidado
const jsonlContent = allOffers.map(o => JSON.stringify(o)).join('\n');
fs.writeFileSync(outputFile, jsonlContent + '\n', 'utf-8');

// Guardar JSON consolidado (formato array)
fs.writeFileSync(outputJsonFile, JSON.stringify(allOffers, null, 2), 'utf-8');

console.log(`\n✅ Consolidación completada:`);
console.log(`   📊 Total ofertas: ${allOffers.length}`);
console.log(`   💾 JSONL: ${outputFile}`);
console.log(`   💾 JSON: ${outputJsonFile}`);

console.log(`\n📈 Estadísticas por banco:`);
Object.entries(bankStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([bank, count]) => {
    console.log(`   ${bank}: ${count} ofertas`);
  });

