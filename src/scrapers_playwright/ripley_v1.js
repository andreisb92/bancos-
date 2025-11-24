import { PlaywrightCrawler } from 'crawlee';

/**
 * BANCO RIPLEY V1 - SCRAPER CON CATEGORÍAS/TABS
 * URL: https://www.bancoripley.cl/beneficios-y-promociones
 * Estructura: Diferentes categorías (Restaurantes, Comida & Delivery, etc.)
 */

const RIPLEY_URL = 'https://www.bancoripley.cl/beneficios-y-promociones';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCO RIPLEY V1 - SCRAPER CON CATEGORÍAS');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas de todas las categorías');
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
  maxRequestRetries: 2,
  
  async requestHandler({ page, log }) {
    try {
      console.log('   📄 Cargando página inicial...');
      await page.goto(RIPLEY_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      await page.waitForTimeout(5000);
      console.log('      ✓ Página cargada');

      // Esperar a que carguen los tabs
      await page.waitForSelector('a.classEventTabBeneficio.nav-item.nav-link', { timeout: 10000 });
      console.log('      ✓ Categorías detectadas');

      // Obtener todos los tabs/categorías (solo los visibles del desktop)
      const tabs = await page.evaluate(() => {
        const tabElements = document.querySelectorAll('a.classEventTabBeneficio.nav-item.nav-link.normal-object');
        return Array.from(tabElements).map((tab, index) => ({
          index: index,
          name: tab.querySelector('span')?.textContent.trim() || `Categoría ${index + 1}`,
          id: tab.getAttribute('href') || `#tab-${index}`,
          dataToggle: tab.getAttribute('data-fbtab') || ''
        }));
      });

      console.log(`\n   📊 Categorías encontradas: ${tabs.length}`);
      tabs.forEach(tab => console.log(`      - ${tab.name}`));

      const allOffers = [];
      let categoryCount = 0;

      // Iterar por cada categoría
      for (const tab of tabs) {
        categoryCount++;
        console.log(`\n   📂 Procesando categoría ${categoryCount}/${tabs.length}: ${tab.name}`);

        try {
          // Click en el tab (usando selector más específico para desktop)
          await page.click(`a.nav-link.normal-object[href="${tab.id}"]`);
          await page.waitForTimeout(3000); // Esperar a que cargue el contenido

          // Extraer ofertas de esta categoría
          const offersInCategory = await page.evaluate((categoryName) => {
            const items = [];
            const cards = document.querySelectorAll('div.new-card_beneficios');
            
            console.log(`[Extractor] Tarjetas encontradas en ${categoryName}: ${cards.length}`);

            for (const card of cards) {
              try {
                // Extraer título
                const titleElem = card.querySelector('p.title');
                const title = titleElem ? titleElem.textContent.trim() : '';

                // Extraer subtítulo
                const subTitleElem = card.querySelector('p.subTitle');
                const subTitle = subTitleElem ? subTitleElem.textContent.trim() : '';

                // Extraer descuento
                const discountElem = card.querySelector('p.dcto');
                const discount = discountElem ? discountElem.textContent.trim() : '';

                // Extraer descripción/ubicación
                const descElem = card.querySelector('p.description');
                const description = descElem ? descElem.textContent.trim() : '';

                // Extraer imagen
                let imageUrl = '';
                const imgElem = card.querySelector('img');
                if (imgElem) {
                  imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
                }

                // Extraer enlace (el card completo puede ser clickeable)
                let linkUrl = '';
                const linkElem = card.closest('a') || card.querySelector('a');
                if (linkElem) {
                  linkUrl = linkElem.href || '';
                }

                // Solo agregar si tiene contenido válido
                if (title || discount) {
                  items.push({
                    title: title || 'Beneficio Ripley',
                    merchant: title || 'Comercio',
                    subtitle: subTitle,
                    discount: discount || 'Descuento disponible',
                    terms: description || subTitle || 'Ver términos y condiciones',
                    location: description,
                    imageUrl: imageUrl,
                    linkUrl: linkUrl || window.location.href,
                    url: window.location.href,
                    category: categoryName,
                    bankSlug: 'banco-ripley'
                  });
                }
              } catch (err) {
                console.log(`[Extractor] Error procesando tarjeta:`, err.message);
              }
            }

            return items;
          }, tab.name);

          console.log(`      ✅ Extraídas ${offersInCategory.length} ofertas de "${tab.name}"`);
          allOffers.push(...offersInCategory);

        } catch (err) {
          console.log(`      ⚠️  Error en categoría "${tab.name}": ${err.message}`);
        }
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
      console.log(`📊 RESUMEN BANCO RIPLEY V1`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
      console.log(`✅ Categorías procesadas: ${categoryCount}`);
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log('════════════════════════════════════════════════════════════════════════════════\n');

      // Mostrar resumen por categoría
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
      
      const dataDir = path.join(process.cwd(), 'data', 'banco-ripley');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const jsonFile = path.join(dataDir, `banco-ripley_v1_${timestamp}.json`);
      
      fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
      console.log(`\n💾 JSON guardado en: ${jsonFile}`);

      // También CSV
      if (uniqueOffers.length > 0) {
        const csvFile = path.join(dataDir, `banco-ripley_v1_${timestamp}.csv`);
        const headers = ['Título', 'Comercio', 'Subtítulo', 'Descuento', 'Términos', 'Ubicación', 'Categoría', 'Imagen', 'Link', 'URL'];
        const csvContent = [
          headers.join(','),
          ...uniqueOffers.map(o => [
            `"${o.title.replace(/"/g, '""')}"`,
            `"${o.merchant.replace(/"/g, '""')}"`,
            `"${(o.subtitle || '').replace(/"/g, '""')}"`,
            `"${o.discount.replace(/"/g, '""')}"`,
            `"${o.terms.replace(/"/g, '""')}"`,
            `"${(o.location || '').replace(/"/g, '""')}"`,
            `"${o.category.replace(/"/g, '""')}"`,
            `"${o.imageUrl}"`,
            `"${o.linkUrl}"`,
            `"${o.url}"`
          ].join(','))
        ].join('\n');
        
        fs.writeFileSync(csvFile, csvContent);
        console.log(`💾 CSV guardado en: ${csvFile}`);
      }

      // Guardar también en JSONL
      const jsonlDir = path.join(process.cwd(), 'data', 'jsonl');
      if (!fs.existsSync(jsonlDir)) {
        fs.mkdirSync(jsonlDir, { recursive: true });
      }
      const jsonlPath = path.join(jsonlDir, 'ripley.jsonl');
      const jsonlContent = uniqueOffers.map(o => JSON.stringify(o)).join('\n') + '\n';
      fs.writeFileSync(jsonlPath, jsonlContent, 'utf-8');
      console.log(`💾 JSONL guardado: ${jsonlPath}`);

      console.log('\n✅ SCRAPING BANCO RIPLEY V1 COMPLETADO\n');

    } catch (error) {
      console.error('❌ Error en Banco Ripley V1:', error.message);
      throw error;
    }
  },
});

await crawler.run([RIPLEY_URL]);
console.log('🏁 Proceso finalizado');

