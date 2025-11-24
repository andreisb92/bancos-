import { PlaywrightCrawler } from 'crawlee';

/**
 * SANTANDER V4 - SCRAPER ESPECÍFICO CON SELECTORES REALES
 * Basado en análisis de DevTools del usuario
 * 256 ofertas en 14 páginas
 */

const SANTANDER_URL = 'https://banco.santander.cl/beneficios';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCO SANTANDER V4 - SCRAPER CON PAGINACIÓN');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer 256 ofertas de 14 páginas');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: false, // Visible para debug
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
    let currentPage = 1;
    let totalPages = 1;

    try {
      console.log('   📄 Cargando página inicial...');
      await page.goto(SANTANDER_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      // Espera inicial para que cargue el contenido
      await page.waitForTimeout(5000);
      console.log('      ✓ Página cargada');

      // Detectar total de páginas
      try {
        const totalPagesText = await page.locator('ul.pagination li p').last().textContent({ timeout: 5000 });
        totalPages = parseInt(totalPagesText.trim()) || 14;
        console.log(`   📊 Total de páginas detectadas: ${totalPages}`);
      } catch (e) {
        console.log('   ⚠️  No se pudo detectar total de páginas, usando 14 por defecto');
        totalPages = 14;
      }

      // Iterar por todas las páginas
      while (currentPage <= totalPages) {
        console.log(`\n   📄 Procesando página ${currentPage}/${totalPages}...`);

        // Esperar a que carguen las ofertas
        await page.waitForTimeout(3000);

        // Extraer ofertas de la página actual
        const offersOnPage = await page.evaluate(() => {
          const items = [];
          
          // Selector principal: todas las tarjetas de descuento
          const cards = document.querySelectorAll('.discount-cont.d-flex');
          console.log(`[Extractor] Tarjetas encontradas: ${cards.length}`);

          for (const card of cards) {
            try {
              // Extraer título/comercio
              const titleElem = card.querySelector('p.fw-bold.f-large');
              const title = titleElem ? titleElem.textContent.trim() : '';

              // Extraer descuento
              const discountElem = card.querySelector('p.text-primary-mediumgrey.f-small.fw-normal.mb-12');
              const discount = discountElem ? discountElem.textContent.trim() : '';

              // Extraer imagen (puede estar en figure img o como background-image)
              let imageUrl = '';
              const imgElem = card.querySelector('figure img');
              if (imgElem) {
                imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
              } else {
                const figureElem = card.querySelector('figure');
                if (figureElem) {
                  const bgImage = window.getComputedStyle(figureElem).backgroundImage;
                  const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                  if (match) imageUrl = match[1];
                }
              }

              // Extraer términos/descripción (todo el texto de la tarjeta)
              const terms = card.textContent.trim().substring(0, 300);

              // Extraer enlace (si existe botón "más info")
              let linkUrl = '';
              const linkElem = card.querySelector('a[href], button[onclick]');
              if (linkElem) {
                linkUrl = linkElem.href || '';
              }

              // Solo agregar si tiene contenido válido
              if (title || discount) {
                items.push({
                  title: title || 'Beneficio Santander',
                  merchant: title || 'Comercio',
                  discount: discount || 'Descuento',
                  terms: terms,
                  imageUrl: imageUrl,
                  linkUrl: linkUrl || window.location.href,
                  url: window.location.href,
                  bankSlug: 'santander'
                });
              }
            } catch (err) {
              console.log(`[Extractor] Error procesando tarjeta:`, err.message);
            }
          }

          return items;
        });

        console.log(`      ✅ Extraídas ${offersOnPage.length} ofertas de página ${currentPage}`);
        allOffers.push(...offersOnPage);

        // Si no es la última página, hacer click en "Siguiente"
        if (currentPage < totalPages) {
          try {
            console.log(`      🔄 Navegando a página ${currentPage + 1}...`);
            
            // Buscar el botón de siguiente (con chevron-right)
            const nextButton = await page.locator('button .str-chevron-right').locator('..').first();
            
            if (await nextButton.isVisible({ timeout: 3000 })) {
              await nextButton.click();
              await page.waitForTimeout(4000); // Esperar a que cargue la nueva página
              console.log(`      ✓ Navegación exitosa a página ${currentPage + 1}`);
            } else {
              console.log(`      ⚠️  Botón siguiente no visible, terminando paginación`);
              break;
            }
          } catch (e) {
            console.log(`      ⚠️  Error al navegar a página ${currentPage + 1}: ${e.message}`);
            break;
          }
        }

        currentPage++;
      }

      // Deduplicar ofertas por título + descuento
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
      console.log(`📊 RESUMEN SANTANDER V4`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
      console.log(`✅ Páginas procesadas: ${currentPage - 1}/${totalPages}`);
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log('════════════════════════════════════════════════════════════════════════════════\n');

      // Guardar resultados
      const fs = await import('fs');
      const path = await import('path');
      
      const dataDir = path.join(process.cwd(), 'data', 'santander');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const jsonFile = path.join(dataDir, `santander_v4_${timestamp}.json`);
      
      fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
      console.log(`💾 Guardado en: ${jsonFile}`);

      // También CSV
      if (uniqueOffers.length > 0) {
        const csvFile = path.join(dataDir, `santander_v4_${timestamp}.csv`);
        const headers = ['Título', 'Comercio', 'Descuento', 'Términos', 'Imagen', 'Link', 'URL'];
        const csvContent = [
          headers.join(','),
          ...uniqueOffers.map(o => [
            `"${o.title.replace(/"/g, '""')}"`,
            `"${o.merchant.replace(/"/g, '""')}"`,
            `"${o.discount.replace(/"/g, '""')}"`,
            `"${o.terms.replace(/"/g, '""')}"`,
            `"${o.imageUrl}"`,
            `"${o.linkUrl}"`,
            `"${o.url}"`
          ].join(','))
        ].join('\n');
        
        fs.writeFileSync(csvFile, csvContent);
        console.log(`💾 CSV guardado en: ${csvFile}`);
      }

      console.log('\n✅ SCRAPING SANTANDER V4 COMPLETADO\n');

    } catch (error) {
      console.error('❌ Error en Santander V4:', error.message);
      throw error;
    }
  },
});

await crawler.run([SANTANDER_URL]);
console.log('🏁 Proceso finalizado');

