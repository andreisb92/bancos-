import { PlaywrightCrawler } from 'crawlee';

/**
 * BANCOESTADO V2 - SCRAPER OPTIMIZADO
 * Extrae info directamente de data-attributes (sin modals)
 * Mucho más rápido y confiable
 */

const BANCOESTADO_URL = 'https://www.bancoestado.cl/beneficios';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCOESTADO V2 - SCRAPER OPTIMIZADO SIN MODALS');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Extracción rápida usando data-attributes');
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

      // Extraer TODAS las ofertas de una vez usando data-attributes
      console.log('\n   📦 Extrayendo ofertas...');
      
      const allOffers = await page.evaluate(() => {
        const offers = [];
        
        // Buscar todas las cards con data-name
        const cards = document.querySelectorAll('[data-name][data-oferta]');
        
        console.log(`[Extractor] Cards encontradas: ${cards.length}`);
        
        for (const card of cards) {
          try {
            const name = card.getAttribute('data-name') || '';
            const oferta = card.getAttribute('data-oferta') || '';
            const category = card.getAttribute('data-category') || '';
            const tarjeta = card.getAttribute('data-tarjeta') || '';
            
            // Extraer subfiltros (puede contener zona, día, etc.)
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
            const subtitleElem = card.querySelector('.msd-beneficios-content-list-card--sabores--subtitle');
            const descriptionElem = card.querySelector('.msd-beneficios-content-list-card--sabores--description');
            
            const subtitle = subtitleElem ? subtitleElem.textContent.trim() : '';
            const description = descriptionElem ? descriptionElem.textContent.trim() : '';
            
            // Construir zona desde subfiltros
            let zona = '';
            if (subfiltros.zona) {
              if (Array.isArray(subfiltros.zona)) {
                zona = subfiltros.zona.join(', ');
              } else {
                zona = subfiltros.zona;
              }
            }
            
            // Construir día desde subfiltros
            let dia = '';
            if (subfiltros.dia) {
              if (Array.isArray(subfiltros.dia)) {
                dia = subfiltros.dia.join(', ');
              } else {
                dia = subfiltros.dia;
              }
            }
            
            offers.push({
              title: name || tarjeta || 'Beneficio BancoEstado',
              merchant: name || tarjeta,
              discount: oferta,
              subtitle: subtitle,
              description: description,
              category: category,
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
      });

      console.log(`      ✅ ${allOffers.length} ofertas extraídas`);

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
      console.log(`📊 RESUMEN BANCOESTADO V2`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
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
      const jsonFile = path.join(dataDir, `bancoestado_v2_${timestamp}.json`);
      
      fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
      console.log(`\n💾 JSON: ${jsonFile}`);

      // CSV
      if (uniqueOffers.length > 0) {
        const csvFile = path.join(dataDir, `bancoestado_v2_${timestamp}.csv`);
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

      console.log('\n✅ BANCOESTADO V2 COMPLETADO\n');

    } catch (error) {
      console.error('❌ Error en BancoEstado V2:', error.message);
      throw error;
    }
  },
});

await crawler.run([BANCOESTADO_URL]);
console.log('🏁 Proceso finalizado');



