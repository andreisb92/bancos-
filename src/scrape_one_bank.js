import { execa } from 'execa';

const bankSlug = process.argv[2];
const maxRequests = process.argv[3] || '200';

if (!bankSlug) {
  console.error('❌ Uso: node scrape_one_bank.js <bank-slug> [maxRequests]');
  process.exit(1);
}

console.log(`🏦 Scraping ${bankSlug} con hasta ${maxRequests} requests...`);

try {
  await execa('node', ['src/index.js', 
    `--bank=${bankSlug}`, 
    `--maxRequests=${maxRequests}`,
    '--concurrency=3',
    '--navTimeout=60',
    '--headless=true',
    '--proxy=http://198.20.189.134:50000'
  ], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  console.log(`✅ ${bankSlug} completado`);
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
}






