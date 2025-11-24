import fs from 'fs';

try {
  const data = JSON.parse(fs.readFileSync('data/descuentos_all.json', 'utf8'));
  
  const summary = data.reduce((acc, item) => {
    acc[item.bank] = (acc[item.bank] || 0) + 1;
    return acc;
  }, {});
  
  console.log('📊 RESUMEN DE OFERTAS POR BANCO:');
  console.log('=====================================');
  
  Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .forEach(([bank, count]) => {
      console.log(`${bank}: ${count} ofertas`);
    });
  
  console.log(`\n🎯 TOTAL: ${data.length} ofertas de ${Object.keys(summary).length} bancos`);
  
  // Mostrar algunos ejemplos de ofertas
  console.log('\n💡 EJEMPLOS DE OFERTAS EXTRAÍDAS:');
  console.log('==================================');
  data.slice(0, 5).forEach((offer, i) => {
    console.log(`${i + 1}. ${offer.bank}: ${offer.title} (${offer.discount})`);
  });
  
} catch (error) {
  console.error('Error:', error.message);
}
