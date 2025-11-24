import { PlaywrightCrawler } from 'crawlee';

/**
 * SANTANDER V5 - EXTRACCIÓN COMPLETA CON DETALLES DEL MODAL
 * Extrae vigencia y toda la información del popup lateral
 * ~9 minutos para 261 ofertas (2s por click)
 */

const SANTANDER_URL = 'https://banco.santander.cl/beneficios';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BANCO SANTANDER V5 - EXTRACCIÓN COMPLETA CON MODAL');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: 261 ofertas con vigencia y detalles completos');
console.log('⏱️  Tiempo estimado: ~15 minutos (3s por oferta)');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: true, // Headless para eficiencia
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
      ],
    },
  },
  requestHandlerTimeoutSecs: 1800, // 30 minutos de timeout
  maxRequestRetries: 0, // Sin reintentos automáticos
  maxConcurrency: 1, // FORZAR UN SOLO NAVEGADOR A LA VEZ
  
  async requestHandler({ page, log }) {
    const allOffers = [];
    let currentPage = 1;
    let totalPages = 1;
    let offerCount = 0;

    try {
      console.log('   📄 Cargando página inicial...');
      await page.goto(SANTANDER_URL, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      await page.waitForTimeout(5000);
      console.log('      ✓ Página cargada');

      // Detectar total de páginas
      try {
        const totalPagesText = await page.locator('ul.pagination li p').last().textContent({ timeout: 5000 });
        totalPages = parseInt(totalPagesText.trim()) || 14;
        console.log(`   📊 Total de páginas: ${totalPages}`);
      } catch (e) {
        totalPages = 14;
      }

      // Iterar por todas las páginas
      while (currentPage <= totalPages) {
        console.log(`\n   📄 Página ${currentPage}/${totalPages}...`);
        await page.waitForTimeout(3000);

        // Obtener todos los botones "Más información" de la página actual
        const buttons = await page.locator('.discount-btn-mas-info').all();
        const buttonCount = buttons.length;
        
        console.log(`      📋 ${buttonCount} ofertas en esta página`);

        // Procesar cada oferta
        for (let i = 0; i < buttonCount; i++) {
          offerCount++;
          
          try {
            // Re-obtener los botones (el DOM puede cambiar)
            const currentButtons = await page.locator('.discount-btn-mas-info').all();
            
            if (i >= currentButtons.length) {
              console.log(`      ⚠️  Oferta ${i + 1}: Botón no encontrado (DOM cambió)`);
              continue;
            }

            // Click en el botón "Más información"
            await currentButtons[i].click();
            await page.waitForTimeout(3000); // Esperar 3 segundos

            // Verificar que el modal esté abierto
            const modalVisible = await page.locator('#detail-promo').isVisible({ timeout: 5000 }).catch(() => false);
            
            if (!modalVisible) {
              console.log(`      ⚠️  Oferta ${offerCount}: Modal no se abrió`);
              continue;
            }

            // Extraer información completa del modal
            const offerDetails = await page.evaluate((offerIndex) => {
              const modal = document.querySelector('#detail-promo');
              if (!modal) return null;

              const data = {};

              // Título
              const titleElem = modal.querySelector('h4.heading-6, h4.detail-title');
              data.title = titleElem ? titleElem.textContent.trim() : '';

              // Imagen (del banner)
              const imgElem = modal.querySelector('.detail-banner img, figure img');
              if (imgElem) {
                data.imageUrl = imgElem.src || imgElem.getAttribute('data-src') || '';
              } else {
                // Buscar background-image
                const bannerElem = modal.querySelector('.detail-banner, figure');
                if (bannerElem) {
                  const bgImage = window.getComputedStyle(bannerElem).backgroundImage;
                  const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                  if (match) data.imageUrl = match[1];
                }
              }

              // Vigencia
              const vigenciaElem = modal.querySelector('p.px-24.py-12.mt-32.radius-4.bg-primary-sky');
              data.vigencia = vigenciaElem ? vigenciaElem.textContent.trim().replace(/Vigencia:\s*/i, '').trim() : '';

              // Descuento (del contenido principal)
              const discountElem = modal.querySelector('p.fw-bold.f-large, .detail-content p:first-of-type');
              data.discount = discountElem ? discountElem.textContent.trim() : '';

              // Categoría: Extraer de la tarjeta original (fuera del modal)
              const cards = document.querySelectorAll('.discount-cont.d-flex');
              if (cards[offerIndex]) {
                // Buscar categoría en las etiquetas/badges
                const categoryElem = cards[offerIndex].querySelector('.badge, .category, [class*="categor"], [class*="tag"]');
                if (categoryElem) {
                  data.category = categoryElem.textContent.trim();
                }
                
                // Si no hay categoría, intentar extraer del texto completo
                if (!data.category) {
                  const cardText = cards[offerIndex].textContent;
                  const categoryPatterns = [
                    /Gastronomía/i,
                    /Viajes/i,
                    /Salud/i,
                    /Entretención/i,
                    /Shopping/i,
                    /Educación/i,
                    /Deportes/i,
                    /Tecnología/i,
                    /Hogar/i,
                    /Servicios/i,
                    /Automotriz/i,
                    /Belleza/i,
                    /Moda/i,
                    /Farmacias/i
                  ];
                  
                  for (const pattern of categoryPatterns) {
                    if (pattern.test(cardText)) {
                      data.category = cardText.match(pattern)[0];
                      break;
                    }
                  }
                }
                
                // Si aún no hay categoría, extraer del merchant
                if (!data.category) {
                  const merchantText = cards[offerIndex].querySelector('p.fw-bold.f-large')?.textContent || '';
                  data.merchant = merchantText.trim();
                }
              }

              // Descripción/Términos completos
              const descriptionElem = modal.querySelector('#admin-style, .description, .detail-content');
              data.terms = descriptionElem ? descriptionElem.textContent.trim().substring(0, 500) : '';

              // Recuerda que (condiciones adicionales)
              const recuerdaElem = modal.querySelector('#admin-style p, .detail-content p');
              if (recuerdaElem && recuerdaElem.textContent.includes('Recuerda que:')) {
                data.condiciones = recuerdaElem.textContent.trim();
              }

              // Links de redes sociales o info adicional
              const socialLinks = modal.querySelectorAll('ul.social-links a');
              data.links = [];
              socialLinks.forEach(link => {
                data.links.push({
                  url: link.href,
                  text: link.textContent.trim()
                });
              });

              // Región/ubicación
              const regionText = modal.textContent;
              const regionMatch = regionText.match(/(Metropolitana|Valparaíso|Bío-Bío|Maule|Los Lagos|Magallanes|Antofagasta|Atacama|Coquimbo|Aysén|Arica|Tarapacá|O'Higgins|Ñuble|La Araucanía|Los Ríos)/gi);
              data.region = regionMatch ? [...new Set(regionMatch)].join(', ') : '';

              return data;
            }, i);

            if (offerDetails) {
              allOffers.push({
                ...offerDetails,
                url: SANTANDER_URL,
                bankSlug: 'santander',
                extractedAt: new Date().toISOString()
              });

              // Log de progreso cada 10 ofertas
              if (offerCount % 10 === 0) {
                console.log(`      ✓ ${offerCount} ofertas procesadas...`);
              }
            }

            // Cerrar el modal - click en el overlay o botón cerrar
            try {
              const closeButton = await page.locator('.close').first();
              if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await closeButton.click({ force: true });
                await page.waitForTimeout(1000);
              } else {
                // Si no encuentra el botón, click en el overlay
                await page.locator('.detail-overlay').click({ force: true });
                await page.waitForTimeout(1000);
              }
            } catch (e) {
              // Si falla, presionar Escape
              await page.keyboard.press('Escape');
              await page.waitForTimeout(1000);
            }

          } catch (err) {
            console.log(`      ⚠️  Error en oferta ${offerCount}: ${err.message}`);
          }
        }

        console.log(`      ✅ Página ${currentPage} completada (${buttonCount} ofertas)`);

        // Navegar a la siguiente página
        if (currentPage < totalPages) {
          try {
            const nextButton = await page.locator('button .str-chevron-right').locator('..').first();
            if (await nextButton.isVisible({ timeout: 5000 })) {
              await nextButton.click();
              await page.waitForTimeout(5000);
            } else {
              console.log(`      ⚠️  Botón siguiente no visible, terminando`);
              break;
            }
          } catch (e) {
            console.log(`      ⚠️  Error navegando a página ${currentPage + 1}: ${e.message}`);
            break;
          }
        }

        currentPage++;
      }

      // Deduplicar ofertas
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
      console.log(`📊 RESUMEN SANTANDER V5`);
      console.log('════════════════════════════════════════════════════════════════════════════════');
      console.log(`✅ Páginas procesadas: ${currentPage - 1}/${totalPages}`);
      console.log(`✅ Ofertas procesadas: ${offerCount}`);
      console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
      console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
      
      // Contar cuántas tienen vigencia
      const conVigencia = uniqueOffers.filter(o => o.vigencia && o.vigencia.length > 0).length;
      console.log(`📅 Con vigencia: ${conVigencia}/${uniqueOffers.length}`);
      
      // Contar categorías únicas
      const categorias = [...new Set(uniqueOffers.map(o => o.category).filter(Boolean))];
      console.log(`🏷️  Categorías encontradas: ${categorias.length}`);
      if (categorias.length > 0) {
        console.log(`   ${categorias.join(', ')}`);
      }
      
      console.log('════════════════════════════════════════════════════════════════════════════════\n');

      // Guardar resultados
      const fs = await import('fs');
      const path = await import('path');
      
      const dataDir = path.join(process.cwd(), 'data', 'santander');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const jsonFile = path.join(dataDir, `santander_v5_complete_${timestamp}.json`);
      
      fs.writeFileSync(jsonFile, JSON.stringify(uniqueOffers, null, 2));
      console.log(`💾 JSON: ${jsonFile}`);

      // CSV
      if (uniqueOffers.length > 0) {
        const csvFile = path.join(dataDir, `santander_v5_complete_${timestamp}.csv`);
        const headers = ['Título', 'Merchant', 'Categoría', 'Descuento', 'Vigencia', 'Términos', 'Región', 'Imagen', 'URL', 'Fecha Extracción'];
        const csvContent = [
          headers.join(','),
          ...uniqueOffers.map(o => [
            `"${(o.title || '').replace(/"/g, '""')}"`,
            `"${(o.merchant || '').replace(/"/g, '""')}"`,
            `"${(o.category || '').replace(/"/g, '""')}"`,
            `"${(o.discount || '').replace(/"/g, '""')}"`,
            `"${(o.vigencia || '').replace(/"/g, '""')}"`,
            `"${(o.terms || '').replace(/"/g, '""')}"`,
            `"${(o.region || '').replace(/"/g, '""')}"`,
            `"${o.imageUrl || ''}"`,
            `"${o.url}"`,
            `"${o.extractedAt}"`
          ].join(','))
        ].join('\n');
        
        fs.writeFileSync(csvFile, csvContent);
        console.log(`💾 CSV: ${csvFile}`);
      }

      console.log('\n✅ SANTANDER V5 COMPLETADO\n');

    } catch (error) {
      console.error('❌ Error en Santander V5:', error.message);
      throw error;
    }
  },
});

await crawler.run([SANTANDER_URL]);
console.log('🏁 Proceso finalizado');

