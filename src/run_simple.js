import { execa } from 'execa';
import { getBanksCatalog } from './banks.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Script simple y efectivo para ejecutar bancos que funcionan
async function runSimpleScraping() {
  console.log('🚀 SCRAPING SIMPLE DE DESCUENTOS BANCARIOS');
  console.log('=' .repeat(50));
  
  // Solo bancos que sabemos que funcionan bien
  const workingBanks = [
    'security', 'edwards', 'cencosud-scotiabank', 'consorcio', 'internacional'
  ];
  
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

  for (const bankSlug of workingBanks) {
    console.log(`\n🏦 Procesando: ${bankSlug}`);
    console.log('-'.repeat(30));
    
    try {
      const startTime = Date.now();
      
      await execa('npm', ['run', 'crawl', '--', `--bank=${bankSlug}`, '--maxRequests=20', '--concurrency=1', '--navTimeout=30', '--headless=true', '--proxy=http://198.20.189.134:50000'], {
        stdio: 'inherit',
        timeout: 120000 // 2 minutos por banco
      });
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ ${bankSlug} completado en ${duration}s`);
      results.success.push(bankSlug);
      
    } catch (error) {
      console.log(`❌ Error en ${bankSlug}: ${error.message}`);
      results.failed.push({ bank: bankSlug, error: error.message });
    }
  }

  // Consolidar datos
  console.log('\n📊 CONSOLIDANDO DATOS...');
  try {
    await execa('npm', ['run', 'consolidate'], {
      stdio: 'inherit',
    });
    
    // Leer estadísticas finales
    const allDataPath = path.join(process.cwd(), 'data', 'descuentos_all.json');
    if (await fs.access(allDataPath).then(() => true).catch(() => false)) {
      const allData = JSON.parse(await fs.readFile(allDataPath, 'utf8'));
      results.totalDescuentos = allData.length;
      console.log('✅ Datos consolidados exitosamente');
    } else {
      console.log('⚠️  No se encontró archivo consolidado');
    }
  } catch (error) {
    console.log(`❌ Error consolidando: ${error.message}`);
  }

  // Mostrar resumen final
  console.log('\n' + '='.repeat(50));
  console.log('📈 RESUMEN FINAL');
  console.log('='.repeat(50));
  console.log(`✅ Bancos exitosos: ${results.success.length}/${workingBanks.length}`);
  console.log(`❌ Bancos fallidos: ${results.failed.length}`);
  console.log(`💰 Total descuentos encontrados: ${results.totalDescuentos}`);
  
  if (results.success.length > 0) {
    console.log('\n🏆 BANCOS EXITOSOS:');
    results.success.forEach(slug => console.log(`  - ${slug}`));
  }
  
  if (results.failed.length > 0) {
    console.log('\n⚠️  BANCOS CON PROBLEMAS:');
    results.failed.forEach(fail => console.log(`  - ${fail.bank}: ${fail.error}`));
  }

  console.log('\n📁 Archivos generados en: ./data/');
  console.log('  - descuentos_all.json (consolidado)');
  console.log('  - descuentos-{banco}.json (individuales)');
  
  console.log('\n🎉 SCRAPING SIMPLE FINALIZADO');
  console.log('='.repeat(50));
}

runSimpleScraping().catch(console.error);

