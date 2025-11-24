import playwright from 'playwright';
import { getBanksCatalog } from '../banks.js';
import { dedupeRecords, createCsvWriterForBank, writeJsonForBank } from '../utils.js';

const BANKS = getBanksCatalog();

async function scrapeBankAggressive(bank) {
  const startTime = Date.now();
  console.log(`\n🏦 [${bank.name}] Iniciando scraping agresivo...`);
  
  let browser;
  let page;
  const allOffers = [];

  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    
    page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log(`   [${bank.name}] 📄 Cargando página...`);
    await page.goto(bank.startUrls[0], { 
      waitUntil: 'networkidle', 
      timeout: 90000 
    });
    
    await page.waitForTimeout(5000);

    // Scroll MASIVO
    console.log(`   [${bank.name}] 🔄 Scrolling masivo (20 scrolls)...`);
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      
      if (i % 5 === 0) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1000);
      }
    }

    // Click en TODOS los botones "Ver más"
    console.log(`   [${bank.name}] 🖱️  Clickeando botones "Ver más"...`);
    let clickCount = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      const clicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a, div[role="button"]');
        let count = 0;
        for (const btn of buttons) {
          const text = (btn.innerText || btn.textContent || '').toLowerCase();
          if (text.includes('ver más') || text.includes('ver mas') || text.includes('cargar más') || 
              text.includes('cargar mas') || text.includes('mostrar más') || text.includes('load more') ||
              text.includes('ver todos') || text.includes('ver todo')) {
            try {
              btn.click();
              count++;
            } catch (e) {}
          }
        }
        return count;
      });
      
      if (clicked > 0) {
        clickCount += clicked;
        console.log(`      🖱️  Click ${attempt + 1}: ${clicked} botones`);
        await page.waitForTimeout(3000);
        
        // Scroll después de cada click
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
      } else {
        break;
      }
    }
    console.log(`      ✅ Total clicks: ${clickCount}`);

    // EXTRACCIÓN AGRESIVA - capturar TODO
    console.log(`   [${bank.name}] 🔍 Extrayendo TODAS las ofertas...`);
    
    const offers = await page.evaluate((bankSlug) => {
      const results = [];
      const seen = new Set();
      
      // Función para normalizar texto
      function normalize(s) {
        return (s || '').replace(/\s+/g, ' ').trim();
      }
      
      // Buscar TODOS los elementos que podrían ser ofertas
      const allElements = document.querySelectorAll('*');
      
      for (const el of allElements) {
        // Ignorar elementos de navegación
        if (el.tagName === 'NAV' || el.tagName === 'HEADER' || el.tagName === 'FOOTER') continue;
        
        const text = normalize(el.innerText || '');
        
        // Filtros básicos
        if (text.length < 15 || text.length > 1000) continue;
        if (seen.has(text)) continue;
        
        // Buscar indicadores de descuento/oferta
        const hasDiscount = /\d{1,2}\s?%|dcto|dto|descuento|discount|oferta|offer|beneficio|benefit|promo|2x1|gratis|free/i.test(text);
        
        if (!hasDiscount) continue;
        
        // Filtrar elementos de navegación/UI
        const isNavigation = /^(inicio|home|productos|servicios|nosotros|contacto|ayuda|login|ingresar|registr|menu|menú|buscar|search|filtrar|filter|ordenar|sort|categorías|categories|todos|all)$/i.test(text);
        if (isNavigation) continue;
        
        seen.add(text);
        
        // Extraer información básica
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        const title = lines[0] || text.substring(0, 150);
        
        // Buscar descuento
        let discount = '';
        const discountMatch = text.match(/(\d{1,2})\s?%/);
        if (discountMatch) {
          discount = discountMatch[0];
        } else if (/dcto|dto|descuento/i.test(text)) {
          const dctoMatch = text.match(/(\d{1,2})\s?(dcto|dto)/i);
          discount = dctoMatch ? dctoMatch[0] : 'Descuento';
        } else if (/2x1/i.test(text)) {
          discount = '2x1';
        } else if (/gratis|free/i.test(text)) {
          discount = 'Gratis';
        } else {
          discount = 'Oferta';
        }
        
        // Buscar merchant (primera línea o palabra clave)
        let merchant = lines[0] || 'Comercio';
        if (merchant.length > 50) {
          merchant = merchant.substring(0, 50);
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
        
        // Buscar imagen
        let imageUrl = '';
        const img = el.querySelector('img');
        if (img) {
          imageUrl = img.src || img.dataset.src || img.getAttribute('data-lazy-src') || '';
        }
        
        // Buscar link
        let offerUrl = '';
        if (el.tagName === 'A') {
          offerUrl = el.href;
        } else {
          const link = el.querySelector('a');
          if (link) offerUrl = link.href;
        }
        
        results.push({
          title: title,
          merchant: merchant,
          discount: discount,
          days: days,
          category: '',
          modality: '',
          imageUrl: imageUrl,
          offerUrl: offerUrl || window.location.href,
          terms: text.substring(0, 500),
          bankSlug: bankSlug
        });
      }
      
      return results;
    }, bank.slug);

    console.log(`   [${bank.name}] ✅ Encontradas ${offers.length} ofertas`);
    allOffers.push(...offers);

  } catch (error) {
    console.error(`   [${bank.name}] ❌ Error: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }

  const uniqueOffers = dedupeRecords(allOffers);
  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`   [${bank.name}] 📊 Total: ${uniqueOffers.length} ofertas únicas en ${duration}s`);

  if (uniqueOffers.length > 0) {
    await writeJsonForBank(`full/${bank.slug}_full`, uniqueOffers);
    const csvWriter = await createCsvWriterForBank(`full/${bank.slug}_full`);
    await csvWriter.writeRecords(uniqueOffers.map(offer => ({
      ...offer,
      days: Array.isArray(offer.days) ? offer.days.join(', ') : offer.days || '',
    })));
  }

  return { 
    bank: bank.name, 
    slug: bank.slug, 
    count: uniqueOffers.length, 
    duration,
    success: uniqueOffers.length > 0 
  };
}

async function scrapeAllBanksAggressive() {
  console.log(`\n${'█'.repeat(80)}`);
  console.log(`🚀 SCRAPING AGRESIVO - TODOS LOS BANCOS`);
  console.log(`${'█'.repeat(80)}`);
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 ${BANKS.length} bancos en paralelo`);
  console.log(`${'█'.repeat(80)}`);

  const results = await Promise.all(
    BANKS.map(bank => scrapeBankAggressive(bank))
  );

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📊 RESUMEN FINAL`);
  console.log(`${'═'.repeat(80)}`);
  
  let totalOffers = 0;
  let successCount = 0;
  
  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    const time = `(${result.duration}s)`;
    console.log(`${icon} ${result.bank.padEnd(30)} ${result.count.toString().padStart(4)} ofertas ${time}`);
    totalOffers += result.count;
    if (result.success) successCount++;
  }
  
  console.log(`${'═'.repeat(80)}`);
  console.log(`🎯 TOTAL: ${totalOffers} ofertas de ${successCount}/${BANKS.length} bancos`);
  console.log(`${'═'.repeat(80)}`);

  // Consolidar resultados
  console.log(`\n📦 Consolidando ${totalOffers} ofertas...`);
  const allOffers = [];
  
  for (const bank of BANKS) {
    try {
      const data = await import(`../../data/full/${bank.slug}_full.json`, { assert: { type: 'json' } });
      allOffers.push(...data.default);
    } catch (e) {
      // Ignorar si no existe
    }
  }
  
  const uniqueAll = dedupeRecords(allOffers);
  console.log(`✅ Consolidado: ${uniqueAll.length} ofertas únicas`);
  
  await writeJsonForBank('descuentos_all', uniqueAll);
  const csvWriter = await createCsvWriterForBank('descuentos_all');
  await csvWriter.writeRecords(uniqueAll.map(offer => ({
    ...offer,
    days: Array.isArray(offer.days) ? offer.days.join(', ') : offer.days || '',
  })));
  
  console.log(`   💾 data/descuentos_all.json`);
  console.log(`   💾 data/descuentos-descuentos_all.csv`);
  
  console.log(`\n${'█'.repeat(80)}`);
  console.log(`✅ SCRAPING COMPLETADO`);
  console.log(`${'█'.repeat(80)}`);
}

scrapeAllBanksAggressive().catch(console.error);


