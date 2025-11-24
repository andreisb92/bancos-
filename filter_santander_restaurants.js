import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';

async function filterSantanderRestaurants() {
  console.log('\n🍽️  FILTRANDO SANTANDER - SOLO RESTAURANTES Y TODOS\n');
  
  const dataDir = path.join(process.cwd(), 'data');
  const santanderDir = path.join(dataDir, 'santander');
  
  // Leer archivo con categorías
  const categoriesFile = 'santander_v7_categories_2025-10-20T22-54-45.json';
  const categoriesPath = path.join(santanderDir, categoriesFile);
  
  if (!fs.existsSync(categoriesPath)) {
    console.log('❌ Archivo de categorías no encontrado');
    return;
  }
  
  const allOffers = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8'));
  console.log(`📊 Total de ofertas en archivo: ${allOffers.length}`);
  
  // Filtrar solo "Todos" y "Sabores"
  const filteredOffers = allOffers.filter(offer => 
    offer.category === 'Todos' || offer.category === 'Sabores'
  );
  
  console.log(`📊 Ofertas filtradas (Todos + Sabores): ${filteredOffers.length}`);
  
  // Eliminar duplicados (mismo título y descuento)
  const uniqueOffers = [];
  const seen = new Set();
  
  for (const offer of filteredOffers) {
    const key = `${offer.title}-${offer.discount}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueOffers.push(offer);
    }
  }
  
  console.log(`📊 Ofertas únicas después de deduplicar: ${uniqueOffers.length}`);
  
  // Resumen por categoría
  const categoryCounts = {};
  for (const offer of uniqueOffers) {
    categoryCounts[offer.category] = (categoryCounts[offer.category] || 0) + 1;
  }
  
  console.log(`\n📊 Ofertas por categoría:`);
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`   - ${cat}: ${count} ofertas`);
    });
  
  // Guardar archivos
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  // Guardar JSON
  const jsonPath = path.join(santanderDir, `santander_restaurants_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
  console.log(`\n💾 JSON guardado: ${jsonPath}`);
  
  // Guardar CSV
  const csvPath = path.join(santanderDir, `santander_restaurants_${timestamp}.csv`);
  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: 'title', title: 'title' },
      { id: 'merchant', title: 'merchant' },
      { id: 'discount', title: 'discount' },
      { id: 'category', title: 'category' },
      { id: 'terms', title: 'terms' },
      { id: 'imageUrl', title: 'imageUrl' },
      { id: 'linkUrl', title: 'linkUrl' },
      { id: 'url', title: 'url' },
      { id: 'bankSlug', title: 'bankSlug' },
    ],
  });
  
  await csvWriter.writeRecords(uniqueOffers);
  console.log(`💾 CSV guardado: ${csvPath}`);
  
  console.log(`\n✅ FILTRADO DE RESTAURANTES COMPLETADO\n`);
}

filterSantanderRestaurants().catch(console.error);

