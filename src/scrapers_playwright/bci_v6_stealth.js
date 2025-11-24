import { PlaywrightCrawler } from 'crawlee';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

/**
 * BCI V6 - SCRAPER CON EVASIÓN CLOUDFLARE
 * Usa playwright-extra con stealth plugin
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci/todas';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V6 - SCRAPER CON ANTI-DETECCIÓN');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas evitando Cloudflare');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const crawler = new PlaywrightCrawler({
  launchContext: {
    launcher: chromium,
    launchOptions: {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
    },
  },
  requestHandlerTimeoutSecs: 600,
  maxRequestRetries: 1,
  
  async requestHandler({ page, log }) {
    const allOffers = [];

    try {
      // Ocultar webdriver
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
        
        // Chrome runtime
        window.chrome = {
          runtime: {},
        };
        
        // Languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['es-CL', 'es', 'en-US', 'en'],
        });
        
        // Plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
      });

      console.log('   📄 Cargando página con anti-detección...');
      
      await page.goto(BCI_URL, { 
        waitUntil: 'networkidle',
        timeout: 120000 
      });
      
      console.log('      ✓ Página cargada');
      
      // Esperar MUCHO tiempo (Cloudflare necesita verificar)
      console.log('   ⏳ Esperando verificación de Cloudflare (30s)...');
      await page.waitForTimeout(30000);
      
      // Verificar si nos bloqueó
      const isBlocked = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('bloqueado') || text.includes('blocked') || text.includes('política de seguridad');
      });
      
      if (isBlocked) {
        console.log('      ❌ BLOQUEADO POR CLOUDFLARE');
        console.log('      ℹ️  Necesitas abrir manualmente el navegador y resolver el captcha si aparece');
        console.log('      ⏳ Esperando 60 segundos para que resuelvas manualmente...');
        await page.waitForTimeout(60000);
      } else {
        console.log('      ✓ No bloqueado, continuando...');
      }

      // Scroll lento
      console.log('   📜 Haciendo scroll lento...');
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 200;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 500);
        });
      });

      await page.waitForTimeout(15000);
      console.log('      ✓ Scroll completado');

      // Esperar ofertas
      try {
        await page.waitForSelector('article, div[class*="card"], div[class*="benefit"]', { timeout: 30000 });
        console.log('      ✓ Ofertas detectadas');
      } catch (err) {
        console.log('      ⚠️  No se detectaron ofertas');
      }

      await page.waitForTimeout(10000);

      // Extraer ofertas
      console.log('   📦 Extrayendo ofertas...');
      const offersOnPage = await page.evaluate(() => {
        const items = [];
        
        const selectors = [
          'article',
          'div.carrousel_item',
          'div[class*="card"]',
          'div[class*="benefit"]',
          'a[class*="card"]'
        ];
        
        let cards = [];
        for (const selector of selectors) {
          cards = document.querySelectorAll(selector);
          if (cards.length > 5) {
            console.log(`✓ Encontradas ${cards.length} tarjetas con: ${selector}`);
            break;
          }
        }
        
        for (const card of cards) {
          try {
            const titleElem = card.querySelector('.card__title, h3, h4, p[class*="title"]');
            const title = titleElem ? titleElem.textContent.trim() : '';

            const discountElem = card.querySelector('.badge-offer, [class*="badge"], [class*="discount"]');
            const discount = discountElem ? discountElem.textContent.trim() : '';

            const descElem = card.querySelector('.card__bajada, p[class*="bajada"], p[class*="desc"]');
            const description = descElem ? descElem.textContent.trim() : '';

            const daysElem = card.querySelector('.card__recurrence, [class*="recurrence"]');
            const days = daysElem ? daysElem.textContent.trim() : '';

            let imageUrl = '';
            const imgElem = card.querySelector('img');
            if (imgElem) {
              imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
            }

            let linkUrl = '';
            const linkElem = card.querySelector('a[href]');
            if (linkElem) {
              linkUrl = linkElem.href || '';
            }

            if (title && title.length > 3) {
              items.push({
                title: title,
                merchant: title,
                discount: discount || 'Descuento',
                description: description,
                days: days,
                terms: description,
                imageUrl: imageUrl,
                linkUrl: linkUrl || window.location.href,
                url: window.location.href,
                category: 'Todos',
                bankSlug: 'bci'
              });
            }
          } catch (err) {
            // Ignorar
          }
        }
        
        return items;
      });

      console.log(`      ✅ Extraídas ${offersOnPage.length} ofertas`);
      allOffers.push(...offersOnPage);

      // Deduplicar
      const uniqueOffers = [];
      const seen = new Set();
      
      for (const offer of allOffers) {
        const key = `${offer.title}-${offer.discount}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueOffers.push(offer);
        }
      }

      console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
      console.log(`📊 RESUMEN BCI V6`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);

      // Guardar
      const fs = await import('fs');
      const path = await import('path');
      const { createObjectCsvWriter } = await import('csv-writer');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dataDir = path.join(process.cwd(), 'data', 'bci');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const jsonPath = path.join(dataDir, `bci_v6_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON guardado: ${jsonPath}`);

      const csvPath = path.join(dataDir, `bci_v6_${timestamp}.csv`);
      const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: [
          { id: 'title', title: 'title' },
          { id: 'merchant', title: 'merchant' },
          { id: 'discount', title: 'discount' },
          { id: 'description', title: 'description' },
          { id: 'days', title: 'days' },
          { id: 'category', title: 'category' },
          { id: 'terms', title: 'terms' },
          { id: 'imageUrl', title: 'imageUrl' },
          { id: 'linkUrl', title: 'linkUrl' },
          { id: 'url', title: 'url' },
          { id: 'bankSlug', title: 'bankSlug' },
        ],
      });

      await csvWriter.writeRecords(uniqueOffers);
      console.log(`💾 CSV guardado: ${csvPath}`);

      console.log(`\n✅ SCRAPING BCI V6 COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');

