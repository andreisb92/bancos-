import { PlaywrightCrawler } from 'crawlee';
import { extractDiscountCardsFromPage } from '../extractor_final.js';
import { writeJsonForBank, createCsvWriterForBank, dedupeRecords } from '../utils.js';

const BANK = {
  name: 'Banco de Chile',
  slug: 'banco-de-chile',
  startUrls: [
  "https://sitiospublicos.bancochile.cl/personas/beneficios"
],
};

export async function scrapeBancoDeChile() {
  console.log(`\n🏦 Scraping ${BANK.name}...`);
  const allOffers = [];
  const visitedUrls = new Set();

  const crawler = new PlaywrightCrawler({
    launchContext: {
      launcher: {
        launchOptions: {
          headless: true,
          
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
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 90,
    maxRequestRetries: 3,
    maxConcurrency: 8,
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
      
      console.log(`   📄 [${visitedUrls.size}] ${url}`);
      
      try {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        // Scroll progresivo
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await page.waitForTimeout(1000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

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
          console.log(`      ✅ ${offers.length} ofertas`);
          allOffers.push(...offers);
        } else {
          console.log(`      ℹ️  Sin ofertas`);
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
        console.log(`      ❌ Error: ${error.message}`);
      }
    },

    failedRequestHandler({ request, error }) {
      console.log(`      ⚠️  Falló: ${request.url}`);
    },
  });

  await crawler.run(BANK.startUrls);

  const uniqueOffers = dedupeRecords(allOffers);
  console.log(`\n   📊 TOTAL: ${uniqueOffers.length} ofertas únicas (${allOffers.length} encontradas)`);

  if (uniqueOffers.length > 0) {
    await writeJsonForBank(BANK.slug, uniqueOffers);
    const csvWriter = createCsvWriterForBank(BANK.slug);
    await csvWriter.writeRecords(uniqueOffers);
    console.log(`   💾 Guardado en data/descuentos-${BANK.slug}.json/csv`);
    
    // Mostrar muestra
    console.log(`\n   🎯 MUESTRA:`);
    uniqueOffers.slice(0, 3).forEach((o, i) => {
      console.log(`      ${i+1}. [${o.discount}] ${o.merchant || 'N/A'}: ${o.title?.substring(0, 60)}...`);
    });
  } else {
    console.log(`   ⚠️  NO SE ENCONTRARON OFERTAS`);
  }

  return { bank: BANK.name, slug: BANK.slug, count: uniqueOffers.length, pages: visitedUrls.size };
}

// Permitir ejecución directa
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeBancoDeChile().catch(console.error);
}
