import { execa } from 'execa';
import { getBanksCatalog } from './banks.js';
import { log } from 'crawlee';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Script final optimizado para ejecutar todos los bancos
async function runFinalScraping() {
  console.log('🚀 INICIANDO SCRAPING FINAL DE DESCUENTOS BANCARIOS');
  console.log('=' .repeat(60));
  
  const banks = getBanksCatalog();
  const results = {
    success: [],
    failed: [],
    totalDescuentos: 0
  };

  // Limpiar datos anteriores
  try {
    await fs.rmdir(path.join(process.cwd(), 'data'), { recursive: true });
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
    console.log('✅ Directorio de datos limpiado');
  } catch (error) {
    console.log('⚠️  No se pudo limpiar directorio anterior');
  }

  for (const bank of banks) {
    console.log(`\n🏦 Procesando: ${bank.name} (${bank.slug})`);
    console.log('-'.repeat(40));
    
    try {
      const startTime = Date.now();
      
      await execa('npm', ['run', 'crawl', '--', `--bank=${bank.slug}`, '--maxRequests=30', '--concurrency=2', '--navTimeout=45', '--headless=true', '--proxy=http://198.20.189.134:50000'], {
        stdio: 'inherit',
        cwd: process.cwd(),
        timeout: 180000 // 3 minutos por banco
      });
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ ${bank.name} completado en ${duration}s`);
      results.success.push(bank.slug);
      
    } catch (error) {
      console.log(`❌ Error en ${bank.name}: ${error.message}`);
      results.failed.push({ bank: bank.slug, error: error.message });
    }
  }

  // Consolidar datos
  console.log('\n📊 CONSOLIDANDO DATOS...');
  try {
    await execa('npm', ['run', 'consolidate'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    
    // Leer estadísticas finales
    const allDataPath = path.join(process.cwd(), 'data', 'descuentos_all.json');
    const allData = JSON.parse(await fs.readFile(allDataPath, 'utf8'));
    results.totalDescuentos = allData.length;
    
    console.log('✅ Datos consolidados exitosamente');
  } catch (error) {
    console.log(`❌ Error consolidando: ${error.message}`);
  }

  // Mostrar resumen final
  console.log('\n' + '='.repeat(60));
  console.log('📈 RESUMEN FINAL');
  console.log('='.repeat(60));
  console.log(`✅ Bancos exitosos: ${results.success.length}/${banks.length}`);
  console.log(`❌ Bancos fallidos: ${results.failed.length}`);
  console.log(`💰 Total descuentos encontrados: ${results.totalDescuentos}`);
  
  if (results.success.length > 0) {
    console.log('\n🏆 BANCOS EXITOSOS:');
    results.success.forEach(slug => {
      const bank = banks.find(b => b.slug === slug);
      console.log(`  - ${bank.name}`);
    });
  }
  
  if (results.failed.length > 0) {
    console.log('\n⚠️  BANCOS CON PROBLEMAS:');
    results.failed.forEach(fail => {
      const bank = banks.find(b => b.slug === fail.bank);
      console.log(`  - ${bank.name}: ${fail.error}`);
    });
  }

  console.log('\n📁 Archivos generados en: ./data/');
  console.log('  - descuentos_all.json (consolidado)');
  console.log('  - descuentos-{banco}.json (individuales)');
  console.log('  - descuentos-{banco}.csv (CSV)');
  
  console.log('\n🎉 SCRAPING FINALIZADO');
  console.log('='.repeat(60));
}

runFinalScraping().catch(console.error);
