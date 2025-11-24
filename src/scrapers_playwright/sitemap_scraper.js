import { chromium } from 'playwright';
import { getBanksCatalog } from '../banks.js';
import got from 'got';
import fs from 'node:fs';
import path from 'node:path';

const BANKS = getBanksCatalog();

// Función para obtener URLs del sitemap
async function getSitemapUrls(domain) {
  const sitemapUrls = [
    `https://${domain}/sitemap.xml`,
    `https://www.${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://www.${domain}/sitemap_index.xml`,
  ];
  
  for (const sitemapUrl of sitemapUrls) {
    try {
      const response = await got(sitemapUrl, { timeout: { request: 10000 } });
      const xml = response.body;
      
      // Extraer URLs del sitemap
      const urlMatches = xml.matchAll(/<loc>(.*?)<\/loc>/g);
      const urls = Array.from(urlMatches, m => m[1]);
      
      // Filtrar URLs relacionadas con beneficios/descuentos
      const benefitUrls = urls.filter(url => 
        /beneficio|descuento|oferta|promocion|club|ventaja/i.test(url)
      );
      
      if (benefitUrls.length > 0) {
        console.log(`   ✅ Sitemap encontrado: ${benefitUrls.length} URLs relevantes`);
        return benefitUrls;
      }
    } catch (e) {
      // Continuar con el siguiente sitemap
    }
  }
  
  console.log(`   ⚠️  No se encontró sitemap`);
  return [];
}

// Extractor simple
async function extractOffersFromPage(page, bankSlug) {
  return await page.evaluate((slug) => {
    const results = [];
    const selectors = [
      '.card', '.benefit-card', '.discount-card', '.promo-card', '.offer-card',
      '.beneficio', '.descuento', '.oferta', '.promocion',
      '[class*="card"]', '[class*="benefit"]', '[class*="discount"]',
      'article', '.item', '.box', '.tile',
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
    
    elements.forEach(el => {
      const text = (el.innerText || '').trim();
      const discountMatch = text.match(discountRegex);
      if (!discountMatch) return;
      
      const discount = discountMatch[0];
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      const title = lines[0] || text.substring(0, 100);
      
      const merchantRegex = /(McDonald|KFC|Pizza Hut|Starbucks|Subway|Falabella|Ripley|Paris|Lider|Jumbo|Unimarc|Sodimac|Easy|Cinemark|Hoyts)/gi;
      const merchantMatch = text.match(merchantRegex);
      const merchant = merchantMatch ? merchantMatch[0] : '';
      
      results.push({
        bankSlug: slug,
        title: title.substring(0, 150),
        discount,
        merchant,
        terms: text.substring(0, 300),
        url: window.location.href,
        scrapedAt: new Date().toISOString(),
      });
    });
    
    return results;
  }, bankSlug);
}

async function scrapeBankWithSitemap(bank, maxOffers = 10) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🏦 ${bank.name} (SITEMAP)`);
  console.log('═'.repeat(80));
  
  const startTime = Date.now();
  
  // Obtener URLs del sitemap
  const sitemapUrls = await getSitemapUrls(bank.domains[0]);
  
  if (sitemapUrls.length === 0) {
    console.log('   ❌ Sin sitemap, usando URL principal');
    return { bank: bank.name, slug: bank.slug, count: 0, method: 'sitemap', urls: 0 };
  }
  
  // Limitar a las primeras 5 URLs para la prueba
  const urlsToScrape = sitemapUrls.slice(0, 5);
  console.log(`   📄 Scrapeando ${urlsToScrape.length} URLs del sitemap...`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1366, height: 768 },
  });
  
  const allOffers = [];
  
  for (const url of urlsToScrape) {
    try {
      const page = await context.newPage();
      console.log(`   🔗 ${url}`);
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      const offers = await extractOffersFromPage(page, bank.slug);
      if (offers && offers.length > 0) {
        console.log(`      ✅ ${offers.length} ofertas`);
        allOffers.push(...offers);
      }
      
      await page.close();
      
      // Detener si ya tenemos suficientes
      if (allOffers.length >= maxOffers) break;
      
    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
    }
  }
  
  await browser.close();
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  const limited = allOffers.slice(0, maxOffers);
  
  console.log(`\n   📊 Total: ${limited.length} ofertas en ${duration}s`);
  
  if (limited.length > 0) {
    const dataDir = path.join(process.cwd(), 'data', 'sitemap_samples');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    const jsonPath = path.join(dataDir, `${bank.slug}_sitemap.json`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(limited, null, 2), 'utf-8');
    console.log(`   💾 Guardado en: data/sitemap_samples/${bank.slug}_sitemap.json`);
  }
  
  return {
    bank: bank.name,
    slug: bank.slug,
    count: limited.length,
    method: 'sitemap',
    urls: urlsToScrape.length,
    duration,
  };
}

async function main() {
  console.log('\n' + '█'.repeat(80));
  console.log('🗺️  SCRAPING CON SITEMAP - COMPARATIVA');
  console.log('█'.repeat(80));
  console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
  console.log('█'.repeat(80));
  
  // Probar con algunos bancos
  const testBanks = BANKS.slice(0, 5); // Primeros 5 bancos
  const results = [];
  
  for (const bank of testBanks) {
    const result = await scrapeBankWithSitemap(bank, 10);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Resumen
  console.log('\n' + '█'.repeat(80));
  console.log('📊 RESUMEN - MÉTODO SITEMAP');
  console.log('█'.repeat(80) + '\n');
  
  results.forEach((r, idx) => {
    const status = r.count > 0 ? '✅' : '❌';
    console.log(`${status} ${idx + 1}. ${r.bank}: ${r.count} ofertas (${r.urls} URLs, ${r.duration}s)`);
  });
  
  const total = results.reduce((sum, r) => sum + r.count, 0);
  const exitosos = results.filter(r => r.count > 0).length;
  const avgTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`🎯 TOTAL: ${total} ofertas`);
  console.log(`✅ Exitosos: ${exitosos}/${results.length}`);
  console.log(`⏱️  Tiempo promedio: ${Math.round(avgTime)}s por banco`);
  console.log('─'.repeat(80));
  console.log('\n📁 Muestras guardadas en: data/sitemap_samples/');
  console.log('\n' + '█'.repeat(80) + '\n');
}

main().catch(console.error);
