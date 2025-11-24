import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';

/**
 * BCI V8 - SCRAPER CON PROXY ROTATIVO
 * Usa el proxy que proporcionaste para evitar bloqueos
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci/todas';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V8 - SCRAPER CON PROXY ROTATIVO');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas usando proxy para evitar bloqueos');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

// Configurar proxy
const proxyConfiguration = new ProxyConfiguration({
  proxyUrls: [
    'http://198.20.189.134:50000',
    'socks5://198.20.189.134:50001'
  ]
});

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  launchContext: {
    launchOptions: {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    },
  },
  requestHandlerTimeoutSecs: 600,
  maxRequestRetries: 2,
  
  async requestHandler({ page, log, proxyInfo }) {
    const allOffers = [];

    try {
      console.log(`   🌐 Usando proxy: ${proxyInfo?.url || 'Ninguno'}`);
      
      console.log('   📄 Cargando página con proxy...');
      await page.goto(BCI_URL, { 
        waitUntil: 'networkidle',
        timeout: 120000 
      });
      
      console.log('      ✓ Página cargada');
      
      // Esperar a que cargue el contenido
      await page.waitForTimeout(20000);
      
      // Verificar si fue bloqueado
      const pageContent = await page.content();
      if (pageContent.includes('bloqueado') || pageContent.includes('blocked')) {
        console.log('      ❌ BLOQUEADO - El proxy también fue detectado');
        console.log('      ℹ️  Intenta con otro proxy o manualmente');
        return;
      }
      
      console.log('      ✓ No bloqueado, continuando...');

      // Scroll para cargar todo
      console.log('   📜 Haciendo scroll...');
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 500);
        });
      });

      await page.waitForTimeout(15000);
      console.log('      ✓ Scroll completado');

      // Esperar ofertas
      try {
        await page.waitForSelector('article, div[class*="card"]', { timeout: 30000 });
        console.log('      ✓ Ofertas detectadas');
      } catch (err) {
        console.log('      ⚠️  No se detectaron ofertas automáticamente');
      }

      await page.waitForTimeout(10000);

      // Extraer ofertas
      console.log('   📦 Extrayendo ofertas...');
      const offersOnPage = await page.evaluate(() => {
        const items = [];
        
        // Probar múltiples selectores
        const selectors = [
          'article',
          'div.carrousel_item',
          '.card-benefit-v2',
          'div[class*="card"]',
          'a[id*="comercio"]',
          '[class*="benefit"]'
        ];
        
        let cards = [];
        for (const selector of selectors) {
          cards = document.querySelectorAll(selector);
          if (cards.length > 5) {
            console.log(`✓ ${cards.length} tarjetas encontradas con: ${selector}`);
            break;
          }
        }
        
        console.log(`Total de elementos a procesar: ${cards.length}`);
        
        for (const card of cards) {
          try {
            // Extraer todos los párrafos
            const paragraphs = card.querySelectorAll('p');
            let title = '';
            let discount = '';
            let description = '';
            let days = '';
            
            // Buscar en cada párrafo por clase
            for (const p of paragraphs) {
              const className = p.className || '';
              const text = p.textContent?.trim() || '';
              
              if (className.includes('title') || className.includes('card__title')) {
                title = text;
              } else if (className.includes('badge') || className.includes('offer')) {
                discount = text;
              } else if (className.includes('bajada')) {
                description = text;
              } else if (className.includes('recurrence')) {
                days = text;
              }
            }

            // Imagen
            let imageUrl = '';
            const imgElem = card.querySelector('img');
            if (imgElem) {
              imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
            }

            // Link
            let linkUrl = '';
            const linkElem = card.querySelector('a[href]');
            if (linkElem) {
              linkUrl = linkElem.href || '';
            }

            // Solo agregar si tiene título válido
            if (title && title.length > 3 && 
                !title.toLowerCase().includes('loading') && 
                !title.toLowerCase().includes('cargando') &&
                !title.toLowerCase().includes('beneficio')) {
              items.push({
                title: title,
                merchant: title,
                discount: discount || 'Descuento',
                description: description,
                days: days,
                terms: description,
                imageUrl: imageUrl,
                linkUrl: linkUrl || window.location.href,
                url: window.location.href,
                category: 'Todos',
                bankSlug: 'bci'
              });
            }
          } catch (err) {
            // Ignorar errores individuales
          }
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
      console.log(`📊 RESUMEN BCI V8 (CON PROXY)`);
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

      const jsonPath = path.join(dataDir, `bci_v8_${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
      console.log(`\n💾 JSON guardado: ${jsonPath}`);

      const csvPath = path.join(dataDir, `bci_v8_${timestamp}.csv`);
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
      console.log(`💾 CSV guardado: ${csvPath}`);

      console.log(`\n✅ SCRAPING BCI V8 COMPLETADO\n`);

    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');













