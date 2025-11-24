import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { getBanksCatalog } from './banks.js';
import { extractDiscountCardsFromPage } from './extractor_final.js';
import { writeJsonForBank, createCsvWriterForBank } from './utils.js';
import got from 'got';

const PROXY_URL = 'http://198.20.189.134:50000';
const BANKS = getBanksCatalog();

// TODOS los bancos
const ALL_BANKS = BANKS.map(b => b.slug);

async function whitelistIP() {
  console.log('🔐 Obteniendo IP pública y registrando en whitelist...');
  try {
    const ip = (await got('https://api.ipify.org')).body.trim();
    console.log(`   📍 IP detectada: ${ip}`);
    
    const whitelistUrl = process.env.WHITELIST_URL;
    if (whitelistUrl) {
      const url = `${whitelistUrl}&ip_address=${encodeURIComponent(ip)}`;
      await got(url, { timeout: { request: 10000 } });
      console.log('   ✅ IP registrada en whitelist del proxy');
    } else {
      console.log('   ⚠️  WHITELIST_URL no configurada, continuando sin whitelist...');
    }
    return ip;
  } catch (error) {
    console.error(`   ❌ Error en whitelist: ${error.message}`);
    return null;
  }
}

async function scrapeOneBank(bankSlug, useProxy = false) {
  const bankInfo = BANKS.find(b => b.slug === bankSlug);
  if (!bankInfo) {
    console.error(`❌ Banco no encontrado: ${bankSlug}`);
    return { success: false, count: 0 };
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏦 ${bankInfo.name} (${bankInfo.slug})`);
  console.log(`🔗 ${bankInfo.startUrls[0]}`);
  console.log(`🌐 Proxy: ${useProxy ? 'ACTIVADO (40 conexiones)' : 'DESACTIVADO'}`);
  console.log(`${'='.repeat(60)}`);

  const allResults = [];

  // Configurar proxy si se solicita
  const proxyConfiguration = useProxy ? new ProxyConfiguration({
    proxyUrls: [PROXY_URL],
  }) : undefined;

  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    
    headless: true,
    launchContext: {
      launchOptions: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      },
      contextOptions: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'es-CL',
        timezoneId: 'America/Santiago',
      },
    },

    // Con proxy: máxima concurrencia. Sin proxy: moderada
    maxRequestsPerCrawl: useProxy ? 600 : 300,
    maxConcurrency: useProxy ? 40 : 15,
    minConcurrency: useProxy ? 10 : 5,
    maxRequestRetries: 5,
    navigationTimeoutSecs: 120,
    requestHandlerTimeoutSecs: 180,

    preNavigationHooks: [
      async ({ page }) => {
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'DNT': '1',
          'Connection': 'keep-alive',
        });

        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          Object.defineProperty(navigator, 'languages', { get: () => ['es-CL', 'es'] });
          window.chrome = { runtime: {} };
        });
      },
    ],

    async requestHandler({ page, request, log, enqueueLinks }) {
      log.info(`📄 ${request.url}`);

      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
        await page.waitForTimeout(2000);

        const results = await extractDiscountCardsFromPage(page, bankInfo);
        
        if (results && results.length > 0) {
          allResults.push(...results);
          log.info(`✅ ${results.length} ofertas (Total: ${allResults.length})`);
        }

        if (request.url === bankInfo.startUrls[0] || allResults.length < 50) {
          await enqueueLinks({
            globs: [
              `**/*beneficio*`,
              `**/*descuento*`,
              `**/*promocion*`,
              `**/*oferta*`,
              `**/*detalle*`,
              `**/*categoria*`,
            ],
            strategy: 'same-domain',
          });
        }

      } catch (error) {
        log.error(`❌ ${error.message}`);
      }
    },

    failedRequestHandler: async ({ request, log }, error) => {
      log.error(`💥 Fallo definitivo: ${request.url}`);
    },
  });

  await crawler.addRequests(bankInfo.startUrls.map(url => ({ url })));
  await crawler.run();

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
  console.log('\n' + '='.repeat(70));
  console.log('🚀 SCRAPING COMPLETO DE TODOS LOS BANCOS CHILENOS');
  console.log('='.repeat(70));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 Total bancos: ${ALL_BANKS.length}\n`);

  // Intentar whitelist de IP para el proxy
  const ip = await whitelistIP();
  const useProxy = !!ip && !!process.env.WHITELIST_URL;
  
  if (!useProxy) {
    console.log('\n⚠️  Continuando SIN PROXY (velocidad limitada)');
  } else {
    console.log(`\n✅ Proxy configurado - usando 40 conexiones concurrentes`);
  }

  console.log('\n' + '-'.repeat(70) + '\n');

  const results = {};
  let totalOfertas = 0;
  
  for (const bankSlug of ALL_BANKS) {
    try {
      const result = await scrapeOneBank(bankSlug, useProxy);
      results[bankSlug] = result;
      totalOfertas += result.count;
      
      console.log(`\n⏸️  Pausa 3s...\n`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`\n❌ Error crítico en ${bankSlug}: ${error.message}\n`);
      results[bankSlug] = { success: false, count: 0, error: error.message };
    }
  }

  // Resumen final
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMEN FINAL');
  console.log('='.repeat(70) + '\n');

  let exitosos = 0;
  for (const [bank, result] of Object.entries(results)) {
    const status = result.success ? '✅' : '❌';
    const bankObj = BANKS.find(b => b.slug === bank);
    console.log(`${status} ${bankObj?.name || bank}: ${result.count} ofertas`);
    if (result.success) exitosos++;
  }

  console.log(`\n🎯 TOTAL: ${totalOfertas} ofertas de ${exitosos}/${ALL_BANKS.length} bancos`);
  console.log(`⚡ Tasa de éxito: ${Math.round(exitosos/ALL_BANKS.length*100)}%`);
  console.log('\n💾 Ejecuta "npm run consolidate" para consolidar todos los resultados');
  console.log('📁 Archivos en: data/descuentos-*.json\n');
}

main().catch(console.error);

