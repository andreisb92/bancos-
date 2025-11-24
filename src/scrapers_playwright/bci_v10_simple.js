import { PlaywrightCrawler } from 'crawlee';

/**
 * BCI V10 - SCRAPER SIMPLE (ESTILO RIPLEY)
 * Sin proxy, sin movimientos de mouse, simple y directo
 */

const BCI_URL = 'https://www.bci.cl/beneficios/beneficios-bci/todas';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V10 - SCRAPER SIMPLE');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas de forma simple');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
      ],
    },
  },
  requestHandlerTimeoutSecs: 300,
  maxRequestRetries: 2,
  
  async requestHandler({ page, log }) {
    try {
      console.log('   📄 Cargando página...');
      await page.goto(BCI_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      await page.waitForTimeout(5000);
      console.log('      ✓ Página cargada');

      // Scroll suave
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await page.waitForTimeout(3000);

      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(5000);

      console.log('   📦 Extrayendo ofertas...');
      
      const allOffers = await page.evaluate(() => {
        const items = [];
        const cards = document.querySelectorAll('article, div.carrousel_item, div[class*="card"]');
        
        console.log(`Tarjetas encontradas: ${cards.length}`);

        for (const card of cards) {
          try {
            const titleElem = card.querySelector('p.card__title, .card__title, h3, h4');
            const title = titleElem ? titleElem.textContent.trim() : '';

            const discountElem = card.querySelector('p.badge-offer, .badge-offer');
            const discount = discountElem ? discountElem.textContent.trim() : '';

            const descElem = card.querySelector('p.card__bajada, .card__bajada');
            const description = descElem ? descElem.textContent.trim() : '';

            const daysElem = card.querySelector('p.card__recurrence, .card__recurrence');
            const days = daysElem ? daysElem.textContent.trim() : '';

            let imageUrl = '';
            const imgElem = card.querySelector('img');
            if (imgElem) {
              imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
            }

            let linkUrl = '';
            const linkElem = card.querySelector('a[href]');
            if (linkElem) {
              linkUrl = linkElem.href || '';
            }

            if (title && title.length > 3) {
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
            // Ignorar
          }
        }

        return items;
      });

      console.log(`      ✅ Extraídas ${allOffers.length} ofertas`);

      // Deduplicar
      const uniqueOffers = [];
      const seen = new Set();
      
      for (const offer of allOffers) {
        const key = `${offer.title}|${offer.discount}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueOffers.push(offer);
        }
      }

      console.log('\n════════════════════════════════════════════════════════════════════════════════');
      console.log(`📊 RESUMEN BCI V10`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      console.log('════════════════════════════════════════════════════════════════════════════════\n');

      // Guardar
      const fs = await import('fs');
      const path = await import('path');
      
      const dataDir = path.join(process.cwd(), 'data', 'bci');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const jsonFile = path.join(dataDir, `bci_v10_${timestamp}.json`);
      
      fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
      console.log(`💾 JSON guardado en: ${jsonFile}`);

      // CSV
      if (uniqueOffers.length > 0) {
        const csvFile = path.join(dataDir, `bci_v10_${timestamp}.csv`);
        const headers = ['Título', 'Comercio', 'Descuento', 'Descripción', 'Días', 'Categoría', 'Imagen', 'Link', 'URL'];
        const csvContent = [
          headers.join(','),
          ...uniqueOffers.map(o => [
            `"${o.title.replace(/"/g, '""')}"`,
            `"${o.merchant.replace(/"/g, '""')}"`,
            `"${o.discount.replace(/"/g, '""')}"`,
            `"${(o.description || '').replace(/"/g, '""')}"`,
            `"${(o.days || '').replace(/"/g, '""')}"`,
            `"${o.category.replace(/"/g, '""')}"`,
            `"${o.imageUrl}"`,
            `"${o.linkUrl}"`,
            `"${o.url}"`
          ].join(','))
        ].join('\n');
        
        fs.writeFileSync(csvFile, csvContent);
        console.log(`💾 CSV guardado en: ${csvFile}`);
      }

      console.log('\n✅ SCRAPING BCI V10 COMPLETADO\n');

    } catch (error) {
      console.error('❌ Error en BCI V10:', error.message);
      throw error;
    }
  },
});

await crawler.run([BCI_URL]);
console.log('🏁 Proceso finalizado');













