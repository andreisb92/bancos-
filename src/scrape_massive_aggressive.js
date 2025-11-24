import { execa } from 'execa';
import { getBanksCatalog } from './banks.js';
import got from 'got';

const BANKS = getBanksCatalog();
const ALL_BANKS = BANKS.map(b => b.slug);

// Estrategias agresivas por banco
const STRATEGIES = {
  // Bancos que sabemos que funcionan
  'consorcio': { headless: true, concurrency: 10, navTimeout: 60, proxy: true },
  'cencosud-scotiabank': { headless: true, concurrency: 10, navTimeout: 60, proxy: true },
  'edwards': { headless: true, concurrency: 10, navTimeout: 60, proxy: true },
  'security': { headless: true, concurrency: 10, navTimeout: 60, proxy: true },
  'banco-de-chile': { headless: true, concurrency: 10, navTimeout: 60, proxy: true },

  // Bancos difíciles - probar múltiples estrategias
  'bancoestado': { headless: false, concurrency: 5, navTimeout: 120, proxy: true },
  'santander': { headless: false, concurrency: 3, navTimeout: 120, proxy: true },
  'bci': { headless: false, concurrency: 5, navTimeout: 90, proxy: true },
  'itau': { headless: false, concurrency: 3, navTimeout: 120, proxy: true },
  'scotiabank': { headless: false, concurrency: 5, navTimeout: 90, proxy: true },
  'falabella-cmr': { headless: false, concurrency: 5, navTimeout: 90, proxy: true },
  'bice': { headless: false, concurrency: 3, navTimeout: 120, proxy: true },
  'ripley': { headless: false, concurrency: 5, navTimeout: 90, proxy: true },
  'internacional': { headless: false, concurrency: 3, navTimeout: 120, proxy: true },
};

async function whitelistIP() {
  console.log('🔐 Configurando whitelist de IP...');
  try {
    const ip = (await got('https://api.ipify.org')).body.trim();
    console.log(`   📍 IP: ${ip}`);

    const whitelistUrl = process.env.WHITELIST_URL;
    if (whitelistUrl) {
      const url = `${whitelistUrl}&ip_address=${encodeURIComponent(ip)}`;
      await got(url, { timeout: { request: 10000 } });
      console.log('   ✅ IP registrada en whitelist');
      return true;
    } else {
      console.log('   ⚠️  WHITELIST_URL no configurada');
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function scrapeBank(bankSlug) {
  const bank = BANKS.find(b => b.slug === bankSlug);
  if (!bank) return { success: false, count: 0 };

  const strategy = STRATEGIES[bankSlug] || { headless: true, concurrency: 10, navTimeout: 60, proxy: true };

  console.log(`\n🏦 [${bankSlug}] ${bank.name} - Estrategia: headless=${strategy.headless}, concurrency=${strategy.concurrency}, timeout=${strategy.navTimeout}s`);

  const args = [
    'src/index.js',
    `--bank=${bankSlug}`,
    '--maxRequests=800',
    `--concurrency=${strategy.concurrency}`,
    `--navTimeout=${strategy.navTimeout}`,
    `--headless=${strategy.headless}`,
  ];

  if (strategy.proxy) {
    args.push('--proxy=http://198.20.189.134:50000');
  }

  try {
    const startTime = Date.now();

    const { stdout, stderr } = await execa('node', args, {
      cwd: process.cwd(),
      timeout: 900000, // 15 minutos max
      reject: false,
    });

    const duration = Math.round((Date.now() - startTime) / 1000);
    const offerMatch = stdout.match(/(\d+)\s+descuentos?\s+extraído/i);
    const count = offerMatch ? parseInt(offerMatch[1]) : 0;

    if (count > 0) {
      console.log(`[${bankSlug}] ✅ ÉXITO: ${count} ofertas en ${duration}s`);
      return { bank: bankSlug, success: true, count, duration };
    } else {
      console.log(`[${bankSlug}] ⚠️  Sin ofertas: ${duration}s`);
      return { bank: bankSlug, success: false, count: 0, duration };
    }

  } catch (error) {
    console.error(`[${bankSlug}] ❌ Error: ${error.message}`);
    return { bank: bankSlug, success: false, count: 0, error: error.message };
  }
}

async function main() {
  console.log('\n' + '█'.repeat(100));
  console.log('🚀🚀🚀 SCRAPING MASIVO ULTRA-AGRESIVO: TODOS LOS BANCOS CHILENOS');
  console.log('█'.repeat(100));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 Total bancos: ${ALL_BANKS.length}`);
  console.log(`⚡ Estrategias específicas por banco`);
  console.log('█'.repeat(100) + '\n');

  await whitelistIP();

  console.log(`\n🎯 Ejecución en paralelo: ${ALL_BANKS.length} bancos simultáneos\n`);

  const startTime = Date.now();

  // Ejecutar TODOS los bancos simultáneamente
  const promises = ALL_BANKS.map(slug => scrapeBank(slug));
  const results = await Promise.all(promises);

  const totalDuration = Math.round((Date.now() - startTime) / 1000);

  // Resumen final
  console.log('\n' + '█'.repeat(100));
  console.log('📊 RESUMEN FINAL MASIVO');
  console.log('█'.repeat(100) + '\n');

  let totalOfertas = 0;
  let exitosos = 0;
  let totalDurationBanks = 0;

  results.sort((a, b) => b.count - a.count);

  for (const result of results) {
    const bank = BANKS.find(b => b.slug === result.bank);
    const bankName = bank ? bank.name : result.bank;
    const status = result.success && result.count > 0 ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}s)` : '';

    console.log(`${status} ${bankName}: ${result.count} ofertas${duration}`);

    totalOfertas += result.count;
    if (result.success && result.count > 0) exitosos++;
    if (result.duration) totalDurationBanks += result.duration;
  }

  const avgDuration = exitosos > 0 ? Math.round(totalDurationBanks / exitosos) : 0;

  console.log(`\n${'─'.repeat(100)}`);
  console.log(`🎯 TOTAL: ${totalOfertas} ofertas`);
  console.log(`✅ Exitosos: ${exitosos}/${ALL_BANKS.length} bancos (${Math.round(exitosos/ALL_BANKS.length*100)}%)`);
  console.log(`⏱️  Tiempo total: ${totalDuration}s (${Math.round(totalDuration/60)} minutos)`);
  console.log(`⚡ Tiempo promedio: ${avgDuration}s por banco`);

  console.log('\n💾 Consolidando resultados...');

  try {
    await execa('node', ['src/consolidate.js'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log('✅ Consolidación completa');
  } catch (error) {
    console.error('❌ Error en consolidación:', error.message);
  }

  console.log('\n📁 Archivos generados:');
  console.log('   - data/descuentos_all.json (consolidado)');
  console.log('   - data/descuentos-[banco].json (individuales)');
  console.log('\n' + '█'.repeat(100) + '\n');
}

main().catch(console.error);
