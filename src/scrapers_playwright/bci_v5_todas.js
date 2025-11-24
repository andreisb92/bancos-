import { PlaywrightCrawler } from 'crawlee';

/**
 * BCI V5 - SCRAPER SIMPLE DE /TODAS
 * Extrae de la página que tiene todas las ofertas juntas
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci/todas';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V5 - SCRAPER PÁGINA "TODAS"');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer todas las ofertas de la página /todas');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
      ],
    },
  },
  requestHandlerTimeoutSecs: 300,
  maxRequestRetries: 2,
  
  async requestHandler({ page, log }) {
    const allOffers = [];

    try {
      console.log('   📄 Cargando página /todas...');
      
      // Navegar más lento, como humano
      await page.goto(BCI_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      // Esperar mucho más tiempo
      await page.waitForTimeout(15000);
      console.log('      ✓ Página cargada, esperando contenido...');

      // Hacer scroll LENTO, como humano
      console.log('   📜 Haciendo scroll lento (como humano)...');
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 150;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 300); // Más lento: 300ms entre cada scroll
        });
      });

      // Esperar mucho después del scroll
      await page.waitForTimeout(10000);
      console.log('      ✓ Scroll completado');

      // Mover el mouse para parecer más humano
      await page.mouse.move(100, 100);
      await page.waitForTimeout(2000);

      // Esperar a que carguen las ofertas
      try {
        await page.waitForSelector('article, div.carrousel_item, div[class*="card"]', { timeout: 30000 });
        console.log('      ✓ Ofertas detectadas');
      } catch (err) {
        console.log('      ⚠️  Timeout esperando ofertas');
      }

      await page.waitForTimeout(8000);

      // Extraer ofertas
      console.log('   📦 Extrayendo ofertas...');
      const offersOnPage = await page.evaluate(() => {
        const items = [];
        
        // Probar TODOS los selectores posibles
        const selectors = [
          'article',
          'div.carrousel_item',
          '.carrousel_item',
          'article.card-benefit-v2',
          '.card-benefit-v2',
          'div[class*="card"]',
          '[class*="benefit"]',
          'a[class*="card"]'
        ];
        
        let cards = [];
        for (const selector of selectors) {
          cards = document.querySelectorAll(selector);
          if (cards.length > 0) {
            console.log(`✓ Encontradas ${cards.length} tarjetas con selector: ${selector}`);
            break;
          }
        }
        
        if (cards.length === 0) {
          console.log('✗ No se encontraron tarjetas con ningún selector');
          return items;
        }
        
        for (const card of cards) {
          try {
            // Título - selector: .card__title
            const titleElem = card.querySelector('.card__title, p.card__title');
            const title = titleElem ? titleElem.textContent.trim() : '';

            // Descuento/Badge - selector: .badge-offer
            const discountElem = card.querySelector('.badge-offer, p.badge-offer');
            const discount = discountElem ? discountElem.textContent.trim() : '';

            // Descripción - selector: .card__bajada
            const descElem = card.querySelector('.card__bajada, p.card__bajada');
            const description = descElem ? descElem.textContent.trim() : '';

            // Días/Recurrencia - selector: .card__recurrence
            const daysElem = card.querySelector('.card__recurrence, p.card__recurrence');
            const days = daysElem ? daysElem.textContent.trim() : '';

            // Imagen - selector: img en .card-img_bg
            let imageUrl = '';
            const imgElem = card.querySelector('img');
            if (imgElem) {
              imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
            }

            // Enlace - selector: a href
            let linkUrl = '';
            const linkElem = card.querySelector('a[href]');
            if (linkElem) {
              linkUrl = linkElem.href || '';
            }

            // Solo agregar si tiene título
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
            // Ignorar errores en tarjetas individuales
          }
        }
        
        return items;
      });

      console.log(`      ✅ Extraídas ${offersOnPage.length} ofertas`);
      allOffers.push(...offersOnPage);

      // Deduplicar ofertas
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
      console.log(`📊 RESUMEN BCI V5`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);

      // Guardar archivos
      const fs = await import('fs');
      const path = await import('path');
      const { createObjectCsvWriter } = await import('csv-writer');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dataDir = path.join(process.cwd(), 'data', 'bci');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const jsonPath = path.join(dataDir, `bci_v5_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON guardado: ${jsonPath}`);

      const csvPath = path.join(dataDir, `bci_v5_${timestamp}.csv`);
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

      console.log(`\n✅ SCRAPING BCI V5 COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error en scraping:', error.message);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');
