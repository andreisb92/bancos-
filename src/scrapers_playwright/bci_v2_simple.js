import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';

/**
 * BCI V2 - SCRAPER SIMPLE SOLO "TODOS" CON PROXY
 * Extrae solo la categoría general con paginación
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V2 - SCRAPER SIMPLE CON PROXY');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas de categoría "Todos" con paginación');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

// Configurar proxy
const proxyConfiguration = new ProxyConfiguration({
  proxyUrls: ['http://198.20.189.134:50000']
});

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
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
      console.log('   📄 Cargando página inicial con proxy...');
      await page.goto(BCI_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      await page.waitForTimeout(5000);
      console.log('      ✓ Página cargada');

      // Detectar total de páginas
      let totalPages = 1;
      try {
        const pageInfo = await page.evaluate(() => {
          // Buscar botones de paginación
          const buttons = document.querySelectorAll('.paginator__button');
          let maxPage = 1;
          buttons.forEach(btn => {
            const text = btn.textContent?.trim();
            const num = parseInt(text);
            if (num && num > maxPage) {
              maxPage = num;
            }
          });
          return maxPage;
        });
        totalPages = Math.min(pageInfo, 50); // Limitar a 50 páginas
      } catch (err) {
        console.log(`      ⚠️  No se pudo detectar paginación, asumiendo 1 página`);
      }
      
      console.log(`      📄 Total de páginas detectadas: ${totalPages}`);
      
      // Extraer ofertas de todas las páginas
      let currentPage = 1;
      
      while (currentPage <= totalPages) {
        console.log(`\n   📄 Procesando página ${currentPage}/${totalPages}...`);
        
        // Extraer ofertas de la página actual
        const offersOnPage = await page.evaluate(() => {
          const items = [];
          const cards = document.querySelectorAll('.carrousel_item, .card-benefit-v2, article[class*="card"]');
          
          for (const card of cards) {
            try {
              // Título
              const titleElem = card.querySelector('.card__title, h3, h4, [class*="title"]');
              const title = titleElem ? titleElem.textContent.trim() : '';

              // Descuento/Badge
              const discountElem = card.querySelector('.badge-offer, [class*="badge"]');
              const discount = discountElem ? discountElem.textContent.trim() : '';

              // Descripción
              const descElem = card.querySelector('.card__bajada, [class*="bajada"]');
              const description = descElem ? descElem.textContent.trim() : '';

              // Días/Recurrencia
              const daysElem = card.querySelector('.card__recurrence, [class*="recurrence"]');
              const days = daysElem ? daysElem.textContent.trim() : '';

              // Imagen
              let imageUrl = '';
              const imgElem = card.querySelector('img');
              if (imgElem) {
                imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
              }

              // Enlace
              let linkUrl = '';
              const linkElem = card.querySelector('a[href]');
              if (linkElem) {
                linkUrl = linkElem.href || '';
              }

              if (title || discount) {
                items.push({
                  title: title || 'Beneficio BCI',
                  merchant: title || 'Comercio',
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
              console.log(`[Extractor] Error procesando tarjeta:`, err.message);
            }
          }
          return items;
        });

        allOffers.push(...offersOnPage);
        console.log(`      ✅ Extraídas ${offersOnPage.length} ofertas de página ${currentPage}`);

        // Navegar a la siguiente página si no es la última
        if (currentPage < totalPages) {
          try {
            // Buscar botón "siguiente"
            const nextButton = await page.locator('.paginator__button--right, button[aria-label*="next"]').first();
            if (await nextButton.isVisible()) {
              await nextButton.click();
              await page.waitForTimeout(3000);
            } else {
              console.log(`      ⚠️  No se encontró botón "siguiente"`);
              break;
            }
          } catch (err) {
            console.log(`      ⚠️  Error navegando a página ${currentPage + 1}: ${err.message}`);
            break;
          }
        }
        
        currentPage++;
      }

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
      console.log(`📊 RESUMEN BCI V2`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);
      console.log(`✅ Páginas procesadas: ${currentPage - 1}/${totalPages}`);
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

      // Guardar JSON
      const jsonPath = path.join(dataDir, `bci_v2_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON guardado: ${jsonPath}`);

      // Guardar CSV
      const csvPath = path.join(dataDir, `bci_v2_${timestamp}.csv`);
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

      console.log(`\n✅ SCRAPING BCI V2 COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error en scraping:', error.message);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');

