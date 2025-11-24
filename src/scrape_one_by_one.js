import { PlaywrightCrawler } from 'crawlee';
import { getBanksCatalog } from './banks.js';
import { extractDiscountCardsFromPage } from './extractor_final.js';
import { writeJsonForBank, createCsvWriterForBank, dedupeRecords } from './utils.js';
import got from 'got';

const BANKS = getBanksCatalog();

// Configurar whitelist
async function whitelistIP() {
  console.log('🔐 Configurando whitelist de IP...');
  try {
    const ip = (await got('https://api.ipify.org')).body.trim();
    console.log(`   📍 IP actual: ${ip}`);

    const whitelistUrl = process.env.WHITELIST_URL;
    if (whitelistUrl) {
      const url = `${whitelistUrl}&ip_address=${encodeURIComponent(ip)}`;
      await got(url, { timeout: { request: 10000 } });
      console.log('   ✅ IP registrada en whitelist\n');
      return true;
    }
  } catch (error) {
    console.error(`   ⚠️  Error whitelist: ${error.message}\n`);
  }
  return false;
}

async function analyzeBankStructure(bank) {
  console.log('\n' + '═'.repeat(100));
  console.log(`🏦 ANALIZANDO: ${bank.name.toUpperCase()}`);
  console.log(`🌐 URL: ${bank.startUrls[0]}`);
  console.log('═'.repeat(100) + '\n');

  const allOffers = [];
  const visitedUrls = new Set();
  let requestCount = 0;

  const crawler = new PlaywrightCrawler({
    launchContext: {
      launcher: {
        launchOptions: {
          headless: false, // Ver qué pasa en cada sitio
          slowMo: 100,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
          ],
        },
      },
    },
    
    navigationTimeoutSecs: 90,
    requestHandlerTimeoutSecs: 120,
    maxRequestRetries: 2,
    maxConcurrency: 3,
    maxRequestsPerCrawl: 200, // Límite razonable para análisis

    preNavigationHooks: [
      async ({ page }) => {
        // Anti-bot básico
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

    async requestHandler({ request, page, enqueueLinks, log }) {
      requestCount++;
      const url = request.url;
      
      console.log(`   [${requestCount}] 📄 Visitando: ${url}`);

      if (visitedUrls.has(url)) {
        console.log(`      ⏭️  Ya visitada, saltando...`);
        return;
      }
      visitedUrls.add(url);

      try {
        // Esperar a que la página cargue
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        await page.waitForTimeout(2000 + Math.random() * 2000);

        // Scroll para cargar contenido dinámico
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await page.waitForTimeout(1500);

        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(1500);

        // Extraer ofertas
        const offers = await extractDiscountCardsFromPage(page, bank.slug);

        if (offers && offers.length > 0) {
          console.log(`      ✅ Encontradas ${offers.length} ofertas`);
          offers.forEach((offer, idx) => {
            console.log(`         ${idx + 1}. ${offer.title?.substring(0, 80)}... (${offer.discount})`);
          });
          allOffers.push(...offers);
        } else {
          console.log(`      ℹ️  Sin ofertas en esta página`);
        }

        // Buscar enlaces relacionados con beneficios/descuentos
        const patterns = [
          '**/beneficio**',
          '**/descuento**',
          '**/oferta**',
          '**/promocion**',
          '**/club**',
          '**/ventaja**',
        ];

        for (const pattern of patterns) {
          await enqueueLinks({
            globs: [pattern],
            label: 'DETAIL',
          });
        }

        // También enlaces de misma página
        await enqueueLinks({
          globs: [`**/${bank.allowedDomains[0]}/**`],
          label: 'DETAIL',
        });

      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
      }
    },

    failedRequestHandler({ request, error }, log) {
      console.log(`      ⚠️  Falló: ${request.url} - ${error.message}`);
    },
  });

  try {
    await crawler.run(bank.startUrls);

    // Procesar resultados
    const uniqueOffers = dedupeRecords(allOffers);
    
    console.log('\n' + '─'.repeat(100));
    console.log(`📊 RESUMEN - ${bank.name}`);
    console.log('─'.repeat(100));
    console.log(`   📄 Páginas visitadas: ${visitedUrls.size}`);
    console.log(`   📦 Ofertas encontradas: ${allOffers.length}`);
    console.log(`   ✨ Ofertas únicas: ${uniqueOffers.length}`);

    if (uniqueOffers.length > 0) {
      // Guardar resultados
      await writeJsonForBank(bank.slug, uniqueOffers);
      
      const csvWriter = createCsvWriterForBank(bank.slug);
      await csvWriter.writeRecords(uniqueOffers);

      console.log(`   💾 Guardado en:`);
      console.log(`      - data/descuentos-${bank.slug}.json`);
      console.log(`      - data/descuentos-${bank.slug}.csv`);

      // Mostrar muestra de ofertas
      console.log(`\n   🎯 MUESTRA DE OFERTAS:`);
      uniqueOffers.slice(0, 5).forEach((offer, idx) => {
        console.log(`      ${idx + 1}. [${offer.discount}] ${offer.merchant || 'N/A'}: ${offer.title?.substring(0, 70)}...`);
      });

      if (uniqueOffers.length > 5) {
        console.log(`      ... y ${uniqueOffers.length - 5} más`);
      }

      return { success: true, count: uniqueOffers.length, pages: visitedUrls.size };
    } else {
      console.log(`   ⚠️  NO SE ENCONTRARON OFERTAS`);
      console.log(`\n   💡 Posibles razones:`);
      console.log(`      - El sitio requiere autenticación`);
      console.log(`      - Anti-bot bloqueando el acceso`);
      console.log(`      - Estructura de página no detectada`);
      console.log(`      - URL incorrecta`);
      
      return { success: false, count: 0, pages: visitedUrls.size };
    }

  } catch (error) {
    console.error(`\n❌ ERROR CRÍTICO en ${bank.name}: ${error.message}`);
    return { success: false, count: 0, pages: 0, error: error.message };
  }
}

async function main() {
  console.log('\n' + '█'.repeat(100));
  console.log('🔍 ANÁLISIS BANCO POR BANCO - SCRAPING DETALLADO');
  console.log('█'.repeat(100));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 Total de bancos: ${BANKS.length}`);
  console.log('█'.repeat(100));

  await whitelistIP();

  const results = [];
  let totalOfertas = 0;

  // Procesar cada banco UNO POR UNO
  for (let i = 0; i < BANKS.length; i++) {
    const bank = BANKS[i];
    console.log(`\n\n>>> Banco ${i + 1}/${BANKS.length} <<<`);
    
    const result = await analyzeBankStructure(bank);
    results.push({
      bank: bank.name,
      slug: bank.slug,
      ...result,
    });

    totalOfertas += result.count || 0;

    // Pausa entre bancos
    if (i < BANKS.length - 1) {
      console.log('\n⏳ Esperando 5 segundos antes del siguiente banco...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Resumen final
  console.log('\n\n' + '█'.repeat(100));
  console.log('📊 RESUMEN FINAL - TODOS LOS BANCOS');
  console.log('█'.repeat(100) + '\n');

  results.forEach((result, idx) => {
    const status = result.success && result.count > 0 ? '✅' : '❌';
    console.log(`${status} ${idx + 1}. ${result.bank}: ${result.count} ofertas (${result.pages} páginas)`);
  });

  const exitosos = results.filter(r => r.success && r.count > 0).length;

  console.log('\n' + '─'.repeat(100));
  console.log(`🎯 TOTAL: ${totalOfertas} ofertas`);
  console.log(`✅ Exitosos: ${exitosos}/${BANKS.length} bancos (${Math.round(exitosos/BANKS.length*100)}%)`);
  console.log('─'.repeat(100));

  console.log('\n💾 Consolidando resultados...');
  const { execa } = await import('execa');
  try {
    await execa('node', ['src/consolidate.js'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log('✅ Consolidación completa\n');
  } catch (error) {
    console.error('❌ Error en consolidación:', error.message);
  }

  console.log('📁 Archivos generados:');
  console.log('   - data/descuentos_all.json (consolidado)');
  console.log('   - data/descuentos_all.csv (consolidado)');
  console.log('   - data/descuentos-[banco].json (individuales)');
  console.log('   - data/descuentos-[banco].csv (individuales)\n');

  console.log('█'.repeat(100) + '\n');
}

main().catch(console.error);

