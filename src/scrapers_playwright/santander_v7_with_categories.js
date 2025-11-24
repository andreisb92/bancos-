import { PlaywrightCrawler } from 'crawlee';

/**
 * SANTANDER V7 - SCRAPER CON CATEGORÍAS REALES
 * Basado en los selectores reales encontrados
 */

const SANTANDER_URL = 'https://banco.santander.cl/beneficios';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCO SANTANDER V7 - SCRAPER CON CATEGORÍAS REALES');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas con categorías usando selectores reales');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
      ],
    },
  },
  requestHandlerTimeoutSecs: 600,
  maxRequestRetries: 3,
  
  async requestHandler({ page, log }) {
    const allOffers = [];

    try {
      console.log('   📄 Cargando página inicial...');
      await page.goto(SANTANDER_URL, { 
        waitUntil: 'domcontentloaded',
        timeout: 120000 
      });
      
      await page.waitForTimeout(5000);
      console.log('      ✓ Página cargada');

      // Extraer categorías disponibles usando los checkboxes
      console.log('   📊 Extrayendo categorías...');
      const availableCategories = await page.evaluate(() => {
        const categories = [];
        
        // Buscar checkboxes de categorías
        const categoryCheckboxes = document.querySelectorAll('fieldset input[type="checkbox"][id]');
        categoryCheckboxes.forEach(checkbox => {
          const id = checkbox.id;
          const label = checkbox.closest('span')?.querySelector('label');
          const text = label ? label.textContent.trim() : '';
          if (text && id !== 'ALL') {
            categories.push({
              id: id,
              name: text,
              value: checkbox.value || text
            });
          }
        });
        
        return categories;
      });

      console.log(`      ✅ Categorías encontradas: ${availableCategories.map(c => c.name).join(', ')}`);

      // Procesar cada categoría con paginación
      for (let i = 0; i < availableCategories.length; i++) {
        const category = availableCategories[i];
        console.log(`\n   📂 Procesando categoría ${i + 1}/${availableCategories.length}: ${category.name} (${category.id})`);
        
        try {
          // Hacer click en el checkbox de la categoría
          const categoryCheckbox = await page.locator(`input[type="checkbox"][id="${category.id}"]`);
          if (await categoryCheckbox.isVisible()) {
            await categoryCheckbox.click();
            await page.waitForTimeout(3000);
            
            // Detectar total de páginas para esta categoría
            let totalPages = 1;
            let currentPage = 1;
            const categoryOffers = [];
            
            // Función para extraer ofertas de la página actual
            const extractOffersFromPage = async () => {
              return await page.evaluate((cat) => {
                const items = [];
                // Buscar todas las tarjetas de ofertas (ajustar selectores según la estructura real)
                const cards = document.querySelectorAll('.discount-cont.d-flex, [class*="card"], [class*="benefit"], article');
                
                for (const card of cards) {
                  try {
                    // Extraer título/comercio
                    const titleElem = card.querySelector('p.fw-bold.f-large, h2, h3, [class*="title"]');
                    const title = titleElem ? titleElem.textContent.trim() : '';

                    // Extraer descuento
                    const discountElem = card.querySelector('p.text-primary-mediumgrey.f-small.fw-normal.mb-12, [class*="discount"], [class*="descuento"]');
                    const discount = discountElem ? discountElem.textContent.trim() : '';

                    // Extraer imagen
                    let imageUrl = '';
                    const imgElem = card.querySelector('img');
                    if (imgElem) {
                      imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
                    }

                    // Extraer términos
                    const terms = card.textContent.trim().substring(0, 300);

                    // Extraer enlace
                    let linkUrl = '';
                    const linkElem = card.querySelector('a[href]');
                    if (linkElem) {
                      linkUrl = linkElem.href || '';
                    }

                    if (title || discount) {
                      items.push({
                        title: title || 'Beneficio Santander',
                        merchant: title || 'Comercio',
                        discount: discount || 'Descuento',
                        terms: terms,
                        imageUrl: imageUrl,
                        linkUrl: linkUrl || window.location.href,
                        url: window.location.href,
                        category: cat.name,
                        bankSlug: 'santander'
                      });
                    }
                  } catch (err) {
                    console.log(`[Extractor] Error procesando tarjeta:`, err.message);
                  }
                }

                return items;
              }, category);
            };
            
            // Extraer primera página
            let pageOffers = await extractOffersFromPage();
            categoryOffers.push(...pageOffers);
            console.log(`      📄 Página ${currentPage}: ${pageOffers.length} ofertas`);
            
            // Intentar navegar a páginas siguientes usando la URL con parámetros
            while (true) {
              currentPage++;
              
              // Construir URL con paginación
              const baseUrl = page.url().split('#')[0];
              const categoryCodes = category.id === 'ALL' ? '' : category.id;
              const paginatedUrl = `${baseUrl}#/results?category-code=${encodeURIComponent(categoryCodes)}&page=${currentPage}`;
              
              try {
                await page.goto(paginatedUrl, {
                  waitUntil: 'domcontentloaded',
                  timeout: 60000
                });
                await page.waitForTimeout(3000);
                
                pageOffers = await extractOffersFromPage();
                
                if (pageOffers.length === 0) {
                  console.log(`      📄 Página ${currentPage}: Sin ofertas, fin de paginación`);
                  break;
                }
                
                categoryOffers.push(...pageOffers);
                console.log(`      📄 Página ${currentPage}: ${pageOffers.length} ofertas`);
                
                // Limitar a máximo 50 páginas por seguridad
                if (currentPage >= 50) {
                  console.log(`      ⚠️  Límite de 50 páginas alcanzado`);
                  break;
                }
              } catch (err) {
                console.log(`      ⚠️  Error navegando a página ${currentPage}: ${err.message}`);
                break;
              }
            }
            
            console.log(`      ✅ Total extraídas de "${category.name}": ${categoryOffers.length} ofertas`);
            allOffers.push(...categoryOffers);
          } else {
            console.log(`      ⚠️  Categoría "${category.name}" no encontrada`);
          }
          
        } catch (err) {
          console.log(`      ❌ Error procesando categoría "${category.name}": ${err.message}`);
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
      console.log(`📊 RESUMEN SANTANDER V7 CON CATEGORÍAS`);
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
      const dataDir = path.join(process.cwd(), 'data', 'santander');
      
      // Crear directorio si no existe
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Guardar JSON
      const jsonPath = path.join(dataDir, `santander_v7_categories_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON guardado: ${jsonPath}`);

      // Guardar CSV
      const csvPath = path.join(dataDir, `santander_v7_categories_${timestamp}.csv`);
      const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: [
          { id: 'title', title: 'title' },
          { id: 'merchant', title: 'merchant' },
          { id: 'discount', title: 'discount' },
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

      // Guardar también en JSONL
      const jsonlDir = path.join(process.cwd(), 'data', 'jsonl');
      if (!fs.existsSync(jsonlDir)) {
        fs.mkdirSync(jsonlDir, { recursive: true });
      }
      const jsonlPath = path.join(jsonlDir, 'santander.jsonl');
      const jsonlContent = uniqueOffers.map(o => JSON.stringify(o)).join('\n') + '\n';
      fs.writeFileSync(jsonlPath, jsonlContent, 'utf-8');
      console.log(`💾 JSONL guardado: ${jsonlPath}`);

      console.log(`\n✅ SCRAPING SANTANDER V7 CON CATEGORÍAS COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error en scraping:', error.message);
    }
  },
});

await crawler.run([SANTANDER_URL]);
console.log('🏁 Proceso finalizado');
