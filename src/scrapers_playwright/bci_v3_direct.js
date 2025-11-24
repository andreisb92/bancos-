import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';

/**
 * BCI V3 - SCRAPER DIRECTO SOLO "TODOS"
 * Click en "Todos" y paginación completa
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V3 - SCRAPER DIRECTO "TODOS"');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Click en "Todos" y extraer con paginación completa');
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
      console.log('   📄 Cargando página inicial...');
      await page.goto(BCI_URL, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      await page.waitForTimeout(8000);
      console.log('      ✓ Página cargada');

      // Click en "Todos"
      console.log('   🔘 Buscando botón "Todos"...');
      try {
        // Buscar por el alt de la imagen
        await page.click('img[alt="Todos"]');
        await page.waitForTimeout(5000);
        console.log('      ✓ Click en "Todos" exitoso');
      } catch (err) {
        console.log('      ⚠️  Error haciendo click en "Todos":', err.message);
        // Intentar alternativa
        try {
          await page.click('li[name="Todos"]');
          await page.waitForTimeout(5000);
          console.log('      ✓ Click en "Todos" exitoso (alternativa)');
        } catch (err2) {
          console.log('      ⚠️  No se pudo hacer click en "Todos"');
        }
      }

      // Detectar total de páginas
      let totalPages = 35; // Según me dijiste que hay hasta 35
      try {
        const pageInfo = await page.evaluate(() => {
          const buttons = document.querySelectorAll('.paginator__button');
          let maxPage = 1;
          buttons.forEach(btn => {
            if (btn.getAttribute('aria-label')?.includes('page number')) {
              const text = btn.textContent?.trim();
              const num = parseInt(text);
              if (num && num > maxPage) {
                maxPage = num;
              }
            }
          });
          return maxPage;
        });
        if (pageInfo > 1) {
          totalPages = Math.min(pageInfo, 50);
        }
      } catch (err) {
        console.log(`      ⚠️  No se pudo detectar paginación exacta, usando máximo de 35`);
      }
      
      console.log(`      📄 Total de páginas a procesar: ${totalPages}`);
      
      // Extraer ofertas de todas las páginas
      let currentPage = 1;
      let consecutiveEmpty = 0;
      
      while (currentPage <= totalPages && consecutiveEmpty < 3) {
        console.log(`\n   📄 Procesando página ${currentPage}/${totalPages}...`);
        
        // Esperar a que carguen las tarjetas
        await page.waitForTimeout(3000);
        
        // Extraer ofertas de la página actual
        const offersOnPage = await page.evaluate(() => {
          const items = [];
          
          // Probar múltiples selectores
          const selectors = [
            '.carrousel_item',
            '.card-benefit-v2', 
            'article.card',
            '[class*="card-benefit"]',
            'div.carrousel_item'
          ];
          
          let cards = [];
          for (const selector of selectors) {
            cards = document.querySelectorAll(selector);
            if (cards.length > 0) {
              console.log(`Encontradas ${cards.length} tarjetas con selector: ${selector}`);
              break;
            }
          }
          
          for (const card of cards) {
            try {
              // Título
              const titleElem = card.querySelector('.card__title, .card_title, h3, h4');
              const title = titleElem ? titleElem.textContent.trim() : '';

              // Descuento
              const discountElem = card.querySelector('.badge-offer, .badge, [class*="badge"]');
              const discount = discountElem ? discountElem.textContent.trim() : '';

              // Descripción
              const descElem = card.querySelector('.card__bajada, .card_bajada, p');
              const description = descElem ? descElem.textContent.trim() : '';

              // Días
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
              // Ignorar errores de tarjetas individuales
            }
          }
          return items;
        });

        if (offersOnPage.length === 0) {
          consecutiveEmpty++;
          console.log(`      ⚠️  Página vacía (${consecutiveEmpty}/3)`);
        } else {
          consecutiveEmpty = 0;
          allOffers.push(...offersOnPage);
          console.log(`      ✅ Extraídas ${offersOnPage.length} ofertas de página ${currentPage}`);
        }

        // Navegar a la siguiente página
        if (currentPage < totalPages) {
          try {
            // Buscar y click en botón siguiente
            const nextClicked = await page.evaluate(() => {
              const nextBtn = document.querySelector('.paginator__button--right, button[aria-label*="next"]');
              if (nextBtn && !nextBtn.disabled) {
                nextBtn.click();
                return true;
              }
              return false;
            });
            
            if (nextClicked) {
              await page.waitForTimeout(4000);
              console.log(`      ➡️  Navegado a página ${currentPage + 1}`);
            } else {
              console.log(`      ⚠️  No se encontró botón "siguiente", terminando`);
              break;
            }
          } catch (err) {
            console.log(`      ⚠️  Error navegando: ${err.message}`);
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
      console.log(`📊 RESUMEN BCI V3`);
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

      const jsonPath = path.join(dataDir, `bci_v3_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON guardado: ${jsonPath}`);

      const csvPath = path.join(dataDir, `bci_v3_${timestamp}.csv`);
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

      console.log(`\n✅ SCRAPING BCI V3 COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error en scraping:', error.message);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');

