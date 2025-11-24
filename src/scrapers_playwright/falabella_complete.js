import playwright from 'playwright';
import { dedupeRecords, createCsvWriterForBank, writeJsonlForBank } from '../utils.js';
import path from 'path';
import fs from 'fs';

const BANK = {
  name: 'CMR / Banco Falabella',
  slug: 'falabella-cmr',
  startUrls: ['https://www.bancofalabella.cl/descuentos']
};

async function scrapeFalabellaComplete() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 SCRAPING COMPLETO - ${BANK.name}`);
  console.log(`🌐 URL: ${BANK.startUrls[0]}`);
  console.log(`${'═'.repeat(80)}`);
  
  const startTime = Date.now();
  const allOffers = [];
  let browser;
  
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      slowMo: 50,
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
      window.chrome = { runtime: {} };
    });
    
    console.log('   📄 Cargando página...');
    await page.goto(BANK.startUrls[0], {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    
    await page.waitForTimeout(10000);
    console.log('      ✓ Página cargada');

    // Scroll MUY agresivo con esperas largas - aumentar para encontrar todas las ofertas
    console.log('   🔄 Scroll agresivo (hasta 100 veces)...');
    
    let lastCount = 0;
    let stableCount = 0;
    const maxStable = 8; // Aumentar estabilidad requerida
    
    for (let i = 0; i < 100; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(6000); // Aumentar espera a 6 segundos
      
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('div.BenefitsCard_card__wo__P, div[class*="BenefitsCard_card"]').length;
      });
      
      if (i % 5 === 0) {
        console.log(`      🔄 Scroll ${i + 1}/100 - Elementos: ${currentCount}`);
      }
      
      if (currentCount === lastCount) {
        stableCount++;
        if (stableCount >= maxStable) {
          console.log(`      ✓ Contenido estable después de ${i + 1} scrolls`);
          break;
        }
      } else {
        stableCount = 0;
        lastCount = currentCount;
      }
      
      // Scroll hacia arriba y abajo cada 3 scrolls para activar lazy loading
      if (i % 3 === 0) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 2000));
        await page.waitForTimeout(4000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(6000);
      }
    }
    
    console.log('   ⏳ Esperando 20 segundos adicionales para carga completa...');
    await page.waitForTimeout(20000);
    
    console.log('   🔍 Buscando botones "Ver más"...');
    for (let i = 0; i < 10; i++) {
      try {
        const button = await page.$('button:has-text("Ver más"), button:has-text("Cargar más"), a:has-text("Ver más")');
        if (button) {
          await button.click();
          await page.waitForTimeout(5000);
          console.log(`      ✓ Click ${i + 1}/10`);
        } else {
          break;
        }
      } catch (e) {
        break;
      }
    }
    
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(10000);
    
    console.log('   📦 Extrayendo TODAS las ofertas...');
    
    const offers = await page.evaluate(() => {
      const items = [];
      
      // Selector EXACTO basado en la estructura HTML real
      const cards = document.querySelectorAll('div.BenefitsCard_card__wo__P, div[class*="BenefitsCard_card"]');
      
      console.log(`Total cards encontradas: ${cards.length}`);
      
      for (const card of cards) {
        try {
          // Título - selector exacto
          const titleElem = card.querySelector('h2.NewCardBenefits_title__fpDao, h2[class*="NewCardBenefits_title"]');
          const title = titleElem ? titleElem.textContent.trim() : '';
          
          if (!title || title.length < 5) continue;
          
          // Descripción
          const descElem = card.querySelector('p.NewCardBenefits_description__R054f, p[class*="NewCardBenefits_description"]');
          const description = descElem ? descElem.textContent.trim() : '';
          
          // Día
          const dayElem = card.querySelector('div.NewCardBenefits_days__XZpWE, div[class*="NewCardBenefits_days"]');
          const day = dayElem ? dayElem.textContent.trim() : '';
          
          // Descuento - selector exacto
          const discountElem = card.querySelector('p.NewCardBenefits_text-uppercase__DRpVQ, p[class*="NewCardBenefits_text-uppercase"]');
          const discount = discountElem ? discountElem.textContent.trim() : '';
          
          // Texto adicional (ej: "Sin Tope")
          const extraElem = card.querySelector('p.NewCardBenefits_text-bottom__Yn598, p[class*="NewCardBenefits_text-bottom"]');
          const extra = extraElem ? extraElem.textContent.trim() : '';
          
          // Combinar descuento con extra (ej: "40% Sin Tope")
          const fullDiscount = discount ? (extra ? `${discount} ${extra}` : discount) : (extra || 'Descuento');
          
          // Imagen principal - obtener de src o srcset
          const imgElem = card.querySelector('img.NewCardBenefits_image__E2fVT, img[class*="NewCardBenefits_image"]');
          let imageUrl = '';
          if (imgElem) {
            imageUrl = imgElem.src || '';
            if (!imageUrl && imgElem.getAttribute('srcset')) {
              const srcset = imgElem.getAttribute('srcset');
              const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
              imageUrl = urls[urls.length - 1] || urls[0] || ''; // Tomar la más grande
            }
          }
          
          // Logo del partner
          const logoElem = card.querySelector('img.NewCardBenefits_logo__ZQn3q, img[class*="NewCardBenefits_logo"]');
          let logoUrl = '';
          if (logoElem) {
            logoUrl = logoElem.src || '';
            if (!logoUrl && logoElem.getAttribute('srcset')) {
              const srcset = logoElem.getAttribute('srcset');
              const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
              logoUrl = urls[urls.length - 1] || urls[0] || '';
            }
          }
          
          // Link (si la card es clickeable)
          const link = card.closest('a') || card.querySelector('a');
          const linkUrl = link ? link.href : '';
          
          // Extraer merchant del título o alt de imagen
          const merchantMatch = title.match(/(McDonald|KFC|Pizza Hut|Domino|Subway|Starbucks|Dunkin|Burger King|Wendy|Papa John|La Barra|China Wok|Tottus|Lider|Jumbo|Falabella|Ripley|Paris|Hites|Easy|Sodimac|Cinemark|Hoyts|JetSMART|Cabify|Uber)/gi);
          const merchant = merchantMatch ? merchantMatch[0] : title.split(' ')[0];
          
          items.push({
            title: title,
            merchant: merchant,
            discount: fullDiscount || discount || 'Descuento',
            description: description,
            days: day ? [day.toLowerCase()] : [],
            terms: `${title}. ${description}. ${day ? `Válido: ${day}` : ''}`,
            imageUrl: imageUrl || logoUrl,
            linkUrl: linkUrl,
            url: window.location.href,
            bankSlug: 'falabella-cmr'
          });
        } catch (e) {
          console.log(`Error procesando card: ${e.message}`);
        }
      }
      
      return items;
    });
    
    console.log(`      ✅ Extraídas ${offers.length} ofertas`);
    allOffers.push(...offers);
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  // Deduplicación mejorada que considera días
  const seen = new Set();
  const uniqueOffers = [];
  for (const offer of allOffers) {
    const daysKey = (offer.days || []).sort().join(',');
    const key = `${offer.bankSlug}|${offer.merchant}|${offer.discount}|${offer.title}|${daysKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueOffers.push(offer);
    }
  }
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  console.log(`   📊 Total: ${uniqueOffers.length} ofertas únicas (${allOffers.length} encontradas) en ${elapsed}s`);
  
  if (uniqueOffers.length > 0) {
    const dataDir = path.join(process.cwd(), 'data', 'full');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    const jsonPath = path.join(dataDir, `${BANK.slug}_complete.json`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
    
    const csvWriter = await createCsvWriterForBank(BANK.slug);
    await csvWriter.writeRecords(uniqueOffers);
    
    // Guardar también en JSONL
    await writeJsonlForBank(BANK.slug, uniqueOffers);
    
    console.log(`   💾 Guardado en:`);
    console.log(`      - data/full/${BANK.slug}_complete.json`);
    console.log(`      - data/descuentos-${BANK.slug}.csv`);
    console.log(`      - data/jsonl/${BANK.slug}.jsonl`);
    
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

scrapeFalabellaComplete()
  .then((result) => {
    console.log(`\n✅ Scraping completado: ${result.count} ofertas en ${result.elapsed}s`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Error fatal: ${error.message}`);
    process.exit(1);
  });

