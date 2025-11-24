import playwright from 'playwright';
import { dedupeRecords, createCsvWriterForBank } from '../utils.js';
import path from 'path';
import fs from 'fs';

const BANK = {
  name: 'CMR / Banco Falabella',
  slug: 'falabella-cmr',
  startUrls: ['https://www.bancofalabella.cl/descuentos']
};

async function scrapeFalabellaV2() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 FALABELLA V2 - SCRAPER MEJORADO`);
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
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });
    
    const page = await context.newPage();
    
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    
    console.log('   📄 Cargando página...');
    await page.goto(BANK.startUrls[0], {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    
    await page.waitForTimeout(8000);
    console.log('      ✓ Página cargada');

    // Scroll MUY agresivo y completo
    console.log('   🔄 Scroll agresivo para cargar TODAS las ofertas...');
    
    let lastHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    let scrollCount = 0;
    let stableCount = 0;
    const maxScrolls = 100; // Mucho más scrolls
    
    while (scrollCount < maxScrolls && stableCount < 5) {
      scrollCount++;
      
      // Scroll hacia abajo
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      
      // Scroll un poco arriba para activar lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 500));
      await page.waitForTimeout(2000);
      
      // Scroll de nuevo abajo
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      
      currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight === lastHeight) {
        stableCount++;
        console.log(`      ⚠️  Sin cambios (${stableCount}/5) - Scroll ${scrollCount}`);
      } else {
        stableCount = 0;
        console.log(`      📜 Scroll ${scrollCount} - Nueva altura: ${currentHeight}px`);
      }
      
      lastHeight = currentHeight;
      
      // Cada 10 scrolls, intentar click en "Ver más"
      if (scrollCount % 10 === 0) {
        try {
          const loadMoreSelectors = [
            'button:has-text("Ver más")',
            'button:has-text("Cargar más")',
            'button:has-text("Ver todos")',
            'a:has-text("Ver más")',
            '.btn-load-more',
            '[class*="load-more"]',
            '[class*="ver-mas"]'
          ];
          
          for (const selector of loadMoreSelectors) {
            const buttons = await page.$$(selector);
            for (const btn of buttons) {
              try {
                await btn.scrollIntoViewIfNeeded();
                await page.waitForTimeout(1000);
                await btn.click({ timeout: 2000 });
                await page.waitForTimeout(5000);
                console.log(`      🖱️  Click en botón encontrado`);
                stableCount = 0; // Reset contador
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    }
    
    console.log(`      ✓ Scroll completado después de ${scrollCount} intentos`);

    // Esperar un poco más para que cargue todo
    await page.waitForTimeout(10000);

    // Extraer ofertas con múltiples métodos
    console.log('   🔍 Extrayendo ofertas con múltiples métodos...');
    
    const offers = await page.evaluate(() => {
      const items = [];
      const seen = new Set();
      
      // MÉTODO 1: Buscar TODOS los selectores posibles
      const allSelectors = [
        'div[class*="card"]',
        'div[class*="Card"]',
        'div[class*="benefit"]',
        'div[class*="Benefit"]',
        'div[class*="descuento"]',
        'div[class*="Descuento"]',
        'div[class*="oferta"]',
        'div[class*="Oferta"]',
        'article',
        '[class*="product"]',
        '[class*="Product"]',
        '[class*="item"]',
        '[class*="Item"]'
      ];
      
      let allCards = [];
      for (const selector of allSelectors) {
        try {
          const found = document.querySelectorAll(selector);
          if (found.length > allCards.length) {
            allCards = Array.from(found);
          }
        } catch (e) {}
      }
      
      console.log(`Total elementos encontrados: ${allCards.length}`);
      
      // Procesar cada card
      for (const card of allCards) {
        try {
          const text = (card.innerText || card.textContent || '').trim();
          
          // Filtrar cards muy pequeñas o de navegación
          if (text.length < 20 || text.length > 2000) continue;
          if (/^(Todos|Gastronomía|Viajes|Salud|Categorías|Buscar|Filtrar|Inicio|Productos|Servicios)$/i.test(text)) continue;
          
          // Buscar descuento
          const discountMatch = text.match(/(\d{1,2})\s?%|(\d{1,2})\s?dto|hasta\s+(\d{1,2})\s?%|sin\s+tope/i);
          const discount = discountMatch ? discountMatch[0] : null;
          
          // Buscar merchant
          const merchantMatch = text.match(/(McDonald|KFC|Pizza|Wendy|Dunkin|Papa John|La Barra|China Wok|Bipay)/i);
          const merchant = merchantMatch ? merchantMatch[0] : 'Descuento';
          
          // Buscar días
          const daysMatch = text.match(/(lunes|martes|miércoles|jueves|viernes|sábado|domingo|todos los días)/gi);
          const days = daysMatch ? Array.from(new Set(daysMatch.map(d => d.toLowerCase()))) : [];
          
          // Buscar imagen
          const img = card.querySelector('img');
          const imageUrl = img ? (img.src || img.getAttribute('data-src') || '') : '';
          
          // Buscar link
          const link = card.closest('a') || card.querySelector('a');
          const linkUrl = link ? link.href : '';
          
          // Si tiene descuento o es una card válida
          if (discount || (text.length > 30 && merchant !== 'Descuento')) {
            const key = `${merchant}|${discount || 'sin-descuento'}|${text.substring(0, 50)}`;
            
            if (!seen.has(key)) {
              seen.add(key);
              
              const lines = text.split('\n').filter(l => l.trim().length > 3);
              const title = lines[0] || text.substring(0, 100);
              
              items.push({
                title: title.substring(0, 150),
                merchant: merchant,
                discount: discount || 'Descuento disponible',
                days: days,
                category: '',
                modality: '',
                terms: text.substring(0, 300),
                imageUrl: imageUrl,
                linkUrl: linkUrl,
                url: window.location.href,
                bankSlug: 'falabella-cmr'
              });
            }
          }
        } catch (e) {
          // Ignorar errores
        }
      }
      
      return items;
    });
    
    console.log(`   ✅ Extraídas ${offers.length} ofertas`);
    allOffers.push(...offers);
    
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
    
    const jsonPath = path.join(dataDir, `${BANK.slug}_v2_full.json`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
    
    const csvWriter = await createCsvWriterForBank(`${BANK.slug}_v2`);
    await csvWriter.writeRecords(uniqueOffers);
    
    console.log(`   💾 Guardado en:`);
    console.log(`      - data/full/${BANK.slug}_v2_full.json`);
    console.log(`      - data/descuentos-${BANK.slug}_v2.csv`);
    
    console.log(`   🎯 MUESTRA (primeras 10):`);
    uniqueOffers.slice(0, 10).forEach((offer, i) => {
      console.log(`      ${i + 1}. [${offer.discount}] ${offer.merchant}: ${offer.title.substring(0, 60)}...`);
    });
  }
  
  console.log(`${'═'.repeat(80)}\n`);
  
  return {
    bank: BANK.name,
    slug: BANK.slug,
    count: uniqueOffers.length,
    elapsed,
  };
}

scrapeFalabellaV2()
  .then((result) => {
    console.log(`\n✅ Scraping completado: ${result.count} ofertas en ${result.elapsed}s`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Error fatal: ${error.message}`);
    process.exit(1);
  });
