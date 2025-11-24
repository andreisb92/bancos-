import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { getBanksCatalog } from './banks.js';
import { extractDiscountCardsFromPage } from './extractor_final.js';
import { writeJsonForBank, createCsvWriterForBank } from './utils.js';

const PROXY_URL = 'http://198.20.189.134:50000';
const BANKS = getBanksCatalog();

// Configurar bancos a scrapear
const BANKS_TO_SCRAPE = [
  'falabella-cmr',
  'santander', 
  'itau',
  'scotiabank',
  'bice',
  'ripley',
  'internacional',
  'bancoestado'
];

async function scrapeOneBank(bankSlug) {
  const bankInfo = BANKS.find(b => b.slug === bankSlug);
  if (!bankInfo) {
    console.error(`❌ Banco no encontrado: ${bankSlug}`);
    return { success: false, count: 0 };
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏦 ${bankInfo.name} (${bankInfo.slug})`);
  console.log(`🔗 ${bankInfo.startUrls[0]}`);
  console.log(`🌐 Usando proxy: ${PROXY_URL}`);
  console.log(`${'='.repeat(60)}`);

  const allResults = [];

  // Configurar proxy
  const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [PROXY_URL],
  });

  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    
    launchContext: {
      launcher: 'chromium',
      launchOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      },
      contextOptions: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'es-CL',
        timezoneId: 'America/Santiago',
      },
    },

    // Configuración ULTRA-AGRESIVA con 40 proxies rotativos
    maxRequestsPerCrawl: 500,
    maxConcurrency: 40,
    minConcurrency: 10,
    maxRequestRetries: 8,
    navigationTimeoutSecs: 150,
    requestHandlerTimeoutSecs: 200,

    preNavigationHooks: [
      async ({ page }) => {
        // Anti-detección
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        });

        // Ocultar webdriver
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          Object.defineProperty(navigator, 'languages', { get: () => ['es-CL', 'es', 'en'] });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
          window.chrome = { runtime: {} };
        });
      },
    ],

    async requestHandler({ page, request, log, enqueueLinks }) {
      log.info(`📄 Procesando: ${request.url}`);

      try {
        // Esperar que la página cargue
        await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
        
        // Esperar un poco más para contenido dinámico
        await page.waitForTimeout(3000);

        // Scroll para activar lazy loading
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await page.waitForTimeout(1000);

        // Extraer ofertas
        const results = await extractDiscountCardsFromPage(page, bankInfo);
        
        if (results && results.length > 0) {
          allResults.push(...results);
          log.info(`✅ Extraídas ${results.length} ofertas (Total: ${allResults.length})`);
        }

        // Buscar más enlaces si es la primera página
        if (request.url === bankInfo.startUrls[0]) {
          await enqueueLinks({
            globs: [
              `**/*beneficio*`,
              `**/*descuento*`,
              `**/*promocion*`,
              `**/*oferta*`,
              `**/*detalle*`,
              `**/*categoria*`,
              `**/*restaurante*`,
              `**/*gastronomia*`,
              `**/*viaje*`,
              `**/*entretencion*`,
            ],
            label: 'DETAIL',
            strategy: 'same-domain',
          });
        }

      } catch (error) {
        log.error(`❌ Error: ${error.message}`);
      }
    },

    failedRequestHandler: async ({ request, log }, error) => {
      log.error(`💥 Request fallido después de reintentos: ${request.url} - ${error.message}`);
    },
  });

  // Añadir URLs iniciales
  await crawler.addRequests(bankInfo.startUrls.map(url => ({ url })));

  // Ejecutar crawler
  await crawler.run();

  // Guardar resultados
  if (allResults.length > 0) {
    await writeJsonForBank(bankInfo.slug, allResults);
    const csvWriter = await createCsvWriterForBank(bankInfo.slug);
    await csvWriter.writeRecords(allResults);
    console.log(`\n✅ ${bankInfo.name}: ${allResults.length} ofertas guardadas`);
    return { success: true, count: allResults.length };
  } else {
    console.log(`\n⚠️  ${bankInfo.name}: 0 ofertas extraídas`);
    return { success: false, count: 0 };
  }
}

async function main() {
  console.log('\n🚀 SCRAPING AGRESIVO CON PROXIES ROTATIVOS');
  console.log(`📅 ${new Date().toLocaleString('es-CL')}\n`);

  const results = {};
  
  for (const bankSlug of BANKS_TO_SCRAPE) {
    try {
      const result = await scrapeOneBank(bankSlug);
      results[bankSlug] = result;
      
      // Pausa entre bancos
      console.log('\n⏸️  Pausa de 5 segundos antes del siguiente banco...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`\n❌ Error crítico en ${bankSlug}: ${error.message}\n`);
      results[bankSlug] = { success: false, count: 0, error: error.message };
    }
  }

  // Resumen final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN FINAL');
  console.log('='.repeat(60) + '\n');

  let totalOfertas = 0;
  let bancosExitosos = 0;

  for (const [bank, result] of Object.entries(results)) {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${bank}: ${result.count} ofertas`);
    totalOfertas += result.count;
    if (result.success) bancosExitosos++;
  }

  console.log(`\n🎯 TOTAL: ${totalOfertas} ofertas de ${bancosExitosos}/${BANKS_TO_SCRAPE.length} bancos`);
  console.log('\n💾 Ejecuta "npm run consolidate" para consolidar todos los resultados\n');
}

main().catch(console.error);

