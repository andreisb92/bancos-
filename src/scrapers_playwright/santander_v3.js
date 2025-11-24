import playwright from 'playwright';
import { dedupeRecords, createCsvWriterForBank, writeJsonForBank } from '../utils.js';

const SANTANDER = {
  name: 'Banco Santander',
  slug: 'santander',
  startUrls: ['https://banco.santander.cl/beneficios']
};

async function scrapeSantanderV3() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 SCRAPING V3 - ${SANTANDER.name}`);
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
      viewport: { width: 1920, height: 1080 }
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('   📄 Cargando página...');
    await page.goto(SANTANDER.startUrls[0], { 
      waitUntil: 'networkidle', 
      timeout: 90000 
    });
    
    console.log('   ⏳ Esperando 20s para que cargue el contenido dinámico...');
    await page.waitForTimeout(20000);

    // Scroll masivo para cargar TODO el contenido
    console.log('   🔄 Scrolling masivo para cargar contenido...');
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(2000);
      
      if (i % 3 === 0) {
        console.log(`      🔄 Scroll ${i + 1}/10`);
      }
    }

    // Hacer click en "Ver todos" o "Cargar más" si existe
    console.log('   🔍 Buscando botones "Ver todos" o "Cargar más"...');
    const clickedButton = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a');
      for (const btn of buttons) {
        const text = btn.innerText.toLowerCase();
        if (text.includes('ver todos') || text.includes('ver más') || text.includes('cargar más') || text.includes('mostrar todos')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    if (clickedButton) {
      console.log('      ✅ Click en botón "Ver todos"');
      await page.waitForTimeout(5000);
    }

    // Analizar estructura de la página
    console.log('   🔍 Analizando estructura de beneficios...');
    const pageAnalysis = await page.evaluate(() => {
      const analysis = {
        totalText: document.body.innerText,
        benefitCards: [],
        allLinks: []
      };
      
      // Buscar todos los links que podrían ser beneficios
      const links = document.querySelectorAll('a[href*="beneficio"], a[href*="descuento"]');
      for (const link of links) {
        analysis.allLinks.push({
          href: link.href,
          text: link.innerText.substring(0, 100)
        });
      }
      
      // Buscar cards con imágenes y texto
      const cards = document.querySelectorAll('div[class*="card"], div[class*="benefit"], article, .hero-highlight');
      for (const card of cards) {
        const text = card.innerText;
        const img = card.querySelector('img');
        
        if (text && (text.includes('%') || text.includes('dcto') || text.includes('descuento'))) {
          analysis.benefitCards.push({
            text: text.substring(0, 200),
            hasImage: !!img,
            imageUrl: img ? (img.src || img.dataset.src || '') : '',
            classes: card.className
          });
        }
      }
      
      return analysis;
    });

    console.log(`   📊 Links encontrados: ${pageAnalysis.allLinks.length}`);
    console.log(`   📊 Cards con descuentos: ${pageAnalysis.benefitCards.length}`);

    // Si encontramos links específicos de beneficios, visitarlos
    if (pageAnalysis.allLinks.length > 0) {
      console.log('   🔗 Visitando links de beneficios...');
      
      for (let i = 0; i < Math.min(pageAnalysis.allLinks.length, 5); i++) {
        const link = pageAnalysis.allLinks[i];
        console.log(`      ${i + 1}. ${link.text.substring(0, 50)}...`);
        console.log(`         URL: ${link.href}`);
      }
    }

    // Extraer ofertas de la página actual
    console.log('   🔍 Extrayendo ofertas...');
    
    const offers = await page.evaluate(() => {
      const results = [];
      const processedTexts = new Set();
      
      // Estrategia 1: Buscar elementos con clases específicas de Santander
      const santanderCards = document.querySelectorAll(
        '.hero-highlight, [class*="benefit"], [class*="card"], [class*="promo"], [class*="offer"]'
      );
      
      for (const card of santanderCards) {
        const text = (card.innerText || '').trim();
        
        // Filtros
        if (text.length < 20 || text.length > 800) continue;
        if (processedTexts.has(text)) continue;
        if (!text.includes('%') && !text.includes('dcto') && !text.includes('descuento')) continue;
        
        processedTexts.add(text);
        
        // Extraer información
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        const title = lines[0] || text.substring(0, 100);
        
        // Buscar descuento
        let discount = '';
        const discountMatch = text.match(/(\d{1,2})\s?%/i);
        if (discountMatch) {
          discount = discountMatch[0];
        } else if (text.includes('dcto') || text.includes('descuento')) {
          const dctoMatch = text.match(/(\d{1,2})\s?(dcto|dto|descuento)/i);
          discount = dctoMatch ? dctoMatch[0] : 'Descuento';
        }
        
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
        
        // Buscar ubicación
        const locationMatch = text.match(/Metropolitana|Valparaíso|Concepción|Tarapacá|Antofagasta|Coquimbo|O'Higgins|Maule|Biobío|Araucanía|Los Ríos|Los Lagos|Aysén|Magallanes/gi);
        const location = locationMatch ? locationMatch[0] : '';
        
        // Buscar imagen
        let imageUrl = '';
        const imgEl = card.querySelector('img');
        if (imgEl) {
          imageUrl = imgEl.src || imgEl.dataset.src || imgEl.getAttribute('data-lazy-src') || '';
        }
        
        // Buscar link
        let offerUrl = '';
        const linkEl = card.querySelector('a');
        if (linkEl) {
          offerUrl = linkEl.href;
        } else if (card.tagName === 'A') {
          offerUrl = card.href;
        }
        
        // Filtrar elementos de navegación
        if (!/^(PERSONAS|EMPRESAS|CIB|PRIVATE|Abre tu cuenta|Ingresar|Beneficios de todas)/i.test(title)) {
          results.push({
            title: title.substring(0, 150),
            merchant: lines[0] || 'Comercio',
            discount: discount || 'Descuento',
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
      
      return results;
    });

    console.log(`   ✅ Ofertas extraídas: ${offers.length}`);
    allOffers.push(...offers);

    // Intentar detectar si hay un listado completo en otra URL
    console.log('   🔍 Buscando URL de listado completo...');
    const listUrl = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = link.innerText.toLowerCase();
        const href = link.href.toLowerCase();
        if (text.includes('ver todos los beneficios') || 
            text.includes('todos los beneficios') ||
            href.includes('/beneficios/todos') ||
            href.includes('/beneficios/listado')) {
          return link.href;
        }
      }
      return null;
    });

    if (listUrl) {
      console.log(`   🔗 Encontrado listado completo: ${listUrl}`);
      console.log('   📄 Navegando al listado completo...');
      
      await page.goto(listUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(10000);
      
      // Scroll en el listado
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
      }
      
      // Extraer del listado
      const listOffers = await page.evaluate(() => {
        const results = [];
        const cards = document.querySelectorAll('div[class*="card"], article, li');
        
        for (const card of cards) {
          const text = card.innerText;
          if (text && text.length > 20 && (text.includes('%') || text.includes('dcto'))) {
            const lines = text.split('\n').filter(l => l.trim().length > 0);
            results.push({
              title: lines[0] || text.substring(0, 100),
              merchant: lines[0] || 'Comercio',
              discount: text.match(/(\d{1,2})\s?%/)?.[0] || 'Descuento',
              terms: text.substring(0, 300),
              bankSlug: 'santander'
            });
          }
        }
        
        return results;
      });
      
      console.log(`   ✅ Ofertas del listado: ${listOffers.length}`);
      allOffers.push(...listOffers);
    }

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (page) {
      await page.screenshot({ path: `screenshots/${SANTANDER.slug}_v3_error.png` });
    }
  } finally {
    const uniqueOffers = dedupeRecords(allOffers);
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`\n   📊 Total: ${uniqueOffers.length} ofertas únicas en ${duration}s`);

    if (uniqueOffers.length > 0) {
      await writeJsonForBank(`full/${SANTANDER.slug}_full`, uniqueOffers);
      const csvWriter = await createCsvWriterForBank(`full/${SANTANDER.slug}_full`);
      await csvWriter.writeRecords(uniqueOffers.map(offer => ({
        ...offer,
        days: Array.isArray(offer.days) ? offer.days.join(', ') : offer.days || '',
      })));
      
      console.log(`   💾 Guardado en data/full/${SANTANDER.slug}_full.json/csv`);
      console.log(`\n   🎯 MUESTRA (primeras 15):`);
      uniqueOffers.slice(0, 15).forEach((offer, i) => {
        console.log(`      ${i + 1}. [${offer.discount}] ${offer.merchant}`);
        if (offer.location) console.log(`         📍 ${offer.location}`);
        if (offer.days && offer.days.length > 0) console.log(`         📅 ${offer.days.join(', ')}`);
        if (offer.imageUrl) console.log(`         🖼️  ${offer.imageUrl.substring(0, 60)}...`);
      });
    }

    if (browser) {
      console.log(`\n${'═'.repeat(80)}`);
      console.log('   ⏸️  Navegador abierto para inspección. Presiona Ctrl+C para cerrar.');
      await new Promise(() => {});
    }
  }
}

scrapeSantanderV3().catch(console.error);

