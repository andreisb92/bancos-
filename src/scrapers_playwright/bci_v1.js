import { PlaywrightCrawler } from 'crawlee';

/**
 * BCI V1 - SCRAPER CON CATEGORÍAS Y PAGINACIÓN
 * Basado en la estructura real identificada
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V1 - SCRAPER CON CATEGORÍAS Y PAGINACIÓN');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas con categorías y paginación completa');
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
      console.log('   📄 Cargando página inicial...');
      await page.goto(BCI_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      await page.waitForTimeout(8000);
      console.log('      ✓ Página cargada');

      // Esperar a que carguen las categorías
      try {
        await page.waitForSelector('li.list-categorie__item', { timeout: 10000 });
        console.log('      ✓ Categorías cargadas');
      } catch (err) {
        console.log('      ⚠️  No se encontraron categorías con el selector esperado');
      }

      // Extraer categorías disponibles
      console.log('   📊 Extrayendo categorías...');
      const availableCategories = await page.evaluate(() => {
        const categories = [];
        
        // Buscar categorías con múltiples selectores
        const selectors = [
          'li.list-categorie__item',
          'li[class*="categorie"]',
          'li[class*="category"]',
          '.list-categorie_list li'
        ];
        
        for (const selector of selectors) {
          const categoryItems = document.querySelectorAll(selector);
          if (categoryItems.length > 0) {
            console.log(`Encontradas ${categoryItems.length} categorías con selector: ${selector}`);
            categoryItems.forEach(item => {
              const text = item.querySelector('.list-categorie__title, p, span')?.textContent?.trim();
              if (text && text.length > 2 && !categories.includes(text)) {
                categories.push(text);
              }
            });
            break;
          }
        }
        
        return categories;
      });

      console.log(`      ✅ Categorías encontradas: ${availableCategories.join(', ')}`);

      // Procesar cada categoría
      for (let i = 0; i < availableCategories.length; i++) {
        const category = availableCategories[i];
        console.log(`\n   📂 Procesando categoría ${i + 1}/${availableCategories.length}: ${category}`);
        
        try {
          // Click en la categoría usando el selector correcto
          const categoryButton = await page.locator(`li.list-categorie__item:has-text("${category}")`).first();
          if (await categoryButton.isVisible()) {
            await categoryButton.click();
            await page.waitForTimeout(3000);
            
            // Detectar total de páginas para esta categoría
            let totalPages = 1;
            try {
              const pageInfo = await page.evaluate(() => {
                // Buscar información de paginación
                const pagination = document.querySelector('.pagination, [class*="pagination"]');
                if (pagination) {
                  const pageNumbers = pagination.querySelectorAll('a, button, span');
                  let maxPage = 1;
                  pageNumbers.forEach(el => {
                    const text = el.textContent?.trim();
                    const num = parseInt(text);
                    if (num && num > maxPage) {
                      maxPage = num;
                    }
                  });
                  return maxPage;
                }
                return 1;
              });
              totalPages = Math.min(pageInfo, 50); // Limitar a 50 páginas máximo
            } catch (err) {
              console.log(`      ⚠️  No se pudo detectar paginación para "${category}"`);
            }
            
            console.log(`      📄 Total de páginas para "${category}": ${totalPages}`);
            
            // Extraer ofertas de todas las páginas de esta categoría
            let currentPage = 1;
            const categoryOffers = [];
            
            while (currentPage <= totalPages) {
              console.log(`      📄 Procesando página ${currentPage}/${totalPages} de "${category}"...`);
              
              // Extraer ofertas de la página actual
              const offersOnPage = await page.evaluate((cat) => {
                const items = [];
                const cards = document.querySelectorAll('.carrousel_item, .card-benefit-v2, [class*="card"]');
                
                for (const card of cards) {
                  try {
                    // Título
                    const titleElem = card.querySelector('.card__title, .card_title, h3, h4, [class*="title"]');
                    const title = titleElem ? titleElem.textContent.trim() : '';

                    // Descuento/Badge
                    const discountElem = card.querySelector('.badge-offer, .badge, [class*="badge"]');
                    const discount = discountElem ? discountElem.textContent.trim() : '';

                    // Descripción
                    const descElem = card.querySelector('.card__bajada, .card_bajada, [class*="bajada"]');
                    const description = descElem ? descElem.textContent.trim() : '';

                    // Días/Recurrencia
                    const daysElem = card.querySelector('.card__recurrence, .card_recurrence, [class*="recurrence"]');
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
                        category: cat,
                        bankSlug: 'bci'
                      });
                    }
                  } catch (err) {
                    console.log(`[Extractor] Error procesando tarjeta:`, err.message);
                  }
                }
                return items;
              }, category);

              categoryOffers.push(...offersOnPage);
              console.log(`      ✅ Extraídas ${offersOnPage.length} ofertas de página ${currentPage}`);

              // Navegar a la siguiente página si no es la última
              if (currentPage < totalPages) {
                try {
                  // Buscar botón siguiente
                  const nextButton = await page.locator('a:has-text("Siguiente"), button:has-text("Siguiente"), .pagination-next, [class*="next"]').first();
                  if (await nextButton.isVisible()) {
                    await nextButton.click();
                    await page.waitForTimeout(3000);
                  } else {
                    // Intentar con número de página
                    const nextPageButton = await page.locator(`a:has-text("${currentPage + 1}"), button:has-text("${currentPage + 1}")`).first();
                    if (await nextPageButton.isVisible()) {
                      await nextPageButton.click();
                      await page.waitForTimeout(3000);
                    } else {
                      console.log(`      ⚠️  No se encontró botón para página ${currentPage + 1}`);
                      break;
                    }
                  }
                } catch (err) {
                  console.log(`      ⚠️  Error navegando a página ${currentPage + 1}: ${err.message}`);
                  break;
                }
              }
              
              currentPage++;
            }
            
            console.log(`      ✅ Total extraídas de "${category}": ${categoryOffers.length} ofertas`);
            allOffers.push(...categoryOffers);
          } else {
            console.log(`      ⚠️  Categoría "${category}" no encontrada`);
          }
          
        } catch (err) {
          console.log(`      ❌ Error procesando categoría "${category}": ${err.message}`);
        }
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
      console.log(`📊 RESUMEN BCI V1 CON CATEGORÍAS`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);
      console.log(`✅ Categorías procesadas: ${availableCategories.length}`);
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);

      // Resumen por categoría
      const categoryCounts = {};
      for (const offer of uniqueOffers) {
        categoryCounts[offer.category] = (categoryCounts[offer.category] || 0) + 1;
      }

      console.log(`\n📊 Ofertas por categoría:`);
      Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
          console.log(`   - ${cat}: ${count} ofertas`);
        });

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
      const jsonPath = path.join(dataDir, `bci_v1_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON guardado: ${jsonPath}`);

      // Guardar CSV
      const csvPath = path.join(dataDir, `bci_v1_${timestamp}.csv`);
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

      console.log(`\n✅ SCRAPING BCI V1 COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error en scraping:', error.message);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');
