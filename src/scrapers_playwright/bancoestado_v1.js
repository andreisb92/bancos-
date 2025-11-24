import { PlaywrightCrawler } from 'crawlee';

/**
 * BANCOESTADO V1 - SCRAPER CON CATEGORÍAS Y MODALS
 * Estructura mixta: categorías como Ripley + modals como Santander
 * URL: https://www.bancoestado.cl/beneficios
 */

const BANCOESTADO_URL = 'https://www.bancoestado.cl/beneficios';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCOESTADO V1 - SCRAPER CON CATEGORÍAS Y MODALS');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas de todas las categorías con detalles completos');
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
  requestHandlerTimeoutSecs: 900, // 15 minutos
  maxRequestRetries: 2,
  
  async requestHandler({ page, log }) {
    try {
      console.log('   📄 Cargando página inicial...');
      await page.goto(BANCOESTADO_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      await page.waitForTimeout(5000);
      console.log('      ✓ Página cargada');

      // Detectar todas las categorías - esperar más tiempo y buscar en todo el DOM
      await page.waitForTimeout(3000);
      
      const categories = await page.evaluate(() => {
        const cats = [];
        
        // Buscar todas las secciones de categorías visibles
        // Según el HTML: div.msd-beneficios con ID específico
        const sections = document.querySelectorAll('[id*="container-"], [class*="msd-beneficios"]');
        
        for (const section of sections) {
          const categoryName = section.getAttribute('data-category') || 
                              section.querySelector('[class*="categorias"]')?.textContent.trim() ||
                              '';
          
          if (categoryName && categoryName.length > 0) {
            cats.push({
              index: cats.length,
              name: categoryName,
              sectionId: section.id || ''
            });
          }
        }
        
        // Si no encontramos categorías así, buscar de otra forma
        if (cats.length === 0) {
          // Detectar por las cards visibles y sus data-category
          const allCards = document.querySelectorAll('[data-category]');
          const categorySet = new Set();
          
          allCards.forEach(card => {
            const cat = card.getAttribute('data-category');
            if (cat && !categorySet.has(cat)) {
              categorySet.add(cat);
              cats.push({
                index: cats.length,
                name: cat,
                sectionId: ''
              });
            }
          });
        }
        
        return cats.length > 0 ? cats : [{ index: 0, name: 'todas', sectionId: '' }];
      });

      console.log(`\n   📊 Categorías encontradas: ${categories.length}`);
      categories.forEach(cat => console.log(`      - ${cat.name}`));

      const allOffers = [];

      // Extraer TODAS las cards de una vez (sin filtrar por categoría)
      console.log('\n   📦 Extrayendo todas las ofertas...');
      
      const cards = await page.evaluate(() => {
        // Buscar todas las cards con data attributes
        const cardElements = document.querySelectorAll('[data-name][data-oferta], [data-category][data-name]');
        
        return Array.from(cardElements).map((card, idx) => {
          const dataName = card.getAttribute('data-name') || '';
          const dataOferta = card.getAttribute('data-oferta') || '';
          const dataCategory = card.getAttribute('data-category') || '';
          const cardId = card.getAttribute('data-card-id') || `card-${idx}`;
          
          return {
            index: idx,
            dataName: dataName,
            dataOferta: dataOferta,
            dataCategory: dataCategory,
            cardId: cardId
          };
        }).filter(card => card.dataName || card.dataOferta); // Solo cards con datos
      });

      console.log(`      📋 ${cards.length} ofertas encontradas en total`);

      // Procesar cada card
      for (let i = 0; i < cards.length; i++) {
        try {
          const card = cards[i];
          console.log(`      🔍 Oferta ${i + 1}/${cards.length}: ${card.dataName || 'Sin nombre'}`);

          // Click en el botón "Ver más" o en la card misma
          const clicked = await page.evaluate((cardIndex) => {
                const cardElements = document.querySelectorAll('.card-beneficios:not(.hidden), [class*="msd-beneficios-content-list-card"]:not(.hidden)');
                const card = cardElements[cardIndex];
                if (!card) return false;

                // Buscar botón "Ver más"
                const verMasBtn = card.querySelector('button[class*="button"], a[class*="button"]');
                if (verMasBtn) {
                  verMasBtn.click();
                  return true;
                }
                
                // Si no hay botón, click en la card
                card.click();
                return true;
              }, i);

              if (!clicked) {
                console.log(`      ⚠️  No se pudo hacer click en la oferta ${i + 1}`);
                continue;
              }

              await page.waitForTimeout(1500);

              // Verificar si se abrió un modal
              const modalVisible = await page.locator('.modal.visible, .modal-sabores.visible, .modal[style*="display: block"]').isVisible({ timeout: 3000 }).catch(() => false);

          let offerDetails = {
            title: card.dataName || '',
            discount: card.dataOferta || '',
            category: card.dataCategory || 'general'
          };

          if (modalVisible) {
                // Extraer información del modal
                const modalData = await page.evaluate(() => {
                  const modal = document.querySelector('.modal.visible, .modal-sabores.visible, .modal[style*="display: block"]');
                  if (!modal) return null;

                  const data = {};

                  // Logo/Imagen
                  const imgElem = modal.querySelector('img');
                  data.imageUrl = imgElem ? (imgElem.src || imgElem.getAttribute('data-src') || '') : '';

                  // Vigencia
                  const vigenciaElem = modal.querySelector('.modal-body-tarjeta p, p:contains("Válido")');
                  if (vigenciaElem) {
                    data.vigencia = vigenciaElem.textContent.trim();
                  }

                  // Locales disponibles
                  const localesTitle = modal.querySelector('h6, h5, strong');
                  if (localesTitle && localesTitle.textContent.includes('Locales')) {
                    const localesList = modal.querySelector('ul');
                    if (localesList) {
                      const locales = Array.from(localesList.querySelectorAll('li')).map(li => li.textContent.trim());
                      data.locales = locales;
                    }
                  }

                  // Texto completo del modal
                  data.terms = modal.textContent.trim().substring(0, 500);

                  return data;
                });

                if (modalData) {
                  offerDetails = { ...offerDetails, ...modalData };
                }

                // Cerrar modal
                try {
                  await page.keyboard.press('Escape');
                  await page.waitForTimeout(500);
                } catch (e) {
                  // Intentar con botón cerrar
                  await page.locator('.modal-close, button[aria-label="Cerrar"]').click({ timeout: 2000 }).catch(() => {});
                  await page.waitForTimeout(500);
                }
          } else {
                // Si no hay modal, extraer de la card directamente
                const cardData = await page.evaluate((cardIndex) => {
                  const cardElements = document.querySelectorAll('.card-beneficios:not(.hidden), [class*="msd-beneficios-content-list-card"]:not(.hidden)');
                  const card = cardElements[cardIndex];
                  if (!card) return null;

                  const data = {};
                  
                  const imgElem = card.querySelector('img');
                  data.imageUrl = imgElem ? (imgElem.src || '') : '';

                  const titleElem = card.querySelector('[class*="title"], h3, h4');
                  data.title = titleElem ? titleElem.textContent.trim() : '';

                  const discountElem = card.querySelector('[class*="pretitle"], [class*="subtitle"]');
                  data.discount = discountElem ? discountElem.textContent.trim() : '';

                  return data;
                }, i);

                if (cardData) {
                  offerDetails = { ...offerDetails, ...cardData };
                }
          }

          allOffers.push({
                ...offerDetails,
                url: BANCOESTADO_URL,
                bankSlug: 'bancoestado',
                extractedAt: new Date().toISOString()
          });

          if ((i + 1) % 10 === 0) {
            console.log(`      ✓ ${i + 1} ofertas procesadas...`);
          }

        } catch (err) {
          console.log(`      ⚠️  Error en oferta ${i + 1}: ${err.message}`);
        }
      }

      // Deduplicar ofertas
      const uniqueOffers = [];
      const seen = new Set();
      
      for (const offer of allOffers) {
        const key = `${offer.title}|${offer.discount}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueOffers.push(offer);
        }
      }

      console.log('\n════════════════════════════════════════════════════════════════════════════════');
      console.log(`📊 RESUMEN BANCOESTADO V1`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
      console.log(`✅ Categorías detectadas: ${categories.length}`);
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      
      const conVigencia = uniqueOffers.filter(o => o.vigencia && o.vigencia.length > 0).length;
      console.log(`📅 Con vigencia: ${conVigencia}/${uniqueOffers.length}`);
      console.log('════════════════════════════════════════════════════════════════════════════════\n');

      // Resumen por categoría
      const categorySummary = {};
      for (const offer of uniqueOffers) {
        categorySummary[offer.category] = (categorySummary[offer.category] || 0) + 1;
      }
      console.log('   📊 Ofertas por categoría:');
      for (const [category, count] of Object.entries(categorySummary)) {
        console.log(`      - ${category}: ${count} ofertas`);
      }

      // Guardar resultados
      const fs = await import('fs');
      const path = await import('path');
      
      const dataDir = path.join(process.cwd(), 'data', 'bancoestado');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const jsonFile = path.join(dataDir, `bancoestado_v1_${timestamp}.json`);
      
      fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
      console.log(`\n💾 JSON: ${jsonFile}`);

      // CSV
      if (uniqueOffers.length > 0) {
        const csvFile = path.join(dataDir, `bancoestado_v1_${timestamp}.csv`);
        const headers = ['Título', 'Descuento', 'Vigencia', 'Categoría', 'Locales', 'Imagen', 'URL'];
        const csvContent = [
          headers.join(','),
          ...uniqueOffers.map(o => [
            `"${(o.title || '').replace(/"/g, '""')}"`,
            `"${(o.discount || '').replace(/"/g, '""')}"`,
            `"${(o.vigencia || '').replace(/"/g, '""')}"`,
            `"${(o.category || '').replace(/"/g, '""')}"`,
            `"${(o.locales || []).join('; ').replace(/"/g, '""')}"`,
            `"${o.imageUrl || ''}"`,
            `"${o.url}"`
          ].join(','))
        ].join('\n');
        
        fs.writeFileSync(csvFile, csvContent);
        console.log(`💾 CSV: ${csvFile}`);
      }

      console.log('\n✅ BANCOESTADO V1 COMPLETADO\n');

    } catch (error) {
      console.error('❌ Error en BancoEstado V1:', error.message);
      throw error;
    }
  },
});

await crawler.run([BANCOESTADO_URL]);
console.log('🏁 Proceso finalizado');

