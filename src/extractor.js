import dayjs from 'dayjs';

// Extractores específicos por banco para obtener solo descuentos reales
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

    const discountRegex = /(\d{1,2})\s?%|\b(\d{1,2})\s?por\s?ciento\b|2x1|\$(\d+)\s?dto/gi;
    const dayRegex = /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado|domingo)/gi;

    function parseCard(node) {
      const titleNode = node.querySelector('h1,h2,h3,h4,.title,.titulo,.benefit-title,.card-title');
      const title = normalizeSpace(text(titleNode) || text(node));
      const link = node.querySelector('a[href]');
      const url = link ? link.href : location.href;

      const fullText = normalizeSpace(node.innerText || '');
      const dMatch = fullText.match(discountRegex);
      let discount = '';
      if (dMatch) {
        const percent = dMatch.find(m => /%$/.test(m));
        const dto = dMatch.find(m => /dto$/i.test(m));
        discount = percent || dto || (dMatch.includes('2x1') ? '2x1' : '');
      }
      const days = Array.from(new Set((fullText.match(dayRegex) || []).map((d) => d.toLowerCase())));

      // merchant guess
      let merchant = '';
      if (title) {
        merchant = title.replace(/beneficio|descuento|hasta|en\s+|dto|%|\$|\d+/gi, '').trim();
      }

      // category guess
      let category = '';
      if (/rest|gastr|cafe|bar|comida/i.test(fullText)) category = 'Gastronomía';
      else if (/viaje|hotel|a[eé]reo|vuelo|turismo/i.test(fullText)) category = 'Viajes';
      else if (/farmacia|medicina|salud/i.test(fullText)) category = 'Salud';
      else if (/super|mercado|grocery/i.test(fullText)) category = 'Supermercados';

      // modality guess
      let modality = '';
      if (/presencial/i.test(fullText)) modality = 'Presencial';
      if (/online/i.test(fullText)) modality = modality ? `${modality} y Online` : 'Online';
      if (/delivery/i.test(fullText)) modality = modality ? `${modality} y Delivery` : 'Delivery';

      const terms = fullText;

      return { title, merchant, discount, days, category, modality, terms, url };
    }

    const items = [];

    // Extractores específicos por banco
    if (bankSlugEval === 'bancoestado') {
      // Buscar tarjetas de beneficios específicas
      const benefitCards = qsa(document, '.beneficio-card, .benefit-card, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant) {
          items.push(obj);
        }
      }
      
      // Buscar enlaces con descuentos específicos
      const discountLinks = qsa(document, 'a[href*="beneficio"], a[href*="descuento"]');
      for (const link of discountLinks) {
        const text = normalizeSpace(link.textContent || '');
        if (discountRegex.test(text)) {
          const obj = parseCard(link);
          if (obj.discount) items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'falabella-cmr') {
      // Buscar tarjetas de descuento específicas de CMR
      const discountCards = qsa(document, '.discount-card, .benefit-card, .promo-card, [class*="descuento"], [class*="beneficio"]');
      for (const card of discountCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant && !/cargando|loading/i.test(obj.title)) {
          items.push(obj);
        }
      }
      
      // Buscar en listas de descuentos
      const discountLists = qsa(document, 'ul li, .grid-item, .card-item');
      for (const item of discountLists) {
        const text = normalizeSpace(item.textContent || '');
        if (discountRegex.test(text) && text.length > 20 && text.length < 200) {
          const obj = parseCard(item);
          if (obj.discount) items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'scotiabank') {
      // Buscar tarjetas de beneficios de Scotiabank
      const benefitCards = qsa(document, '.benefit-card, .card-benefit, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant && !/país|country|idioma|language/i.test(obj.title)) {
          items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'bice') {
      // BICE parece tener problemas de acceso, buscar cualquier contenido con descuentos
      const allCards = qsa(document, '.card, .benefit, .promo, article, .item');
      for (const card of allCards) {
        const text = normalizeSpace(card.textContent || '');
        if (discountRegex.test(text) && !/verificando|conexión|emergencia/i.test(text)) {
          const obj = parseCard(card);
          if (obj.discount) items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'santander') {
      // Santander - buscar tarjetas de beneficios
      const benefitCards = qsa(document, '.benefit-card, .card-benefit, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant) {
          items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'bci') {
      // BCI - buscar beneficios
      const benefitCards = qsa(document, '.benefit-card, .card-benefit, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant) {
          items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'ripley') {
      // Ripley - buscar beneficios
      const benefitCards = qsa(document, '.benefit-card, .card-benefit, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant) {
          items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'security') {
      // Security - buscar beneficios
      const benefitCards = qsa(document, '.benefit-card, .card-benefit, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant) {
          items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'consorcio') {
      // Consorcio - buscar beneficios
      const benefitCards = qsa(document, '.benefit-card, .card-benefit, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant) {
          items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'internacional') {
      // Internacional - buscar beneficios
      const benefitCards = qsa(document, '.benefit-card, .card-benefit, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant) {
          items.push(obj);
        }
      }
    }

    else if (bankSlugEval === 'cencosud-scotiabank') {
      // Cencosud Scotiabank - buscar beneficios
      const benefitCards = qsa(document, '.benefit-card, .card-benefit, [class*="beneficio"], [class*="benefit"]');
      for (const card of benefitCards) {
        const obj = parseCard(card);
        if (obj.discount && obj.merchant) {
          items.push(obj);
        }
      }
    }

    // Filtros finales para eliminar ruido
    return items.filter(item => {
      // Debe tener descuento
      if (!item.discount) return false;
      
      // No debe ser texto de navegación
      if (/inicio|productos|simuladores|servicios|app|red|atención|hazte|cliente|banca|línea/i.test(item.title)) return false;
      
      // No debe ser texto de países/idiomas
      if (/país|country|idioma|language|anguila|antigua|barbuda|aruba|australia/i.test(item.title)) return false;
      
      // No debe ser texto de verificación
      if (/verificando|conexión|emergencia|estimado|cliente/i.test(item.title)) return false;
      
      // Debe tener merchant válido
      if (!item.merchant || item.merchant.length < 3) return false;
      
      return true;
    }).slice(0, 50);
  }, bankSlug);

  return results.map((r) => ({ ...r }));
}