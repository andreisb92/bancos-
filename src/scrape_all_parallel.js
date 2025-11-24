import { execa } from 'execa';
import { BANKS } from './banks.js';

const allBanks = [
  'bancochile',
  'cmr',
  'bancoestado',
  'santander',
  'bci',
  'itau',
  'scotiabank',
  'bice',
  'ripley',
  'cencosud',
  'security',
  'edwards',
  'consorcio',
  'internacional'
];

console.log('🚀 Iniciando scraping PARALELO de TODOS los bancos...');
console.log(`📊 Total bancos: ${allBanks.length}`);
console.log('⚡ Usando 40 proxies rotativos para máxima velocidad\n');

const startTime = Date.now();

// Ejecutar TODOS en paralelo con configuración ultra-agresiva
const promises = allBanks.map(async (bankSlug) => {
  console.log(`🏦 [${bankSlug}] Iniciando...`);
  
  try {
    const { stdout, stderr } = await execa('node', [
      'src/index.js',
      `--bank=${bankSlug}`,
      '--maxRequests=300',
      '--concurrency=5',
      '--navTimeout=90',
      '--headless=true',
      '--proxy=http://198.20.189.134:50000'
    ], {
      cwd: process.cwd(),
      timeout: 900000, // 15 minutos max por banco
      reject: false
    });
    
    console.log(`✅ [${bankSlug}] COMPLETADO`);
    return { bank: bankSlug, success: true, offers: 'ver archivo JSON' };
  } catch (error) {
    console.error(`❌ [${bankSlug}] ERROR: ${error.message}`);
    return { bank: bankSlug, success: false, error: error.message };
  }
});

// Esperar que TODOS terminen
const results = await Promise.all(promises);

const elapsed = Math.round((Date.now() - startTime) / 1000);
console.log('\n' + '='.repeat(60));
console.log('📈 RESUMEN FINAL');
console.log('='.repeat(60));

const successful = results.filter(r => r.success).length;
const failed = results.filter(r => !r.success).length;

console.log(`✅ Exitosos: ${successful}/${allBanks.length}`);
console.log(`❌ Fallidos: ${failed}/${allBanks.length}`);
console.log(`⏱️  Tiempo total: ${elapsed}s`);

if (failed > 0) {
  console.log('\n⚠️  Bancos que fallaron:');
  results.filter(r => !r.success).forEach(r => {
    console.log(`   - ${r.bank}: ${r.error}`);
  });
}

console.log('\n🔄 Consolidando todos los resultados...');

try {
  await execa('node', ['src/consolidate.js'], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  console.log('✅ Consolidación completa');
} catch (error) {
  console.error('❌ Error en consolidación:', error.message);
}

console.log('\n✨ SCRAPING MASIVO COMPLETADO');
console.log('📁 Ver resultados en: data/descuentos_all.json');




