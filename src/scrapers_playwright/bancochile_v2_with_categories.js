import { PlaywrightCrawler } from 'crawlee';

/**
 * BANCO DE CHILE V2 - SCRAPER CON CATEGORÍAS
 * Basado en los selectores reales encontrados
 */

const BANCO_CHILE_URL = 'https://sitiospublicos.bancochile.cl/personas/beneficios';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCO DE CHILE V2 - SCRAPER CON CATEGORÍAS');
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
      await page.goto(BANCO_CHILE_URL, { 
        waitUntil: 'domcontentloaded',
        timeout: 120000 
      });
      
      await page.waitForTimeout(5000);
      console.log('      ✓ Página cargada');

      // Extraer categorías disponibles usando los selectores reales
      console.log('   📊 Extrayendo categorías...');
      const availableCategories = await page.evaluate(() => {
        const categories = [];
        
        // Buscar enlaces de categorías
        const categoryLinks = document.querySelectorAll('a[href*="/beneficios/"]');
        categoryLinks.forEach(link => {
          const text = link.querySelector('span')?.textContent?.trim();
          if (text && text !== 'Inicio') {
            categories.push({
              name: text,
              url: link.href
            });
          }
        });
        
        return categories;
      });

      console.log(`      ✅ Categorías encontradas: ${availableCategories.map(c => c.name).join(', ')}`);

      // Procesar cada categoría
      for (let i = 0; i < availableCategories.length; i++) {
        const category = availableCategories[i];
        console.log(`\n   📂 Procesando categoría ${i + 1}/${availableCategories.length}: ${category.name}`);
        
        try {
          // Navegar a la página de la categoría
          await page.goto(category.url, { 
            waitUntil: 'networkidle',
            timeout: 60000 
          });
          await page.waitForTimeout(3000);
          
          // Extraer ofertas de esta categoría
          const offersInCategory = await page.evaluate((cat) => {
            const items = [];
            
            // Buscar tarjetas de ofertas (selectores genéricos)
            const cards = document.querySelectorAll('.card, .benefit-card, .discount-card, .promo-card, .offer-card, [class*="card"], [class*="benefit"], [class*="discount"], [class*="offer"]');
            
            for (const card of cards) {
              try {
                // Extraer título/comercio
                const titleSelectors = [
                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                  '.title', '.name', '.merchant', '.comercio',
                  'p.fw-bold', 'p.font-bold', 'p.font-700',
                  '[class*="title"]', '[class*="name"]'
                ];
                
                let title = '';
                for (const selector of titleSelectors) {
                  const elem = card.querySelector(selector);
                  if (elem && elem.textContent.trim()) {
                    title = elem.textContent.trim();
                    break;
                  }
                }

                // Extraer descuento
                const discountSelectors = [
                  '.discount', '.descuento', '.oferta', '.promo',
                  'p.text-primary', 'p.text-red', 'p.text-green',
                  '[class*="discount"]', '[class*="descuento"]'
                ];
                
                let discount = '';
                for (const selector of discountSelectors) {
                  const elem = card.querySelector(selector);
                  if (elem && elem.textContent.trim()) {
                    discount = elem.textContent.trim();
                    break;
                  }
                }

                // Extraer imagen
                let imageUrl = '';
                const imgElem = card.querySelector('img');
                if (imgElem) {
                  imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
                }

                // Extraer términos/descripción
                const terms = card.textContent.trim().substring(0, 300);

                // Extraer enlace
                let linkUrl = '';
                const linkElem = card.querySelector('a[href]');
                if (linkElem) {
                  linkUrl = linkElem.href || '';
                }

                if (title || discount) {
                  items.push({
                    title: title || 'Beneficio Banco de Chile',
                    merchant: title || 'Comercio',
                    discount: discount || 'Descuento',
                    terms: terms,
                    imageUrl: imageUrl,
                    linkUrl: linkUrl || window.location.href,
                    url: window.location.href,
                    category: cat,
                    bankSlug: 'banco-de-chile'
                  });
                }
              } catch (err) {
                console.log(`[Extractor] Error procesando tarjeta:`, err.message);
              }
            }

            return items;
          }, category.name);

          console.log(`      ✅ Extraídas ${offersInCategory.length} ofertas de "${category.name}"`);
          allOffers.push(...offersInCategory);
          
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
      console.log(`📊 RESUMEN BANCO DE CHILE V2 CON CATEGORÍAS`);
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
      const dataDir = path.join(process.cwd(), 'data', 'banco-de-chile');
      
      // Crear directorio si no existe
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Guardar JSON
      const jsonPath = path.join(dataDir, `banco-de-chile_v2_categories_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON guardado: ${jsonPath}`);

      // Guardar CSV
      const csvPath = path.join(dataDir, `banco-de-chile_v2_categories_${timestamp}.csv`);
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
      const jsonlPath = path.join(jsonlDir, 'banco-de-chile.jsonl');
      const jsonlContent = uniqueOffers.map(o => JSON.stringify(o)).join('\n') + '\n';
      fs.writeFileSync(jsonlPath, jsonlContent, 'utf-8');
      console.log(`💾 JSONL guardado: ${jsonlPath}`);

      console.log(`\n✅ SCRAPING BANCO DE CHILE V2 CON CATEGORÍAS COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error en scraping:', error.message);
    }
  },
});

await crawler.run([BANCO_CHILE_URL]);
console.log('🏁 Proceso finalizado');
