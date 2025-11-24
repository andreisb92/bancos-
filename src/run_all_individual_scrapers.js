import { getBanksCatalog } from './banks.js';
import got from 'got';

const BANKS = getBanksCatalog();

// Whitelist IP
async function whitelistIP() {
  console.log('🔐 Configurando whitelist de IP...');
  try {
    const ip = (await got('https://api.ipify.org')).body.trim();
    console.log(`   📍 IP: ${ip}`);
    const whitelistUrl = process.env.WHITELIST_URL;
    if (whitelistUrl) {
      await got(`${whitelistUrl}&ip_address=${encodeURIComponent(ip)}`, { timeout: { request: 10000 } });
      console.log('   ✅ IP registrada\n');
    }
  } catch (error) {
    console.error(`   ⚠️  Error: ${error.message}\n`);
  }
}

async function runAllScrapers() {
  console.log('\n' + '█'.repeat(100));
  console.log('🚀 EJECUTANDO TODOS LOS SCRAPERS INDIVIDUALES');
  console.log('█'.repeat(100));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 Total de bancos: ${BANKS.length}`);
  console.log('█'.repeat(100) + '\n');

  await whitelistIP();

  const results = [];
  let totalOfertas = 0;

  for (let i = 0; i < BANKS.length; i++) {
    const bank = BANKS[i];
    console.log(`\n${'═'.repeat(100)}`);
    console.log(`>>> BANCO ${i + 1}/${BANKS.length}: ${bank.name.toUpperCase()} <<<`);
    console.log('═'.repeat(100));

    try {
      // Importar y ejecutar el scraper específico
      const scraperModule = await import(`./scrapers/${bank.slug}.js`);
      const scraperFunction = Object.values(scraperModule)[0]; // Primera función exportada
      
      const startTime = Date.now();
      const result = await scraperFunction();
      const duration = Math.round((Date.now() - startTime) / 1000);

      results.push({
        ...result,
        duration,
        success: result.count > 0,
      });

      totalOfertas += result.count;

      console.log(`\n   ⏱️  Tiempo: ${duration}s`);
      console.log(`   ${result.count > 0 ? '✅ ÉXITO' : '⚠️  SIN DATOS'}\n`);

    } catch (error) {
      console.error(`\n   ❌ ERROR: ${error.message}\n`);
      results.push({
        bank: bank.name,
        slug: bank.slug,
        count: 0,
        pages: 0,
        success: false,
        error: error.message,
      });
    }

    // Pausa entre bancos
    if (i < BANKS.length - 1) {
      console.log('⏳ Esperando 5 segundos...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Resumen final
  console.log('\n' + '█'.repeat(100));
  console.log('📊 RESUMEN FINAL - TODOS LOS BANCOS');
  console.log('█'.repeat(100) + '\n');

  results.sort((a, b) => b.count - a.count);

  results.forEach((r, idx) => {
    const status = r.success ? '✅' : '❌';
    const pages = r.pages ? ` (${r.pages} páginas)` : '';
    const duration = r.duration ? ` - ${r.duration}s` : '';
    console.log(`${status} ${idx + 1}. ${r.bank}: ${r.count} ofertas${pages}${duration}`);
  });

  const exitosos = results.filter(r => r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const avgDuration = exitosos > 0 ? Math.round(totalDuration / exitosos) : 0;

  console.log('\n' + '─'.repeat(100));
  console.log(`🎯 TOTAL: ${totalOfertas} ofertas`);
  console.log(`✅ Exitosos: ${exitosos}/${BANKS.length} bancos (${Math.round(exitosos/BANKS.length*100)}%)`);
  console.log(`⏱️  Tiempo total: ${Math.round(totalDuration / 60)} minutos`);
  console.log(`⚡ Promedio: ${avgDuration}s por banco`);
  console.log('─'.repeat(100));

  // Consolidar
  console.log('\n💾 Consolidando resultados...');
  const { execa } = await import('execa');
  try {
    await execa('node', ['src/consolidate.js'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log('✅ Consolidación completa\n');
  } catch (error) {
    console.error('❌ Error en consolidación:', error.message);
  }

  console.log('📁 Archivos generados:');
  console.log('   - data/descuentos_all.json (consolidado)');
  console.log('   - data/descuentos_all.csv (consolidado)');
  console.log('   - data/descuentos-[banco].json (14 archivos individuales)');
  console.log('   - data/descuentos-[banco].csv (14 archivos individuales)\n');
  console.log('█'.repeat(100) + '\n');
}

runAllScrapers().catch(console.error);

