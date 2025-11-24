import dayjs from 'dayjs';

// Extractores avanzados que buscan descuentos reales en el contenido de texto
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

    // Regex más específicos para descuentos
    const discountRegex = /(\d{1,2})\s?%|\b(\d{1,2})\s?por\s?ciento\b|2x1|\$(\d+)\s?dto|\$(\d+)\s?descuento|(\d{1,2})\s?dto/gi;
    const dayRegex = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado|domingo)/gi;
    const merchantRegex = /(McDonald|KFC|Pizza Hut|Domino|Subway|Starbucks|Dunkin|Burger King|Wendy|Taco Bell|Vapiano|Tanta|Muu Grill|Chuck E\. Cheese|Farmacias Ahumada|Mallplaza|Lipigas|La Barra|Color Run|JetSMART)/gi;

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
        'Lider', 'Jumbo', 'Unimarc', 'Santa Isabel', 'Mayorista 10'
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
      if (/rest|gastr|cafe|bar|comida|mcdonald|kfc|pizza|burger|taco|vapiano|tanta|muu grill|chuck/i.test(lowerText)) {
        return 'Gastronomía';
      }
      if (/viaje|hotel|a[eé]reo|vuelo|turismo|jetsmart/i.test(lowerText)) {
        return 'Viajes';
      }
      if (/farmacia|medicina|salud|ahumada/i.test(lowerText)) {
        return 'Salud';
      }
      if (/super|mercado|grocery|tottus|lider|jumbo|unimarc|santa isabel/i.test(lowerText)) {
        return 'Supermercados';
      }
      if (/cine|película|hoyts|cinemark|entreten|color run/i.test(lowerText)) {
        return 'Entretención';
      }
      if (/estacionamiento|mall|plaza/i.test(lowerText)) {
        return 'Servicios';
      }
      return '';
    }

    function extractModalityFromText(text) {
      const lowerText = text.toLowerCase();
      let modality = '';
      if (/presencial/i.test(lowerText)) modality = 'Presencial';
      if (/online/i.test(lowerText)) modality = modality ? `${modality} y Online` : 'Online';
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
        if (!/inicio|productos|simuladores|servicios|app|red|atención|hazte|cliente|banca|línea|país|country|idioma|language|verificando|conexión|emergencia|estimado/i.test(paragraph)) {
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

    // Buscar también en elementos específicos
    const specificSelectors = [
      'p', 'div', 'span', 'li', 'article', '.card', '.benefit', '.promo',
      '[class*="descuento"]', '[class*="beneficio"]', '[class*="oferta"]'
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
            
            if (!/inicio|productos|simuladores|servicios|app|red|atención|hazte|cliente|banca|línea|país|country|idioma|language|verificando|conexión|emergencia|estimado/i.test(text)) {
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

    // Eliminar duplicados basados en merchant + discount
    const uniqueItems = [];
    const seen = new Set();
    
    for (const item of items) {
      const key = `${item.merchant}|${item.discount}`;
      if (!seen.has(key) && item.discount && item.merchant) {
        uniqueItems.push(item);
        seen.add(key);
      }
    }

    return uniqueItems.slice(0, 50);
  }, bankSlug);

  return results.map((r) => ({ ...r }));
}
