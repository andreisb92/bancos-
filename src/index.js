import { PlaywrightCrawler, Dataset, log, RequestQueue, Configuration } from 'crawlee';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getBanksCatalog, findCandidateBenefitPages } from './banks.js';
import { extractDiscountCardsFromPage } from './extractor_final.js';
import { getExtractorForBank } from './extractors/index.js';
import { createCsvWriterForBank, normalizeWhitespace, dedupeRecords, writeJsonForBank, filterValidDeals, resetBankOutputs } from './utils.js';

dotenv.config();

// Ensure Crawlee default storage goes inside project folder
Configuration.getGlobalConfig().set('persistStorage', true);

const argv = yargs(hideBin(process.argv))
  .scriptName('bancos-crawlee')
  .usage('$0 [options]')
  .option('bank', {
    alias: 'b',
    type: 'string',
    describe: 'Nombre del banco a scrapear (coincide por slug)',
  })
  .option('all', {
    alias: 'a',
    type: 'boolean',
    default: false,
    describe: 'Procesar todos los bancos del catálogo',
  })
  .option('maxRequests', {
    alias: 'm',
    type: 'number',
    default: 100,
    describe: 'Límite de páginas por banco',
  })
  .option('headless', {
    type: 'boolean',
    default: true,
    describe: 'Ejecutar navegador en modo headless',
  })
  .option('concurrency', {
    type: 'number',
    default: 3,
    describe: 'Máxima concurrencia del crawler',
  })
  .option('navTimeout', {
    type: 'number',
    default: 45,
    describe: 'Timeout de navegación (segundos)',
  })
  .option('proxy', {
    type: 'string',
    describe: 'Proxy HTTP/SOCKS5 (ej: http://198.20.189.134:50000)',
  })
  .help()
  .parseSync();

const banksCatalog = getBanksCatalog();

