import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

/**
 * BCI V11 - SCRAPER STEALTH Y ULTRA LENTO
 * Usa playwright-extra con stealth y comportamiento humano
 */

// Usar el plugin Stealth
chromium.use(StealthPlugin());

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci/todas';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V11 - STEALTH + ULTRA LENTO');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Evitar Cloudflare con comportamiento humano');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

// Proxy
const proxyConfiguration = new ProxyConfiguration({
  proxyUrls: ['http://198.20.189.134:50000']
});

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  launchContext: {
    launcher: chromium,
    launchOptions: {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ],
    },
  },
  requestHandlerTimeoutSecs: 900, // 15 minutos
  maxRequestRetries: 1,
  
  async requestHandler({ page, log, proxyInfo }) {
    try {
      console.log(`   🌐 Usando proxy: ${proxyInfo?.url || 'Ninguno'}`);
      console.log('   📄 Navegando muy lentamente a la página...');
      
      await page.goto(BCI_URL, { 
        waitUntil: 'networkidle',
        timeout: 180000 
      });
      
      console.log('      ✓ Página cargada.');
      console.log('   ⏳ ESPERANDO 30 SEGUNDOS (Simulando lectura)...');
      await page.waitForTimeout(30000);
      
      const isBlocked = await page.evaluate(() => document.body.textContent?.includes('bloqueado por nuestra política de seguridad'));
      if (isBlocked) {
          log.error('❌ BLOQUEADO POR CLOUDFLARE. Abortando.');
          return;
      }

      console.log('   🖱️  Moviendo el mouse para simular interacción...');
      await page.mouse.move(Math.random() * 500 + 100, Math.random() * 500 + 100);
      await page.waitForTimeout(5000);
      
      console.log('   📜 Haciendo scroll MUY LENTO...');
      for (let i = 1; i <= 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(7000); // 7 segundos entre scrolls
        console.log(`      ... scroll ${i}/5`);
      }
      
      console.log('   ⏳ Esperando 20 segundos más...');
      await page.waitForTimeout(20000);

      console.log('   📦 Extrayendo ofertas...');
      const offers = await page.evaluate(() => {
        const items = [];
        const cards = document.querySelectorAll('article, div[class*="card"]');
        
        for (const card of cards) {
          try {
            const title = card.querySelector('p.card__title, .card__title')?.textContent.trim();
            if (!title || title.length < 4) continue;

            const discount = card.querySelector('p.badge-offer, .badge-offer')?.textContent.trim();
            const description = card.querySelector('p.card__bajada, .card__bajada')?.textContent.trim();
            const days = card.querySelector('p.card__recurrence, .card__recurrence')?.textContent.trim();
            const img = card.querySelector('img');
            const imageUrl = img ? img.src : '';
            const link = card.querySelector('a');
            const linkUrl = link ? link.href : '';

            items.push({
              title,
              merchant: title,
              discount: discount || 'Descuento',
              description: description || '',
              days: days || '',
              terms: description || '',
              imageUrl,
              linkUrl,
              url: window.location.href,
              category: 'Todos',
              bankSlug: 'bci'
            });
          } catch (e) {}
        }
        return items;
      });

      console.log(`      ✅ Extraídas ${offers.length} ofertas`);

      // Deduplicar
      const uniqueOffers = [...new Map(offers.map(o => [`${o.title}|${o.discount}`, o])).values()];

      console.log('\n════════════════════════════════════════════════════════════════════════════════');
      console.log(`📊 RESUMEN BCI V11`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log('════════════════════════════════════════════════════════════════════════════════\n');

      // Guardar
      if (uniqueOffers.length > 0) {
        const fs = await import('fs');
        const path = await import('path');
        const { createObjectCsvWriter } = await import('csv-writer');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dataDir = path.join(process.cwd(), 'data', 'bci');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const jsonFile = path.join(dataDir, `bci_v11_${timestamp}.json`);
        fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
        console.log(`💾 JSON guardado en: ${jsonFile}`);
        
        const csvFile = path.join(dataDir, `bci_v11_${timestamp}.csv`);
        const csvWriter = createObjectCsvWriter({
          path: csvFile,
          header: [
            { id: 'title', title: 'Título' },
            { id: 'discount', title: 'Descuento' },
            { id: 'description', title: 'Descripción' },
            { id: 'days', title: 'Días' },
            { id: 'imageUrl', title: 'Imagen' },
            { id: 'linkUrl', title: 'Link' },
          ]
        });
        await csvWriter.writeRecords(uniqueOffers);
        console.log(`💾 CSV guardado en: ${csvFile}`);
      }
      
      console.log('\n✅ SCRAPING COMPLETADO\n');

    } catch (error) {
      log.error(`❌ Error en BCI V11: ${error.message}`);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');













