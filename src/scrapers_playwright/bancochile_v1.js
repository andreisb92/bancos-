import { PlaywrightCrawler } from 'crawlee';

/**
 * BANCO DE CHILE V1 - SCRAPER CON SCROLL INFINITO
 * URL: https://sitiospublicos.bancochile.cl/personas/beneficios/beneficios-del-dia
 * Expectativa: 500+ ofertas con scroll infinito
 */

const BANCOCHILE_URL = 'https://sitiospublicos.bancochile.cl/personas/beneficios/beneficios-del-dia';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCO DE CHILE V1 - SCRAPER CON SCROLL INFINITO');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer 500+ ofertas con scroll infinito');
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
  requestHandlerTimeoutSecs: 600, // 10 minutos para scroll infinito
  maxRequestRetries: 2,
  
  async requestHandler({ page, log }) {
    try {
      console.log('   📄 Cargando página inicial...');
      await page.goto(BANCOCHILE_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      await page.waitForTimeout(3000);
      console.log('      ✓ Página cargada');

      // SCROLL INFINITO: Hacer scroll hasta el final
      console.log('\n   🔄 Iniciando scroll infinito...');
      let previousCount = 0;
      let noChangeCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 100; // Máximo 100 scrolls

      while (scrollAttempts < maxScrollAttempts) {
        // Contar ofertas actuales
        const currentCount = await page.evaluate(() => {
          const cards = document.querySelectorAll('a.card.group.bg-white');
          return cards.length;
        });

        console.log(`      📊 Scroll ${scrollAttempts + 1}: ${currentCount} ofertas cargadas`);

        // Si no hay cambios, incrementar contador
        if (currentCount === previousCount) {
          noChangeCount++;
          // Si no hay cambios después de 3 intentos, terminar
          if (noChangeCount >= 3) {
            console.log('      ✓ No hay más ofertas, finalizando scroll');
            break;
          }
        } else {
          noChangeCount = 0; // Reset si hay cambios
        }

        previousCount = currentCount;

        // Hacer scroll al final de la página
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        // Esperar a que carguen nuevas ofertas
        await page.waitForTimeout(2000);
        
        scrollAttempts++;
      }

      console.log(`\n   ✅ Scroll completado después de ${scrollAttempts} intentos`);

      // Extraer todas las ofertas
      console.log('\n   📦 Extrayendo ofertas...');
      const allOffers = await page.evaluate(() => {
        const items = [];
        const cards = document.querySelectorAll('a.card.group.bg-white');
        
        console.log(`[Extractor] Tarjetas encontradas: ${cards.length}`);

        for (const card of cards) {
          try {
            // Extraer comercio/título
            const titleElem = card.querySelector('p.font-700.text-3.text-gray-dark');
            const title = titleElem ? titleElem.textContent.trim() : '';

            // Extraer descuento
            const discountElem = card.querySelector('p.font-700.text-3.text-primary');
            const discount = discountElem ? discountElem.textContent.trim() : '';

            // Extraer términos
            const termsElem = card.querySelector('p.overflow-ellipsis.mb-2.text-2.text-gray');
            const terms = termsElem ? termsElem.textContent.trim() : '';

            // Extraer imagen
            let imageUrl = '';
            const imgElem = card.querySelector('img');
            if (imgElem) {
              imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
            }

            // Extraer enlace
            const linkUrl = card.href || '';

            // Solo agregar si tiene contenido válido
            if (title || discount) {
              items.push({
                title: title || 'Beneficio Banco de Chile',
                merchant: title || 'Comercio',
                discount: discount || 'Descuento disponible',
                terms: terms || 'Ver términos y condiciones',
                imageUrl: imageUrl,
                linkUrl: linkUrl,
                url: window.location.href,
                bankSlug: 'banco-de-chile'
              });
            }
          } catch (err) {
            console.log(`[Extractor] Error procesando tarjeta:`, err.message);
          }
        }

        return items;
      });

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
      console.log(`📊 RESUMEN BANCO DE CHILE V1`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log('════════════════════════════════════════════════════════════════════════════════\n');

      // Guardar resultados
      const fs = await import('fs');
      const path = await import('path');
      
      const dataDir = path.join(process.cwd(), 'data', 'banco-de-chile');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const jsonFile = path.join(dataDir, `banco-de-chile_v1_${timestamp}.json`);
      
      fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
      console.log(`💾 JSON guardado en: ${jsonFile}`);

      // También CSV
      if (uniqueOffers.length > 0) {
        const csvFile = path.join(dataDir, `banco-de-chile_v1_${timestamp}.csv`);
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

      console.log('\n✅ SCRAPING BANCO DE CHILE V1 COMPLETADO\n');

    } catch (error) {
      console.error('❌ Error en Banco de Chile V1:', error.message);
      throw error;
    }
  },
});

await crawler.run([BANCOCHILE_URL]);
console.log('🏁 Proceso finalizado');



