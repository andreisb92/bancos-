import { chromium } from 'playwright';
import { getBanksCatalog } from '../banks.js';
import { writeJsonForBank, createCsvWriterForBank } from '../utils.js';
import fs from 'node:fs';
import path from 'node:path';

const BANKS = getBanksCatalog();

// Extractor simple pero efectivo
async function extractOffersFromPage(page, bankSlug) {
  return await page.evaluate((slug) => {
    const results = [];
    
    // Selectores comunes para cards/elementos de descuentos
    const selectors = [
      '.card', '.benefit-card', '.discount-card', '.promo-card', '.offer-card',
      '.beneficio', '.descuento', '.oferta', '.promocion',
      '[class*="card"]', '[class*="benefit"]', '[class*="discount"]', '[class*="offer"]',
      'article', '.item', '.box', '.tile',
    ];
    
    const elements = new Set();
    
    for (const selector of selectors) {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(el => {
          // Solo elementos con suficiente contenido
          const text = el.innerText || '';
          if (text.length > 20 && text.length < 2000) {
            elements.add(el);
          }
        });
      } catch (e) {}
    }
    
    // Regex para detectar descuentos
    const discountRegex = /(\d{1,2})\s?%|2x1|\$\s?(\d+)\s?(dto|dcto|desc|off)/gi;
    
    elements.forEach(el => {
      const text = (el.innerText || '').trim();
      
      // Buscar descuento
      const discountMatch = text.match(discountRegex);
      if (!discountMatch) return;
      
      const discount = discountMatch[0];
      
      // Extraer título (primera línea o texto más relevante)
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      const title = lines[0] || text.substring(0, 100);
      
      // Buscar merchant/comercio
      const merchantRegex = /(McDonald|KFC|Pizza Hut|Starbucks|Subway|Falabella|Ripley|Paris|Lider|Jumbo|Unimarc|Sodimac|Easy|Cinemark|Hoyts|Uber|Cabify|Farmacias Ahumada|Lipigas)/gi;
      const merchantMatch = text.match(merchantRegex);
      const merchant = merchantMatch ? merchantMatch[0] : '';
      
      // Extraer días
      const dayRegex = /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/gi;
      const daysMatch = text.match(dayRegex) || [];
      const days = [...new Set(daysMatch.map(d => d.toLowerCase()))];
      
      // Categoría simple
      let category = '';
      if (/restaurant|gastronomía|comida|café/i.test(text)) category = 'Gastronomía';
      else if (/cine|entretenimiento/i.test(text)) category = 'Entretención';
      else if (/viaje|hotel|turismo/i.test(text)) category = 'Viajes';
      else if (/super|mercado/i.test(text)) category = 'Supermercados';
      else if (/farmacia|salud/i.test(text)) category = 'Salud';
      
      results.push({
        bankSlug: slug,
        title: title.substring(0, 150),
        discount,
        merchant,
        days,
        category,
        terms: text.substring(0, 300),
        url: window.location.href,
        scrapedAt: new Date().toISOString(),
      });
    });
    
    return results;
  }, bankSlug);
}

async function scrapeBank(bank, maxOffers = 10) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 ${bank.name}`);
  console.log(`🌐 ${bank.startUrls[0]}`);
  console.log('═'.repeat(80));
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-CL',
  });
  
  const page = await context.newPage();
  const allOffers = [];
  
  try {
    // Navegar a la página
    console.log('   📄 Cargando página...');
    await page.goto(bank.startUrls[0], {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    
    await page.waitForTimeout(3000);
    
    // Scroll para cargar contenido dinámico
    console.log('   🔄 Scrolling...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    
    // Intentar click en "Ver más"
    try {
      const buttons = await page.$$('button:has-text("Ver más"), button:has-text("Cargar más"), a:has-text("Ver todos")');
      if (buttons.length > 0) {
        console.log(`   🖱️  Clickeando "Ver más"...`);
        await buttons[0].click();
        await page.waitForTimeout(3000);
      }
    } catch (e) {}
    
    // Extraer ofertas
    console.log('   🔍 Extrayendo ofertas...');
    const offers = await extractOffersFromPage(page, bank.slug);
    
    if (offers && offers.length > 0) {
      // Limitar a maxOffers
      const limited = offers.slice(0, maxOffers);
      allOffers.push(...limited);
      
      console.log(`\n   ✅ Encontradas ${offers.length} ofertas (mostrando ${limited.length}):\n`);
      
      limited.forEach((offer, idx) => {
        console.log(`   ${idx + 1}. [${offer.discount}] ${offer.merchant || '❓'}: ${offer.title}`);
        if (offer.category) console.log(`      📁 ${offer.category}`);
        if (offer.days.length > 0) console.log(`      📅 ${offer.days.join(', ')}`);
        console.log('');
      });
      
      // Guardar
      const dataDir = path.join(process.cwd(), 'data', 'samples');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      
      const jsonPath = path.join(dataDir, `${bank.slug}_sample.json`);
      await fs.promises.writeFile(jsonPath, JSON.stringify(limited, null, 2), 'utf-8');
      console.log(`   💾 Guardado en: data/samples/${bank.slug}_sample.json`);
      
    } else {
      console.log('   ⚠️  No se encontraron ofertas');
      
      // Captura de pantalla para debugging
      const screenshotDir = path.join(process.cwd(), 'screenshots');
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
      
      const screenshotPath = path.join(screenshotDir, `${bank.slug}_error.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`   📸 Screenshot guardado en: screenshots/${bank.slug}_error.png`);
    }
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  } finally {
    await browser.close();
  }
  
  return {
    bank: bank.name,
    slug: bank.slug,
    count: allOffers.length,
    offers: allOffers,
  };
}

async function main() {
  console.log('\n' + '█'.repeat(80));
  console.log('🎯 SCRAPING MUESTRA - 10 OFERTAS POR BANCO');
  console.log('█'.repeat(80));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 ${BANKS.length} bancos`);
  console.log('█'.repeat(80));
  
  const results = [];
  
  for (const bank of BANKS) {
    const result = await scrapeBank(bank, 10);
    results.push(result);
    
    // Pausa entre bancos
    console.log('\n⏳ Esperando 3 segundos...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Resumen final
  console.log('\n' + '█'.repeat(80));
  console.log('📊 RESUMEN FINAL');
  console.log('█'.repeat(80) + '\n');
  
  results.forEach((r, idx) => {
    const status = r.count > 0 ? '✅' : '❌';
    console.log(`${status} ${idx + 1}. ${r.bank}: ${r.count} ofertas`);
  });
  
  const total = results.reduce((sum, r) => sum + r.count, 0);
  const exitosos = results.filter(r => r.count > 0).length;
  
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`🎯 TOTAL: ${total} ofertas`);
  console.log(`✅ Exitosos: ${exitosos}/${BANKS.length} (${Math.round(exitosos/BANKS.length*100)}%)`);
  console.log('─'.repeat(80));
  console.log('\n📁 Muestras guardadas en: data/samples/');
  console.log('📸 Screenshots en: screenshots/');
  console.log('\n' + '█'.repeat(80) + '\n');
}

main().catch(console.error);

