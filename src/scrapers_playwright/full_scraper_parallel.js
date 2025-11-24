import playwright from 'playwright';
import { extractDiscountCardsFromPage } from '../extractor_final.js';
import { getBanksCatalog } from '../banks.js';
import { dedupeRecords, createCsvWriterForBank, writeJsonForBank } from '../utils.js';
import fs from 'fs';
import path from 'path';

const BANKS = getBanksCatalog();

async function scrapeBankFull(bank) {
  const startTime = Date.now();
  console.log(`\n🏦 [${bank.name}] Iniciando...`);
  
  const isDifficult = ['bancoestado', 'internacional'].includes(bank.slug);
  const allOffers = [];
  let browser;
  let page;

  try {
    browser = await playwright.chromium.launch({
      headless: !isDifficult,
      slowMo: isDifficult ? 50 : 0,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    
    page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-CL,es;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'language', { get: () => 'es-CL' });
      Object.defineProperty(navigator, 'languages', { get: () => ['es-CL', 'es'] });
    });

    await page.setViewportSize({
      width: 1366 + Math.floor(Math.random() * 100),
      height: 768 + Math.floor(Math.random() * 100),
    });

    console.log(`   [${bank.name}] 📄 Cargando página...`);
    await page.goto(bank.startUrls[0], { 
      waitUntil: 'domcontentloaded', 
      timeout: (isDifficult ? 90 : 60) * 1000 
    });
    await page.waitForTimeout(isDifficult ? 5000 : 3000);

    console.log(`   [${bank.name}] 🔄 Scrolling (${isDifficult ? 15 : 10} scrolls)...`);
    const maxScrolls = isDifficult ? 15 : 10;
    
    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(isDifficult ? 3000 : 2000);
      
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1000));
      await page.waitForTimeout(1500);
      
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(isDifficult ? 3000 : 2000);
    }

    console.log(`   [${bank.name}] 🖱️  Buscando botones "Ver más"...`);
    for (let i = 0; i < 3; i++) {
      const loadMoreButtons = await page.$$('button:has-text("Ver más"), button:has-text("Cargar más"), a:has-text("Ver todos"), .btn-load-more');
      if (loadMoreButtons.length === 0) break;
      
      for (const btn of loadMoreButtons) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    console.log(`   [${bank.name}] 🔍 Extrayendo ofertas...`);
    const offers = await extractDiscountCardsFromPage(page, bank.slug);

    if (offers && offers.length > 0) {
      console.log(`   [${bank.name}] ✅ Encontradas ${offers.length} ofertas`);
      allOffers.push(...offers);
    } else {
      console.log(`   [${bank.name}] ⚠️  No se encontraron ofertas`);
      await page.screenshot({ path: `screenshots/${bank.slug}_error.png` });
    }

  } catch (error) {
    console.error(`   [${bank.name}] ❌ Error: ${error.message}`);
    if (page) {
      await page.screenshot({ path: `screenshots/${bank.slug}_error.png` });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const uniqueOffers = dedupeRecords(allOffers);
  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`   [${bank.name}] 📊 Total: ${uniqueOffers.length} ofertas únicas en ${duration}s`);

  if (uniqueOffers.length > 0) {
    await writeJsonForBank(`full/${bank.slug}_full`, uniqueOffers);
    const csvWriter = await createCsvWriterForBank(`full/${bank.slug}_full`);
    await csvWriter.writeRecords(uniqueOffers);
  }

  return { 
    bank: bank.name, 
    slug: bank.slug, 
    count: uniqueOffers.length, 
    duration,
    success: uniqueOffers.length > 0 
  };
}

async function scrapeAllBanksParallel() {
  console.log(`\n${'█'.repeat(80)}`);
  console.log(`🚀 SCRAPING PARALELO - TODOS LOS BANCOS SIMULTÁNEAMENTE`);
  console.log(`${'█'.repeat(80)}`);
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log(`🏦 ${BANKS.length} bancos en paralelo`);
  console.log(`${'█'.repeat(80)}\n`);

  const startTime = Date.now();

  // Ejecutar TODOS los bancos en paralelo
  const results = await Promise.all(
    BANKS.map(bank => scrapeBankFull(bank))
  );

  const totalDuration = Math.round((Date.now() - startTime) / 1000);

  // Consolidar resultados
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📊 RESUMEN FINAL`);
  console.log(`${'═'.repeat(80)}`);

  let totalOffers = 0;
  const allOffers = [];

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.bank.padEnd(30)} ${result.count.toString().padStart(4)} ofertas (${result.duration}s)`);
    totalOffers += result.count;

    // Leer ofertas de cada banco
    if (result.count > 0) {
      try {
        const filePath = path.join(process.cwd(), 'data', 'full', `${result.slug}_full.json`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        allOffers.push(...data);
      } catch (err) {
        console.error(`   ⚠️  Error leyendo ${result.slug}: ${err.message}`);
      }
    }
  }

  console.log(`${'═'.repeat(80)}`);
  console.log(`🎯 TOTAL: ${totalOffers} ofertas de ${results.filter(r => r.success).length}/${BANKS.length} bancos`);
  console.log(`⏱️  Tiempo total: ${totalDuration}s (${Math.round(totalDuration / 60)}m ${totalDuration % 60}s)`);
  console.log(`${'═'.repeat(80)}\n`);

  // Consolidar en archivos finales
  if (allOffers.length > 0) {
    console.log(`📦 Consolidando ${allOffers.length} ofertas...`);
    const uniqueOffers = dedupeRecords(allOffers);
    
    await writeJsonForBank('descuentos_all', uniqueOffers);
    const csvWriter = await createCsvWriterForBank('descuentos_all');
    await csvWriter.writeRecords(uniqueOffers);
    
    console.log(`✅ Consolidado: ${uniqueOffers.length} ofertas únicas`);
    console.log(`   💾 data/descuentos_all.json`);
    console.log(`   💾 data/descuentos-descuentos_all.csv`);
  }

  console.log(`\n${'█'.repeat(80)}`);
  console.log(`✅ SCRAPING COMPLETADO`);
  console.log(`${'█'.repeat(80)}\n`);
}

scrapeAllBanksParallel().catch(console.error);
