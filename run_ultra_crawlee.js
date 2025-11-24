import { spawn } from 'child_process';
import { getBanksCatalog } from './src/banks.js';
import got from 'got';
import os from 'os';

const BANKS = getBanksCatalog();
const ALL_BANK_SLUGS = BANKS.map(b => b.slug);

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

function runCrawleeBank(bankSlug) {
  return new Promise((resolve) => {
    const bank = BANKS.find(b => b.slug === bankSlug);
    const bankName = bank ? bank.name : bankSlug;
    
    console.log(`\n[${bankSlug}] 🚀 Iniciando Crawlee para ${bankName}...`);
    
    const startTime = Date.now();
    
    // Usar Crawlee directamente con configuración ultra-agresiva
    const crawleeProcess = spawn('npx', [
      'crawlee', 'run',
      '--script=start',
      '--no-purge'
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BANK_SLUG: bankSlug,
        MAX_REQUESTS: '1000',
        CONCURRENCY: '40',
        NAV_TIMEOUT: '180',
        HEADLESS: 'true',
        PROXY_SERVER: 'http://198.20.189.134:50000',
        USE_PROXY: 'true'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    crawleeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    crawleeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    crawleeProcess.on('close', (code) => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      // Parsear resultado
      const offerMatch = stdout.match(/(\d+)\s+descuentos?\s+extraído/i);
      const count = offerMatch ? parseInt(offerMatch[1]) : 0;
      
      if (count > 0) {
        console.log(`[${bankSlug}] ✅ COMPLETO: ${count} ofertas en ${duration}s`);
        resolve({ bank: bankSlug, success: true, count, duration });
      } else {
        console.log(`[${bankSlug}] ⚠️  COMPLETO: 0 ofertas en ${duration}s`);
        resolve({ bank: bankSlug, success: false, count: 0, duration });
      }
    });
    
    crawleeProcess.on('error', (error) => {
      console.error(`[${bankSlug}] ❌ ERROR: ${error.message}`);
      resolve({ bank: bankSlug, success: false, count: 0, error: error.message });
    });
    
    // Timeout de 20 minutos por banco
    setTimeout(() => {
      crawleeProcess.kill();
      console.log(`[${bankSlug}] ⏰ TIMEOUT: Proceso terminado por tiempo`);
      resolve({ bank: bankSlug, success: false, count: 0, error: 'Timeout' });
    }, 20 * 60 * 1000);
  });
}

async function main() {
  console.log('\n' + '█'.repeat(80));
  console.log('🚀🚀🚀 CRAWLEE ULTRA-AGRESIVO: 40 PROXIES + TODOS LOS BANCOS SIMULTÁNEOS');
  console.log('█'.repeat(80));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 Total bancos: ${ALL_BANK_SLUGS.length}`);
  console.log(`💻 CPU cores: ${os.cpus().length}`);
  console.log(`⚡ Procesos Crawlee simultáneos: ${ALL_BANK_SLUGS.length} (UNO POR BANCO)`);
  console.log(`🔥 Concurrencia por banco: 40 conexiones`);
  console.log('█'.repeat(80) + '\n');
  
  // Whitelist de IP
  const hasProxy = await whitelistIP();
  
  if (!hasProxy) {
    console.log('\n⚠️  Continuando SIN PROXY (más lento pero funcional)');
  }
  
  console.log(`\n🎯 Estrategia: TODOS LOS ${ALL_BANK_SLUGS.length} BANCOS CON CRAWLEE SIMULTÁNEOS\n`);
  
  const startTime = Date.now();
  
  // Ejecutar TODOS los bancos con Crawlee simultáneamente
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 LANZANDO: ${ALL_BANK_SLUGS.length} procesos Crawlee en PARALELO TOTAL`);
  console.log(`   Bancos: ${ALL_BANK_SLUGS.join(', ')}`);
  console.log(`   Proxy: ${hasProxy ? 'ACTIVADO (40 conexiones c/u)' : 'DESACTIVADO'}`);
  console.log(`${'='.repeat(80)}`);
  
  const promises = ALL_BANK_SLUGS.map(slug => runCrawleeBank(slug));
  const allResults = await Promise.all(promises);
  
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  
  // Resumen final
  console.log('\n' + '█'.repeat(80));
  console.log('📊 RESUMEN FINAL CRAWLEE ULTRA-AGRESIVO');
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
  console.log(`🔥 Velocidad: ${hasProxy ? 'ULTRA-TURBO CRAWLEE (40 conexiones/banco)' : 'TURBO CRAWLEE (20 conexiones/banco)'}`);
  
  console.log('\n📁 Archivos generados:');
  console.log('   - data/descuentos_all.json (consolidado)');
  console.log('   - data/descuentos-[banco].json (individuales)');
  console.log('   - data/descuentos-[banco].csv (individuales)');
  console.log('\n' + '█'.repeat(80) + '\n');
}

main().catch(console.error);

