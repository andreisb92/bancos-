import got from 'got';
import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';

/**
 * BCI V4 - SCRAPER USANDO API DIRECTA
 * Hace requests directos a la API de ofertas
 */

const BCI_API_URL = 'https://www.bci.cl/personas/beneficios/bff/loyalty/offers';

console.log('════════════════════════════════════════════════════════════════════════════════');
console.log('🏦 BCI V4 - SCRAPER CON API DIRECTA');
console.log('════════════════════════════════════════════════════════════════════════════════');
console.log(`📅 ${new Date().toLocaleString('es-CL')}`);
console.log('🎯 Objetivo: Extraer ofertas usando la API directamente');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

async function scrapeBCI() {
  const allOffers = [];
  let currentPage = 1;
  let hasMorePages = true;
  const itemsPerPage = 100;

  try {
    while (hasMorePages && currentPage <= 50) {
      console.log(`   📄 Obteniendo página ${currentPage}...`);
      
      const url = `${BCI_API_URL}?itemsPortPagina=${itemsPerPage}&pagina=${currentPage}`;
      
      try {
        const response = await got(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bci.cl/beneficios/beneficios-bci'
          },
          timeout: {
            request: 30000
          }
        });

        const data = JSON.parse(response.body);
        
        // Extraer ofertas de la respuesta
        let offers = [];
        
        // La estructura puede variar, probar diferentes formatos
        if (Array.isArray(data)) {
          offers = data;
        } else if (data.offers && Array.isArray(data.offers)) {
          offers = data.offers;
        } else if (data.data && Array.isArray(data.data)) {
          offers = data.data;
        } else if (data.results && Array.isArray(data.results)) {
          offers = data.results;
        }

        if (offers.length === 0) {
          console.log(`      ⚠️  Página ${currentPage} vacía, terminando`);
          hasMorePages = false;
          break;
        }

        console.log(`      ✅ Extraídas ${offers.length} ofertas de página ${currentPage}`);

        // Procesar y normalizar ofertas
        for (const offer of offers) {
          try {
            const normalized = {
              title: offer.title || offer.name || offer.merchant || 'Beneficio BCI',
              merchant: offer.merchant || offer.store || offer.title || 'Comercio',
              discount: offer.discount || offer.benefit || offer.description || 'Descuento',
              description: offer.description || offer.terms || '',
              days: offer.days || offer.validDays || offer.recurrence || '',
              category: offer.category || 'Todos',
              terms: offer.terms || offer.conditions || offer.description || '',
              imageUrl: offer.image || offer.imageUrl || offer.logo || '',
              linkUrl: offer.url || offer.link || 'https://www.bci.cl/beneficios/beneficios-bci',
              url: 'https://www.bci.cl/beneficios/beneficios-bci',
              bankSlug: 'bci'
            };

            allOffers.push(normalized);
          } catch (err) {
            console.log(`      ⚠️  Error procesando oferta: ${err.message}`);
          }
        }

        // Si obtuvimos menos ofertas que el límite, probablemente es la última página
        if (offers.length < itemsPerPage) {
          console.log(`      ℹ️  Última página alcanzada (${offers.length} < ${itemsPerPage})`);
          hasMorePages = false;
        }

        currentPage++;
        
        // Pequeña pausa entre requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        if (error.response && error.response.statusCode === 404) {
          console.log(`      ℹ️  Página ${currentPage} no encontrada, terminando`);
          hasMorePages = false;
        } else {
          console.log(`      ❌ Error en página ${currentPage}: ${error.message}`);
          hasMorePages = false;
        }
      }
    }

    // Deduplicar ofertas
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
    console.log(`📊 RESUMEN BCI V4 (API)`);
    console.log(`════════════════════════════════════════════════════════════════════════════════`);
    console.log(`✅ Páginas procesadas: ${currentPage - 1}`);
    console.log(`✅ Ofertas extraídas: ${allOffers.length}`);
    console.log(`✅ Ofertas únicas: ${uniqueOffers.length}`);
    console.log(`════════════════════════════════════════════════════════════════════════════════`);

    // Guardar archivos
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dataDir = path.join(process.cwd(), 'data', 'bci');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const jsonPath = path.join(dataDir, `bci_v4_api_${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(uniqueOffers, null, 2), 'utf-8');
    console.log(`\n💾 JSON guardado: ${jsonPath}`);

    const csvPath = path.join(dataDir, `bci_v4_api_${timestamp}.csv`);
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

    console.log(`\n✅ SCRAPING BCI V4 (API) COMPLETADO\n`);

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

scrapeBCI();

