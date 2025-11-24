import { execa } from 'execa';
import { getBanksCatalog } from './banks.js';
import got from 'got';

const BANKS = getBanksCatalog();
const DIFFICULT_BANKS = ['bancoestado', 'santander', 'banco-de-chile', 'itau', 'scotiabank'];

async function whitelistIP() {
  console.log('🔐 Configurando whitelist de IP para proxy...');
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

async function scrapeDifficultBank(bankSlug) {
  const bank = BANKS.find(b => b.slug === bankSlug);
  const bankName = bank ? bank.name : bankSlug;

  console.log(`\n[${bankSlug}] 🚀 Iniciando scraping ultra-agresivo de ${bankName}...`);

  // Estrategias múltiples para bancos difíciles
  const strategies = [
    {
      name: 'Headless + Proxy + SlowMo',
      headless: false,
      proxy: 'http://198.20.189.134:50000',
      concurrency: 1,
      slowMo: 1000,
    },
    {
      name: 'Headless + Proxy + Delays',
      headless: false,
      proxy: 'http://198.20.189.134:50000',
      concurrency: 2,
      delay: 3000,
    },
    {
      name: 'Sin Headless + Proxy + Viewport',
      headless: false,
      proxy: 'http://198.20.189.134:50000',
      concurrency: 1,
      viewport: '1920x1080',
    },
  ];

  for (const strategy of strategies) {
    console.log(`\n[${bankSlug}] 🔧 Probando estrategia: ${strategy.name}`);

    const args = [
      'src/index.js',
      `--bank=${bankSlug}`,
      '--maxRequests=500',
      '--navTimeout=200',
      '--headless=' + strategy.headless,
      '--concurrency=' + strategy.concurrency,
    ];

    if (strategy.proxy) {
      args.push('--proxy=' + strategy.proxy);
    }

    try {
      const { stdout, stderr } = await execa('node', args, {
        cwd: process.cwd(),
        timeout: 600000, // 10 minutos por estrategia
        reject: false,
      });

      // Parsear resultado
      const offerMatch = stdout.match(/(\d+)\s+descuentos?\s+extraído/i);
      const count = offerMatch ? parseInt(offerMatch[1]) : 0;

      if (count > 0) {
        console.log(`[${bankSlug}] ✅ ÉXITO con estrategia "${strategy.name}": ${count} ofertas`);
        return { bank: bankSlug, success: true, count, strategy: strategy.name };
      } else {
        console.log(`[${bankSlug}] ❌ Falló estrategia "${strategy.name}": 0 ofertas`);
      }

    } catch (error) {
      console.error(`[${bankSlug}] ❌ Error en estrategia "${strategy.name}": ${error.message}`);
    }
  }

  console.log(`[${bankSlug}] 💥 Todas las estrategias fallaron`);
  return { bank: bankSlug, success: false, count: 0 };
}

async function main() {
  console.log('\n' + '█'.repeat(90));
  console.log('🚀🚀🚀 SCRAPING ULTRA-AGRESIVO PARA BANCOS DIFÍCILES');
  console.log('█'.repeat(90));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 Bancos difíciles: ${DIFFICULT_BANKS.join(', ')}`);
  console.log(`⚡ Estrategias múltiples por banco`);
  console.log('█'.repeat(90) + '\n');

  // Whitelist de IP
  await whitelistIP();

  console.log(`\n🎯 Procesando bancos difíciles uno por uno...\n`);

  const results = [];
  for (const bankSlug of DIFFICULT_BANKS) {
    const result = await scrapeDifficultBank(bankSlug);
    results.push(result);

    // Pausa entre bancos
    if (bankSlug !== DIFFICULT_BANKS[DIFFICULT_BANKS.length - 1]) {
      console.log(`\n⏸️  Pausa de 10 segundos antes del siguiente banco...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  // Resumen final
  console.log('\n' + '█'.repeat(90));
  console.log('📊 RESUMEN FINAL BANCOS DIFÍCILES');
  console.log('█'.repeat(90) + '\n');

  let totalOfertas = 0;
  let exitosos = 0;

  results.sort((a, b) => b.count - a.count);

  for (const result of results) {
    const bank = BANKS.find(b => b.slug === result.bank);
    const bankName = bank ? bank.name : result.bank;
    const status = result.success ? '✅' : '❌';
    const strategy = result.strategy ? ` (${result.strategy})` : '';

    console.log(`${status} ${bankName}: ${result.count} ofertas${strategy}`);

    totalOfertas += result.count;
    if (result.success) exitosos++;
  }

  console.log(`\n${'─'.repeat(90)}`);
  console.log(`🎯 TOTAL: ${totalOfertas} ofertas`);
  console.log(`✅ Éxito: ${exitosos}/${DIFFICULT_BANKS.length} bancos (${Math.round(exitosos/DIFFICULT_BANKS.length*100)}%)`);

  console.log('\n💾 Consolidando resultados...');

  try {
    await execa('npm', ['run', 'consolidate'], {
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
  console.log('\n' + '█'.repeat(90) + '\n');
}

main().catch(console.error);

