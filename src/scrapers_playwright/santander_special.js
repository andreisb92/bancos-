import playwright from 'playwright';
import { dedupeRecords, createCsvWriterForBank, writeJsonForBank } from '../utils.js';

const SANTANDER = {
  name: 'Banco Santander',
  slug: 'santander',
  startUrls: ['https://banco.santander.cl/beneficios']
};

async function scrapeSantanderSpecial() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 SCRAPING ESPECIAL - ${SANTANDER.name}`);
  console.log(`🌐 URL: ${SANTANDER.startUrls[0]}`);
  console.log(`${'═'.repeat(80)}`);
  
  const startTime = Date.now();
  const allOffers = [];
  let browser;
  let page;

  try {
    browser = await playwright.chromium.launch({
      headless: false, // Visible para debugging
      slowMo: 50,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
      ],
    });
    
    page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'language', { get: () => 'es-CL' });
    });

    console.log('   📄 Cargando página...');
    await page.goto(SANTANDER.startUrls[0], { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await page.waitForTimeout(5000);

    // Detectar cuántas páginas hay
    console.log('   🔍 Detectando paginación...');
    await page.waitForTimeout(3000);
    
    const paginationInfo = await page.evaluate(() => {
      const paginationButtons = document.querySelectorAll('button[class*="pagination"], a[class*="pagination"], button[class*="page"], a[class*="page"], .pagination button, .pagination a, [class*="Pagination"] button, [class*="Pagination"] a');
      const pageNumbers = [];
      
      for (const btn of paginationButtons) {
        const text = btn.innerText.trim();
        const num = parseInt(text);
        if (!isNaN(num) && num > 0) {
          pageNumbers.push(num);
        }
      }
      
      const maxPage = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
      
      return {
        totalPages: maxPage,
        buttons: paginationButtons.length
      };
    });
    
    console.log(`   📄 Páginas detectadas: ${paginationInfo.totalPages} (${paginationInfo.buttons} botones)`);

    // Iterar por todas las páginas
    for (let currentPage = 1; currentPage <= paginationInfo.totalPages; currentPage++) {
      console.log(`\n   📄 Procesando página ${currentPage}/${paginationInfo.totalPages}...`);
      
      // Scroll para cargar todas las cards de esta página
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);
      }

      // Contar cards en esta página
      const cardCount = await page.evaluate(() => {
        const cards = document.querySelectorAll('[class*="card"], [class*="Card"], [class*="benefit"], [class*="Benefit"], article, .item');
        return cards.length;
      });
      
      console.log(`      📊 Cards en página ${currentPage}: ${cardCount}`);

      // Extraer ofertas de esta página
      console.log(`      🔍 Extrayendo ofertas de página ${currentPage}...`);
    
    const offers = await page.evaluate(() => {
      const results = [];
      
      // Buscar todas las cards de beneficios
      const cards = document.querySelectorAll('[class*="card"], [class*="Card"], [class*="benefit"], [class*="Benefit"], article, .item, [class*="box"]');
      
      for (const card of cards) {
        try {
          const text = (card.innerText || '').trim();
          
          // Filtrar cards de navegación/UI
          if (text.length < 20) continue;
          if (/^(Sabores|Cuotas|Todos|Categorías|Buscar|Filtrar)$/i.test(text)) continue;
          
          // Extraer información de la card
          const titleEl = card.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="Title"], [class*="name"], [class*="Name"]');
          const title = titleEl ? titleEl.innerText.trim() : text.split('\n')[0];
          
          // Buscar descuento
          const discountMatch = text.match(/(\d{1,2})\s?%|(\d{1,2})\s?dcto|(\d{1,2})\s?dto|hasta\s+(\d{1,2})\s?%|desde\s+\$?\s*(\d+)/i);
          const discount = discountMatch ? discountMatch[0] : '';
          
          // Buscar imagen
          const imgEl = card.querySelector('img');
          const imageUrl = imgEl ? (imgEl.src || imgEl.dataset.src || '') : '';
          
          // Buscar link
          const linkEl = card.querySelector('a');
          let offerUrl = linkEl ? linkEl.href : '';
          
          // Si no tiene link directo, buscar atributos de datos
          if (!offerUrl || offerUrl === window.location.href) {
            offerUrl = card.dataset.url || card.dataset.link || card.dataset.href || '';
          }
          
          // Buscar fecha de vigencia
          const dateMatch = text.match(/hasta\s+(?:el\s+)?(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})|vigencia[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})|válido\s+hasta[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
          const validUntil = dateMatch ? dateMatch[0] : '';
          
          // Buscar merchant/comercio
          const merchantMatch = text.match(/(McDonald|KFC|Pizza|Domino|Subway|Starbucks|Cinemark|Hoyts|Falabella|Ripley|Paris|Tottus|Lider|Jumbo|Unimarc|Easy|Sodimac|Lipigas|Copec|Shell|Petrobras|Enex|Farmacias|Cruz Verde|Salcobrand|Ahumada)/gi);
          const merchant = merchantMatch ? merchantMatch[0] : '';
          
          // Buscar ubicación
          const locationMatch = text.match(/(Metropolitana|Valparaíso|Concepción|La Serena|Antofagasta|Iquique|Temuco|Puerto Montt|Viña del Mar|Rancagua|Talca|Arica|Punta Arenas)/gi);
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
            days.push('lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo');
          }
          
          // Solo agregar si tiene título y descuento
          if (title && (discount || text.includes('dcto') || text.includes('dto') || text.includes('%'))) {
            results.push({
              title: title.substring(0, 150),
              merchant: merchant || 'Comercio',
              discount: discount || 'Descuento',
              days: days,
              location: location,
              validUntil: validUntil,
              imageUrl: imageUrl,
              offerUrl: offerUrl || window.location.href,
              terms: text.substring(0, 300),
              bankSlug: 'santander'
            });
          }
        } catch (err) {
          console.error('Error procesando card:', err);
        }
      }
      
      return results;
    });

      console.log(`      ✅ Página ${currentPage}: ${offers.length} ofertas`);
      allOffers.push(...offers);

      // Ir a la siguiente página (si no es la última)
      if (currentPage < paginationInfo.totalPages) {
        console.log(`      ⏭️  Navegando a página ${currentPage + 1}...`);
        
        try {
          // Buscar el botón de la siguiente página
          const nextPageClicked = await page.evaluate((nextPage) => {
            // Buscar botón con el número de la siguiente página
            const buttons = document.querySelectorAll('button, a');
            for (const btn of buttons) {
              const text = btn.innerText.trim();
              if (text === nextPage.toString() || text === `Página ${nextPage}`) {
                btn.click();
                return true;
              }
            }
            
            // Buscar botón "Siguiente" o ">"
            for (const btn of buttons) {
              const text = btn.innerText.trim().toLowerCase();
              if (text === 'siguiente' || text === '>' || text === '›' || text === '»') {
                btn.click();
                return true;
              }
            }
            
            return false;
          }, currentPage + 1);
          
          if (nextPageClicked) {
            await page.waitForTimeout(3000); // Esperar a que cargue la nueva página
          } else {
            console.log(`      ⚠️  No se encontró botón para página ${currentPage + 1}`);
            break;
          }
        } catch (err) {
          console.log(`      ⚠️  Error navegando a página ${currentPage + 1}: ${err.message}`);
          break;
        }
      }
    }

    console.log(`\n   📊 Total de ofertas extraídas: ${allOffers.length}`);

    // Si encontramos pocas ofertas, intentar con selectores más específicos
    if (allOffers.length < 50) {
      console.log('   🔍 Buscando con selectores alternativos...');
      
      const moreOffers = await page.evaluate(() => {
        const results = [];
        const selectors = [
          'div[class*="benefit"]',
          'div[class*="Benefit"]',
          'div[class*="card"]',
          'div[class*="Card"]',
          'article',
          '.box',
          '[data-benefit]',
          '[data-offer]'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = (el.innerText || '').trim();
            if (text.length > 30 && (text.includes('%') || text.includes('dcto') || text.includes('dto'))) {
              const imgEl = el.querySelector('img');
              results.push({
                title: text.split('\n')[0].substring(0, 150),
                merchant: 'Comercio',
                discount: 'Descuento',
                days: [],
                location: '',
                validUntil: '',
                imageUrl: imgEl ? imgEl.src : '',
                offerUrl: window.location.href,
                terms: text.substring(0, 300),
                bankSlug: 'santander'
              });
            }
          }
        }
        
        return results;
      });
      
      console.log(`   ✅ Encontradas ${moreOffers.length} ofertas adicionales`);
      allOffers.push(...moreOffers);
    }

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (page) {
      await page.screenshot({ path: `screenshots/${SANTANDER.slug}_special_error.png` });
    }
  } finally {
    if (browser) {
      console.log('\n   ⏸️  Navegador abierto para inspección. Presiona Ctrl+C para cerrar.');
      await new Promise(() => {}); // Mantener abierto
    }
  }

  const uniqueOffers = dedupeRecords(allOffers);
  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`   📊 Total: ${uniqueOffers.length} ofertas únicas (${allOffers.length} encontradas) en ${duration}s`);

  if (uniqueOffers.length > 0) {
    await writeJsonForBank(`full/${SANTANDER.slug}_full`, uniqueOffers);
    const csvWriter = await createCsvWriterForBank(`full/${SANTANDER.slug}_full`);
    await csvWriter.writeRecords(uniqueOffers.map(offer => ({
      ...offer,
      days: Array.isArray(offer.days) ? offer.days.join(', ') : offer.days || '',
    })));
    
    console.log(`   💾 Guardado en:`);
    console.log(`      - data/full/${SANTANDER.slug}_full.json`);
    console.log(`      - data/descuentos-${SANTANDER.slug}.csv`);
    console.log(`   🎯 MUESTRA (primeras 10):`);
    uniqueOffers.slice(0, 10).forEach((offer, i) => {
      console.log(`      ${i + 1}. [${offer.discount}] ${offer.merchant}: ${offer.title.substring(0, 60)}...`);
      if (offer.imageUrl) console.log(`         🖼️  ${offer.imageUrl.substring(0, 80)}...`);
      if (offer.validUntil) console.log(`         📅 ${offer.validUntil}`);
    });
  }

  console.log(`${'═'.repeat(80)}`);
  console.log(`✅ Scraping completado: ${uniqueOffers.length} ofertas en ${duration}s`);
  console.log(`${'═'.repeat(80)}`);
}

scrapeSantanderSpecial().catch(console.error);
