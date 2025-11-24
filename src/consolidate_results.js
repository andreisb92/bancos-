import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';

async function consolidateResults() {
  console.log('\n📦 CONSOLIDANDO RESULTADOS DE TODOS LOS BANCOS...\n');
  
  const dataDir = path.join(process.cwd(), 'data');
  const fullDir = path.join(dataDir, 'full');
  
  // Leer todos los archivos JSON de la carpeta full/
  const allOffers = [];
  const bankStats = [];
  
  if (fs.existsSync(fullDir)) {
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('_full.json'));
    
    for (const file of files) {
      try {
        const filePath = path.join(fullDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const bankSlug = file.replace('_full.json', '');
        
        if (Array.isArray(data) && data.length > 0) {
          allOffers.push(...data);
          bankStats.push({
            slug: bankSlug,
            count: data.length,
            bank: data[0].bankSlug || bankSlug
          });
          console.log(`✅ ${bankSlug.padEnd(25)} ${data.length.toString().padStart(4)} ofertas`);
        }
      } catch (err) {
        console.error(`❌ Error leyendo ${file}: ${err.message}`);
      }
    }
  }
  
  // También leer archivos JSON individuales en data/
  const individualFiles = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json') && f !== 'descuentos_all.json');
  
  for (const file of individualFiles) {
    try {
      const filePath = path.join(dataDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      if (Array.isArray(data) && data.length > 0) {
        // Verificar si ya tenemos datos de este banco
        const bankSlug = data[0].bankSlug;
        const alreadyHas = bankStats.find(s => s.bank === bankSlug);
        
        if (!alreadyHas) {
          allOffers.push(...data);
          bankStats.push({
            slug: file.replace('.json', ''),
            count: data.length,
            bank: bankSlug
          });
          console.log(`✅ ${file.padEnd(30)} ${data.length.toString().padStart(4)} ofertas`);
        }
      }
    } catch (err) {
      // Ignorar errores de archivos no JSON válidos
    }
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 TOTAL: ${allOffers.length} ofertas de ${bankStats.length} bancos`);
  console.log(`${'═'.repeat(60)}\n`);
  
  if (allOffers.length === 0) {
    console.log('⚠️  No se encontraron ofertas para consolidar');
    return;
  }
  
  // Deduplicar
  const uniqueOffers = [];
  const seen = new Set();
  
  for (const offer of allOffers) {
    const key = `${offer.bankSlug}-${offer.title}-${offer.discount}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueOffers.push(offer);
    }
  }
  
  console.log(`🔄 Deduplicación: ${allOffers.length} → ${uniqueOffers.length} ofertas únicas\n`);
  
  // Guardar JSON consolidado
  const jsonPath = path.join(dataDir, 'descuentos_all.json');
  fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
  console.log(`✅ JSON guardado: ${jsonPath}`);
  
  // Guardar CSV consolidado
  const csvPath = path.join(dataDir, 'descuentos_all.csv');
  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: 'bankSlug', title: 'bank' },
      { id: 'title', title: 'title' },
      { id: 'merchant', title: 'merchant' },
      { id: 'discount', title: 'discount' },
      { id: 'days', title: 'days' },
      { id: 'category', title: 'category' },
      { id: 'modality', title: 'modality' },
      { id: 'terms', title: 'terms' },
      { id: 'url', title: 'url' },
    ],
  });
  
  await csvWriter.writeRecords(uniqueOffers.map(offer => ({
    ...offer,
    days: Array.isArray(offer.days) ? offer.days.join(', ') : offer.days || '',
  })));
  
  console.log(`✅ CSV guardado: ${csvPath}\n`);
  
  // Resumen por banco
  console.log(`${'═'.repeat(60)}`);
  console.log(`📋 RESUMEN POR BANCO:`);
  console.log(`${'═'.repeat(60)}`);
  
  const bankCounts = {};
  for (const offer of uniqueOffers) {
    bankCounts[offer.bankSlug] = (bankCounts[offer.bankSlug] || 0) + 1;
  }
  
  Object.entries(bankCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([bank, count]) => {
      console.log(`  ${bank.padEnd(30)} ${count.toString().padStart(4)} ofertas`);
    });
  
  console.log(`${'═'.repeat(60)}\n`);
  console.log(`✅ CONSOLIDACIÓN COMPLETADA\n`);
}

consolidateResults().catch(console.error);
