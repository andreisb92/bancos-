import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';

/**
 * BCI V9 - SCRAPER ULTRA LENTO (HUMANO)
 * Comportamiento completamente humano, sin prisa
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci/todas';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V9 - SCRAPER ULTRA LENTO (COMPORTAMIENTO HUMANO)');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Comportarse como humano real, sin apuro');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

// Proxy
const proxyConfiguration = new ProxyConfiguration({
  proxyUrls: ['http://198.20.189.134:50000']
});

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  launchContext: {
    launchOptions: {
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
    },
  },
  requestHandlerTimeoutSecs: 900, // 15 minutos de timeout
  maxRequestRetries: 1,
  
  async requestHandler({ page, log }) {
    const allOffers = [];

    try {
      // Ocultar automation
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      });

      console.log('   🐌 Navegando LENTAMENTE a la página...');
      
      await page.goto(BCI_URL, { 
        waitUntil: 'load',
        timeout: 180000 
      });
      
      console.log('      ✓ Página cargada');
      console.log('   ⏳ Esperando 30 segundos (como humano leyendo)...');
      await page.waitForTimeout(30000);
      
      // Mover mouse aleatoriamente
      console.log('   🖱️  Moviendo mouse...');
      await page.mouse.move(200, 300);
      await page.waitForTimeout(2000);
      await page.mouse.move(400, 500);
      await page.waitForTimeout(3000);
      
      // Scroll MUY lento
      console.log('   📜 Scrolleando LENTAMENTE (como humano)...');
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(5000); // 5 segundos entre cada scroll
        console.log(`      ... scroll ${i + 1}/10`);
      }
      
      console.log('   ⏳ Esperando otros 20 segundos para que cargue todo...');
      await page.waitForTimeout(20000);
      
      // Mover mouse de nuevo
      await page.mouse.move(600, 400);
      await page.waitForTimeout(3000);

      console.log('   📦 Extrayendo ofertas...');
      const offersOnPage = await page.evaluate(() => {
        const items = [];
        
        // Todos los selectores posibles
        const selectors = [
          'article',
          'div.carrousel_item',
          '.card-benefit-v2',
          'div[class*="card"]',
          'a[class*="card"]',
          '[class*="benefit"]'
        ];
        
        let cards = [];
        for (const selector of selectors) {
          const found = document.querySelectorAll(selector);
          if (found.length > cards.length) {
            cards = found;
          }
        }
        
        console.log(`Total elementos: ${cards.length}`);
        
        for (const card of cards) {
          try {
            const allParagraphs = card.querySelectorAll('p');
            let title = '', discount = '', description = '', days = '';
            
            for (const p of allParagraphs) {
              const cls = p.className || '';
              const txt = p.textContent?.trim() || '';
              
              if ((cls.includes('title') || cls.includes('card__title')) && !title) {
                title = txt;
              } else if ((cls.includes('badge') || cls.includes('offer')) && !discount) {
                discount = txt;
              } else if (cls.includes('bajada') && !description) {
                description = txt;
              } else if (cls.includes('recurrence') && !days) {
                days = txt;
              }
            }

            const img = card.querySelector('img');
            const imageUrl = img ? (img.src || img.getAttribute('data-src') || '') : '';

            const link = card.querySelector('a[href]');
            const linkUrl = link ? link.href : '';

            if (title && title.length > 3) {
              items.push({
                title,
                merchant: title,
                discount: discount || 'Descuento',
                description,
                days,
                terms: description,
                imageUrl,
                linkUrl: linkUrl || window.location.href,
                url: window.location.href,
                category: 'Todos',
                bankSlug: 'bci'
              });
            }
          } catch (err) {}
        }
        
        return items;
      });

      console.log(`      ✅ Extraídas ${offersOnPage.length} ofertas`);
      allOffers.push(...offersOnPage);

      // Deduplicar
      const uniqueOffers = [];
      const seen = new Set();
      
      for (const offer of allOffers) {
        const key = `${offer.title}-${offer.discount}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueOffers.push(offer);
        }
      }

      console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
      console.log(`📊 RESUMEN BCI V9`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log(`════════════════════════════════════════════════════════════════════════════════`);

      // Guardar
      const fs = await import('fs');
      const path = await import('path');
      const { createObjectCsvWriter } = await import('csv-writer');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dataDir = path.join(process.cwd(), 'data', 'bci');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const jsonPath = path.join(dataDir, `bci_v9_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON: ${jsonPath}`);

      const csvPath = path.join(dataDir, `bci_v9_${timestamp}.csv`);
      const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: [
          { id: 'title', title: 'title' },
          { id: 'merchant', title: 'merchant' },
          { id: 'discount', title: 'discount' },
          { id: 'description', title: 'description' },
          { id: 'days', title: 'days' },
          { id: 'category', title: 'category' },
          { id: 'terms', title: 'terms' },
          { id: 'imageUrl', title: 'imageUrl' },
          { id: 'linkUrl', title: 'linkUrl' },
          { id: 'url', title: 'url' },
          { id: 'bankSlug', title: 'bankSlug' },
        ],
      });

      await csvWriter.writeRecords(uniqueOffers);
      console.log(`💾 CSV: ${csvPath}`);

      console.log(`\n✅ COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Fin');













