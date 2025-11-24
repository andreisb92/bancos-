import playwright from 'playwright';
import { dedupeRecords, createCsvWriterForBank, writeJsonForBank } from '../utils.js';

const SANTANDER = {
  name: 'Banco Santander',
  slug: 'santander',
  startUrls: ['https://banco.santander.cl/beneficios']
};

async function scrapeSantanderV2() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 SCRAPING V2 - ${SANTANDER.name}`);
  console.log(`🌐 URL: ${SANTANDER.startUrls[0]}`);
  console.log(`${'═'.repeat(80)}`);
  
  const startTime = Date.now();
  const allOffers = [];
  let browser;
  let page;

  try {
    browser = await playwright.chromium.launch({
      headless: false,
      slowMo: 100,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    
    page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('   📄 Cargando página...');
    await page.goto(SANTANDER.startUrls[0], { 
      waitUntil: 'networkidle', 
      timeout: 90000 
    });
    
    console.log('   ⏳ Esperando 15s para que cargue el contenido dinámico...');
    await page.waitForTimeout(15000);

    // Scroll para activar lazy loading
    console.log('   🔄 Scrolling para activar lazy loading...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(1000);
    }

    // Detectar paginación correctamente
    console.log('   🔍 Detectando paginación...');
    const paginationInfo = await page.evaluate(() => {
      // Buscar el texto "de X" en la paginación
      const paginationText = document.body.innerText;
      const match = paginationText.match(/de\s+(\d+)/i);
      const totalPages = match ? parseInt(match[1]) : 1;
      
      // Buscar botones de página
      const pageLinks = document.querySelectorAll('.page-link, .pagination a, .pagination button, [class*="page"]');
      
      return {
        totalPages: totalPages,
        pageLinksCount: pageLinks.length
      };
    });
    
    console.log(`   📄 Total de páginas: ${paginationInfo.totalPages}`);

    // Iterar por todas las páginas
    for (let currentPage = 1; currentPage <= paginationInfo.totalPages; currentPage++) {
      console.log(`\n   📄 Procesando página ${currentPage}/${paginationInfo.totalPages}...`);
      
      // Esperar a que carguen las cards
      await page.waitForTimeout(5000);
      
      // Scroll para cargar todas las cards
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
      }

      // Extraer ofertas de esta página
      console.log(`      🔍 Extrayendo ofertas...`);
      
      const offers = await page.evaluate(() => {
        const results = [];
        
        // Buscar TODOS los elementos que contengan descuentos
        const allElements = document.querySelectorAll('*');
        const processedTexts = new Set();
        
        for (const el of allElements) {
          const text = (el.innerText || '').trim();
          
          // Filtrar por longitud y contenido
          if (text.length < 20 || text.length > 500) continue;
          if (processedTexts.has(text)) continue;
          
          // Buscar descuentos
          if (text.includes('%') || text.includes('dcto') || text.includes('dto') || text.includes('descuento')) {
            // Verificar que sea una card de beneficio (no un banner)
            if (text.includes('Más información') || text.includes('Ver más') || text.includes('Detalle')) {
              processedTexts.add(text);
              
              // Extraer información
              const lines = text.split('\n').filter(l => l.trim().length > 0);
              const title = lines[0] || text.substring(0, 100);
              
              // Buscar descuento
              const discountMatch = text.match(/(\d{1,2})\s?%|(\d{1,2})\s?dcto|(\d{1,2})\s?dto/i);
              const discount = discountMatch ? discountMatch[0] : 'Descuento';
              
              // Buscar ubicación
              const locationMatch = text.match(/Metropolitana|Valparaíso|Concepción|Tarapacá|Antofagasta|Coquimbo|O'Higgins|Maule|Biobío|Araucanía|Los Ríos|Los Lagos|Aysén|Magallanes/gi);
              const location = locationMatch ? locationMatch[0] : '';
              
              // Buscar días
              const days = [];
              if (/lunes/i.test(text)) days.push('lunes');
              if (/martes/i.test(text)) days.push('martes');
              if (/miércoles|miercoles/i.test(text)) days.push('miércoles');
              if (/jueves/i.test(text)) days.push('jueves');
              if (/viernes/i.test(text)) days.push('viernes');
              if (/sábado|sabado/i.test(text)) days.push('sábado');
              if (/domingo/i.test(text)) days.push('domingo');
              if (/todos\s+los\s+días|todos\s+los\s+dias/i.test(text)) {
                days.length = 0;
                days.push('todos los días');
              }
              
              // Buscar imagen
              let imageUrl = '';
              const imgEl = el.querySelector('img');
              if (imgEl) {
                imageUrl = imgEl.src || imgEl.dataset.src || '';
              } else {
                // Buscar imagen en el padre
                const parent = el.closest('div, article, section');
                if (parent) {
                  const parentImg = parent.querySelector('img');
                  if (parentImg) {
                    imageUrl = parentImg.src || parentImg.dataset.src || '';
                  }
                }
              }
              
              // Buscar link
              let offerUrl = '';
              const linkEl = el.querySelector('a');
              if (linkEl) {
                offerUrl = linkEl.href;
              }
              
              results.push({
                title: title.substring(0, 150),
                merchant: title.split('\n')[0] || 'Comercio',
                discount: discount,
                days: days,
                location: location,
                validUntil: '',
                imageUrl: imageUrl,
                offerUrl: offerUrl || window.location.href,
                terms: text.substring(0, 300),
                bankSlug: 'santander'
              });
            }
          }
        }
        
        return results;
      });

      console.log(`      ✅ Página ${currentPage}: ${offers.length} ofertas`);
      allOffers.push(...offers);

      // Navegar a la siguiente página
      if (currentPage < paginationInfo.totalPages) {
        console.log(`      ⏭️  Navegando a página ${currentPage + 1}...`);
        
        const navigated = await page.evaluate((nextPage) => {
          // Buscar el link/botón de la siguiente página
          const pageLinks = document.querySelectorAll('.page-link, .pagination a, .pagination button');
          
          for (const link of pageLinks) {
            const text = link.innerText.trim();
            if (text === nextPage.toString()) {
              link.click();
              return true;
            }
          }
          
          // Buscar botón "siguiente"
          for (const link of pageLinks) {
            const text = link.innerText.trim().toLowerCase();
            if (text.includes('siguiente') || text === '>' || text === '›') {
              link.click();
              return true;
            }
          }
          
          return false;
        }, currentPage + 1);
        
        if (navigated) {
          await page.waitForTimeout(5000); // Esperar a que cargue
        } else {
          console.log(`      ⚠️  No se pudo navegar a página ${currentPage + 1}`);
          break;
        }
      }
    }

    console.log(`\n   📊 Total: ${allOffers.length} ofertas extraídas`);

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (page) {
      await page.screenshot({ path: `screenshots/${SANTANDER.slug}_v2_error.png` });
    }
  } finally {
    if (browser) {
      console.log('\n   ⏸️  Navegador abierto para inspección. Presiona Ctrl+C para cerrar.');
      await new Promise(() => {});
    }
  }

  const uniqueOffers = dedupeRecords(allOffers);
  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`   📊 Total: ${uniqueOffers.length} ofertas únicas en ${duration}s`);

  if (uniqueOffers.length > 0) {
    await writeJsonForBank(`full/${SANTANDER.slug}_full`, uniqueOffers);
    const csvWriter = await createCsvWriterForBank(`full/${SANTANDER.slug}_full`);
    await csvWriter.writeRecords(uniqueOffers.map(offer => ({
      ...offer,
      days: Array.isArray(offer.days) ? offer.days.join(', ') : offer.days || '',
    })));
    
    console.log(`   💾 Guardado en data/full/${SANTANDER.slug}_full.json/csv`);
    console.log(`   🎯 MUESTRA (primeras 10):`);
    uniqueOffers.slice(0, 10).forEach((offer, i) => {
      console.log(`      ${i + 1}. [${offer.discount}] ${offer.merchant}`);
      if (offer.location) console.log(`         📍 ${offer.location}`);
      if (offer.days.length > 0) console.log(`         📅 ${offer.days.join(', ')}`);
    });
  }

  console.log(`${'═'.repeat(80)}`);
}

scrapeSantanderV2().catch(console.error);
