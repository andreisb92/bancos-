import { execa } from 'execa';
import { getBanksCatalog } from './banks.js';
import got from 'got';
import os from 'os';

const BANKS = getBanksCatalog();
const ALL_BANK_SLUGS = BANKS.map(b => b.slug);
const NUM_CORES = os.cpus().length;

// ULTRA-AGRESIVO: Un proceso por banco, usando TODOS los 40 proxies
const MAX_CONCURRENT = ALL_BANK_SLUGS.length; // Un proceso por banco

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
    '--maxRequests=800', // Más requests por banco
    '--navTimeout=150',  // Timeout más largo
    '--headless=true',
  ];
  
  if (useProxy) {
    args.push('--concurrency=40'); // Máxima concurrencia
    args.push('--proxy=http://198.20.189.134:50000');
  } else {
    args.push('--concurrency=20'); // Más concurrencia sin proxy
  }
  
  try {
    const startTime = Date.now();
    
    const { stdout, stderr } = await execa('node', args, {
      cwd: process.cwd(),
      timeout: 900000, // 15 minutos max por banco
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

async function main() {
  console.log('\n' + '█'.repeat(80));
  console.log('🚀🚀🚀 SCRAPING ULTRA-AGRESIVO: 40 PROXIES + TODOS LOS BANCOS SIMULTÁNEOS');
  console.log('█'.repeat(80));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 Total bancos: ${ALL_BANK_SLUGS.length}`);
  console.log(`💻 CPU cores: ${NUM_CORES}`);
  console.log(`⚡ Procesos simultáneos: ${MAX_CONCURRENT} (UNO POR BANCO)`);
  console.log(`🔥 Concurrencia por banco: 40 conexiones`);
  console.log('█'.repeat(80) + '\n');
  
  // Whitelist de IP
  const hasProxy = await whitelistIP();
  
  if (!hasProxy) {
    console.log('\n⚠️  Continuando SIN PROXY (más lento pero funcional)');
  }
  
  console.log(`\n🎯 Estrategia: TODOS LOS ${ALL_BANK_SLUGS.length} BANCOS SIMULTÁNEOS\n`);
  
  const startTime = Date.now();
  
  // Ejecutar TODOS los bancos simultáneamente
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 LANZANDO: ${ALL_BANK_SLUGS.length} bancos en PARALELO TOTAL`);
  console.log(`   Bancos: ${ALL_BANK_SLUGS.join(', ')}`);
  console.log(`   Proxy: ${hasProxy ? 'ACTIVADO (40 conexiones c/u)' : 'DESACTIVADO (20 conexiones c/u)'}`);
  console.log(`${'='.repeat(80)}`);
  
  const promises = ALL_BANK_SLUGS.map(slug => scrapeBankProcess(slug, hasProxy));
  const allResults = await Promise.all(promises);
  
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  
  // Resumen final
  console.log('\n' + '█'.repeat(80));
  console.log('📊 RESUMEN FINAL ULTRA-AGRESIVO');
  console.log('█'.repeat(80) + '\n');
  
  let totalOfertas = 0;
  let exitosos = 0;
  let totalDurationBanks = 0;
  
  allResults.sort((a, b) => b.count - a.count);
  
  for (const result of allResults) {
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
  
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`🎯 TOTAL: ${totalOfertas} ofertas`);
  console.log(`✅ Exitosos: ${exitosos}/${ALL_BANK_SLUGS.length} bancos (${Math.round(exitosos/ALL_BANK_SLUGS.length*100)}%)`);
  console.log(`⏱️  Tiempo total: ${totalDuration}s (${Math.round(totalDuration/60)} minutos)`);
  console.log(`⚡ Tiempo promedio: ${avgDuration}s por banco`);
  console.log(`🔥 Velocidad: ${hasProxy ? 'ULTRA-TURBO (40 conexiones/banco)' : 'TURBO (20 conexiones/banco)'}`);
  
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
  console.log('\n' + '█'.repeat(80) + '\n');
}

main().catch(console.error);

