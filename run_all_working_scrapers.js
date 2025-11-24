import { execa } from 'execa';
import path from 'path';
import fs from 'fs';

const SCRAPERS = [
  {
    name: 'Santander',
    script: 'santanderV7Categories',
    slug: 'santander'
  },
  {
    name: 'Banco de Chile',
    script: 'bancoChileV2Categories',
    slug: 'banco-de-chile'
  },
  {
    name: 'Ripley',
    script: 'bancoRipleyV1',
    slug: 'ripley'
  },
  {
    name: 'BancoEstado',
    script: 'bancoEstadoV3',
    slug: 'bancoestado'
  },
  {
    name: 'Falabella',
    script: 'falabellaComplete',
    slug: 'falabella-cmr'
  }
];

async function runAllScrapers() {
  console.log('\n' + '═'.repeat(80));
  console.log('🚀 EJECUTANDO TODOS LOS SCRAPERS EXITOSOS');
  console.log('═'.repeat(80) + '\n');

  // Crear directorio jsonl si no existe
  const jsonlDir = path.join(process.cwd(), 'data', 'jsonl');
  if (!fs.existsSync(jsonlDir)) {
    fs.mkdirSync(jsonlDir, { recursive: true });
  }

  const results = {
    success: [],
    failed: [],
    totalOffers: 0
  };

  for (const scraper of SCRAPERS) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🏦 ${scraper.name} (${scraper.slug})`);
    console.log(`${'─'.repeat(80)}`);
    
    try {
      const startTime = Date.now();
      
      await execa('npm', ['run', scraper.script], {
        stdio: 'inherit',
        timeout: 300000 // 5 minutos por banco
      });
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      // Verificar si se creó el archivo JSONL
      const jsonlPath = path.join(jsonlDir, `${scraper.slug}.jsonl`);
      let offerCount = 0;
      
      if (fs.existsSync(jsonlPath)) {
        const content = fs.readFileSync(jsonlPath, 'utf-8');
        offerCount = content.trim().split('\n').filter(l => l.trim()).length;
      }
      
      console.log(`\n✅ ${scraper.name} completado en ${duration}s - ${offerCount} ofertas`);
      results.success.push({ ...scraper, duration, offers: offerCount });
      results.totalOffers += offerCount;
      
    } catch (error) {
      console.error(`\n❌ Error en ${scraper.name}: ${error.message}`);
      results.failed.push({ ...scraper, error: error.message });
    }
  }

  console.log(`\n${'═'.repeat(80)}`);
  console.log('📊 RESUMEN FINAL');
  console.log(`${'═'.repeat(80)}`);
  console.log(`✅ Exitosos: ${results.success.length}`);
  console.log(`❌ Fallidos: ${results.failed.length}`);
  console.log(`📦 Total ofertas: ${results.totalOffers}`);
  
  if (results.success.length > 0) {
    console.log(`\n✅ Bancos exitosos:`);
    results.success.forEach(s => {
      console.log(`   - ${s.name}: ${s.offers} ofertas (${s.duration}s)`);
    });
  }
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Bancos fallidos:`);
    results.failed.forEach(f => {
      console.log(`   - ${f.name}: ${f.error}`);
    });
  }

  console.log(`\n${'═'.repeat(80)}\n`);
}

runAllScrapers()
  .then(() => {
    console.log('✅ Todos los scrapers ejecutados');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  });

