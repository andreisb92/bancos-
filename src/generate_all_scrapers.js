import fs from 'node:fs';
import path from 'node:path';
import { getBanksCatalog } from './banks.js';

const BANKS = getBanksCatalog();

// Configuraciones específicas por banco
const BANK_CONFIGS = {
  'banco-de-chile': { headless: true, concurrency: 8, timeout: 60, slowMo: 0 },
  'bancoestado': { headless: false, concurrency: 3, timeout: 120, slowMo: 100 },
  'santander': { headless: false, concurrency: 3, timeout: 120, slowMo: 100 },
  'bci': { headless: false, concurrency: 5, timeout: 90, slowMo: 50 },
  'itau': { headless: false, concurrency: 3, timeout: 120, slowMo: 100 },
  'scotiabank': { headless: false, concurrency: 5, timeout: 90, slowMo: 50 },
  'falabella-cmr': { headless: false, concurrency: 5, timeout: 90, slowMo: 50 },
  'bice': { headless: false, concurrency: 3, timeout: 120, slowMo: 100 },
  'ripley': { headless: false, concurrency: 5, timeout: 90, slowMo: 50 },
  'cencosud-scotiabank': { headless: true, concurrency: 8, timeout: 60, slowMo: 0 },
  'security': { headless: true, concurrency: 8, timeout: 60, slowMo: 0 },
  'edwards': { headless: true, concurrency: 8, timeout: 60, slowMo: 0 },
  'consorcio': { headless: true, concurrency: 8, timeout: 60, slowMo: 0 },
  'internacional': { headless: false, concurrency: 3, timeout: 120, slowMo: 100 },
};

function generateScraperCode(bank) {
  const config = BANK_CONFIGS[bank.slug] || { headless: true, concurrency: 5, timeout: 60, slowMo: 0 };
  const functionName = bank.slug.split('-').map((word, i) => 
    i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');

  return `import { PlaywrightCrawler } from 'crawlee';
import { extractDiscountCardsFromPage } from '../extractor_final.js';
import { writeJsonForBank, createCsvWriterForBank, dedupeRecords } from '../utils.js';

const BANK = {
  name: '${bank.name}',
  slug: '${bank.slug}',
  startUrls: ${JSON.stringify(bank.startUrls, null, 2)},
};

export async function scrape${functionName.charAt(0).toUpperCase() + functionName.slice(1)}() {
  console.log(\`\\n🏦 Scraping \${BANK.name}...\`);
  const allOffers = [];
  const visitedUrls = new Set();

  const crawler = new PlaywrightCrawler({
    launchContext: {
      launcher: {
        launchOptions: {
          headless: ${config.headless},
          ${config.slowMo > 0 ? `slowMo: ${config.slowMo},` : ''}
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
          ],
        },
      },
      useIncognitoPages: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    useSessionPool: false,
    persistCookiesPerSession: false,
    navigationTimeoutSecs: ${config.timeout},
    requestHandlerTimeoutSecs: ${config.timeout + 30},
    maxRequestRetries: 3,
    maxConcurrency: ${config.concurrency},
    maxRequestsPerCrawl: 400,

    preNavigationHooks: [
      async ({ page }) => {
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'es-CL,es;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        });
        
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          Object.defineProperty(navigator, 'language', { get: () => 'es-CL' });
          Object.defineProperty(navigator, 'languages', { get: () => ['es-CL', 'es'] });
        });
        
        await page.setViewportSize({
          width: 1366 + Math.floor(Math.random() * 100),
          height: 768 + Math.floor(Math.random() * 100),
        });
      },
    ],

    async requestHandler({ request, page, enqueueLinks }) {
      const url = request.url;
      
      if (visitedUrls.has(url)) return;
      visitedUrls.add(url);
      
      console.log(\`   📄 [\${visitedUrls.size}] \${url}\`);
      
      try {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(${config.slowMo > 0 ? 3000 : 2000});

        // Scroll progresivo
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await page.waitForTimeout(${config.slowMo > 0 ? 2000 : 1000});
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(${config.slowMo > 0 ? 2000 : 1000});

        // Intentar click en "Ver más" o "Cargar más"
        try {
          const loadMoreButtons = await page.$$('button:has-text("Ver más"), button:has-text("Cargar más"), a:has-text("Ver todos")');
          for (const btn of loadMoreButtons) {
            await btn.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(2000);
          }
        } catch (e) {}

        const offers = await extractDiscountCardsFromPage(page, BANK.slug);
        
        if (offers?.length > 0) {
          console.log(\`      ✅ \${offers.length} ofertas\`);
          allOffers.push(...offers);
        } else {
          console.log(\`      ℹ️  Sin ofertas\`);
        }

        // Enqueue links relevantes
        await enqueueLinks({
          globs: [
            '**/beneficio**',
            '**/descuento**',
            '**/oferta**',
            '**/promocion**',
            '**/club**',
          ],
        });

      } catch (error) {
        console.log(\`      ❌ Error: \${error.message}\`);
      }
    },

    failedRequestHandler({ request, error }) {
      console.log(\`      ⚠️  Falló: \${request.url}\`);
    },
  });

  await crawler.run(BANK.startUrls);

  const uniqueOffers = dedupeRecords(allOffers);
  console.log(\`\\n   📊 TOTAL: \${uniqueOffers.length} ofertas únicas (\${allOffers.length} encontradas)\`);

  if (uniqueOffers.length > 0) {
    await writeJsonForBank(BANK.slug, uniqueOffers);
    const csvWriter = createCsvWriterForBank(BANK.slug);
    await csvWriter.writeRecords(uniqueOffers);
    console.log(\`   💾 Guardado en data/descuentos-\${BANK.slug}.json/csv\`);
    
    // Mostrar muestra
    console.log(\`\\n   🎯 MUESTRA:\`);
    uniqueOffers.slice(0, 3).forEach((o, i) => {
      console.log(\`      \${i+1}. [\${o.discount}] \${o.merchant || 'N/A'}: \${o.title?.substring(0, 60)}...\`);
    });
  } else {
    console.log(\`   ⚠️  NO SE ENCONTRARON OFERTAS\`);
  }

  return { bank: BANK.name, slug: BANK.slug, count: uniqueOffers.length, pages: visitedUrls.size };
}

// Permitir ejecución directa
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  scrape${functionName.charAt(0).toUpperCase() + functionName.slice(1)}().catch(console.error);
}
`;
}

async function generateAllScrapers() {
  console.log('🔨 Generando scrapers específicos para cada banco...\n');

  const scrapersDir = path.join(process.cwd(), 'src', 'scrapers');
  if (!fs.existsSync(scrapersDir)) {
    fs.mkdirSync(scrapersDir, { recursive: true });
  }

  for (const bank of BANKS) {
    const code = generateScraperCode(bank);
    const filename = `${bank.slug}.js`;
    const filepath = path.join(scrapersDir, filename);
    
    await fs.promises.writeFile(filepath, code, 'utf-8');
    console.log(`✅ ${filename}`);
  }

  console.log(`\n✨ ${BANKS.length} scrapers generados en src/scrapers/\n`);
}

generateAllScrapers().catch(console.error);

