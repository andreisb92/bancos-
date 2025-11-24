import { PlaywrightCrawler } from 'crawlee';

/**
 * BCI V7 - SCRAPER CON RESOLUCIÓN MANUAL
 * Abre el navegador y ESPERA a que el usuario resuelva Cloudflare
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci/todas';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V7 - SCRAPER CON RESOLUCIÓN MANUAL DE CLOUDFLARE');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Esperar resolución manual de Cloudflare');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: false, // IMPORTANTE: navegador visible
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
  },
  requestHandlerTimeoutSecs: 600,
  maxRequestRetries: 1,
  
  async requestHandler({ page, log }) {
    const allOffers = [];

    try {
      console.log('   📄 Abriendo página...');
      console.log('   ⚠️  IMPORTANTE: Si aparece Cloudflare, resuélvelo manualmente');
      console.log('   ⏳ El scraper esperará 2 minutos para que lo hagas...\n');
      
      await page.goto(BCI_URL, { 
        waitUntil: 'domcontentloaded',
        timeout: 120000 
      });
      
      // Esperar 2 MINUTOS para resolución manual
      console.log('   ⏳ Esperando 120 segundos para que resuelvas Cloudflare...');
      console.log('   📌 Resuelve el captcha/challenge si aparece');
      console.log('   📌 Espera a que carguen las ofertas');
      console.log('   📌 El scraper continuará automáticamente en 2 minutos...\n');
      
      await page.waitForTimeout(120000);
      
      console.log('   ✓ Tiempo de espera completado, continuando...\n');

      // Scroll
      console.log('   📜 Haciendo scroll...');
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 400);
        });
      });

      await page.waitForTimeout(10000);
      console.log('      ✓ Scroll completado\n');

      // Extraer ofertas
      console.log('   📦 Extrayendo ofertas...');
      const offersOnPage = await page.evaluate(() => {
        const items = [];
        
        const selectors = [
          'article',
          'div.carrousel_item',
          '.card-benefit-v2',
          'div[class*="card"]',
          'a[id*="comercio"]'
        ];
        
        let cards = [];
        for (const selector of selectors) {
          cards = document.querySelectorAll(selector);
          if (cards.length > 5) {
            console.log(`✓ ${cards.length} tarjetas con: ${selector}`);
            break;
          }
        }
        
        for (const card of cards) {
          try {
            // Buscar todos los elementos de texto
            const allText = card.textContent || '';
            
            const titleElem = card.querySelector('p[class*="title"], h3, h4, .card__title');
            const title = titleElem ? titleElem.textContent.trim() : '';

            const discountElem = card.querySelector('p[class*="badge"], .badge-offer, [class*="discount"]');
            const discount = discountElem ? discountElem.textContent.trim() : '';

            const descElem = card.querySelector('p[class*="bajada"], .card__bajada');
            const description = descElem ? descElem.textContent.trim() : '';

            const daysElem = card.querySelector('p[class*="recurrence"], .card__recurrence');
            const days = daysElem ? daysElem.textContent.trim() : '';

            let imageUrl = '';
            const imgElem = card.querySelector('img');
            if (imgElem) {
              imageUrl = imgElem.src || imgElem.getAttribute('data-src') || imgElem.getAttribute('src') || '';
            }

            let linkUrl = '';
            const linkElem = card.querySelector('a[href]');
            if (linkElem) {
              linkUrl = linkElem.href || '';
            }

            if (title && title.length > 3 && !title.includes('loading') && !title.includes('cargando')) {
              items.push({
                title: title,
                merchant: title,
                discount: discount || 'Descuento',
                description: description,
                days: days,
                terms: description || allText.substring(0, 200),
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

      console.log(`      ✅ Extraídas ${offersOnPage.length} ofertas\n`);
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

      console.log(`════════════════════════════════════════════════════════════════════════════════`);
      console.log(`📊 RESUMEN BCI V7`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log(`════════════════════════════════════════════════════════════════════════════════\n`);

      // Guardar
      const fs = await import('fs');
      const path = await import('path');
      const { createObjectCsvWriter } = await import('csv-writer');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dataDir = path.join(process.cwd(), 'data', 'bci');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const jsonPath = path.join(dataDir, `bci_v7_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`💾 JSON guardado: ${jsonPath}`);

      const csvPath = path.join(dataDir, `bci_v7_${timestamp}.csv`);
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

      console.log(`\n✅ SCRAPING BCI V7 COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');













