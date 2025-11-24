import { execa } from 'execa';
import { getBanksCatalog } from './banks.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function runAllOffers() {
  console.log('🚀 SCRAPING COMPLETO DE TODAS LAS OFERTAS');
  console.log('============================================================');

  const banks = getBanksCatalog();
  const results = {
    success: [],
    failed: [],
    totalDescuentos: 0,
  };

  // Bancos prioritarios que funcionan bien
  const priorityBanks = ['cencosud-scotiabank', 'consorcio', 'edwards', 'security', 'banco-de-chile'];
  
  // Bancos que requieren configuración especial
  const challengingBanks = ['bancoestado', 'santander', 'bci', 'itau', 'scotiabank', 'falabella-cmr', 'bice', 'ripley', 'internacional'];

  console.log('📊 FASE 1: Scraping de bancos prioritarios (configuración estándar)');
  console.log('==================================================');

  for (const bankSlug of priorityBanks) {
    const bank = banks.find(b => b.slug === bankSlug);
    if (!bank) continue;

    console.log(`\n🏦 Procesando: ${bank.name} (${bank.slug})`);
    console.log('-'.repeat(40));

    try {
      const startTime = Date.now();

      await execa('npm', ['run', 'crawl', '--', 
        `--bank=${bank.slug}`, 
        '--maxRequests=100',  // MÁS requests para obtener TODAS las ofertas
        '--concurrency=2', 
        '--navTimeout=60', 
        '--headless=false',  // Sin headless para evitar detección
        '--proxy=http://198.20.189.134:50000'
      ], {
        stdio: 'inherit',
        cwd: process.cwd(),
        timeout: 300000 // 5 minutos por banco
      });

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ ${bank.name} completado en ${duration}s`);
      results.success.push(bank.slug);

    } catch (error) {
      console.error(`❌ Error en ${bank.name}: ${error.message}`);
      results.failed.push({ bank: bank.slug, error: error.message });
    }
  }

  console.log('\n📊 FASE 2: Scraping de bancos desafiantes (configuración especial)');
  console.log('==================================================');

  for (const bankSlug of challengingBanks) {
    const bank = banks.find(b => b.slug === bankSlug);
    if (!bank) continue;

    console.log(`\n🏦 Procesando: ${bank.name} (${bank.slug})`);
    console.log('-'.repeat(40));

    try {
      const startTime = Date.now();

      await execa('npm', ['run', 'crawl', '--', 
        `--bank=${bank.slug}`, 
        '--maxRequests=150',  // AÚN MÁS requests
        '--concurrency=1',    // Concurrencia 1 para evitar bloqueos
        '--navTimeout=90',    // Timeout largo
        '--headless=false',   // Sin headless
        '--proxy=http://198.20.189.134:50000'
      ], {
        stdio: 'inherit',
        cwd: process.cwd(),
        timeout: 420000 // 7 minutos por banco
      });

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ ${bank.name} completado en ${duration}s`);
      results.success.push(bank.slug);

    } catch (error) {
      console.error(`❌ Error en ${bank.name}: ${error.message}`);
      results.failed.push({ bank: bank.slug, error: error.message });
    }
  }

  // Consolidar datos
  console.log('\n📊 CONSOLIDANDO TODOS LOS DATOS...');
  try {
    await execa('npm', ['run', 'consolidate'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    // Leer estadísticas finales
    const allDataPath = path.join(process.cwd(), 'data', 'descuentos_all.json');
    const allData = JSON.parse(await fs.readFile(allDataPath, 'utf8'));
    results.totalDescuentos = allData.length;

    console.log('✅ Datos consolidados exitosamente.');
  } catch (error) {
    console.error(`❌ Error consolidando: ${error.message}`);
  }

  console.log('\n============================================================');
  console.log('📈 RESUMEN FINAL COMPLETO');
  console.log('============================================================');
  console.log(`✅ Bancos exitosos: ${results.success.length}/${banks.length}`);
  console.log(`❌ Bancos fallidos: ${results.failed.length}`);
  console.log(`💰 TOTAL DESCUENTOS ENCONTRADOS: ${results.totalDescuentos}`);

  if (results.success.length > 0) {
    console.log('\n🏆 BANCOS EXITOSOS:');
    results.success.forEach((slug) => {
      const bank = banks.find(b => b.slug === slug);
      console.log(`  ✓ ${bank?.name || slug}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n⚠️  BANCOS CON PROBLEMAS:');
    results.failed.forEach((f) => {
      const bank = banks.find(b => b.slug === f.bank);
      console.log(`  ✗ ${bank?.name || f.bank}`);
    });
  }

  console.log('\n📁 Archivos generados en: ./data/');
  console.log('  - descuentos_all.json (CONSOLIDADO CON TODAS LAS OFERTAS)');
  console.log('  - descuentos-{banco}.json (individuales)');
  console.log('  - descuentos-{banco}.csv (CSV)');
  console.log('\n🎉 SCRAPING DE TODAS LAS OFERTAS FINALIZADO');
  console.log('============================================================');
}

runAllOffers().catch(console.error);

