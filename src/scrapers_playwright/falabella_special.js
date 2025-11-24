import playwright from 'playwright';
import { extractDiscountCardsFromPage } from '../extractor_final.js';
import { dedupeRecords, createCsvWriterForBank, writeJsonForBank } from '../utils.js';
import path from 'path';
import fs from 'fs';

const BANK = {
  name: 'CMR / Banco Falabella',
  slug: 'falabella-cmr',
  startUrls: ['https://www.bancofalabella.cl/descuentos']
};

async function scrapeFalabellaSpecial() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 SCRAPING ESPECIAL - ${BANK.name}`);
  console.log(`🌐 URL: ${BANK.startUrls[0]}`);
  console.log(`${'═'.repeat(80)}`);
  
  const startTime = Date.now();
  const allOffers = [];
  let browser;
  
  try {
    // Lanzar navegador en modo visible para debugging
    browser = await playwright.chromium.launch({
      headless: false, // Visible para ver qué pasa
      slowMo: 50,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: {
        width: 1366,
        height: 768,
      },
    });
    
    const page = await context.newPage();
    
    // Anti-bot evasion
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'language', { get: () => 'es-CL' });
      Object.defineProperty(navigator, 'languages', { get: () => ['es-CL', 'es'] });
      window.chrome = { runtime: {} };
    });
    
    console.log('   📄 Cargando página...');
    await page.goto(BANK.startUrls[0], {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    
    await page.waitForTimeout(5000);
    
    // ESTRATEGIA ESPECIAL PARA FALABELLA: Scroll lento y completo con activación de lazy loading
    console.log('   🔄 Scroll especial para Falabella (lazy loading agresivo)...');
    
    let lastHeight = await page.evaluate(() => document.body.scrollHeight);
    let scrollAttempts = 0;
    const maxAttempts = 40; // Aumentar a 40 intentos
    let noChangeCount = 0;
    
    while (scrollAttempts < maxAttempts && noChangeCount < 3) {
      scrollAttempts++;
      
      // 1. Scroll hacia abajo
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      console.log(`      🔄 Scroll ${scrollAttempts}/${maxAttempts} - Altura: ${lastHeight}px`);
      await page.waitForTimeout(4000); // Esperar 4 segundos
      
      // 2. Scroll un poco hacia arriba para activar lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1000));
      await page.waitForTimeout(2000);
      
      // 3. Scroll de nuevo hacia abajo
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(4000);
      
      // 4. Verificar si hay más contenido
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (newHeight === lastHeight) {
        noChangeCount++;
        console.log(`      ⚠️  Sin cambios (${noChangeCount}/3)`);
        
        // Intentar scroll hacia arriba y abajo de nuevo
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(3000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(4000);
        
        const finalHeight = await page.evaluate(() => document.body.scrollHeight);
        if (finalHeight === newHeight) {
          console.log(`      ✓ Contenido completo cargado después de ${scrollAttempts} scrolls`);
          break;
        } else {
          lastHeight = finalHeight;
          noChangeCount = 0;
        }
      } else {
        lastHeight = newHeight;
        noChangeCount = 0;
      }
    }
    
    // Intentar click en "Ver más" si existen
    console.log('   🖱️  Buscando botones "Ver más"...');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const loadMoreButtons = await page.$$('button:has-text("Ver más"), button:has-text("Cargar más"), a:has-text("Ver todos"), .btn-load-more');
        if (loadMoreButtons.length === 0) break;
        
        console.log(`      🖱️  Encontrados ${loadMoreButtons.length} botones, clickeando...`);
        for (const btn of loadMoreButtons) {
          try {
            await btn.click({ timeout: 2000 });
            await page.waitForTimeout(3000);
          } catch (e) {
            // Ignorar errores de click
          }
        }
      } catch (e) {
        break;
      }
    }
    
    // Extraer TODAS las ofertas
    console.log('   🔍 Extrayendo TODAS las ofertas...');
    const offers = await extractDiscountCardsFromPage(page, BANK.slug);
    
    if (offers && offers.length > 0) {
      console.log(`   ✅ Encontradas ${offers.length} ofertas`);
      allOffers.push(...offers);
    } else {
      console.log(`   ⚠️  No se encontraron ofertas`);
      await page.screenshot({ path: `screenshots/${BANK.slug}_special_error.png` });
    }
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  const uniqueOffers = dedupeRecords(allOffers);
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  console.log(`   📊 Total: ${uniqueOffers.length} ofertas únicas (${allOffers.length} encontradas) en ${elapsed}s`);
  
  if (uniqueOffers.length > 0) {
    const dataDir = path.join(process.cwd(), 'data', 'full');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    const jsonPath = path.join(dataDir, `${BANK.slug}_full.json`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
    
    const csvWriter = await createCsvWriterForBank(BANK.slug);
    await csvWriter.writeRecords(uniqueOffers);
    
    console.log(`   💾 Guardado en:`);
    console.log(`      - data/full/${BANK.slug}_full.json`);
    console.log(`      - data/descuentos-${BANK.slug}.csv`);
    
    // Mostrar muestra
    console.log(`   🎯 MUESTRA (primeras 10):`);
    uniqueOffers.slice(0, 10).forEach((offer, i) => {
      console.log(`      ${i + 1}. [${offer.discount}] ${offer.merchant || '❓'}: ${offer.title.substring(0, 60)}...`);
    });
  } else {
    console.log(`   ⚠️  NO SE ENCONTRARON OFERTAS - revisar screenshot`);
  }
  
  console.log(`${'═'.repeat(80)}\n`);
  
  return {
    bank: BANK.name,
    slug: BANK.slug,
    count: uniqueOffers.length,
    elapsed,
  };
}

// Ejecutar
scrapeFalabellaSpecial()
  .then((result) => {
    console.log(`\n✅ Scraping completado: ${result.count} ofertas en ${result.elapsed}s`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Error fatal: ${error.message}`);
    process.exit(1);
  });