async function crawlBank(bank) {
  await resetBankOutputs(bank.slug);
  const dataset = await Dataset.open(`descuentos-${bank.slug}`);
  const queue = await RequestQueue.open(`queue-${bank.slug}-${Date.now()}`);

  // Discover candidate pages on bank domains
  const discovered = await findCandidateBenefitPages(bank);
  for (const url of discovered) {
    await queue.addRequest({ url });
  }

  if (discovered.length === 0 && bank.startUrls?.length) {
    for (const url of bank.startUrls) {
      await queue.addRequest({ url });
    }
  }

  const proxyServer = argv.proxy || process.env.PROXY_SERVER || '';

  // Configuración ultra-agresiva para bancos difíciles
  const isDifficultBank = ['bancoestado', 'santander', 'banco-de-chile', 'itau', 'scotiabank'].includes(bank.slug);
  const headlessMode = isDifficultBank ? false : argv.headless;
  const longTimeout = isDifficultBank ? 180 : argv.navTimeout;

  const crawler = new PlaywrightCrawler({
    requestQueue: queue,
    headless: headlessMode,
    maxRequestsPerCrawl: argv.maxRequests,
    maxConcurrency: argv.concurrency,
    navigationTimeoutSecs: longTimeout,
    requestHandlerTimeoutSecs: 120,
    // Ultra-agresivo para evadir detección
    launchContext: {
      launchOptions: {
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--remote-debugging-port=9222',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
        proxy: proxyServer ? { server: proxyServer } : undefined,
        // Configuración adicional para bancos difíciles
        ...(isDifficultBank && {
          slowMo: 500, // 500ms de delay entre acciones
          viewport: { width: 1366, height: 768 },
        }),
      },
    },
    preNavigationHooks: [
      async ({ page }) => {
        try {
          // Headers ultra-realistas
          await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
          });

          // Script ultra-agresivo para eliminar detección de bots
          await page.addInitScript(() => {
            // Eliminar webdriver completamente
            Object.defineProperty(navigator, 'webdriver', {
              get: () => undefined,
            });

            // Sobreescribir propiedades del navegador
            Object.defineProperty(navigator, 'language', { get: () => 'es-CL' });
            Object.defineProperty(navigator, 'languages', { get: () => ['es-CL', 'es', 'en'] });
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            Object.defineProperty(navigator, 'cookieEnabled', { get: () => true });

            // Simular plugins reales
            Object.defineProperty(navigator, 'plugins', {
              get: () => [
                {
                  name: 'Chrome PDF Plugin',
                  description: 'Portable Document Format',
                  filename: 'internal-pdf-viewer',
                  length: 1,
                },
                {
                  name: 'Chromium PDF Plugin',
                  description: 'Portable Document Format',
                  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                  length: 1,
                },
              ],
            });

            // Simular batería y hardware
            Object.defineProperty(navigator, 'getBattery', {
              value: () => Promise.resolve({
                charging: true,
                chargingTime: Infinity,
                dischargingTime: Infinity,
                level: 1,
              }),
            });

            // Eliminar propiedades de Chrome automation
            delete window.chrome?.runtime?.onConnect;
            delete window.chrome?.runtime?.onMessage;

            // Sobreescribir permisos
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
              parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
            );
          });

          // Viewport aleatorio para parecer humano
          await page.setViewportSize({
            width: 1366 + Math.floor(Math.random() * 200),
            height: 768 + Math.floor(Math.random() * 200),
          });

          // User agents ultra-realistas
          const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ];
          const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
          await page.setUserAgent(randomUA);

          // Para bancos difíciles, añadir comportamiento humano adicional
          const isDifficultSite = ['bancoestado', 'santander', 'banco-de-chile', 'itau', 'scotiabank'].some(domain =>
            page.url().includes(domain)
          );

          if (isDifficultSite) {
            // Simular movimiento del mouse
            await page.mouse.move(Math.random() * 500, Math.random() * 500);
            await page.waitForTimeout(1000 + Math.random() * 2000);

            // Simular scroll
            await page.evaluate(() => {
              window.scrollTo(0, Math.random() * 500);
            });
            await page.waitForTimeout(500 + Math.random() * 1000);
          }

        } catch (error) {
          console.warn(`Pre-navigation hook error: ${error.message}`);
        }
      },
    ],
    async requestHandler({ page, request, enqueueLinks }) {
      log.info(`Procesando: ${request.url}`);
      await page.route('**/*', (route) => {
        const req = route.request();
        // Block heavy assets to speed up crawling
        const resourceType = req.resourceType();
        if (['image', 'media', 'font'].includes(resourceType)) {
          return route.abort();
        }
        return route.continue();
      });

      await page.goto(request.url, { waitUntil: 'domcontentloaded' });
      try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
      // Si el banco define un selector de contenido, esperarlo
      try {
        const sel = bank.waitForSelector;
        if (sel) { await page.waitForSelector(sel, { timeout: 20000 }); }
      } catch {}
      // Try to reveal lazy content
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);

      const siteExtractor = getExtractorForBank(bank.slug);
      const items = siteExtractor
        ? await siteExtractor(page)
        : await extractDiscountCardsFromPage(page, bank);
      for (const item of items) {
        await dataset.pushData({
          bank: bank.name,
          bankSlug: bank.slug,
          sourceUrl: request.loadedUrl || request.url,
          ...item,
          scrapedAt: new Date().toISOString(),
        });
      }

      // Enqueue more links likely to be benefits - MUY AGRESIVO PARA TODAS LAS OFERTAS
      await enqueueLinks({
        strategy: 'same-domain',
        globs: [
          '**/*benef**',
          '**/*descuent**',
          '**/*promoc**',
          '**/*oferta**',
          '**/*gastr**',
          '**/*restaur**',
          '**/*viaj**',
          '**/*shop**',
          '**/*entret**',
          '**/*categ**',
          '**/*page**',
          '**/*pagina**',
          '**/*?p=**',
        ],
      });

      // Agregar manualmente links de paginación y categorías
      try {
        const extraLinks = await page.evaluate(() => {
          const links = [];
          // Paginación
          document.querySelectorAll('a[href*="page"], a[href*="pagina"], .pagination a, .pager a, a[href*="?p="]').forEach(a => {
            if (a.href) links.push(a.href);
          });
          // Categorías y filtros
          document.querySelectorAll('a[href*="categoria"], a[href*="filtro"], a[href*="seccion"]').forEach(a => {
            if (a.href) links.push(a.href);
          });
          // Botones de "ver más" o "cargar más"
          document.querySelectorAll('a[href*="todos"], a[href*="all"], button[onclick*="load"]').forEach(el => {
            const href = el.getAttribute('href') || el.getAttribute('data-href');
            if (href && href.startsWith('http')) links.push(href);
          });
          return [...new Set(links)];
        });
        
        for (const link of extraLinks) {
          await queue.addRequest({ url: link });
        }
      } catch {}
    },
  });

  try {
    await crawler.run();
  } catch (err) {
    log.exception(err, 'Fallo en crawler');
  }

  // Export to CSV
  const { items } = await dataset.getData();
  const unique = filterValidDeals(dedupeRecords(items), bank.slug);
  if (unique.length > 0) {
    const csvWriter = await createCsvWriterForBank(bank.slug);
    await csvWriter.writeRecords(unique.map((r) => ({
      bank: r.bank,
      title: normalizeWhitespace(r.title || ''),
      merchant: normalizeWhitespace(r.merchant || ''),
      discount: r.discount || '',
      days: (r.days || []).join('|'),
      category: r.category || '',
      validUntil: r.validUntil || '',
      terms: normalizeWhitespace(r.terms || ''),
      url: r.url || r.sourceUrl,
      sourceUrl: r.sourceUrl,
      scrapedAt: r.scrapedAt,
    })));
    await writeJsonForBank(bank.slug, unique);
  }
}

async function main() {
  const selected = argv.all
    ? banksCatalog
    : banksCatalog.filter((b) => b.slug.includes((argv.bank || '').toLowerCase()));

  if (selected.length === 0) {
    log.info('Sin bancos seleccionados. Usa --all o --bank <slug>. Bancos disponibles:');
    for (const b of banksCatalog) log.info(`- ${b.slug}`);
    process.exit(0);
  }

  for (const bank of selected) {
    log.info(`\n===== ${bank.name} (${bank.slug}) =====`);
    await crawlBank(bank);
  }

  log.info('Proceso finalizado. Revisa la carpeta storage/datasets para JSONL y data/*.csv');
}

main();


