import { chromium } from 'playwright';
import { getBanksCatalog } from '../banks.js';
import { writeJsonForBank, createCsvWriterForBank, dedupeRecords } from '../utils.js';
import fs from 'node:fs';
import path from 'node:path';

const BANKS = getBanksCatalog();

// Extractor mejorado
async function extractOffersFromPage(page, bankSlug) {
  return await page.evaluate((slug) => {
    const results = [];
    
    const selectors = [
      '.card', '.benefit-card', '.discount-card', '.promo-card', '.offer-card',
      '.beneficio', '.descuento', '.oferta', '.promocion',
      '[class*="card"]', '[class*="benefit"]', '[class*="discount"]', '[class*="offer"]',
      'article', '.item', '.box', '.tile', '.producto', '.deal',
      '[class*="Item"]', '[class*="Card"]', '[class*="Benefit"]',
    ];
    
    const elements = new Set();
    
    for (const selector of selectors) {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(el => {
          const text = el.innerText || '';
          if (text.length > 20 && text.length < 2000) {
            elements.add(el);
          }
        });
      } catch (e) {}
    }
    
    const discountRegex = /(\d{1,2})\s?%|2x1|\$\s?(\d+)\s?(dto|dcto|desc|off)/gi;
    const merchantRegex = /(McDonald|KFC|Pizza Hut|Starbucks|Subway|Falabella|Ripley|Paris|Lider|Jumbo|Unimarc|Sodimac|Easy|Cinemark|Hoyts|Uber|Cabify|Tottus|Santa Isabel|Copec|Shell|Petrobras|Lipigas|Abcdin|La Polar|Hites|Johnson|Doggis|Juan Maestro|Papa John|Domino|Dunkin|Burger King|Wendy|Taco Bell|Cine|Hotel|Restaurante|Café|Bar|Gym|Spa|Clínica|Farmacia|Dental)/gi;
    
    elements.forEach(el => {
      const text = (el.innerText || '').trim();
      
      const discountMatch = text.match(discountRegex);
      if (!discountMatch) return;
      
      const discount = discountMatch[0];
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      const title = lines[0] || text.substring(0, 100);
      
      const merchantMatch = text.match(merchantRegex);
      const merchant = merchantMatch ? merchantMatch[0] : '';
      
      const dayRegex = /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/gi;
      const daysMatch = text.match(dayRegex) || [];
      const days = [...new Set(daysMatch.map(d => d.toLowerCase()))];
      
      let category = '';
      if (/restaurant|gastronomía|comida|café|bar/i.test(text)) category = 'Gastronomía';
      else if (/cine|entretenimiento|juego/i.test(text)) category = 'Entretención';
      else if (/viaje|hotel|turismo|vuelo/i.test(text)) category = 'Viajes';
      else if (/super|mercado/i.test(text)) category = 'Supermercados';
      else if (/farmacia|salud|dental|clínica/i.test(text)) category = 'Salud';
      else if (/tienda|ropa|moda|shopping/i.test(text)) category = 'Shopping';
      
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

async function scrapeBankFull(bank) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 ${bank.name}`);
  console.log(`🌐 ${bank.startUrls[0]}`);
  console.log('═'.repeat(80));
  
  const startTime = Date.now();
  
  // Configuración especial para bancos difíciles
  const isDifficult = ['bancoestado', 'internacional'].includes(bank.slug);
  
  const browser = await chromium.launch({
    headless: !isDifficult, // Visible para bancos difíciles
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
    console.log('   📄 Cargando página...');
    await page.goto(bank.startUrls[0], {
      waitUntil: 'domcontentloaded',
      timeout: isDifficult ? 90000 : 60000,
    });
    
    // Esperar más para bancos difíciles
    await page.waitForTimeout(isDifficult ? 5000 : 3000);
    
    // Scroll progresivo más agresivo para cargar contenido dinámico
    console.log('   🔄 Scrolling agresivo para cargar contenido dinámico...');
    const maxScrolls = isDifficult ? 15 : 10;
    
    for (let i = 0; i < maxScrolls; i++) {
      // Scroll hacia abajo
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(isDifficult ? 3000 : 2000);
      
      // Scroll hacia arriba un poco para activar lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1000));
      await page.waitForTimeout(1500);
      
      // Scroll hacia abajo de nuevo
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(isDifficult ? 3000 : 2000);
      
      if (i % 3 === 0) {
        console.log(`      🔄 Scroll ${i + 1}/${maxScrolls}`);
      }
    }
    
    console.log(`      ✓ Scrolling completado (${maxScrolls} scrolls)`);
    
    // Intentar click en "Ver más" múltiples veces
    console.log('   🖱️  Buscando botones "Ver más"...');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const buttons = await page.$$('button:has-text("Ver más"), button:has-text("Cargar más"), button:has-text("Ver todos"), a:has-text("Ver más"), a:has-text("Cargar más"), button[class*="load"], button[class*="more"]');
        if (buttons.length > 0) {
          console.log(`      🖱️  Click en botón ${attempt + 1}...`);
          await buttons[0].click();
          await page.waitForTimeout(3000);
          
          // Scroll después de cargar más
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(2000);
        } else {
          break;
        }
      } catch (e) {
        break;
      }
    }
    
    // Scroll final
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    
    // Extraer ofertas
    console.log('   🔍 Extrayendo TODAS las ofertas...');
    const offers = await extractOffersFromPage(page, bank.slug);
    
    if (offers && offers.length > 0) {
      allOffers.push(...offers);
      console.log(`   ✅ Encontradas ${offers.length} ofertas`);
    } else {
      console.log('   ⚠️  No se encontraron ofertas');
      
      // Screenshot para debugging
      const screenshotDir = path.join(process.cwd(), 'screenshots');
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
      
      const screenshotPath = path.join(screenshotDir, `${bank.slug}_full_error.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`   📸 Screenshot: screenshots/${bank.slug}_full_error.png`);
    }
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  } finally {
    await browser.close();
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  const uniqueOffers = dedupeRecords(allOffers);
  
  console.log(`\n   📊 Total: ${uniqueOffers.length} ofertas únicas (${allOffers.length} encontradas) en ${duration}s`);
  
  if (uniqueOffers.length > 0) {
    const dataDir = path.join(process.cwd(), 'data', 'full');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    const jsonPath = path.join(dataDir, `${bank.slug}_full.json`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
    
    const csvWriter = await createCsvWriterForBank(bank.slug);
    await csvWriter.writeRecords(uniqueOffers);
    
    console.log(`   💾 Guardado en:`);
    console.log(`      - data/full/${bank.slug}_full.json`);
    console.log(`      - data/descuentos-${bank.slug}.csv`);
    
    // Mostrar muestra
    console.log(`\n   🎯 MUESTRA (primeras 5):`);
    uniqueOffers.slice(0, 5).forEach((o, i) => {
      console.log(`      ${i+1}. [${o.discount}] ${o.merchant || '❓'}: ${o.title?.substring(0, 60)}...`);
    });
  }
  
  return {
    bank: bank.name,
    slug: bank.slug,
    count: uniqueOffers.length,
    duration,
  };
}

async function main() {
  console.log('\n' + '█'.repeat(80));
  console.log('🚀 SCRAPING COMPLETO - TODAS LAS OFERTAS DE TODOS LOS BANCOS');
  console.log('█'.repeat(80));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 ${BANKS.length} bancos`);
  console.log('█'.repeat(80));
  
  const results = [];
  
  for (const bank of BANKS) {
    const result = await scrapeBankFull(bank);
    results.push(result);
    
    console.log('\n⏳ Esperando 3 segundos...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Resumen final
  console.log('\n' + '█'.repeat(80));
  console.log('📊 RESUMEN FINAL - TODAS LAS OFERTAS');
  console.log('█'.repeat(80) + '\n');
  
  results.sort((a, b) => b.count - a.count);
  
  results.forEach((r, idx) => {
    const status = r.count > 0 ? '✅' : '❌';
    console.log(`${status} ${idx + 1}. ${r.bank}: ${r.count} ofertas (${r.duration}s)`);
  });
  
  const total = results.reduce((sum, r) => sum + r.count, 0);
  const exitosos = results.filter(r => r.count > 0).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`🎯 TOTAL: ${total} ofertas`);
  console.log(`✅ Exitosos: ${exitosos}/${BANKS.length} (${Math.round(exitosos/BANKS.length*100)}%)`);
  console.log(`⏱️  Tiempo total: ${Math.round(totalTime / 60)} minutos`);
  console.log('─'.repeat(80));
  
  // Consolidar
  console.log('\n💾 Consolidando resultados...');
  const { execa } = await import('execa');
  try {
    await execa('node', ['src/consolidate.js'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log('✅ Consolidación completa\n');
  } catch (error) {
    console.error('❌ Error en consolidación:', error.message);
  }
  
  console.log('📁 Archivos generados:');
  console.log('   - data/descuentos_all.json (consolidado)');
  console.log('   - data/descuentos_all.csv (consolidado)');
  console.log('   - data/full/[banco]_full.json (individuales completos)');
  console.log('   - data/descuentos-[banco].csv (individuales CSV)');
  console.log('\n' + '█'.repeat(80) + '\n');
}

main().catch(console.error);
