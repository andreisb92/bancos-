import { PlaywrightCrawler } from 'crawlee';

/**
 * BANCOESTADO V3 - CON CLICK EN CATEGORÍAS
 * Procesa TODAS las categorías: Sabores, Música y Entretención, etc.
 */

const BANCOESTADO_URL = 'https://www.bancoestado.cl/beneficios';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCOESTADO V3 - CON TODAS LAS CATEGORÍAS');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Extraer ofertas de TODAS las categorías (Sabores, Música, etc.)');
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
  requestHandlerTimeoutSecs: 600,
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

      // Detectar todas las categorías
      const categories = await page.evaluate(() => {
        const cats = [];
        const categoryElements = document.querySelectorAll('span.msd-beneficios-categorias--tab-item-nombre');
        
        categoryElements.forEach((span, idx) => {
          const name = span.textContent.trim();
          if (name && name.length > 0) {
            cats.push({
              index: idx,
              name: name
            });
          }
        });
        
        return cats;
      });

      console.log(`\n   📊 Categorías encontradas: ${categories.length}`);
      categories.forEach(cat => console.log(`      - ${cat.name}`));

      const allOffers = [];
      let categoryCount = 0;

      // Iterar por cada categoría
      for (const category of categories) {
        categoryCount++;
        console.log(`\n   📂 Categoría ${categoryCount}/${categories.length}: ${category.name}`);

        try {
          // Click en la categoría
          const clicked = await page.evaluate((categoryName) => {
            const spans = document.querySelectorAll('span.msd-beneficios-categorias--tab-item-nombre');
            for (const span of spans) {
              if (span.textContent.trim() === categoryName) {
                // Click en el span o en su contenedor padre
                const container = span.closest('.msd-beneficios-categorias--tab-item') || span.parentElement;
                if (container) {
                  container.click();
                } else {
                  span.click();
                }
                return true;
              }
            }
            return false;
          }, category.name);

          if (!clicked) {
            console.log(`      ⚠️  No se pudo hacer click en "${category.name}"`);
            continue;
          }

          // Esperar a que carguen las ofertas
          await page.waitForTimeout(3000);

          // Extraer ofertas de esta categoría
          const offersInCategory = await page.evaluate((categoryName) => {
            const offers = [];
            
            // Buscar TODAS las cards con data-name (sin filtrar por hidden)
            const cards = document.querySelectorAll('[data-name][data-oferta]');
            
            console.log(`[Extractor] Total cards en página: ${cards.length}`);
            
            // Filtrar solo las visibles (display != none, visibility != hidden)
            const visibleCards = Array.from(cards).filter(card => {
              const style = window.getComputedStyle(card);
              const display = style.display;
              const visibility = style.visibility;
              const opacity = style.opacity;
              
              return display !== 'none' && visibility !== 'hidden' && opacity !== '0';
            });
            
            console.log(`[Extractor] Cards visibles en ${categoryName}: ${visibleCards.length}`);
            
            for (const card of visibleCards) {
              try {
                const name = card.getAttribute('data-name') || '';
                const oferta = card.getAttribute('data-oferta') || '';
                const category = card.getAttribute('data-category') || '';
                const tarjeta = card.getAttribute('data-tarjeta') || '';
                
                // Extraer subfiltros
                let subfiltros = {};
                const subfiltrosAttr = card.getAttribute('data-subfiltros');
                if (subfiltrosAttr) {
                  try {
                    subfiltros = JSON.parse(subfiltrosAttr);
                  } catch (e) {
                    subfiltros = { raw: subfiltrosAttr };
                  }
                }
                
                // Extraer imagen
                let imageUrl = '';
                const imgElem = card.querySelector('img');
                if (imgElem) {
                  imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
                }
                
                // Extraer descripción visible
                const subtitleElem = card.querySelector('.msd-beneficios-content-list-card--sabores--subtitle, [class*="subtitle"]');
                const descriptionElem = card.querySelector('.msd-beneficios-content-list-card--sabores--description, [class*="description"]');
                
                const subtitle = subtitleElem ? subtitleElem.textContent.trim() : '';
                const description = descriptionElem ? descriptionElem.textContent.trim() : '';
                
                // Zona y día desde subfiltros
                let zona = '';
                if (subfiltros.zona) {
                  zona = Array.isArray(subfiltros.zona) ? subfiltros.zona.join(', ') : subfiltros.zona;
                }
                
                let dia = '';
                if (subfiltros.dia) {
                  dia = Array.isArray(subfiltros.dia) ? subfiltros.dia.join(', ') : subfiltros.dia;
                }
                
                offers.push({
                  title: name || tarjeta || 'Beneficio BancoEstado',
                  merchant: name || tarjeta,
                  discount: oferta,
                  subtitle: subtitle,
                  description: description,
                  category: categoryName, // Usar el nombre de la categoría actual
                  originalCategory: category,
                  tarjeta: tarjeta,
                  zona: zona,
                  dia: dia,
                  imageUrl: imageUrl,
                  url: window.location.href,
                  bankSlug: 'bancoestado'
                });
                
              } catch (err) {
                console.log(`[Extractor] Error en card: ${err.message}`);
              }
            }
            
            return offers;
          }, category.name);

          console.log(`      ✅ ${offersInCategory.length} ofertas extraídas de "${category.name}"`);
          allOffers.push(...offersInCategory);

        } catch (err) {
          console.log(`      ⚠️  Error en categoría "${category.name}": ${err.message}`);
        }
      }

      // Deduplicar
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
      console.log(`📊 RESUMEN BANCOESTADO V3`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
      console.log(`✅ Categorías procesadas: ${categoryCount}`);
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log('════════════════════════════════════════════════════════════════════════════════\n');

      // Resumen por categoría
      const categorySummary = {};
      for (const offer of uniqueOffers) {
        const cat = offer.category || 'sin categoría';
        categorySummary[cat] = (categorySummary[cat] || 0) + 1;
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
      const jsonFile = path.join(dataDir, `bancoestado_v3_${timestamp}.json`);
      
      fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
      console.log(`\n💾 JSON: ${jsonFile}`);

      // CSV
      if (uniqueOffers.length > 0) {
        const csvFile = path.join(dataDir, `bancoestado_v3_${timestamp}.csv`);
        const headers = ['Título', 'Comercio', 'Descuento', 'Subtítulo', 'Descripción', 'Categoría', 'Zona', 'Día', 'Tarjeta', 'Imagen', 'URL'];
        const csvContent = [
          headers.join(','),
          ...uniqueOffers.map(o => [
            `"${(o.title || '').replace(/"/g, '""')}"`,
            `"${(o.merchant || '').replace(/"/g, '""')}"`,
            `"${(o.discount || '').replace(/"/g, '""')}"`,
            `"${(o.subtitle || '').replace(/"/g, '""')}"`,
            `"${(o.description || '').replace(/"/g, '""')}"`,
            `"${(o.category || '').replace(/"/g, '""')}"`,
            `"${(o.zona || '').replace(/"/g, '""')}"`,
            `"${(o.dia || '').replace(/"/g, '""')}"`,
            `"${(o.tarjeta || '').replace(/"/g, '""')}"`,
            `"${o.imageUrl || ''}"`,
            `"${o.url}"`
          ].join(','))
        ].join('\n');
        
        fs.writeFileSync(csvFile, csvContent);
        console.log(`💾 CSV: ${csvFile}`);
      }

      // Guardar también en JSONL
      const jsonlDir = path.join(process.cwd(), 'data', 'jsonl');
      if (!fs.existsSync(jsonlDir)) {
        fs.mkdirSync(jsonlDir, { recursive: true });
      }
      const jsonlPath = path.join(jsonlDir, 'bancoestado.jsonl');
      const jsonlContent = uniqueOffers.map(o => JSON.stringify(o)).join('\n') + '\n';
      fs.writeFileSync(jsonlPath, jsonlContent, 'utf-8');
      console.log(`💾 JSONL guardado: ${jsonlPath}`);

      console.log('\n✅ BANCOESTADO V3 COMPLETADO\n');

    } catch (error) {
      console.error('❌ Error en BancoEstado V3:', error.message);
      throw error;
    }
  },
});

await crawler.run([BANCOESTADO_URL]);
console.log('🏁 Proceso finalizado');

