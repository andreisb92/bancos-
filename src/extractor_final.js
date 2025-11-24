import dayjs from 'dayjs';

// Extractores finales optimizados para obtener merchants específicos
export async function extractDiscountCardsFromPage(page, bank) {
  const bankSlug = typeof bank === 'string' ? bank : bank?.slug || '';
  const results = await page.evaluate((bankSlugEval) => {
    function text(el) {
      return (el?.innerText || el?.textContent || '').trim();
    }
    function qsa(root, sel) {
      return Array.from(root.querySelectorAll(sel));
    }

    function normalizeSpace(s) {
      return (s || '').replace(/\s+/g, ' ').trim();
    }

    // Regex mejorados para descuentos
    const discountRegex = /(\d{1,2})\s?%|\b(\d{1,2})\s?por\s?ciento\b|2x1|\$(\d+)\s?dto|\$(\d+)\s?descuento|(\d{1,2})\s?dto|hasta\s+(\d{1,2})\s?%|hasta\s+(\d{1,2})\s?dto/gi;
    const dayRegex = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado|domingo)/gi;
    
    // Lista expandida de merchants conocidos
    const merchantRegex = /(McDonald|KFC|Pizza Hut|Domino|Subway|Starbucks|Dunkin|Burger King|Wendy|Taco Bell|Vapiano|Tanta|Muu Grill|Chuck E\. Cheese|Farmacias Ahumada|Mallplaza|Lipigas|La Barra|Color Run|JetSMART|Cine Hoyts|Cinemark|Parque del Recuerdo|Falabella|Ripley|Paris|La Polar|Hites|Johnson|Easy|Sodimac|Tottus|Lider|Jumbo|Unimarc|Santa Isabel|Mayorista 10|Cabify|Uber|Didi|Papa Johns|Papa John|Almíbar|Aurelia|Barrica|Casa Morera|Hashigo|Hotel Costa Real|Importclick|Infiltrados|La Parrilla|Cachipún|Trayecto|Aguamarina|Caramel|Del Mar|Cumbre|Padre Mariano|Millefleur|Pomeriggio|De Pura Madre|Coyote|Laurina|Mit Burger|Miraolas|Carmine|Cosenza|Birra|Yma|Cocoa|Marathon|Maratón)/gi;

    function parseDiscountFromText(text) {
      const matches = [...text.matchAll(discountRegex)];
      if (matches.length === 0) return null;
      
      // Priorizar porcentajes
      const percentMatch = matches.find(m => /%$/.test(m[0]));
      if (percentMatch) return percentMatch[0];
      
      // Luego 2x1
      const twoForOne = matches.find(m => m[0].toLowerCase() === '2x1');
      if (twoForOne) return '2x1';
      
      // Luego descuentos en pesos
      const pesoMatch = matches.find(m => /\$/.test(m[0]));
      if (pesoMatch) return pesoMatch[0];
      
      return matches[0][0];
    }

    function extractMerchantFromText(text) {
      const merchantMatch = text.match(merchantRegex);
      if (merchantMatch) {
        return merchantMatch[0].replace(/s$/, ''); // Remove plural 's'
      }
      
      // Buscar nombres de restaurantes/tiendas comunes
      const commonMerchants = [
        'McDonald', 'KFC', 'Pizza Hut', 'Domino', 'Subway', 'Starbucks', 
        'Dunkin', 'Burger King', 'Wendy', 'Taco Bell', 'Vapiano', 'Tanta',
        'Muu Grill', 'Chuck E. Cheese', 'Farmacias Ahumada', 'Mallplaza',
        'Lipigas', 'La Barra', 'Color Run', 'JetSMART', 'Cine Hoyts',
        'Cinemark', 'Parque del Recuerdo', 'Falabella', 'Ripley', 'Paris',
        'La Polar', 'Hites', 'Johnson', 'Easy', 'Sodimac', 'Tottus',
        'Lider', 'Jumbo', 'Unimarc', 'Santa Isabel', 'Mayorista 10',
        'Cabify', 'Uber', 'Didi', 'Papa Johns', 'Papa John', 'Almíbar',
        'Aurelia', 'Barrica', 'Casa Morera', 'Hashigo', 'Hotel Costa Real',
        'Importclick', 'Infiltrados', 'La Parrilla', 'Cachipún', 'Trayecto',
        'Aguamarina', 'Caramel', 'Del Mar', 'Cumbre', 'Padre Mariano',
        'Millefleur', 'Pomeriggio', 'De Pura Madre', 'Coyote', 'Laurina',
        'Mit Burger', 'Miraolas', 'Carmine', 'Cosenza', 'Birra', 'Yma',
        'Cocoa', 'Marathon', 'Maratón'
      ];
      
      for (const merchant of commonMerchants) {
        if (text.toLowerCase().includes(merchant.toLowerCase())) {
          return merchant;
        }
      }
      
      return '';
    }

    function extractDaysFromText(text) {
      const days = Array.from(new Set((text.match(dayRegex) || []).map((d) => d.toLowerCase())));
      return days;
    }

    function extractCategoryFromText(text) {
      const lowerText = text.toLowerCase();
      if (/rest|gastr|cafe|bar|comida|mcdonald|kfc|pizza|burger|taco|vapiano|tanta|muu grill|chuck|sabores|sabor/i.test(lowerText)) {
        return 'Gastronomía';
      }
      if (/viaje|hotel|a[eé]reo|vuelo|turismo|jetsmart/i.test(lowerText)) {
        return 'Viajes';
      }
      if (/farmacia|medicina|salud|ahumada|dental|clínica|clinic/i.test(lowerText)) {
        return 'Salud';
      }
      if (/super|mercado|grocery|tottus|lider|jumbo|unimarc|santa isabel/i.test(lowerText)) {
        return 'Supermercados';
      }
      if (/cine|película|hoyts|cinemark|entreten|color run|juego|juguetería/i.test(lowerText)) {
        return 'Entretención';
      }
      if (/estacionamiento|mall|plaza|servicio/i.test(lowerText)) {
        return 'Servicios';
      }
      if (/ropa|vestuario|fashion|moda/i.test(lowerText)) {
        return 'Vestuario';
      }
      return '';
    }

    function extractModalityFromText(text) {
      const lowerText = text.toLowerCase();
      let modality = '';
      if (/presencial/i.test(lowerText)) modality = 'Presencial';
      if (/online|e-commerce/i.test(lowerText)) modality = modality ? `${modality} y Online` : 'Online';
      if (/delivery/i.test(lowerText)) modality = modality ? `${modality} y Delivery` : 'Delivery';
      if (/app|aplicación/i.test(lowerText)) modality = modality ? `${modality} y App` : 'App';
      return modality;
    }

    const items = [];
    const allText = normalizeSpace(document.body.innerText || '');
    
    // Dividir el texto en párrafos y buscar descuentos
    const paragraphs = allText.split(/\n\s*\n/).filter(p => p.length > 20 && p.length < 500);
    
    for (const paragraph of paragraphs) {
      const discount = parseDiscountFromText(paragraph);
      if (discount) {
        const merchant = extractMerchantFromText(paragraph);
        const days = extractDaysFromText(paragraph);
        const category = extractCategoryFromText(paragraph);
        const modality = extractModalityFromText(paragraph);
        
        // Filtrar texto de navegación
        if (!/inicio|productos|simuladores|servicios|app|red|atención|hazte|cliente|banca|línea|país|country|idioma|language|verificando|conexión|emergencia|estimado|bancodechile|marathon/i.test(paragraph)) {
          items.push({
            title: paragraph.slice(0, 100),
            merchant: merchant || 'Descuento',
            discount: discount,
            days: days,
            category: category,
            modality: modality,
            terms: paragraph,
            url: location.href
          });
        }
      }
    }

    // EXTRACTOR ESPECÍFICO PARA FALABELLA
    if (bankSlugEval === 'falabella-cmr' || location.href.includes('bancofalabella.cl')) {
      const falabellaCards = document.querySelectorAll('div[class*="NewCardBenefits_container"], div[class*="BenefitsCard_card"], div[class*="SectionBenefitsCarousel_product-card"]');
      
      for (const card of falabellaCards) {
        const cardText = normalizeSpace(card.innerText || '');
        if (cardText.length < 15) continue;
        
        // Buscar descuento con regex expandido que incluye "SIN TOPE", "Desde", etc.
        let discount = parseDiscountFromText(cardText);
        
        // Si no encuentra descuento con %, buscar otros patrones
        if (!discount) {
          if (/sin\s+tope/i.test(cardText)) {
            discount = 'SIN TOPE';
          } else if (/desde\s+\$?\s*(\d+)/i.test(cardText)) {
            const match = cardText.match(/desde\s+\$?\s*(\d+)/i);
            discount = `Desde $${match[1]}`;
          } else if (/hasta\s+\$?\s*(\d+)/i.test(cardText)) {
            const match = cardText.match(/hasta\s+\$?\s*(\d+)/i);
            discount = `Hasta $${match[1]}`;
          } else if (/\$\s*(\d{1,3}(?:\.\d{3})+)/i.test(cardText)) {
            const match = cardText.match(/\$\s*(\d{1,3}(?:\.\d{3})+)/i);
            discount = `$${match[1]}`;
          }
        }
        
        // Si tiene descuento O es una card de beneficio válida, extraer
        if (discount || cardText.length > 30) {
          const merchant = extractMerchantFromText(cardText);
          const days = extractDaysFromText(cardText);
          const category = extractCategoryFromText(cardText);
          const modality = extractModalityFromText(cardText);
          
          const lines = cardText.split('\n').filter(l => l.trim().length > 3);
          const title = lines[0] || cardText.substring(0, 100);
          
          // Filtrar cards de navegación/UI
          if (!/^(Todos|Gastronomía|Viajes|Salud|Entretención|Shopping|Categorías|Buscar|Filtrar)$/i.test(title.trim())) {
            items.push({
              title: title.slice(0, 150),
              merchant: merchant || 'Descuento',
              discount: discount || 'Descuento',
              days: days,
              category: category,
              modality: modality,
              terms: cardText.substring(0, 300),
              url: location.href
            });
          }
        }
      }
      
      // Si ya encontramos ofertas con el extractor específico, retornar
      if (items.length > 0) {
        return items.map(item => ({ ...item, bankSlug: bankSlugEval }));
      }
    }

    // Buscar también en elementos específicos
    const specificSelectors = [
      'p', 'div', 'span', 'li', 'article', '.card', '.benefit', '.promo',
      '[class*="descuento"]', '[class*="beneficio"]', '[class*="oferta"]',
      '.benefit-item', '.discount-item', '.promo-item'
    ];
    
    for (const selector of specificSelectors) {
      const elements = qsa(document, selector);
      for (const element of elements) {
        const text = normalizeSpace(element.innerText || '');
        if (text.length > 20 && text.length < 300) {
          const discount = parseDiscountFromText(text);
          if (discount) {
            const merchant = extractMerchantFromText(text);
            const days = extractDaysFromText(text);
            const category = extractCategoryFromText(text);
            const modality = extractModalityFromText(text);
            
            if (!/inicio|productos|simuladores|servicios|app|red|atención|hazte|cliente|banca|línea|país|country|idioma|language|verificando|conexión|emergencia|estimado|bancodechile|marathon/i.test(text)) {
              items.push({
                title: text.slice(0, 100),
                merchant: merchant || 'Descuento',
                discount: discount,
                days: days,
                category: category,
                modality: modality,
                terms: text,
                url: location.href
              });
            }
          }
        }
      }
    }

    // Eliminar duplicados basados en merchant + discount + terms
    const uniqueItems = [];
    const seen = new Set();
    
    for (const item of items) {
      const key = `${item.merchant}|${item.discount}|${item.terms.slice(0, 50)}`;
      if (!seen.has(key) && item.discount && item.merchant) {
        uniqueItems.push(item);
        seen.add(key);
      }
    }

    return uniqueItems; // SIN LÍMITE - retornar TODAS las ofertas
  }, bankSlug);

  return results.map((r) => ({ ...r }));
}

