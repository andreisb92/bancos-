import playwright from 'playwright';
import { extractDiscountCardsFromPage } from '../extractor_final.js';
import { dedupeRecords, createCsvWriterForBank } from '../utils.js';
import path from 'path';
import fs from 'fs';

const BANK = {
  name: 'CMR / Banco Falabella',
  slug: 'falabella-cmr',
  startUrls: ['https://www.bancofalabella.cl/descuentos']
};

async function scrapeFalabellaAggressive() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 SCRAPING AGRESIVO - ${BANK.name}`);
  console.log(`🌐 URL: ${BANK.startUrls[0]}`);
  console.log(`${'═'.repeat(80)}`);
  
  const startTime = Date.now();
  const allOffers = [];
  let browser;
  
  try {
    browser = await playwright.chromium.launch({
      headless: false,
      slowMo: 100,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
      ],
    });
    
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'language', { get: () => 'es-CL' });
      window.chrome = { runtime: {} };
    });
    
    console.log('   📄 Cargando página...');
    await page.goto(BANK.startUrls[0], {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    
    // Esperar 10 segundos para que cargue el contenido inicial
    console.log('   ⏳ Esperando 10s para carga inicial...');
    await page.waitForTimeout(10000);
    
    // Contar elementos ANTES del scroll
    const beforeScroll = await page.evaluate(() => {
      return {
        benefitCards: document.querySelectorAll('div[class*="NewCardBenefits_container"]').length,
        benefitsCard: document.querySelectorAll('div[class*="BenefitsCard_card"]').length,
        carouselCards: document.querySelectorAll('div[class*="SectionBenefitsCarousel_product-card"]').length,
      };
    });
    
    console.log(`   📊 ANTES del scroll:`);
    console.log(`      - NewCardBenefits_container: ${beforeScroll.benefitCards}`);
    console.log(`      - BenefitsCard_card: ${beforeScroll.benefitsCard}`);
    console.log(`      - SectionBenefitsCarousel_product-card: ${beforeScroll.carouselCards}`);
    
    // Scroll SUPER agresivo con esperas largas
    console.log('   🔄 Scroll agresivo con esperas largas...');
    
    for (let i = 0; i < 10; i++) {
      // Scroll hacia abajo
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000); // 3 segundos
      
      // Scroll hacia arriba un poco
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1500));
      await page.waitForTimeout(2000);
      
      // Scroll hacia abajo de nuevo
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      
      // Contar elementos cada 3 scrolls
      if (i % 3 === 0) {
        const count = await page.evaluate(() => {
          return document.querySelectorAll('div[class*="NewCardBenefits_container"], div[class*="BenefitsCard_card"]').length;
        });
        console.log(`      🔄 Scroll ${i + 1}/10 - Elementos encontrados: ${count}`);
      }
    }
    
    // Contar elementos DESPUÉS del scroll
    const afterScroll = await page.evaluate(() => {
      return {
        benefitCards: document.querySelectorAll('div[class*="NewCardBenefits_container"]').length,
        benefitsCard: document.querySelectorAll('div[class*="BenefitsCard_card"]').length,
        carouselCards: document.querySelectorAll('div[class*="SectionBenefitsCarousel_product-card"]').length,
        allBenefits: document.querySelectorAll('div[class*="Benefit"]').length,
      };
    });
    
    console.log(`   📊 DESPUÉS del scroll:`);
    console.log(`      - NewCardBenefits_container: ${afterScroll.benefitCards}`);
    console.log(`      - BenefitsCard_card: ${afterScroll.benefitsCard}`);
    console.log(`      - SectionBenefitsCarousel_product-card: ${afterScroll.carouselCards}`);
    console.log(`      - Todos los elementos con "Benefit": ${afterScroll.allBenefits}`);
    
    // Extraer ofertas
    console.log('   🔍 Extrayendo ofertas...');
    const offers = await extractDiscountCardsFromPage(page, BANK.slug);
    
    if (offers && offers.length > 0) {
      console.log(`   ✅ Encontradas ${offers.length} ofertas`);
      allOffers.push(...offers);
    } else {
      console.log(`   ⚠️  No se encontraron ofertas`);
      await page.screenshot({ path: `screenshots/${BANK.slug}_aggressive_error.png` });
    }
    
    // Extraer manualmente también
    console.log('   🔍 Extracción manual adicional...');
    const manualOffers = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('div[class*="NewCardBenefits_container"], div[class*="BenefitsCard_card"]');
      
      for (const card of cards) {
        const text = (card.innerText || '').trim();
        if (text.length > 20) {
          results.push({
            text: text.substring(0, 200),
            length: text.length,
          });
        }
      }
      
      return results;
    });
    
    console.log(`   📝 Extracción manual encontró ${manualOffers.length} cards con texto`);
    if (manualOffers.length > 0) {
      console.log(`   📋 Primeras 5 cards:`);
      manualOffers.slice(0, 5).forEach((card, i) => {
        console.log(`      ${i + 1}. [${card.length} chars] ${card.text}...`);
      });
    }
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  } finally {
    if (browser) {
      console.log('\n   ⏸️  Navegador abierto para inspección. Presiona Ctrl+C para cerrar.');
      await new Promise(() => {}); // Mantener abierto
    }
  }
}

scrapeFalabellaAggressive().catch(console.error);
