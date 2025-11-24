import { execa } from 'execa';
import { getBanksCatalog } from './banks.js';
import got from 'got';
import os from 'os';

const BANKS = getBanksCatalog();
const ALL_BANK_SLUGS = BANKS.map(b => b.slug);
const NUM_CORES = os.cpus().length;

// Agrupar bancos por lotes para procesamiento paralelo
const BATCH_SIZE = Math.min(NUM_CORES, 8); // Máximo 8 procesos simultáneos

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

async function scrapeBankProcess(bankSlug, useProxy = false) {
  const bank = BANKS.find(b => b.slug === bankSlug);
  const bankName = bank ? bank.name : bankSlug;
  
  console.log(`\n[${bankSlug}] 🏦 Iniciando scraping de ${bankName}...`);
  
  const args = [
    'src/index.js',
    `--bank=${bankSlug}`,
    '--maxRequests=500',
    '--navTimeout=120',
    '--headless=true',
  ];
  
  if (useProxy) {
    args.push('--concurrency=40');
    args.push('--proxy=http://198.20.189.134:50000');
  } else {
    args.push('--concurrency=15');
  }
  
  try {
    const startTime = Date.now();
    
    const { stdout, stderr } = await execa('node', args, {
      cwd: process.cwd(),
      timeout: 600000, // 10 minutos max por banco
      reject: false,
    });
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Parsear resultado del stdout
    const offerMatch = stdout.match(/(\d+)\s+descuentos?\s+extraído/i);
    const count = offerMatch ? parseInt(offerMatch[1]) : 0;
    
    if (count > 0) {
      console.log(`[${bankSlug}] ✅ COMPLETO: ${count} ofertas en ${duration}s`);
      return { bank: bankSlug, success: true, count, duration };
    } else {
      console.log(`[${bankSlug}] ⚠️  COMPLETO: 0 ofertas en ${duration}s`);
      return { bank: bankSlug, success: false, count: 0, duration };
    }
    
  } catch (error) {
    console.error(`[${bankSlug}] ❌ ERROR: ${error.message}`);
    return { bank: bankSlug, success: false, count: 0, error: error.message };
  }
}

async function scrapeBatch(bankSlugs, useProxy) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 LOTE: Scrapeando ${bankSlugs.length} bancos en PARALELO`);
  console.log(`   Bancos: ${bankSlugs.join(', ')}`);
  console.log(`   Proxy: ${useProxy ? 'ACTIVADO (40 conexiones c/u)' : 'DESACTIVADO'}`);
  console.log(`${'='.repeat(70)}`);
  
  const promises = bankSlugs.map(slug => scrapeBankProcess(slug, useProxy));
  const results = await Promise.all(promises);
  
  console.log(`\n✅ Lote completado`);
  return results;
}

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('🚀 SCRAPING MULTIPROCESO CON 40 PROXIES ROTATIVOS');
  console.log('█'.repeat(70));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 Total bancos: ${ALL_BANK_SLUGS.length}`);
  console.log(`💻 CPU cores: ${NUM_CORES}`);
  console.log(`⚡ Procesos paralelos: ${BATCH_SIZE}`);
  console.log('█'.repeat(70) + '\n');
  
  // Whitelist de IP
  const hasProxy = await whitelistIP();
  
  if (!hasProxy) {
    console.log('\n⚠️  Continuando SIN PROXY (más lento pero funcional)');
  }
  
  console.log(`\n🎯 Estrategia: ${BATCH_SIZE} bancos simultáneos por lote\n`);
  
  const allResults = [];
  const totalBatches = Math.ceil(ALL_BANK_SLUGS.length / BATCH_SIZE);
  
  // Procesar en lotes
  for (let i = 0; i < totalBatches; i++) {
    const batchStart = i * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, ALL_BANK_SLUGS.length);
    const batchBanks = ALL_BANK_SLUGS.slice(batchStart, batchEnd);
    
    console.log(`\n📦 LOTE ${i + 1}/${totalBatches}`);
    
    const batchResults = await scrapeBatch(batchBanks, hasProxy);
    allResults.push(...batchResults);
    
    // Pausa breve entre lotes
    if (i < totalBatches - 1) {
      console.log('\n⏸️  Pausa de 5 segundos antes del siguiente lote...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Resumen final
  console.log('\n' + '█'.repeat(70));
  console.log('📊 RESUMEN FINAL');
  console.log('█'.repeat(70) + '\n');
  
  let totalOfertas = 0;
  let exitosos = 0;
  let totalDuration = 0;
  
  allResults.sort((a, b) => b.count - a.count);
  
  for (const result of allResults) {
    const bank = BANKS.find(b => b.slug === result.bank);
    const bankName = bank ? bank.name : result.bank;
    const status = result.success && result.count > 0 ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}s)` : '';
    
    console.log(`${status} ${bankName}: ${result.count} ofertas${duration}`);
    
    totalOfertas += result.count;
    if (result.success && result.count > 0) exitosos++;
    if (result.duration) totalDuration += result.duration;
  }
  
  const avgDuration = exitosos > 0 ? Math.round(totalDuration / exitosos) : 0;
  
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🎯 TOTAL: ${totalOfertas} ofertas`);
  console.log(`✅ Exitosos: ${exitosos}/${ALL_BANK_SLUGS.length} bancos (${Math.round(exitosos/ALL_BANK_SLUGS.length*100)}%)`);
  console.log(`⏱️  Tiempo promedio: ${avgDuration}s por banco`);
  console.log(`⚡ Velocidad: ${hasProxy ? 'TURBO (40 conexiones/banco)' : 'NORMAL (15 conexiones/banco)'}`);
  
  console.log(`\n💾 Consolidando resultados...`);
  
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
  console.log('   - data/descuentos-[banco].csv (individuales)');
  console.log('\n' + '█'.repeat(70) + '\n');
}

main().catch(console.error);

